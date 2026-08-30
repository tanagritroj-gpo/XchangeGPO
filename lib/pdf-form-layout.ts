// ═══════════════════════════════════════════════════════════════════════════════
//  พิกัดจัดวางข้อความบนฟอร์ม FM-AJJ0-008 (แบบขอคืน/แลกเปลี่ยนยาและเวชภัณฑ์ สาขาภาคใต้)
//
//  ที่มาของพิกัด: สไลด์ที่ทีมใช้ทำ mapping กับ Autocrat
//  https://docs.google.com/presentation/d/1jNaIlGv_cNEbKsTz-rDmcj6ywv-RQ8QwgmmYOmBN6LY
//  ผืนสไลด์ = A4 (595.28 × 841.89 pt) เท่ากับ template PDF; กล่องข้อความแต่ละอันใช้
//  origin มุมซ้ายบน y ชี้ลง — ค่า x/y/w ด้านล่าง export จาก a:off/a:ext ใน slide1.xml (pt)
//
//  pdf-lib ใช้ origin มุมซ้ายล่าง y ชี้ขึ้น และ drawText วางที่ baseline — fromSlide()
//  แปลงพิกัดให้ พร้อมชดเชย inset ของกล่อง + ระยะจาก top ของกล่องถึง baseline บรรทัดแรก
//  (V_OFFSET คาลิเบรตจากตำแหน่งเส้นประจริงบนฟอร์ม ให้ข้อความนั่งบนเส้นพอดี)
//
//  ช่องที่สไลด์ไม่มี placeholder (checkbox ประเภทรายการ/วิธีส่งคืน, "รวม N รายการ",
//  "วันที่ส่งมอบ", ตำแหน่งรูปลายเซ็น) ใช้ atPdf() วางพิกัดที่วัดจาก template PDF โดยตรง
//  — คอมเมนต์กำกับทุกจุดว่า "วัดเอง"
// ═══════════════════════════════════════════════════════════════════════════════

