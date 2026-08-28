-- ตัดฟีเจอร์ "ลูกค้าแก้ไขอีเมลเอง" ออกจากหน้า "บัญชีผู้ใช้" (/account) — อีเมลผูกกับการ
-- login ผ่าน Sign in with Google โดยตรง (จับคู่ด้วยอีเมลที่ Google verify มา) ถ้าให้ลูกค้าแก้
-- อีเมลเองได้จะทำให้ Google Sign-In เดิมหลุดทันที และการแก้ให้ทำงานต่อเนื่องได้ (ผูก Google
-- identity แทนอีเมล) ก็มีช่องโหว่ด้านความปลอดภัยที่ต้องออกแบบเพิ่ม — ตัดสินใจให้อีเมลเป็นค่าคงที่
-- แก้ได้เฉพาะผ่าน CSR แทน ปลอดภัย/ง่ายกว่า
--
-- ไม่มีแถวไหนใน customer_account_change_logs ที่ field = 'email' อยู่แล้ว ณ ตอนย้าย migration
-- นี้ (เช็คแล้วก่อน apply) จึงตัด 'email' ออกจาก check constraint ได้โดยไม่ต้อง backfill/ลบข้อมูล
alter table public.customer_account_change_logs
  drop constraint customer_account_change_logs_field_check;

alter table public.customer_account_change_logs
  add constraint customer_account_change_logs_field_check
  check (field in ('password', 'contact_info'));

comment on table public.customer_account_change_logs is
  'ประวัติการแก้ไขบัญชีตัวเอง (password/ข้อมูลติดต่อ) ผ่านหน้า "บัญชีผู้ใช้" ฝั่งลูกค้า (self-service, ยืนยันด้วยรหัสผ่านปัจจุบันสำหรับ password) — แยกจาก customer_password_reset_logs ที่เป็น flow ลืมรหัสผ่านผ่าน OTP โดยเฉพาะ และแยกจาก staff_account_change_logs โดยสิ้นเชิง — ไม่มี field แก้อีเมล (ตัดฟีเจอร์นี้ออกแล้ว เพราะอีเมลผูกกับ Google Sign-In)';
