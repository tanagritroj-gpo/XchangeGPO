-- Migration: harden_request_pings_and_trigger_grants
-- วันที่: 2026-07-29
-- สถานะ: ร่างสำหรับรีวิว — ยังไม่ได้ apply เข้า project จริง (qgztveswduffskucqppt)
--
-- พบระหว่างตรวจสอบระบบด้วย /anthropic-skills:nextjs-supabase-playbook — ไม่ใช่ช่องโหว่
-- ที่ใช้งานได้จริง (RLS/absence ของ policy ป้องกันไว้อยู่แล้วทั้งคู่) แต่ไม่ explicit
-- พอที่จะทนต่อการเปลี่ยนแปลงในอนาคตโดยไม่มีใครสังเกต
--
-- 1) request_pings มีแค่ policy จำกัดเฉพาะ service_role เท่านั้น ไม่มี policy สำหรับ
--    anon/authenticated เลยสักตัว ทำให้ถูกปฏิเสธแบบ "implicit" (RLS default-deny เมื่อไม่มี
--    policy ใดๆ match) ต่างจาก 12 ตารางอื่นที่มี deny_client_access ชัดเจน — เพิ่มให้ตรงกัน
--    เพื่อไม่ให้พึ่งพฤติกรรม default ของ Postgres เพียงอย่างเดียว (เหมือน migration เดิม
--    20260727000000_harden_rls_policies.sql ที่ทำไว้กับตารางอื่น)
--
-- 2) check_document_attachment_consistency() และ sync_timeline() เป็น trigger function
--    (RETURNS trigger, พึ่งพา NEW/OLD ที่มีแค่ตอนถูก trigger เรียกจริง) แต่ยังมี EXECUTE
--    grant ให้ anon/authenticated เรียกผ่าน RPC ได้ (แม้เรียกแล้วจะ error ทันทีเพราะไม่มี
--    NEW/OLD context ก็ตาม ไม่มีผลจริง) revoke ออกตามหลัก least-privilege ไม่ให้โผล่เป็น
--    RPC endpoint โดยไม่จำเป็น
--    (หมายเหตุ: revoke ตรงนี้ทำแค่ FROM public เท่านั้น ภายหลังพบว่ายังไม่พอ — Supabase
--    grant EXECUTE ให้ anon/authenticated แบบ direct grant ตอนสร้างฟังก์ชันใหม่เสมอ ไม่ใช่
--    แค่สืบทอดผ่าน PUBLIC — จึงต้องมี migration ถัดไป
--    20260729074806_fix_trigger_function_grants_target_named_roles.sql ที่ revoke จาก
--    anon, authenticated ตรงๆ อีกรอบถึงจะได้ผลจริง)

create policy "deny_client_access" on public.request_pings
  for all to anon, authenticated using (false) with check (false);

revoke execute on function public.check_document_attachment_consistency() from public;
revoke execute on function public.sync_timeline() from public;
