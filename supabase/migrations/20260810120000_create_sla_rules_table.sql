-- SLA Monitoring: ตาราง sla_rules — 1 แถวต่อ status_name ที่ยังไม่ใช่ terminal state
-- (rejected/completed ไม่มี SLA clock ตามดีไซน์ — ดู 06-sla-monitoring-design.md หัวข้อ 4)
create table public.sla_rules (
  status_name  text primary key
    check (status_name in (
      'pending_review', 'approved', 'in_transit', 'at_warehouse',
      'checked_in', 'receiving', 'exchanging', 'credit_note', 'out_for_delivery'
    )),
  sla_days     integer not null check (sla_days > 0),
  warning_days integer not null default 1 check (warning_days >= 0),
  updated_by   uuid references public.staff_users(id),
  updated_at   timestamptz not null default timezone('utc'::text, now())
);

comment on table public.sla_rules is
  'กฎ SLA ต่อ status_name (นับเป็นวันทำการ) แก้ไขได้เองผ่านหน้า manager (/admin/manager/sla) — เข้าถึงตรงได้เฉพาะ service_role, ฝั่งแอปคุมสิทธิ์ผ่าน getManagerSession()';

-- ค่าเริ่มต้นชั่วคราว — manager แก้เองทันทีผ่านหน้าตั้งค่าใหม่ ค่าตรงนี้ไม่ใช่ค่าที่ต้อง "ถูกต้อง" ตั้งแต่แรก
insert into public.sla_rules (status_name, sla_days, warning_days) values
  ('pending_review',   1, 1),
  ('approved',         1, 1),
  ('in_transit',       3, 1),
  ('at_warehouse',     1, 1),
  ('checked_in',       1, 1),
  ('receiving',        1, 1),
  ('exchanging',       3, 1),
  ('credit_note',      3, 1),
  ('out_for_delivery', 3, 1);

alter table public.sla_rules enable row level security;

-- เข้าถึงได้เฉพาะ service_role (ทุก action ในแอปผ่าน supabaseAdmin) — RLS เป็น defense-in-depth
-- ตาม pattern เดียวกับตารางอื่นทั้งหมดในระบบ (ดู 20260727124635_harden_rls_policies.sql)
create policy "Allow service role to manage sla rules"
  on public.sla_rules
  for all
  to service_role
  using (true)
  with check (true);

create policy "deny_client_access" on public.sla_rules
  for all to anon, authenticated using (false) with check (false);
