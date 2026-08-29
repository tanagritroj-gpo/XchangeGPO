-- Phase 2 of 13-mfa-remember-me-design.md: mandatory TOTP MFA for every staff role,
-- with a 14-day grace window for the 10 existing staff to enroll.

-- 1. MFA columns on staff_users -------------------------------------------------
alter table public.staff_users
  add column mfa_secret bytea,
  add column mfa_enabled boolean not null default false,
  add column mfa_enrolled_at timestamptz,
  add column mfa_grace_until timestamptz;

comment on column public.staff_users.mfa_secret is
  'TOTP secret (base32 text), encrypted at rest via extensions.pgp_sym_encrypt under env MFA_SECRET_KEY. Read/write ONLY through set_staff_mfa_secret / get_staff_mfa_secret RPCs (service_role).';
comment on column public.staff_users.mfa_grace_until is
  'Deadline to enroll MFA. NULL once enrolled. Past-due + not enabled => forced enrollment on login.';

-- Existing staff get a 14-day grace window from apply time.
update public.staff_users
  set mfa_grace_until = now() + interval '14 days'
  where mfa_enabled = false and mfa_grace_until is null;

-- 2. Single-use recovery codes ------------------------------------------------
create table public.staff_mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_users(id) on delete cascade,
  code_hash text not null,          -- sha256(code + OTP_PEPPER), same scheme as otp_logs
  used_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.staff_mfa_recovery_codes is
  'One-time MFA recovery codes. 10 generated at enrollment, shown once, hashed with OTP_PEPPER.';

alter table public.staff_mfa_recovery_codes enable row level security;
create policy deny_client_access on public.staff_mfa_recovery_codes
  for all to anon, authenticated using (false) with check (false);
create index idx_staff_mfa_recovery_codes_staff on public.staff_mfa_recovery_codes(staff_id);

-- 3. Two-step login: a session that has passed password but not yet the 2nd factor
alter table public.sessions
  add column mfa_pending boolean not null default false;
comment on column public.sessions.mfa_pending is
  'true = password verified, TOTP/recovery-code still required. getStaffSession() treats such sessions as unauthenticated except on the MFA-challenge / forced-enrollment routes.';

-- 4. Allow MFA events in the staff account-change audit log
alter table public.staff_account_change_logs
  drop constraint staff_account_change_logs_field_check;
alter table public.staff_account_change_logs
  add constraint staff_account_change_logs_field_check
  check (field = any (array['username'::text, 'email'::text, 'password'::text, 'mfa'::text]));

-- 5. pgcrypto-backed secret access RPCs --------------------------------------
-- Key is passed as a parameter (never stored in the DB) so a plain DB dump cannot
-- decrypt the secrets. Statement logging is not verbose on this project; noted in design doc.
create or replace function public.set_staff_mfa_secret(p_staff_id uuid, p_secret text, p_key text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.staff_users
    set mfa_secret = extensions.pgp_sym_encrypt(p_secret, p_key)
    where id = p_staff_id;
$$;

create or replace function public.get_staff_mfa_secret(p_staff_id uuid, p_key text)
returns text
language sql
security definer
set search_path to 'public'
as $$
  select extensions.pgp_sym_decrypt(mfa_secret, p_key)
    from public.staff_users
    where id = p_staff_id and mfa_secret is not null;
$$;

revoke execute on function public.set_staff_mfa_secret(uuid, text, text) from public;
revoke execute on function public.get_staff_mfa_secret(uuid, text) from public;
grant execute on function public.set_staff_mfa_secret(uuid, text, text) to service_role;
grant execute on function public.get_staff_mfa_secret(uuid, text) to service_role;
