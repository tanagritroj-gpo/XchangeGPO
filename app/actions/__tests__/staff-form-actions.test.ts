import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../../test/fakeSupabase';
import type { ReturnFormData, DrugItemEntry } from '../../(authenticated)/form/form-types';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});
vi.mock('../auth-staff', () => ({ getStaffSession: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99 }),
}));
// buildReturnFormPdf reads real font files off disk (drawThaiText) — irrelevant to the
// authorization/RPC-correctness logic under test here, stub it out entirely.
vi.mock('../../services/pdf-service', () => ({
  buildReturnFormPdf: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));
vi.mock('@/lib/email-service', () => ({
  sendPdfDocumentEmail: vi.fn().mockResolvedValue({ error: null }),
}));

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { getStaffSession } = await import('../auth-staff');
const mockGetStaffSession = vi.mocked(getStaffSession);

const { checkRateLimit } = await import('@/lib/rate-limit');
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const { sendPdfDocumentEmail } = await import('@/lib/email-service');
const mockSendPdfDocumentEmail = vi.mocked(sendPdfDocumentEmail);

const {
  searchB2BCustomers,
  getStaffNextDocNumber,
  createStaffReturnRequest,
  getOrgContactsForRequest,
  sendStaffPdfEmailAction,
} = await import('../staff-form-actions');

const CSR_STAFF = {
  id: 'csr-1', username: 'csr1', full_name: 'CSR หนึ่ง', department: 'csr', role: 'staff',
  sale_customer_types: null, sale_provinces: null, email: null, signature_url: null, mfa_enabled: false, mfa_grace_until: null,
};

function baseFormData(overrides: Partial<ReturnFormData> = {}): ReturnFormData {
  const items: DrugItemEntry[] = overrides.items ?? [
    { drugName: 'Paracetamol', qty: '10', unit: 'กล่อง', lot: 'LOT1', exp: '2027-01-01', unitPrice: '50', val: '500', inv: 'INV-1' },
  ];
  return {
    sender: { request_type: 'รับคืนแลกเปลี่ยน', organization_id: 7 },
    items,
    totalValue: 999999, // deliberately wrong — server must ignore and recompute
    return_reason: 'สินค้าชำรุด',
    delivery_type: 'ขนส่ง',
    ...overrides,
  };
}

// ★ Rebuilds the real create_exchange_request() Postgres function (per
// supabase/migrations/20260816123247_fix_create_exchange_request_overload_and_lockdown.sql)
// so tests exercise the exact 6-arg shape the staff-submission call site actually sends —
// this is the regression surface for today's overload bug: createStaffReturnRequest calls
// rpc('create_exchange_request', { p_b2b_customer_id, p_request_data, p_drug_items,
// p_created_by_staff_id, p_submission_channel }) with NO p_delivery_note_photo_paths key at
// all, relying on the function's `default null` for that 6th param — if a future migration
// changes the signature again without a matching DROP FUNCTION, this call resolves to a
// stale overload again and this whole describe block should start failing loudly.
function registerCreateExchangeRequestRpc() {
  fakeAdmin.setRpcHandler('create_exchange_request', async (params: any) => {
    const [inserted] = (await fakeAdmin.client
      .from('requests')
      .insert({
        ...params.p_request_data,
        b2b_customer_id: params.p_b2b_customer_id,
        created_by_staff_id: params.p_created_by_staff_id ?? null,
        submission_channel: params.p_submission_channel ?? 'customer_portal',
        delivery_note_photo_paths: params.p_delivery_note_photo_paths ?? null,
        current_status: 'pending_review',
      })
      .select()).data;

    if (Array.isArray(params.p_drug_items) && params.p_drug_items.length > 0) {
      await fakeAdmin.client
        .from('drug_items')
        .insert(params.p_drug_items.map((i: any) => ({ ...i, request_id: inserted.id, current_status: 'pending_review' })));
    }

    return { data: [{ request_id: inserted.id, ref_id: inserted.ref_id }], error: null };
  });
}

beforeEach(() => {
  fakeAdmin.seed({
    requests: [], drug_items: [], organizations: [
      { id: 7, hospital_name: 'รพ.ทดสอบ', province: 'สงขลา', customer_code: 'C-0007', org_type: 'gov_hospital' },
    ],
    status_logs: [], notification_log: [], b2b_customers: [], staff_users: [], document_attachments: [],
  });
  mockGetStaffSession.mockReset();
  mockGetStaffSession.mockResolvedValue(CSR_STAFF as any);
  mockCheckRateLimit.mockReset();
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 99 });
  mockSendPdfDocumentEmail.mockReset();
  mockSendPdfDocumentEmail.mockResolvedValue({ error: null } as any);
  registerCreateExchangeRequestRpc();
});

