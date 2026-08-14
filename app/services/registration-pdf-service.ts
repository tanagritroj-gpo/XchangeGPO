import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { promises as fs } from 'fs';
import path from 'path';
import { drawThaiText, thaiTextWidth, wrapThaiParagraph } from '@/lib/pdf-thai-text';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 56;
const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.45, 0.45, 0.48);
const ACCENT = rgb(0.06, 0.32, 0.2); // ใกล้เคียงสีธีมเขียวของแบรนด์ (#0f5132)
const ACCENT_TINT = rgb(0.93, 0.98, 0.96); // พื้นอ่อนโทนเดียวกับกล่องรหัสลูกค้า
const BORDER = rgb(0.8, 0.8, 0.82);
const PANEL = rgb(0.98, 0.98, 0.98);

// ข้อความยินยอม PDPA ชุดเดียวกับ checkbox ตอนลงทะเบียนจริง (components/auth/RegisterForm.tsx)
// — คัดลอกคำต่อคำ ให้เอกสารเป็นหลักฐานของสิ่งที่ลูกค้ากดยินยอมไว้จริง ไม่ใช่ถ้อยคำใหม่
const PDPA_CONSENT_TEXT =
  'ข้าพเจ้ายินยอมให้ระบบ Xchange Portal ของ องค์การเภสัชกรรม (GPO) จัดเก็บ ประมวลผล ' +
  'และใช้ข้อมูลส่วนบุคคลข้างต้น (ชื่อ-นามสกุล, เบอร์โทรศัพท์, อีเมล และลายมือชื่ออิเล็กทรอนิกส์) ' +
  'เพื่อวัตถุประสงค์ในการยืนยันตัวตนและการติดต่อประสานงาน ตามนโยบายคุ้มครองข้อมูลส่วนบุคคล';

export type RegistrationDocumentInput = {
  hospital_name: string;
  province: string;
  contact_name: string;
  position: string;
  phone: string;
  email: string;
  customer_code: string;
  registered_at: string; // pdpa_consented_at
  customer_signature_png: Uint8Array | null;
  staff_signature_png: Uint8Array | null;
  staff_full_name: string;
  staff_action: 'approved' | 'rejected';
  decided_at: string;
  access_expires_at: string;
};

function formatThaiDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}

