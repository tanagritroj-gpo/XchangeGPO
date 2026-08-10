-- รวมค่า default ของคอลัมน์เวลาให้เป็นรูปแบบเดียวกันทั้งฐานข้อมูล (timezone('utc'::text, now()))
-- ก่อนหน้านี้ 4 คอลัมน์ใช้แค่ now() เฉยๆ ซึ่งให้ค่าเดียวกันก็จริงตราบใดที่ database timezone
-- ยังเป็น UTC อยู่ (ยืนยันแล้วตอนตรวจสอบ) แต่เป็นความเสี่ยงแฝงถ้ามีใครไปเปลี่ยน timezone
-- setting ในอนาคต ไม่กระทบข้อมูลเดิมที่มีอยู่แล้ว (แค่เปลี่ยน default ของแถวใหม่ที่จะ insert
-- ต่อจากนี้)
alter table public.sessions
  alter column created_at set default timezone('utc'::text, now());

alter table public.rate_limits
  alter column window_start set default timezone('utc'::text, now());

alter table public.customer_password_reset_logs
  alter column reset_at set default timezone('utc'::text, now());

alter table public.staff_password_reset_logs
  alter column reset_at set default timezone('utc'::text, now());
