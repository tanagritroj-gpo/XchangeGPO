-- เพิ่มสถานะ "อ่านแล้ว" แยกอิสระให้ Manager เหมือน csr/sale/log/wh — Manager เดิมแชร์
-- read state กับ CSR ผ่าน getManagerOrCsrSession() (role='manager' ผ่านเกต CSR ได้) ทำให้
-- ถ้า manager หรือ csr เปิดอ่านก่อน อีกฝ่ายเห็น badge หายไปด้วย — ตอนนี้แยกอิสระเต็มรูปแบบ
alter table public.notification_log
  add column if not exists read_by_manager_at timestamptz,
  add column if not exists read_by_manager_by uuid references public.staff_users(id);

create index if not exists idx_notification_log_unread_manager
  on public.notification_log (created_at desc)
  where read_by_manager_at is null;