export async function buildRegistrationConfirmationPdf(data: RegistrationDocumentInput) {
  const [fontBytes, logoBytes] = await Promise.all([
    fs.readFile(path.join(process.cwd(), 'public', 'font', 'Sarabun-Regular.ttf')),
    fs.readFile(path.join(process.cwd(), 'public', 'gpo.logo.png')),
  ]);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes);
  const logoImage = await pdfDoc.embedPng(logoBytes);
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  let y = PAGE_HEIGHT - 50;

  const text = (
    str: string,
    x: number,
    size = 11,
    color = INK,
  ) => drawThaiText(page, str, { x, y, size, font, color });

  const centeredText = (str: string, size = 11, color = INK) => {
    const width = thaiTextWidth(font, str, size);
    drawThaiText(page, str, { x: (PAGE_WIDTH - width) / 2, y, size, font, color });
  };

  const hr = (yPos: number, color = BORDER, thickness = 0.75) =>
    page.drawLine({
      start: { x: MARGIN_X, y: yPos },
      end: { x: PAGE_WIDTH - MARGIN_X, y: yPos },
      thickness,
      color,
    });

  // ── หัวเอกสารแบบ letterhead: โลโก้ + ชื่อองค์กรมุมซ้ายบน ──
  const logoWidth = 64;
  const logoHeight = logoImage.height * (logoWidth / logoImage.width);
  page.drawImage(logoImage, { x: MARGIN_X, y: y - logoHeight, width: logoWidth, height: logoHeight });

  const wordmarkX = MARGIN_X + logoWidth + 14;
  const wordmarkY = y - logoHeight / 2;
  drawThaiText(page, 'GPO Xchange Portal', { x: wordmarkX, y: wordmarkY + 5, size: 13, font, color: ACCENT });
  drawThaiText(page, 'องค์การเภสัชกรรม สาขาภาคใต้', { x: wordmarkX, y: wordmarkY - 10, size: 10, font, color: MUTED });

  y -= logoHeight + 22;

  // ── ชื่อเอกสาร ──
  centeredText('เอกสารยืนยันการลงทะเบียนใช้งานระบบ', 18, ACCENT);
  y -= 22;
  hr(y, ACCENT, 1.5);
  y -= 22;

  // ── หัวข้อ section แบบมีแถบสี + ไอคอนกำกับ ──
  const sectionHeader = (title: string) => {
    const bandHeight = 24;
    const bandTop = y + 6;
    page.drawRectangle({
      x: MARGIN_X,
      y: bandTop - bandHeight,
      width: PAGE_WIDTH - MARGIN_X * 2,
      height: bandHeight,
      color: ACCENT_TINT,
    });
    page.drawRectangle({
      x: MARGIN_X,
      y: bandTop - bandHeight,
      width: 3,
      height: bandHeight,
      color: ACCENT,
    });
    drawThaiText(page, title, {
      x: MARGIN_X + 14,
      y: bandTop - bandHeight + 7,
      size: 12,
      font,
      color: ACCENT,
    });
    y -= bandHeight + 14;
  };

  // ── ข้อมูลหน่วยงาน/ผู้ติดต่อ (ชุดเดียวกับตอนลงทะเบียน) ──
  sectionHeader('ข้อมูลหน่วยงานและผู้ติดต่อ');

  const field = (label: string, value: string) => {
    text(label, MARGIN_X, 10.5, MUTED);
    text(value || '-', MARGIN_X + 130, 11.5, INK);
    y -= 19;
  };

  field('ชื่อหน่วยงาน / โรงพยาบาล', data.hospital_name);
  field('จังหวัด', data.province);
  field('ชื่อผู้ติดต่อ', data.contact_name);
  field('ตำแหน่ง', data.position);
  field('เบอร์โทรศัพท์', data.phone);
  field('อีเมล', data.email);
  field('วันที่ลงทะเบียน', formatThaiDate(data.registered_at));

  y -= 6;

  // ── กล่องคำยินยอม PDPA — ข้อความชุดเดียวกับตอนลงทะเบียนจริง พร้อมวันที่ยินยอม ──
  const pdpaPadding = 12;
  const pdpaLineHeight = 11.5;
  const pdpaMaxWidth = PAGE_WIDTH - MARGIN_X * 2 - pdpaPadding * 2;
  const pdpaLines = wrapThaiParagraph(font, PDPA_CONSENT_TEXT, 8.5, pdpaMaxWidth);
  const pdpaBoxHeight = pdpaPadding * 2 + 16 + pdpaLines.length * pdpaLineHeight + pdpaLineHeight;
  const pdpaBoxTop = y;

  page.drawRectangle({
    x: MARGIN_X,
    y: pdpaBoxTop - pdpaBoxHeight,
    width: PAGE_WIDTH - MARGIN_X * 2,
    height: pdpaBoxHeight,
    borderColor: BORDER,
    borderWidth: 1,
    color: PANEL,
  });

  y = pdpaBoxTop - pdpaPadding - 8;
  text('คำยินยอม PDPA', MARGIN_X + pdpaPadding, 10, ACCENT);
  y -= pdpaLineHeight;
  for (const line of pdpaLines) {
    text(line, MARGIN_X + pdpaPadding, 8.5, MUTED);
    y -= pdpaLineHeight;
  }
  text(`ยินยอมแล้วเมื่อ ${formatThaiDate(data.registered_at)}`, MARGIN_X + pdpaPadding, 8.5, ACCENT);
  y = pdpaBoxTop - pdpaBoxHeight - 20;

  // ── ลายเซ็นลูกค้า — ย้ายไปชิดขอบขวา ชื่อใต้เส้นจัดกึ่งกลาง ──
  const sigBlockWidth = 220;
  const sigBlockLeft = PAGE_WIDTH - MARGIN_X - sigBlockWidth;

  text('ลายเซ็นต์ผู้มีอำนาจลงนาม (ฝั่งลูกค้า)', sigBlockLeft, 10.5, MUTED);
  y -= 8;

  if (data.customer_signature_png) {
    try {
      const sigImage = await pdfDoc.embedPng(data.customer_signature_png);
      const sigDims = sigImage.scale(0.35);
      const sigX = sigBlockLeft + (sigBlockWidth - sigDims.width) / 2;
      page.drawImage(sigImage, { x: sigX, y: y - sigDims.height, width: sigDims.width, height: sigDims.height });
      y -= sigDims.height + 6;
    } catch {
      y -= 40;
    }
  } else {
    y -= 40;
  }
  page.drawLine({ start: { x: sigBlockLeft, y }, end: { x: sigBlockLeft + sigBlockWidth, y }, thickness: 0.75, color: BORDER });
  y -= 14;
  const signerLabel = `(${data.contact_name})`;
  const signerWidth = thaiTextWidth(font, signerLabel, 9.5);
  text(signerLabel, sigBlockLeft + (sigBlockWidth - signerWidth) / 2, 9.5, MUTED);

  y -= 16;

  // ── ส่วนของพนักงาน GPO ──
  sectionHeader('ส่วนของพนักงาน GPO');

  // ── กล่องรหัสลูกค้า — ย้ายมาไว้ในส่วนของพนักงาน (เป็นผลลัพธ์การอนุมัติของพนักงาน) ──
  const codeBoxTop = y;
  const codeBoxHeight = 46;
  page.drawRectangle({
    x: MARGIN_X,
    y: codeBoxTop - codeBoxHeight,
    width: PAGE_WIDTH - MARGIN_X * 2,
    height: codeBoxHeight,
    borderColor: ACCENT,
    borderWidth: 1,
    color: ACCENT_TINT,
  });
  y = codeBoxTop - 18;
  text('รหัสลูกค้า (Customer Code)', MARGIN_X + 16, 10.5, MUTED);
  y -= 20;
  text(data.customer_code, MARGIN_X + 16, 16, ACCENT);
  y = codeBoxTop - codeBoxHeight - 14;

  // ── อายุการใช้งาน 2 ปีนับจากวันอนุมัติ — แจ้งลูกค้าไว้ในเอกสารตั้งแต่ต้น ต่ออายุ/
  // ตรวจสอบสถานะได้ที่แท็บ "การต่ออายุเข้าใช้ระบบ" ฝั่ง CSR (csr-actions.ts) ──
  text(`การลงทะเบียนนี้มีอายุการใช้งาน 2 ปี นับจากวันที่อนุมัติ — หมดอายุวันที่ ${formatThaiDate(data.access_expires_at)}`, MARGIN_X, 9, MUTED);
  y -= 16;

  // ── checkbox/ฟิลด์/ลายเซ็นฝั่งพนักงาน — ย้ายมาชิดขอบขวาเหมือนฝั่งลูกค้า
  // ใช้คอลัมน์ความกว้างเดียวกับ sigBlockLeft/sigBlockWidth ให้แนวขอบขวาตรงกันหมด ──
  const checkbox = (x: number, checked: boolean, label: string) => {
    const size = 11;
    const boxBottom = y - 2; // จัดกล่องให้อยู่ระดับเดียวกับ baseline ของ label (เดิมกล่องอยู่ต่ำกว่าตัวหนังสือ)
    page.drawRectangle({ x, y: boxBottom, width: size, height: size, borderColor: INK, borderWidth: 1 });
    if (checked) {
      page.drawLine({ start: { x: x + 1.5, y: boxBottom + size / 2 - 0.5 }, end: { x: x + size / 2, y: boxBottom + 1.5 }, thickness: 1.3, color: ACCENT });
      page.drawLine({ start: { x: x + size / 2, y: boxBottom + 1.5 }, end: { x: x + size - 1, y: boxBottom + size - 1 }, thickness: 1.3, color: ACCENT });
    }
    text(label, x + size + 6, 11, INK);
  };

  checkbox(sigBlockLeft, data.staff_action === 'approved', 'อนุมัติ');
  checkbox(sigBlockLeft + 110, data.staff_action === 'rejected', 'ไม่อนุมัติ');
  y -= 24;

  text('ชื่อพนักงานผู้ดำเนินการ', sigBlockLeft, 10.5, MUTED);
  y -= 15;
  text(data.staff_full_name, sigBlockLeft, 11.5, INK);
  y -= 20;

  text('วันที่ดำเนินการ', sigBlockLeft, 10.5, MUTED);
  y -= 15;
  text(formatThaiDate(data.decided_at), sigBlockLeft, 11.5, INK);
  y -= 22;

  // ── ลายเซ็นพนักงาน GPO ผู้ดำเนินการ — ฝังภาพลายเซ็นดิจิทัลของพนักงานที่กดอนุมัติ/ไม่อนุมัติ
  // (เดิมเป็นช่องเซ็นกำกับด้วยลายมือจริงบนกระดาษเปล่าๆ) เหมือนฝั่งลูกค้า ──
  text('ลงชื่อ (พนักงาน GPO)', sigBlockLeft, 10.5, MUTED);
  y -= 8;

  if (data.staff_signature_png) {
    try {
      const staffSigImage = await pdfDoc.embedPng(data.staff_signature_png);
      const staffSigDims = staffSigImage.scale(0.35);
      const staffSigX = sigBlockLeft + (sigBlockWidth - staffSigDims.width) / 2;
      page.drawImage(staffSigImage, { x: staffSigX, y: y - staffSigDims.height, width: staffSigDims.width, height: staffSigDims.height });
      y -= staffSigDims.height + 6;
    } catch {
      y -= 40;
    }
  } else {
    y -= 40;
  }
  page.drawLine({ start: { x: sigBlockLeft, y }, end: { x: sigBlockLeft + sigBlockWidth, y }, thickness: 0.75, color: BORDER });
  y -= 14;
  const staffNameWidth = thaiTextWidth(font, data.staff_full_name, 9.5);
  text(data.staff_full_name, sigBlockLeft + (sigBlockWidth - staffNameWidth) / 2, 9.5, MUTED);

  // ── Footer: เลขหน้า / วันที่ออกเอกสาร / หมายเหตุระบบอัตโนมัติ ──
  const footerY = 50;
  hr(footerY + 14, BORDER, 0.75);
  drawThaiText(page, 'เอกสารนี้สร้างโดยระบบอัตโนมัติ — GPO Xchange Portal', {
    x: MARGIN_X, y: footerY, size: 8, font, color: MUTED,
  });
  const issuedLabel = `ออกเอกสารเมื่อ ${formatThaiDate(new Date().toISOString())}`;
  const issuedWidth = thaiTextWidth(font, issuedLabel, 8);
  drawThaiText(page, issuedLabel, { x: PAGE_WIDTH - MARGIN_X - issuedWidth, y: footerY, size: 8, font, color: MUTED });

  return pdfDoc.save();
}
