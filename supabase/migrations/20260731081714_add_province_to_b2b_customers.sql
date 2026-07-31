-- province เคยถูกจับกรอกไว้ตอนสมัคร (clients.province) แต่หายไปตอนอนุมัติเข้า
-- b2b_customers เพราะตารางนี้ไม่มีคอลัมน์ province มาก่อน ทำให้ requests.province
-- (คอลัมน์ที่มีอยู่แล้ว) ไม่เคยถูกเซ็ตค่าเลยสักแถวเดียว — เพิ่มคอลัมน์แล้ว backfill
-- ย้อนหลังทั้ง b2b_customers (จาก clients ผ่าน FK ที่ผูกไว้ตอน reviewClient อนุมัติ)
-- และ requests (จาก b2b_customers ที่เพิ่ง backfill เสร็จ)
ALTER TABLE public.b2b_customers ADD COLUMN province text;

UPDATE public.b2b_customers bc
SET province = c.province
FROM public.clients c
WHERE c.b2b_customer_id = bc.id
  AND bc.province IS NULL
  AND c.province IS NOT NULL AND btrim(c.province) <> '';

UPDATE public.requests r
SET province = bc.province
FROM public.b2b_customers bc
WHERE r.b2b_customer_id = bc.id
  AND r.province IS NULL
  AND bc.province IS NOT NULL AND btrim(bc.province) <> '';
