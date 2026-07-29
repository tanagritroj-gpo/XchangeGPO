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
--    ★ ต้อง REVOKE ... FROM anon, authenticated โดยตรง — REVOKE ... FROM PUBLIC อย่างเดียว
--    ไม่พอ เพราะ Supabase grant EXECUTE ให้ anon/authenticated แบบ direct grant ตอนสร้าง
--    ฟังก์ชันใหม่ในสคีมา public เสมอ (ไม่ใช่แค่สืบทอดผ่านการเป็นสมาชิกของ PUBLIC) — พิสูจน์
--    แล้วจริงว่าถ้า revoke จาก PUBLIC อย่างเดียว has_function_privilege('anon',...) ยังคืน
--    true อยู่ ต้อง revoke จาก anon/authenticated ตรงๆ ถึงจะได้ผลจริง (เหมือนที่ playbook
--    เตือนไว้เรื่อง REVOKE จาก role เจาะจงไม่กระทบ PUBLIC — ที่นี่กลับด้าน: REVOKE จาก
--    PUBLIC ก็ไม่กระทบ direct grant ของ role เจาะจงเหมือนกัน ต้องเช็คทั้งสองทิศทางเสมอ)
--    ฟังก์ชันอื่นที่ล็อกไว้ถูกต้องอยู่แล้ว (เช่น increment_rate_limit) ก็ตั้งไว้แบบ
--    revoke จาก anon/authenticated ตรงๆ เหมือนกัน ไม่ใช่แค่จาก PUBLIC

create policy "deny_client_access" on public.request_pings
  for all to anon, authenticated using (false) with check (false);

revoke execute on function public.check_document_attachment_consistency() from anon, authenticated, public;
revoke execute on function public.sync_timeline() from anon, authenticated, public;