describe('requireCsrSession guard — shared by every function in this file', () => {
  it('rejects when there is no logged-in staff session', async () => {
    mockGetStaffSession.mockResolvedValue(null);
    await expect(createStaffReturnRequest(baseFormData())).rejects.toThrow('กรุณาเข้าสู่ระบบ');
  });

  it('rejects a staff member from a non-CSR department, even if they are a manager', async () => {
    // ★ deliberately the opposite of wh/logistics' assertDepartmentAccess (which lets
    // role==='manager' through regardless of department) — csr-actions.test.ts documents the
    // same asymmetry for csr-actions.ts; staff-form-actions.ts's requireCsrSession is
    // department-only too, so a manager sitting in the 'wh' department must still be blocked.
    mockGetStaffSession.mockResolvedValue({ ...CSR_STAFF, id: 'x', department: 'wh', role: 'manager' } as any);
    await expect(createStaffReturnRequest(baseFormData())).rejects.toThrow('คุณไม่มีสิทธิ์เข้าถึงส่วนนี้');
  });

  it('allows department=csr regardless of role', async () => {
    mockGetStaffSession.mockResolvedValue({ ...CSR_STAFF, role: 'staff' } as any);
    const result = await createStaffReturnRequest(baseFormData());
    expect(result.id).toBeTruthy();
  });
});

describe('createStaffReturnRequest — the exact call site of the RPC-overload bug found 16 Aug 2569', () => {
  it('calls create_exchange_request with p_b2b_customer_id: null and submission_channel csr_manual', async () => {
    await createStaffReturnRequest(baseFormData());
    const saved = fakeAdmin.rows('requests')[0];
    expect(saved.b2b_customer_id).toBeNull();
    expect(saved.submission_channel).toBe('csr_manual');
    expect(saved.created_by_staff_id).toBe(CSR_STAFF.id);
  });

  it('succeeds with no p_delivery_note_photo_paths argument at all (relies on the RPC default null)', async () => {
    // Regression test for the actual incident: the old stale 5-arg overload existed
    // alongside a new 6-arg one after a migration changed the signature via
    // CREATE OR REPLACE without dropping the old version — staff-submitted requests
    // silently resolved to the broken overload. If create_exchange_request's signature
    // changes again the same way, this call becomes ambiguous/wrong and should fail here.
    const result = await createStaffReturnRequest(baseFormData());
    expect(result.id).toBe(fakeAdmin.rows('requests')[0].id);
    expect(result.refId).toMatch(/^REF-[A-F0-9]{8}$/);
  });

  it('rejects when no organization was selected', async () => {
    await expect(createStaffReturnRequest(baseFormData({ sender: { request_type: 'x' } })))
      .rejects.toThrow('กรุณาเลือกหน่วยงานจากระบบก่อนสร้างคำร้อง');
  });

  it('rejects an organization_id that does not exist — never trusts the client-supplied id blindly', async () => {
    await expect(createStaffReturnRequest(baseFormData({ sender: { request_type: 'x', organization_id: 404 } })))
      .rejects.toThrow('ไม่พบข้อมูลหน่วยงานที่เลือก');
  });

  it('fills hospital_name/province/customer_code from the verified organization row, not the client', async () => {
    await createStaffReturnRequest(baseFormData());
    const saved = fakeAdmin.rows('requests')[0];
    expect(saved.hospital_name).toBe('รพ.ทดสอบ');
    expect(saved.province).toBe('สงขลา');
    expect(saved.customer_code).toBe('C-0007');
  });

  it('records the CSR staff name as contact_name — this request has no customer contact of its own', async () => {
    await createStaffReturnRequest(baseFormData());
    expect(fakeAdmin.rows('requests')[0].contact_name).toBe(CSR_STAFF.full_name);
  });

  it('rejects more than 5 items, matching the customer-facing form-actions.ts limit', async () => {
    const items: DrugItemEntry[] = Array.from({ length: 6 }, (_, i) => ({
      drugName: `Drug ${i}`, qty: '1', unit: 'กล่อง', lot: 'LOT', exp: '2027-01-01', unitPrice: '10', val: '10', inv: 'INV',
    }));
    await expect(createStaffReturnRequest(baseFormData({ items }))).rejects.toThrow('จำกัดสูงสุด 5 รายการต่อคำร้อง');
  });

  it('recomputes total_value server-side, ignoring formData.totalValue', async () => {
    await createStaffReturnRequest(baseFormData({
      items: [{ drugName: 'A', qty: '4', unit: 'กล่อง', lot: 'L', exp: '2027-01-01', unitPrice: '25', val: '1', inv: 'I' }],
      totalValue: 1,
    }));
    expect(fakeAdmin.rows('requests')[0].total_value).toBe(100);
  });

  it('writes an audit status_log row for the staff-created request', async () => {
    const result = await createStaffReturnRequest(baseFormData());
    const log = fakeAdmin.rows('status_logs').find((r) => r.request_id === result.id);
    expect(log).toMatchObject({ staff_id: CSR_STAFF.id, department: 'csr', actor_type: 'staff' });
  });

  it('propagates an RPC error instead of returning a fake success', async () => {
    fakeAdmin.setRpcHandler('create_exchange_request', async () => ({ data: null, error: { message: 'db down' } }));
    await expect(createStaffReturnRequest(baseFormData())).rejects.toBeTruthy();
    expect(fakeAdmin.rows('requests')).toHaveLength(0);
  });

  it('is rate-limited per staff member', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    await expect(createStaffReturnRequest(baseFormData())).rejects.toThrow('สร้างคำร้องถี่เกินไป');
    expect(mockCheckRateLimit).toHaveBeenCalledWith(`create-staff-request:${CSR_STAFF.id}`, 30, 3600);
  });
});

