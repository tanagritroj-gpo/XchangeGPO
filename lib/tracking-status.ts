import { Truck, FileCheck, XCircle, Clock, Check } from 'lucide-react';

export const REJECTED_STATUS = 'rejected';

export const STATUS_LABELS: Record<string, string> = {
  pending_review: 'รอตรวจสอบคำร้อง',
  approved: 'อนุมัติคำร้องแล้ว',
  rejected: 'ถูกปฏิเสธ',
  in_transit: 'อยู่ระหว่างรับคืนสินค้า',
  at_warehouse: 'สินค้ากลับคืนถึงคลังแล้ว',
  checked_in: 'ตรวจสอบสภาพสินค้ารับคืน',
  receiving: 'ตรวจรับสินค้าสำเร็จ',
  exchanging: 'กำลังดำเนินการแลกเปลี่ยน',
  completed: 'เสร็จสิ้น',
  out_for_delivery: 'อยู่ระหว่างจัดส่งคืน',
};

export function getStatusLabel(status: string = '') {
  return STATUS_LABELS[status] ?? status;
}

// ประวัติดำเนินการ (timeline_summary.status_name) บางแถวเก็บเป็น enum โค้ดภาษาอังกฤษเดียวกับ current_status
// (log ที่ระบบสร้างอัตโนมัติ) บางแถวเป็นข้อความไทยที่ staff กรอกเอง — ฟังก์ชันนี้แปลงเป็นคำอธิบายไทยกำกับเพิ่ม
// เฉพาะกรณี match กับ enum เท่านั้น ไม่งั้นคืนค่า null (กันโชว์ข้อความไทยซ้ำซ้อนกับของเดิม)
export function getTimelineDescription(statusName: string = '') {
  const label = STATUS_LABELS[statusName];
  return label && label !== statusName ? label : null;
}

// map enum ไปเป็นขั้นบน stepper สรุปภาพรวม 4 ขั้น (รายละเอียดขนส่ง/คลังหลายสถานะรวมเป็นขั้นเดียวกัน)
export const STAGES = [
  { key: 'pending_review', label: 'รับคำร้อง' },
  { key: 'approved', label: 'อนุมัติ' },
  { key: 'processing', label: 'ตรวจรับ/ขนส่ง' },
  { key: 'completed', label: 'เสร็จสิ้น' },
];

const STATUS_TO_STAGE_INDEX: Record<string, number> = {
  pending_review: 0,
  approved: 1,
  in_transit: 2,
  at_warehouse: 2,
  checked_in: 2,
  receiving: 2,
  exchanging: 2,
  out_for_delivery: 2,
  completed: 3,
};

// rejected ไม่อยู่บน stepper ปกติ (คืน -1 เพื่อซ่อน stepper แล้วโชว์แค่ badge สีแดงแทน)
export function getCurrentStageIndex(currentStatus: string = '') {
  if (currentStatus === REJECTED_STATUS) return -1;
  return STATUS_TO_STAGE_INDEX[currentStatus] ?? -1;
}

type StatusMeta = { icon: typeof Clock; bg: string; fg: string };

const RED: StatusMeta = { icon: XCircle, bg: 'bg-red-50', fg: 'text-red-600' };
const GREEN_CHECK: StatusMeta = { icon: Check, bg: 'bg-emerald-50', fg: 'text-emerald-600' };
const GREEN_APPROVE: StatusMeta = { icon: FileCheck, bg: 'bg-emerald-50', fg: 'text-emerald-600' };
const AMBER: StatusMeta = { icon: Truck, bg: 'bg-amber-50', fg: 'text-amber-600' };
const DEFAULT: StatusMeta = { icon: Clock, bg: 'bg-sky-50', fg: 'text-sky-600' };

// ทุกค่าที่โค้ดใน app/actions/*.ts เขียนลง status_logs.status_name จริง ณ วันที่เขียนไฟล์นี้
// (ยืนยันด้วย grep ทั้ง repo) — ค่าที่ไม่อยู่ใน list นี้ (เช่น remark ที่พนักงานพิมพ์เป็นประโยคไทยเอง
// ในบาง flow) จะ fallback ไป DEFAULT แทนการเดาด้วย regex เหมือนเดิม
const STATUS_META: Record<string, StatusMeta> = {
  rejected: RED,
  completed: GREEN_CHECK,
  approved: GREEN_APPROVE,
  checked_in: AMBER,
  checked_in_confirmed: AMBER,
  receiving: AMBER,
  at_warehouse: AMBER,
  in_transit: AMBER,
  exchanging: AMBER,
  document_generated: DEFAULT,
  email_sent: DEFAULT,
  // ไม่ใช่ status_logs.status_name จริง แต่เป็น key ของ STAGES (4-step stepper) —
  // ใส่ไว้ในตารางเดียวกันเพราะ customer/history/page.tsx เรียก getStatusMeta(stage.key)
  pending_review: DEFAULT,
  processing: AMBER,
};

export function getStatusMeta(statusName: string = '') {
  return STATUS_META[statusName] ?? DEFAULT;
}

export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return `${new Intl.NumberFormat('th-TH').format(value)} บาท`;
}