import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { buildAndStoreReturnPdf, finalDir } from '@/lib/return-form-pdf';
import { sendReturnFormEmail, resolveEmailMode } from '@/lib/send-return-form-email';
import { saleEmailsForCustomerCode } from '@/lib/sale-reps';
import { resolveStaffSignaturePng } from '@/lib/resolve-signature';
import type { RequestRow, StaffSessionInfo } from '@/lib/types';

type VerifyingStaff = Pick<StaffSessionInfo, 'id' | 'full_name' | 'signature_url'>;

type ComplianceFields = {
  product_type: string | null;
  is_compliant: boolean | null;
  compliance_remark: string | null;
};

const norm = (v: unknown): string | null => (v == null || v === '' ? null : String(v));

// เขียน audit ของการตรวจ compliance ราย item → status_logs('compliance_checked') 1 row
// (data_correction_logs.status_log_id เป็น NOT NULL จึงต้องมี status log ผูก) + data_correction_logs
// 1 row ต่อ field ที่เปลี่ยนจริง (product_type / is_compliant / compliance_remark)
export async function logComplianceCorrection(params: {
  requestId: number;
  drugItemId: number;
  staffId: string;
  before: ComplianceFields;
  after: ComplianceFields;
}): Promise<void> {
  const fields: (keyof ComplianceFields)[] = ['product_type', 'is_compliant', 'compliance_remark'];
  const changed = fields
    .filter((f) => norm(params.before[f]) !== norm(params.after[f]))
    .map((f) => ({ field_name: f, old_value: norm(params.before[f]), new_value: norm(params.after[f]) }));
  if (changed.length === 0) return;

  const { data: log, error: logErr } = await supabaseAdmin
    .from('status_logs')
    .insert({
      request_id: params.requestId,
      drug_item_id: params.drugItemId,
      staff_id: params.staffId,
      department: 'csr',
      status_name: 'compliance_checked',
      actor_type: 'staff',
      staff_remark: params.after.compliance_remark || 'ตรวจหลักเกณฑ์การรับคืน/แลกเปลี่ยนสินค้า',
    })
    .select('id')
    .single();
  if (logErr || !log) throw logErr ?? new Error('compliance status_logs insert failed');

  const reason = params.after.compliance_remark || 'ตรวจหลักเกณฑ์การรับคืน/แลกเปลี่ยนสินค้า';
  const { error: dcErr } = await supabaseAdmin.from('data_correction_logs').insert(
    changed.map((c) => ({
      request_id: params.requestId,
      status_log_id: log.id,
      drug_item_id: params.drugItemId,
      field_name: c.field_name,
      old_value: c.old_value,
      new_value: c.new_value,
      reason,
      staff_id: params.staffId,
    })),
  );
  if (dcErr) throw dcErr;
}

