-- ลูกค้าเปลี่ยนวิธี login จาก email+OTP เป็น email+password (แบบเดียวกับพนักงาน ใช้
-- username/password) — ใช้ email ที่มีอยู่แล้วเป็น "username" ไม่ต้องเพิ่มคอลัมน์ username
-- แยก ส่วน Google Sign-In ยังคงเป็นทางเลือกเดิม ไม่แตะ
--
-- เพิ่ม password_hash ทั้งใน clients (ตอนสมัคร ยังไม่อนุมัติ) และ b2b_customers (บัญชีที่
-- อนุมัติแล้ว ใช้ login จริง) — nullable เพราะบัญชีเก่าที่สมัครก่อนหน้านี้ (แถวเดิมใน
-- b2b_customers) ยังไม่มี password ต้องจัดการแยกทีหลัง (ไม่ใช่ scope ของ migration นี้)
alter table public.clients add column password_hash text;
alter table public.b2b_customers add column password_hash text;

comment on column public.clients.password_hash is
  'bcrypt hash รหัสผ่านที่ลูกค้าตั้งตอนลงทะเบียน — คัดลอกไป b2b_customers ตอน CSR อนุมัติ';
comment on column public.b2b_customers.password_hash is
  'bcrypt hash รหัสผ่านลูกค้า ใช้ login คู่กับ email (แทน OTP เดิม) — null สำหรับบัญชีเก่าที่สมัครก่อนฟีเจอร์นี้';
