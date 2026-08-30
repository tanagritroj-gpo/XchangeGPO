import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { promises as fs } from 'fs';
import path from 'path';
import { formatExchangeProduct } from '@/lib/exchange-product';
import {
  LAYOUT,
  PAGE_H,
  TABLE_MAX_ROWS,
  drawCheck,
  drawField,
  drawStrike,
  tableCell,
  tableRowStrike,
  thaiDateFull,
  thaiDateParts,
} from '@/lib/pdf-form-layout';
import type { RequestRow, DrugItemRow } from '@/lib/types';

const INK = rgb(0.1, 0.1, 0.12);
const STRIKE = rgb(0.72, 0.1, 0.1); // แดงเข้ม — เส้นขีดคร่อม + หมายเหตุการตรวจสอบ

type BuildOpts = {
  // PNG ลายเซ็นลูกค้า (resolve จาก storage ฝั่ง action แล้วส่งเข้ามา — โมดูลนี้ไม่แตะ Supabase)
  signaturePng?: Uint8Array | null;
};

// item ที่ CSR ตรวจแล้ว "ไม่ผ่านเกณฑ์" (is_compliant === false) — verified PDF จะขีดคร่อม
const isRejected = (it: DrugItemRow) => it.is_compliant === false;

// เขียนข้อมูลคำร้องลงบน template ฟอร์ม FM-AJJ0-008 — ทุกพิกัดอ้างอิงจาก lib/pdf-form-layout.ts
// (แปลงมาจากสไลด์ Autocrat + จุดที่วัดเองบน template) ไม่มี magic number ในไฟล์นี้
export async function buildReturnFormPdf(request: RequestRow, opts: BuildOpts = {}) {
  const templatePath = path.join(process.cwd(), 'public', 'forms', 'FM-AJJ0-008_Return_rev.02.pdf');
  const fontPath = path.join(process.cwd(), 'public', 'font', 'Sarabun-Regular.ttf');

  const [existingPdfBytes, fontBytes] = await Promise.all([fs.readFile(templatePath), fs.readFile(fontPath)]);

  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes);
  const page = pdfDoc.getPages()[0];

  const f = (
    value: string | number | null | undefined,
    spec: Parameters<typeof drawField>[4],
    drawOpts?: Parameters<typeof drawField>[5],
  ) => drawField(page, font, INK, value, spec, drawOpts);

  // ── ส่วนหัว ───────────────────────────────────────────────────────────────
  f(request.doc_number, LAYOUT.doc_number);

  const reqDate = thaiDateParts(request.request_date);
  if (reqDate) {
    f(reqDate.day, LAYOUT.date_top_day);
    f(reqDate.month, LAYOUT.date_top_month);
    f(reqDate.year, LAYOUT.date_top_year);
  }

  f(request.hospital_name, LAYOUT.hospital_name);
  f(request.province, LAYOUT.province);
  f(request.phone, LAYOUT.phone);

  // ผู้ส่งคืน (ชื่อ/ตำแหน่ง) — ใบที่ CSR กรอกแทนไม่มีชื่อผู้ส่งคืนฝั่งลูกค้า (contact_name =
  // ชื่อ จนท. CSR) → ใส่ "N/A (ข้อมูลจากระบบอัตโนมัติ)" แทนการเว้นว่าง
  if (request.submission_channel === 'csr_manual') {
    f('N/A (ข้อมูลจากระบบอัตโนมัติ)', LAYOUT.sender);
  } else {
    const sender = [request.contact_name, request.signer_position].filter(Boolean).join(' / ');
    f(sender, LAYOUT.sender);
  }

  // ── ประเภทรายการ (checkbox) ───────────────────────────────────────────────
  // ลดหนี้ / แลกเปลี่ยน → ช่องตรง; ค่าอื่น (รับคืน CCR, อื่นๆ) → ช่อง "อื่นๆ ระบุ" + เขียนข้อความ
  const reqType = (request.request_type ?? '').trim();
  if (reqType === 'รับคืนลดหนี้') {
    drawCheck(page, font, INK, LAYOUT.cb_type_debt);
  } else if (reqType === 'รับคืนแลกเปลี่ยน') {
    drawCheck(page, font, INK, LAYOUT.cb_type_exchange);
  } else if (reqType) {
    drawCheck(page, font, INK, LAYOUT.cb_type_other);
    f(reqType, LAYOUT.type_other_text);
  }

  // ── ตารางยา ───────────────────────────────────────────────────────────────
  const items = (request.drug_items ?? []).slice(0, TABLE_MAX_ROWS);
  // verified = มี item อย่างน้อย 1 ที่ CSR ตรวจแล้วไม่ผ่านเกณฑ์ (data-driven — ใช้ได้ทุก channel)
  const verified = items.some(isRejected);

  items.forEach((item: DrugItemRow, i: number) => {
    const rejected = isRejected(item);
    f(rejected ? `*${i + 1}` : i + 1, tableCell('no', i));
    f(item.drug_name, tableCell('name', i));
    f(formatQty(item), tableCell('qty', i));
    f(item.lot_number, tableCell('lot', i));
    f(thaiDateFull(item.exp_date), tableCell('exp', i));
    f(item.invoice_number, tableCell('ref', i));
    if (rejected) drawStrike(page, STRIKE, tableRowStrike(i));
  });

  // รวม N รายการ / คิดเป็นมูลค่ารวม ... บาท — verified: นับ/รวมเฉพาะ item ที่ผ่าน
  const countedItems = verified ? items.filter((it) => !isRejected(it)) : items;
  if (countedItems.length > 0) f(countedItems.length, LAYOUT.item_count);
  const totalValue = verified
    ? countedItems.reduce((s, it) => s + (Number(it.value_amount) || 0), 0)
    : request.total_value;
  if (totalValue != null) {
    f(totalValue.toLocaleString('th-TH', { minimumFractionDigits: 2 }), LAYOUT.total_value);
  }

  // ── เหตุผล / สินค้าแลกเปลี่ยน ─────────────────────────────────────────────
  f(request.return_reason, LAYOUT.return_reason);
  f(formatExchangeProduct(request), LAYOUT.exchange_item, {
    // verified: บีบเหลือ 1 บรรทัด เพื่อสงวนบรรทัดว่างด้านล่างให้ footnote การตรวจสอบ
    wrap: verified ? 1 : 3,
    wrapX: LAYOUT.exchange_item_wrap_x,
    wrapWidth: 505,
  });

  // ── หมายเหตุการตรวจสอบ (verified) ─────────────────────────────────────────
  if (verified) {
    const rejects = items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => isRejected(it));
    const fnBase = LAYOUT.verification_footnote;
    const gap = LAYOUT.verification_footnote_line_gap;
    drawField(page, font, STRIKE, 'หมายเหตุการตรวจสอบ — รายการที่มีเครื่องหมาย * ไม่ผ่านเกณฑ์การรับคืน/แลกเปลี่ยน:', fnBase, { shrink: true });
    // มีที่ว่าง ~3 บรรทัดก่อนหัวข้อ "วิธีการส่งคืนสินค้า" — เกินนั้นย่อเป็นบรรทัดเดียว
    const MAX_LINES = 3;
    if (rejects.length <= MAX_LINES) {
      rejects.forEach(({ it, i }, k) => {
        const reason = (it.compliance_remark ?? '').trim() || 'ไม่ระบุเหตุผล';
        drawField(page, font, STRIKE, `*${i + 1} ${it.drug_name} — ${reason}`, { ...fnBase, y: fnBase.y - (k + 1) * gap }, { shrink: true });
      });
    } else {
      const summary = rejects
        .map(({ it, i }) => `*${i + 1} ${it.drug_name} (${(it.compliance_remark ?? '').trim() || 'ไม่ระบุ'})`)
        .join('  ·  ');
      drawField(page, font, STRIKE, summary, { ...fnBase, y: fnBase.y - gap, maxWidth: 505 }, { wrap: 2, minSize: 7 });
    }
  }

  // ── วิธีการส่งคืนสินค้า (checkbox + รายละเอียด) ───────────────────────────
  const deliveryType = (request.delivery_type ?? '').trim();
  if (deliveryType === 'ขนส่ง') {
    drawCheck(page, font, INK, LAYOUT.cb_delivery_shipping);
    f(request.addr_street, LAYOUT.addr_street);
    f(request.addr_sub, LAYOUT.addr_sub);
    // ฟอร์มไม่มีช่องจังหวัดสำหรับที่อยู่รับสินค้า → ต่อท้ายช่อง "เขต/อำเภอ" เว้นระยะพอเหมาะ
    const district = [request.addr_district, request.addr_province ? `จ.${request.addr_province}` : '']
      .filter(Boolean)
      .join('    ');
    f(district, LAYOUT.addr_district);
  } else if (deliveryType === 'ผู้แทน') {
    drawCheck(page, font, INK, LAYOUT.cb_delivery_agent);
    f(request.agent_info, LAYOUT.agent_info);
    f(thaiDateFull(request.agent_appointment_date), LAYOUT.agent_appointment_date);
  }

  // ── บล็อกลงชื่อ "สำหรับลูกค้า": รูปลายเซ็น + (ชื่อ) + วันที่ ────────────────
  // เฉพาะใบที่ลูกค้ายื่นเอง (csr_manual ไม่มีขั้นตอนเซ็น → เว้นทั้งคอลัมน์)
  if (request.submission_channel !== 'csr_manual') {
    if (opts.signaturePng && opts.signaturePng.length > 0) {
      try {
        const sig = await pdfDoc.embedPng(opts.signaturePng);
        const { centerX, yFromTop, maxW, maxH } = LAYOUT.signature_img;
        const scale = Math.min(maxW / sig.width, maxH / sig.height, 1);
        const w = sig.width * scale;
        const h = sig.height * scale;
        page.drawImage(sig, { x: centerX - w / 2, y: PAGE_H - yFromTop - h, width: w, height: h });
      } catch (err) {
        console.warn('Embed signature image failed:', err);
      }
    }
    // ฟอร์มพิมพ์วงเล็บ "( )" ไว้แล้ว — ใส่แค่ชื่อไว้ตรงกลาง
    f(request.signer_name, LAYOUT.signer_name);
    f(thaiDateFull(request.request_date), LAYOUT.date_bottom);
  }

  return await pdfDoc.save();
}

// "จำนวน" — ตัวเลข + หน่วย (เช่น "10 ขวด") auto-shrink ให้พอดีคอลัมน์เอง
function formatQty(item: DrugItemRow): string {
  if (item.qty == null) return '';
  return item.unit ? `${item.qty} ${item.unit}` : String(item.qty);
}
