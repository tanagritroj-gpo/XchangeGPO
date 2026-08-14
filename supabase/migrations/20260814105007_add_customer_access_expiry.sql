-- ฟีเจอร์ "อายุการใช้งานบัญชีลูกค้า 2 ปี" — เริ่มนับจากวันที่ CSR อนุมัติ (b2b_customers.created_at
-- ณ ตอน insert คือวันอนุมัติอยู่แล้ว เพราะ insert เกิดใน reviewClient() ตอนอนุมัติเท่านั้น)
-- ครบกำหนดแล้วต้องต่ออายุถึงจะ login ได้ต่อ พร้อมสวิตช์ "ยกเลิกลูกค้า" แยกต่างหากที่ CSR
-- เปิด-ปิดเองได้ (ไม่ผูกกับวันหมดอายุ)

alter table public.b2b_customers
  add column access_expires_at timestamptz,
  add column cancelled_at timestamptz,
  add column expiry_warned_at timestamptz;

-- backfill ลูกค้าเดิมทั้งหมด — นับ 2 ปีจาก created_at ซึ่งคือวันที่ CSR อนุมัติจริง
update public.b2b_customers
set access_expires_at = created_at + interval '2 years'
where access_expires_at is null;

alter table public.b2b_customers
  alter column access_expires_at set not null,
  alter column access_expires_at set default (now() + interval '2 years');

comment on column public.b2b_customers.access_expires_at is
  'วันหมดอายุการใช้งานระบบของลูกค้ารายนี้ — ค่าเริ่มต้น 2 ปีจากวันที่ insert (คือวันที่ CSR อนุมัติ) ต่ออายุผ่าน renewCustomerAccess() ใน csr-actions.ts';
comment on column public.b2b_customers.cancelled_at is
  'ไม่ใช่ null = ถูก CSR ยกเลิกสิทธิ์เข้าใช้งานด้วยตนเอง (แยกอิสระจาก access_expires_at) — สลับกลับได้ผ่าน reactivateCustomerAccess()';
comment on column public.b2b_customers.expiry_warned_at is
  'timestamp ที่ระบบเคยแจ้งเตือน CSR ว่าใกล้หมดอายุแล้ว (กันแจ้งซ้ำ) — reset เป็น null ทุกครั้งที่ต่ออายุสำเร็จ ให้รอบถัดไปแจ้งเตือนได้อีก';

-- ประวัติการอนุมัติ/ต่ออายุ/ยกเลิก/เปิดใช้งานใหม่ ของแต่ละบัญชีลูกค้า — audit trail สำหรับ
-- หน่วยงานราชการที่ต้องตรวจสอบย้อนหลังได้ว่าใครทำอะไรเมื่อไหร่ ไม่ใช่แค่สถานะปัจจุบัน
create table public.customer_access_log (
  id uuid primary key default gen_random_uuid(),
  b2b_customer_id bigint not null references public.b2b_customers(id) on delete cascade,
  action text not null check (action in ('approved_initial', 'renewed', 'cancelled', 'reactivated')),
  staff_id uuid references public.staff_users(id),
  previous_expires_at timestamptz,
  new_expires_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.customer_access_log is
  'ประวัติการอนุมัติครั้งแรก/ต่ออายุ/ยกเลิก/เปิดใช้งานใหม่ ของสิทธิ์เข้าใช้งานระบบแต่ละบัญชีลูกค้า';

create index idx_customer_access_log_customer
  on public.customer_access_log (b2b_customer_id, created_at desc);

alter table public.customer_access_log enable row level security;

create policy "deny_client_access" on public.customer_access_log
  for all to anon, authenticated using (false) with check (false);

revoke all on table public.customer_access_log from anon, authenticated;

-- ขยาย notification_log ให้รองรับ type ใหม่ customer_expiring — แจ้งเตือน CSR ล่วงหน้าก่อน
-- ลูกค้าหมดอายุจริง ใช้คอลัมน์ customer_id/contact_name/hospital_name ที่มีอยู่แล้ว (เดิมใช้กับ
-- type=ping/new_client) ไม่ต้องเพิ่มคอลัมน์ใหม่
alter table public.notification_log
  drop constraint notification_log_type_check;

alter table public.notification_log
  add constraint notification_log_type_check
  check (type = any (array['ping', 'new_request', 'new_client', 'sla_warning', 'sla_breach', 'customer_expiring']));

-- cron รายวัน (ต่างจาก SLA ที่เป็นรายชั่วโมง เพราะอายุการใช้งานนับเป็นปี ไม่จำเป็นต้องเช็คถี่)
-- ตรวจลูกค้าที่ยังไม่ถูกยกเลิก ใกล้หมดอายุภายใน 30 วัน และยังไม่เคยแจ้งเตือนรอบนี้มาก่อน ยิง
-- แจ้งเตือนครั้งเดียวต่อรอบ แล้ว mark กันแจ้งซ้ำทุกวันถัดไปจนกว่าจะต่ออายุ (reset expiry_warned_at)
create or replace function public.check_customer_expiry_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with to_warn as (
    update public.b2b_customers
    set expiry_warned_at = now()
    where cancelled_at is null
      and access_expires_at > now()
      and access_expires_at <= now() + interval '30 days'
      and expiry_warned_at is null
    returning id, contact_name, hospital_name
  )
  insert into public.notification_log (type, customer_id, contact_name, hospital_name)
  select 'customer_expiring', id, contact_name, hospital_name
  from to_warn;
end;
$$;

revoke execute on function public.check_customer_expiry_notifications() from anon, authenticated, public;
grant execute on function public.check_customer_expiry_notifications() to service_role;

select cron.schedule(
  'check-customer-expiry-notifications',
  '0 6 * * *',
  $$ select public.check_customer_expiry_notifications(); $$
);
