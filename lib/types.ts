// Row shapes ของตารางหลักที่ query แล้วส่งต่อข้ามหลายไฟล์ (dashboard, report export,
// chatbot stats) — Supabase client ในโปรเจกต์นี้ไม่ได้ผูกกับ generated Database types
// (ดู lib/supabase/admin.ts) ผลลัพธ์จาก .select() จึงเป็น any โดยปริยายเสมอ ไฟล์นี้เป็น
// ที่รวม "รูปร่างข้อมูลที่ควรจะเป็น" ไว้ที่เดียว ให้ทุกจุดที่รับข้อมูลต่อจาก query import ไปใช้
// แทนการเขียน `: any` ซ้ำที่ตัวเอง

export interface DrugItemRow {
  id: number;
  request_id: number;
  drug_name: string;
  qty: number;
  unit: string;
  lot_number: string | null;
  exp_date: string | null;
  unit_price: number | null;
  value_amount: number | null;
  invoice_number: string | null;
  product_type: string | null;
  current_status: string | null;
  is_compliant: boolean | null;
  compliance_remark: string | null;
}

export interface RequestRow {
  id: number;
  ref_id: string;
  request_date: string | null;
  request_type: string | null;
  transaction_date: string | null;
  hospital_name: string | null;
  province: string | null;
  customer_code: string | null;
  phone: string | null;
  contact_name: string | null;
  return_reason: string | null;
  exchange_product: string | null;
  delivery_type: string | null;
  agent_info: string | null;
  addr_street: string | null;
  addr_district: string | null;
  signature_url: string | null;
  signer_name: string | null;
  signer_position: string | null;
  customer_email: string | null;
  file_link: string | null;
  total_value: number | null;
  created_at: string | null;
  doc_number: string | null;
  addr_sub: string | null;
  addr_province: string | null;
  exchange_product_type: string | null;
  exchange_product_list: string | null;
  exchange_product_other: string | null;
  b2b_customer_id: number | null;
  current_status: string;
  updated_by: string | null;
  updated_at: string | null;
  department: string | null;
  created_by_staff_id: string | null;
  submission_channel: 'customer_portal' | 'csr_manual';
  drug_items?: DrugItemRow[];
}

// รูปแบบย่อของ requests ที่ history RPC/query หลายจุดคืนมา (ไม่ใช่ select('*') เต็ม
// ตาราง) — ใช้กับรายการสรุปในลิสต์ประวัติ (RequestHistoryList) ที่ไม่ต้องการทุกคอลัมน์
export interface HistorySummaryRow {
  id: number;
  ref_id: string;
  request_type: string | null;
  current_status: string;
  total_value: number | null;
  created_at: string | null;
  hospital_name?: string | null;
  province?: string | null;
}

export interface CustomerSessionInfo {
  id: number;
  email: string;
  hospital_name: string;
  contact_name: string | null;
  customer_code: string | null;
  phone: string | null;
  position: string | null;
  province: string | null;
}

export interface StaffSessionInfo {
  id: string;
  username: string;
  full_name: string | null;
  role: string | null;
  department: string;
  sale_customer_types: string[] | null;
  sale_provinces: string[] | null;
  email: string | null;
}

export interface ClientRow {
  id: string;
  created_at: string;
  hospital_name: string;
  province: string;
  contact_name: string;
  position: string;
  phone: string;
  email: string;
  signature_url: string;
  pdpa_consented_at: string;
  status: 'pending' | 'approved' | 'rejected';
  b2b_customer_id: number | null;
  auth_user_id: string | null;
  org_type: string | null;
}

// เท่ากับสิ่งที่ getPendingStaff() คืนจริง — select() เฉพาะคอลัมน์ที่หน้า
// staff-approvals ใช้แสดงผลจริงเท่านั้น (ไม่ดึง password_hash หรือคอลัมน์อื่น
// ของ staff_users มาเลย กันข้อมูลอ่อนไหวหลุดไปฝั่ง client โดยไม่จำเป็น)
export interface PendingStaffRow {
  id: string;
  employee_id: string;
  full_name: string | null;
  department: string;
}

export interface UnansweredQuestionRow {
  id: number;
  question: string;
  answer: string | null;
  created_at: string;
}

export interface StatusLogRow {
  id: number;
  request_id: number;
  staff_id: string | null;
  department: string;
  status_name: string;
  staff_remark: string | null;
  log_date: string | null;
  drug_item_id: number | null;
  actor_type: 'staff' | 'system' | 'customer';
  rejection_reason_code: string | null;
}
