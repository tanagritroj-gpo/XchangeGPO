'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import * as Sentry from '@sentry/nextjs';
import { getStaffSession } from './auth-staff';
import { checkRateLimit } from '@/lib/rate-limit';
import { buildAndStoreReturnPdf, draftDir, finalDir, resolveVerifiedStamp, type DocKind } from '@/lib/return-form-pdf';
import { bucketForOrgType } from '@/lib/sale-coverage';
import { DrugItemInputSchema, sanitizeFreeText, sanitizeDateOrNull } from '@/lib/return-request-schema';
import type { ReturnFormData, DrugItemEntry } from '../(authenticated)/form/form-types';
import type { RequestRow } from '@/lib/types';
import { sendReturnFormEmail, resolveEmailMode } from '@/lib/send-return-form-email';
import { z } from 'zod';
import { parseOrError, positiveIntId } from '@/lib/validate-input';

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
  unit_price: number;
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

// ── 1. ค้นหาลูกค้าที่มีอยู่แล้วในระบบ (รายคน) — ใช้โดย CustomerPicker.tsx ที่หน้า
// "ค้นหาลูกค้าในระบบ" ของ app/admin/csr/customers/page.tsx (ต้องได้ b2b_customer id ตัวจริง
// เพื่อดูประวัติใบงาน/เอกสารยืนยันของ contact คนนั้นๆ) — ★ ไม่ใช้กับขั้นเลือกหน่วยงานตอน
// กรอกแบบฟอร์มแทนลูกค้าอีกต่อไป (Step1InfoStaff.tsx เปลี่ยนไปใช้ OrganizationPicker.tsx +
// searchOrganizations() จาก csr-actions.ts แทน เพราะขั้นนั้นมองในมุม organization ล้วนๆ)
export async function searchB2BCustomers(query: string) {
  const session = await requireCsrSession();

  const cleaned = query?.trim();
  if (!cleaned || cleaned.length < 2) return { success: true, data: [] };
  if (cleaned.length > 100) return { success: false, error: 'คำค้นหายาวเกินไป' };

  const allowed = await checkRateLimit(`search-customer:${session.id}`, 30, 60);
  if (!allowed.allowed) return { success: false, error: 'ค้นหาถี่เกินไป กรุณารอสักครู่' };

  // ค้นเฉพาะชื่อหน่วยงาน (hospital_name) เท่านั้น — ไม่ลงไปถึงระดับผู้ติดต่อ/รหัสลูกค้า/อีเมลอีกต่อไป
  // ilike แบบ escape เบื้องต้นกัน wildcard injection จากผู้ใช้
  const escaped = cleaned.replace(/[%_]/g, (m) => `\\${m}`);
  const pattern = `%${escaped}%`;

  // ★ hospital_name/customer_code/org_type ตอนนี้ join ผ่าน organizations เสมอ (เจ้าของ
  // ข้อมูลระดับหน่วยงานตัวจริง) ไม่ได้อ่านคอลัมน์ที่ mirror ไว้บน b2b_customers ตรงๆ อีกต่อไป
  const { data, error } = await supabaseAdmin
    .from('b2b_customers')
    .select('id, contact_name, position, phone, email, organizations!inner(hospital_name, customer_code, org_type)')
    .ilike('organizations.hospital_name', pattern)
    .limit(10);

  if (error) {
    console.error('searchB2BCustomers error:', error);
    return { success: false, error: 'ค้นหาไม่สำเร็จ' };
  }

  // แบน organizations ที่ join มาให้เป็น field เดิม (hospital_name/customer_code/org_type)
  // เพื่อไม่ต้องแก้ shape ที่ CustomerPicker.tsx ฝั่ง UI คาดหวังไว้
  const flattened = (data ?? []).map((row) => {
    const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    const { organizations: _omit, ...rest } = row;
    return {
      ...rest,
      hospital_name: org?.hospital_name ?? null,
      customer_code: org?.customer_code ?? null,
      org_type: org?.org_type ?? null,
    };
  });

  return { success: true, data: flattened };
}

