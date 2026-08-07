'use server';

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { Resend } from 'resend';
import { getCustomerSession } from './auth-actions';
import { checkRateLimit } from '@/lib/rate-limit';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendPdfEmailAction(requestId: number) {
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
      .select('ref_id, hospital_name, b2b_customer_id, b2b_customers(customer_code)')
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

    // ★ 6. ส่งไปที่ session.email เสมอ — ไม่พึ่งค่าที่เก็บใน requestData
    //    (แม้ตอน insert จะมาจาก session.email อยู่แล้ว แต่ยึด session ปัจจุบันเป็น
    //     single source of truth เพื่อความชัดเจนว่าใครคือผู้รับที่แท้จริง)
    const { error: emailErr } = await resend.emails.send({
      from: 'Xchange Portal <onboarding@resend.dev>',
      to: [session.email],
      subject: `เอกสารแบบฟอร์มรับคืน/แลกเปลี่ยนสินค้า (Ref: ${requestData.ref_id})`,
      html: `
        <h2>สวัสดีครับ, ตัวแทนจาก ${requestData.hospital_name}</h2>
        <p>ระบบได้ทำการสร้างเอกสารแบบฟอร์มรับคืน/แลกเปลี่ยนสินค้าเรียบร้อยแล้ว</p>
        <p>เลขอ้างอิงของคุณคือ: <strong>${requestData.ref_id}</strong></p>
        <p>
          <a href="${signed.signedUrl}" target="_blank" style="padding: 10px 20px; background-color: #0f5132; color: white; text-decoration: none; border-radius: 5px;">
            คลิกที่นี่เพื่อดาวน์โหลดเอกสาร PDF
          </a>
        </p>
        <p>ลิงก์นี้มีอายุการใช้งาน 24 ชั่วโมง</p>
      `,
    });

    if (emailErr) {
      console.error('Resend API Error:', emailErr); // log เต็มไว้ฝั่ง server เท่านั้น
      return { success: false, error: 'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่ภายหลัง' }; // ไม่โชว์ detail จาก Resend
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
    return { success: false, error: 'ระบบขัดข้อง กรุณาลองใหม่ภายหลัง' }; // ไม่โชว์ err.message ดิบ
  }
}
