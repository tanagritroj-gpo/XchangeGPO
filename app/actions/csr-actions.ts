'use server'

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// ดึง Session เพื่อเช็คว่าเป็น CSR หรือ Manager
async function getCSRSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('staff_session');
  if (!sessionCookie) throw new Error("ไม่ได้ Login");
  
  const session = JSON.parse(sessionCookie.value);
  
  if (session.department !== 'csr' && session.department !== 'manager') {
    throw new Error("คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
  }
  return session;
}

export async function getCSRDashboardData() {
  try {
    await getCSRSession();
    const supabase = await createClient();
    
    // ดึงลูกค้าที่รออนุมัติ
    const { data: clients, error: clientErr } = await supabase
      .from('clients')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
      
    // ดึงใบงาน (ดึง drug_items ติดมาด้วยเพื่อใช้ทำ Item-Level Approval)
    const { data: requests, error: reqErr } = await supabase
      .from('requests')
      .select(`
        *,
        drug_items (*)
      `)
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
    const supabase = await createClient();
    
    const { data: client, error: fetchErr } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (fetchErr || !client) throw new Error("หาข้อมูลลูกค้าไม่พบ");

    const { error: updateErr } = await supabase
      .from('clients')
      .update({ status: action })
      .eq('id', clientId);
    
    if (updateErr) throw updateErr;

    if (action === 'approved') {
      const { error: insertErr } = await supabase
        .from('b2b_customers')
        .insert({
          email: client.email,
          hospital_name: client.hospital_name,
          phone: client.phone,
          contact_name: client.contact_name,
        });

      if (insertErr) throw insertErr;
    }

    revalidatePath('/admin/csr/dashboard');
    return { success: true };

  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function approveDrugItem(drugItemId: number, requestId: number, staffId: string, remark?: string) {
  return withCSRAuth(async (session) => {
    const supabase = await createClient();
    const { error: logError } = await supabase.from('status_logs').insert({
      request_id: requestId, staff_id: staffId, department: 'csr', status_name: 'approved',
      staff_remark: remark || `อนุมัติรายการยา ID: ${drugItemId}`, drug_item_id: drugItemId
    });
    if (logError) throw new Error("บันทึกประวัติการทำงานไม่สำเร็จ");
    await supabase.from('drug_items').update({ current_status: 'approved' }).eq('id', drugItemId);
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

// กิตเอาฟังก์ชันนี้ไปวางเพิ่มในไฟล์ csr-actions.ts นะครับ
export async function approveRequest(requestId: number, staffId: string, remark?: string) {
  return withCSRAuth(async (session) => {
    const supabase = await createClient();
    const { data: pendingItems } = await supabase.from('drug_items').select('id').eq('request_id', requestId).in('current_status', ['pending_review']);
    if (pendingItems && pendingItems.length > 0) throw new Error("ยังมีรายการยาที่ยังไม่ได้อนุมัติ");
    await supabase.from('status_logs').insert({ request_id: requestId, staff_id: staffId, department: 'csr', status_name: 'approved', staff_remark: remark || 'อนุมัติใบงาน' });
    await supabase.from('requests').update({ current_status: 'approved', updated_at: new Date().toISOString() }).eq('id', requestId);
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function rejectDrugItem(drugItemId: number, requestId: number, staffId: string, remark?: string) {
  return withCSRAuth(async (session) => {
    const supabase = await createClient();
    await supabase.from('status_logs').insert({ request_id: requestId, staff_id: staffId, department: 'csr', status_name: 'rejected', staff_remark: remark || 'ปฏิเสธยา', drug_item_id: drugItemId });
    await supabase.from('drug_items').update({ current_status: 'rejected' }).eq('id', drugItemId);
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function rejectRequest(requestId: number, staffId: string, remark: string) {
  return withCSRAuth(async (session) => {
    const supabase = await createClient();
    await supabase.from('status_logs').insert({ request_id: requestId, staff_id: staffId, department: 'csr', status_name: 'rejected', staff_remark: remark });
    const { data: items } = await supabase.from('drug_items').select('id').eq('request_id', requestId);
    if (items) await supabase.from('status_logs').insert(items.map(i => ({ request_id: requestId, drug_item_id: i.id, staff_id: staffId, department: 'csr', status_name: 'rejected', staff_remark: `ปฏิเสธใบงาน: ${remark}` })));
    await supabase.from('requests').update({ current_status: 'rejected', updated_at: new Date().toISOString() }).eq('id', requestId);
    await supabase.from('drug_items').update({ current_status: 'rejected' }).eq('request_id', requestId);
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function startExchangeProcess(requestId: number, staffId: string, remark?: string) {
  return withCSRAuth(async (session) => {
    const supabase = await createClient();
    const { data: items } = await supabase.from('drug_items').select('id, current_status').eq('request_id', requestId);
    const activeItems = items?.filter(i => i.current_status !== 'rejected') ?? [];
    if (activeItems.length > 0) await supabase.from('status_logs').insert(activeItems.map(i => ({ request_id: requestId, drug_item_id: i.id, staff_id: staffId, department: 'csr', status_name: 'exchanging', staff_remark: remark || 'เริ่มแลกเปลี่ยน' })));
    await supabase.from('requests').update({ current_status: 'exchanging', updated_at: new Date().toISOString() }).eq('id', requestId);
    await supabase.from('drug_items').update({ current_status: 'exchanging' }).eq('request_id', requestId).neq('current_status', 'rejected');
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function completeRequest(requestId: number, staffId: string, remark?: string) {
  return withCSRAuth(async (session) => {
    const supabase = await createClient();
    await supabase.from('status_logs').insert({ request_id: requestId, staff_id: staffId, department: 'csr', status_name: 'completed', staff_remark: remark || 'งานเสร็จสิ้น' });
    await supabase.from('requests').update({ current_status: 'completed', updated_at: new Date().toISOString() }).eq('id', requestId);
    await supabase.from('drug_items').update({ current_status: 'completed' }).eq('request_id', requestId);
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function withCSRAuth<T>(action: (session: any) => Promise<T>): Promise<T> {
  const session = await getCSRSession();
  return action(session);
}