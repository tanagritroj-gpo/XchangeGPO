import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { promises as fs } from 'fs';
import path from 'path';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 56;
const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.45, 0.45, 0.48);
const ACCENT = rgb(0.06, 0.32, 0.2); // ใกล้เคียงสีธีมเขียวของแบรนด์ (#0f5132)
const BORDER = rgb(0.8, 0.8, 0.82);

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
  staff_full_name: string;
  staff_action: 'approved' | 'rejected';
  decided_at: string;
};

function formatThaiDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}

export async function buildRegistrationConfirmationPdf(data: RegistrationDocumentInput) {
  const fontPath = path.join(process.cwd(), 'public', 'font', 'Sarabun-Regular.ttf');
  const fontBytes = await fs.readFile(fontPath);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes);
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  let y = PAGE_HEIGHT - 64;

  const text = (
    str: string,
    x: number,
    size = 11,
    color = INK,
  ) => page.drawText(str, { x, y, size, font, color });

  const centeredText = (str: string, size = 11, color = INK) => {
    const width = font.widthOfTextAtSize(str, size);
    page.drawText(str, { x: (PAGE_WIDTH - width) / 2, y, size, font, color });
  };

  const hr = (yPos: number) =>
    page.drawLine({
      start: { x: MARGIN_X, y: yPos },
      end: { x: PAGE_WIDTH - MARGIN_X, y: yPos },
      thickness: 0.75,
      color: BORDER,
    });

  // ── หัวเอกสาร ──
  centeredText('เอกสารยืนยันการลงทะเบียนใช้งานระบบ', 18, ACCENT);
  y -= 24;
  centeredText('GPO Xchange Portal', 13, MUTED);
  y -= 28;
  hr(y);
  y -= 32;

  // ── ข้อมูลหน่วยงาน/ผู้ติดต่อ (ชุดเดียวกับตอนลงทะเบียน) ──
  text('ข้อมูลหน่วยงานและผู้ติดต่อ', MARGIN_X, 12.5, ACCENT);
  y -= 22;

  const field = (label: string, value: string) => {
    text(label, MARGIN_X, 10.5, MUTED);
    text(value || '-', MARGIN_X + 130, 11.5, INK);
    y -= 22;
  };

  field('ชื่อหน่วยงาน / โรงพยาบาล', data.hospital_name);
  field('จังหวัด', data.province);
  field('ชื่อผู้ติดต่อ', data.contact_name);
  field('ตำแหน่ง', data.position);
  field('เบอร์โทรศัพท์', data.phone);
  field('อีเมล', data.email);
  field('วันที่ลงทะเบียน', formatThaiDate(data.registered_at));

  y -= 6;

  // ── กล่องรหัสลูกค้า (ผลลัพธ์ของการอนุมัติ) ──
  const codeBoxTop = y;
  const codeBoxHeight = 46;
  page.drawRectangle({
    x: MARGIN_X,
    y: codeBoxTop - codeBoxHeight,
    width: PAGE_WIDTH - MARGIN_X * 2,
    height: codeBoxHeight,
    borderColor: ACCENT,
    borderWidth: 1,
    color: rgb(0.93, 0.98, 0.96),
  });
  y = codeBoxTop - 18;
  text('รหัสลูกค้า (Customer Code)', MARGIN_X + 16, 10.5, MUTED);
  y -= 20;
  text(data.customer_code, MARGIN_X + 16, 16, ACCENT);
  y = codeBoxTop - codeBoxHeight - 36;

  // ── ลายเซ็นลูกค้า ──
  text('ลายเซ็นต์ผู้มีอำนาจลงนาม (ฝั่งลูกค้า)', MARGIN_X, 10.5, MUTED);
  y -= 8;

  if (data.customer_signature_png) {
    try {
      const sigImage = await pdfDoc.embedPng(data.customer_signature_png);
      const sigDims = sigImage.scale(0.35);
      page.drawImage(sigImage, { x: MARGIN_X, y: y - sigDims.height, width: sigDims.width, height: sigDims.height });
      y -= sigDims.height + 6;
    } catch {
      y -= 40;
    }
  } else {
    y -= 40;
  }
  page.drawLine({ start: { x: MARGIN_X, y }, end: { x: MARGIN_X + 220, y }, thickness: 0.75, color: BORDER });
  y -= 14;
  text(`(${data.contact_name})`, MARGIN_X, 9.5, MUTED);

  y -= 44;
  hr(y);
  y -= 30;

  // ── ส่วนของพนักงาน GPO ──
  text('ส่วนของพนักงาน GPO', MARGIN_X, 12.5, ACCENT);
  y -= 26;

  const checkbox = (x: number, checked: boolean, label: string) => {
    const size = 11;
    page.drawRectangle({ x, y: y - size + 2, width: size, height: size, borderColor: INK, borderWidth: 1 });
    if (checked) {
      page.drawLine({ start: { x: x + 1.5, y: y - size / 2 + 1 }, end: { x: x + size / 2, y: y - size + 2.5 }, thickness: 1.3, color: ACCENT });
      page.drawLine({ start: { x: x + size / 2, y: y - size + 2.5 }, end: { x: x + size - 1, y: y + 1 }, thickness: 1.3, color: ACCENT });
    }
    text(label, x + size + 6, 11, INK);
  };

  checkbox(MARGIN_X, data.staff_action === 'approved', 'อนุมัติ');
  checkbox(MARGIN_X + 140, data.staff_action === 'rejected', 'ไม่อนุมัติ');
  y -= 30;

  text('ชื่อพนักงานผู้ดำเนินการ', MARGIN_X, 10.5, MUTED);
  text(data.staff_full_name, MARGIN_X + 130, 11.5, INK);
  y -= 22;

  text('วันที่ดำเนินการ', MARGIN_X, 10.5, MUTED);
  text(formatThaiDate(data.decided_at), MARGIN_X + 130, 11.5, INK);
  y -= 50;

  // ── ช่องเซ็นกำกับด้วยลายมือจริงบนกระดาษ (ไม่ใช่ digital signature) ──
  page.drawLine({ start: { x: MARGIN_X, y }, end: { x: MARGIN_X + 220, y }, thickness: 0.75, color: BORDER });
  y -= 14;
  text('ลงชื่อ (พนักงาน GPO) — เซ็นกำกับด้วยลายมือ', MARGIN_X, 9.5, MUTED);

  return pdfDoc.save();
}
