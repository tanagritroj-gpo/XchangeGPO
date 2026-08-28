-- SLA Monitoring: ฟังก์ชันคำนวณวันทำการ (เว้นเสาร์-อาทิตย์เท่านั้น ไม่รวมวันหยุดราชการไทย —
-- ดู 06-sla-monitoring-design.md หัวข้อ 4) ใช้เฉพาะตอน backfill ข้อมูลย้อนหลังครั้งเดียว
-- (migration ถัดไป) และเก็บไว้เป็นเครื่องมือแก้ไขข้อมูลด้วยมือในอนาคต — cron job ประจำ
-- (check_sla_notifications, migration ถัดๆ ไป) ไม่คำนวณวันทำการเอง ใช้ค่าที่ denormalize
-- ไว้แล้วบน requests.status_due_at/status_warn_at (คำนวณฝั่ง TypeScript ใน lib/sla.ts
-- ตอนสถานะเปลี่ยนจริง) เทียบ timestamp ตรงๆ เท่านั้น
create or replace function public.add_sla_business_days(start_ts timestamptz, n_days integer)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  d     timestamptz := start_ts;
  added integer := 0;
begin
  if n_days <= 0 then
    return start_ts;
  end if;

  while added < n_days loop
    d := d + interval '1 day';
    if extract(dow from d) not in (0, 6) then -- 0=อาทิตย์, 6=เสาร์
      added := added + 1;
    end if;
  end loop;

  return d;
end;
$$;

revoke execute on function public.add_sla_business_days(timestamptz, integer) from anon, authenticated, public;
grant execute on function public.add_sla_business_days(timestamptz, integer) to service_role;