// ── 2. เลขที่เอกสารถัดไป ฝั่ง staff — แค่ตัวอย่าง ไม่ได้จองเลขจริง (เหมือน getNextDocNumber
// ฝั่งลูกค้าใน form-actions.ts) เลขจริงเกิดขึ้นแบบ atomic ใน create_exchange_request ตอน
// submit จริงเท่านั้น ──
export async function getStaffNextDocNumber() {
  await requireCsrSession();

  const { data, error } = await supabaseAdmin.rpc('peek_next_doc_number');
  if (error || !data) return 'S001/' + new Date().getFullYear();
  return data;
}

// ── 3. สร้างคำร้องแทนลูกค้า — ไม่มีลายเซ็น ไม่ส่งอีเมล ──
export async function createStaffReturnRequest(formData: ReturnFormData) {
  const session = await requireCsrSession();

  const allowed = await checkRateLimit(`create-staff-request:${session.id}`, 30, 3600);
  if (!allowed.allowed) {
    throw new Error('สร้างคำร้องถี่เกินไป กรุณาลองใหม่ภายหลัง');
  }

  if (!formData.items || formData.items.length === 0) {
    throw new Error('ต้องมีรายการสินค้าอย่างน้อย 1 รายการครับ');
  }
  if (formData.items.length > 5) {
    throw new Error('จำกัดสูงสุด 5 รายการต่อคำร้อง');
  }

  // ★ ต้องมี organization_id เสมอ — CSR ต้องค้นหา/เลือกหน่วยงานจากระบบก่อน (มองในมุม
  // organization ล้วนๆ ไม่ผูกกับ b2b_customer รายคนอีกต่อไป ตามที่ตกลงกันไว้)
  const organizationId = formData.sender?.organization_id;
  if (!organizationId) {
    throw new Error('กรุณาเลือกหน่วยงานจากระบบก่อนสร้างคำร้อง');
  }

  // ★ ยืนยันว่าหน่วยงานที่เลือกมามีอยู่จริง ไม่เชื่อ id จาก client เฉยๆ
  const { data: organization, error: orgErr } = await supabaseAdmin
    .from('organizations')
    .select('id, hospital_name, province, customer_code, org_type')
    .eq('id', organizationId)
    .maybeSingle();

  if (orgErr || !organization) {
    throw new Error('ไม่พบข้อมูลหน่วยงานที่เลือก กรุณาเลือกใหม่');
  }

  // มูลค่ารวมคำนวณจาก จำนวน × ราคาต่อหน่วย ฝั่ง server เสมอ ไม่เชื่อ item.val จาก client ตรงๆ —
  // DrugItemInputSchema (lib/return-request-schema.ts) กัน qty/unit_price ไม่มีขอบเขตบนด้วย
  // (พบระหว่าง security audit 11 ส.ค. 2569 — เดิมกันแค่ติดลบ/NaN) ใช้ schema เดียวกับ
  // form-actions.ts (ฝั่งลูกค้า) ให้ขอบเขตค่าที่ยอมรับตรงกันทั้งสองช่องทาง
  const items: ReturnItemInput[] = formData.items.map((item: DrugItemEntry): ReturnItemInput => {
    const parsed = DrugItemInputSchema.parse(item);
    return {
      drug_name: parsed.drugName,
      qty: parsed.qty,
      unit: parsed.unit,
      lot_number: parsed.lot,
      exp_date: sanitizeDate(parsed.exp),
      unit_price: parsed.unitPrice,
      value_amount: parsed.qty * parsed.unitPrice,
      invoice_number: parsed.inv,
    };
  });

  const computedTotal = items.reduce((sum: number, i: { value_amount?: number }) => {
    return sum + (Number(i.value_amount) || 0);
  }, 0);

  const requestData = {
    ref_id: `REF-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
    // doc_number ไม่รับจาก client อีกต่อไป — create_exchange_request จอง atomic เอง
    request_type: sanitizeFreeText(formData.sender?.request_type),

    // ★ ข้อมูลหน่วยงาน ยึดจาก organization ที่ยืนยันว่ามีอยู่จริงในระบบ ไม่ใช่จาก client ตรงๆ
    // ไม่มี phone/customer_email ของผู้ติดต่อรายคนอีกต่อไป — sendStaffPdfEmailAction จะ
    // ดึงรายชื่อผู้รับอีเมลของหน่วยงานนี้แยกทีหลังจาก customer_code แทน (ดู getOrgContactsForRequest)
    hospital_name: organization.hospital_name,
    customer_code: organization.customer_code,
    province: organization.province,

    // ★ ไม่บันทึกชื่อผู้ติดต่อฝั่งลูกค้าอีกต่อไป (ข้อมูลนั้นอยู่ที่ b2b_customers อยู่แล้ว
    //   ผูกผ่าน b2b_customer_id) — ใช้ contact_name เก็บชื่อพนักงาน CSR ที่กรอกแทนแทน
    //   เพื่อให้ตามหาผู้รับผิดชอบคำร้องนี้ได้จริง แทนป้ายข้อความทั่วไป
    contact_name: session.full_name || session.username,

    // ★ sanitizeFreeText (lib/return-request-schema.ts) ตัดความยาวข้อความอิสระที่ DB ไม่ได้
    //    จำกัดไว้เอง (พบระหว่าง security audit 11 ส.ค. 2569 — เดิมส่งตรงจาก client ไม่มี cap)
    return_reason: sanitizeFreeText(formData.return_reason),
    delivery_type: sanitizeFreeText(formData.delivery_type),
    addr_street: sanitizeFreeText(formData.addr_street),
    addr_sub: sanitizeFreeText(formData.addr_sub),
    addr_district: sanitizeFreeText(formData.addr_district),
    addr_province: sanitizeFreeText(formData.addr_province),
    agent_info: sanitizeFreeText(formData.agent_info),
    agent_appointment_note: sanitizeFreeText(formData.agent_appointment_note),
    agent_appointment_date: sanitizeDateOrNull(formData.agent_appointment_date),
    exchange_product_type: sanitizeFreeText(formData.exchange_product_type),
    exchange_product_list: sanitizeFreeText(formData.exchange_product_list),
    exchange_product_other: sanitizeFreeText(formData.exchange_product_other),

    // ★ ไม่มี signature_url / signer_name / signer_position — CSR ไม่มี step เซ็นชื่อ
    //   คอลัมน์เหล่านี้ nullable อยู่แล้ว (ยืนยันจาก schema จริง) ปล่อยว่างได้โดยไม่ error

    total_value: computedTotal,
    request_date: new Date().toISOString(),
  };

  // ★ p_b2b_customer_id: null โดยตั้งใจ — เลือกแค่ระดับ organization ไม่ได้ผูกกับ b2b_customer
  // รายคนใดรายหนึ่งเป็นการเฉพาะ (หน่วยงานอาจมีหลาย contact/login) การติดตาม/ประวัติระดับ
  // หน่วยงานใช้ customer_code เป็นหลักอยู่แล้ว (get_org_history, tracking ฯลฯ) ไม่ต้องพึ่ง
  // b2b_customer_id ของ CSR-manual requests เลย
  const { data, error } = await supabaseAdmin.rpc('create_exchange_request', {
    p_b2b_customer_id: null,
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

  // แจ้งเตือน Manager/CSR ว่ามีคำร้องใหม่เข้าระบบ เหมือนกับ path ของลูกค้าเอง — ให้ครบทุก
  // ช่องทาง (submission_channel) ไม่ตกหล่นแค่เพราะเป็นใบที่ CSR กรอกแทน — เงียบๆ ถ้าพลาด
  // ไม่ให้กระทบการสร้างคำร้องจริง
  try {
    await supabaseAdmin.from('notification_log').insert({
      type: 'new_request',
      request_id: data[0].request_id,
      ref_id: data[0].ref_id,
      // org_type/province มาจาก organization ที่ยืนยันแล้วด้านบน (ไม่ใช่ query ใหม่) — ใช้
      // กรองให้ Sale เห็นเฉพาะแจ้งเตือนของหน่วยงานในเขตที่ตัวเองดูแล (ดู notification-actions.ts)
      org_type: organization.org_type,
      province: organization.province,
    });
  } catch (notifyErr) {
    console.error('createStaffReturnRequest: failed to log notification', notifyErr);
    Sentry.captureException(notifyErr, { level: 'warning', tags: { area: 'notification-log' } });
  }

  return { id: data[0].request_id, refId: data[0].ref_id };
}

// ── 4. Generate PDF ฝั่ง staff — path/audit log แยกจาก customer, ไม่มีขั้นตอนลายเซ็น ──
type PdfActionResult =
  | { success: true; url: string; expiresIn: number; refId: string; docNumber: string | null }
  | { success: false; error: string };

export async function generateStaffPdfAction(requestId: number): Promise<PdfActionResult> {
  const parsed = parseOrError(z.object({ requestId: positiveIntId }), { requestId });
  if (!parsed.ok) return { success: false, error: parsed.error };
  const session = await requireCsrSession();

  const allowed = await checkRateLimit(`pdf-staff:${session.id}`, 5, 60);
  if (!allowed.allowed) {
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

  // แลกเปลี่ยนที่ยังไม่ผ่านการตรวจ → ฉบับ draft; นอกนั้น → final
  const wantKind: DocKind =
    request.request_type === 'รับคืนแลกเปลี่ยน' && request.current_status === 'pending_review' ? 'draft' : 'final';

  const pickDoc = async (kind: DocKind) =>
    (await supabaseAdmin
      .from('document_attachments')
      .select('file_path')
      .eq('request_id', requestId)
      .eq('kind', kind)
      .maybeSingle()).data?.file_path as string | undefined;

  let filePath = (await pickDoc(wantKind)) ?? (await pickDoc(wantKind === 'draft' ? 'final' : 'draft'));

  if (!filePath) {
    const storageDir = wantKind === 'draft' ? draftDir(request.b2b_customer_id ?? null) : finalDir(request);
    const stamp =
      wantKind === 'draft'
        ? ({ kind: 'draft' } as const)
        : request.request_type === 'รับคืนแลกเปลี่ยน'
          ? await resolveVerifiedStamp(requestId)
          : null;
    try {
      const res = await buildAndStoreReturnPdf(request, { kind: wantKind, storageDir, stamp });
      filePath = res.filePath;
    } catch (buildErr) {
      console.error('buildAndStoreReturnPdf failed (staff):', buildErr);
      Sentry.captureException(buildErr, { tags: { area: 'pdf-upload' } });
      return { success: false, error: 'บันทึกไฟล์ไม่สำเร็จ กรุณาลองใหม่' };
    }

    await supabaseAdmin.from('status_logs').insert({
      request_id: requestId,
      department: 'system',
      status_name: 'document_generated',
      staff_remark: `สร้างเอกสารอัตโนมัติ (CSR flow, ${wantKind})`,
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

// ── 5. รายชื่อผู้ติดต่อ (b2b_customers) ของหน่วยงานที่ผูกกับคำร้องนี้ — ใช้เลือกผู้รับอีเมล
// ในหน้าตรวจสอบ (ReviewSuccessCard) เมื่อหน่วยงานนั้นมี contact/login มากกว่า 1 คน — join
// ผ่าน requests.customer_code (สายเดียวกับที่ยืนยันแล้วว่าถูกต้องในรายงานพอร์ตลูกค้า)
// แยก logic ออกมาเป็น fetchOrgContactsForRequest (ไม่เช็ค session เอง) เพื่อให้
// sendStaffPdfEmailAction เรียกซ้ำได้โดยตรง — ใช้สร้าง allowlist ตรวจ recipientEmails
// ที่ client ส่งมาก่อน insert ลง queue ส่งอีเมลจริง (กัน CSR ส่งเอกสารลูกค้าไปอีเมล
// ภายนอกที่ไม่ใช่ผู้ติดต่อ/sale ของหน่วยงานนั้น)
async function fetchOrgContactsForRequest(requestId: number) {
  const { data: request, error: reqErr } = await supabaseAdmin
    .from('requests')
    .select('customer_code')
    .eq('id', requestId)
    .maybeSingle();

  if (reqErr || !request?.customer_code) {
    return { success: false as const, error: 'ไม่พบรหัสลูกค้าของคำร้องนี้' };
  }

  const { data: contacts, error } = await supabaseAdmin
    .from('b2b_customers')
    .select('id, contact_name, email')
    .eq('customer_code', request.customer_code)
    .order('contact_name', { ascending: true });

  if (error) return { success: false as const, error: error.message };

  const recipients: { id: number | string; contact_name: string | null; email: string }[] = [...(contacts ?? [])];

  // ★ เพิ่ม sale rep ที่ดูแลเขต/ประเภทหน่วยงานนี้ (ถ้ามี) ให้ CSR เลือกแจ้งพร้อมกันตอนส่งอีเมล —
  // จับคู่จาก organizations.org_type/province กับ staff_users.sale_customer_types/
  // sale_provinces ของ sale แต่ละคน — เป็น many-to-many ไม่ใช่ assign ตรง 1 หน่วยงานต่อ 1
  // sale คน (ดู lib/sale-coverage.ts) จึงอาจได้ 0/1/หลายคนก็ได้ ไม่มีใครดูแลก็แค่ไม่โผล่ในลิสต์
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('org_type, province')
    .eq('customer_code', request.customer_code)
    .maybeSingle();

  const bucket = bucketForOrgType(org?.org_type);
  if (bucket && org?.province) {
    const { data: saleReps } = await supabaseAdmin
      .from('staff_users')
      .select('id, full_name, email, sale_customer_types, sale_provinces')
      .eq('department', 'sale')
      .eq('is_approved', true)
      .not('email', 'is', null);

    (saleReps ?? []).forEach((s) => {
      const types = (s.sale_customer_types as string[] | null) ?? [];
      const provinces = (s.sale_provinces as string[] | null) ?? [];
      if (s.email && types.includes(bucket) && provinces.includes(org.province!)) {
        recipients.push({ id: s.id, contact_name: `ฝ่ายขาย — ${s.full_name ?? 'ไม่ระบุชื่อ'}`, email: s.email });
      }
    });
  }

  return { success: true as const, data: recipients };
}

export async function getOrgContactsForRequest(requestId: number) {
  const parsed = parseOrError(z.object({ requestId: positiveIntId }), { requestId });
  if (!parsed.ok) return { success: false as const, error: parsed.error };
  await requireCsrSession();
  return fetchOrgContactsForRequest(requestId);
}

// ── 6. ส่งอีเมลลิงก์ PDF ให้ลูกค้า — CSR เป็นคนกด แต่ต้องส่งไปที่อีเมลลูกค้า ไม่ใช่อีเมล staff ──
// ต่างจาก sendPdfEmailAction เดิม (ฝั่งลูกค้า) ตรงที่: gate ด้วย CSR session แทน customer session,
// และรับ recipientEmails ให้ CSR เลือกได้ว่าจะส่งหา contact คนไหนของหน่วยงาน (หรือทั้งหมด) —
// เพราะขั้นเลือกลูกค้าตอนนี้เลือกแค่ระดับ organization ไม่ได้ผูกกับ contact คนเดียวแล้ว
// (recipientEmails ว่าง/undefined = fallback ไปใช้ requests.customer_email เดิม เผื่อคำร้อง
// เก่าก่อนเปลี่ยน flow นี้ที่ยังมีค่านั้นติดอยู่)
export async function sendStaffPdfEmailAction(requestId: number, recipientEmails?: string[]) {
  const parsed = parseOrError(
    z.object({ requestId: positiveIntId, recipientEmails: z.array(z.string()).optional() }),
    { requestId, recipientEmails }
  );
  if (!parsed.ok) return { success: false, error: parsed.error };
  try {
    const session = await requireCsrSession();

    const allowed = await checkRateLimit(`send-staff-email:${session.id}`, 20, 3600);
    if (!allowed.allowed) {
      return { success: false, error: 'ส่งอีเมลถี่เกินไป กรุณาลองใหม่ภายหลัง' };
    }

    const { data: requestData, error: reqErr } = await supabaseAdmin
      .from('requests')
      .select('*, drug_items(*)')
      .eq('id', requestId)
      .maybeSingle();

    if (reqErr || !requestData) {
      return { success: false, error: 'ไม่พบคำร้องนี้' };
    }
    const request = requestData as RequestRow;

    // ★ recipientEmails มาจาก client — ห้ามเชื่อตรงๆ ต้องกรองผ่าน allowlist ของหน่วยงาน
    // เจ้าของคำร้องนี้ก่อนเสมอ (ผู้ติดต่อจริงใน b2b_customers + sale rep ที่ดูแลเขต — ชุด
    // เดียวกับที่ getOrgContactsForRequest คืนให้ UI เลือก) กัน CSR ที่ login แล้วสั่งส่งลิงก์
    // เอกสาร (มี PII ลูกค้า) ไปอีเมลภายนอกที่ไม่เกี่ยวข้องกับหน่วยงานนี้ได้
    let recipients: string[];
    if (recipientEmails && recipientEmails.length > 0) {
      const contactsResult = await fetchOrgContactsForRequest(requestId);
      const allowlist = new Set(
        (contactsResult.success ? contactsResult.data : []).map((c) => c.email.trim().toLowerCase())
      );
      recipients = recipientEmails.filter((email) => allowlist.has(email.trim().toLowerCase()));
    } else {
      recipients = request.customer_email ? [request.customer_email] : [];
    }

    if (recipients.length === 0) {
      return { success: false, error: 'ไม่มีอีเมลผู้รับ กรุณาเลือกผู้รับก่อนส่ง' };
    }

    // ── phase 1 (ack) vs phase 2/ปกติ ──
    // ใบงานแลกเปลี่ยนที่ CSR กรอกแทน: ตราบใดที่ยังไม่ผ่านการตรวจ compliance (current_status
    // ยังเป็น pending_review) การส่งอีเมลจากหน้านี้ = "แจ้งรับเรื่อง" (ack — ไม่มีลิงก์ PDF
    // เพราะเอกสารยังเป็นฉบับ draft) + จำ recipients ไว้ให้ email #2 (verified) ที่
    // deliverVerifiedExchangeDoc ส่งไปชุดเดียวกันอัตโนมัติหลัง CSR อนุมัติ/ปฏิเสธรายการ
    const isExchange = request.request_type === 'รับคืนแลกเปลี่ยน';
    const ackPhase = isExchange && request.current_status === 'pending_review';
    const mode = ackPhase ? 'ack' : resolveEmailMode(request);

    if (ackPhase) {
      // จำ recipients ที่ CSR เลือก ให้ email #2 (verified) ส่งไปชุดเดียวกันอัตโนมัติ
      await supabaseAdmin.from('requests').update({ notify_emails: recipients }).eq('id', requestId);
    } else if (isExchange && request.submission_channel === 'csr_manual' && !(request.notify_emails?.length)) {
      // ส่งเอกสารฉบับตรวจสอบแล้วย้อนหลัง (CSR ไม่ได้เลือกผู้รับตอนแจ้งรับเรื่อง หรือตอนนั้นส่งไม่ผ่าน)
      // — บันทึกผู้รับไว้เป็นหลักฐาน และเคลียร์ banner "เอกสารรอส่ง" หน้า dashboard
      await supabaseAdmin.from('requests').update({ notify_emails: recipients }).eq('id', requestId);
    }

    if (!ackPhase) {
      // ส่งฉบับจริง (มีลิงก์ PDF) ต้องมีเอกสารฉบับสมบูรณ์ (kind='final') อยู่แล้ว —
      // ยังไม่ได้สร้าง = แจ้งให้กดสร้างเอกสารก่อน (ข้อความเดียวกับ sendPdfEmailAction ฝั่งลูกค้า)
      const { data: finalDoc } = await supabaseAdmin
        .from('document_attachments')
        .select('file_path')
        .eq('request_id', requestId)
        .eq('kind', 'final')
        .maybeSingle();
      if (!finalDoc?.file_path) {
        return { success: false, error: 'ไม่พบไฟล์เอกสาร กรุณาสร้างเอกสาร PDF ก่อนส่งอีเมล' };
      }
    }

    // ★ ส่งแยกทีละฉบับต่อผู้รับ (ไม่ยัดทุกคนรวมกันใน to[] เดียว) กันผู้รับเห็นอีเมลกันเอง
    const results = await Promise.all(
      recipients.map((email) =>
        sendReturnFormEmail({ request, to: email, mode, preparedByStaff: true }).then((r) => ({ email, ok: !r.error })),
      )
    );

    const sentEmails = results.filter((r) => r.ok).map((r) => r.email);
    if (sentEmails.length === 0) {
      console.error('Resend API Error (staff, all recipients failed):', results);
      // ★ ส่งแค่จำนวนผู้รับที่พลาด ไม่ส่ง results ทั้งก้อนเพราะมี email จริงของผู้รับฝังอยู่
      Sentry.captureMessage('send staff pdf email: all recipients failed', {
        level: 'error',
        tags: { area: 'send-staff-pdf-email' },
        extra: { requestId, recipientCount: results.length },
      });
      return { success: false, error: 'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่ภายหลัง' };
    }

    // exchange (non-ack) = ส่งเอกสารฉบับตรวจสอบแล้ว → ลง 'document_sent' ให้ตรงกับ
    // deliverVerifiedExchangeDoc (invariant เดียวกัน: มี log นี้ = เอกสารถึงลูกค้าแล้ว)
    await supabaseAdmin.from('status_logs').insert({
      request_id: requestId,
      department: 'system',
      status_name: ackPhase ? 'ack_email_sent' : isExchange ? 'document_sent' : 'email_sent',
      staff_remark: ackPhase
        ? `เจ้าหน้าที่ CSR ส่งอีเมลแจ้งรับเรื่องไปยัง ${sentEmails.join(', ')} — รอตรวจสอบรายการสินค้า`
        : `เจ้าหน้าที่ CSR ส่งเอกสารไปยังอีเมล ${sentEmails.join(', ')} เรียบร้อยแล้ว`,
      actor_type: 'system',
    });

    await supabaseAdmin.from('access_logs').insert({
      actor_type: 'staff',
      staff_id: session.id,
      action: 'send_pdf_email',
      request_id: requestId,
    });

    return {
      success: true,
      message: sentEmails.length < results.length
        ? `ส่งอีเมลสำเร็จ ${sentEmails.length}/${results.length} ฉบับ`
        : 'ส่งอีเมลสำเร็จแล้ว',
    };
  } catch (err: unknown) {
    console.error('Send Staff Email Catch Error:', err);
    Sentry.captureException(err, { tags: { area: 'send-staff-pdf-email' } });
    return { success: false, error: 'ระบบขัดข้อง กรุณาลองใหม่ภายหลัง' };
  }
}