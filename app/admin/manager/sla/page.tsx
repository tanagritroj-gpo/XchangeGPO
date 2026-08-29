import { redirect } from 'next/navigation';

// หน้า SLA Monitoring System ถูกรวมเข้ากับ "บันทึกการตรวจสอบระบบ" เป็นหน้าเดียว
// (/admin/manager/audit-trail) — คง route นี้ไว้เป็น redirect กันลิงก์เก่า/บุ๊กมาร์กพัง
export default function LegacySlaRedirect() {
  redirect('/admin/manager/audit-trail');
}
