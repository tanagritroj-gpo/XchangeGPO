import { describe, it, expect } from 'vitest';
import {
  PAGE_H,
  LAYOUT,
  TABLE_MAX_ROWS,
  tableCell,
  thaiDateParts,
  thaiDateFull,
  drawField,
  drawCheck,
} from '../pdf-form-layout';

// ── การแปลงวันที่เป็นไทย (พ.ศ. + ชื่อเดือน) ───────────────────────────────────
describe('thaiDateParts / thaiDateFull', () => {
  it('splits ISO date into day / Thai month / Buddhist year', () => {
    expect(thaiDateParts('2026-08-30T04:00:00Z')).toEqual({ day: '30', month: 'สิงหาคม', year: '2569' });
  });

  it('handles a plain YYYY-MM-DD date column value', () => {
    expect(thaiDateParts('2026-09-05')).toEqual({ day: '5', month: 'กันยายน', year: '2569' });
  });

  it('returns null for null / empty / invalid', () => {
    expect(thaiDateParts(null)).toBeNull();
    expect(thaiDateParts('')).toBeNull();
    expect(thaiDateParts('not-a-date')).toBeNull();
  });

  it('thaiDateFull renders "D month YYYY" or empty string', () => {
    expect(thaiDateFull('2026-01-01')).toBe('1 มกราคม 2569');
    expect(thaiDateFull(null)).toBe('');
  });
});

// ── ตารางยา: พิกัดคอลัมน์/แถว ────────────────────────────────────────────────
describe('tableCell', () => {
  it('keeps every column inside the printed table box (x 55.6–560.1pt)', () => {
    for (let row = 0; row < TABLE_MAX_ROWS; row++) {
      for (const col of ['no', 'name', 'qty', 'lot', 'exp', 'ref'] as const) {
        const spec = tableCell(col, row);
        expect(spec.x).toBeGreaterThan(55);
        expect(spec.x).toBeLessThan(560);
        expect(spec.maxWidth).toBeGreaterThan(0);
      }
    }
  });

  it('advances one printed row height (~36.7pt) per row, downward in pdf-lib coords', () => {
    const r0 = tableCell('name', 0).y;
    const r1 = tableCell('name', 1).y;
    expect(r0 - r1).toBeCloseTo(36.7, 1);
  });

  it('row 5 baseline still sits above the table bottom line (y≈PAGE_H-524.4)', () => {
    expect(tableCell('name', 4).y).toBeGreaterThan(PAGE_H - 524.4);
  });

  it('centers numeric columns, left-aligns name', () => {
    expect(tableCell('qty', 0).align).toBe('center');
    expect(tableCell('name', 0).align).toBe('left');
  });
});

// ── layout table sanity ─────────────────────────────────────────────────────
describe('LAYOUT', () => {
  it('every field spec lands on the page', () => {
    for (const [key, spec] of Object.entries(LAYOUT)) {
      if (typeof spec === 'number') continue; // exchange_item_wrap_x
      if ('yFromTop' in spec) {
        expect(spec.yFromTop, key).toBeGreaterThan(0);
        expect(spec.yFromTop, key).toBeLessThan(PAGE_H);
        continue;
      }
      if ('centerX' in spec) {
        expect(spec.centerX, key).toBeGreaterThan(0);
        continue;
      }
      expect(spec.y, key).toBeGreaterThan(0);
      expect(spec.y, key).toBeLessThan(PAGE_H);
      expect(spec.x, key).toBeGreaterThan(0);
      expect(spec.x, key).toBeLessThan(596);
    }
  });
});

// ── drawField: align / shrink / wrap ────────────────────────────────────────
type Call = { text: string; x: number; y: number; size: number };

function fakePage() {
  const calls: Call[] = [];
  return {
    calls,
    page: { drawText: (text: string, o: any) => calls.push({ text, x: o.x, y: o.y, size: o.size }) } as any,
  };
}

