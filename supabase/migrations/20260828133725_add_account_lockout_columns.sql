-- Account lockout (G1-4 / audit §P1-4) — คู่กับ remember-me (เฟส 1 ของ 13-mfa-remember-me-design.md)
-- ล้มเหลว 5 ครั้งติด → ล็อกชั่วคราว (15→30→60 นาที exponential), reset counter เมื่อ login สำเร็จ
-- หรือรีเซ็ตรหัสผ่านผ่าน OTP

alter table public.staff_users
  add column if not exists failed_login_count integer not null default 0,
  add column if not exists locked_until timestamptz;

alter table public.b2b_customers
  add column if not exists failed_login_count integer not null default 0,
  add column if not exists locked_until timestamptz;

comment on column public.staff_users.locked_until is
  'ถ้า > now() บัญชีถูกล็อกชั่วคราวจากการ login ผิดต่อเนื่อง (lib/account-lockout.ts)';
comment on column public.b2b_customers.locked_until is
  'ถ้า > now() บัญชีถูกล็อกชั่วคราวจากการ login ผิดต่อเนื่อง (lib/account-lockout.ts)';
