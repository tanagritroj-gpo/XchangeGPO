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

// status_name ใน timeline เป็น free-text ที่อาจเป็นภาษาไทยที่ staff พิมพ์เอง จึงยังใช้ keyword matching ตรงนี้
export function getStatusMeta(statusName: string = '') {
  if (/ปฏิเสธ|ยกเลิก|ไม่อนุมัติ/.test(statusName)) {
    return { icon: XCircle, bg: 'bg-red-50', fg: 'text-red-600' };
  }
  if (/เสร็จสิ้น|สำเร็จ|ปิดงาน/.test(statusName)) {
    return { icon: Check, bg: 'bg-emerald-50', fg: 'text-emerald-600' };
  }
  if (/อนุมัติ/.test(statusName)) {
    return { icon: FileCheck, bg: 'bg-emerald-50', fg: 'text-emerald-600' };
  }
  if (/ตรวจรับ|คลัง|ขนส่ง|จัดส่ง/.test(statusName)) {
    return { icon: Truck, bg: 'bg-amber-50', fg: 'text-amber-600' };
  }
  return { icon: Clock, bg: 'bg-sky-50', fg: 'text-sky-600' };
}

export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return `${new Intl.NumberFormat('th-TH').format(value)} บาท`;
}