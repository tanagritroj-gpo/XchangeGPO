-- Migration: drop_orphaned_unused_rpc_functions
-- วันที่: 2026-07-30
--
-- บริบท: 5 ฟังก์ชันนี้ไม่มีผู้เรียกใช้เลยในโค้ด (grep ทั้ง app/, lib/,
-- components/ ไม่พบเลยแม้แต่จุดเดียว), ไม่ถูกอ้างอิงใน migration ไฟล์ใดๆ
-- ในโปรเจกต์นี้ และไม่มี edge function ใดๆ ในโปรเจกต์ที่จะเรียกใช้ได้ ดูเหมือน
-- เป็นของเก่าจากดีไซน์ก่อนหน้าที่ปัจจุบันแอปเปลี่ยนไป query ตรงผ่าน
-- supabaseAdmin พร้อม column allowlist แทนแล้ว (ดู
-- app/actions/tracking-actions.ts, app/actions/history-actions.ts)
--
-- ทุกตัวถูกล็อกให้เรียกได้เฉพาะ service_role เท่านั้นอยู่แล้ว (ไม่ได้ถูกเจาะ
-- ได้จริงตอนนี้) แต่บางตัว (get_request_data, get_my_request,
-- get_request_data_for_pdf) ไม่มีการเช็ค ownership ภายในฟังก์ชันเลย/เช็คแบบ
-- อ่อน — ลบ attack surface ที่ไม่ได้ใช้ทิ้ง แทนที่จะปล่อยไว้เป็นกับดักหากมีคน
-- เผลอเปิด grant ให้ authenticated ในอนาคต

drop function if exists public.get_public_status(text);
drop function if exists public.get_request_timeline(text, bigint);
drop function if exists public.get_my_request(text, bigint);
drop function if exists public.get_request_data(bigint);
drop function if exists public.get_request_data_for_pdf(bigint, text);
