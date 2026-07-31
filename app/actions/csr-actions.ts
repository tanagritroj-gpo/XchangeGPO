'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getStaffSession } from './auth-staff';
import { revalidatePath } from 'next/cache';
import { isRejectionReasonCode, buildRejectionRemark } from '@/lib/rejection-reasons';
import { buildRegistrationConfirmationPdf } from '@/app/services/registration-pdf-service';
import { checkRateLimit } from '@/lib/rate-limit';
import { Resend } from 'resend';

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
  action: (session: any) => Promise<T>
): Promise<T | { success: false; error: string }> {
  try {
    const session = await getCSRSession();
    return await action(session);
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getCSRDashboardData() {
  try {
    await getCSRSession();

    const { data: clients, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('*')
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

  } catch (e: any) {
    console.error("DEBUG - Catch Error:", e.message);
    return { success: false, error: e.message };
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
      const { data: newCustomer, error: insertErr } = await supabaseAdmin
        .from('b2b_customers')
        .insert({
          email: client.email,
          hospital_name: client.hospital_name,
          phone: client.phone,
          contact_name: client.contact_name,
          position: client.position,
          customer_code: customerCode!.trim(),
          province: client.province,
        })
        .select('id')
        .single();

      if (insertErr) {
        // ★ ย้อน clients.status กลับ 'pending' — ไม่งั้น client จะค้างที่ 'approved'
        // ทั้งที่ไม่มี b2b_customer จริงผูกอยู่เลย (update ข้างบนกับ insert นี้เป็นคนละ
        // statement ไม่ใช่ transaction เดียวกัน ถ้า insert พังแล้วปล่อย status ค้างไว้
        // จะกลายเป็นข้อมูลขัดแย้งแบบเดียวกับที่เจอใน client เก่าที่หลุดมาก่อนหน้านี้)
        // เกิดได้ทั้งจาก race ที่ guard ข้างบนไม่ได้ครอบคลุม (เช่น อีเมลนี้ชนกับ
        // b2b_customers แถวอื่นที่มีอยู่ก่อนแล้วจริงๆ ไม่ใช่แค่ client แถวเดียวกันขอซ้ำ)
        await supabaseAdmin.from('clients').update({ status: 'pending' }).eq('id', clientId);

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
        await generateRegistrationDocument(client, customerCode!.trim(), session);
      } catch (docErr) {
        console.error('generateRegistrationDocument failed (non-blocking):', docErr);
      }
    }

    revalidatePath('/admin/csr/customers');
    return { success: true };

  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// สร้าง PDF ยืนยันการลงทะเบียน อัปโหลดเก็บไว้ใน bucket + document_attachments แล้วส่ง
// อีเมลแจ้งลูกค้า — เรียกจาก reviewClient() เฉพาะตอนอนุมัติเท่านั้น ไม่ throw ออกไปเอง
// (caller เป็นคนคุม try/catch ไม่ให้กระทบผลอนุมัติ)
async function generateRegistrationDocument(client: any, customerCode: string, session: any) {
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

export async function approveDrugItem(drugItemId: number, requestId: number, remark?: string) {
  return withCSRAuth(async (session) => {
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
    const { data: pendingItems } = await supabaseAdmin.from('drug_items').select('id').eq('request_id', requestId).in('current_status', ['pending_review']);
    if (pendingItems && pendingItems.length > 0) throw new Error("ยังมีรายการยาที่ยังไม่ได้อนุมัติ");
    await supabaseAdmin.from('status_logs').insert({ request_id: requestId, staff_id: session.id, department: 'csr', status_name: 'approved', staff_remark: remark || 'อนุมัติใบงาน' });
    await supabaseAdmin.from('requests').update({ current_status: 'approved', updated_at: new Date().toISOString() }).eq('id', requestId);
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
    await supabaseAdmin.from('requests').update({ current_status: 'rejected', updated_at: new Date().toISOString() }).eq('id', requestId);
    await supabaseAdmin.from('drug_items').update({ current_status: 'rejected' }).eq('request_id', requestId);
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function startExchangeProcess(requestId: number, remark?: string) {
  return withCSRAuth(async (session) => {
    const { data: items } = await supabaseAdmin.from('drug_items').select('id, current_status').eq('request_id', requestId);
    const activeItems = items?.filter(i => i.current_status !== 'rejected') ?? [];
    if (activeItems.length > 0) await supabaseAdmin.from('status_logs').insert(activeItems.map(i => ({ request_id: requestId, drug_item_id: i.id, staff_id: session.id, department: 'csr', status_name: 'exchanging', staff_remark: remark || 'เริ่มแลกเปลี่ยน' })));
    await supabaseAdmin.from('requests').update({ current_status: 'exchanging', updated_at: new Date().toISOString() }).eq('id', requestId);
    await supabaseAdmin.from('drug_items').update({ current_status: 'exchanging' }).eq('request_id', requestId).neq('current_status', 'rejected');
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function completeRequest(requestId: number, remark?: string) {
  return withCSRAuth(async (session) => {
    await supabaseAdmin.from('status_logs').insert({ request_id: requestId, staff_id: session.id, department: 'csr', status_name: 'completed', staff_remark: remark || 'งานเสร็จสิ้น' });
    await supabaseAdmin.from('requests').update({ current_status: 'completed', updated_at: new Date().toISOString() }).eq('id', requestId);
    await supabaseAdmin.from('drug_items').update({ current_status: 'completed' }).eq('request_id', requestId).neq('current_status', 'rejected');
    revalidatePath('/admin/csr/dashboard');
    return { success: true };
  });
}

export async function updateDrugCompliance(itemId: number, pType: string, compliance: { pass: boolean, msg: string }) {
  return withCSRAuth(async () => {
    await supabaseAdmin
      .from('drug_items')
      .update({
        product_type: pType,
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
  } catch (e: any) {
    console.error('getCustomerRequestHistory error:', e.message);
    return { success: false, error: e.message };
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
      (request.drug_items ?? []).map((i: any) => [i.id, i.drug_name])
    );

    const timeline = (timelineRaw ?? []).map((t) => ({
      ...t,
      drug_name: t.drug_item_id != null ? drugNameById[t.drug_item_id] ?? null : null,
    }));

    return { success: true, data: { ...request, timeline } };
  } catch (e: any) {
    console.error('getStaffRequestDetail error:', e.message);
    return { success: false, error: e.message };
  }
}