'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import * as Sentry from '@sentry/nextjs';
import { getStaffSession } from './auth-staff';
import { revalidatePath } from 'next/cache';
import { isRejectionReasonCode, buildRejectionRemark } from '@/lib/rejection-reasons';
import { buildRegistrationConfirmationPdf } from '@/app/services/registration-pdf-service';
import { checkRateLimit } from '@/lib/rate-limit';
import { ORG_TYPE_OPTIONS } from '@/lib/sale-coverage';
import { getErrorMessage } from '@/lib/error-message';
import { updateRequestCurrentStatus } from '@/lib/sla';
import type { StaffSessionInfo, ClientRow, DrugItemRow } from '@/lib/types';
import { sendRegistrationApprovedEmail } from '@/lib/email-service';
import { z } from 'zod';
import { parseOrError, positiveIntId, remarkText as remarkTextRequired } from '@/lib/validate-input';

// จำนวนแถวสูงสุดที่ยอมดึงต่อครั้ง — กันเคส full-table scan ไม่จำกัดถ้าข้อมูลโตเกินคาด
// ในอนาคต (ปัจจุบันคำร้องสะสมทั้งระบบมีหลักสิบแถว) ไม่ใช่ pagination จริง แค่ safety net
// วงกว้าง (getCSRDashboardData ดึงคำร้อง "ทั้งหมด" ไม่กรองสถานะเหมือน WH/logistics
// จึงเป็นจุดที่โตไม่มีเพดานเร็วที่สุดถ้าไม่มี guard นี้)
const DASHBOARD_ROW_LIMIT = 1000;
const remarkText = remarkTextRequired.optional();

// ★ getCSRSession เช็คจาก department ล้วนๆ โดยตั้งใจไม่สนใจ role (ต่างจาก
// assertDepartmentAccess ใน lib/staff-permissions.ts ที่ wh/logistics/sla/notification ใช้ร่วมกัน) —
// ดูคอมเมนต์ "authorization guard uses department, not role" ใน csr-actions.test.ts จึงไม่
// ย้ายมาใช้ helper กลางตรงนี้ เพื่อไม่ให้พฤติกรรมเปลี่ยน
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
      .order('created_at', { ascending: false })
      .limit(DASHBOARD_ROW_LIMIT);

    const { data: requests, error: reqErr } = await supabaseAdmin
      .from('requests')
      .select(`*, drug_items (*)`)
      .order('created_at', { ascending: false })
      .limit(DASHBOARD_ROW_LIMIT);

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
  | {
      success: true; pendingClients: number; pendingReview: number; unanswered: number;
      totalRequests: number; completed: number; rejected: number;
    }
  | { success: false; error: string }
