'use server';

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import * as Sentry from '@sentry/nextjs';
import { getCustomerSession } from './auth-actions';
import { checkRateLimit } from '@/lib/rate-limit';
import type { RequestRow } from '@/lib/types';
import { sendReturnFormEmail, resolveEmailMode } from '@/lib/send-return-form-email';
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
      .select('*, drug_items(*), b2b_customers(customer_code)')
      .eq('id', requestId)
      .maybeSingle();

    const owner = Array.isArray(requestData?.b2b_customers) ? requestData.b2b_customers[0] : requestData?.b2b_customers;
    const sameOrg = !!session.customer_code && !!owner?.customer_code && owner.customer_code === session.customer_code;

    if (reqErr || !requestData || !sameOrg) {
      return { success: false, error: 'ไม่พบคำร้องนี้ หรือไม่มีสิทธิ์เข้าถึง' };
    }

    const request = requestData as RequestRow;

    // ต้องมีเอกสารฉบับสมบูรณ์ (kind='final') ก่อน — แลกเปลี่ยนที่ยังไม่ผ่านการตรวจจาก CSR
    // จะยังไม่มี final (มีแต่ draft) → แจ้งให้รอผลตรวจสอบ
    const { data: finalDoc } = await supabaseAdmin
      .from('document_attachments')
      .select('file_path')
      .eq('request_id', requestId)
      .eq('kind', 'final')
      .maybeSingle();
    if (!finalDoc?.file_path) {
      return { success: false, error: 'ไม่พบไฟล์เอกสาร กรุณาสร้างเอกสาร PDF ก่อนส่งอีเมล' };
    }

    // แลกเปลี่ยนที่ตรวจแล้วมี item ไม่ผ่านเกณฑ์ → ส่งฉบับ verified (ขีดคร่อม + ยอดหักรายการ reject)
    const mode = resolveEmailMode(request);

    // ★ ส่งไปที่ session.email เสมอ (ยึด session ปัจจุบันเป็น single source of truth)
    const { error: emailErr } = await sendReturnFormEmail({ request, to: session.email, mode });
    if (emailErr) {
      console.error('send-pdf-email error:', emailErr);
      Sentry.captureException(emailErr, { tags: { area: 'send-pdf-email' } });
      return { success: false, error: 'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่ภายหลัง' };
    }

    // ★ สำเนาให้ sale ที่ดูแลหน่วยงานนี้ (best-effort เงียบ ๆ ถ้าพลาด ไม่กระทบผลลัพธ์ลูกค้า)
    try {
      const saleRepsResult = await getAssignedSaleRepsForCustomer();
      if (saleRepsResult.success && saleRepsResult.reps.length > 0) {
        await Promise.all(
          saleRepsResult.reps.map((rep) => sendReturnFormEmail({ request, to: rep.email, mode }))
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
