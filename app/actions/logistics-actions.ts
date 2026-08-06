'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getStaffSession } from './auth-staff';
import { revalidatePath } from 'next/cache';
import { getErrorMessage } from '@/lib/error-message';
import type { DrugItemRow } from '@/lib/types';
import { isRejectionReasonCode, buildRejectionRemark } from '@/lib/rejection-reasons';

// ดึง Session เพื่อเช็คว่าเป็น Logistics หรือ Manager
async function getLogisticsSession() {
  const session = await getStaffSession();
  if (!session) throw new Error("ไม่ได้ Login");

  if (session.department !== 'log' && session.role !== 'manager') {
    throw new Error("คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
  }
  return session;
}

export async function getLogisticsDashboardData() {
  try {
    await getLogisticsSession();

    const { data, error } = await supabaseAdmin
      .from('requests')
      .select(`*, drug_items (*)`)
      .in('current_status', ['approved', 'in_transit'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching logistics data:", error);
      return { success: false, requests: [], error: error.message };
    }

    if (data) {
      const filteredRequests = data.map(req => ({
        ...req,
        drug_items: req.drug_items.filter((item: DrugItemRow) => item.current_status !== 'rejected')
      })).filter(req => req.drug_items.length > 0);

      return { success: true, requests: filteredRequests };
    }

    return { success: true, requests: [] };
  } catch (e: unknown) {
    return { success: false, requests: [], error: getErrorMessage(e) };
  }
}

export async function updateLogisticsStatus(
  requestId: number,
  newStatus: 'in_transit' | 'at_warehouse',
  remark: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getLogisticsSession();

    const { data: items } = await supabaseAdmin
      .from('drug_items')
      .select('id, current_status')
      .eq('request_id', requestId);

    const activeItems = items?.filter(i => i.current_status !== 'rejected') ?? [];

    // ★ รายการยาถูกปฏิเสธไปหมดแล้วทุกตัว ไม่มีอะไรเหลือให้ขนส่งต่อ — ปิดใบงานเป็น rejected
    // แทนที่จะส่งต่อ in_transit/at_warehouse (pattern เดียวกับฝั่ง CSR ใน csr-actions.ts)
    if (activeItems.length === 0) {
      await supabaseAdmin.from('status_logs').insert({
        request_id: requestId, staff_id: session.id, department: 'logistics', status_name: 'rejected',
        staff_remark: remark || 'ปิดใบงาน — รายการยาถูกปฏิเสธทั้งหมด',
      });
      await supabaseAdmin.from('requests').update({ current_status: 'rejected', updated_at: new Date().toISOString() }).eq('id', requestId);
      revalidatePath('/admin/logistics/dashboard');
      return { success: true };
    }

    const logs = activeItems.map(item => ({
      request_id: requestId,
      staff_id: session.id,
      department: 'logistics',
      status_name: newStatus,
      staff_remark: remark,
      drug_item_id: item.id
    }));

    if (logs.length > 0) {
      await supabaseAdmin.from('status_logs').insert(logs);
    }

    await supabaseAdmin
      .from('requests')
      .update({ current_status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', requestId);

    await supabaseAdmin
      .from('drug_items')
      .update({ current_status: newStatus })
      .eq('request_id', requestId)
      .neq('current_status', 'rejected');

    revalidatePath('/admin/logistics/dashboard');
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

// อัปเดตสถานะรายชิ้น (ตรวจรับเข้าคลัง)
export async function updateItemStatus(
  itemId: number,
  nextStatus: 'at_warehouse',
  remark: string
) {
  try {
    const session = await getLogisticsSession();

    const { data: item, error: fetchErr } = await supabaseAdmin
      .from('drug_items')
      .select('request_id')
      .eq('id', itemId)
      .single();

    if (fetchErr) throw new Error("หาข้อมูลยาไม่พบ");

    await supabaseAdmin.from('drug_items').update({ current_status: nextStatus }).eq('id', itemId);

    const { data: allItems } = await supabaseAdmin
      .from('drug_items')
      .select('id, current_status')
      .eq('request_id', item.request_id);

    const hasAccepted = allItems?.some(i => i.current_status === 'at_warehouse');
    const isAllProcessed = allItems?.every(i => ['at_warehouse', 'rejected'].includes(i.current_status));

    if (isAllProcessed) {
      const finalRequestStatus = hasAccepted ? 'at_warehouse' : 'rejected';
      await supabaseAdmin
        .from('requests')
        .update({ current_status: finalRequestStatus, updated_at: new Date().toISOString() })
        .eq('id', item.request_id);
    }

    await supabaseAdmin.from('status_logs').insert({
      request_id: item.request_id,
      staff_id: session.id,
      department: 'logistics',
      status_name: nextStatus,
      staff_remark: remark,
      drug_item_id: itemId
    });

    revalidatePath('/admin/logistics/dashboard');
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

// ปฏิเสธรายการรายชิ้น
export async function rejectItemStatus(
  itemId: number,
  reasonCode: string,
  detail: string = ''
) {
  try {
    if (!isRejectionReasonCode(reasonCode)) {
      return { success: false, error: "กรุณาเลือกเหตุผลที่ปฏิเสธ" };
    }
    const session = await getLogisticsSession();

    const { data: item } = await supabaseAdmin
      .from('drug_items')
      .select('request_id')
      .eq('id', itemId)
      .single();

    const { error: updateError } = await supabaseAdmin
      .from('drug_items')
      .update({ current_status: 'rejected' })
      .eq('id', itemId);

    if (updateError) throw new Error("ปฏิเสธรายการยาไม่สำเร็จ");

    if (item?.request_id) {
      const { data: allItems } = await supabaseAdmin
        .from('drug_items')
        .select('id, current_status')
        .eq('request_id', item.request_id);

      const hasAccepted = allItems?.some(i => i.current_status === 'at_warehouse');
      const isAllProcessed = allItems?.every(i => ['at_warehouse', 'rejected'].includes(i.current_status));

      if (isAllProcessed) {
        const finalRequestStatus = hasAccepted ? 'at_warehouse' : 'rejected';
        await supabaseAdmin
          .from('requests')
          .update({ current_status: finalRequestStatus, updated_at: new Date().toISOString() })
          .eq('id', item.request_id);
      }
    }

    await supabaseAdmin.from('status_logs').insert({
      request_id: item?.request_id,
      staff_id: session.id,
      department: 'logistics',
      status_name: 'rejected',
      rejection_reason_code: reasonCode,
      staff_remark: buildRejectionRemark(reasonCode, detail),
      drug_item_id: itemId
    });

    revalidatePath('/admin/logistics/dashboard');
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

export async function confirmLogisticsBatch(
  requestId: number,
  actions: { itemId: number, status: 'at_warehouse' | 'rejected', remark: string, reasonCode?: string }[]
) {
  try {
    const session = await getLogisticsSession();

    for (const action of actions) {
      if (action.status === 'rejected' && !isRejectionReasonCode(action.reasonCode)) {
        return { success: false, error: "กรุณาเลือกเหตุผลที่ปฏิเสธ" };
      }

      await supabaseAdmin.from('drug_items').update({ current_status: action.status }).eq('id', action.itemId);

      await supabaseAdmin.from('status_logs').insert({
        request_id: requestId,
        staff_id: session.id,
        department: 'logistics',
        status_name: action.status,
        rejection_reason_code: action.status === 'rejected' ? action.reasonCode : null,
        staff_remark: action.status === 'rejected'
          ? buildRejectionRemark(action.reasonCode!, action.remark)
          : action.remark,
        drug_item_id: action.itemId
      });
    }

    const { data: allItems } = await supabaseAdmin
      .from('drug_items')
      .select('id, current_status')
      .eq('request_id', requestId);

    const hasAccepted = allItems?.some(i => i.current_status === 'at_warehouse');
    const isAllProcessed = allItems?.every(i => ['at_warehouse', 'rejected'].includes(i.current_status));

    let finalRequestStatus = 'rejected';
    if (hasAccepted) finalRequestStatus = 'at_warehouse';

    if (isAllProcessed) {
      await supabaseAdmin
        .from('requests')
        .update({ current_status: finalRequestStatus, updated_at: new Date().toISOString() })
        .eq('id', requestId);
    }

    revalidatePath('/admin/logistics/dashboard');
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}