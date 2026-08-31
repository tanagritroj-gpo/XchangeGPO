import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../test/fakeSupabase';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});
vi.mock('@/lib/email-service', () => ({ sendPdfDocumentEmail: vi.fn().mockResolvedValue({ error: null }) }));

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { sendPdfDocumentEmail } = await import('@/lib/email-service');
const mockSend = vi.mocked(sendPdfDocumentEmail);
const { sendReturnFormEmail, resolveEmailMode } = await import('../send-return-form-email');

const item = (over: Record<string, any> = {}) => ({
  drug_name: 'ยา A', qty: 2, unit: 'กล่อง', lot_number: 'L1', exp_date: '2027-01-01',
  value_amount: 100, is_compliant: null, compliance_remark: null, ...over,
});

function req(over: Record<string, any> = {}) {
  return {
    id: 1, ref_id: 'REF-1', hospital_name: 'รพ.ทดสอบ', doc_number: 'S1/2569',
    request_date: '2026-01-01', created_at: '2026-01-01', request_type: 'รับคืนแลกเปลี่ยน',
    return_reason: 'x', delivery_type: 'ขนส่ง', total_value: 999,
    drug_items: [item()],
    ...over,
  } as any;
}

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ error: null } as any);
  fakeAdmin.seed({ document_attachments: [] });
});

describe('resolveEmailMode', () => {
  it('is "standard" for non-exchange', () => {
    expect(resolveEmailMode(req({ request_type: 'รับคืนลดหนี้', drug_items: [item({ is_compliant: false })] }))).toBe('standard');
  });
  it('is "standard" for an exchange with no failing item', () => {
    expect(resolveEmailMode(req({ drug_items: [item({ is_compliant: true }), item({ is_compliant: null })] }))).toBe('standard');
  });
  it('is "verified" for an exchange with at least one is_compliant===false', () => {
    expect(resolveEmailMode(req({ drug_items: [item({ is_compliant: true }), item({ is_compliant: false })] }))).toBe('verified');
  });
});

describe('sendReturnFormEmail', () => {
  it('mode "ack" sends without a download link and never touches document_attachments', async () => {
    const res = await sendReturnFormEmail({ request: req(), to: 'c@x.com', mode: 'ack' });
    expect(res.error).toBeNull();
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ mode: 'ack', downloadUrl: null, to: 'c@x.com' }));
  });

  it('mode "verified" recomputes totals from passing items only + flags rejected items', async () => {
    fakeAdmin.seed({ document_attachments: [{ id: 'd', request_id: 1, kind: 'final', file_path: 'returns/1/REF-1.pdf' }] });
    await fakeAdmin.client.storage.from('return-documents').upload('returns/1/REF-1.pdf', new Uint8Array([1]));

    const request = req({
      drug_items: [
        item({ drug_name: 'ผ่าน', value_amount: 250, is_compliant: true }),
        item({ drug_name: 'ไม่ผ่าน', value_amount: 999, is_compliant: false, compliance_remark: 'อายุไม่ถึง 7 เดือน' }),
      ],
    });
    const res = await sendReturnFormEmail({ request, to: 'c@x.com', mode: 'verified' });
    expect(res.error).toBeNull();

    const arg = mockSend.mock.calls[0][0] as any;
    expect(arg.mode).toBe('verified');
    expect(arg.totalValueText).toBe('250.00'); // 999 ของรายการ reject ไม่นับ
    expect(arg.items).toEqual([
      expect.objectContaining({ drugName: 'ผ่าน', rejected: false }),
      expect.objectContaining({ drugName: 'ไม่ผ่าน', rejected: true, rejectReason: 'อายุไม่ถึง 7 เดือน' }),
    ]);
    expect(arg.downloadUrl).toContain('return-documents');
  });

  it('mode "verified"/"standard" errors when no final document exists', async () => {
    fakeAdmin.seed({ document_attachments: [] });
    const res = await sendReturnFormEmail({ request: req(), to: 'c@x.com', mode: 'standard' });
    expect(res.error).toBeInstanceOf(Error);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
