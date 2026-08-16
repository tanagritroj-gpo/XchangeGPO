// แผนกเจ้าของงาน ณ แต่ละ current_status — ★ ต้องตรงกับ CASE ใน public.check_sla_notifications()
// (supabase/migrations/20260810120500_add_check_sla_notifications_cron.sql) เป๊ะ ไม่มีจุดเดียวที่
// เป็น source of truth ร่วมกันระหว่าง SQL กับ TypeScript — แก้ที่นี่ต้องแก้ที่นั่นด้วยเสมอ
//
// แยกออกมาจาก lib/sla.ts ตั้งใจ (ไม่มี 'server-only'/import supabaseAdmin) เพราะเป็นแค่ data
// mapping ล้วนๆ ไม่มี side effect — client component (เช่น app/admin/sale/component/
// SaleActiveWorkflow.tsx) import ตรงจากที่นี่ได้โดยไม่ลาก lib/sla.ts (server-only) เข้า bundle
// ฝั่ง client ไปด้วย ซึ่งจะทำให้ `next build` fail ทันที (import 'server-only' จาก client component)
export const STATUS_OWNER_DEPARTMENT: Record<string, 'csr' | 'logistics' | 'warehouse'> = {
  pending_review: 'csr',
  receiving: 'csr',
  exchanging: 'csr',
  credit_note: 'csr',
  approved: 'logistics',
  in_transit: 'logistics',
  out_for_delivery: 'logistics',
  at_warehouse: 'warehouse',
  checked_in: 'warehouse',
};

// staff_users.department/session/NotificationBell scope ใช้คำย่อ (csr/log/wh) แต่
// status_logs.department และ notification_log.department ใช้คำเต็ม (csr/logistics/warehouse)
// — สองคำศัพท์นี้มีอยู่แล้วในระบบเดิม ไม่ตรงกัน ต้องแปลงผ่าน map นี้ทุกจุดที่เจอกัน
export const SCOPE_TO_DEPARTMENT = { csr: 'csr', log: 'logistics', wh: 'warehouse' } as const;
export const DEPARTMENT_TO_SCOPE = { csr: 'csr', logistics: 'log', warehouse: 'wh' } as const;
