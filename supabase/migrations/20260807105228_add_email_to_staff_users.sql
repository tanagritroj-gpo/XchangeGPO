-- เพิ่มคอลัมน์ email ให้ staff_users — ทุกแผนกต้องกรอก (บังคับที่ชั้นแอปพลิเคชัน ไม่ใช่ DB
-- constraint) ใช้ทั้งส่ง OTP ตอน "ลืมรหัสผ่าน" และเป็นปลายทางแจ้งเตือนตอนลูกค้าในเขต/ประเภท
-- ที่ sale คนนั้นดูแลส่งใบงานเข้ามา (เฉพาะ department='sale')
alter table public.staff_users add column email text;

comment on column public.staff_users.email is
  'อีเมลพนักงาน — ทุกแผนกกรอก ใช้ส่ง OTP ตอน "ลืมรหัสผ่าน" และ (เฉพาะ sale) แจ้งเตือนเมื่อลูกค้าในเขตที่ดูแลส่งใบงานเข้ามา';
