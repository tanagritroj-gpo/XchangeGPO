import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../../test/fakeSupabase';
import type { ReturnFormData, DrugItemEntry } from '../../(authenticated)/form/form-types';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});
vi.mock('../auth-actions', () => ({ getCustomerSession: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99 }),
}));

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { getCustomerSession } = await import('../auth-actions');
const mockGetCustomerSession = vi.mocked(getCustomerSession);

const { checkRateLimit } = await import('@/lib/rate-limit');
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const { createReturnRequest, getNextDocNumber } = await import('../form-actions');

const CUSTOMER_SESSION = {
  id: 42,
  email: 'hospital@example.com',
  hospital_name: 'รพ.ทดสอบ',
  contact_name: 'สมชาย',
  customer_code: 'C-0042',
  phone: '0812345678',
  position: 'เภสัชกร',
  province: 'สงขลา',
};

// ★ real PNG/JPEG/WEBP magic bytes at the front, padded to whatever size the test needs —
// matchesImageMagicBytes() in form-actions.ts only inspects the first few bytes, so this is
// enough to exercise the real validation path without shipping an actual image fixture.
function pngDataUri(sizeBytes = 100): string {
  const buf = Buffer.alloc(Math.max(sizeBytes, 8), 0);
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47;
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function baseFormData(overrides: Partial<ReturnFormData> = {}): ReturnFormData {
  const items: DrugItemEntry[] = overrides.items ?? [
    { drugName: 'Paracetamol', qty: '10', unit: 'กล่อง', lot: 'LOT1', exp: '2027-01-01', unitPrice: '50', val: '500', inv: 'INV-1' },
  ];
  return {
    sender: { request_type: 'รับคืนแลกเปลี่ยน', hospital_name: 'รพ.ทดสอบ' },
    items,
    signature_url: pngDataUri(200),
    signer_name: 'สมชาย',
    signer_position: 'เภสัชกร',
    totalValue: 999999, // ★ deliberately wrong — server must ignore this and recompute
    return_reason: 'สินค้าชำรุด',
    delivery_type: 'ขนส่ง',
    ...overrides,
  };
}

// ★ Rebuilds what the real Postgres function create_exchange_request() does (per
// supabase/migrations/20260816123247_fix_create_exchange_request_overload_and_lockdown.sql):
// insert into requests, insert each drug_items row, return [{request_id, ref_id}]. Registered
// fresh in beforeEach so every test exercises the exact real insert/shape, not a stubbed return.
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
  fakeAdmin.seed({ requests: [], drug_items: [], organizations: [], notification_log: [] });
  mockGetCustomerSession.mockReset();
  mockGetCustomerSession.mockResolvedValue(CUSTOMER_SESSION as any);
  mockCheckRateLimit.mockReset();
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 99 });
  registerCreateExchangeRequestRpc();
});

describe('createReturnRequest — auth and rate limiting', () => {
  it('rejects when there is no logged-in customer session', async () => {
    mockGetCustomerSession.mockResolvedValue(null);
    await expect(createReturnRequest(baseFormData())).rejects.toThrow('กรุณาเข้าสู่ระบบก่อนส่งแบบฟอร์ม');
  });

  it('rejects when the customer is rate-limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    await expect(createReturnRequest(baseFormData())).rejects.toThrow('ส่งคำร้องถี่เกินไป');
    expect(mockCheckRateLimit).toHaveBeenCalledWith(`create-request:${CUSTOMER_SESSION.id}`, 10, 3600);
  });
});

describe('createReturnRequest — item count guard', () => {
  it('rejects an empty item list', async () => {
    await expect(createReturnRequest(baseFormData({ items: [] }))).rejects.toThrow('ต้องมีรายการสินค้าอย่างน้อย 1 รายการ');
  });

  it('rejects more than 5 items — must match the client-side MAX in Step2Items.tsx', async () => {
    const items: DrugItemEntry[] = Array.from({ length: 6 }, (_, i) => ({
      drugName: `Drug ${i}`, qty: '1', unit: 'กล่อง', lot: 'LOT', exp: '2027-01-01', unitPrice: '10', val: '10', inv: 'INV',
    }));
    await expect(createReturnRequest(baseFormData({ items }))).rejects.toThrow('จำกัดสูงสุด 5 รายการต่อคำร้อง');
  });
});

