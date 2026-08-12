-- ตารางกลาง log การแจ้งเตือนของทีมงาน (Manager/CSR) — รวมเป็นจุดเดียวแทนที่จะแยกตาราง
-- เฉพาะทางแบบ request_pings เดิม เพื่อขยายเพิ่มประเภทแจ้งเตือนในอนาคตได้ง่าย (แค่เพิ่มค่าใน
-- type + คอลัมน์ nullable ที่เกี่ยวข้อง ไม่ต้องสร้างตาราง+server action ชุดใหม่ทุกครั้ง)
-- ไม่มีคอลัมน์ department เพราะ Manager/CSR เห็นข้อมูลเท่ากัน (เหมือน request_pings เดิม)
-- ฮาร์ดโค้ด RLS ให้ครบตั้งแต่สร้างเลย (service_role policy + deny_client_access +
-- revoke public grants) — ต่างจาก request_pings ที่กว่าจะแน่นหนาครบต้องผ่าน 3 migration
-- ทยอยแก้ทีหลัง (create → harden → revoke_public_grants)
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('ping', 'new_request', 'new_client')),

  -- ping, new_request: ผูกกับใบงาน
  request_id bigint references public.requests(id) on delete cascade,
  ref_id text,

  -- ping เท่านั้น: ลูกค้าคนที่กดเร่งงาน
  customer_id bigint references public.b2b_customers(id) on delete cascade,

  -- new_client เท่านั้น: ลูกค้าที่ลงทะเบียนใหม่ (clients.id เป็น uuid ไม่ใช่ bigint)
  client_id uuid references public.clients(id) on delete cascade,
  contact_name text,
  hospital_name text,

  created_at timestamptz not null default timezone('utc'::text, now()),
  read_at timestamptz,
  read_by uuid references public.staff_users(id)
);

comment on table public.notification_log is
  'Log การแจ้งเตือนรวมของ Manager/CSR — ping เร่งงาน, คำร้องใหม่เข้าระบบ, ลูกค้าลงทะเบียนใหม่ (type ขยายเพิ่มได้ในอนาคต)';

create index if not exists idx_notification_log_created_at
  on public.notification_log (created_at desc);

-- ใช้ query/นับ badge ที่ยังไม่อ่าน (partial index เร็วกว่าเพราะ unread เป็นส่วนน้อยของข้อมูลเสมอ)
create index if not exists idx_notification_log_unread
  on public.notification_log (created_at desc)
  where read_at is null;

alter table public.notification_log enable row level security;

-- ตาม pattern เดียวกับ request_pings: query ทั้งหมดวิ่งผ่าน supabaseAdmin (service_role)
-- จาก server actions เท่านั้น ไม่เปิดให้ anon/authenticated เข้าถึงตรงๆ เลย
create policy "Allow service role to manage notification log"
  on public.notification_log
  for all
  to service_role
  using (true)
  with check (true);

create policy "deny_client_access" on public.notification_log
  for all to anon, authenticated using (false) with check (false);

revoke all on table public.notification_log from anon, authenticated;

-- ย้ายข้อมูล ping เดิมเข้าตารางรวม (request_pings ยังไม่ถูกลบ — เก็บไว้เป็น safety net
-- จนกว่าจะยืนยันว่าโค้ดฝั่ง app ทำงานถูกต้องกับตารางใหม่แล้ว)
insert into public.notification_log (id, type, request_id, ref_id, customer_id, created_at, read_at, read_by)
select id, 'ping', request_id, ref_id, customer_id, created_at, read_at, read_by
from public.request_pings
on conflict (id) do nothing;
