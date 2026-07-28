/** แปลงค่าจาก ReasonSelectFields (code ที่เลือก + detail ที่พิมพ์เสริม) ให้เป็น
 *  ข้อความ remark เดียว — ใช้กับ dropdown ที่ไม่มีคอลัมน์ enum แยกเก็บใน DB (ต่างจาก
 *  reject ที่มี rejection_reason_code) เพราะยังไม่มีสถิติใดต้อง group ตามหมายเหตุ
 *  ฝั่ง approve/accept ในตอนนี้ — ถ้าในอนาคตต้องการก็ค่อยเพิ่มคอลัมน์แบบเดียวกัน */
export function resolveQuickNote(
  options: readonly { code: string; label: string }[],
  code: string,
  detail: string,
  otherCode: string = 'other',
): string {
  if (code === otherCode) return detail.trim();
  return options.find((o) => o.code === code)?.label ?? code;
}
