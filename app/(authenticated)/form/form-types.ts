// รูปแบบข้อมูลที่ใช้ร่วมกันระหว่างทุกขั้นตอนของ wizard ยื่นคำขอคืน/แลกเปลี่ยน
// (ทั้งฝั่งลูกค้า app/(authenticated)/form และฝั่ง CSR กรอกแทน app/admin/csr/form)

// re-export จาก lib/types.ts (ที่เดียวกับ StaffSessionInfo/RequestRow ฯลฯ) — คงชื่อ
// import เดิมไว้ให้ไฟล์ที่ import จาก '../form-types' ไม่ต้องแก้
export type { CustomerSessionInfo } from '@/lib/types';
import type { CustomerSessionInfo } from '@/lib/types';

export interface DrugItemEntry {
  id?: number;
  drugName: string;
  qty: string;
  unit: string;
  lot: string;
  exp: string;
  unitPrice: string;
  val: string;
  inv: string;
}

export interface ReturnFormSender extends Partial<CustomerSessionInfo> {
  request_type?: string;
  return_reason?: string;
  customer_email?: string;
  b2b_customer_id?: number;
  // ★ ฝั่ง CSR กรอกแทนเท่านั้น — ขั้นเลือกลูกค้ามองในมุม organization (hospital_name)
  // ล้วนๆ ไม่ผูกกับ b2b_customer รายคนอีกต่อไป (ดู Step1InfoStaff.tsx/CustomerPicker.tsx)
  organization_id?: number;
}

export interface ReturnFormData {
  sender?: ReturnFormSender;
  items: DrugItemEntry[];
  reason?: string;
  signature?: string | null;
  signature_url?: string;
  signer_name?: string;
  signer_position?: string;
  totalValue: number;
  return_reason?: string;
  delivery_type?: string;
  addr_street?: string;
  addr_sub?: string;
  addr_district?: string;
  addr_province?: string;
  agent_info?: string;
  agent_appointment_note?: string;
  agent_appointment_date?: string;
  exchange_product_type?: string;
  exchange_product_list?: string;
  exchange_product_other?: string;
  // base64 data URI ของรูปถ่ายใบส่งของ (data:image/...;base64,...) — ระดับคำร้อง ไม่ใช่ระดับ
  // รายการยา (ใบส่งของคือเอกสาร 1 ใบต่อการจัดส่ง ไม่ใช่ 1 ใบต่อยา 1 รายการ) เฉพาะฝั่งฟอร์ม
  // ลูกค้ากรอกเอง (Step2Items.tsx ต้องเปิด allowDeliveryPhoto ถึงจะมีค่านี้ได้)
  deliveryNotePhotoUrls?: string[];
}
