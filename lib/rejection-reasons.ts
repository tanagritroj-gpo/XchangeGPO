export const REJECTION_REASONS = [
  { code: 'damaged', label: 'สินค้าชำรุด/เสียหาย' },
  { code: 'incomplete_docs', label: 'เอกสารไม่ครบถ้วน/ไม่ถูกต้อง' },
  { code: 'expired_window', label: 'เกินระยะเวลาที่กำหนดคืนสินค้า' },
  { code: 'customer_cancelled', label: 'ลูกค้ายกเลิก/ขอยกเลิกคำร้องเอง' },
  { code: 'other', label: 'อื่นๆ' },
] as const;

export type RejectionReasonCode = (typeof REJECTION_REASONS)[number]['code'];

export const REJECTION_REASON_CODES = REJECTION_REASONS.map((r) => r.code) as RejectionReasonCode[];

export function isRejectionReasonCode(value: unknown): value is RejectionReasonCode {
  return typeof value === 'string' && (REJECTION_REASON_CODES as string[]).includes(value);
}

export function getRejectionReasonLabel(code: string): string {
  return REJECTION_REASONS.find((r) => r.code === code)?.label ?? code;
}

/** รวม reason code + รายละเอียดที่พิมพ์เพิ่ม (ใช้เฉพาะตอนเลือก "อื่นๆ") ให้เป็นข้อความเดียว
 *  เก็บลง staff_remark เพื่อให้คนอ่าน log ตรงๆ ยังเห็นข้อความที่เข้าใจง่ายเหมือนเดิม
 *  ส่วนการนับสถิติให้ group ตาม rejection_reason_code เท่านั้น ไม่ใช้ข้อความนี้ */
export function buildRejectionRemark(code: string, detail: string): string {
  const label = getRejectionReasonLabel(code);
  const trimmedDetail = detail.trim();
  if (code === 'other') return trimmedDetail || label;
  return trimmedDetail ? `${label}: ${trimmedDetail}` : label;
}
