import { degrees } from 'pdf-lib';
import type { Color, PDFFont, PDFPage } from 'pdf-lib';

// pdf-lib วาดตัวอักษรทีละกลุ่มโดยรวมความกว้าง (advance width) ของแต่ละ glyph
// ตรงๆ ไม่มีการทำ OpenType shaping (ไม่มี GPOS mark-to-base positioning) ทำให้
// สระบน/วรรณยุกต์ของไทยที่ต้อง "ลอย" ซ้อนอยู่บนพยัญชนะโดยไม่กินความกว้างเพิ่ม
// กลับถูกนับความกว้างจริงจากฟอนต์ (ที่ออกแบบมาสำหรับ renderer ที่ทำ shaping)
// พอมีสระ+วรรณยุกต์ซ้อนกัน 2 ตัวบนพยัญชนะเดียว (เช่น "ชื่อ" = ช+ื+่+อ หรือ
// "ฝั่ง" = ฝ+ั+่+ง) ความกว้างที่นับเกินของทั้งสองตัวจะรวมกันจนเห็นเป็นช่องว่าง
// แปลกๆ ก่อนตัวอักษรถัดไปชัดเจน ทั้งที่ข้อความต้นทางไม่มีช่องว่างอยู่เลย
//
// pdf-lib วาง glyph ของสระบน/วรรณยุกต์ "ถูกตำแหน่ง" อยู่แล้วตามลำดับปกติ (ฟอนต์
// นี้ฝัง offset แนวตั้งไว้ในตัว glyph เอง) ปัญหาจึงมีแค่ "ความกว้างที่บวกเกิน"
// หลังวาดตัวมันไป — แก้แค่ไม่เลื่อน cursor ต่อหลังวาดตัวอักษรกลุ่มนี้ ตำแหน่งที่
// วาดยังคงเรียงตามลำดับปกติเหมือน pdf-lib วาดเอง (ไม่ต้องขยับย้อนกลับ)
const THAI_NON_SPACING_MARKS = /[ัิ-ฺ็-๎]/;

// pdf-lib ก็ไม่ทำ GPOS mark-to-mark positioning เช่นกัน — เมื่อพยัญชนะตัวเดียวมีทั้ง
// สระบน (เช่น ื) และวรรณยุกต์ (เช่น ่) ซ้อนกัน 2 ตัว ฟอนต์จะวาดทั้งคู่ที่ตำแหน่งความสูง
// "เหนือพยัญชนะ" เดียวกัน (ตำแหน่งที่ออกแบบไว้สำหรับกรณีมีเครื่องหมายเดียว) ทำให้ตัวหลัง
// ทับตัวแรกสนิทจนดูเหมือนสระ/วรรณยุกต์ตัวแรกหายไป ("ชื่อ" ื+่ ทับกันจนเห็นเป็นตัวเดียว)
// ต้องขยับตัวที่ซ้อนถัดไปให้สูง/ต่ำขึ้นเองตามลำดับ
const THAI_ABOVE_MARKS = /[ัิ-ื็-๎]/; // ั ิ ี ึ ื และ ็ ่ ้ ๊ ๋ ์ ํ ๎ — ลอยเหนือพยัญชนะ
const THAI_BELOW_MARKS = /[ุ-ฺ]/; // ุ ู ฺ — ลอยใต้พยัญชนะ

type DrawOpts = {
  x: number;
  y: number;
  size: number;
  font: PDFFont;
  color: Color;
  rotate?: number;   // องศา (ทวนเข็ม) — สำหรับลายน้ำ; ไม่ใส่ = แนวนอนปกติ
  opacity?: number;  // 0–1 — สำหรับลายน้ำ
};

export function drawThaiText(page: PDFPage, str: string, opts: DrawOpts) {
  const rad = ((opts.rotate ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotateOpt = opts.rotate ? { rotate: degrees(opts.rotate) } : {};
  const opacityOpt = opts.opacity != null ? { opacity: opts.opacity } : {};

  let advance = 0; // ระยะตามแนว baseline (หมุนแล้ว) ที่เดินไปแล้ว
  let aboveStack = 0;
  let belowStack = 0;
  const stackStep = opts.size * 0.22;
  for (const ch of str) {
    const isAbove = THAI_ABOVE_MARKS.test(ch);
    const isBelow = THAI_BELOW_MARKS.test(ch);
    if (!isAbove && !isBelow) {
      aboveStack = 0;
      belowStack = 0;
    }
    let dy = 0;
    if (isAbove) {
      dy = aboveStack * stackStep;
      aboveStack += 1;
    } else if (isBelow) {
      dy = -belowStack * stackStep;
      belowStack += 1;
    }
    // จุดวาดจริง = จุดเริ่ม + เดินตามแนว baseline + ยกสระ/วรรณยุกต์ตั้งฉากกับ baseline
    // (rotate=0 → x = opts.x + advance, y = opts.y + dy เหมือนเดิมทุกประการ)
    page.drawText(ch, {
      x: opts.x + advance * cos - dy * sin,
      y: opts.y + advance * sin + dy * cos,
      size: opts.size,
      font: opts.font,
      color: opts.color,
      ...rotateOpt,
      ...opacityOpt,
    });
    if (!THAI_NON_SPACING_MARKS.test(ch)) {
      advance += opts.font.widthOfTextAtSize(ch, opts.size);
    }
  }
}

export function thaiTextWidth(font: PDFFont, str: string, size: number): number {
  let width = 0;
  for (const ch of str) {
    if (!THAI_NON_SPACING_MARKS.test(ch)) {
      width += font.widthOfTextAtSize(ch, size);
    }
  }
  return width;
}

// ตัดคำ (word-wrap) แบบง่าย — ใช้กับข้อความยาวๆ ที่มีวรรคคั่นวลี/คำเป็นระยะ
// (เช่น ข้อความยินยอม PDPA) โดยรวมคำทีละคำจนกว่าจะเกินความกว้างที่กำหนด
export function wrapThaiParagraph(font: PDFFont, str: string, size: number, maxWidth: number): string[] {
  const words = str.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (thaiTextWidth(font, candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}
