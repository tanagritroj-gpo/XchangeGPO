-- แก้ปัญหา doc_number race condition: เดิม get_latest_doc_number() แค่ SELECT ... ORDER BY id
-- DESC LIMIT 1 ไม่มี lock ฝั่ง JS เอามา +1 เอง (form-actions.ts/staff-form-actions.ts) ทำให้
-- 2 คำร้องที่ submit พร้อมกันอาจได้เลขซ้ำได้ ปีก็ hardcode เป็น "2026" ไม่ derive จากวันที่จริง
--
-- แก้โดย: แยก "แสดงตัวอย่างเลข" (ไม่ผูกมัด ไม่จองเลข) ออกจาก "การจองเลขจริง" (atomic เกิดขึ้น
-- ครั้งเดียวตอน insert จริงใน create_exchange_request เท่านั้น ไม่รับ doc_number จาก client
-- อีกต่อไป) ปีคำนวณจากวันที่จริงเสมอ (extract จาก now() UTC ตรงกับ convention เดิมของ
-- created_at ทั้งระบบ) เปลี่ยนปีอัตโนมัติเมื่อปีเปลี่ยนจริง ไม่ต้องแก้โค้ดทุกปี

-- 1) ตัวนับแยกตามปี — 1 แถวต่อ 1 ปี กันชนกันข้ามปี
create table if not exists public.doc_number_counters (
  year int primary key,
  last_number int not null default 0
);

comment on table public.doc_number_counters is
  'ตัวนับเลขที่เอกสาร (doc_number) แยกตามปี ใช้คู่กับ generate_doc_number() เพื่อจองเลขแบบ atomic กันชนกันตอนหลายคำร้อง submit พร้อมกัน';

alter table public.doc_number_counters enable row level security;

create policy "Allow service role to manage doc number counters"
  on public.doc_number_counters
  for all
  to service_role
  using (true)
  with check (true);

-- 2) จองเลขจริงแบบ atomic — เรียกครั้งเดียวตอน insert request จริงเท่านั้น (ดูข้อ 4)
-- ใช้ pattern เดียวกับ increment_rate_limit(): INSERT ... ON CONFLICT ... RETURNING
-- (เป็น atomic operation เดียวใน Postgres กันชนกันได้จริงแม้เรียกพร้อมกันหลาย session)
create or replace function public.generate_doc_number()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_year int := extract(year from now())::int;
  v_next int;
begin
  insert into public.doc_number_counters as c (year, last_number)
  values (v_year, 1)
  on conflict (year) do update
    set last_number = c.last_number + 1
  returning c.last_number into v_next;

  return 'S' || lpad(v_next::text, 3, '0') || '/' || v_year::text;
end;
$function$;

revoke execute on function public.generate_doc_number() from public, anon, authenticated;
grant execute on function public.generate_doc_number() to service_role;

-- 3) preview เลขถัดไป — ไม่จอง ไม่ lock แค่อ่านอย่างเดียว ใช้โชว์ในหน้าฟอร์มก่อน submit จริง
-- (เดิม get_latest_doc_number() ทำหน้าที่นี้ แต่ผิดพลาดถ้าข้ามปี เพราะอิงจาก requests แถวล่าสุด
-- ไม่ใช่ตัวนับปีปัจจุบัน — ตัวนี้แก้จุดนั้นด้วย)
create or replace function public.peek_next_doc_number()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_year int := extract(year from now())::int;
  v_last int;
begin
  select last_number into v_last from public.doc_number_counters where year = v_year;
  return 'S' || lpad((coalesce(v_last, 0) + 1)::text, 3, '0') || '/' || v_year::text;
end;
$function$;

revoke execute on function public.peek_next_doc_number() from public, anon, authenticated;
grant execute on function public.peek_next_doc_number() to service_role;

