'use server'

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

// ดึง Session เพื่อเช็คว่าเป็น CSR
async function getCSRSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('staff_session');
  if (!sessionCookie) throw new Error("ไม่ได้ Login");
  
  const session = JSON.parse(sessionCookie.value);
  if (session.role !== 'csr' && session.role !== 'manager') {
    throw new Error("คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
  }
  return session;
}

// รวมการดึงข้อมูล Dashboard ไว้ในฟังก์ชันเดียว
export async function getCSRDashboardData() {
  try {
    await getCSRSession();
    const supabase = await createClient();
    
    const { data: clients, error: clientErr } = await supabase
      .from('clients')
      .select('*')
      .eq('status', 'pending');
      
    const { data: requests, error: reqErr } = await supabase
      .from('requests')
      .select('*');
      
    if (clientErr || reqErr) throw new Error("ดึงข้อมูลพลาด");
    
    return { success: true, clients, requests };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// อนุมัติลงทะเบียนลูกค้า
export async function approveClient(clientId: string) {
  try {
    await getCSRSession();
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('clients')
      .update({ status: 'approved' })
      .eq('id', clientId);

    return error ? { success: false, error: error.message } : { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// อัปเดตสถานะใบงาน
export async function updateRequestStatus(requestId: number, status: string, remark: string) {
  try {
    const session = await getCSRSession();
    const supabase = await createClient();

    const { error: reqError } = await supabase
      .from('requests')
      .update({ 
        current_status: status, 
        updated_at: new Date().toISOString(),
        updated_by: session.id 
      })
      .eq('id', requestId);

    if (reqError) throw reqError;

    const { error: logError } = await supabase
      .from('status_logs')
      .insert({
        request_id: requestId,
        department: 'csr',
        status_name: status,
        staff_remark: remark
      });

    return logError ? { success: false, error: logError.message } : { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}