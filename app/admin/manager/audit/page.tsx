import { redirect } from 'next/navigation';

// หน้า "บันทึกการตรวจสอบระบบ" ถูกรวมเข้ากับ SLA Monitoring System เป็นหน้าเดียว
// (/admin/manager/audit-trail แท็บ "บันทึกการตรวจสอบระบบ") — คง route นี้ไว้เป็น redirect
// กันลิงก์เก่า/บุ๊กมาร์กพัง
export default function LegacyAuditRedirect() {
  redirect('/admin/manager/audit-trail');
}