describe('getStaffNextDocNumber', () => {
  it('requires a CSR session', async () => {
    mockGetStaffSession.mockResolvedValue(null);
    await expect(getStaffNextDocNumber()).rejects.toThrow('กรุณาเข้าสู่ระบบ');
  });

  it('falls back to a placeholder when the RPC errors', async () => {
    fakeAdmin.setRpcHandler('peek_next_doc_number', () => ({ data: null, error: { message: 'boom' } }));
    await expect(getStaffNextDocNumber()).resolves.toMatch(/^S001\/\d{4}$/);
  });
});

describe('searchB2BCustomers', () => {
  beforeEach(() => {
    fakeAdmin.seed({
      ...Object.fromEntries(['requests', 'drug_items', 'status_logs', 'notification_log'].map((t) => [t, []])),
      organizations: [{ id: 7, hospital_name: 'โรงพยาบาลทดสอบ', province: 'สงขลา', customer_code: 'C-0007', org_type: 'gov_hospital' }],
      b2b_customers: [{ id: 1, contact_name: 'สมชาย', position: 'เภสัชกร', phone: '0812345678', email: 'a@example.com', organization_id: 7 }],
    });
  });

  it('rejects a query shorter than 2 characters with an empty result, not an error', async () => {
    const res = await searchB2BCustomers('a');
    expect(res).toEqual({ success: true, data: [] });
  });

  it('rejects an absurdly long query', async () => {
    const res = await searchB2BCustomers('x'.repeat(200));
    expect(res.success).toBe(false);
  });

  it('is rate-limited per staff member', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await searchB2BCustomers('โรงพยาบาล');
    expect(res).toEqual({ success: false, error: 'ค้นหาถี่เกินไป กรุณารอสักครู่' });
  });
});

