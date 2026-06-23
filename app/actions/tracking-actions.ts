// app/actions/tracking-actions.ts
'use server'

import { createClient } from '@/lib/supabase/server';

export async function getTrackingTimeline(refId: string) {
  const supabase = await createClient();

  // 1. ดึงข้อมูล Request
  const { data: request, error: reqError } = await supabase
    .from('requests')
    .select('*')
    .eq('ref_id', refId)
    .single();

  if (reqError || !request) return { error: 'ไม่พบรายการที่ค้นหา' };

  // 2. ดึง Log จาก View
  const { data: timeline } = await supabase
    .from('view_request_timeline')
    .select('*')
    .eq('request_id', request.id)
    .order('log_date', { ascending: true });

  // 3. ผนวกสถานะแรกสุด (pending_review) เข้าไปถ้ายังไม่มีใน Log
  const hasPending = timeline?.some(log => log.status_name === 'pending_review');
  
  let finalTimeline = timeline || [];
  if (!hasPending) {
    const pendingLog = {
      status_name: 'pending_review',
      log_date: request.created_at, // ใช้เวลาสร้างใบงานเป็นจุดเริ่มต้น
      staff_remark: 'ได้รับคำร้องเข้าระบบแล้ว รอการตรวจสอบเอกสาร',
      department: 'CSR'
    };
    // เอาไว้หน้าสุด (เพราะเป็นสถานะแรก)
    finalTimeline = [pendingLog, ...finalTimeline];
  }

  return { request, timeline: finalTimeline };
}