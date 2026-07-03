'use server';

import { createClient } from '@/lib/supabase/server';
import { buildReturnFormPdf } from '../services/pdf-service'; 

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 5;

type ActionResult =
  | { success: true; url: string; expiresIn: number; refId: string; docNumber: string | null }
  | { success: false; error: string };

export async function generatePdfAction(requestId: number): Promise<ActionResult> {
  const supabase = await createClient();

  // 0. Rate limiting
  const rateLimitOk = await checkRateLimit(supabase, `pdf:${requestId}`);
  if (!rateLimitOk) return { success: false, error: 'มีการเรียกดูเอกสารถี่เกินไป กรุณารอสักครู่' };

  // 1. ดึงข้อมูลผ่าน RPC
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_request_data_for_pdf', { p_request_id: requestId });
  if (rpcErr || !rpcData || rpcData.length === 0) return { success: false, error: 'ไม่พบคำร้องนี้' };

  const request = { ...rpcData[0].request_data, drug_items: rpcData[0].drug_items_data || [] };

  // 2. ตรวจสอบประวัติการบันทึกไฟล์
  const { data: existing } = await supabase
    .from('document_attachments')
    .select('file_path')
    .eq('request_id', requestId)
    .maybeSingle();

  let filePath = existing?.file_path;

  if (!filePath) {
    filePath = `returns/${request.ref_id}.pdf`;

    // เรียกใช้ฟังก์ชันเขียน PDF จาก pdf-service 
    const pdfBytes = await buildReturnFormPdf(request);
    
    // อัปโหลดไฟล์เข้าถังเก็บข้อมูล
    const { error: uploadErr } = await supabase.storage
      .from('return-documents')
      .upload(filePath, pdfBytes, { contentType: 'application/pdf', upsert: true });

    if (uploadErr) {
      console.error('❌ Storage Upload Failed Log:', uploadErr); 
      return { success: false, error: `บันทึกไฟล์ไม่สำเร็จ: ${uploadErr.message}` };
    }

    // 3. บันทึกข้อมูลผ่าน RPC
    await supabase.rpc('insert_document_attachment', { p_req_id: requestId, p_ref_id: request.ref_id, p_path: filePath });
    await supabase.rpc('insert_status_log', { p_req_id: requestId, p_remark: 'สร้างเอกสารอัตโนมัติ' });
  }

  // 4. สร้าง Signed URL
  const { data: signed } = await supabase.storage.from('return-documents').createSignedUrl(filePath, 300);
  
  return { 
    success: true, 
    url: signed!.signedUrl, 
    expiresIn: 300, 
    refId: request.ref_id, 
    docNumber: request.doc_number 
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Rate limiting แบบไม่พึ่งบริการภายนอก
// ─────────────────────────────────────────────────────────────────────────
async function checkRateLimit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  key: string
): Promise<boolean> {
  const now = new Date();
  const { data: row } = await supabase.from('rate_limits').select('*').eq('key', key).maybeSingle();

  if (!row) {
    await supabase.from('rate_limits').insert({ key, window_start: now.toISOString(), count: 1 });
    return true;
  }

  const windowStart = new Date(row.window_start);
  const elapsed = (now.getTime() - windowStart.getTime()) / 1000;

  if (elapsed > RATE_LIMIT_WINDOW_SECONDS) {
    await supabase
      .from('rate_limits')
      .update({ window_start: now.toISOString(), count: 1 })
      .eq('key', key);
    return true;
  }

  if (row.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  await supabase.from('rate_limits').update({ count: row.count + 1 }).eq('key', key);
  return true;
}