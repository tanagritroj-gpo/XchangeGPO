-- Phase 3 of 13-mfa-remember-me-design.md: "remember this device" (skip the 2nd
-- factor for 30 days), session/device management, and new-location login alerts.

-- 1. Session metadata --------------------------------------------------------
alter table public.sessions
  add column user_agent text,
  add column ip text,
  add column last_seen_at timestamptz;
comment on column public.sessions.last_seen_at is
  'Throttled (>1h) touch from getStaffSession/getCustomerSession so the device list can show "last active".';

-- 2. Trusted devices (staff only — customers have no 2nd factor to skip) -----
create table public.staff_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_users(id) on delete cascade,
  token_hash text not null unique,        -- sha256(raw token); raw lives only in the staff_mfa_device cookie
  label text,                             -- e.g. "Chrome บน Windows"
  user_agent text,
  ip text,
  expires_at timestamptz not null,        -- created_at + 30d
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table public.staff_trusted_devices is
  'A valid, unexpired row lets loginStaffAction skip the TOTP challenge for that staff member. Token is rotated on every use.';
alter table public.staff_trusted_devices enable row level security;
create policy deny_client_access on public.staff_trusted_devices
  for all to anon, authenticated using (false) with check (false);
create index idx_staff_trusted_devices_staff on public.staff_trusted_devices(staff_id);

-- 3. Known login locations (for the new-location email alert) ---------------
create table public.known_login_ips (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('staff', 'customer')),
  staff_id uuid references public.staff_users(id) on delete cascade,
  customer_id bigint references public.b2b_customers(id) on delete cascade,
  ip text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check (
    (actor_type = 'staff' and staff_id is not null and customer_id is null) or
    (actor_type = 'customer' and customer_id is not null and staff_id is null)
  )
);
comment on table public.known_login_ips is
  'One row per (actor, IP) ever seen on a successful login. A first-time IP for an actor who already has >=1 row triggers a security-alert email.';
alter table public.known_login_ips enable row level security;
create policy deny_client_access on public.known_login_ips
  for all to anon, authenticated using (false) with check (false);
create unique index known_login_ips_staff_uq on public.known_login_ips (staff_id, ip) where actor_type = 'staff';
create unique index known_login_ips_customer_uq on public.known_login_ips (customer_id, ip) where actor_type = 'customer';

-- 4. Extend the nightly cleanup to cover the new tables --------------------
create or replace function public.cleanup_expired_auth_artifacts()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sessions_deleted integer;
  v_otp_deleted integer;
  v_devices_deleted integer;
  v_ips_deleted integer;
begin
  delete from sessions
  where expires_at < now() - interval '7 days';
  get diagnostics v_sessions_deleted = row_count;

  delete from otp_logs
  where expires_at < now() - interval '1 day';
  get diagnostics v_otp_deleted = row_count;

  delete from staff_trusted_devices
  where expires_at < now() - interval '1 day';
  get diagnostics v_devices_deleted = row_count;

  delete from known_login_ips
  where last_seen_at < now() - interval '90 days';
  get diagnostics v_ips_deleted = row_count;

  return jsonb_build_object(
    'sessions_deleted', v_sessions_deleted,
    'otp_logs_deleted', v_otp_deleted,
    'trusted_devices_deleted', v_devices_deleted,
    'known_login_ips_deleted', v_ips_deleted,
    'ran_at', now()
  );
end;
$function$;
