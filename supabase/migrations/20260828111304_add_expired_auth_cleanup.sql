-- ═══════════════════════════════════════════════════════════════════════════════
-- ลบข้อมูล auth ชั่วคราวที่หมดอายุแล้ว (sessions + otp_logs)
-- ปิดช่องโหว่ P1-2 จาก security audit 28 ส.ค. 2569
--   - ตรวจพบ public.sessions   : หมดอายุแล้ว 68/68 แถว — ไม่เคยถูกลบ
--   - ตรวจพบ public.otp_logs   : ค้าง 13 แถว (OTP อายุ 5 นาที) — ไม่เคยถูกลบ
-- มาตรฐาน: PDPA ม.37(3) (เก็บข้อมูลเท่าที่จำเป็น), OWASP ASVS 3.3, ISO 27001 A.8.10
--
-- ─── หลักการ retention ───────────────────────────────────────────────────────
--  sessions : เก็บต่อ 7 วัน "หลังหมดอายุ" แล้วค่อยลบ
--             = grace period ให้ทีมสืบสวน incident ย้อนหลังได้ว่า session ถูกสร้าง
--               เมื่อไร / ให้ actor ไหน (staff_id หรือ customer_id) ก่อนหลักฐานหาย
--             (staff session อายุ 8 ชม. / customer 1 ชม. — expires_at อยู่ใกล้ created_at
--              เสมอ ไม่มี zombie session อายุยาว ตัด `< now() - 7d` ได้สะอาด)
--             หมายเหตุ: เมื่อทำ audit-log ครบตาม P0-3 แล้ว event การสร้าง session
--             จะถูกบันทึกในชั้น audit log จริง grace 7 วันตรงนี้เป็นสะพานชั่วคราว
--
--  otp_logs : เก็บต่อ 1 วัน "หลังหมดอายุ" แล้วค่อยลบ
--             = OTP hash ใช้ไม่ได้แล้วเมื่อ expires_at ผ่านไป เก็บสั้น ๆ เผื่อดู
--               pattern การขอ OTP รัวของอีเมลหนึ่ง — โดยหลักมี rate_limits
--               (`*-pwreset-request` 3 ครั้ง/5 นาที) + Sentry คุมอยู่แล้ว
--             ไม่แยกเคส used=true ให้ลบเร็วกว่า — OTP ที่ใช้แล้ว reuse ไม่ได้
--               (โค้ด verify เช็ค `log.used`) เก็บกฎเดียวคุมง่ายกว่า
--
-- ─── ทำไมลบได้อย่างปลอดภัย ──────────────────────────────────────────────────
--  - ไม่มีตารางอื่น FK มาที่ sessions / otp_logs
--  - ไม่มี code path ไหนอ่านแถวที่หมดอายุ:
--      getStaffSession/getCustomerSession : select by token แล้วเช็ค expires_at > now()
--      resetStaff/CustomerPassword        : select otp ล่าสุดของ email (order desc limit 1)
--      logout / password-change / cancel  : DELETE by token / staff_id / customer_id
--  - ปริมาณลบครั้งแรกเล็กมาก (< 100 แถวรวม) ไม่ต้อง batch
--    (ถ้าอนาคต sessions โตเกิน ~100k แถว ค่อยเพิ่ม loop LIMIT)
--  - DELETE ใน sessions ใช้ idx_sessions_expires_at ที่มีอยู่แล้ว (advisor เคยเตือนว่า
--    "unused" — migration นี้ทำให้มันถูกใช้จริง อย่าลบ index นั้นทิ้ง)
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.cleanup_expired_auth_artifacts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessions_deleted integer;
  v_otp_deleted integer;
begin
  delete from sessions
  where expires_at < now() - interval '7 days';
  get diagnostics v_sessions_deleted = row_count;

  delete from otp_logs
  where expires_at < now() - interval '1 day';
  get diagnostics v_otp_deleted = row_count;

  -- คืน jsonb เพื่อให้เห็นผลใน cron.job_run_details.return_message และตอนรันมือ
  return jsonb_build_object(
    'sessions_deleted', v_sessions_deleted,
    'otp_logs_deleted', v_otp_deleted,
    'ran_at', now()
  );
end;
$$;

-- ล็อกสิทธิ์แบบเดียวกับ cleanup_expired_rate_limits / check_sla_notifications:
-- ปิด PUBLIC + anon + authenticated ทั้งหมด เปิดเฉพาะ service_role
-- (ฟังก์ชันนี้เรียกจาก pg_cron ซึ่งรันในบริบท superuser อยู่แล้ว — grant service_role
--  ไว้เผื่อรันมือผ่าน MCP/Studio ตอน verify)
revoke execute on function public.cleanup_expired_auth_artifacts() from anon, authenticated, public;
grant  execute on function public.cleanup_expired_auth_artifacts() to service_role;

-- cron รายวัน 03:30 UTC (~10:30 น. เวลาไทย) — ถัดจาก 'cleanup-rate-limits-daily' (03:00)
-- staggered กัน 2 งานล็อกตารางชนกัน, ช่วง traffic ต่ำ
-- cron.schedule() เป็น upsert by name — รัน migration ซ้ำได้ไม่ error
select cron.schedule(
  'cleanup-expired-auth-artifacts',
  '30 3 * * *',
  $$ select public.cleanup_expired_auth_artifacts(); $$
);