// บันทึกว่า CSR อนุมัติ item ที่ไม่ผ่านเกณฑ์ (ฝืนกฎ) — 1 data_correction_logs row ผูกกับ
// status_logs ของการอนุมัติที่ approveDrugItem สร้างไว้แล้ว
export async function logComplianceOverride(params: {
  requestId: number;
  drugItemId: number;
  statusLogId: number;
  staffId: string;
  complianceRemark: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('data_correction_logs').insert({
    request_id: params.requestId,
    status_log_id: params.statusLogId,
    drug_item_id: params.drugItemId,
    field_name: 'compliance_override',
    old_value: 'is_compliant=false',
    new_value: 'approved',
    reason: `อนุมัตินอกเกณฑ์: ${params.complianceRemark || 'ไม่ระบุ'}`,
    staff_id: params.staffId,
  });
  if (error) throw error;
}

// สร้าง verified PDF (kind='final') + ส่ง email #2 ให้ลูกค้า + CC sale — ครั้งเดียว
// เรียกจาก approveRequest / rejectRequest ตอน pending_review → X (เฉพาะแลกเปลี่ยน + customer_portal)
// best-effort: ไม่ throw ให้กระทบการเปลี่ยนสถานะ — return null ถ้าไม่เข้าเงื่อนไข/พลาด
export async function deliverVerifiedExchangeDoc(
  requestId: number,
  staff: VerifyingStaff,
): Promise<{ emailedTo: string[] } | null> {
  const staffId = staff.id;
  try {
    const { data } = await supabaseAdmin
      .from('requests')
      .select('*, drug_items(*), b2b_customers(email)')
      .eq('id', requestId)
      .single();
    if (!data) return null;

    const bc = Array.isArray(data.b2b_customers) ? data.b2b_customers[0] : data.b2b_customers;
    const req = data as RequestRow;

    if (req.request_type !== 'รับคืนแลกเปลี่ยน') return null;

    // กันส่งซ้ำ (retry / action ถูกเรียกซ้ำ)
    const { count } = await supabaseAdmin
      .from('status_logs')
      .select('id', { count: 'exact', head: true })
      .eq('request_id', requestId)
      .eq('status_name', 'document_sent');
    if ((count ?? 0) > 0) return null;

    // 1. สร้างเอกสารฉบับสมบูรณ์ (verified — ขีดคร่อมรายการ is_compliant=false, ยอดหัก reject)
    //    + กล่องกำกับ "ผ่านการตรวจสอบแล้ว" + ลายเซ็น CSR + วันที่ตรวจสอบ (มุมขวาล่าง)
    await buildAndStoreReturnPdf(req, {
      kind: 'final',
      storageDir: finalDir(req),
      stamp: {
        kind: 'verified',
        byName: staff.full_name || 'เจ้าหน้าที่ CSR',
        at: new Date().toISOString(),
        signaturePng: await resolveStaffSignaturePng(staff.signature_url),
      },
    });

    // 2. ผู้รับ:
    //    - customer_portal → ลูกค้า (customer_email) + sale ที่ดูแลหน่วยงาน (อัตโนมัติเสมอ)
    //    - csr_manual      → ชุดอีเมลที่ CSR เลือกไว้ตอนส่ง "แจ้งรับเรื่อง" (requests.notify_emails)
    const recipients = new Set<string>();
    if (req.submission_channel === 'csr_manual') {
      for (const e of req.notify_emails ?? []) if (e) recipients.add(e);
    } else {
      const customerEmail = req.customer_email || (bc as { email?: string | null } | null)?.email || null;
      if (customerEmail) recipients.add(customerEmail);
      for (const e of await saleEmailsForCustomerCode(req.customer_code)) recipients.add(e);
    }

    // ไม่มีผู้รับ (csr_manual ที่ CSR ยังไม่ได้ส่งแจ้งรับเรื่อง/ไม่ได้เลือกใคร) — สร้างเอกสารไว้แล้ว
    // แต่ไม่ส่งอีเมลและไม่ log document_sent เพื่อให้ CSR ส่งเองภายหลังได้ (ปุ่ม "ส่งเอกสารให้ลูกค้า" หน้า dashboard)
    if (recipients.size === 0) return { emailedTo: [] };

    const mode = resolveEmailMode(req);
    // csr_manual: เอกสารจัดทำโดยเจ้าหน้าที่ CSR — สะท้อนในเนื้อความอีเมล (กรณี mode='standard'
    // ที่ทุกรายการผ่านเกณฑ์; mode='verified' ใช้เนื้อความ "ตรวจสอบแล้ว" อยู่แล้วไม่ขึ้นกับ flag นี้)
    const preparedByStaff = req.submission_channel === 'csr_manual';
    const emailedTo: string[] = [];
    for (const to of recipients) {
      const { error } = await sendReturnFormEmail({ request: req, to, mode, preparedByStaff });
      if (error) {
        console.error(`deliverVerifiedExchangeDoc: email to ${to} failed`, error);
        Sentry.captureException(error, { level: 'warning', tags: { area: 'exchange-verified-email' } });
      } else {
        emailedTo.push(to);
      }
    }

    // ทุกผู้รับส่งไม่สำเร็จ — ไม่ลง document_sent (invariant: มี log นี้ = เอกสารถึงลูกค้าอย่างน้อย 1 คน
    // ให้ปุ่ม "ส่งเอกสารให้ลูกค้า" หน้า dashboard เห็นว่ายังค้างและส่งซ้ำได้)
    if (emailedTo.length === 0) return { emailedTo: [] };

    // 3. audit
    await supabaseAdmin.from('status_logs').insert({
      request_id: requestId,
      staff_id: staffId,
      department: 'csr',
      status_name: 'document_sent',
      actor_type: 'staff',
      staff_remark: `ส่งเอกสารฉบับตรวจสอบแล้วให้ลูกค้าทางอีเมล (${emailedTo.join(', ')})`,
    });
    await supabaseAdmin.from('access_logs').insert({
      actor_type: 'staff',
      staff_id: staffId,
      action: 'send_pdf_email',
      request_id: requestId,
    });

    return { emailedTo };
  } catch (err) {
    console.error('deliverVerifiedExchangeDoc failed', err);
    Sentry.captureException(err, { level: 'warning', tags: { area: 'exchange-verified-doc' } });
    return null;
  }
}