// ฟอนต์จำลอง: ทุกตัวอักษรกว้าง = 0.6·size (พอสำหรับทดสอบ logic ของ shrink/align/wrap)
const fakeFont = {
  widthOfTextAtSize: (s: string, size: number) => s.length * size * 0.6,
} as any;
const BLACK = { type: 'RGB', red: 0, green: 0, blue: 0 } as any;

describe('drawField', () => {
  it('does nothing for null / empty', () => {
    const { calls, page } = fakePage();
    drawField(page, fakeFont, BLACK, null, { x: 100, y: 100, size: 12, align: 'left', maxWidth: 200 });
    drawField(page, fakeFont, BLACK, '   ', { x: 100, y: 100, size: 12, align: 'left', maxWidth: 200 });
    expect(calls).toHaveLength(0);
  });

  it('left-aligns at spec.x', () => {
    const { calls, page } = fakePage();
    drawField(page, fakeFont, BLACK, 'ab', { x: 100, y: 50, size: 10, align: 'left', maxWidth: 200 });
    expect(calls[0].x).toBe(100);
  });

  it('center-aligns around spec.x', () => {
    const { calls, page } = fakePage();
    // "abcd" @ size10 => width 24 => starts at 100 - 12
    drawField(page, fakeFont, BLACK, 'abcd', { x: 100, y: 50, size: 10, align: 'center', maxWidth: 200 });
    expect(calls[0].x).toBeCloseTo(88, 5);
  });

  it('shrinks font until the text fits maxWidth', () => {
    const { calls, page } = fakePage();
    // 20 chars: @12 => 144 > 50; shrinks (0.5 steps) until <= 50  => size ~4? floored at minSize 8 -> stays 8 (still overflow allowed)
    drawField(page, fakeFont, BLACK, 'x'.repeat(20), { x: 0, y: 0, size: 12, align: 'left', maxWidth: 50 }, { minSize: 8 });
    expect(calls[0].size).toBe(8);

    const b = fakePage();
    // 10 chars @12 => 72 > 60 ; @11 => 66 ; @10 => 60 <= 60  => size 10
    drawField(b.page, fakeFont, BLACK, 'x'.repeat(10), { x: 0, y: 0, size: 12, align: 'left', maxWidth: 60 });
    expect(b.calls[0].size).toBe(10);
  });

  it('wraps to at most `wrap` lines and starts continuation lines at wrapX', () => {
    const { calls, page } = fakePage();
    const text = Array(12).fill('word').join(' '); // 12 short words
    drawField(page, fakeFont, BLACK, text, { x: 250, y: 400, size: 10, align: 'left', maxWidth: 60 }, {
      wrap: 3, wrapX: 40, wrapWidth: 120,
    });
    // drawThaiText วาดทีละตัวอักษร — จัดกลุ่มตามค่า y เพื่อนับ "บรรทัด"
    const lineYs = [...new Set(calls.map((c) => Math.round(c.y)))].sort((a, b) => b - a);
    expect(lineYs.length).toBeGreaterThan(1);
    expect(lineYs.length).toBeLessThanOrEqual(3);
    const firstLine = calls.filter((c) => Math.round(c.y) === lineYs[0]);
    const secondLine = calls.filter((c) => Math.round(c.y) === lineYs[1]);
    expect(Math.min(...firstLine.map((c) => c.x))).toBe(250); // บรรทัดแรกเริ่มหลัง label
    expect(Math.min(...secondLine.map((c) => c.x))).toBe(40); // บรรทัดต่อเริ่มที่ wrapX
  });
});

describe('drawCheck', () => {
  it('draws an "X" at the mark, converting yFromTop to pdf-lib coords', () => {
    const { calls, page } = fakePage();
    drawCheck(page, fakeFont, BLACK, { x: 135, yFromTop: 248 });
    expect(calls[0].text).toBe('X');
    expect(calls[0].x).toBe(135);
    expect(calls[0].y).toBeCloseTo(PAGE_H - 248, 5);
  });
});
