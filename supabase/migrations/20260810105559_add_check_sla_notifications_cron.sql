-- SLA Monitoring: ฟังก์ชัน cron หลัก — ตรวจใบงาน active ทุกใบ ยิงแจ้งเตือน 2 ระดับ
-- (ใกล้ครบ / เกินกำหนด) ตามดีไซน์ใน 06-sla-monitoring-design.md หัวข้อ 5
--
-- ★ mapping current_status → department (CASE ด้านล่าง) ต้องตรงกับ STATUS_OWNER_DEPARTMENT
-- ใน lib/sla.ts เป๊ะ — ไม่มีจุดเดียวที่เป็น source of truth ร่วมกันระหว่าง SQL กับ TypeScript
-- แก้ที่นี่ต้องแก้ที่นั่นด้วยเสมอ
create or replace function public.check_sla_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) เตือนใกล้ครบกำหนด — ครั้งเดียวต่อสถานะ ส่งเฉพาะแผนกเจ้าของงาน (ไม่แจ้ง manager)
  with to_warn as (
    update public.requests
    set sla_warned_at = now()
    where current_status not in ('rejected', 'completed')
      and status_due_at is not null
      and now() >= status_warn_at
      and now() < status_due_at
      and sla_warned_at is null
    returning id, ref_id, contact_name, hospital_name, current_status
  )
  insert into public.notification_log (type, request_id, ref_id, contact_name, hospital_name, department)
  select
    'sla_warning', id, ref_id, contact_name, hospital_name,
    case current_status
      when 'pending_review'   then 'csr'
      when 'receiving'        then 'csr'
      when 'exchanging'       then 'csr'
      when 'credit_note'      then 'csr'
      when 'approved'         then 'logistics'
      when 'in_transit'       then 'logistics'
      when 'out_for_delivery' then 'logistics'
      when 'at_warehouse'     then 'warehouse'
      when 'checked_in'       then 'warehouse'
    end
  from to_warn;

  -- 2) เกินกำหนด — แผนกเจ้าของงาน แจ้งซ้ำได้วันละ 1 ครั้งจนกว่าจะเปลี่ยนสถานะ
  with to_breach_staff as (
    update public.requests
    set sla_breach_last_staff_notified_date = current_date
    where current_status not in ('rejected', 'completed')
      and status_due_at is not null
      and now() >= status_due_at
      and (sla_breach_last_staff_notified_date is null or sla_breach_last_staff_notified_date < current_date)
    returning id, ref_id, contact_name, hospital_name, current_status
  )
  insert into public.notification_log (type, request_id, ref_id, contact_name, hospital_name, department)
  select
    'sla_breach', id, ref_id, contact_name, hospital_name,
    case current_status
      when 'pending_review'   then 'csr'
      when 'receiving'        then 'csr'
      when 'exchanging'       then 'csr'
      when 'credit_note'      then 'csr'
      when 'approved'         then 'logistics'
      when 'in_transit'       then 'logistics'
      when 'out_for_delivery' then 'logistics'
      when 'at_warehouse'     then 'warehouse'
      when 'checked_in'       then 'warehouse'
    end
  from to_breach_staff;

  -- 3) เกินกำหนด — manager แจ้งครั้งเดียวตลอด (department = NULL คือ sentinel เฉพาะ manager)
  with to_breach_manager as (
    update public.requests
    set sla_breach_manager_notified_at = now()
    where current_status not in ('rejected', 'completed')
      and status_due_at is not null
      and now() >= status_due_at
      and sla_breach_manager_notified_at is null
    returning id, ref_id, contact_name, hospital_name
  )
  insert into public.notification_log (type, request_id, ref_id, contact_name, hospital_name, department)
  select 'sla_breach', id, ref_id, contact_name, hospital_name, null
  from to_breach_manager;
end;
$$;

revoke execute on function public.check_sla_notifications() from anon, authenticated, public;
grant execute on function public.check_sla_notifications() to service_role;

-- ทุกชั่วโมง — ปรับความถี่ภายหลังได้ด้วย cron.alter_job ถ้า manager ต้องการเร็ว/ช้ากว่านี้
select cron.schedule(
  'check-sla-notifications',
  '0 * * * *',
  $$ select public.check_sla_notifications(); $$
);
