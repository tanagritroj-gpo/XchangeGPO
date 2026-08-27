-- บันทึกประวัติการแก้ไขบัญชีตัวเอง (email/password/ข้อมูลติดต่อ) ผ่านหน้า "บัญชีผู้ใช้"
-- (/account) ฝั่งลูกค้า ที่ยืนยันตัวตนด้วยรหัสผ่านปัจจุบัน (ยกเว้นข้อมูลติดต่อที่ไม่ใช่
-- identity credential) — คู่ขนานกับ staff_account_change_logs (20260822160000) แต่แยกตาราง
-- กันเด็ดขาดจากฝั่งพนักงาน ผูกกับ b2b_customers ไม่ใช่ staff_users — แยกจาก
-- customer_password_reset_logs ที่เป็น audit trail ของ flow "ลืมรหัสผ่าน" (ยืนยันด้วย OTP
-- แทนรหัสผ่านเดิม) โดยเฉพาะ
--
-- field = 'contact_info' ครอบคลุม contact_name/phone/position รวมกันเป็นรายการเดียวต่อการ
-- บันทึกครั้งหนึ่ง (กว้างกว่า staff เพราะลูกค้ามีฟิลด์โปรไฟล์ที่ staff ไม่มี) — เก็บเป็นสรุป
-- ข้อความอ่านง่ายใน old_value/new_value ไม่ใช่ JSON ดิบ
-- field = 'password' ปล่อย old_value/new_value เป็น null เสมอ — ไม่เก็บรหัสผ่านหรือแม้แต่
-- hash ไว้ใน audit log เพื่อลดความเสี่ยงถ้าตารางนี้รั่วไหลในอนาคต
create table public.customer_account_change_logs (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.b2b_customers(id) on delete cascade,
  field text not null check (field in ('email', 'password', 'contact_info')),
  old_value text,
  new_value text,
  changed_at timestamptz not null default now(),
  ip text
);

create index customer_account_change_logs_customer_id_idx on public.customer_account_change_logs(customer_id);

comment on table public.customer_account_change_logs is
  'ประวัติการแก้ไขบัญชีตัวเอง (email/password/ข้อมูลติดต่อ) ผ่านหน้า "บัญชีผู้ใช้" ฝั่งลูกค้า (self-service, ยืนยันด้วยรหัสผ่านปัจจุบันสำหรับ email/password) — แยกจาก customer_password_reset_logs ที่เป็น flow ลืมรหัสผ่านผ่าน OTP โดยเฉพาะ และแยกจาก staff_account_change_logs โดยสิ้นเชิง';

-- ล็อกเหมือน staff_account_change_logs — เขียน/อ่านได้เฉพาะ service_role (ผ่าน supabaseAdmin
-- ในโค้ดฝั่งเซิร์ฟเวอร์) client (anon/authenticated) ห้ามแตะตารางนี้โดยตรงเด็ดขาด เพราะเป็น
-- audit trail ที่ต้องเชื่อถือได้ว่าไม่มีใครมาแก้ไข/ลบเองได้
alter table public.customer_account_change_logs enable row level security;

create policy deny_client_access on public.customer_account_change_logs
  for all
  to anon, authenticated
  using (false)
  with check (false);
