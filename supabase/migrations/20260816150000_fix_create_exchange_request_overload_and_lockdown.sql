-- ★ URGENT FIX พบระหว่าง code review ก่อน commit — migration ก่อนหน้า
-- (20260816140000_move_delivery_note_photos_to_request_level.sql) ใช้ CREATE OR REPLACE
-- FUNCTION เปลี่ยน signature (เพิ่ม p_delivery_note_photo_paths) ซึ่ง Postgres ไม่ได้ "แทนที่"
-- ฟังก์ชันเดิม แต่สร้าง overload ใหม่แยกต่างหาก (signature ไม่ตรงกัน) เหมือนที่เคยเกิดมาแล้ว
-- ตอน 20260717105504_add_staff_params_to_create_exchange_request.sql (ตอนนั้นมี migration
-- ตามมาแก้คือ 20260717105533_drop_old_create_exchange_request_overload.sql) — รอบนี้ไม่มี
-- migration แก้ตาม ทำให้เกิด 2 ปัญหาจริงพร้อมกัน:
--
-- 1) overload เก่า (5 args) ยัง insert เข้า drug_items.delivery_note_photo_path ที่ถูก drop
--    ไปแล้วในตัวมันเอง — createStaffReturnRequest (staff-form-actions.ts) เรียกด้วย 5 named
--    params ตรงกับ overload เก่าเป๊ะ ทำให้ทุกคำร้องที่ CSR กรอกแทนลูกค้าพังทันที
-- 2) overload ใหม่ (6 args) เป็น pg_proc แถวใหม่ ไม่ได้สืบทอด REVOKE ที่ล็อกไว้ก่อนหน้า
--    (20260717105703_lock_down_create_exchange_request_execute.sql) ได้ default privilege
--    ของ Postgres คือ EXECUTE ให้ PUBLIC (รวม anon/authenticated ใน Supabase) — เท่ากับใครก็
--    เรียก RPC นี้ตรงๆ จาก browser ด้วย anon key สร้าง requests/drug_items เองได้เลย ข้าม
--    rate limit/session check/validation ทั้งหมดใน form-actions.ts เพราะเป็น SECURITY DEFINER
--
-- ยืนยันแล้วด้วย execute_sql ตรงบน production project ก่อนแก้ (pg_proc.proacl แสดง
-- anon=X/postgres, authenticated=X/postgres จริงบน overload 6 args) — ไฟล์นี้บันทึกการแก้ที่
-- apply ไปทาง MCP ให้ตรงกับ migration history จริงบนรีโมต (ไม่แก้ไฟล์ 20260816140000 ย้อนหลัง
-- เพราะ Supabase บันทึกว่า migration นั้น apply ไปแล้วตามเนื้อหาเดิม)

-- แก้ข้อ 1: ลบ overload เก่าที่เสียแล้วทิ้ง (ไม่มีใครควรเรียกอยู่แล้ว มีแต่ตัว 6 args ที่ถูกต้อง)
drop function if exists public.create_exchange_request(bigint, jsonb, jsonb, uuid, text);

-- แก้ข้อ 2: ล็อก overload ที่เหลือ (6 args) ให้เหมือน migration เดิมทุกครั้งที่เคยทำ
revoke execute on function public.create_exchange_request(
  bigint, jsonb, jsonb, uuid, text, text[]
) from public, anon, authenticated;

grant execute on function public.create_exchange_request(
  bigint, jsonb, jsonb, uuid, text, text[]
) to service_role;
