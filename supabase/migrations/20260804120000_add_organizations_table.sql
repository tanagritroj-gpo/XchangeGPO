-- Phase 1 ของการรื้อ "1 hospital_name = 1 customer_code" ให้เป็นความสัมพันธ์จริงในฐานข้อมูล
-- (แทนที่จะพึ่งให้ CSR พิมพ์ customer_code ให้ตรงกันเองทุกครั้งด้วยมือ)
--
-- เพิ่มตาราง organizations เป็นเจ้าของข้อมูลระดับ "หน่วยงาน" (hospital_name, customer_code,
-- province, org_type) แยกจาก b2b_customers ที่ยังคงเป็นข้อมูลระดับ "login รายคน" (email,
-- contact_name, phone, position) เหมือนเดิม — customer_code UNIQUE บน organizations
-- บังคับกฎ 1:1 จริงๆ ระดับ DB แทนการเชื่อใจ text ที่พิมพ์ซ้ำในทุกแถวของ b2b_customers
--
-- Phase นี้ตั้งใจให้ "เพิ่มเข้ามา" แบบไม่กระทบของเดิม — b2b_customers ยังคงคอลัมน์
-- hospital_name/customer_code/province/org_type ไว้เหมือนเดิม (เขียนจาก organizations
-- เสมอตอนนี้ ผ่าน reviewClient ที่แก้คู่กับ migration นี้ ดู app/actions/csr-actions.ts)
-- เพื่อไม่ให้จุดอื่นที่ยังอ่านตรงจาก b2b_customers (searchB2BCustomers, sale coverage,
-- session hydration, get_org_history/get_sale_customer_history RPC, Excel export ฯลฯ)
-- พังทันที — จุดเหล่านั้นจะทยอยย้ายไป join ผ่าน organizations ใน phase ถัดไป

create table public.organizations (
  id bigint generated always as identity primary key,
  customer_code text not null unique,
  hospital_name text not null,
  province text,
  org_type text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.organizations enable row level security;

comment on table public.organizations is 'เจ้าของข้อมูลระดับหน่วยงาน (1 hospital_name = 1 customer_code) — เข้าถึงตรงได้เฉพาะ service_role สิทธิ์ทั้งหมดตรวจสอบในชั้น Next.js server actions';
create policy "deny_client_access" on public.organizations
  for all to anon, authenticated using (false) with check (false);

-- ผูก b2b_customers (login รายคน) เข้ากับ organizations (หน่วยงาน) แบบ many-to-one
alter table public.b2b_customers add column organization_id bigint references public.organizations(id);

-- backfill ข้อมูลเดิม: 1 organization ต่อ customer_code ที่ไม่ซ้ำ (ยืนยันแล้วจากข้อมูลจริง
-- ในโปรเจกต์ ณ วันที่เขียน migration นี้ว่าไม่มี hospital_name ชนกันคนละ customer_code
-- หรือ customer_code ชนกันคนละ hospital_name เลย — ปลอดภัยที่จะ backfill ตรงๆ)
insert into public.organizations (customer_code, hospital_name, province, org_type)
select distinct on (customer_code) customer_code, hospital_name, province, org_type
from public.b2b_customers
where customer_code is not null and btrim(customer_code) <> ''
order by customer_code, created_at asc;

update public.b2b_customers bc
set organization_id = o.id
from public.organizations o
where bc.customer_code = o.customer_code;
