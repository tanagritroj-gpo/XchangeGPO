-- Migration: harden_rls_policies
-- วันที่: 2026-07-27
-- สถานะ: ร่างสำหรับรีวิว — ยังไม่ได้ apply เข้า project จริง (qgztveswduffskucqppt)
--
-- บริบท: แอปทั้งหมดควบคุมสิทธิ์ในชั้น Next.js server actions ด้วย custom cookie-session
-- (ตาราง `sessions`) และเข้าถึง Postgres ผ่าน service_role client (`lib/supabase/admin.ts`)
-- เสมอ ซึ่ง service_role มี BYPASSRLS ติดตัวอยู่แล้ว — RLS ในไฟล์นี้จึงไม่กระทบการทำงาน
-- ของแอปแม้แต่จุดเดียว (ยืนยันแล้วว่าไม่มีโค้ด client-side/browser จุดใดใน repo query
-- ตาราง 12 ตารางด้านล่างนี้ตรงๆ ผ่าน anon key) หน้าที่ของ migration นี้คือปิดช่องทางที่
-- ใครก็ตามถือ anon/publishable key (ซึ่งเป็นค่าสาธารณะ ฝังอยู่ใน bundle ของเว็บ) ยิง
-- REST request ตรงไปที่ Supabase โดยไม่ผ่านแอปเลย
--
-- สรุปการเปลี่ยนแปลง 3 ส่วน:
--   1) ปิดรูรั่วที่เปิดอยู่จริงตอนนี้: policy บน b2b_customers อนุญาตให้ role "public"
--      (รวม anon ที่ไม่ได้ล็อกอิน) SELECT ได้ทั้งตารางแบบไม่กรองอะไรเลย (qual = true)
--      ทำให้ hospital_name/email/phone/contact_name/customer_code รั่วได้ทันทีที่มีคน
--      รู้ anon key ของโปรเจกต์ (ซึ่งเป็นค่าสาธารณะโดยธรรมชาติของ Supabase)
--   2) ลบ policy บน requests/status_logs ที่อ้างอิง auth.jwt()->>'customer_id' และ
--      auth.jwt()->>'email' — เป็น "ของตาย" เพราะระบบไม่เคยออก Supabase JWT ที่มี
--      custom claim เหล่านี้ (ลูกค้า/staff ล็อกอินผ่าน OTP/bcrypt + custom session
--      คนละระบบกับ Supabase Auth) การมี policy เหล่านี้ค้างไว้มีแต่ทำให้ Supabase
--      Performance Advisor เตือน auth_rls_initplan และ multiple_permissive_policies
--      โดยไม่ได้ประโยชน์ด้านความปลอดภัยจริง — ถ้าอนาคตตัดสินใจรวมระบบ auth ให้ใช้
--      Supabase Auth จริงจัง (ผูกกับงานแก้ไข auth ที่วางแผนไว้แยกต่างหาก) ค่อยออกแบบ
--      policy ที่อิง auth.uid()/custom claim ใหม่ตอนนั้น
--   3) เพิ่ม policy "deny-all" อย่างชัดเจนให้ทุกตารางที่ควรเข้าถึงได้เฉพาะ service_role
--      เท่านั้น แทนการปล่อยให้ "ไม่มี policy" โดยไม่ได้ตั้งใจ (ผลลัพธ์การปฏิเสธเหมือนกัน
--      แต่ตอนนี้จะมีเอกสาร/นโยบายกำกับไว้ชัดเจน ไม่ต้องพึ่งพฤติกรรม default ของ Postgres
--      เพียงอย่างเดียว) ครอบคลุม 12 ตาราง: b2b_customers, staff_users, otp_logs,
--      sessions, clients, requests, drug_items, status_logs, data_correction_logs,
--      document_attachments, access_logs, timeline_summary
--
-- ไม่แตะต้อง: rate_limits, request_pings (มี policy จำกัดเฉพาะ service_role อยู่แล้ว ถูกต้องดีอยู่แล้ว)


-- ============================================================
-- 1) ปิดรูรั่ว PII ที่เปิดอยู่จริงบน b2b_customers
-- ============================================================
drop policy if exists "อนุญาตให้อ่านข้อมูลลู" on public.b2b_customers;


