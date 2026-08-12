-- เพิ่มสถานะ "อ่านแล้ว" แยกอิสระให้ log (logistics) และ wh (warehouse) เหมือน csr/sale —
-- เห็นแจ้งเตือนชุดเดียวกันทั้งหมดไม่กรอง (เหมือน CSR ไม่ใช่แบบกรอง org_type/province แบบ Sale)
-- แต่ badge/mark-as-read เป็นอิสระต่อแผนกเสมอ ไม่ปนกัน — แผนกหนึ่งเปิดอ่านไม่กระทบ badge
-- ของอีกแผนก (เหตุผลเดียวกับที่แยก csr/sale ไว้ก่อนหน้านี้)
alter table public.notification_log
  add column if not exists read_by_log_at timestamptz,
  add column if not exists read_by_log_by uuid references public.staff_users(id),
  add column if not exists read_by_wh_at timestamptz,
  add column if not exists read_by_wh_by uuid references public.staff_users(id);

create index if not exists idx_notification_log_unread_log
  on public.notification_log (created_at desc)
  where read_by_log_at is null;

create index if not exists idx_notification_log_unread_wh
  on public.notification_log (created_at desc)
  where read_by_wh_at is null;
