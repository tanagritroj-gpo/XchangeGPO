-- ผู้รับอีเมลที่ CSR เลือกตอนส่ง "แจ้งรับเรื่อง" (email #1) ของใบงานแลกเปลี่ยนที่ CSR กรอกแทน
-- — email #2 (เอกสารฉบับตรวจสอบแล้ว) จะส่งไปที่ชุดเดียวกันนี้อัตโนมัติหลัง CSR ตรวจ compliance เสร็จ
-- (ฝั่งลูกค้ายื่นเอง ไม่ใช้คอลัมน์นี้ — email ไปที่ customer_email + sale ที่ดูแลหน่วยงานเสมอ)
alter table public.requests add column notify_emails text[];
