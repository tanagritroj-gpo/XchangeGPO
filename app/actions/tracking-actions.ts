'use server'

import { createClient } from '@/lib/supabase/server';
import { getCustomerSession } from '@/app/actions/auth-actions';

// 1. ประกาศ Interface ให้ชัดเจน
interface TimelineItem {
  id: string;
  request_id: string;
  department: string;
  status_name: string;
  staff_remark: string;
  log_date: string;
  ref_id: string;
}

export async function getTrackingTimeline(refId: string) {
  const supabase = await createClient();
  const session = await getCustomerSession();
  const cleanRefId = refId.trim();

  const rpcName = session ? 'get_my_request' : 'get_public_status';
  const rpcParams = session 
    ? { p_ref_id: cleanRefId, p_customer_id: Number(session.id) }
    : { p_ref_id: cleanRefId };

  const { data: requestData, error: rpcError } = await supabase.rpc(rpcName, rpcParams);

  if (rpcError || !requestData || requestData.length === 0) {
    return { error: 'ไม่พบรายการที่ค้นหา หรือรหัสอ้างอิงไม่ถูกต้อง' };
  }

  const request = requestData[0];

  // 2. ดึงข้อมูลโดยกำหนด Type ของผลลัพธ์เป็น TimelineItem[]
  const { data: timeline, error: timelineError } = await supabase
    .from('view_request_timeline')
    .select('id, request_id, department, status_name, staff_remark, log_date, ref_id')
    .eq('ref_id', cleanRefId)
    .order('log_date', { ascending: true })
    .returns<TimelineItem[]>(); // กำหนด Type ตรงนี้ครับ

  if (timelineError) {
    console.error("View Error:", timelineError);
  }

  // 3. จัดการสถานะแรกสุดด้วย Type ที่ถูกต้อง
  let finalTimeline: TimelineItem[] = timeline || [];
  
  const hasPending = finalTimeline.some((log) => log.status_name === 'pending_review');
  
  if (!hasPending) {
    const pendingLog: TimelineItem = {
      id: 'pending-log',
      request_id: request.id, // อย่าลืมใส่ให้ครบตาม interface
      status_name: 'pending_review',
      log_date: request.created_at || new Date().toISOString(),
      staff_remark: 'ได้รับคำร้องเข้าสู่ระบบแล้ว รอการตรวจสอบเอกสาร',
      department: 'System',
      ref_id: cleanRefId
    };
    finalTimeline = [pendingLog, ...finalTimeline];
  }

  return { request, timeline: finalTimeline };
}