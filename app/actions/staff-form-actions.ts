'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getStaffSession } from './auth-staff';
import { checkRateLimit } from '@/lib/rate-limit';
import { buildReturnFormPdf } from '../services/pdf-service';

const sanitizeDate = (dateStr: string) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
};

interface ReturnItemInput {
  drug_name: string;
  qty: number;
  unit: string;
  lot_number: string;
  exp_date: string | null;
  value_amount: number;
  invoice_number: string;
}

// ── guard กลาง ใช้ซ้ำทุกฟังก์ชันในไฟล์นี้ ──
// เฉพาะแผนก CSR เท่านั้น ตามที่ตกลงกันไว้ (ไม่ใช่ staff ทุกคนเหมือน WH dashboard)
async function requireCsrSession() {
  const session = await getStaffSession();
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  if (session.department !== 'csr') throw new Error('คุณไม่มีสิทธิ์เข้าถึงส่วนนี้');
  return session;
}

// ── 1. ค้นหาลูกค้าที่มีอยู่แล้วในระบบ เพื่อผูก b2b_customer_id ──
export async function searchB2BCustomers(query: string) {
  const session = await requireCsrSession();

  const cleaned = query?.trim();
  if (!cleaned || cleaned.length < 2) return { success: true, data: [] };
  if (cleaned.length > 100) return { success: false, error: 'คำค้นหายาวเกินไป' };

  const allowed = await checkRateLimit(`search-customer:${session.id}`, 60, 30);
  if (!allowed) return { success: false, error: 'ค้นหาถี่เกินไป กรุณารอสักครู่' };

  // ค้นจากหลายฟิลด์พร้อมกัน — ilike แบบ escape เบื้องต้นกัน wildcard injection จากผู้ใช้
  const escaped = cleaned.replace(/[%_]/g, (m) => `\\${m}`);
  const pattern = `%${escaped}%`;

  const { data, error } = await supabaseAdmin
    .from('b2b_customers')
    .select('id, hospital_name, contact_name, position, phone, email, customer_code')
    .or(
      `hospital_name.ilike.${pattern},contact_name.ilike.${pattern},customer_code.ilike.${pattern},email.ilike.${pattern}`
    )
    .limit(10);

  if (error) {
    console.error('searchB2BCustomers error:', error);
    return { success: false, error: 'ค้นหาไม่สำเร็จ' };
  }

  return { success: true, data: data ?? [] };
}

// ── 2. เลขที่เอกสารถัดไป ฝั่ง staff ──
export async function getStaffNextDocNumber() {
  await requireCsrSession();

  const { data, error } = await supabaseAdmin.rpc('get_latest_doc_number');
  if (error || !data) return 'S001/2026';

  const lastNum = parseInt(data.split('/')[0].replace('S', ''));
  const nextNum = (lastNum + 1).toString().padStart(3, '0');
  return `S${nextNum}/2026`;
}