> {
  try {
    await getCSRSession();

    // totalRequests/completed/rejected เพิ่มเข้ามาสำหรับแถบมินิสถิติ 5 ช่อง (ทั้งหมด/รอตรวจสอบ/
    // กำลังดำเนินการ/เสร็จสิ้น/ถูกปฏิเสธ) ใน tile "CSR Dashboard" ของหน้า hub — "กำลังดำเนินการ"
    // ไม่ได้ query แยก คำนวณฝั่ง client จาก total - pending_review - completed - rejected
    // (pattern เดียวกับ inProgressCount ใน staff-approvals/page.tsx) — ตัด receiving ออกแล้ว
    // (เคยใช้กับ pill "รอลดหนี้/แลกเปลี่ยน" ที่ตัดออกไปพร้อมกับปรับ tile นี้ ตอนนี้ไม่มีจุด
    // ไหนในหน้าเรียกใช้ค่านี้อีกแล้ว)
    const [pendingClientsRes, pendingReviewRes, unansweredRes, totalRes, completedRes, rejectedRes] = await Promise.all([
      supabaseAdmin.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseAdmin.from('requests').select('id', { count: 'exact', head: true }).eq('current_status', 'pending_review'),
      supabaseAdmin.from('chatbot_unanswered_questions').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('requests').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('requests').select('id', { count: 'exact', head: true }).eq('current_status', 'completed'),
      supabaseAdmin.from('requests').select('id', { count: 'exact', head: true }).eq('current_status', 'rejected'),
    ]);

    const firstError = pendingClientsRes.error || pendingReviewRes.error || unansweredRes.error
      || totalRes.error || completedRes.error || rejectedRes.error;
    if (firstError) return { success: false, error: firstError.message };

    return {
      success: true,
      pendingClients: pendingClientsRes.count ?? 0,
      pendingReview: pendingReviewRes.count ?? 0,
      unanswered: unansweredRes.count ?? 0,
      totalRequests: totalRes.count ?? 0,
      completed: completedRes.count ?? 0,
      rejected: rejectedRes.count ?? 0,
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
  const parsed = parseOrError(
    z.object({
      clientId: z.string().min(1),
      action: z.enum(['approved', 'rejected']),
      customerCode: z.string().max(200).optional(),
    }),
    { clientId, action, customerCode }
  );
  if (!parsed.ok) return { success: false, error: parsed.error };
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
          .select('id, access_expires_at')
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

        // จุดเริ่มต้นของ audit trail อายุการใช้งานบัญชี — access_expires_at ถูกตั้งอัตโนมัติ
        // จาก DB default (now() + 2 ปี) ตอน insert ข้างบนแล้ว บันทึกแค่ log ไว้เป็นหลักฐานว่า
        // ใครอนุมัติเมื่อไหร่ (เป็น side-effect เสริมเหมือนเอกสาร/อีเมลด้านล่าง ไม่ throw ถ้าพัง)
        await supabaseAdmin.from('customer_access_log').insert({
          b2b_customer_id: newCustomer.id,
          action: 'approved_initial',
          staff_id: session.id,
          new_expires_at: newCustomer.access_expires_at,
        });

        // เอกสารยืนยันการลงทะเบียน + อีเมลแจ้งลูกค้า — เป็น side-effect เสริม ไม่ใช่ตัว
        // การอนุมัติเอง จึงต้อง "ไม่บล็อกผลลัพธ์" การอนุมัติแม้จะล้มเหลว (เช่น Resend
        // ล่มชั่วคราว) เพราะ customer_code ผูกกับ b2b_customers สำเร็จไปแล้วข้างบนนี้ —
        // แต่ต้อง await ให้จบก่อน ไม่ทำแบบ fire-and-forget เพราะ server action รันบน
        // Vercel serverless function ที่อาจถูก freeze ทันทีหลัง response ส่งกลับ ทำให้
        // promise ที่ไม่ได้ await ค้างไม่จบ (CSR ยังกดสร้าง/ส่งเอกสารซ้ำได้ทีหลังผ่าน
        // getRegistrationDocumentUrl() ถ้ารอบนี้พลาด)
        try {
          await generateRegistrationDocument(client, organization.customer_code, session, newCustomer.access_expires_at);
        } catch (docErr) {
          console.error('generateRegistrationDocument failed (non-blocking):', docErr);
          Sentry.captureException(docErr, { level: 'warning', tags: { area: 'registration-document' } });
        }
      } catch (approveErr) {
        // ★ ย้อน clients.status กลับ 'pending' ไม่ว่าจะพังตรงขั้นตอนไหนก็ตาม (หา/สร้าง
        // organization หรือ insert b2b_customers) — ไม่งั้น client จะค้างที่ 'approved'
        // ทั้งที่ไม่มี b2b_customer จริงผูกอยู่เลย (แต่ละ statement ข้างบนเป็นคนละ
        // statement ไม่ใช่ transaction เดียวกัน ถ้าพังกลางทางแล้วปล่อย status ค้างไว้
        // จะกลายเป็นข้อมูลขัดแย้งแบบเดียวกับที่เจอใน client เก่าที่หลุดมาก่อนหน้านี้)
        // ★ จุดนี้เดิมไม่มี console.error/alert เลย (พบระหว่างไล่หา error สำคัญที่ยังไม่มี
        // การแจ้งเตือน 11 ส.ค. 2569) ทั้งที่เป็น failure ที่ร้ายแรงที่สุดของ flow อนุมัติ
        // ลูกค้า (สร้าง organization/b2b_customers พังกลางทาง) — ต้อง capture ก่อน throw
        Sentry.captureException(approveErr, { tags: { area: 'csr-client-approval' } });
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
async function generateRegistrationDocument(client: ClientRow, customerCode: string, session: StaffSessionInfo, accessExpiresAt: string) {
  let signaturePng: Uint8Array | null = null;
  if (client.signature_url) {
    const { data: sigBlob } = await supabaseAdmin.storage.from('signatures').download(client.signature_url);
    if (sigBlob) signaturePng = new Uint8Array(await sigBlob.arrayBuffer());
  }

  // ลายเซ็นของพนักงานที่กดอนุมัติ — ฝังในช่อง "ลงชื่อ (พนักงาน GPO)" ของเอกสาร
  let staffSignaturePng: Uint8Array | null = null;
  if (session.signature_url) {
    const { data: staffSigBlob } = await supabaseAdmin.storage.from('signatures').download(session.signature_url);
    if (staffSigBlob) staffSignaturePng = new Uint8Array(await staffSigBlob.arrayBuffer());
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
    staff_signature_png: staffSignaturePng,
    staff_full_name: session.full_name ?? session.username,
    staff_action: 'approved',
    decided_at: decidedAt,
    access_expires_at: accessExpiresAt,
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

  const { error: emailErr } = await sendRegistrationApprovedEmail({
    to: client.email,
    hospitalName: client.hospital_name,
    customerCode,
    documentUrl: signed.signedUrl,
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

// ══ อายุการใช้งานบัญชีลูกค้า (2 ปีนับจากวันอนุมัติ) — แท็บ "การต่ออายุเข้าใช้ระบบ" ══

// รายชื่อลูกค้าที่อนุมัติแล้วทั้งหมด พร้อมสถานะอายุการใช้งาน — เรียงใกล้หมดอายุสุดขึ้นก่อน
// ให้ CSR เห็นรายที่ต้องจัดการก่อนโดยไม่ต้องเลื่อนหา (join organizations แบบเดียวกับ
// searchB2BCustomers ใน staff-form-actions.ts เพราะ hospital_name/customer_code ตัวจริง
// อยู่ที่ organizations ไม่ใช่คอลัมน์ mirror บน b2b_customers)
export async function getCustomersAccessStatus() {
  return withCSRAuth(async () => {
    const { data, error } = await supabaseAdmin
      .from('b2b_customers')
      .select('id, contact_name, email, access_expires_at, cancelled_at, organizations!inner(hospital_name, customer_code)')
      .order('access_expires_at', { ascending: true });

    if (error) return { success: false, error: 'ดึงข้อมูลไม่สำเร็จ' };

    const flattened = (data ?? []).map((row) => {
      const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
      const { organizations: _omit, ...rest } = row;
      return {
        ...rest,
        hospital_name: org?.hospital_name ?? null,
        customer_code: org?.customer_code ?? null,
      };
    });

    return { success: true, data: flattened };
  });
}

// ต่ออายุ 2 ปี นับจากวันนี้เสมอ (ไม่ใช่นับต่อจากวันหมดอายุเดิม) — ผู้ใช้ยืนยันแล้วว่าต้องการ
// แบบนี้ ง่ายและคาดเดาผลได้ตรงไปตรงมาที่สุด ไม่มีเคส edge case ต้องกัน (เช่นต่ออายุช้ามาก
// จนวันหมดอายุใหม่ยังเป็นอดีตอยู่แบบวิธีนับต่อจากวันเดิม)
export async function renewCustomerAccess(b2bCustomerId: number) {
  return withCSRAuth(async (session) => {
    const { data: current } = await supabaseAdmin
      .from('b2b_customers')
      .select('access_expires_at')
      .eq('id', b2bCustomerId)
      .maybeSingle();

    if (!current) return { success: false, error: 'ไม่พบข้อมูลลูกค้ารายนี้' };

    const newExpiresAt = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString();

    // reset expiry_warned_at กลับเป็น null — ให้ cron แจ้งเตือนล่วงหน้าได้อีกครั้งตอนใกล้ครบ
    // กำหนดรอบใหม่ (ไม่งั้นจะไม่แจ้งเตือนอีกเลยเพราะเงื่อนไข "ยังไม่เคยแจ้ง" เป็นเท็จค้างตลอด)
    const { error } = await supabaseAdmin
      .from('b2b_customers')
      .update({ access_expires_at: newExpiresAt, expiry_warned_at: null })
      .eq('id', b2bCustomerId);

    if (error) return { success: false, error: 'ต่ออายุไม่สำเร็จ' };

    await supabaseAdmin.from('customer_access_log').insert({
      b2b_customer_id: b2bCustomerId,
      action: 'renewed',
      staff_id: session.id,
      previous_expires_at: current.access_expires_at,
      new_expires_at: newExpiresAt,
    });

    return { success: true };
  });
}

// ยกเลิกสิทธิ์เข้าใช้งาน — แยกอิสระจากวันหมดอายุ (CSR เปิด-ปิดเองได้ทุกเมื่อ) ต้องลบ session
// ที่ค้างอยู่ทันทีด้วย ไม่งั้นลูกค้าที่ล็อกอินค้างอยู่แล้วจะยังใช้งานต่อได้จนกว่า session
// หมดอายุเอง (สูงสุด 1 ชม. ตาม createCustomerSession) getCustomerSession() เช็คซ้ำทุกครั้ง
// อยู่แล้วก็จริง แต่ไม่ควรรอให้ครั้งถัดไปที่โหลดหน้าค่อยตัด ควรตัดทันทีที่ CSR กด
export async function cancelCustomerAccess(b2bCustomerId: number) {
  return withCSRAuth(async (session) => {
    const { error } = await supabaseAdmin
      .from('b2b_customers')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('id', b2bCustomerId);

    if (error) return { success: false, error: 'ยกเลิกไม่สำเร็จ' };

    await supabaseAdmin.from('sessions').delete().eq('customer_id', b2bCustomerId).eq('actor_type', 'customer');

    await supabaseAdmin.from('customer_access_log').insert({
      b2b_customer_id: b2bCustomerId,
      action: 'cancelled',
      staff_id: session.id,
    });

    return { success: true };
  });
}

// เปิดใช้งานลูกค้าที่เคยถูกยกเลิกกลับมาใหม่ — ไม่แตะ access_expires_at เลย (ถ้าหมดอายุไปแล้ว
// ด้วยระหว่างที่ถูกยกเลิก ต้องกดต่ออายุแยกต่างหากอีกที ไม่ auto-renew ให้ตอนเปิดใช้งาน)
export async function reactivateCustomerAccess(b2bCustomerId: number) {
  return withCSRAuth(async (session) => {
    const { error } = await supabaseAdmin
      .from('b2b_customers')
      .update({ cancelled_at: null })
      .eq('id', b2bCustomerId);

    if (error) return { success: false, error: 'เปิดใช้งานไม่สำเร็จ' };

    await supabaseAdmin.from('customer_access_log').insert({
      b2b_customer_id: b2bCustomerId,
      action: 'reactivated',
      staff_id: session.id,
    });

    return { success: true };
  });
}

// ประวัติการอนุมัติ/ต่ออายุ/ยกเลิก/เปิดใช้งานใหม่ ของลูกค้ารายเดียว — ใช้แสดงในส่วน "ดูประวัติ"
// ของแท็บ "การต่ออายุเข้าใช้ระบบ"
export async function getCustomerAccessHistory(b2bCustomerId: number) {
  return withCSRAuth(async () => {
    const { data, error } = await supabaseAdmin
      .from('customer_access_log')
      .select('id, action, previous_expires_at, new_expires_at, created_at, staff_users(full_name, username)')
      .eq('b2b_customer_id', b2bCustomerId)
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: 'ดึงประวัติไม่สำเร็จ' };

    const flattened = (data ?? []).map((row) => {
      const staff = Array.isArray(row.staff_users) ? row.staff_users[0] : row.staff_users;
      const { staff_users: _omit, ...rest } = row;
      return { ...rest, staff_name: staff?.full_name ?? staff?.username ?? null };
    });

    return { success: true, data: flattened };
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
  const parsed = parseOrError(z.object({ requestId: positiveIntId, remark: remarkText }), { requestId, remark });
  if (!parsed.ok) return { success: false, error: parsed.error };
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
  const parsed = parseOrError(
    z.object({ drugItemId: positiveIntId, requestId: positiveIntId, reasonCode: z.string(), detail: z.string().max(2000) }),
    { drugItemId, requestId, reasonCode, detail }
  );
  if (!parsed.ok) return { success: false, error: parsed.error };
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
  const parsed = parseOrError(
    z.object({ requestId: positiveIntId, reasonCode: z.string(), detail: z.string().max(2000) }),
    { requestId, reasonCode, detail }
  );
  if (!parsed.ok) return { success: false, error: parsed.error };
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
  const parsed = parseOrError(z.object({ requestId: positiveIntId, remark: remarkText }), { requestId, remark });
  if (!parsed.ok) return { success: false, error: parsed.error };
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
  const parsed = parseOrError(z.object({ requestId: positiveIntId, remark: remarkText }), { requestId, remark });
  if (!parsed.ok) return { success: false, error: parsed.error };
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