describe('createReturnRequest — signature validation', () => {
  it('rejects a signature that is not a PNG data URI', async () => {
    await expect(createReturnRequest(baseFormData({ signature_url: 'https://evil.example/not-a-data-uri.png' })))
      .rejects.toThrow('ข้อมูลลายเซ็นไม่ถูกต้อง');
  });

  it('rejects a signature over the 2MB cap', async () => {
    await expect(createReturnRequest(baseFormData({ signature_url: pngDataUri(3 * 1024 * 1024) })))
      .rejects.toThrow('ไฟล์ลายเซ็นมีขนาดใหญ่เกินไป');
  });
});

describe('createReturnRequest — server never trusts client-supplied identity or money fields', () => {
  it('uses the session b2b_customer_id/email/customer_code/province, ignoring anything on formData.sender', async () => {
    const formData = baseFormData({
      sender: {
        request_type: 'รับคืนแลกเปลี่ยน',
        b2b_customer_id: 999999, // ★ attacker-controlled value if this ever leaked through
        customer_email: 'attacker@evil.example',
      } as any,
    });

    await createReturnRequest(formData);

    const saved = fakeAdmin.rows('requests')[0];
    expect(saved.b2b_customer_id).toBe(CUSTOMER_SESSION.id);
    expect(saved.customer_email).toBe(CUSTOMER_SESSION.email);
    expect(saved.customer_code).toBe(CUSTOMER_SESSION.customer_code);
    expect(saved.province).toBe(CUSTOMER_SESSION.province);
  });

  it('recomputes total_value server-side from qty*unitPrice, ignoring formData.totalValue', async () => {
    const formData = baseFormData({
      items: [
        { drugName: 'A', qty: '3', unit: 'กล่อง', lot: 'L1', exp: '2027-01-01', unitPrice: '100', val: '999', inv: 'I1' },
        { drugName: 'B', qty: '2', unit: 'กล่อง', lot: 'L2', exp: '2027-01-01', unitPrice: '50', val: '1', inv: 'I2' },
      ],
      totalValue: 1, // deliberately wrong
    });

    await createReturnRequest(formData);

    // 3*100 + 2*50 = 400 — never 1 or 999 from the client
    expect(fakeAdmin.rows('requests')[0].total_value).toBe(400);
  });

  it('clamps an absurd qty/unitPrice instead of trusting the client (DrugItemInputSchema upper bound)', async () => {
    const formData = baseFormData({
      items: [{ drugName: 'A', qty: '99999999', unit: 'กล่อง', lot: 'L1', exp: '2027-01-01', unitPrice: '99999999999', val: '1', inv: 'I1' }],
    });

    await createReturnRequest(formData);

    const item = fakeAdmin.rows('drug_items')[0];
    expect(item.qty).toBeLessThanOrEqual(100_000);
    expect(item.unit_price).toBeLessThanOrEqual(10_000_000);
  });
});