// ── 3. สร้างคำร้องแทนลูกค้า — ไม่มีลายเซ็น ไม่ส่งอีเมล ──
export async function createStaffReturnRequest(formData: any) {
  const session = await requireCsrSession();

  const allowed = await checkRateLimit(`create-staff-request:${session.id}`, 3600, 30);
  if (!allowed) {
    throw new Error('สร้างคำร้องถี่เกินไป กรุณาลองใหม่ภายหลัง');
  }

  if (!formData.items || formData.items.length === 0) {
    throw new Error('ต้องมีรายการสินค้าอย่างน้อย 1 รายการครับ');
  }
  if (formData.items.length > 5) {
    throw new Error('จำกัดสูงสุด 5 รายการต่อคำร้อง');
  }

  // ★ ต้องมี b2b_customer_id เสมอ — CSR ต้องค้นหา/เลือกลูกค้าจากระบบก่อน (ตามที่ตกลงกันไว้)
  const b2bCustomerId = formData.sender?.b2b_customer_id;
  if (!b2bCustomerId) {
    throw new Error('กรุณาเลือกลูกค้าจากระบบก่อนสร้างคำร้อง');
  }

  // ★ ยืนยันว่าลูกค้าที่เลือกมามีอยู่จริง ไม่เชื่อ id จาก client เฉยๆ
  const { data: customer, error: custErr } = await supabaseAdmin
    .from('b2b_customers')
    .select('id, hospital_name, contact_name, phone, email, position')
    .eq('id', b2bCustomerId)
    .maybeSingle();

  if (custErr || !customer) {
    throw new Error('ไม่พบข้อมูลลูกค้าที่เลือก กรุณาเลือกใหม่');
  }

  const items: ReturnItemInput[] = formData.items.map((item: any): ReturnItemInput => ({
    drug_name: String(item.drugName ?? '').slice(0, 200),
    qty: Math.max(0, Number(item.qty) || 0),
    unit: item.unit || 'ไม่ระบุ',
    lot_number: item.lot || '',
    exp_date: sanitizeDate(item.exp),
    value_amount: Math.max(0, Number(item.val) || 0),
    invoice_number: item.inv || item.invoiceNumber || '',
  }));

  const computedTotal = items.reduce((sum: number, i: { value_amount?: number }) => {
    return sum + (Number(i.value_amount) || 0);
  }, 0);

  const requestData = {
    ref_id: `REF-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
    doc_number: formData.sender.doc_number,
    request_type: formData.sender.request_type,

    // ★ ข้อมูลหน่วยงาน/ผู้ติดต่อ ยึดจากลูกค้าที่ยืนยันว่ามีอยู่จริงในระบบ ไม่ใช่จาก client ตรงๆ
    hospital_name: customer.hospital_name,
    contact_name: customer.contact_name,
    phone: customer.phone,
    customer_email: customer.email,

    return_reason: formData.return_reason,
    delivery_type: formData.delivery_type,
    addr_street: formData.addr_street,
    addr_sub: formData.addr_sub,
    addr_district: formData.addr_district,
    addr_province: formData.addr_province,
    agent_info: formData.agent_info,
    exchange_product_type: formData.exchange_product_type,
    exchange_product_list: formData.exchange_product_list,
    exchange_product_other: formData.exchange_product_other,

    // ★ ไม่มี signature_url / signer_name / signer_position — CSR ไม่มี step เซ็นชื่อ
    //   คอลัมน์เหล่านี้ nullable อยู่แล้ว (ยืนยันจาก schema จริง) ปล่อยว่างได้โดยไม่ error

    total_value: computedTotal,
    request_date: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin.rpc('create_exchange_request', {
    p_b2b_customer_id: b2bCustomerId,
    p_request_data: requestData,
    p_drug_items: items,
    p_created_by_staff_id: session.id,
    p_submission_channel: 'csr_manual',
  });

  if (error) throw error;

  // log ไว้ตาม pattern audit trail เดียวกับที่เห็นใน generatePdfAction / access_logs
  await supabaseAdmin.from('status_logs').insert({
    request_id: data[0].request_id,
    staff_id: session.id,
    department: 'csr',
    status_name: 'สร้างคำร้องแทนลูกค้าโดยเจ้าหน้าที่ CSR',
    actor_type: 'staff',
  });

  return { id: data[0].request_id, refId: data[0].ref_id };
}

// ── 4. Generate PDF ฝั่ง staff — path/audit log แยกจาก customer, ไม่มีขั้นตอนลายเซ็น ──
type PdfActionResult =
  | { success: true; url: string; expiresIn: number; refId: string; docNumber: string | null }
  | { success: false; error: string };

export async function generateStaffPdfAction(requestId: number): Promise<PdfActionResult> {
  const session = await requireCsrSession();

  const allowed = await checkRateLimit(`pdf-staff:${session.id}`, 60, 5);
  if (!allowed) {
    return { success: false, error: 'มีการเรียกดูเอกสารถี่เกินไป กรุณารอสักครู่' };
  }

  const { data: request, error: fetchErr } = await supabaseAdmin
    .from('requests')
    .select('*, drug_items(*)')
    .eq('id', requestId)
    .maybeSingle();

  if (fetchErr || !request) {
    return { success: false, error: 'ไม่พบคำร้องนี้' };
  }

  const { data: existing } = await supabaseAdmin
    .from('document_attachments')
    .select('file_path')
    .eq('request_id', requestId)
    .maybeSingle();

  let filePath = existing?.file_path;

  if (!filePath) {
    // path แยก namespace ด้วย 'staff' แทน customer id เพราะไม่ผูกกับ session ฝั่งลูกค้า
    filePath = `returns/staff/${request.ref_id}.pdf`;

    const pdfBytes = await buildReturnFormPdf(request);

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('return-documents')
      .upload(filePath, pdfBytes, { contentType: 'application/pdf', upsert: true });

    if (uploadErr) {
      console.error('Storage upload failed (staff):', uploadErr);
      return { success: false, error: 'บันทึกไฟล์ไม่สำเร็จ กรุณาลองใหม่' };
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
      staff_remark: 'สร้างเอกสารอัตโนมัติ (CSR flow)',
      actor_type: 'system',
    });
  }

  await supabaseAdmin.from('access_logs').insert({
    actor_type: 'staff',
    staff_id: session.id,
    action: 'generate_pdf',
    request_id: requestId,
  });

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