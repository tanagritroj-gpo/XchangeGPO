-- บันทึกประวัติการตั้งรหัสผ่านใหม่ของลูกค้า (ผ่านฟีเจอร์ "ลืมรหัสผ่าน") — คู่กันกับ
-- staff_password_reset_logs ฝั่งพนักงาน แยกจาก otp_logs เพราะ otp_logs เป็นข้อมูลยืนยัน
-- ตัวตนระยะสั้น (ถูก mark used แล้วอาจถูกล้าง/หมุนเวียนทิ้งในอนาคต) ส่วนตารางนี้เป็น
-- audit trail ถาวรไว้ตรวจสอบย้อนหลังได้ว่าลูกค้ารายไหนรีเซ็ตรหัสผ่านเมื่อไหร่
create table public.customer_password_reset_logs (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.b2b_customers(id) on delete cascade,
  reset_at timestamptz not null default now(),
  ip text
);

create index customer_password_reset_logs_customer_id_idx on public.customer_password_reset_logs(customer_id);

comment on table public.customer_password_reset_logs is
  'ประวัติการตั้งรหัสผ่านใหม่ของลูกค้าผ่านฟีเจอร์ลืมรหัสผ่าน — เก็บถาวรเพื่อการตรวจสอบ ไม่ผูกกับ retention ของ otp_logs';

-- ล็อกเหมือน staff_password_reset_logs/otp_logs/sessions — เขียน/อ่านได้เฉพาะ service_role
-- (ผ่าน supabaseAdmin ในโค้ดฝั่งเซิร์ฟเวอร์) client (anon/authenticated) ห้ามแตะตารางนี้
-- โดยตรงเด็ดขาด เพราะเป็น audit trail ที่ต้องเชื่อถือได้ว่าไม่มีใครมาแก้ไข/ลบเองได้
alter table public.customer_password_reset_logs enable row level security;

create policy deny_client_access on public.customer_password_reset_logs
  for all
  to anon, authenticated
  using (false)
  with check (false);