-- ============================================================
-- 2) ลบ policy ที่อิง Supabase Auth JWT ซึ่งใช้งานจริงไม่ได้ในสถาปัตยกรรมปัจจุบัน
-- ============================================================
drop policy if exists "Enable read access for authenticated users" on public.requests;
drop policy if exists "Enable read access for customers" on public.requests;
drop policy if exists "RLS_requests_owner" on public.requests;
drop policy if exists "RLS_logs_owner" on public.status_logs;


-- ============================================================
-- 3) เพิ่ม deny-all policy อย่างชัดเจนสำหรับตารางที่เข้าถึงได้เฉพาะ service_role
--    (service_role มี BYPASSRLS อยู่แล้ว จึงไม่ถูกกระทบโดย policy เหล่านี้)
-- ============================================================

comment on table public.b2b_customers is 'เข้าถึงตรงได้เฉพาะ service_role — สิทธิ์ทั้งหมดตรวจสอบในชั้น Next.js server actions';
create policy "deny_client_access" on public.b2b_customers
  for all to anon, authenticated using (false) with check (false);

comment on table public.staff_users is 'มี password_hash — เข้าถึงตรงได้เฉพาะ service_role เท่านั้น ห้าม client อ่าน/เขียนโดยตรง';
create policy "deny_client_access" on public.staff_users
  for all to anon, authenticated using (false) with check (false);

comment on table public.otp_logs is 'มี otp_hash — เข้าถึงตรงได้เฉพาะ service_role เท่านั้น';
create policy "deny_client_access" on public.otp_logs
  for all to anon, authenticated using (false) with check (false);

comment on table public.sessions is 'เก็บ session token ของลูกค้า/staff — เข้าถึงตรงได้เฉพาะ service_role เท่านั้น';
create policy "deny_client_access" on public.sessions
  for all to anon, authenticated using (false) with check (false);

comment on table public.clients is 'คำขอสมัครลูกค้าที่รออนุมัติ — เข้าถึงตรงได้เฉพาะ service_role, ตรวจสอบสิทธิ์ในชั้น CSR server actions';
create policy "deny_client_access" on public.clients
  for all to anon, authenticated using (false) with check (false);

comment on table public.requests is 'เข้าถึงตรงได้เฉพาะ service_role — ownership check (ลูกค้าเห็นเฉพาะคำขอตัวเอง) ทำในชั้น server action (เช่น trackMyRequestByRefId)';
create policy "deny_client_access" on public.requests
  for all to anon, authenticated using (false) with check (false);

comment on table public.drug_items is 'มี value_amount/invoice_number ที่ไม่ควรเปิดเผยแบบสาธารณะ — เข้าถึงตรงได้เฉพาะ service_role';
create policy "deny_client_access" on public.drug_items
  for all to anon, authenticated using (false) with check (false);

comment on table public.status_logs is 'audit trail การเปลี่ยนสถานะ — เข้าถึงตรงได้เฉพาะ service_role';
create policy "deny_client_access" on public.status_logs
  for all to anon, authenticated using (false) with check (false);

comment on table public.data_correction_logs is 'audit trail การแก้ไขข้อมูลย้อนหลัง — เข้าถึงตรงได้เฉพาะ service_role';
create policy "deny_client_access" on public.data_correction_logs
  for all to anon, authenticated using (false) with check (false);

comment on table public.document_attachments is 'path ของเอกสาร PDF ที่สร้างแล้ว — เข้าถึงตรงได้เฉพาะ service_role, ไฟล์จริงเข้าผ่าน signed URL เท่านั้น';
create policy "deny_client_access" on public.document_attachments
  for all to anon, authenticated using (false) with check (false);

comment on table public.access_logs is 'audit log การเข้าถึงเอกสาร (PDPA) — เข้าถึงตรงได้เฉพาะ service_role';
create policy "deny_client_access" on public.access_logs
  for all to anon, authenticated using (false) with check (false);

comment on table public.timeline_summary is 'สรุป timeline สำหรับหน้า tracking — serve ผ่าน server action ที่มี column allowlist + rate-limit อยู่แล้ว (app/actions/tracking-actions.ts) ไม่เปิดให้ query ตรง';
create policy "deny_client_access" on public.timeline_summary
  for all to anon, authenticated using (false) with check (false);
