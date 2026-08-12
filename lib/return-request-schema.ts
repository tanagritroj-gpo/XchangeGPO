import { z } from 'zod';

/**
 * Validation ร่วมสำหรับข้อมูลฟอร์มคำร้องคืน/แลกเปลี่ยนสินค้า — ใช้ทั้งฝั่งลูกค้า
 * (app/actions/form-actions.ts) และฝั่ง CSR กรอกแทน (app/actions/staff-form-actions.ts)
 * ให้ขอบเขตค่าที่ยอมรับตรงกันทั้งสองช่องทาง
 *
 * เดิม qty/unitPrice มีแค่ Math.max(0, Number(x) || 0) กันติดลบ/NaN ไม่มีขอบเขตบนเลย
 * และฟิลด์ข้อความอิสระ (return_reason, agent_info, ที่อยู่ ฯลฯ) ไม่มีการจำกัดความยาว
 * เลยสักตัว (พบระหว่าง security audit 11 ส.ค. 2569) — ทุก transform ด้านล่างนี้ "sanitize
 * ไม่ reject" ตามพฤติกรรมเดิมของทั้งสองไฟล์ ไม่มี error ใหม่ให้ผู้ใช้ปกติเจอ เพิ่มแค่ขอบเขต
 * บนที่ไม่เคยมีมาก่อน — ไม่ใช่ช่องโหว่ SQL injection (parameterized query อยู่แล้วทุกจุด)
 * แต่กันข้อมูลเพี้ยนที่กระทบ data quality ของ dashboard/รายงานในระยะยาว และกันคำขอที่ยัด
 * ข้อความ/ตัวเลขผิดปกติเข้ามาจาก client ที่ไม่ผ่าน UI จริง (เช่น เรียก server action ตรง)
 */

export const MAX_ITEMS_PER_REQUEST = 5;

// ใช้ z.any() รับค่าดิบได้ทุกแบบ (ไม่ throw แม้ type จะเพี้ยนจากที่ UI ส่งจริง เช่น
// เรียก server action ตรงแล้วส่ง number/object มาแทน string) แล้ว sanitize เองใน transform
const clampedNumber = (max: number) =>
  z.any().transform((v) => Math.min(Math.max(Number(v) || 0, 0), max));

const text = (max: number, fallback = '') =>
  z.any().transform((v) => (String(v ?? '').trim() || fallback).slice(0, max));

// รายการยา 1 รายการ — bound กว้างพอสำหรับการใช้งานจริง ไม่ได้ตั้งใจจำกัด business logic
export const DrugItemInputSchema = z.object({
  drugName: text(200),
  qty: clampedNumber(100_000),
  unit: text(50, 'ไม่ระบุ'),
  lot: text(100),
  exp: text(50), // sanitizeDate() ใน form-actions/staff-form-actions validate รูปแบบวันที่จริงต่ออีกชั้น
  unitPrice: clampedNumber(10_000_000),
  inv: text(100),
});

export type DrugItemInput = z.infer<typeof DrugItemInputSchema>;

// ฟิลด์ข้อความอิสระระดับคำร้อง (เหตุผล/ที่อยู่/รายละเอียดสินค้า) — คอลัมน์ DB เป็น text
// ไม่จำกัดความยาวเลย ตัดที่ 2000 ตัวอักษรกว้างพอสำหรับข้อความจริง ไม่มีธุรกิจไหนต้องพิมพ์ยาวขนาดนั้น
const FreeTextSchema = z.any().transform((v) => (v == null ? undefined : String(v).slice(0, 2000)));

export function sanitizeFreeText(value: unknown): string | undefined {
  return FreeTextSchema.parse(value);
}
