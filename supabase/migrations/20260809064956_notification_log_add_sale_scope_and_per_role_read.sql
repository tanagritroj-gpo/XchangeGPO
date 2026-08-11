-- 1) org_type/province — denormalized ตอน insert (เหมือน requests.hospital_name/province ที่
-- denormalize อยู่แล้ว) ใช้กรองให้ Sale เห็นเฉพาะแจ้งเตือนของหน่วยงานในเขตที่ตัวเองดูแล
-- (org_type[] + province[] จาก staff_users.sale_customer_types/sale_provinces — ดู
-- getSaleCoverage() ใน app/actions/sale-actions.ts) ต่างจาก CSR ที่เห็นทุกแจ้งเตือนไม่กรอง
alter table public.notification_log
  add column if not exists org_type text,
  add column if not exists province text;

-- 2) แยกสถานะ "อ่านแล้ว" ตาม role (csr / sale) แทนที่ read_at/read_by เดิมที่ใครเปิดก่อน
-- ก็นับว่าอ่านแล้วสำหรับทุกคนแบบเดียว — ตอนนี้ CSR อ่านแล้วไม่กระทบ badge ฝั่ง Sale และกลับกัน
-- (ยังคง "ไม่มี concept อ่านแยกตามคน" ไว้เหมือนเดิม แค่แยกระดับ role แทนระดับ individual)
alter table public.notification_log
  add column if not exists read_by_csr_at timestamptz,
  add column if not exists read_by_csr_by uuid references public.staff_users(id),
  add column if not exists read_by_sale_at timestamptz,
  add column if not exists read_by_sale_by uuid references public.staff_users(id);

-- backfill: แถวที่เคยถูกอ่านแล้ว (read_at ไม่ null) ถือว่าอ่านแล้วทั้งสอง role — กันแจ้งเตือน
-- เก่าที่เคยอ่านแล้วโผล่กลับมาเป็น unread ให้ Sale ทันทีที่ deploy ฟีเจอร์นี้
update public.notification_log
set read_by_csr_at = read_at, read_by_csr_by = read_by,
    read_by_sale_at = read_at, read_by_sale_by = read_by
where read_at is not null;

alter table public.notification_log
  drop column if exists read_at,
  drop column if exists read_by;

create index if not exists idx_notification_log_unread_csr
  on public.notification_log (created_at desc)
  where read_by_csr_at is null;

create index if not exists idx_notification_log_unread_sale
  on public.notification_log (created_at desc)
  where read_by_sale_at is null;