-- 4) create_exchange_request: เลิกรับ doc_number จาก client (p_request_data->>'doc_number')
-- เปลี่ยนไปเรียก generate_doc_number() เองภายใน transaction เดียวกับการ insert เพื่อการันตี
-- ว่าเลขที่ได้ไม่มีทางซ้ำ/ค้าง แม้ client จะถือ preview เก่าจากเมื่อไหร่ก็ตาม (คง signature เดิม
-- ทุกจุด grants เดิมที่ lock ไว้แล้วจาก migration ก่อนหน้ายังใช้ได้ต่อเพราะ CREATE OR REPLACE
-- ไม่เปลี่ยน signature)
create or replace function public.create_exchange_request(p_b2b_customer_id bigint, p_request_data jsonb, p_drug_items jsonb, p_created_by_staff_id uuid default null::uuid, p_submission_channel text default 'customer_portal'::text)
 returns table(request_id bigint, ref_id text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request_id bigint;
  v_ref_id text;
  v_doc_number text;
  v_item jsonb;
begin
  v_doc_number := public.generate_doc_number();

  insert into public.requests (
    ref_id, doc_number, request_type, hospital_name, contact_name, phone, province,
    customer_email, b2b_customer_id, return_reason, delivery_type,
    addr_street, addr_sub, addr_district, addr_province, agent_info,
    exchange_product_type, exchange_product_list, exchange_product_other,
    signature_url, signer_name, signer_position, total_value, request_date,
    created_by_staff_id, submission_channel
  ) values (
    p_request_data->>'ref_id', v_doc_number, p_request_data->>'request_type',
    p_request_data->>'hospital_name', p_request_data->>'contact_name', p_request_data->>'phone',
    p_request_data->>'province',
    p_request_data->>'customer_email', p_b2b_customer_id, p_request_data->>'return_reason',
    p_request_data->>'delivery_type', p_request_data->>'addr_street', p_request_data->>'addr_sub',
    p_request_data->>'addr_district', p_request_data->>'addr_province', p_request_data->>'agent_info',
    p_request_data->>'exchange_product_type', p_request_data->>'exchange_product_list',
    p_request_data->>'exchange_product_other', p_request_data->>'signature_url',
    p_request_data->>'signer_name', p_request_data->>'signer_position',
    (p_request_data->>'total_value')::numeric, (p_request_data->>'request_date')::timestamp with time zone,
    p_created_by_staff_id, p_submission_channel
  ) returning id, public.requests.ref_id into v_request_id, v_ref_id;

  if p_drug_items is not null then
    for v_item in select * from jsonb_array_elements(p_drug_items)
    loop
      insert into public.drug_items (
        request_id, drug_name, qty, unit, lot_number, exp_date, unit_price, value_amount, invoice_number
      ) values (
        v_request_id, v_item->>'drug_name', (v_item->>'qty')::integer, v_item->>'unit',
        v_item->>'lot_number', (v_item->>'exp_date')::date, (v_item->>'unit_price')::numeric,
        (v_item->>'value_amount')::numeric, v_item->>'invoice_number'
      );
    end loop;
  end if;

  return query select v_request_id, v_ref_id;
end;
$function$;

-- 5) safety net ระดับ DB กันเลขซ้ำแม้เกิดบั๊กชั้นแอปพลิเคชัน (ยืนยันแล้วว่าไม่มีข้อมูลซ้ำอยู่ก่อน
-- ณ ตอนรัน migration นี้ — เช็คจริงก่อน apply)
alter table public.requests add constraint requests_doc_number_key unique (doc_number);

-- 6) เลิกใช้ฟังก์ชันเดิมที่ผิดพลาด — ไม่มีจุดไหนในโค้ดเรียกแล้วหลัง migration นี้
drop function if exists public.get_latest_doc_number();

-- 7) ตั้งค่าตัวนับปีปัจจุบันให้ตรงกับข้อมูลจริงที่มีอยู่แล้ว (S004/2026 ล่าสุด -> ตัวนับเริ่มที่ 4
-- ตัวถัดไปจะเป็น S005/2026 ต่อเนื่องจากของเดิม ไม่กระโดดข้าม ไม่ย้อนไปซ้ำเลขเก่า)
insert into public.doc_number_counters (year, last_number)
select extract(year from created_at)::int, max(substring(doc_number from 2 for 3)::int)
from public.requests
where doc_number ~ '^S[0-9]{3}/[0-9]{4}$'
group by extract(year from created_at)::int
on conflict (year) do update set last_number = greatest(doc_number_counters.last_number, excluded.last_number);