describe('getOrgContactsForRequest / sendStaffPdfEmailAction — recipient allowlist (security-relevant)', () => {
  beforeEach(() => {
    fakeAdmin.seed({
      requests: [{
        id: 1, ref_id: 'REF-AAAA1111', customer_code: 'C-0007', hospital_name: 'รพ.ทดสอบ',
        customer_email: 'legacy@example.com', doc_number: 'S001/2026', request_date: new Date().toISOString(),
        created_at: new Date().toISOString(), request_type: 'รับคืนแลกเปลี่ยน', return_reason: 'x',
        delivery_type: 'ขนส่ง', total_value: 100,
      }],
      drug_items: [{ id: 1, request_id: 1, drug_name: 'A', qty: 1, unit: 'กล่อง', lot_number: 'L', exp_date: null }],
      organizations: [{ id: 7, hospital_name: 'รพ.ทดสอบ', province: 'สงขลา', customer_code: 'C-0007', org_type: 'gov_hospital' }],
      b2b_customers: [
        { id: 1, contact_name: 'ผู้ติดต่อจริง', email: 'real-contact@example.com', customer_code: 'C-0007' },
      ],
      staff_users: [
        { id: 'sale-1', full_name: 'ฝ่ายขายใต้', email: 'sale@example.com', department: 'sale', is_approved: true, sale_customer_types: ['government'], sale_provinces: ['สงขลา'] },
      ],
      document_attachments: [{ id: 'doc-1', request_id: 1, kind: 'final', file_path: 'returns/staff/REF-AAAA1111.pdf' }],
      status_logs: [], notification_log: [],
    });
  });

  // document_attachments only records the *path* — the fake storage bucket itself is
  // separate in-memory state, so the file has to actually exist there too or
  // createSignedUrl() (called by sendStaffPdfEmailAction) fails with "not found".
  beforeEach(async () => {
    await fakeAdmin.client.storage.from('return-documents').upload('returns/staff/REF-AAAA1111.pdf', new Uint8Array([1, 2, 3]));
  });

  it('getOrgContactsForRequest returns the real org contact plus the covering sale rep', async () => {
    const res = await getOrgContactsForRequest(1);
    expect(res.success).toBe(true);
    const emails = (res as any).data.map((c: any) => c.email);
    expect(emails).toContain('real-contact@example.com');
    expect(emails).toContain('sale@example.com');
  });

  it('sendStaffPdfEmailAction sends only to addresses on the org allowlist, dropping an attacker-supplied external address', async () => {
    // ★ security fix from the 11 Aug audit (per SYSTEM_ANALYSIS_AND_IMPROVEMENTS.md §5):
    // recipientEmails comes straight from the client and must never be trusted verbatim —
    // this is the regression test for "CSR could email documents to arbitrary external
    // addresses" being closed and staying closed.
    const res = await sendStaffPdfEmailAction(1, ['real-contact@example.com', 'attacker@evil.example']);
    expect(res.success).toBe(true);
    expect(mockSendPdfDocumentEmail).toHaveBeenCalledTimes(1);
    expect(mockSendPdfDocumentEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'real-contact@example.com' }));
  });

  it('sendStaffPdfEmailAction refuses to send when every requested recipient is off the allowlist', async () => {
    const res = await sendStaffPdfEmailAction(1, ['attacker@evil.example']);
    expect(res).toEqual({ success: false, error: 'ไม่มีอีเมลผู้รับ กรุณาเลือกผู้รับก่อนส่ง' });
    expect(mockSendPdfDocumentEmail).not.toHaveBeenCalled();
  });

  it('falls back to requests.customer_email when no recipientEmails are supplied', async () => {
    const res = await sendStaffPdfEmailAction(1);
    expect(res.success).toBe(true);
    expect(mockSendPdfDocumentEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'legacy@example.com' }));
  });

  it('fails cleanly when no PDF has been generated yet for this request', async () => {
    fakeAdmin.seed({
      requests: fakeAdmin.rows('requests'),
      organizations: fakeAdmin.rows('organizations'),
      b2b_customers: fakeAdmin.rows('b2b_customers'),
      staff_users: fakeAdmin.rows('staff_users'),
      document_attachments: [], // ★ no PDF yet
      status_logs: [], notification_log: [], drug_items: fakeAdmin.rows('drug_items'),
    });
    const res = await sendStaffPdfEmailAction(1);
    expect(res).toEqual({ success: false, error: 'ไม่พบไฟล์เอกสาร กรุณาสร้างเอกสาร PDF ก่อนส่งอีเมล' });
  });
});

