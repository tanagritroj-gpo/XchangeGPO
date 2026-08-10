'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getStaffSession } from './auth-staff';
import { revalidatePath } from 'next/cache';
import { isRejectionReasonCode, buildRejectionRemark } from '@/lib/rejection-reasons';
import { buildRegistrationConfirmationPdf } from '@/app/services/registration-pdf-service';
import { checkRateLimit } from '@/lib/rate-limit';
import { ORG_TYPE_OPTIONS } from '@/lib/sale-coverage';
import { Resend } from 'resend';
import { getErrorMessage } from '@/lib/error-message';
import { updateRequestCurrentStatus } from '@/lib/sla';
import type { StaffSessionInfo, ClientRow, DrugItemRow } from '@/lib/types';

const resend = new Resend(process.env.RESEND_API_KEY);

async function getCSRSession() {
  const session = await getStaffSession();
  if (!session) throw new Error("ไม่ได้ Login");

  if (session.department !== 'csr' && session.department !== 'manager') {
    throw new Error("คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
  }
  return session;
}

export async function withCSRAuth<T>(
  action: (session: StaffSessionInfo) => Promise<T>
): Promise<T | { success: false; error: string }> {
  try {
    const session = await getCSRSession();
    return await action(session);
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

export async function getCSRDashboardData() {
  try {
    await getCSRSession();

    // ★ allowlist คอลัมน์แทน select('*') — เพราะ clients มี password_hash แล้ว (ใช้ login
    // ด้วย email+password) ผลลัพธ์นี้ถูกส่งกลับไปเรนเดอร์ที่หน้า client ตรงๆ ห้ามหลุดไปด้วย
    const { data: clients, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id, created_at, hospital_name, province, contact_name, position, phone, email, signature_url, pdpa_consented_at, status, b2b_customer_id, auth_user_id, org_type')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    const { data: requests, error: reqErr } = await supabaseAdmin
      .from('requests')
      .select(`*, drug_items (*)`)
      .order('created_at', { ascending: false });

    if (clientErr || reqErr) {
      throw new Error("ดึงข้อมูลพลาด: " + (clientErr?.message || reqErr?.message));
    }

    return { success: true, clients, requests };

  } catch (e: unknown) {
    console.error("DEBUG - Catch Error:", getErrorMessage(e));
    return { success: false, error: getErrorMessage(e) };
  }
}

// ตัวเลขสรุปสำหรับ tile บนหน้า hub ของ CSR (ลูกค้ารออนุมัติ/ใบงานรอตรวจสอบ/ใบงานรอลด
// หนี้-แลกเปลี่ยน/คำถามบอทค้าง) — ใช้ count: 'exact', head: true ทุกคิวรี่ ไม่ดึงตัวข้อมูล
// จริงมาเลย ต่างจาก getCSRDashboardData() ที่หน้า hub เคยเรียกไปดึง clients ทั้งหมด +
// requests join drug_items ทั้งตาราง (order by created_at ไม่มี limit) แค่เพื่อเอา
// .length / filter ฝั่ง JS มานับ — เปลืองทั้งเวลาและ payload มากเกินความจำเป็น
// unanswered: การ์ด "คำถามที่บอทตอบไม่ได้" ย้ายมาจาก manager hub แล้ว (เดิมนับที่
// getManagerHubCounts ใน manager-actions.ts)
// receiving: current_status = 'receiving' ("กำลังรับสินค้า") — ใบงานที่ผ่านการตรวจสอบ/
// อนุมัติแล้ว กำลังอยู่ระหว่างขั้นตอนลดหนี้/แลกเปลี่ยนจริง ต่างจาก pendingReview ที่นับ
// เฉพาะใบงานที่ยังไม่เข้าสู่ขั้นตอนนี้เลย (ดู label mapping ที่ app/admin/csr/dashboard/page.tsx)
export async function getCSRHubCounts(): Promise<
  | { success: true; pendingClients: number; pendingReview: number; unanswered: number; receiving: number }
  | { success: false; error: string }
> {
  try {
    await getCSRSession();

    const [pendingClientsRes, pendingReviewRes, unansweredRes, receivingRes] = await Promise.all([
      supabaseAdmin.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseAdmin.from('requests').select('id', { count: 'exact', head: true }).eq('current_status', 'pending_review'),
      supabaseAdmin.from('chatbot_unanswered_questions').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('requests').select('id', { count: 'exact', head: true }).eq('current_status', 'receiving'),
    ]);

    const firstError = pendingClientsRes.error || pendingReviewRes.error || unansweredRes.error || receivingRes.error;
    if (firstError) return { success: false, error: firstError.message };

    return {
      success: true,
      pendingClients: pendingClientsRes.count ?? 0,
      pendingReview: pendingReviewRes.count ?? 0,
      unanswered: unansweredRes.count ?? 0,
      receiving: receivingRes.count ?? 0,
    };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

// ค้นหา organizations ด้วยชื่อหน่วยงาน (fuzzy ilike) — ใช้เป็น autocomplete ช่วย CSR ตอน
// อนุมัติลูกค้าใหม่ ให้เจอรหัสลูกค้าเดิมถ้าหน่วยงานนี้เคยลงทะเบียนมาก่อนแล้ว กันเคสพิมพ์
// customer_code ไม่ตรงกับที่มีอยู่ (reviewClient ยังเช็คด้วย exact match อีกชั้นเป็น
// safety net สุดท้ายอยู่ดี ตัวนี้แค่ช่วยแนะนำ ไม่ใช่แหล่งความจริงเดียว)
export async function searchOrganizations(query: string) {
  try {
    await getCSRSession();

    const cleaned = query?.trim();
    if (!cleaned || cleaned.length < 2) return { success: true, data: [] };

    const escaped = cleaned.replace(/[%_]/g, (m) => `\\${m}`);
    const pattern = `%${escaped}%`;

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('id, hospital_name, customer_code, province, org_type')
      .ilike('hospital_name', pattern)
      .order('hospital_name', { ascending: true })
      .limit(5);

    if (error) throw error;
    return { success: true, data: data ?? [] };
  } catch (e: unknown) {
    console.error('searchOrganizations error:', getErrorMessage(e));
    return { success: false, error: getErrorMessage(e) };
  }
}

// ฟังก์ชันรวม: อนุมัติ หรือ ปฏิเสธ ลูกค้า
// customerCode: รหัสลูกค้าที่ CSR พิมพ์เอง (ไม่ได้มาจากลูกค้าตอนลงทะเบียน) — จำเป็น
// เฉพาะตอน approved เท่านั้น เพราะเป็นค่าเดียวที่จะถูกเก็บลง b2b_customers.customer_code
// (เดิมคอลัมน์นี้ไม่เคยถูกเซ็ตเลยตอน insert ทำให้ลูกค้าที่อนุมัติแล้วทุกรายมีค่าว่าง)
export async function reviewClient(clientId: string, action: 'approved' | 'rejected', customerCode?: string) {
  try {
    const session = await getCSRSession();

    if (action === 'approved' && !customerCode?.trim()) {
      throw new Error("กรุณาระบุรหัสลูกค้าก่อนอนุมัติ");
    }

    const { data: client, error: fetchErr } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (fetchErr || !client) throw new Error("หาข้อมูลลูกค้าไม่พบ");

    // ★ .eq('status', 'pending') ทำหน้าที่เป็น compare-and-swap ระดับ DB — ถ้ามีคำขอ
    // ซ้ำซ้อน (เช่น CSR กดปุ่มอนุมัติซ้ำก่อนหน้าเว็บ refetch, หรือ 2 แท็บ) เข้ามาพร้อมกัน
    // จะมีแค่คำขอเดียวที่ match แถวได้ (เพราะแถวเปลี่ยนสถานะไปแล้วหลังคำขอแรกอัปเดตเสร็จ)
    // ป้องกัน insert ซ้ำลง b2b_customers ด้วย email เดิมจนชน unique constraint
    // b2b_customers_email_key (เดิมโค้ดนี้ update โดยไม่เช็คสถานะปัจจุบันเลย — ช่องโหว่นี้
    // มีอยู่ก่อนแล้ว แต่ยิ่งเจอง่ายขึ้นตอนนี้เพราะ flow อนุมัติใช้เวลานานขึ้นจากการสร้าง
    // เอกสาร+ส่งอีเมล เปิดช่องให้กดซ้ำทันจังหวะได้ง่ายขึ้น)
    const { data: updatedRows, error: updateErr } = await supabaseAdmin
      .from('clients')
      .update({ status: action })
      .eq('id', clientId)
      .eq('status', 'pending')
      .select('id');

    if (updateErr) throw updateErr;
    if (!updatedRows || updatedRows.length === 0) {
      throw new Error("ลูกค้ารายนี้ถูกดำเนินการไปแล้ว กรุณารีเฟรชหน้าจอ");
    }

    if (action === 'approved') {
      const trimmedCode = customerCode!.trim();

      try {
        // ★ หา organization ของหน่วยงานนี้ก่อนเสมอ (1 hospital_name = 1 customer_code) —
        // ถ้าเจอหน่วยงานที่เคยลงทะเบียนแล้ว ต้องใช้ customer_code/ข้อมูลของ organization
        // เดิมเป็นหลัก ไม่ใช่ค่าที่ CSR เพิ่งพิมพ์ ป้องกันไม่ให้หน่วยงานเดียวกันมีรหัส
        // ไม่ตรงกันข้ามรอบอนุมัติ (ปัญหาเดิมตอนพึ่ง free-text ล้วนๆ)
        const { data: existingOrg, error: orgLookupErr } = await supabaseAdmin
          .from('organizations')
          .select('id, customer_code, hospital_name, province, org_type')
          .eq('hospital_name', client.hospital_name)
          .maybeSingle();

        if (orgLookupErr) throw orgLookupErr;

        let organization = existingOrg;

        if (organization && organization.customer_code !== trimmedCode) {
          throw new Error(
            `หน่วยงาน "${client.hospital_name}" มีรหัสลูกค้าอยู่แล้วในระบบคือ ${organization.customer_code} กรุณาใช้รหัสเดิม ไม่ต้องตั้งรหัสใหม่`
          );
        }

        // ยังไม่เคยมีหน่วยงานนี้ในระบบ — สร้างใหม่ด้วยรหัสที่ CSR เพิ่งพิมพ์ (ครั้งแรก/ครั้งเดียว
        // ต่อหน่วยงาน — คนถัดไปจากหน่วยงานเดียวกันจะเจอ organization นี้แล้วผูกเข้าเลย
        // ไม่ต้องพิมพ์รหัสซ้ำอีก)
        if (!organization) {
          const { data: newOrg, error: orgInsertErr } = await supabaseAdmin
            .from('organizations')
            .insert({
              customer_code: trimmedCode,
              hospital_name: client.hospital_name,
              province: client.province,
              org_type: client.org_type,
            })
            .select('id, customer_code, hospital_name, province, org_type')
            .single();

          if (orgInsertErr) {
            if (orgInsertErr.code === '23505') {
              throw new Error('รหัสลูกค้านี้ถูกใช้กับหน่วยงานอื่นในระบบแล้ว กรุณาตรวจสอบก่อนอนุมัติซ้ำ');
            }
            throw orgInsertErr;
          }
          organization = newOrg;
        }

        // ★ ข้อมูลหน่วยงาน (hospital_name/customer_code/province/org_type) ยึดจาก organization
        // ที่ resolve ได้ข้างบนเสมอ (join จริง ไม่ใช่ก็อปปี้จาก client ตรงๆ) — b2b_customers
        // ยังคงคอลัมน์เหล่านี้ไว้คู่กับ organization_id ชั่วคราวเพื่อไม่ให้จุดอื่นที่ยังอ่าน
        // ตรงจาก b2b_customers พังก่อนย้ายไป join ผ่าน organizations ทั้งระบบใน phase ถัดไป
        const { data: newCustomer, error: insertErr } = await supabaseAdmin
          .from('b2b_customers')
          .insert({
            email: client.email,
            hospital_name: organization.hospital_name,
            phone: client.phone,
            contact_name: client.contact_name,
            position: client.position,
            customer_code: organization.customer_code,
            province: organization.province,
            org_type: organization.org_type,
            organization_id: organization.id,
            // ★ ลูกค้า login ด้วย email+password (แทน OTP เดิม) — ต้องคัดลอก hash มาด้วย
            // ไม่งั้นบัญชีที่เพิ่งอนุมัติจะ login ไม่ได้เพราะ b2b_customers.password_hash เป็น null
            password_hash: client.password_hash,
          })
          .select('id')
          .single();

        if (insertErr) {
          if (insertErr.code === '23505') {
            throw new Error('อีเมลนี้มีข้อมูลลูกค้าอยู่ในระบบแล้ว กรุณาตรวจสอบก่อนอนุมัติซ้ำ');
          }
          throw insertErr;
        }

        // ผูกกลับเข้า clients เผื่อต้อง trace ย้อนหลัง
        await supabaseAdmin
          .from('clients')
          .update({ b2b_customer_id: newCustomer.id })
          .eq('id', clientId);

        // เอกสารยืนยันการลงทะเบียน + อีเมลแจ้งลูกค้า — เป็น side-effect เสริม ไม่ใช่ตัว
        // การอนุมัติเอง จึงต้อง "ไม่บล็อกผลลัพธ์" การอนุมัติแม้จะล้มเหลว (เช่น Resend
        // ล่มชั่วคราว) เพราะ customer_code ผูกกับ b2b_customers สำเร็จไปแล้วข้างบนนี้ —
        // แต่ต้อง await ให้จบก่อน ไม่ทำแบบ fire-and-forget เพราะ server action รันบน
        // Vercel serverless function ที่อาจถูก freeze ทันทีหลัง response ส่งกลับ ทำให้
        // promise ที่ไม่ได้ await ค้างไม่จบ (CSR ยังกดสร้าง/ส่งเอกสารซ้ำได้ทีหลังผ่าน
        // getRegistrationDocumentUrl() ถ้ารอบนี้พลาด)
        try {
          await generateRegistrationDocument(client, organization.customer_code, session);
        } catch (docErr) {
          console.error('generateRegistrationDocument failed (non-blocking):', docErr);
        }
      } catch (approveErr) {
        // ★ ย้อน clients.status กลับ 'pending' ไม่ว่าจะพังตรงขั้นตอนไหนก็ตาม (หา/สร้าง
        // organization หรือ insert b2b_customers) — ไม่งั้น client จะค้างที่ 'approved'
        // ทั้งที่ไม่มี b2b_customer จริงผูกอยู่เลย (แต่ละ statement ข้างบนเป็นคนละ
        // statement ไม่ใช่ transaction เดียวกัน ถ้าพังกลางทางแล้วปล่อย status ค้างไว้
        // จะกลายเป็นข้อมูลขัดแย้งแบบเดียวกับที่เจอใน client เก่าที่หลุดมาก่อนหน้านี้)
        await supabaseAdmin.from('clients').update({ status: 'pending' }).eq('id', clientId);
        throw approveErr;
      }
    }

    revalidatePath('/admin/csr/customers');
    return { success: true };

  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

// สร้าง PDF ยืนยันการลงทะเบียน อัปโหลดเก็บไว้ใน bucket + document_attachments แล้วส่ง
// อีเมลแจ้งลูกค้า — เรียกจาก reviewClient() เฉพาะตอนอนุมัติเท่านั้น ไม่ throw ออกไปเอง
// (caller เป็นคนคุม try/catch ไม่ให้กระทบผลอนุมัติ)
async function generateRegistrationDocument(client: ClientRow, customerCode: string, session: StaffSessionInfo) {
  let signaturePng: Uint8Array | null = null;
  if (client.signature_url) {
    const { data: sigBlob } = await supabaseAdmin.storage.from('signatures').download(client.signature_url);
    if (sigBlob) signaturePng = new Uint8Array(await sigBlob.arrayBuffer());
  }

  const decidedAt = new Date().toISOString();

  const pdfBytes = await buildRegistrationConfirmationPdf({
    hospital_name: client.hospital_name,
    province: client.province,
    contact_name: client.contact_name,
    position: client.position,
    phone: client.phone,
    email: client.email,
    customer_code: customerCode,
    registered_at: client.pdpa_consented_at,
    customer_signature_png: signaturePng,
    staff_full_name: session.full_name ?? session.username,
    staff_action: 'approved',
    decided_at: decidedAt,
  });

  const filePath = `registration/${client.id}.pdf`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('registration-documents')
    .upload(filePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (uploadErr) throw uploadErr;

  // ★ ต้องเช็ค error ตรงนี้ — เดิมโค้ดนี้ไม่เช็คเลย ถ้า insert พัง (เช่น ชน FK เพราะแถว
  // client ถูกลบไปแล้วระหว่างที่ request ยังทำงานอยู่) ไฟล์ PDF ที่เพิ่ง upload สำเร็จจะ
  // กลายเป็นขยะลอยอยู่ใน bucket ไปตลอด เพราะไม่มีทางย้อนกลับมาหาไฟล์นั้นได้อีก
  // (getRegistrationDocumentUrl ค้นหาผ่าน document_attachments.client_id เท่านั้น) และ
  // จะไม่มี log อะไรเลยด้วยเพราะ error ถูกทิ้งไปเฉยๆ
  const { error: attachErr } = await supabaseAdmin
    .from('document_attachments')
    .insert({ client_id: client.id, file_path: filePath });
  if (attachErr) throw attachErr;

  // จำกัดความถี่การส่งอีเมลต่อ staff คนเดียว (กันเคสผิดพลาดส่งรัว) — ถ้าเกินโควตา
  // แค่ข้ามการส่งอีเมลรอบนี้ เอกสารที่อัปโหลดไว้แล้วยังอยู่ ดึงย้อนหลังได้เสมอ
  const allowed = await checkRateLimit(`send-registration-email:${session.id}`, 30, 3600);
  if (!allowed.allowed) {
    console.warn('send-registration-email rate limited for staff', session.id);
    return;
  }

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from('registration-documents')
    .createSignedUrl(filePath, 60 * 60 * 24);
  if (signErr || !signed) throw signErr ?? new Error('createSignedUrl failed');

  const { error: emailErr } = await resend.emails.send({
    from: 'GPO Xchange <onboarding@resend.dev>',
    to: [client.email],
    subject: 'เปิดใช้งานรหัสลูกค้าสำเร็จ — GPO Xchange Portal',
    html: `
      <h2>สวัสดีครับ, ตัวแทนจาก ${client.hospital_name}</h2>
      <p>ระบบได้เปิดใช้งานรหัสลูกค้าของท่านเรียบร้อยแล้ว</p>
      <p>รหัสลูกค้าของท่านคือ: <strong>${customerCode}</strong></p>
      <p>
        <a href="${signed.signedUrl}" target="_blank" style="padding: 10px 20px; background-color: #0f5132; color: white; text-decoration: none; border-radius: 5px;">
          คลิกที่นี่เพื่อดาวน์โหลดเอกสารยืนยันการลงทะเบียน
        </a>
      </p>
      <p>ลิงก์นี้มีอายุการใช้งาน 24 ชั่วโมง</p>
    `,
  });
  if (emailErr) throw emailErr;
}

// ดึง signed URL ของเอกสารยืนยันการลงทะเบียนที่สร้างไว้แล้ว — ให้ CSR ดู/ดาวน์โหลด
// ย้อนหลังจากหน้าค้นหาลูกค้า (ไม่ต้องสร้างใหม่ทุกครั้งที่กด)
// รับ b2bCustomerId (ตาราง b2b_customers.id) เพราะฝั่ง UI ค้นหาลูกค้าทำงานกับ id นี้
// อยู่แล้ว — resolve กลับไปหา clients.id ผ่าน clients.b2b_customer_id ก่อน แล้วค่อย
// ไปหาไฟล์ใน document_attachments (ที่ผูกกับ clients.id ไม่ใช่ b2b_customers.id)
export async function getRegistrationDocumentUrl(b2bCustomerId: number) {
  return withCSRAuth(async () => {
    const { data: clientRow, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('b2b_customer_id', b2bCustomerId)
      .maybeSingle();

    if (clientErr || !clientRow) {
      return { success: false, error: 'ไม่พบข้อมูลการลงทะเบียนของลูกค้ารายนี้' };
    }

    const { data: doc, error: docErr } = await supabaseAdmin
      .from('document_attachments')
      .select('file_path')
      .eq('client_id', clientRow.id)
      .maybeSingle();

    if (docErr || !doc?.file_path) {
      return { success: false, error: 'ยังไม่มีเอกสารสำหรับลูกค้ารายนี้' };
    }

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from('registration-documents')
      .createSignedUrl(doc.file_path, 300);

    if (signErr || !signed) {
      return { success: false, error: 'สร้างลิงก์เอกสารไม่สำเร็จ' };
    }

    return { success: true, url: signed.signedUrl };
  });
}

// แก้ไขประเภทหน่วยงานของลูกค้าที่อนุมัติไปแล้วก่อนหน้านี้ — จำเป็นสำหรับลูกค้าเก่า
// ที่ลงทะเบียนก่อนมีฟีเจอร์นี้ (org_type เป็น NULL) เพื่อให้พนักงาน sale จับคู่ขอบเขต
// ดูแลกับลูกค้าเก่าได้ ลูกค้าใหม่ที่ลงทะเบียนหลังจากนี้จะมี org_type มาตั้งแต่แรกอยู่แล้ว
export async function updateCustomerOrgType(b2bCustomerId: number, orgType: string) {
  return withCSRAuth(async () => {
    if (!ORG_TYPE_OPTIONS.some((o) => o.value === orgType)) {
      return { success: false, error: 'ประเภทหน่วยงานไม่ถูกต้อง' };
    }

    const { error } = await supabaseAdmin
      .from('b2b_customers')
      .update({ org_type: orgType })
      .eq('id', b2bCustomerId);

    if (error) return { success: false, error: 'บันทึกไม่สำเร็จ' };
    return { success: true };
  });
}

export async function approveDrugItem(drugItemId: number, requestId: number, remark?: string) {
  return withCSRAuth(async (session) => {
    const [{ data: request }, { data: drugItem }] = await Promise.all([
      supabaseAdmin.from('requests').select('request_type').eq('id', requestId).single(),
      supabaseAdmin.from('drug_items').select('product_type').eq('id', drugItemId).single(),
    ]);
    if (request?.request_type === 'รับคืนแลกเปลี่ยน' && !drugItem?.product_type) {
      return { success: false, error: 'กรุณาเลือกประเภทสินค้าก่อนอนุมัติ' };
    }

    const { error: logError } = await supabaseAdmin.from('status_logs').insert({
      request_id: requestId, staff_id: session.id, department: 'csr', status_name: 'approved',
      staff_remark: remark || `อนุมัติรายการยา ID: ${drugItemId}`, drug_item_id: drugItemId
    });
    if (logError) throw new Error("บันทึกประวัติการทำงานไม่สำเร็จ");
    await supabaseAdmin.from('drug_items').update({ current_status: 'approved' }).eq('id', drugItemId);
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function approveRequest(requestId: number, remark?: string) {
  return withCSRAuth(async (session) => {
    const { data: items } = await supabaseAdmin.from('drug_items').select('id, current_status').eq('request_id', requestId);
    const pendingItems = (items ?? []).filter((i) => i.current_status === 'pending_review');
    if (pendingItems.length > 0) throw new Error("ยังมีรายการยาที่ยังไม่ได้อนุมัติ");

    // ★ ถ้ารายการยาทุกตัวถูกปฏิเสธไปหมดแล้วทีละตัว (rejectDrugItem) ปุ่มนี้คือปุ่ม "ปิดขั้นตอน
    // ตรวจสอบ" ไม่ใช่อนุมัติสินค้าจริง (ดูคอมเมนต์ isAllItemsRejected ใน dashboard/page.tsx) —
    // ถ้าไม่มีรายการไหนผ่านเลยสักตัว ใบงานนี้ต้องปิดเป็น "rejected" ไม่ใช่ "approved" ไม่งั้น
    // จะไปโผล่ค้างใน Active Workflow ทั้งที่ไม่มีสินค้าเหลือให้ดำเนินการต่อเลยสักรายการ
    const allRejected = (items?.length ?? 0) > 0 && (items ?? []).every((i) => i.current_status === 'rejected');
    if (allRejected) {
      await supabaseAdmin.from('status_logs').insert({
        request_id: requestId, staff_id: session.id, department: 'csr', status_name: 'rejected',
        staff_remark: remark || 'ปิดใบงาน — รายการยาถูกปฏิเสธทั้งหมด',
      });
      await updateRequestCurrentStatus(requestId, 'rejected');
      revalidatePath('/admin/csr/dashboard');
      return { success: true };
    }

    await supabaseAdmin.from('status_logs').insert({ request_id: requestId, staff_id: session.id, department: 'csr', status_name: 'approved', staff_remark: remark || 'อนุมัติใบงาน' });
    await updateRequestCurrentStatus(requestId, 'approved');
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function rejectDrugItem(drugItemId: number, requestId: number, reasonCode: string, detail: string = '') {
  return withCSRAuth(async (session) => {
    if (!isRejectionReasonCode(reasonCode)) {
      return { success: false, error: "กรุณาเลือกเหตุผลที่ปฏิเสธ" };
    }
    await supabaseAdmin.from('status_logs').insert({ request_id: requestId, staff_id: session.id, department: 'csr', status_name: 'rejected', rejection_reason_code: reasonCode, staff_remark: buildRejectionRemark(reasonCode, detail), drug_item_id: drugItemId });
    await supabaseAdmin.from('drug_items').update({ current_status: 'rejected' }).eq('id', drugItemId);
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function rejectRequest(requestId: number, reasonCode: string, detail: string = '') {
  return withCSRAuth(async (session) => {
    if (!isRejectionReasonCode(reasonCode)) {
      return { success: false, error: "กรุณาเลือกเหตุผลที่ปฏิเสธ" };
    }
    const remark = buildRejectionRemark(reasonCode, detail);
    await supabaseAdmin.from('status_logs').insert({ request_id: requestId, staff_id: session.id, department: 'csr', status_name: 'rejected', rejection_reason_code: reasonCode, staff_remark: remark });
    const { data: items } = await supabaseAdmin.from('drug_items').select('id').eq('request_id', requestId);
    if (items) await supabaseAdmin.from('status_logs').insert(items.map(i => ({ request_id: requestId, drug_item_id: i.id, staff_id: session.id, department: 'csr', status_name: 'rejected', rejection_reason_code: reasonCode, staff_remark: `ปฏิเสธใบงาน: ${remark}` })));
    await updateRequestCurrentStatus(requestId, 'rejected');
    await supabaseAdmin.from('drug_items').update({ current_status: 'rejected' }).eq('request_id', requestId);
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function startExchangeProcess(requestId: number, remark?: string) {
  return withCSRAuth(async (session) => {
    // ใบงานประเภท "รับคืนแลกเปลี่ยน" เท่านั้นที่เข้าสถานะ exchanging — ประเภทอื่น (รับคืนลดหนี้/รับคืน CCR)
    // ไม่มีการแลกเปลี่ยนสินค้าจริง จึงใช้สถานะ credit_note (กำลังลดหนี้) แทน
    const [{ data: request }, { data: items }] = await Promise.all([
      supabaseAdmin.from('requests').select('request_type').eq('id', requestId).single(),
      supabaseAdmin.from('drug_items').select('id, current_status').eq('request_id', requestId),
    ]);
    const newStatus = request?.request_type === 'รับคืนแลกเปลี่ยน' ? 'exchanging' : 'credit_note';
    const defaultRemark = newStatus === 'exchanging' ? 'เริ่มแลกเปลี่ยน' : 'เริ่มลดหนี้';

    const activeItems = items?.filter(i => i.current_status !== 'rejected') ?? [];

    // ★ รายการยาถูกปฏิเสธไปหมดแล้วทุกตัว ไม่มีอะไรเหลือให้แลกเปลี่ยน/ลดหนี้ต่อ — ปิดใบงานเป็น
    // rejected ไปเลย ไม่ส่งต่อเข้า exchanging/credit_note (pattern เดียวกับ approveRequest)
    if (activeItems.length === 0) {
      await supabaseAdmin.from('status_logs').insert({
        request_id: requestId, staff_id: session.id, department: 'csr', status_name: 'rejected',
        staff_remark: remark || 'ปิดใบงาน — รายการยาถูกปฏิเสธทั้งหมด',
      });
      await updateRequestCurrentStatus(requestId, 'rejected');
      revalidatePath('/admin/csr/dashboard');
      return { success: true };
    }

    await supabaseAdmin.from('status_logs').insert(activeItems.map(i => ({ request_id: requestId, drug_item_id: i.id, staff_id: session.id, department: 'csr', status_name: newStatus, staff_remark: remark || defaultRemark })));
    await updateRequestCurrentStatus(requestId, newStatus);
    await supabaseAdmin.from('drug_items').update({ current_status: newStatus }).eq('request_id', requestId).neq('current_status', 'rejected');
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function completeRequest(requestId: number, remark?: string) {
  return withCSRAuth(async (session) => {
    // ★ กันไว้อีกชั้นเผื่อรายการยาถูกปฏิเสธไปหมดแล้วทุกตัวหลังเข้า exchanging/credit_note
    // มาแล้ว — ไม่ควรปิดใบงานเป็น completed ถ้าไม่มีสินค้าเหลือสักรายการ (pattern เดียวกับ
    // approveRequest/startExchangeProcess)
    const { data: items } = await supabaseAdmin.from('drug_items').select('id, current_status').eq('request_id', requestId);
    const allRejected = (items?.length ?? 0) > 0 && (items ?? []).every(i => i.current_status === 'rejected');

    if (allRejected) {
      await supabaseAdmin.from('status_logs').insert({
        request_id: requestId, staff_id: session.id, department: 'csr', status_name: 'rejected',
        staff_remark: remark || 'ปิดใบงาน — รายการยาถูกปฏิเสธทั้งหมด',
      });
      await updateRequestCurrentStatus(requestId, 'rejected');
      revalidatePath('/admin/csr/dashboard');
      return { success: true };
    }

    await supabaseAdmin.from('status_logs').insert({ request_id: requestId, staff_id: session.id, department: 'csr', status_name: 'completed', staff_remark: remark || 'งานเสร็จสิ้น' });
    await updateRequestCurrentStatus(requestId, 'completed');
    await supabaseAdmin.from('drug_items').update({ current_status: 'completed' }).eq('request_id', requestId).neq('current_status', 'rejected');
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function updateDrugCompliance(itemId: number, pType: string, compliance: { pass: boolean | null, msg: string }) {
  return withCSRAuth(async () => {
    await supabaseAdmin
      .from('drug_items')
      .update({
        product_type: pType || null,
        is_compliant: compliance.pass,
        compliance_remark: compliance.msg
      })
      .eq('id', itemId);
    return { success: true };
  });
}

// ดึงประวัติใบงานทั้งหมดของลูกค้ารายหนึ่ง — ใช้ในหน้าค้นหาลูกค้า (CSR customers page)
// เช็คสิทธิ์ผ่าน getCSRSession() เหมือนทุกฟังก์ชันในไฟล์นี้ (department === 'csr' เท่านั้น)
// ไม่ใช่ RLS เพราะ query นี้วิ่งผ่าน supabaseAdmin (service_role) ที่ bypass RLS อยู่แล้วโดยธรรมชาติ
// การควบคุมสิทธิ์จริงจึงอยู่ที่ getCSRSession() ในโค้ดนี้เท่านั้น — ไม่ใช่ RLS policy บนตาราง requests
export async function getCustomerRequestHistory(customerId: number) {
  try {
    await getCSRSession();

    if (!customerId || !Number.isFinite(customerId)) {
      throw new Error('รหัสลูกค้าไม่ถูกต้อง');
    }

    const { data, error } = await supabaseAdmin
      .from('requests')
      .select('id, ref_id, request_type, current_status, total_value, created_at')
      .eq('b2b_customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { success: true, data: data ?? [] };
  } catch (e: unknown) {
    console.error('getCustomerRequestHistory error:', getErrorMessage(e));
    return { success: false, error: getErrorMessage(e) };
  }
}

// รายละเอียดใบงานแบบเต็ม ไม่ผูกกับ customerId — ใช้เป็น fetchDetail ของ RequestHistoryList
// ในแท็บ "ประวัติใบงาน" ของ CSR Dashboard ที่ครอบคลุมทุกลูกค้าพร้อมกัน (ต่างจาก
// getStaffRequestDetail ที่ต้องรู้ customerId ล่วงหน้าจากหน้าค้นหาลูกค้าทีละราย)
export async function getCSRRequestDetail(requestId: number) {
  try {
    await getCSRSession();

    const { data: request, error: reqErr } = await supabaseAdmin
      .from('requests')
      .select('*, drug_items(*)')
      .eq('id', requestId)
      .maybeSingle();

    if (reqErr || !request) throw new Error('ไม่พบข้อมูลใบงานนี้');

    const { data: timelineRaw } = await supabaseAdmin
      .from('timeline_summary')
      .select('status_name, log_date, staff_remark, drug_item_id')
      .eq('request_id', request.id)
      .order('log_date', { ascending: true });

    const drugNameById: Record<number, string> = Object.fromEntries(
      (request.drug_items ?? []).map((i: DrugItemRow) => [i.id, i.drug_name])
    );

    const timeline = (timelineRaw ?? []).map((t) => ({
      ...t,
      drug_name: t.drug_item_id != null ? drugNameById[t.drug_item_id] ?? null : null,
    }));

    return { success: true, data: { ...request, timeline } };
  } catch (e: unknown) {
    console.error('getCSRRequestDetail error:', getErrorMessage(e));
    return { success: false, error: getErrorMessage(e) };
  }
}

export async function getStaffRequestDetail(requestId: number, customerId: number) {
  try {
    await getCSRSession();

    const { data: request, error: reqErr } = await supabaseAdmin
      .from('requests')
      .select('*, drug_items(*)')
      .eq('id', requestId)
      .maybeSingle();

    if (reqErr || !request || request.b2b_customer_id !== customerId) {
      throw new Error('ไม่พบข้อมูลใบงานนี้');
    }

    const { data: timelineRaw } = await supabaseAdmin
      .from('timeline_summary')
      .select('status_name, log_date, staff_remark, drug_item_id')
      .eq('request_id', request.id)
      .order('log_date', { ascending: true });

    const drugNameById: Record<number, string> = Object.fromEntries(
      (request.drug_items ?? []).map((i: DrugItemRow) => [i.id, i.drug_name])
    );

    const timeline = (timelineRaw ?? []).map((t) => ({
      ...t,
      drug_name: t.drug_item_id != null ? drugNameById[t.drug_item_id] ?? null : null,
    }));

    return { success: true, data: { ...request, timeline } };
  } catch (e: unknown) {
    console.error('getStaffRequestDetail error:', getErrorMessage(e));
    return { success: false, error: getErrorMessage(e) };
  }
}