import { rgb } from 'pdf-lib';
import type { Color, PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import { drawThaiText, thaiTextWidth } from './pdf-thai-text';

export const PAGE_W = 595.44;
export const PAGE_H = 841.68;

// ── ค่าคาลิเบรตทั่วทั้งฟอร์ม ───────────────────────────────────────────────────
// V_OFFSET : ระยะกล่อง-top → baseline (รวมกับ 0.5·fontSize) จูนจากเส้นประจริงบนฟอร์ม
// X_INSET  : ระยะขอบในซ้ายของกล่องข้อความ (Google Slides default = 7.2pt)
const V_OFFSET = 16;
const X_INSET = 8;

export type Align = 'left' | 'center' | 'right';

type SlideBox = { x: number; y: number; w: number; size?: number; align?: Align };

export type FieldSpec = {
  x: number;        // จุดอ้างอิงแนวนอน (left = ขอบซ้ายข้อความ, center = กึ่งกลาง, right = ขอบขวา)
  y: number;        // baseline ใน pdf-lib coords
  size: number;
  align: Align;
  maxWidth: number; // ความกว้างที่มีก่อน auto-shrink / word-wrap
};

// กล่องจากสไลด์ → FieldSpec (dx/dy = นัดจูนเฉพาะจุด, บวก = ขวา/ขึ้น)
function fromSlide(b: SlideBox, dx = 0, dy = 0): FieldSpec {
  const size = b.size ?? 12;
  const align: Align = b.align ?? 'left';
  const anchorX =
    align === 'center' ? b.x + b.w / 2 :
    align === 'right' ? b.x + b.w - X_INSET :
    b.x + X_INSET;
  return {
    x: anchorX + dx,
    y: PAGE_H - b.y - (V_OFFSET + 0.5 * size) + dy,
    size,
    align,
    maxWidth: Math.max(20, b.w - 2 * X_INSET),
  };
}

// พิกัด pdf-lib ตรงๆ โดย y นับจากขอบบนหน้า (วัดจาก template PDF เอง)
function atPdf(x: number, yFromTop: number, opts: { size?: number; align?: Align; maxWidth?: number } = {}): FieldSpec {
  return {
    x,
    y: PAGE_H - yFromTop,
    size: opts.size ?? 12,
    align: opts.align ?? 'left',
    maxWidth: opts.maxWidth ?? 200,
  };
}

// จุดวาดเครื่องหมาย ✓ ในช่อง [ ] — y นับจากขอบบนหน้า
export type CheckMark = { x: number; yFromTop: number };

// ─────────────────────────────────────────────────────────────────────────────
//  ตารางยา — สไลด์มีแค่ ITEM1–3 (y 348.33 / 385.74 / 421.76 → ระยะห่างเฉลี่ย ~36.8pt)
//  ฟอร์มมี 5 แถว → generate แถว 4–5 ต่อจากจังหวะเดียวกัน
// ─────────────────────────────────────────────────────────────────────────────
export const TABLE_MAX_ROWS = 5;

// เส้นตารางจริงบน template PDF (วัดจากภาพเรนเดอร์): เส้นแนวนอนคั่นแถวอยู่ที่ y (จากขอบบน)
// 340.9 / 377.5 / 414.5 / 451.1 / 487.8 / 524.4 → สูงแถวละ ~36.7pt
// เส้นแนวตั้งคั่นคอลัมน์: 55.6 / 91.0 / 217.3 / 283.0 / 375.2 / 467.4 / 560.1
const TABLE_ROW_TOP = 340.9;
const TABLE_ROW_H = 36.7;
const TABLE_TEXT_DROP = 24; // ขอบบนแถว → baseline (ให้ข้อความอยู่กึ่งกลางแนวตั้งของช่อง)

const TABLE_COLS: Record<
  'no' | 'name' | 'qty' | 'lot' | 'exp' | 'ref',
  { at: number; w: number; align: Align }
> = {
  no: { at: 73.3, w: 33, align: 'center' },   // ลำดับ  (55.6–91.0)
  name: { at: 95, w: 116, align: 'left' },    // ชื่อยาและขนาดความแรง  (91.0–217.3)
  qty: { at: 250.2, w: 62, align: 'center' }, // จำนวน  (217.3–283.0)
  lot: { at: 329.1, w: 88, align: 'center' }, // Lot. No.  (283.0–375.2)
  exp: { at: 421.3, w: 88, align: 'center' }, // วันสิ้นอายุ  (375.2–467.4)
  ref: { at: 513.8, w: 88, align: 'center' }, // เลขที่ใบส่งของ  (467.4–560.1)
};

export function tableCell(col: keyof typeof TABLE_COLS, rowIndex: number): FieldSpec {
  const c = TABLE_COLS[col];
  const yFromTop = TABLE_ROW_TOP + rowIndex * TABLE_ROW_H + TABLE_TEXT_DROP;
  return {
    x: c.align === 'left' ? c.at + X_INSET : c.at,
    y: PAGE_H - yFromTop,
    size: 12,
    align: c.align,
    maxWidth: c.w,
  };
}

// เส้นขีดคร่อมทั้งแถว (verified PDF — รายการที่ไม่ผ่านเกณฑ์) พาดจากขอบซ้ายคอลัมน์ชื่อยา
// ถึงขอบขวาคอลัมน์เลขที่ใบส่งของ ที่ระดับ x-height ของข้อความในแถว
export function tableRowStrike(rowIndex: number): { x1: number; x2: number; y: number } {
  const baselineFromTop = TABLE_ROW_TOP + rowIndex * TABLE_ROW_H + TABLE_TEXT_DROP;
  return { x1: 89, x2: 562, y: PAGE_H - (baselineFromTop - 3.5) };
}

// วาดเส้นขีดคร่อม
export function drawStrike(page: PDFPage, color: Color, s: { x1: number; x2: number; y: number }): void {
  page.drawLine({ start: { x: s.x1, y: s.y }, end: { x: s.x2, y: s.y }, thickness: 1, color });
}

// ─────────────────────────────────────────────────────────────────────────────
//  ตาราง layout ของทุกฟิลด์
// ─────────────────────────────────────────────────────────────────────────────
export const LAYOUT = {
  // ── ส่วนหัว ──
  doc_number: fromSlide({ x: 108.33, y: 240.83, w: 130.84 }, /* dx */ 32),
  date_top_day: fromSlide({ x: 382.91, y: 206.67, w: 55.84 }, 14, /* dy ↑ */ 3),
  date_top_month: fromSlide({ x: 447.09, y: 206.53, w: 64.58 }, 10, 3),
  date_top_year: fromSlide({ x: 529.58, y: 205.84, w: 55.84 }, 4, 3),
  hospital_name: fromSlide({ x: 212.5, y: 260.0, w: 165.83 }),
  province: fromSlide({ x: 430.83, y: 259.17, w: 165.83 }),
  sender: fromSlide({ x: 195.0, y: 279.1, w: 260.01 }, 15, /* dy ↑ ให้เท่า "โทร" */ 3),
  phone: fromSlide({ x: 474.17, y: 277.5, w: 122.5 }),

  // ── ประเภทรายการ: checkbox + ช่อง "อื่นๆ ระบุ" (วัดเอง — สไลด์ไม่มี placeholder) ──
  cb_type_debt: { x: 135, yFromTop: 245 } as CheckMark,     // [ ] รับคืนลดหนี้
  cb_type_exchange: { x: 210, yFromTop: 245 } as CheckMark, // [ ] รับคืนแลกเปลี่ยน
  cb_type_other: { x: 305, yFromTop: 245 } as CheckMark,    // [ ] อื่นๆ ระบุ
  type_other_text: atPdf(374, 244, { size: 11, maxWidth: 190 }),

  // ── ตารางยา: รวม/มูลค่า ──
  item_count: atPdf(326, 537, { size: 12, align: 'center', maxWidth: 42 }), // "รวม N รายการ" (วัดเอง)
  total_value: fromSlide({ x: 443.76, y: 518.14, w: 127.51 }, 12, /* dy ↑ */ 3),

  // ── เหตุผล / สินค้าแลกเปลี่ยน ──
  // เส้นประ "เหตุผลที่ส่งคืน ..." ยาวเกือบเต็มบรรทัด (สไลด์ให้กล่องแคบ w=200) → ขยายเอง
  return_reason: fromSlide({ x: 130, y: 535.83, w: 425 }, 0, /* dy ↑ */ 3),
  // "และยินยอมให้แลกเปลี่ยนเป็นสินค้า ..." + มีบรรทัดว่างต่ออีก 2 บรรทัด → wrap ลงได้
  exchange_item: fromSlide({ x: 225.0, y: 554.17, w: 355 }, 0, /* dy ↑ */ 3),
  exchange_item_wrap_x: 58, // x บรรทัดต่อของ exchange_item (บรรทัดว่างเต็มความกว้าง)

  // ── วิธีส่งคืน: โดยบริษัทขนส่ง ──
  cb_delivery_shipping: { x: 128, yFromTop: 649 } as CheckMark, // โดยบริษัทขนส่ง [ ] (วัดเอง)
  addr_street: fromSlide({ x: 340.0, y: 626.67, w: 235 }, 0, /* dy ↑ */ 3),
  addr_sub: fromSlide({ x: 93.33, y: 646.67, w: 150 }, 22, /* dy ↑ */ 4),
  addr_district: fromSlide({ x: 326.67, y: 645.68, w: 235 }, /* dx → */ 2, 3),

  // ── วิธีส่งคืน: ผ่านผู้แทน ──
  cb_delivery_agent: { x: 82, yFromTop: 682 } as CheckMark, // หรือ [ ] (วัดเอง)
  agent_info: fromSlide({ x: 171.87, y: 663.67, w: 155 }, 14, /* dy ↑ */ 3),
  agent_appointment_date: atPdf(432, 682, { size: 12, maxWidth: 110 }), // "วันที่ส่งมอบ" (วัดเอง)

  // ── บล็อกลงชื่อ "สำหรับลูกค้า" (วัดจากตำแหน่ง "ลงชื่อ / (...) / วันที่" จริงบนฟอร์ม) ──
  signature_img: { centerX: 148, yFromTop: 720, maxW: 115, maxH: 24 },
  signer_name: atPdf(138, 756, { size: 11, align: 'center', maxWidth: 124 }), // ชื่อในวงเล็บที่พิมพ์ไว้บนฟอร์ม
  date_bottom: atPdf(100, 773, { size: 11, maxWidth: 105 }),                  // "วันที่ ..."

  // ── verified PDF: หมายเหตุการตรวจสอบ (footnote) — วางในบรรทัดว่างหลัง "และยินยอม..."
  //    ก่อนหัวข้อ "วิธีการส่งคืนสินค้า" (~y620) — เมื่อ verified จะบังคับ exchange_item เหลือ 1 บรรทัด
  verification_footnote: atPdf(58, 584, { size: 8, maxWidth: 508 }),
  verification_footnote_line_gap: 9.5,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
//  วันที่ไทย
// ─────────────────────────────────────────────────────────────────────────────
const TH_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export function thaiDateParts(iso: string | null | undefined): { day: string; month: string; year: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { day: String(d.getDate()), month: TH_MONTHS[d.getMonth()], year: String(d.getFullYear() + 543) };
}

export function thaiDateFull(iso: string | null | undefined): string {
  const p = thaiDateParts(iso);
  return p ? `${p.day} ${p.month} ${p.year}` : '';
}

// ─────────────────────────────────────────────────────────────────────────────
//  helper วาด
// ─────────────────────────────────────────────────────────────────────────────
type DrawOpts = {
  shrink?: boolean;
  wrap?: number;        // จำนวนบรรทัดสูงสุด (สำหรับ reason/exchange ที่ฟอร์มมีบรรทัดว่างต่อ)
  wrapX?: number;       // x ของบรรทัดต่อ ๆ ไป (บรรทัดว่างเต็มความกว้าง เริ่มชิดซ้าย ไม่ใช่หลัง label)
  wrapWidth?: number;   // maxWidth ของบรรทัดต่อ ๆ ไป (กว้างกว่าบรรทัดแรกที่มี label กิน)
  minSize?: number;
  lineGap?: number;     // ระยะห่างบรรทัด (default = ตามเส้นบรรทัดฟอร์ม ~18.5pt)
};

// วาดข้อความ 1 ฟิลด์ตาม FieldSpec — จัด align, auto-shrink ให้พอดี maxWidth, และ
// word-wrap ได้สูงสุด opts.wrap บรรทัด
export function drawField(
  page: PDFPage,
  font: PDFFont,
  color: Color,
  value: string | number | null | undefined,
  spec: FieldSpec,
  opts: DrawOpts = {},
): void {
  const text = value == null ? '' : String(value).trim();
  if (!text) return;

  const minSize = opts.minSize ?? 8;
  let size = spec.size;

  if (opts.wrap && opts.wrap > 1) {
    const wrapWidth = opts.wrapWidth ?? spec.maxWidth;
    const layout = () => layoutWrapped(font, text, size, spec.maxWidth, wrapWidth);
    let lines = layout();
    while (lines.length > opts.wrap && size > minSize) {
      size -= 0.5;
      lines = layout();
    }
    if (lines.length > opts.wrap) lines = lines.slice(0, opts.wrap);
    const lineGap = opts.lineGap ?? 18.5;
    lines.forEach((line, i) => {
      const lineSpec: FieldSpec =
        i === 0 ? { ...spec, size } : { ...spec, size, x: opts.wrapX ?? spec.x, align: 'left', maxWidth: wrapWidth };
      drawOneLine(page, font, color, line, lineSpec, i * lineGap);
    });
    return;
  }

  if (opts.shrink ?? true) {
    while (size > minSize && thaiTextWidth(font, text, size) > spec.maxWidth) size -= 0.5;
  }
  drawOneLine(page, font, color, text, { ...spec, size }, 0);
}

// บรรทัดแรกกว้าง firstWidth (มี label กินไปส่วนหนึ่ง) บรรทัดถัด ๆ ไปกว้าง restWidth
function layoutWrapped(font: PDFFont, text: string, size: number, firstWidth: number, restWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const cand = cur ? `${cur} ${word}` : word;
    const limit = lines.length === 0 ? firstWidth : restWidth;
    if (cur && thaiTextWidth(font, cand, size) > limit) {
      lines.push(cur);
      cur = word;
    } else {
      cur = cand;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawOneLine(
  page: PDFPage,
  font: PDFFont,
  color: Color,
  text: string,
  spec: FieldSpec,
  dyDown: number,
): void {
  const w = thaiTextWidth(font, text, spec.size);
  let x = spec.x;
  if (spec.align === 'center') x -= w / 2;
  else if (spec.align === 'right') x -= w;
  drawThaiText(page, text, { x, y: spec.y - dyDown, size: spec.size, font, color });
}

// เครื่องหมายในช่อง [ ] — ใช้ "X" (Sarabun ไม่มี glyph ✓; X เรนเดอร์ได้เสมอและอ่านชัดในช่องเล็ก)
export function drawCheck(page: PDFPage, font: PDFFont, color: Color, mark: CheckMark, size = 12): void {
  page.drawText('X', { x: mark.x, y: PAGE_H - mark.yFromTop, size, font, color });
}

// ลายน้ำทแยงมุม (ซ้ายล่าง → ขวาบน) — ใช้กับ draft PDF ("ยังไม่ตรวจสอบ")
export function drawWatermark(page: PDFPage, font: PDFFont, text: string): void {
  const size = 62;
  const angle = 38; // องศา ทวนเข็ม → ทแยงจากซ้ายล่างไปขวาบน
  const rad = (angle * Math.PI) / 180;
  const w = thaiTextWidth(font, text, size);
  drawThaiText(page, text, {
    x: PAGE_W / 2 - (w / 2) * Math.cos(rad),
    y: PAGE_H / 2 - (w / 2) * Math.sin(rad) - size * 0.34,
    size,
    font,
    color: rgb(0.5, 0.5, 0.56),
    rotate: angle,
    opacity: 0.15,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  กล่องกำกับสถานะเอกสาร — มุมขวาล่าง (ใต้บล็อกลงชื่อ ในระยะขอบล่างของหน้า)
//  draft    : "ใช้เป็นเอกสารชั่วคราว ..." (ส้ม)
//  verified : "เอกสารผ่านการตรวจสอบ ..." + ลายเซ็น CSR + วันที่ตรวจสอบ (เขียว)
// ─────────────────────────────────────────────────────────────────────────────
const STAMP = { x: 300, right: 588, topFromTop: 793 }; // กล่องอยู่ x 300–588, ขอบบน y=793 จากขอบบนหน้า (ในระยะขอบล่างของหน้า)

type DocStampArg =
  | { kind: 'draft' }
  | { kind: 'verified'; byName: string; atText: string; signature?: PDFImage | null };

export function drawDocStamp(page: PDFPage, font: PDFFont, stamp: DocStampArg): void {
  const w = STAMP.right - STAMP.x;
  const color = stamp.kind === 'draft' ? rgb(0.82, 0.42, 0.06) : rgb(0.06, 0.42, 0.2);
  const top = STAMP.topFromTop;
  const h = stamp.kind === 'draft' ? 25 : 43;

  page.drawRectangle({ x: STAMP.x, y: PAGE_H - top - h, width: w, height: h, borderColor: color, borderWidth: 0.9 });

  const padX = STAMP.x + 8;
  const line = (text: string, fromTop: number, size: number) =>
    drawThaiText(page, text, { x: padX, y: PAGE_H - fromTop, size, font, color });

  if (stamp.kind === 'draft') {
    line('ใช้เป็นเอกสารชั่วคราว', top + 10, 8);
    line('ยังไม่ผ่านการตรวจสอบรายการสินค้ารับคืน/แลกเปลี่ยน', top + 20, 7.5);
    return;
  }

  line('เอกสารผ่านการตรวจสอบรายการสินค้ารับคืน/แลกเปลี่ยนแล้ว', top + 10, 7.5);

  // แถว "ตรวจสอบโดย [เส้นประให้เซ็น] (ชื่อ)"
  const byY = PAGE_H - (top + 24);
  const dotsX = padX + thaiTextWidth(font, 'ตรวจสอบโดย ', 7);
  const dots = '.'.repeat(22);
  const dotsW = thaiTextWidth(font, dots, 7);
  drawThaiText(page, 'ตรวจสอบโดย', { x: padX, y: byY, size: 7, font, color });
  drawThaiText(page, dots, { x: dotsX, y: byY, size: 7, font, color });
  drawThaiText(page, `(${stamp.byName})`, { x: dotsX + dotsW + 5, y: byY, size: 7, font, color });

  drawThaiText(page, `วันที่ตรวจสอบ ${stamp.atText}`, { x: padX, y: PAGE_H - (top + 36), size: 7, font, color });

  if (stamp.signature) {
    const maxW = dotsW - 4;
    const maxH = 12;
    const scale = Math.min(maxW / stamp.signature.width, maxH / stamp.signature.height, 1);
    const sw = stamp.signature.width * scale;
    const sh = stamp.signature.height * scale;
    // เซ็นคร่อมเส้นประ — ต่ำกว่า baseline เล็กน้อยให้ปลายหางแตะเส้น
    page.drawImage(stamp.signature, { x: dotsX + (dotsW - sw) / 2, y: byY - sh * 0.35, width: sw, height: sh });
  }
}
