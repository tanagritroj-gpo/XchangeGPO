'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getStaffSession } from './auth-staff';
import { revalidatePath } from 'next/cache';

async function getCSRSession() {
  const session = await getStaffSession();
  if (!session) throw new Error("ไม่ได้ Login");

  if (session.department !== 'csr') {
    throw new Error("คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
  }
  return session;
}

export async function withCSRAuth<T>(action: (session: any) => Promise<T>): Promise<T> {
  const session = await getCSRSession();
  return action(session);
}

export async function getCSRDashboardData() {
  try {
    await getCSRSession();

    const { data: clients, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    const { data: requests, error: reqErr } = await supabaseAdmin
      .from('requests')
      .select(`*, drug_items (*)`)
      .order('created_at', { ascending: false });

    if (clientErr || reqErr) {
      throw new Error("ดึงข้อมูลพลาด: " + (clientErr?.message || reqErr?.message));
    }

    return { success: true, clients, requests };

  } catch (e: any) {
    console.error("DEBUG - Catch Error:", e.message);
    return { success: false, error: e.message };
  }
}

// ฟังก์ชันรวม: อนุมัติ หรือ ปฏิเสธ ลูกค้า
export async function reviewClient(clientId: string, action: 'approved' | 'rejected') {
  try {
    await getCSRSession();

    const { data: client, error: fetchErr } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (fetchErr || !client) throw new Error("หาข้อมูลลูกค้าไม่พบ");

    const { error: updateErr } = await supabaseAdmin
      .from('clients')
      .update({ status: action })
      .eq('id', clientId);

    if (updateErr) throw updateErr;

    if (action === 'approved') {
      const { data: newCustomer, error: insertErr } = await supabaseAdmin
        .from('b2b_customers')
        .insert({
          email: client.email,
          hospital_name: client.hospital_name,
          phone: client.phone,
          contact_name: client.contact_name,
          position: client.position,
        })
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      // ผูกกลับเข้า clients เผื่อต้อง trace ย้อนหลัง
      await supabaseAdmin
        .from('clients')
        .update({ b2b_customer_id: newCustomer.id })
        .eq('id', clientId);
    }

    revalidatePath('/admin/csr/customers');
    return { success: true };

  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function approveDrugItem(drugItemId: number, requestId: number, remark?: string) {
  return withCSRAuth(async (session) => {
    const { error: logError } = await supabaseAdmin.from('status_logs').insert({
      request_id: requestId, staff_id: session.id, department: 'csr', status_name: 'approved',
      staff_remark: remark || `อนุมัติรายการยา ID: ${drugItemId}`, drug_item_id: drugItemId
    });
    if (logError) throw new Error("บันทึกประวัติการทำงานไม่สำเร็จ");
    await supabaseAdmin.from('drug_items').update({ current_status: 'approved' }).eq('id', drugItemId);
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function approveRequest(requestId: number, remark?: string) {
  return withCSRAuth(async (session) => {
    const { data: pendingItems } = await supabaseAdmin.from('drug_items').select('id').eq('request_id', requestId).in('current_status', ['pending_review']);
    if (pendingItems && pendingItems.length > 0) throw new Error("ยังมีรายการยาที่ยังไม่ได้อนุมัติ");
    await supabaseAdmin.from('status_logs').insert({ request_id: requestId, staff_id: session.id, department: 'csr', status_name: 'approved', staff_remark: remark || 'อนุมัติใบงาน' });
    await supabaseAdmin.from('requests').update({ current_status: 'approved', updated_at: new Date().toISOString() }).eq('id', requestId);
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function rejectDrugItem(drugItemId: number, requestId: number, remark?: string) {
  return withCSRAuth(async (session) => {
    await supabaseAdmin.from('status_logs').insert({ request_id: requestId, staff_id: session.id, department: 'csr', status_name: 'rejected', staff_remark: remark || 'ปฏิเสธยา', drug_item_id: drugItemId });
    await supabaseAdmin.from('drug_items').update({ current_status: 'rejected' }).eq('id', drugItemId);
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function rejectRequest(requestId: number, remark: string) {
  return withCSRAuth(async (session) => {
    await supabaseAdmin.from('status_logs').insert({ request_id: requestId, staff_id: session.id, department: 'csr', status_name: 'rejected', staff_remark: remark });
    const { data: items } = await supabaseAdmin.from('drug_items').select('id').eq('request_id', requestId);
    if (items) await supabaseAdmin.from('status_logs').insert(items.map(i => ({ request_id: requestId, drug_item_id: i.id, staff_id: session.id, department: 'csr', status_name: 'rejected', staff_remark: `ปฏิเสธใบงาน: ${remark}` })));
    await supabaseAdmin.from('requests').update({ current_status: 'rejected', updated_at: new Date().toISOString() }).eq('id', requestId);
    await supabaseAdmin.from('drug_items').update({ current_status: 'rejected' }).eq('request_id', requestId);
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function startExchangeProcess(requestId: number, remark?: string) {
  return withCSRAuth(async (session) => {
    const { data: items } = await supabaseAdmin.from('drug_items').select('id, current_status').eq('request_id', requestId);
    const activeItems = items?.filter(i => i.current_status !== 'rejected') ?? [];
    if (activeItems.length > 0) await supabaseAdmin.from('status_logs').insert(activeItems.map(i => ({ request_id: requestId, drug_item_id: i.id, staff_id: session.id, department: 'csr', status_name: 'exchanging', staff_remark: remark || 'เริ่มแลกเปลี่ยน' })));
    await supabaseAdmin.from('requests').update({ current_status: 'exchanging', updated_at: new Date().toISOString() }).eq('id', requestId);
    await supabaseAdmin.from('drug_items').update({ current_status: 'exchanging' }).eq('request_id', requestId).neq('current_status', 'rejected');
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function completeRequest(requestId: number, remark?: string) {
  return withCSRAuth(async (session) => {
    await supabaseAdmin.from('status_logs').insert({ request_id: requestId, staff_id: session.id, department: 'csr', status_name: 'completed', staff_remark: remark || 'งานเสร็จสิ้น' });
    await supabaseAdmin.from('requests').update({ current_status: 'completed', updated_at: new Date().toISOString() }).eq('id', requestId);
    await supabaseAdmin.from('drug_items').update({ current_status: 'completed' }).eq('request_id', requestId).neq('current_status', 'rejected');
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function updateDrugCompliance(itemId: number, pType: string, compliance: { pass: boolean, msg: string }) {
  return withCSRAuth(async () => {
    await supabaseAdmin
      .from('drug_items')
      .update({
        product_type: pType,
        is_compliant: compliance.pass,
        compliance_remark: compliance.msg
      })
      .eq('id', itemId);
    return { success: true };
  });
}

// ดึงประวัติใบงานทั้งหมดของลูกค้ารายหนึ่ง — ใช้ในหน้าค้นหาลูกค้า (CSR customers page)
// เช็คสิทธิ์ผ่าน getCSRSession() เหมือนทุกฟังก์ชันในไฟล์นี้ (department === 'csr' เท่านั้น)
// ไม่ใช่ RLS เพราะ query นี้วิ่งผ่าน supabaseAdmin (service_role) ที่ bypass RLS อยู่แล้วโดยธรรมชาติ
// การควบคุมสิทธิ์จริงจึงอยู่ที่ getCSRSession() ในโค้ดนี้เท่านั้น — ไม่ใช่ RLS policy บนตาราง requests
export async function getCustomerRequestHistory(customerId: number) {
  try {
    await getCSRSession();

    if (!customerId || !Number.isFinite(customerId)) {
      throw new Error('รหัสลูกค้าไม่ถูกต้อง');
    }

    const { data, error } = await supabaseAdmin
      .from('requests')
      .select('id, ref_id, request_type, current_status, total_value, created_at')
      .eq('b2b_customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { success: true, data: data ?? [] };
  } catch (e: any) {
    console.error('getCustomerRequestHistory error:', e.message);
    return { success: false, error: e.message };
  }
}

export async function getStaffRequestDetail(requestId: number, customerId: number) {
  try {
    await getCSRSession();

    const { data: request, error: reqErr } = await supabaseAdmin
      .from('requests')
      .select('*, drug_items(*)')
      .eq('id', requestId)
      .maybeSingle();

    if (reqErr || !request || request.b2b_customer_id !== customerId) {
      throw new Error('ไม่พบข้อมูลใบงานนี้');
    }

    const { data: timelineRaw } = await supabaseAdmin
      .from('timeline_summary')
      .select('status_name, log_date, staff_remark, drug_item_id')
      .eq('request_id', request.id)
      .order('log_date', { ascending: true });

    const drugNameById: Record<number, string> = Object.fromEntries(
      (request.drug_items ?? []).map((i: any) => [i.id, i.drug_name])
    );

    const timeline = (timelineRaw ?? []).map((t) => ({
      ...t,
      drug_name: t.drug_item_id != null ? drugNameById[t.drug_item_id] ?? null : null,
    }));

    return { success: true, data: { ...request, timeline } };
  } catch (e: any) {
    console.error('getStaffRequestDetail error:', e.message);
    return { success: false, error: e.message };
  }
}