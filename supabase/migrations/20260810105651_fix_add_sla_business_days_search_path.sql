-- ตั้ง search_path ให้ add_sla_business_days() ที่ตกหล่นตอนสร้างครั้งแรก — ฟังก์ชันนี้
-- ประกาศเป็น immutable (สัญญาว่า output ขึ้นกับ input เท่านั้น) แต่ไม่ fix search_path ไว้
-- ทำให้ผลลัพธ์แปรผันตาม session search_path ได้ในทางทฤษฎี ขัดกับสัญญา immutable ของตัวเอง —
-- ตั้ง search_path ให้ตรงกับ pattern เดียวกับฟังก์ชันอื่นในระบบ revoke/grant EXECUTE ซ้ำไว้
-- ด้วยเพราะ create or replace ไม่ล้าง grant เดิม แต่กันพลาดกรณี grant ไม่ตรงตั้งแต่แรก
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
    if extract(dow from d) not in (0, 6) then
      added := added + 1;
    end if;
  end loop;

  return d;
end;
$$;

revoke execute on function public.add_sla_business_days(timestamptz, integer) from anon, authenticated, public;
grant execute on function public.add_sla_business_days(timestamptz, integer) to service_role;
