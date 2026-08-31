-- ═══════════════════════════════════════════════════════════════════════════════
-- ลด grace period ของการลบ public.sessions ที่หมดอายุ: 7 วัน → 1 วัน
-- ═══════════════════════════════════════════════════════════════════════════════
-- grace 7 วันเดิม (migration 20260828111304) ตั้งไว้เป็น "สะพานชั่วคราว" เผื่อทีม
-- สืบสวน incident ย้อนหลังว่า session ถูกสร้างเมื่อไร / ให้ actor ไหน / จาก IP ใด
-- "จนกว่าจะทำ audit-log ครบตาม P0-3"
--
-- ─── ตอนนี้ audit log ครบแล้ว ──────────────────────────────────────────────────
-- public.audit_events (migration 20260828175215 เป็นต้นไป) บันทึก event หมวด 'auth'
-- ทุกตัว — auth.login.success / auth.mfa.challenge.* / auth.logout / auth.new_location
-- / auth.session.revoked — พร้อม ip, user_agent, actor_staff_id/actor_customer_id,
-- occurred_at, outcome และเป็น append-only (UPDATE/DELETE ถูกบล็อก) retention 24 เดือน
-- ตรวจข้อมูลจริง 31 ส.ค. 2569: auth.login.success ทุกแถว (staff 14, customer 7)
-- มี ip + user_agent + actor ครบ 100%
--
-- => การเก็บแถว session ที่ตายแล้วต่ออีก 7 วันไม่ให้ประโยชน์ในการสืบสวนเพิ่มอีกแล้ว
--    (ซ้ำกับ audit_events) และขัดหลัก data minimization ของ PDPA ม.37(3)
--    (แถว session เก็บ ip + user_agent + การผูกกับตัวบุคคล = ข้อมูลส่วนบุคคล)
--
-- ─── ทำไม 1 วัน ไม่ใช่ 0 ──────────────────────────────────────────────────────
--  - กัน race: cron รันตอน 03:30 UTC ทุกวัน ถ้าใช้ `expires_at < now()` เฉย ๆ อาจลบ
--    แถวที่เพิ่งหมดอายุไปไม่กี่วินาทีขณะ request สุดท้ายยังค้างอยู่ — buffer 1 วันชัวร์กว่า
--  - ฝั่ง UX ไม่เกี่ยวแล้ว: getMyCustomerSessions / getMyStaffSessionsAndDevices กรอง
--    `expires_at > now()` ตั้งแต่ commit 01260ef — ผู้ใช้ไม่เห็นแถวหมดอายุไม่ว่ากรณีใด
--  - เท่ากับ grace ของ otp_logs / staff_trusted_devices อยู่แล้ว คุมกฎเดียวง่ายกว่า
--
-- ─── ข้อกำหนดการเก็บ log ตามกฎหมาย ────────────────────────────────────────────
--  พ.ร.บ. คอมพิวเตอร์ฯ 2560 ม.26 (เก็บข้อมูลจราจร ≥ 90 วัน) ถูกรองรับโดย retention
--  24 เดือนของ audit_events ไม่ใช่โดย grace ของตาราง sessions
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.cleanup_expired_auth_artifacts()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sessions_deleted integer;
  v_otp_deleted integer;
  v_devices_deleted integer;
  v_ips_deleted integer;
begin
  delete from sessions
  where expires_at < now() - interval '1 day';
  get diagnostics v_sessions_deleted = row_count;

  delete from otp_logs
  where expires_at < now() - interval '1 day';
  get diagnostics v_otp_deleted = row_count;

  delete from staff_trusted_devices
  where expires_at < now() - interval '1 day';
  get diagnostics v_devices_deleted = row_count;

  delete from known_login_ips
  where last_seen_at < now() - interval '90 days';
  get diagnostics v_ips_deleted = row_count;

  return jsonb_build_object(
    'sessions_deleted', v_sessions_deleted,
    'otp_logs_deleted', v_otp_deleted,
    'trusted_devices_deleted', v_devices_deleted,
    'known_login_ips_deleted', v_ips_deleted,
    'ran_at', now()
  );
end;
$function$;
