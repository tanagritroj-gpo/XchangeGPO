import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../../test/fakeSupabase';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});
vi.mock('../auth-staff', () => ({ getStaffSession: vi.fn() }));
// reviewClient() ตอนอนุมัติ trigger สร้างเอกสาร+ส่งอีเมลเป็น side-effect (non-blocking) —
// mock resend กันไม่ให้ Resend constructor throw ตอน import (ต้องการ API key จริง)
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: vi.fn().mockResolvedValue({ data: { id: 'test' }, error: null }) };
  },
}));

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { getStaffSession } = await import('../auth-staff');
const mockGetStaffSession = vi.mocked(getStaffSession);

const {
  approveRequest,
  rejectRequest,
  startExchangeProcess,
  completeRequest,
  reviewClient,
  getRegistrationDocumentUrl,
} = await import('../csr-actions');

const CSR_STAFF = { id: 'csr-1', username: 'csr-1', full_name: 'Test Staff', department: 'csr', role: 'staff', sale_customer_types: null, sale_provinces: null, email: null };

function seedRequest(
  requestId: number,
  items: { id: number; current_status: string }[],
  requestStatus = 'pending_review',
  requestType?: string,
) {
  fakeAdmin.seed({
    requests: [{ id: requestId, current_status: requestStatus, request_type: requestType ?? null }],
    drug_items: items.map((i) => ({ ...i, request_id: requestId })),
    status_logs: [],
    clients: [],
    b2b_customers: [],
  });
}

beforeEach(() => {
  mockGetStaffSession.mockReset();
  mockGetStaffSession.mockResolvedValue(CSR_STAFF);
});

describe('authorization guard uses department, not role — unlike wh/logistics', () => {
  it('rejects a "manager role" session whose department is not csr or manager', async () => {
    // Deliberately the mirror image of wh/logistics' "role==='manager' always
    // wins" guard: csr-actions checks department only. A staff member who
    // somehow has role='manager' but department='wh' must still be rejected
    // here, even though the same session would pass the WH/logistics guard.
    mockGetStaffSession.mockResolvedValue({ id: 'x', username: 'x', full_name: 'Test Staff', department: 'wh', role: 'manager', sale_customer_types: null, sale_provinces: null, email: null });
    seedRequest(1, [{ id: 1, current_status: 'approved' }]);
    const res = await approveRequest(1);
    expect(res).toEqual({ success: false, error: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
  });

  it('allows department=manager', async () => {
    mockGetStaffSession.mockResolvedValue({ id: 'mgr-1', username: 'mgr-1', full_name: 'Test Staff', department: 'manager', role: 'manager', sale_customer_types: null, sale_provinces: null, email: null });
    seedRequest(1, [{ id: 1, current_status: 'approved' }]);
    const res = await approveRequest(1);
    expect(res.success).toBe(true);
  });
});

describe('approveRequest — blocked while any item is still unreviewed', () => {
  it('refuses to approve while an item sits at pending_review', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'approved' },
      { id: 2, current_status: 'pending_review' },
    ]);

    const res = await approveRequest(1);

    expect(res).toEqual({ success: false, error: 'ยังมีรายการยาที่ยังไม่ได้อนุมัติ' });
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('pending_review');
  });

  it('approves once nothing is left pending_review', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'approved' },
      { id: 2, current_status: 'rejected' },
    ]);

    const res = await approveRequest(1);

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('approved');
  });

  // Live bug: a request whose every item got rejected one-by-one (rejectDrugItem)
  // still ended up with current_status='approved' when the CSR closed out the
  // review step, because this function only checked for pending_review items —
  // it never checked whether anything actually survived to be approved. That
  // left fully-rejected requests stuck showing as active/in-progress work.
  it('closes the request as rejected (not approved) when every item ended up rejected', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'rejected' },
      { id: 2, current_status: 'rejected' },
    ]);

    const res = await approveRequest(1);

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('rejected');
  });
});

describe('rejectRequest — cascades to every item regardless of current status', () => {
  it('force-rejects items that were already approved', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'approved' },
      { id: 2, current_status: 'pending_review' },
    ]);

    const res = await rejectRequest(1, 'customer_cancelled', 'ลูกค้ายกเลิก');

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('rejected');
    expect(fakeAdmin.rows('drug_items').every((i) => i.current_status === 'rejected')).toBe(true);
    expect(fakeAdmin.rows('status_logs')[0].rejection_reason_code).toBe('customer_cancelled');
  });

  it('refuses to reject without a valid structured reason', async () => {
    seedRequest(1, [{ id: 1, current_status: 'approved' }]);
    const res = await rejectRequest(1, 'not-a-real-reason', 'whatever');
    expect(res).toEqual({ success: false, error: 'กรุณาเลือกเหตุผลที่ปฏิเสธ' });
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('pending_review');
  });
});

