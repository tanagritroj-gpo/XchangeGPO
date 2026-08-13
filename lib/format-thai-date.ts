// เอาไว้ format วันที่แบบไทยสั้นๆ ให้ email template อ่านง่าย — คืน null ถ้าไม่มีค่า/parse
// ไม่ได้ แทนที่จะโยน error ให้ทั้งอีเมลส่งไม่ออกเพราะวันที่ตัวเดียว
export function formatThaiDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}
