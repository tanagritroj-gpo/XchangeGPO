'use server';

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import * as Sentry from '@sentry/nextjs';
import { buildReturnFormPdf } from '../services/pdf-service';
import { getCustomerSession } from './auth-actions';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { parseOrError, positiveIntId } from '@/lib/validate-input';

type ActionResult =
  | { success: true; url: string; expiresIn: number; refId: string; docNumber: string | null }
  | { success: false; error: string };

export async function generatePdfAction(requestId: number): Promise<ActionResult> {
  const parsed = parseOrError(z.object({ requestId: positiveIntId }), { requestId });
  if (!parsed.ok) return { success: false, error: parsed.error };

  // ★ 1. Identity มาจาก session ที่ verify กับ DB เท่านั้น ไม่ parse cookie เอง
  const session = await getCustomerSession();
  if (!session) {
    return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
  }

  // ★ 2. Rate limit แบบ atomic ผ่าน RPC (กัน race condition)
  const allowed = await checkRateLimit(`pdf:${session.id}`, 5, 60);
  if (!allowed.allowed) {
    return { success: false, error: 'มีการเรียกดูเอกสารถี่เกินไป กรุณารอสักครู่' };
  }

  // ★ 3. ดึงข้อมูล + ตรวจสิทธิ์เจ้าของในคำสั่งเดียว (ownership check ที่ server)
  // join b2b_customers(customer_code) เพิ่ม — เช็คสิทธิ์ระดับหน่วยงาน ไม่ใช่ exact
  // b2b_customer_id (เหตุผลเดียวกับ trackMyRequestByRefId ใน tracking-actions.ts)
  const { data: request, error: fetchErr } = await supabaseAdmin
    .from('requests')
    .select('*, drug_items(*), b2b_customers(customer_code)')
    .eq('id', requestId)
    .maybeSingle();

  const owner = Array.isArray(request?.b2b_customers) ? request.b2b_customers[0] : request?.b2b_customers;
  const sameOrg = !!session.customer_code && !!owner?.customer_code && owner.customer_code === session.customer_code;

  if (fetchErr || !request || !sameOrg) {
    // ข้อความเดียวกันทั้ง "ไม่เจอ" และ "เจอแต่ไม่ใช่ของคุณ" กัน enumeration
    return { success: false, error: 'ไม่พบคำร้องนี้ หรือไม่มีสิทธิ์เข้าถึง' };
  }

  // 4. ตรวจสอบไฟล์เดิม
  const { data: existing } = await supabaseAdmin
    .from('document_attachments')
    .select('file_path')
    .eq('request_id', requestId)
    .maybeSingle();

  let filePath = existing?.file_path;

  if (!filePath) {
    // path แยกตาม customer_id เผื่อทำ storage policy เพิ่มในอนาคต
    filePath = `returns/${session.id}/${request.ref_id}.pdf`;

    const pdfBytes = await buildReturnFormPdf(request);

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('return-documents')
      .upload(filePath, pdfBytes, { contentType: 'application/pdf', upsert: true });

    if (uploadErr) {
      console.error('Storage upload failed:', uploadErr); // log เต็มไว้ฝั่ง server เท่านั้น
      Sentry.captureException(uploadErr, { tags: { area: 'pdf-upload' } });
      return { success: false, error: 'บันทึกไฟล์ไม่สำเร็จ กรุณาลองใหม่' }; // ไม่ส่ง detail กลับ client
    }

    await supabaseAdmin.from('document_attachments').insert({
      request_id: requestId,
      ref_id: request.ref_id,
      file_path: filePath,
    });

    await supabaseAdmin.from('status_logs').insert({
      request_id: requestId,
      department: 'system',
      status_name: 'document_generated',
      staff_remark: 'สร้างเอกสารอัตโนมัติ',
      actor_type: 'system',
    });
  }

  // ★ 5. Audit log ตาม PDPA — บันทึกทุกครั้งที่มีการเข้าถึงเอกสาร (ไม่ใช่แค่ตอนสร้างครั้งแรก)
  await supabaseAdmin.from('access_logs').insert({
    actor_type: 'customer',
    client_id: null, // ไม่มี clients.id ผูกตรงกับ b2b_customers ในที่นี้ ใช้ request_id เป็นหลักฐานแทน
    action: 'generate_pdf',
    request_id: requestId,
  });

  // 6. สร้าง Signed URL
  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from('return-documents')
    .createSignedUrl(filePath, 300);

  if (signErr || !signed) {
    return { success: false, error: 'สร้างลิงก์เอกสารไม่สำเร็จ' };
  }

  return {
    success: true,
    url: signed.signedUrl,
    expiresIn: 300,
    refId: request.ref_id,
    docNumber: request.doc_number,
  };
}