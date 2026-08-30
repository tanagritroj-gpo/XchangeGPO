import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
//  Next.js "use server" contract: ทุก export ในไฟล์ Server Actions ต้องเป็น
//  async function เท่านั้น (นอกจากนี้ยอมให้ประกาศ type/interface ที่ถูก erase หมด
//  ตอน compile) — โดยเฉพาะ `export type { X }` / `export { x }` / `export const`
//  ทำให้ SWC pass ของ Server Actions emit เป็น value re-export ของ binding ที่
//  ถูก erase ไปแล้ว → ReferenceError ตอน runtime (พบจริง 30 ส.ค. 2569: refactor
//  sale-lookup-actions.ts ใส่ `export type { SaleRepInfo }` → "SaleRepInfo is not
//  defined" ตอนลูกค้ากดกรอกฟอร์ม — vitest ปกติจับไม่ได้เพราะไม่รัน SWC pass นี้
//  ต้อง `npm run build` หรือ dev runtime ถึงเจอ → เทสต์นี้สแกน source แทน)
// ─────────────────────────────────────────────────────────────────────────────

const ACTIONS_DIR = path.resolve(__dirname, '..');

function listActionFiles(): string[] {
  return readdirSync(ACTIONS_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map((f) => path.join(ACTIONS_DIR, f))
    .filter((full) => {
      const head = readFileSync(full, 'utf8').slice(0, 40);
      return /^\s*['"]use server['"]/.test(head);
    });
}

// ตัด comment + string literal ออกคร่าว ๆ ก่อนหา export (พอสำหรับสแกนบรรทัดแรกของ statement)
function stripNoise(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

type ExportViolation = { file: string; line: number; text: string; why: string };

function findViolations(file: string): ExportViolation[] {
  const src = stripNoise(readFileSync(file, 'utf8'));
  const out: ExportViolation[] = [];
  src.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line.startsWith('export ')) return;

    // อนุญาต: การประกาศชนิดล้วน ๆ (ถูก erase ทั้งหมด ไม่มี runtime binding)
    if (/^export\s+(type|interface)\s+[A-Za-z]/.test(line)) return;
    if (/^export\s+async\s+function\s+/.test(line)) return;

    const short = path.basename(file);
    if (/^export\s+type\s*\{/.test(line)) {
      out.push({ file: short, line: i + 1, text: line, why: 'type re-export — SWC emits value re-export of an erased binding' });
    } else if (/^export\s*\{/.test(line)) {
      out.push({ file: short, line: i + 1, text: line, why: 'value re-export — not an async function' });
    } else if (/^export\s+(const|let|var)\s+/.test(line)) {
      out.push({ file: short, line: i + 1, text: line, why: 'exported constant — Server Actions must export only async functions' });
    } else if (/^export\s+default\b/.test(line)) {
      out.push({ file: short, line: i + 1, text: line, why: 'default export not allowed in a Server Actions file' });
    } else if (/^export\s+function\s+/.test(line)) {
      out.push({ file: short, line: i + 1, text: line, why: 'non-async exported function — Server Actions must be async' });
    } else if (/^export\s+\*/.test(line)) {
      out.push({ file: short, line: i + 1, text: line, why: 'wildcard re-export not allowed in a Server Actions file' });
    }
  });
  return out;
}

describe("'use server' files export only async functions (+ erasable types)", () => {
  const files = listActionFiles();

  it('finds the Server Actions files to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [path.basename(f), f] as const))('%s has no non-async-function value export', (_name, file) => {
    const violations = findViolations(file);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
