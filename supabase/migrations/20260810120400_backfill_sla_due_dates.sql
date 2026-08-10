-- SLA Monitoring: backfill ครั้งเดียวสำหรับใบงานที่เปิดอยู่ ณ วันที่ migration นี้ apply
-- (rejected/completed ไม่แตะต้อง — terminal, ไม่มี SLA clock) status_entered_at อ้างอิงจาก
-- status_logs.log_date ล่าสุดที่ตรงกับ current_status ปัจจุบัน, fallback เป็น updated_at
-- แล้วค่อย now() ถ้าไม่มีทั้งคู่ — ดู 06-sla-monitoring-design.md หัวข้อ 9.1(ง)
with entered as (
  select
    r.id,
    r.current_status,
    coalesce(
      (
        select max(s.log_date)
        from public.status_logs s
        where s.request_id = r.id and s.status_name = r.current_status
      ),
      r.updated_at,
      now()
    ) as entered_at
  from public.requests r
  where r.current_status not in ('rejected', 'completed')
),
computed as (
  select
    e.id,
    e.entered_at,
    public.add_sla_business_days(e.entered_at, sr.sla_days) as due_at,
    public.add_sla_business_days(e.entered_at, greatest(sr.sla_days - sr.warning_days, 0)) as warn_at
  from entered e
  join public.sla_rules sr on sr.status_name = e.current_status
)
update public.requests r
set
  status_entered_at = c.entered_at,
  status_due_at      = c.due_at,
  status_warn_at     = c.warn_at
from computed c
where r.id = c.id;