describe('startExchangeProcess / completeRequest — spare already-rejected items', () => {
  it('moves only non-rejected items into exchanging for "รับคืนแลกเปลี่ยน" requests', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'approved' },
      { id: 2, current_status: 'rejected' },
    ], 'approved', 'รับคืนแลกเปลี่ยน');

    const res = await startExchangeProcess(1);

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('exchanging');
    expect(fakeAdmin.rows('drug_items').find((i) => i.id === 1)?.current_status).toBe('exchanging');
    expect(fakeAdmin.rows('drug_items').find((i) => i.id === 2)?.current_status).toBe('rejected');
  });

  it('moves non-rejected items into credit_note for non-exchange request types', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'approved' },
      { id: 2, current_status: 'rejected' },
    ], 'approved', 'รับคืนลดหนี้');

    const res = await startExchangeProcess(1);

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('credit_note');
    expect(fakeAdmin.rows('drug_items').find((i) => i.id === 1)?.current_status).toBe('credit_note');
    expect(fakeAdmin.rows('drug_items').find((i) => i.id === 2)?.current_status).toBe('rejected');
    expect(fakeAdmin.rows('status_logs').find((l) => l.drug_item_id === 1)?.staff_remark).toBe('เริ่มลดหนี้');
  });

  it('completes only non-rejected items', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'exchanging' },
      { id: 2, current_status: 'rejected' },
    ], 'exchanging');

    const res = await completeRequest(1);

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('completed');
    expect(fakeAdmin.rows('drug_items').find((i) => i.id === 1)?.current_status).toBe('completed');
    expect(fakeAdmin.rows('drug_items').find((i) => i.id === 2)?.current_status).toBe('rejected');
  });

  it('closes the request as rejected instead of moving to exchanging when every item is rejected', async () => {
    seedRequest(1, [
      { id: 1, current_status: 'rejected' },
      { id: 2, current_status: 'rejected' },
    ], 'approved', 'รับคืนแลกเปลี่ยน');

    const res = await startExchangeProcess(1);

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('rejected');
  });

  it('closes the request as rejected instead of completing when every item is rejected', async () => {
    seedRequest(1, [{ id: 1, current_status: 'rejected' }], 'exchanging');

    const res = await completeRequest(1);

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('requests')[0].current_status).toBe('rejected');
  });
});

