-- role พนักงาน "sale" ต้องกำหนดขอบเขตดูแลตอนลงทะเบียน: ประเภทลูกค้า (เอกชน/ภาครัฐ)
-- และจังหวัดที่ดูแล — เก็บเป็น array เพราะเลือกได้มากกว่า 1 ค่า มีผลเฉพาะ department='sale'
ALTER TABLE public.staff_users ADD COLUMN sale_customer_types text[];
ALTER TABLE public.staff_users ADD COLUMN sale_provinces text[];

-- ประเภทหน่วยงานของลูกค้า (โรงพยาบาลรัฐ/เอกชน, คลินิค, ร้านยา, หน่วยงานรัฐอื่นๆ)
-- ใช้จับคู่กับขอบเขตของพนักงาน sale — nullable เพราะแถวเก่ามีอยู่แล้วก่อนมีฟีเจอร์นี้
ALTER TABLE public.clients ADD COLUMN org_type text;
ALTER TABLE public.b2b_customers ADD COLUMN org_type text;
