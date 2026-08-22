-- บันทึกประวัติการแก้ไขบัญชีตัวเอง (username/email/password) ผ่านหน้า "จัดการบัญชี"
-- (/admin/account) ที่พนักงานยืนยันตัวตนด้วยรหัสผ่านปัจจุบัน — แยกจาก
-- staff_password_reset_logs ที่เป็น audit trail ของ flow "ลืมรหัสผ่าน" (ยืนยันด้วย OTP
-- แทนรหัสผ่านเดิม) โดยเฉพาะ ไว้ให้ manager/ผู้ดูแลระบบตรวจสอบย้อนหลังได้ว่าใครแก้บัญชี
-- ตัวเองเมื่อไหร่ เปลี่ยนอะไรจากอะไรไปเป็นอะไร
--
-- old_value/new_value เก็บเฉพาะ username/email (ไม่ใช่ความลับ เห็นได้ในหน้าบัญชีอยู่แล้ว)
-- ส่วน field = 'password' ปล่อย old_value/new_value เป็น null เสมอ — ไม่เก็บรหัสผ่านหรือ
-- แม้แต่ hash ไว้ใน audit log เพื่อลดความเสี่ยงถ้าตารางนี้รั่วไหลในอนาคต
create table public.staff_account_change_logs (
  id bigint generated always as identity primary key,
  staff_id uuid not null references public.staff_users(id) on delete cascade,
  field text not null check (field in ('username', 'email', 'password')),
  old_value text,
  new_value text,
  changed_at timestamptz not null default now(),
  ip text
);

create index staff_account_change_logs_staff_id_idx on public.staff_account_change_logs(staff_id);

comment on table public.staff_account_change_logs is
  'ประวัติการแก้ไขบัญชีตัวเอง (username/email/password) ผ่านหน้า "จัดการบัญชี" (self-service, ยืนยันด้วยรหัสผ่านปัจจุบัน) — แยกจาก staff_password_reset_logs ที่เป็น flow ลืมรหัสผ่านผ่าน OTP โดยเฉพาะ';

-- ล็อกเหมือน staff_password_reset_logs — เขียน/อ่านได้เฉพาะ service_role (ผ่าน supabaseAdmin
-- ในโค้ดฝั่งเซิร์ฟเวอร์) client (anon/authenticated) ห้ามแตะตารางนี้โดยตรงเด็ดขาด เพราะเป็น
-- audit trail ที่ต้องเชื่อถือได้ว่าไม่มีใครมาแก้ไข/ลบเองได้
alter table public.staff_account_change_logs enable row level security;

create policy deny_client_access on public.staff_account_change_logs
  for all
  to anon, authenticated
  using (false)
  with check (false);