describe('reviewClient — approval provisions a real b2b_customer', () => {
  function seedClient() {
    fakeAdmin.seed({
      clients: [{
        id: 'client-1',
        email: 'hospital@example.com',
        hospital_name: 'รพ.ทดสอบ',
        phone: '0800000000',
        contact_name: 'สมชาย',
        position: 'เภสัชกร',
        status: 'pending',
      }],
      b2b_customers: [],
      requests: [],
      drug_items: [],
      status_logs: [],
    });
  }

  it('creates a b2b_customer (with the CSR-entered customer_code) and links it back on approval', async () => {
    seedClient();

    const res = await reviewClient('client-1', 'approved', 'CUST-001');

    expect(res.success).toBe(true);
    const client = fakeAdmin.rows('clients')[0];
    expect(client.status).toBe('approved');
    expect(fakeAdmin.rows('b2b_customers')).toHaveLength(1);
    expect(fakeAdmin.rows('b2b_customers')[0].email).toBe('hospital@example.com');
    expect(fakeAdmin.rows('b2b_customers')[0].customer_code).toBe('CUST-001');
    expect(client.b2b_customer_id).toBe(fakeAdmin.rows('b2b_customers')[0].id);
  });

  it('refuses to approve without a customer_code', async () => {
    seedClient();

    const res = await reviewClient('client-1', 'approved');

    expect(res).toEqual({ success: false, error: 'กรุณาระบุรหัสลูกค้าก่อนอนุมัติ' });
    expect(fakeAdmin.rows('clients')[0].status).toBe('pending');
    expect(fakeAdmin.rows('b2b_customers')).toHaveLength(0);
  });

  it('does not provision a customer on rejection', async () => {
    seedClient();

    const res = await reviewClient('client-1', 'rejected');

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('clients')[0].status).toBe('rejected');
    expect(fakeAdmin.rows('b2b_customers')).toHaveLength(0);
  });

  // ลูกค้าจริงรายงานว่ากดอนุมัติแล้วเจอ "duplicate key value violates unique
  // constraint b2b_customers_email_key" — สาเหตุ: reviewClient() เดิม update
  // clients.status โดยไม่เช็คว่าแถวยังเป็น 'pending' อยู่ไหม ทำให้คำขอซ้อนกัน (กดปุ่ม
  // ซ้ำ/สอง tab) แข่งกัน insert เข้า b2b_customers ด้วย email เดียวกันจนชน unique
  // constraint แทนที่จะได้ error ที่อ่านรู้เรื่อง
  it('refuses to re-process a client that is no longer pending', async () => {
    seedClient();
    await reviewClient('client-1', 'approved', 'CUST-001');

    const res = await reviewClient('client-1', 'approved', 'CUST-002');

    expect(res).toEqual({ success: false, error: 'ลูกค้ารายนี้ถูกดำเนินการไปแล้ว กรุณารีเฟรชหน้าจอ' });
    // ต้องไม่มีแถวที่สองถูก insert ซ้ำ
    expect(fakeAdmin.rows('b2b_customers')).toHaveLength(1);
  });

  it('only lets one of two concurrent approvals on the same client through', async () => {
    seedClient();

    const [a, b] = await Promise.all([
      reviewClient('client-1', 'approved', 'CUST-001'),
      reviewClient('client-1', 'approved', 'CUST-002'),
    ]);

    const successes = [a, b].filter((r) => r.success);
    expect(successes).toHaveLength(1);
    expect(fakeAdmin.rows('b2b_customers')).toHaveLength(1);
  });

  // Live bug found by the user: after this exact client was approved once, its
  // `clients` row got deleted/reset for re-testing and re-registered with the
  // same email, so a fresh pending client can end up with an email that
  // already belongs to a *different* b2b_customers row (not itself). That's
  // not the same-row race the previous two tests cover — this is a genuine
  // unique-email collision, and the old code left clients.status stuck at
  // 'approved' with no b2b_customer_id when the insert below failed.
  it('reverts status back to pending if the email already belongs to another b2b_customer', async () => {
    seedClient();
    fakeAdmin.seed({
      clients: [{
        id: 'client-1',
        email: 'hospital@example.com',
        hospital_name: 'รพ.ทดสอบ',
        phone: '0800000000',
        contact_name: 'สมชาย',
        position: 'เภสัชกร',
        status: 'pending',
      }],
      b2b_customers: [{ email: 'hospital@example.com', hospital_name: 'รพ.เก่า', customer_code: 'OLD-001' }],
      requests: [],
      drug_items: [],
      status_logs: [],
    });

    const res = await reviewClient('client-1', 'approved', 'CUST-001');

    expect(res).toEqual({ success: false, error: 'อีเมลนี้มีข้อมูลลูกค้าอยู่ในระบบแล้ว กรุณาตรวจสอบก่อนอนุมัติซ้ำ' });
    // ต้องย้อนกลับเป็น 'pending' ไม่ใช่ค้างที่ 'approved' ทั้งที่ไม่มี b2b_customer ผูกอยู่
    expect(fakeAdmin.rows('clients')[0].status).toBe('pending');
    expect(fakeAdmin.rows('clients')[0].b2b_customer_id).toBeUndefined();
    // ต้องไม่มีแถวใหม่ถูก insert ซ้ำ — มีแค่แถวเดิมที่ seed ไว้
    expect(fakeAdmin.rows('b2b_customers')).toHaveLength(1);
    expect(fakeAdmin.rows('b2b_customers')[0].customer_code).toBe('OLD-001');
  });
});

