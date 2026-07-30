-- Migration: revoke_public_grants_request_pings_chatbot
-- วันที่: 2026-07-30
--
-- บริบท: request_pings และ chatbot_unanswered_questions ถูกสร้างขึ้นหลัง
-- migration หลักที่ทำ hardening (20260727000000_harden_rls_policies.sql) และ
-- ไม่ได้รับการ REVOKE สิทธิ์จาก PUBLIC เหมือน 12 ตารางที่เหลือ — ทำให้
-- anon/authenticated ยังมีสิทธิ์ระดับตาราง (SELECT/INSERT/UPDATE/DELETE/
-- TRUNCATE) ติดค้างอยู่จริงในระดับ Postgres grant แม้จะมี RLS policy
-- "deny_client_access" (USING(false)) ปิดกั้นอยู่แล้วก็ตาม
--
-- วันนี้ยังไม่ถูกเจาะได้ (RLS policy บล็อกอยู่) แต่เป็นกับดักซ้อน — ถ้าวันหนึ่ง
-- policy นั้นถูกแก้/ลบโดยไม่ตั้งใจ หรือ RLS ถูกปิดชั่วคราวตอน debug สองตาราง
-- นี้จะเปิดให้ใครก็ตามที่ถือ anon key อ่าน/เขียน/ลบข้อมูลได้ตรงทันที
--
-- ตรวจสอบก่อนแก้: grep ทั้ง repo ยืนยันว่าไม่มีโค้ดฝั่ง client/browser จุดใด
-- เรียกสองตารางนี้ผ่าน anon key เลย มีแต่ server actions ที่ใช้ supabaseAdmin
-- (service_role) เท่านั้น (app/actions/ping-actions.ts, staff-ping-actions.ts,
-- app/api/chat/route.ts, app/actions/manager-actions.ts)

revoke all on table public.request_pings from anon, authenticated;
revoke all on table public.chatbot_unanswered_questions from anon, authenticated;
