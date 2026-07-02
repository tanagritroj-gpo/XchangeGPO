'use server'

import { createClient } from '@/lib/supabase/server';
import { getCustomerSession } from '@/app/actions/auth-actions';

/**
 * ดึงข้อมูล Tracking โดยใช้ View ใหม่ของกิต (view_request_timeline)
 */
export async function getTrackingTimeline(refId: string) {
  const supabase = await createClient();
  const session = await getCustomerSession();
  const cleanRefId = refId.trim();

  // 1. ดึงข้อมูล Request ผ่าน RPC (เพื่อเช็กสิทธิ์ความปลอดภัย)
  const rpcName = session ? 'get_my_request' : 'get_public_status';
  const rpcParams = session 
    ? { p_ref_id: cleanRefId, p_customer_id: Number(session.id) }
    : { p_ref_id: cleanRefId };

  const { data: requestData, error: rpcError } = await supabase.rpc(rpcName, rpcParams);

  if (rpcError || !requestData || requestData.length === 0) {
    return { error: 'ไม่พบรายการที่ค้นหา หรือรหัสอ้างอิงไม่ถูกต้อง' };
  }

  const request = requestData[0];

  // 2. ดึง Timeline จาก View
  // ใช้ order by log_date asc เพื่อให้เรียงตามเวลาที่เกิดขึ้นจริง
  const { data: timeline, error: timelineError } = await supabase
    .from('view_request_timeline')
    .select('id, request_id, department, status_name, staff_remark, log_date, ref_id')
    .eq('ref_id', cleanRefId)
    .order('log_date', { ascending: true }); 

  if (timelineError) {
    console.error("View Error:", timelineError);
  }

  // 3. จัดการสถานะแรกสุด (pending_review)
  let finalTimeline = timeline || [];
  
  // เช็กว่ามี pending_review อยู่แล้วไหม
  const hasPending = finalTimeline.some((log: any) => log.status_name === 'pending_review');
  
  if (!hasPending) {
    const pendingLog = {
      id: 'pending-log', // ให้มี ID พิเศษ
      status_name: 'pending_review',
      // ถ้าไม่มี created_at ให้ใช้เวลาปัจจุบันเป็น fallback เพื่อไม่ให้ Date พัง
      log_date: request.created_at || new Date().toISOString(),
      staff_remark: 'ได้รับคำร้องเข้าสู่ระบบแล้ว รอการตรวจสอบเอกสาร',
      department: 'System'
    };
    finalTimeline = [pendingLog, ...finalTimeline];
  }

  return { request, timeline: finalTimeline };
}