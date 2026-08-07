-- บันทึกประวัติการตั้งรหัสผ่านใหม่ของพนักงาน (ผ่านฟีเจอร์ "ลืมรหัสผ่าน") แยกจาก otp_logs
-- เพราะ otp_logs เป็นข้อมูลยืนยันตัวตนระยะสั้น (ถูก mark used แล้วอาจถูกล้าง/หมุนเวียนทิ้งในอนาคต)
-- ส่วนตารางนี้เป็น audit trail ถาวรไว้ให้ manager ตรวจสอบย้อนหลังได้ว่าใครรีเซ็ตรหัสผ่านเมื่อไหร่
create table public.staff_password_reset_logs (
  id bigint generated always as identity primary key,
  staff_id uuid not null references public.staff_users(id) on delete cascade,
  reset_at timestamptz not null default now(),
  ip text
);

create index staff_password_reset_logs_staff_id_idx on public.staff_password_reset_logs(staff_id);

comment on table public.staff_password_reset_logs is
  'ประวัติการตั้งรหัสผ่านใหม่ผ่านฟีเจอร์ลืมรหัสผ่าน — เก็บถาวรเพื่อการตรวจสอบ ไม่ผูกกับ retention ของ otp_logs';

-- ล็อกเหมือน otp_logs/sessions — เขียน/อ่านได้เฉพาะ service_role (ผ่าน supabaseAdmin ในโค้ด
-- ฝั่งเซิร์ฟเวอร์) client (anon/authenticated) ห้ามแตะตารางนี้โดยตรงเด็ดขาด เพราะเป็น audit
-- trail ที่ต้องเชื่อถือได้ว่าไม่มีใครมาแก้ไข/ลบเองได้
alter table public.staff_password_reset_logs enable row level security;

create policy deny_client_access on public.staff_password_reset_logs
  for all
  to anon, authenticated
  using (false)
  with check (false);
