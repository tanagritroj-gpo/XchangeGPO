import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildReturnFormPdf } from '../pdf-service';
import type { RequestRow } from '@/lib/types';

// Smoke test: buildReturnFormPdf ต้องเขียนข้อมูลลง template FM-AJJ0-008 ได้โดยไม่ throw
// สำหรับทุก request_type / delivery_type / submission_channel และทน field ที่เป็น null

function makeReq(over: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 1, ref_id: 'REF-1', request_date: '2026-08-30T04:00:00Z', request_type: 'รับคืนแลกเปลี่ยน',
    hospital_name: 'รพ.ทดสอบ', province: 'สงขลา', customer_code: 'C-0007', phone: '074-000-111',
    contact_name: 'ภญ. ทดสอบ', return_reason: 'สินค้าหมดอายุ', delivery_type: 'ผู้แทน',
    agent_info: 'ผู้แทน ก', agent_appointment_note: 'ช่วงบ่าย', agent_appointment_date: '2026-09-05',
    addr_street: null, addr_district: null, signature_url: null, signer_name: 'ภญ. ทดสอบ',
    signer_position: 'เภสัชกร', customer_email: 'x@y.com', file_link: null, total_value: 1500,
    created_at: null, doc_number: 'S001/2569', addr_sub: null, addr_province: null,
    exchange_product_type: 'รายการเดิม', exchange_product_list: '["ยา A"]', exchange_product_other: null,
    b2b_customer_id: 1, current_status: 'pending_review', updated_by: null, updated_at: null,
    department: null, created_by_staff_id: null, submission_channel: 'customer_portal',
    drug_items: [
      { id: 1, request_id: 1, drug_name: 'ยา A 500mg', qty: 10, unit: 'เม็ด', lot_number: 'L1', exp_date: '2026-12-31', unit_price: 5, value_amount: 50, invoice_number: 'INV1', product_type: null, current_status: null, is_compliant: null, compliance_remark: null },
    ],
    delivery_note_photo_paths: null,
    ...over,
  } as RequestRow;
}

async function expectValidPdf(bytes: Uint8Array) {
  expect(bytes.length).toBeGreaterThan(5000); // template ~ tens of KB
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(1);
}

describe('buildReturnFormPdf', () => {
  it('renders the exchange / agent variant', async () => {
    await expectValidPdf(await buildReturnFormPdf(makeReq()));
  });

  it('renders the debt-reduction / shipping variant with a full address', async () => {
    await expectValidPdf(await buildReturnFormPdf(makeReq({
      request_type: 'รับคืนลดหนี้', delivery_type: 'ขนส่ง',
      addr_street: '99/1 ถ.กาญจนวนิช', addr_sub: 'คอหงส์', addr_district: 'หาดใหญ่', addr_province: 'สงขลา',
      exchange_product_type: null, exchange_product_list: null,
    })));
  });

  it('renders the "รับคืน CCR" type into the "อื่นๆ ระบุ" checkbox', async () => {
    await expectValidPdf(await buildReturnFormPdf(makeReq({ request_type: 'รับคืน CCR', exchange_product_type: null })));
  });

  it('renders a CSR-manual request (no signer block)', async () => {
    await expectValidPdf(await buildReturnFormPdf(makeReq({
      submission_channel: 'csr_manual', signature_url: null, signer_name: null, signer_position: null,
    })));
  });

  it('tolerates a request with mostly-null fields and no drug items', async () => {
    await expectValidPdf(await buildReturnFormPdf({
      ...makeReq(),
      request_type: null, return_reason: null, delivery_type: null, total_value: null,
      doc_number: null, request_date: null, agent_appointment_date: null, signer_name: null,
      exchange_product_type: null, exchange_product_list: null, exchange_product_other: null,
      drug_items: [],
    } as RequestRow));
  });

  it('caps the drug table at 5 rows', async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      id: i, request_id: 1, drug_name: `ยา ${i}`, qty: 1, unit: 'เม็ด', lot_number: `L${i}`,
      exp_date: '2027-01-01', unit_price: 1, value_amount: 1, invoice_number: `INV${i}`,
      product_type: null, current_status: null, is_compliant: null, compliance_remark: null,
    }));
    await expectValidPdf(await buildReturnFormPdf(makeReq({ drug_items: many as RequestRow['drug_items'] })));
  });

  it('renders the verified variant (strikethrough + recomputed totals) when items fail compliance', async () => {
    const bytes = await buildReturnFormPdf(makeReq({
      drug_items: [
        { id: 1, request_id: 1, drug_name: 'ผ่าน', qty: 10, unit: 'เม็ด', lot_number: 'L1', exp_date: '2027-01-01', unit_price: 5, value_amount: 50, invoice_number: 'I1', product_type: 'GPO', current_status: 'approved', is_compliant: true, compliance_remark: 'ผ่านเกณฑ์' },
        { id: 2, request_id: 1, drug_name: 'ไม่ผ่าน', qty: 3, unit: 'ขวด', lot_number: 'L2', exp_date: '2026-09-01', unit_price: 20, value_amount: 60, invoice_number: 'I2', product_type: 'OTHER', current_status: 'rejected', is_compliant: false, compliance_remark: 'อายุคงเหลือไม่ถึง 7 เดือน' },
      ] as RequestRow['drug_items'],
    }));
    await expectValidPdf(bytes);
  });

  it('renders the draft stamp', async () => {
    await expectValidPdf(await buildReturnFormPdf(makeReq(), { stamp: { kind: 'draft' } }));
  });

  it('renders the verified stamp with a CSR signature + date', async () => {
    await expectValidPdf(await buildReturnFormPdf(makeReq(), {
      stamp: { kind: 'verified', byName: 'ภญ. สมชาย', at: '2026-09-02T09:30:00Z', signaturePng: TINY_PNG },
    }));
  });

  it('embeds a signature PNG when provided', async () => {
    const pngDoc = await PDFDocument.create();
    const png = await pngDoc.embedPng(TINY_PNG);
    expect(png.width).toBeGreaterThan(0);
    await expectValidPdf(await buildReturnFormPdf(makeReq(), { signaturePng: TINY_PNG }));
  });
});

// 1x1 transparent PNG
const TINY_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);
