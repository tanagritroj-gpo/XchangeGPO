'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getCustomerSession } from './auth-actions';

// ── Public: ไม่ต้อง login ────────────────────────────────────
export async function getTrackingTimeline(refId: string) {
  const cleaned = refId?.trim();
  if (!cleaned || cleaned.length > 50) return { error: 'รหัสอ้างอิงไม่ถูกต้อง' };

  // แก้ไข: เพิ่ม 'id' ลงใน .select()
  const { data: request, error: reqErr } = await supabaseAdmin
    .from('requests')
    .select('id, ref_id, current_status, created_at, request_type')
    .eq('ref_id', cleaned)
    .maybeSingle();

  if (reqErr || !request) return { error: 'ไม่พบรหัสอ้างอิงนี้ในระบบ' };

  // ตอนนี้ request.id จะมีค่าแล้วครับ
  const { data: timeline } = await supabaseAdmin
    .from('timeline_summary')
    .select('status_name, log_date')
    .eq('request_id', request.id) 
    .order('log_date', { ascending: true });

  return { request, timeline: timeline ?? [] };
}

// ── Private: ต้อง login ────────────────────────────────────
export async function trackMyRequestByRefId(refId: string) {
  const session = await getCustomerSession();
  if (!session) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };

  // แก้ไข: .select('*') ปกติจะดึง 'id' มาให้แล้ว แต่เพื่อให้ชัวร์ว่าเข้าถึง request.id ได้แน่นอน
  const { data: request, error: reqErr } = await supabaseAdmin
    .from('requests')
    .select('*, drug_items(*)')
    .eq('ref_id', refId)
    .single();

  if (reqErr || !request || request.b2b_customer_id !== session.id) {
    return { success: false, error: 'ไม่พบข้อมูล หรือไม่มีสิทธิ์เข้าถึง' };
  }

  // ตอนนี้ request.id จะมีค่าแล้วครับ
  const { data: timeline } = await supabaseAdmin
    .from('timeline_summary')
    .select('status_name, log_date, staff_remark')
    .eq('request_id', request.id) 
    .order('log_date', { ascending: true });

  return { 
    success: true, 
    data: { 
      ...request, 
      timeline: timeline || [] 
    } 
  };
}