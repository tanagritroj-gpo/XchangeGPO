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
  agent_appointment_note: string | null;
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
  // path ภายใน bucket return-documents ของรูปถ่ายใบส่งของที่ลูกค้าแนบมา (nullable/array —
  // ไม่บังคับแนบ, ระดับคำร้องไม่ใช่ระดับรายการยา เพราะใบส่งของคือเอกสาร 1 ใบต่อการจัดส่ง
  // ไม่ใช่ 1 ใบต่อยา 1 รายการ, เฉพาะฝั่งฟอร์มลูกค้ากรอกเอง ดู Step2Items.tsx)
  delivery_note_photo_paths?: string[] | null;
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

// รูปแบบย่อของ requests/drug_items สำหรับ ManagerInsights/computeManagerStats
// (lib/manager-stats.ts) — Pick มาจาก RequestRow/DrugItemRow เฉพาะคอลัมน์ที่การคำนวณสถิติ
// ใช้จริง เพื่อให้ RPC ข้ามแผนกที่ join ผ่าน organizations แบบจำกัดคอลัมน์ (เช่น
// get_sale_customer_history ที่ Sale ใช้ ไม่ select('*') เต็มตาราง requests แบบ CSR/Manager)
// ส่งข้อมูลเข้า component เดียวกันได้ตรงๆ โดยไม่ต้องปลอมค่า field ที่ไม่ได้ดึงมาเป็น null —
// RequestRow/DrugItemRow เต็มรูปแบบยัง assignable เข้าตัวนี้ได้เสมอ (superset ของฟิลด์ที่ต้องใช้)
// จึงไม่กระทบ CSR/Manager ที่ส่ง RequestRow[] เข้ามาอยู่แล้ว
export type ReportDrugItemRow = Pick<
  DrugItemRow,
  'drug_name' | 'qty' | 'unit' | 'lot_number' | 'exp_date' | 'value_amount' | 'current_status'
>;

export type ReportRequestRow = Pick<
  RequestRow,
  | 'id' | 'ref_id' | 'hospital_name' | 'province' | 'addr_province' | 'request_type'
  | 'return_reason' | 'total_value' | 'current_status' | 'created_at' | 'updated_at'
> & {
  drug_items?: ReportDrugItemRow[];
};

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
  signature_url: string | null;
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
  // ★ ใช้ server-side เท่านั้น (copy ไป b2b_customers ตอนอนุมัติ) — ห้าม select('*') แล้วส่ง
  // ClientRow กลับไปหน้า client ตรงๆ โดยไม่กรองคอลัมน์นี้ออกก่อน (ดู getCSRDashboardData)
  password_hash?: string | null;
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

// แถวจาก notification_log — ศูนย์แจ้งเตือนรวมของ Manager/CSR/Sale (NotificationBell)
// type ขยายเพิ่มได้ในอนาคต คอลัมน์ที่ไม่เกี่ยวกับ type นั้นๆ จะเป็น null เสมอ
// isUnread คำนวณฝั่ง server ตอน fetch (จาก read_by_csr_at/read_by_sale_at แล้วแต่ scope
// เรียก) ไม่ใช่คอลัมน์จริงในตาราง — กันไม่ให้ raw timestamp หลุดออกมาฝั่ง client โดยไม่จำเป็น
export interface NotificationLogRow {
  id: string;
  type: 'ping' | 'new_request' | 'new_client' | 'sla_warning' | 'sla_breach' | 'customer_expiring';
  request_id: number | null;
  ref_id: string | null;
  contact_name: string | null;
  hospital_name: string | null;
  created_at: string;
  isUnread: boolean;
  // ใช้เฉพาะ type=sla_warning/sla_breach: แผนกเจ้าของใบงาน (csr/logistics/warehouse — คำเต็ม
  // ไม่ใช่ scope key ของ NotificationBell) NULL สำหรับ type อื่นทั้งหมด และเป็น sentinel ของ
  // แจ้งเตือน manager สำหรับแถว sla_breach (ดู lib/sla.ts, app/actions/sla-actions.ts)
  department: string | null;
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

// กฎ SLA ต่อ status_name — แก้ไขได้เองผ่านหน้า manager (/admin/manager/sla)
export interface SlaRuleRow {
  status_name: string;
  sla_days: number;
  warning_days: number;
  updated_at: string | null;
}

// ใบงานที่ใกล้ครบ/เกินกำหนด SLA — query สดจาก requests (ไม่ใช่ประวัติ notification_log)
// ใช้ทั้งในแท็บ "SLA Monitoring" ของ NotificationBell และ dashboard ของ manager
export interface SlaQueueRow {
  id: number;
  ref_id: string;
  hospital_name: string | null;
  contact_name: string | null;
  current_status: string;
  status_due_at: string;
  status_warn_at: string;
  isOverdue: boolean;
  department: 'csr' | 'logistics' | 'warehouse';
}