describe('reviewClient — registration confirmation document (approval side-effect)', () => {
  function seedClient() {
    fakeAdmin.seed({
      clients: [{
        id: 'client-1',
        email: 'hospital@example.com',
        hospital_name: 'รพ.ทดสอบ',
        province: 'สงขลา',
        phone: '0800000000',
        contact_name: 'สมชาย',
        position: 'เภสัชกร',
        status: 'pending',
        pdpa_consented_at: '2026-07-01T00:00:00.000Z',
        signature_url: null,
      }],
      b2b_customers: [],
      document_attachments: [],
      requests: [],
      drug_items: [],
      status_logs: [],
    });
  }

  it('generates and stores a PDF, and links it via document_attachments.client_id', async () => {
    seedClient();

    const res = await reviewClient('client-1', 'approved', 'CUST-001');

    expect(res.success).toBe(true);
    const docs = fakeAdmin.rows('document_attachments');
    expect(docs).toHaveLength(1);
    expect(docs[0].client_id).toBe('client-1');
    expect(docs[0].file_path).toBe('registration/client-1.pdf');
  });

  it('still reports approval success even if document generation throws', async () => {
    seedClient();
    // ทำให้ storage.upload พังกลางทาง (เช่น สมมุติ Supabase Storage ล่มชั่วคราว) —
    // การอนุมัติ (b2b_customers + customer_code) ต้องสำเร็จอยู่ดี ไม่ใช่ fire-and-forget
    // แต่ต้อง "ไม่ throw ทะลุออกมา" ต่างหาก
    const uploadSpy = vi
      .spyOn(fakeAdmin.client.storage.from('registration-documents'), 'upload')
      .mockRejectedValue(new Error('storage down'));

    const res = await reviewClient('client-1', 'approved', 'CUST-002');

    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('b2b_customers')[0].customer_code).toBe('CUST-002');
    expect(fakeAdmin.rows('document_attachments')).toHaveLength(0);

    uploadSpy.mockRestore();
  });

  // Live bug: a PDF got uploaded to registration-documents successfully, but
  // the document_attachments insert that links it back silently failed — the
  // old code never checked that insert's error, so the file became permanently
  // unreachable (getRegistrationDocumentUrl only looks it up via
  // document_attachments.client_id) with zero trace in the logs.
  it('surfaces (and does not swallow) a failure in the document_attachments insert', async () => {
    seedClient();
    const originalFrom = fakeAdmin.client.from.bind(fakeAdmin.client);
    const fromSpy = vi.spyOn(fakeAdmin.client, 'from').mockImplementation((table: string) => {
      if (table === 'document_attachments') {
        return { insert: () => ({ then: (resolve: any) => resolve({ data: null, error: { message: 'insert failed' } }) }) } as any;
      }
      return originalFrom(table);
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await reviewClient('client-1', 'approved', 'CUST-003');

    // การอนุมัติ (b2b_customers + customer_code) ต้องสำเร็จอยู่ดี
    expect(res.success).toBe(true);
    expect(fakeAdmin.rows('b2b_customers')[0].customer_code).toBe('CUST-003');
    // แต่ความล้มเหลวต้องถูก log ไว้ ไม่ใช่หายไปเฉยๆ
    expect(errorSpy).toHaveBeenCalledWith(
      'generateRegistrationDocument failed (non-blocking):',
      expect.objectContaining({ message: 'insert failed' }),
    );

    fromSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('getRegistrationDocumentUrl', () => {
  it('returns a signed url for an already-generated document', async () => {
    fakeAdmin.seed({
      clients: [{ id: 'client-1', b2b_customer_id: 42 }],
      document_attachments: [{ id: 'doc-1', client_id: 'client-1', file_path: 'registration/client-1.pdf' }],
    });
    // ไฟล์ต้องมีอยู่จริงใน fake storage ก่อน ถึงจะสร้าง signed url ได้
    await fakeAdmin.client.storage.from('registration-documents').upload('registration/client-1.pdf', new Uint8Array([1, 2, 3]));

    const res: any = await getRegistrationDocumentUrl(42);

    expect(res.success).toBe(true);
    expect(res.url).toContain('registration/client-1.pdf');
  });

  it('errors when no clients row links back to this b2b_customer_id', async () => {
    fakeAdmin.seed({ clients: [], document_attachments: [] });

    const res: any = await getRegistrationDocumentUrl(999);

    expect(res).toEqual({ success: false, error: 'ไม่พบข้อมูลการลงทะเบียนของลูกค้ารายนี้' });
  });

  it('errors when the client exists but no document was generated yet', async () => {
    fakeAdmin.seed({
      clients: [{ id: 'client-2', b2b_customer_id: 7 }],
      document_attachments: [],
    });

    const res: any = await getRegistrationDocumentUrl(7);

    expect(res).toEqual({ success: false, error: 'ยังไม่มีเอกสารสำหรับลูกค้ารายนี้' });
  });
});
