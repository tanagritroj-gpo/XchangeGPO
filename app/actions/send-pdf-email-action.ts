'use server';

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import * as Sentry from '@sentry/nextjs';
import { getCustomerSession } from './auth-actions';
import { checkRateLimit } from '@/lib/rate-limit';
import type { DrugItemRow } from '@/lib/types';
import { formatThaiDate } from '@/lib/format-thai-date';
import { sendPdfDocumentEmail } from '@/lib/email-service';
import { getAssignedSaleRepsForCustomer } from './sale-lookup-actions';
import { z } from 'zod';
import { parseOrError, positiveIntId } from '@/lib/validate-input';

export async function sendPdfEmailAction(requestId: number) {
  const parsed = parseOrError(z.object({ requestId: positiveIntId }), { requestId });
  if (!parsed.ok) return { success: false, error: parsed.error };
  try {
    // ★ 1. Identity มาจาก session ที่ verify กับ DB เท่านั้น
    const session = await getCustomerSession();
    if (!session) {
      return { success: false, error: 'กรุณาเข้าสู่ระบบ' };
    }

    // ★ 2. Rate limit กัน email bombing
    const allowed = await checkRateLimit(`send-email:${session.id}`, 5, 3600);
    if (!allowed.allowed) {
      return { success: false, error: 'ส่งอีเมลถี่เกินไป กรุณาลองใหม่ภายหลัง' };
    }

    // ★ 3. ดึงข้อมูล + ตรวจสิทธิ์เจ้าของในคำสั่งเดียว — เช็คสิทธิ์ระดับหน่วยงาน ไม่ใช่ exact
    // b2b_customer_id (เหตุผลเดียวกับ trackMyRequestByRefId ใน tracking-actions.ts)
    const { data: requestData, error: reqErr } = await supabaseAdmin
      .from('requests')
      .select(`
        ref_id, hospital_name, b2b_customer_id, b2b_customers(customer_code),
        doc_number, request_date, created_at, request_type, return_reason, delivery_type, total_value,
        drug_items(drug_name, qty, unit, lot_number, exp_date)
      `)
      .eq('id', requestId)
      .maybeSingle();

    const owner = Array.isArray(requestData?.b2b_customers) ? requestData.b2b_customers[0] : requestData?.b2b_customers;
    const sameOrg = !!session.customer_code && !!owner?.customer_code && owner.customer_code === session.customer_code;

    if (reqErr || !requestData || !sameOrg) {
      return { success: false, error: 'ไม่พบคำร้องนี้ หรือไม่มีสิทธิ์เข้าถึง' };
    }

    // 4. ดึงไฟล์ PDF จากตาราง document_attachments
    const { data: docData, error: docErr } = await supabaseAdmin
      .from('document_attachments')
      .select('file_path')
      .eq('request_id', requestId)
      .maybeSingle();

    if (docErr || !docData?.file_path) {
      return { success: false, error: 'ไม่พบไฟล์เอกสาร กรุณาสร้างเอกสาร PDF ก่อนส่งอีเมล' };
    }

    // 5. สร้าง Signed URL — ลดอายุลงมาให้เหมาะกับเอกสารอ่อนไหว (ดูหมายเหตุด้านล่าง)
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from('return-documents')
      .createSignedUrl(docData.file_path, 60 * 60 * 24); // 24 ชม.

    if (signErr || !signed) {
      return { success: false, error: 'สร้างลิงก์เอกสารไม่สำเร็จ' };
    }

    const pdfEmailParams = {
      refId: requestData.ref_id,
      hospitalName: requestData.hospital_name ?? 'หน่วยงานของท่าน',
      docNumber: requestData.doc_number ?? null,
      requestDateText: formatThaiDate(requestData.request_date ?? requestData.created_at),
      requestType: requestData.request_type ?? null,
      returnReason: requestData.return_reason ?? null,
      deliveryType: requestData.delivery_type ?? null,
      totalValueText: (requestData.total_value ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 }),
      items: ((requestData.drug_items ?? []) as DrugItemRow[]).map((d) => ({
        drugName: d.drug_name, qty: d.qty, unit: d.unit, lot: d.lot_number, exp: formatThaiDate(d.exp_date),
      })),
      downloadUrl: signed.signedUrl,
    };

    // ★ 6. ส่งไปที่ session.email เสมอ — ไม่พึ่งค่าที่เก็บใน requestData
    //    (แม้ตอน insert จะมาจาก session.email อยู่แล้ว แต่ยึด session ปัจจุบันเป็น
    //     single source of truth เพื่อความชัดเจนว่าใครคือผู้รับที่แท้จริง)
    const { error: emailErr } = await sendPdfDocumentEmail({ ...pdfEmailParams, to: session.email });

    if (emailErr) {
      console.error('Gmail SMTP Error:', emailErr); // log เต็มไว้ฝั่ง server เท่านั้น
      Sentry.captureException(emailErr, { tags: { area: 'send-pdf-email' } });
      return { success: false, error: 'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่ภายหลัง' }; // ไม่โชว์ detail ดิบ
    }

    // ★ 6b. ส่งสำเนาให้ sale ที่ดูแลหน่วยงานนี้ด้วย (ถ้ามี) — เฉพาะฝั่งลูกค้ากรอกฟอร์มเองเท่านั้น
    // ตามที่ตกลงกันไว้ (ไม่แตะฝั่ง CSR) "หน่วยงานรัฐอื่นๆ" ไม่มี sale ดูแลอยู่แล้วโดยตั้งใจ จะได้
    // reps ว่างกลับมาเอง (ดู getAssignedSaleRepsForCustomer) เป็น best-effort เงียบๆ ถ้าพลาด
    // ไม่ให้กระทบผลลัพธ์ที่ลูกค้าเห็น (ลูกค้าได้อีเมลของตัวเองแล้วถือว่าสำเร็จ)
    try {
      const saleRepsResult = await getAssignedSaleRepsForCustomer();
      if (saleRepsResult.success && saleRepsResult.reps.length > 0) {
        await Promise.all(
          saleRepsResult.reps.map((rep) => sendPdfDocumentEmail({ ...pdfEmailParams, to: rep.email }))
        );
      }
    } catch (saleEmailErr) {
      console.error('send-pdf-email: failed to notify sale rep(s)', saleEmailErr);
      Sentry.captureException(saleEmailErr, { level: 'warning', tags: { area: 'send-pdf-email-sale-cc' } });
    }

    // 7. บันทึก Log — insert ตรง ไม่ผ่าน RPC เดิม
    await supabaseAdmin.from('status_logs').insert({
      request_id: requestId,
      department: 'system',
      status_name: 'email_sent',
      staff_remark: `ส่งเอกสารไปยังอีเมล ${session.email} เรียบร้อยแล้ว`,
      actor_type: 'system',
    });

    // ★ 8. Audit log ตาม PDPA
    await supabaseAdmin.from('access_logs').insert({
      actor_type: 'customer',
      action: 'send_pdf_email',
      request_id: requestId,
    });

    return { success: true, message: 'ส่งอีเมลสำเร็จแล้ว' };

  } catch (err: unknown) {
    console.error('Send Email Catch Error:', err); // log เต็มไว้ฝั่ง server
    Sentry.captureException(err, { tags: { area: 'send-pdf-email' } });
    return { success: false, error: 'ระบบขัดข้อง กรุณาลองใหม่ภายหลัง' }; // ไม่โชว์ err.message ดิบ
  }
}