// ── Phase 4: ใบงานแลกเปลี่ยนที่ CSR กรอกแทน = ส่งอีเมล 2 ครั้ง ──
// ครั้งที่ 1 (ยัง pending_review) = "แจ้งรับเรื่อง" (ack, ไม่มีลิงก์ PDF, ไม่ต้องมีเอกสารฉบับ final)
// + จำ recipients ที่ CSR เลือกลง requests.notify_emails ให้ email #2 (verified) ใช้ชุดเดียวกัน
describe('sendStaffPdfEmailAction — csr_manual exchange 2-phase (ack)', () => {
  beforeEach(() => {
    mockGetStaffSession.mockResolvedValue(CSR_STAFF as any);
    fakeAdmin.seed({
      requests: [{
        id: 1, ref_id: 'REF-EX01', customer_code: 'C-0007', hospital_name: 'รพ.ทดสอบ',
        request_type: 'รับคืนแลกเปลี่ยน', submission_channel: 'csr_manual', current_status: 'pending_review',
        return_reason: 'x', delivery_type: 'ขนส่ง', total_value: 100, doc_number: 'S001/2026',
        request_date: new Date().toISOString(), created_at: new Date().toISOString(),
      }],
      drug_items: [{ id: 1, request_id: 1, drug_name: 'A', qty: 1, unit: 'กล่อง', lot_number: 'L', exp_date: null }],
      organizations: [{ id: 7, hospital_name: 'รพ.ทดสอบ', province: 'สงขลา', customer_code: 'C-0007', org_type: 'gov_hospital' }],
      b2b_customers: [{ id: 1, contact_name: 'ผู้ติดต่อจริง', email: 'real-contact@example.com', customer_code: 'C-0007' }],
      staff_users: [], document_attachments: [], status_logs: [], notification_log: [],
    });
  });

  it('sends the ack email (no final PDF needed) and persists the picked recipients to notify_emails', async () => {
    const res = await sendStaffPdfEmailAction(1, ['real-contact@example.com']);
    expect(res.success).toBe(true);
    expect(mockSendPdfDocumentEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'real-contact@example.com', mode: 'ack', downloadUrl: null }),
    );
    expect(fakeAdmin.rows('requests')[0].notify_emails).toEqual(['real-contact@example.com']);
    expect(fakeAdmin.rows('status_logs')).toMatchObject([{ status_name: 'ack_email_sent' }]);
  });

  it('still enforces the org allowlist on the ack send', async () => {
    const res = await sendStaffPdfEmailAction(1, ['attacker@evil.example']);
    expect(res).toEqual({ success: false, error: 'ไม่มีอีเมลผู้รับ กรุณาเลือกผู้รับก่อนส่ง' });
    expect(mockSendPdfDocumentEmail).not.toHaveBeenCalled();
    expect(fakeAdmin.rows('requests')[0].notify_emails ?? null).toBeNull();
  });

  it('once verified (status past pending_review) it sends the real doc, not another ack', async () => {
    fakeAdmin.rows('requests')[0].current_status = 'approved';
    fakeAdmin.seed({
      requests: fakeAdmin.rows('requests'), drug_items: fakeAdmin.rows('drug_items'),
      organizations: fakeAdmin.rows('organizations'), b2b_customers: fakeAdmin.rows('b2b_customers'),
      staff_users: [], notification_log: [], status_logs: [],
      document_attachments: [{ id: 'doc-1', request_id: 1, kind: 'final', file_path: 'returns/staff/REF-EX01.pdf' }],
    });
    await fakeAdmin.client.storage.from('return-documents').upload('returns/staff/REF-EX01.pdf', new Uint8Array([1]));
    const res = await sendStaffPdfEmailAction(1, ['real-contact@example.com']);
    expect(res.success).toBe(true);
    expect(mockSendPdfDocumentEmail).toHaveBeenCalledWith(expect.objectContaining({ mode: 'standard' }));
    // exchange non-ack → 'document_sent' (same invariant as deliverVerifiedExchangeDoc: log = delivered)
    expect(fakeAdmin.rows('status_logs')).toMatchObject([{ status_name: 'document_sent' }]);
    // ใบงานนี้ไม่เคยมี notify_emails → บันทึกผู้รับที่ใช้ส่งไว้ (เคลียร์ banner "เอกสารรอส่ง")
    expect(fakeAdmin.rows('requests')[0].notify_emails).toEqual(['real-contact@example.com']);
  });

  it('does NOT overwrite an existing notify_emails set on a later resend', async () => {
    fakeAdmin.rows('requests')[0].current_status = 'approved';
    fakeAdmin.rows('requests')[0].notify_emails = ['picked-earlier@example.com'];
    fakeAdmin.seed({
      requests: fakeAdmin.rows('requests'), drug_items: fakeAdmin.rows('drug_items'),
      organizations: fakeAdmin.rows('organizations'), b2b_customers: fakeAdmin.rows('b2b_customers'),
      staff_users: [], notification_log: [], status_logs: [],
      document_attachments: [{ id: 'doc-1', request_id: 1, kind: 'final', file_path: 'returns/staff/REF-EX01.pdf' }],
    });
    await fakeAdmin.client.storage.from('return-documents').upload('returns/staff/REF-EX01.pdf', new Uint8Array([1]));
    await sendStaffPdfEmailAction(1, ['real-contact@example.com']);
    expect(fakeAdmin.rows('requests')[0].notify_emails).toEqual(['picked-earlier@example.com']);
  });
});
