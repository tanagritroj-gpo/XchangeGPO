-- ตารางเก็บ "กระดิ่งเร่งงาน" ที่ลูกค้ากดจากหน้า tracking
-- แจ้งเตือนไปยัง Manager/CSR ผ่าน StaffChatWidget (badge + บอททักก่อน)
-- ไม่มีคอลัมน์ department เพราะ Manager/CSR เห็นข้อมูลเท่ากัน ping เดียวให้ทั้งคู่เห็น
create table if not exists public.request_pings (
  id uuid primary key default gen_random_uuid(),
  request_id bigint not null references public.requests(id) on delete cascade,
  ref_id text not null,
  customer_id bigint not null references public.b2b_customers(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  read_at timestamptz,
  read_by uuid references public.staff_users(id)
);

comment on table public.request_pings is
  'กระดิ่งเร่งงานที่ลูกค้ากดจากหน้า tracking (one-shot ping, cooldown 6 ชม./คำร้อง) — แจ้งเตือน Manager/CSR ผ่าน StaffChatWidget';

-- ใช้เช็ค cooldown (หา ping ล่าสุดของ request_id นี้) และดึงรายการ unread เรียงเวลา
create index if not exists idx_request_pings_request_id_created_at
  on public.request_pings (request_id, created_at desc);

-- ใช้ query/นับ badge ที่ยังไม่อ่าน (partial index เร็วกว่าเพราะ unread เป็นส่วนน้อยของข้อมูลเสมอ)
create index if not exists idx_request_pings_unread
  on public.request_pings (created_at desc)
  where read_at is null;

alter table public.request_pings enable row level security;

-- ตาม pattern เดียวกับตาราง rate_limits: query ทั้งหมดวิ่งผ่าน supabaseAdmin
-- (service_role) จาก server actions เท่านั้น ไม่เปิดให้ anon/authenticated
-- เข้าถึงตรงๆ เลย การควบคุมสิทธิ์จริงอยู่ที่ server action (เช็ค session +
-- ความเป็นเจ้าของ request) ไม่ใช่ policy นี้
create policy "Allow service role to manage request pings"
  on public.request_pings
  for all
  to service_role
  using (true)
  with check (true);