describe('createReturnRequest — delivery note photos (request-level, customer-only feature)', () => {
  it('passes null to the RPC when no photos were attached', async () => {
    await createReturnRequest(baseFormData({ deliveryNotePhotoUrls: [] }));
    expect(fakeAdmin.rows('requests')[0].delivery_note_photo_paths).toBeNull();
  });

  it('uploads each photo and stores their paths on the request, not the raw base64', async () => {
    const uploadSpy = vi.spyOn(fakeAdmin.client.storage.from('return-documents'), 'upload');

    await createReturnRequest(baseFormData({ deliveryNotePhotoUrls: [pngDataUri(500), pngDataUri(500)] }));

    // 3, not 2 — createReturnRequest also uploads the signature to the same bucket first
    expect(uploadSpy).toHaveBeenCalledTimes(3);
    const paths: string[] = fakeAdmin.rows('requests')[0].delivery_note_photo_paths;
    expect(paths).toHaveLength(2);
    for (const p of paths) {
      expect(p).toMatch(/^delivery-notes\/42\/REF-[A-F0-9]+-\d+\.png$/);
      expect(p).not.toContain('base64');
    }
  });

  it('rejects more than 5 photos instead of silently truncating (regression: used to .slice() silently)', async () => {
    const urls = Array.from({ length: 6 }, () => pngDataUri(100));
    await expect(createReturnRequest(baseFormData({ deliveryNotePhotoUrls: urls })))
      .rejects.toThrow('แนบรูปใบส่งของได้สูงสุด 5 รูปต่อคำร้อง');
  });

  it('rejects a photo over the 2MB cap', async () => {
    await expect(createReturnRequest(baseFormData({ deliveryNotePhotoUrls: [pngDataUri(3 * 1024 * 1024)] })))
      .rejects.toThrow('ไฟล์รูปใบส่งของมีขนาดใหญ่เกินไป');
  });

  it('rejects a data URI whose declared MIME type does not match the real file bytes (magic-byte check)', async () => {
    // ★ security-relevant: a spoofed "data:image/png;base64,..." prefix wrapped around
    // non-image bytes must not slip through — this is the exact gap the code review flagged
    // and form-actions.ts's matchesImageMagicBytes() was added to close.
    const fakeBytes = Buffer.alloc(50, 0x41); // all 'A' bytes — not a real PNG signature
    const spoofed = `data:image/png;base64,${fakeBytes.toString('base64')}`;
    await expect(createReturnRequest(baseFormData({ deliveryNotePhotoUrls: [spoofed] })))
      .rejects.toThrow('รูปใบส่งของไม่ถูกต้อง');
  });

  it('rejects a data URI with an unsupported MIME type', async () => {
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg></svg>').toString('base64')}`;
    await expect(createReturnRequest(baseFormData({ deliveryNotePhotoUrls: [svg] })))
      .rejects.toThrow('รูปใบส่งของไม่ถูกต้อง');
  });
});

describe('createReturnRequest — RPC failure propagates instead of silently succeeding', () => {
  it('throws when create_exchange_request returns an error', async () => {
    fakeAdmin.setRpcHandler('create_exchange_request', async () => ({
      data: null,
      error: { message: 'simulated db failure' },
    }));
    await expect(createReturnRequest(baseFormData())).rejects.toBeTruthy();
    expect(fakeAdmin.rows('requests')).toHaveLength(0);
  });
});

describe('createReturnRequest — happy path', () => {
  it('returns the new request id and ref_id, and records the ref_id format', async () => {
    const result = await createReturnRequest(baseFormData());
    expect(result.id).toBe(fakeAdmin.rows('requests')[0].id);
    expect(result.refId).toMatch(/^REF-[A-F0-9]{8}$/);
  });

  it('best-effort logs a new_request notification without blocking on a failed organizations lookup', async () => {
    // no organizations row seeded for this customer_code — lookup returns null,
    // notification should still be inserted with org_type/province null, not throw.
    const result = await createReturnRequest(baseFormData());
    expect(result.id).toBeTruthy();
    const notif = fakeAdmin.rows('notification_log')[0];
    expect(notif).toMatchObject({ type: 'new_request', org_type: null, province: null });
  });
});

describe('getNextDocNumber', () => {
  it('requires a logged-in session', async () => {
    mockGetCustomerSession.mockResolvedValue(null);
    await expect(getNextDocNumber()).rejects.toThrow('กรุณาเข้าสู่ระบบ');
  });

  it('returns the RPC value when available', async () => {
    fakeAdmin.setRpcHandler('peek_next_doc_number', () => ({ data: 'S042/2026', error: null }));
    await expect(getNextDocNumber()).resolves.toBe('S042/2026');
  });

  it('falls back to a placeholder if the RPC errors — this is a preview number only, never the real atomic doc_number', async () => {
    fakeAdmin.setRpcHandler('peek_next_doc_number', () => ({ data: null, error: { message: 'boom' } }));
    const result = await getNextDocNumber();
    expect(result).toMatch(/^S001\/\d{4}$/);
  });
});
