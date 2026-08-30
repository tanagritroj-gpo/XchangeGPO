'use server';

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import * as Sentry from '@sentry/nextjs';
import { buildAndStoreReturnPdf, draftDir, finalDir, resolveVerifiedStamp, type DocKind } from '@/lib/return-form-pdf';
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

  // 4. เลือกฉบับเอกสารที่จะแสดง:
  //    - แลกเปลี่ยน + ยังไม่ผ่านการตรวจ (pending_review) → 'draft' (ฉบับที่ลูกค้ากรอก)
  //    - นอกนั้น → 'final' (non-exchange = ฉบับปกติ; แลกเปลี่ยนที่ CSR ตรวจแล้ว = ฉบับขีดคร่อม)
  const isExchange = request.request_type === 'รับคืนแลกเปลี่ยน';
  const wantKind: DocKind = isExchange && request.current_status === 'pending_review' ? 'draft' : 'final';

  const pickDoc = async (kind: DocKind) =>
    (await supabaseAdmin
      .from('document_attachments')
      .select('file_path')
      .eq('request_id', requestId)
      .eq('kind', kind)
      .maybeSingle()).data?.file_path as string | undefined;

  // ฉบับที่ต้องการ → ถ้าไม่มี fallback ไปอีกฉบับ (กันหน้าลูกค้าพัง)
  let filePath = (await pickDoc(wantKind)) ?? (await pickDoc(wantKind === 'draft' ? 'final' : 'draft'));

  if (!filePath) {
    // ยังไม่มีเอกสารเลย → สร้างฉบับที่ต้องการ on-demand
    //   - non-exchange 'final' ครั้งแรก (flow เดิม — ReviewSuccessCard เรียกมา)
    //   - หรือ draft ที่ best-effort block ใน createReturnRequest พลาด (fallback)
    const storageDir = wantKind === 'draft' ? draftDir(session.id) : finalDir(request);
    // stamp กำกับสถานะ: draft → "ชั่วคราว"; final ของใบแลกเปลี่ยนที่ตรวจแล้ว → "ผ่านการตรวจสอบ" + ลายเซ็น CSR
    const stamp =
      wantKind === 'draft'
        ? ({ kind: 'draft' } as const)
        : isExchange
          ? await resolveVerifiedStamp(requestId)
          : null;
    try {
      const res = await buildAndStoreReturnPdf(request, { kind: wantKind, storageDir, stamp });
      filePath = res.filePath;
    } catch (buildErr) {
      console.error('buildAndStoreReturnPdf failed:', buildErr);
      Sentry.captureException(buildErr, { tags: { area: 'pdf-upload' } });
      return { success: false, error: 'บันทึกไฟล์ไม่สำเร็จ กรุณาลองใหม่' };
    }

    await supabaseAdmin.from('status_logs').insert({
      request_id: requestId,
      department: 'system',
      status_name: 'document_generated',
      staff_remark: `สร้างเอกสารอัตโนมัติ (${wantKind})`,
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