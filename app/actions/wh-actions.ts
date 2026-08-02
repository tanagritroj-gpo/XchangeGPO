'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getStaffSession } from './auth-staff';
import { revalidatePath } from 'next/cache';
import { isRejectionReasonCode, buildRejectionRemark } from '@/lib/rejection-reasons';
import { getErrorMessage } from '@/lib/error-message';
import type { DrugItemRow } from '@/lib/types';

// ดึง Session เพื่อเช็คว่าเป็น Warehouse หรือ Manager
async function getWHSession() {
  const session = await getStaffSession();
  if (!session) throw new Error("ไม่ได้ Login");

  if (session.department !== 'wh' && session.role !== 'manager') {
    throw new Error("คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
  }
  return session;
}

// ── 1. ดึงข้อมูลใบงานที่ WH ต้องรับผิดชอบ ──────────────────────
export async function getWHData() {
  try {
    await getWHSession();

    const { data, error } = await supabaseAdmin
      .from('requests')
      .select(`*, drug_items (*)`)
      .in('current_status', ['at_warehouse', 'checked_in'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching WH data:", error);
      return { success: false, data: [], error: error.message };
    }

    if (data) {
      const filtered = data
        .map(req => ({
          ...req,
          drug_items: req.drug_items.filter(
            (item: DrugItemRow) => !['receiving', 'rejected'].includes(item.current_status ?? '')
          )
        }))
        .filter(req => req.drug_items.length > 0);

      return { success: true, data: filtered };
    }

    return { success: true, data: [] };
  } catch (e: unknown) {
    return { success: false, data: [], error: getErrorMessage(e) };
  }
}

// ── 2. Step 1a: ตรวจสภาพสินค้า รายชิ้น (checked_in) ────────────
export async function stampCheckedIn(
  itemId: number,
  remark: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getWHSession();

    const { data: item, error: fetchErr } = await supabaseAdmin
      .from('drug_items')
      .select('request_id')
      .eq('id', itemId)
      .single();

    if (fetchErr || !item) return { success: false, error: "หาข้อมูลยาไม่พบ" };

    const { error: updateErr } = await supabaseAdmin
      .from('drug_items')
      .update({ current_status: 'checked_in' })
      .eq('id', itemId);

    if (updateErr) return { success: false, error: updateErr.message };

    const { data: allItems } = await supabaseAdmin
      .from('drug_items')
      .select('id, current_status')
      .eq('request_id', item.request_id);

    const isAllChecked = allItems?.every(i =>
      ['checked_in', 'receiving', 'rejected'].includes(i.current_status)
    );

    if (isAllChecked) {
      await supabaseAdmin
        .from('requests')
        .update({ current_status: 'checked_in', updated_at: new Date().toISOString() })
        .eq('id', item.request_id);
    }

    await supabaseAdmin.from('status_logs').insert({
      request_id: item.request_id,
      staff_id: session.id,
      department: 'warehouse',
      status_name: 'checked_in',
      staff_remark: remark || 'ตรวจสภาพสินค้าเรียบร้อย',
      drug_item_id: itemId
    });

    revalidatePath('/admin/wh/dashboard');
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

// ── 3. Step 1b: ยืนยันตรวจรับทั้งใบ ────────────────────────────
export async function confirmCheckedInBatch(
  requestId: number,
  remark: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getWHSession();

    const { data: allItems, error: fetchErr } = await supabaseAdmin
      .from('drug_items')
      .select('id, current_status')
      .eq('request_id', requestId);

    if (fetchErr) return { success: false, error: fetchErr.message };

    const isAllChecked = allItems?.every(i =>
      ['checked_in', 'receiving', 'rejected'].includes(i.current_status)
    );

    if (!isAllChecked) {
      return { success: false, error: 'ยังมีรายการยาที่ยังไม่ได้ตรวจรับ กรุณาตรวจรับให้ครบก่อน' };
    }

    const logs = allItems
      ?.filter(i => i.current_status === 'checked_in')
      .map(i => ({
        request_id: requestId,
        staff_id: session.id,
        department: 'warehouse',
        status_name: 'checked_in_confirmed',
        staff_remark: remark || 'ยืนยันตรวจรับทั้งใบงาน',
        drug_item_id: i.id
      })) ?? [];

    if (logs.length > 0) {
      await supabaseAdmin.from('status_logs').insert(logs);
    }

    await supabaseAdmin
      .from('requests')
      .update({ current_status: 'checked_in', updated_at: new Date().toISOString() })
      .eq('id', requestId);

    revalidatePath('/admin/wh/dashboard');
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

// ── 4. Step 2: จัดเก็บเข้าคลัง รายชิ้น (receiving) ────────────
export async function stampReceiving(
  itemId: number,
  remark: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getWHSession();

    const { data: item, error: fetchErr } = await supabaseAdmin
      .from('drug_items')
      .select('request_id')
      .eq('id', itemId)
      .single();

    if (fetchErr || !item) return { success: false, error: "หาข้อมูลยาไม่พบ" };

    const { error: updateErr } = await supabaseAdmin
      .from('drug_items')
      .update({ current_status: 'receiving' })
      .eq('id', itemId);

    if (updateErr) return { success: false, error: updateErr.message };

    const { data: allItems } = await supabaseAdmin
      .from('drug_items')
      .select('id, current_status')
      .eq('request_id', item.request_id);

    const hasReceived    = allItems?.some(i => i.current_status === 'receiving');
    const isAllProcessed = allItems?.every(i =>
      ['receiving', 'rejected'].includes(i.current_status)
    );

    if (isAllProcessed) {
      const finalRequestStatus = hasReceived ? 'receiving' : 'rejected';
      await supabaseAdmin
        .from('requests')
        .update({ current_status: finalRequestStatus, updated_at: new Date().toISOString() })
        .eq('id', item.request_id);
    }

    await supabaseAdmin.from('status_logs').insert({
      request_id: item.request_id,
      staff_id: session.id,
      department: 'warehouse',
      status_name: 'receiving',
      staff_remark: remark || 'จัดเก็บเข้าคลังเรียบร้อย',
      drug_item_id: itemId
    });

    revalidatePath('/admin/wh/dashboard');
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

export async function rejectWHItem(
  itemId: number,
  reasonCode: string,
  detail: string = ''
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isRejectionReasonCode(reasonCode)) {
      return { success: false, error: "กรุณาเลือกเหตุผลที่ปฏิเสธ" };
    }
    const session = await getWHSession();

    const { data: item, error: fetchErr } = await supabaseAdmin
      .from('drug_items')
      .select('request_id')
      .eq('id', itemId)
      .single();

    if (fetchErr || !item) return { success: false, error: "หาข้อมูลยาไม่พบ" };

    const { error: updateErr } = await supabaseAdmin
      .from('drug_items')
      .update({ current_status: 'rejected' })
      .eq('id', itemId);

    if (updateErr) return { success: false, error: updateErr.message };

    const { data: allItems } = await supabaseAdmin
      .from('drug_items')
      .select('id, current_status')
      .eq('request_id', item.request_id);

    const isAllProcessed = allItems?.every(i =>
      ['receiving', 'rejected'].includes(i.current_status)
    );

    if (isAllProcessed) {
      const hasReceived = allItems?.some(i => i.current_status === 'receiving');
      const finalRequestStatus = hasReceived ? 'receiving' : 'rejected';

      await supabaseAdmin
        .from('requests')
        .update({ current_status: finalRequestStatus, updated_at: new Date().toISOString() })
        .eq('id', item.request_id);
    }

    await supabaseAdmin.from('status_logs').insert({
      request_id: item.request_id,
      drug_item_id: itemId,
      staff_id: session.id,
      department: 'warehouse',
      status_name: 'rejected',
      rejection_reason_code: reasonCode,
      staff_remark: buildRejectionRemark(reasonCode, detail)
    });

    revalidatePath('/admin/wh/dashboard');
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}