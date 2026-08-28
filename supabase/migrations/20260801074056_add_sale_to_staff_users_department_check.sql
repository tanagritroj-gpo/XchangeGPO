-- department 'sale' ถูก reject ด้วย CHECK constraint เดิม (csr/log/wh/manager เท่านั้น)
-- ที่หลุดไปตอนสำรวจ schema ครั้งแรกก่อนเพิ่ม role sale — ขยายให้รองรับ 'sale' เพิ่ม
ALTER TABLE public.staff_users DROP CONSTRAINT staff_users_department_check;
ALTER TABLE public.staff_users ADD CONSTRAINT staff_users_department_check
  CHECK (department = ANY (ARRAY['csr'::text, 'log'::text, 'wh'::text, 'manager'::text, 'sale'::text]));
