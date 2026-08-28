-- Phase A of 14-audit-logging-design.md — append-only audit trail (Go-Live Gate G0-3).
-- Immutability = REVOKE + trigger; retention = drop monthly partitions (DDL, not row DELETE).

-- 1. Shared "this table is append-only" trigger function ----------------------
create or replace function public.reject_mutation()
  returns trigger
  language plpgsql
as $$
begin
  raise exception '% is append-only (% blocked for role %)', tg_table_name, tg_op, current_user
    using errcode = '42501';  -- insufficient_privilege
end $$;

-- 2. The partitioned table --------------------------------------------------
create table public.audit_events (
  id                bigint generated always as identity,
  occurred_at       timestamptz not null default now(),
  category          text not null check (category in ('auth','data_access','admin_action','system')),
  action            text not null,
  outcome           text check (outcome in ('success','failure')),
  actor_type        text check (actor_type in ('staff','customer','system','anon')),
  actor_staff_id    uuid,
  actor_customer_id bigint,
  actor_label       text,
  target_type       text,
  target_id         text,
  ip                text,
  user_agent        text,
  detail            jsonb not null default '{}'::jsonb,
  primary key (occurred_at, id)
) partition by range (occurred_at);

comment on table public.audit_events is
  'Append-only audit trail (G0-3). Rows are physically immutable: UPDATE/DELETE blocked by '
  'trg_audit_events_immutable + REVOKE from service_role. Retention (24 months) enforced by '
  'dropping monthly partitions in audit_events_maintain(). Owner: postgres — service_role cannot ALTER/DROP.';

alter table public.audit_events enable row level security;
create policy deny_client_access on public.audit_events
  for all to anon, authenticated using (false) with check (false);

-- parent-level indexes propagate to every current + future partition
create index audit_events_actor_staff_idx    on public.audit_events (actor_staff_id, occurred_at desc);
create index audit_events_actor_customer_idx on public.audit_events (actor_customer_id, occurred_at desc);
create index audit_events_action_idx         on public.audit_events (category, action, occurred_at desc);
create index audit_events_target_idx         on public.audit_events (target_type, target_id);

-- catch-all so an insert never fails even if maintain() has not run yet
create table public.audit_events_default partition of public.audit_events default;

-- immutability trigger on the parent propagates to all partitions
create trigger trg_audit_events_immutable
  before update or delete on public.audit_events
  for each row execute function public.reject_mutation();

-- privileges: service_role may only append + read
revoke all on public.audit_events from anon, authenticated;
revoke update, delete, truncate on public.audit_events, public.audit_events_default from service_role, public;
grant insert, select on public.audit_events to service_role;

-- 3. Partition maintenance: create ahead, drop expired -----------------------
create or replace function public.audit_events_maintain()
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_retention_months int := 24;
  v_created text[] := '{}';
  v_dropped text[] := '{}';
  v_cutoff date := (date_trunc('month', now()) - (v_retention_months || ' months')::interval)::date;
  v_part text;
  m date;
  r record;
  v_orphans bigint;
begin
  for m in
    select generate_series(date_trunc('month', now()),
                           date_trunc('month', now()) + interval '2 months',
                           interval '1 month')::date
  loop
    v_part := 'audit_events_' || to_char(m, 'YYYYMM');
    if not exists (
      select 1 from pg_class
      where relname = v_part and relnamespace = 'public'::regnamespace
    ) then
      execute format(
        'create table public.%I partition of public.audit_events for values from (%L) to (%L)',
        v_part, m, (m + interval '1 month')::date);
      execute format(
        'revoke update, delete, truncate on public.%I from service_role, public', v_part);
      v_created := v_created || v_part;
    end if;
  end loop;

  for r in
    select c.relname
    from pg_class c
    join pg_inherits i on i.inhrelid = c.oid
    where i.inhparent = 'public.audit_events'::regclass
      and c.relname ~ '^audit_events_[0-9]{6}$'
      and to_date(right(c.relname, 6), 'YYYYMM') < v_cutoff
  loop
    execute format('drop table if exists public.%I', r.relname);
    v_dropped := v_dropped || r.relname;
  end loop;

  if array_length(v_dropped, 1) is not null then
    insert into public.audit_events(category, action, actor_type, detail)
    values ('system', 'system.retention.purged', 'system',
            jsonb_build_object('dropped', v_dropped, 'retention_months', v_retention_months));
  end if;

  select count(*) into v_orphans from public.audit_events_default;

  return jsonb_build_object(
    'created', v_created,
    'dropped', v_dropped,
    'default_partition_rows', v_orphans,
    'ran_at', now()
  );
end $$;

revoke execute on function public.audit_events_maintain() from anon, authenticated, public;
grant execute on function public.audit_events_maintain() to service_role;

-- create the first real partitions now
select public.audit_events_maintain();

-- daily 03:15 UTC (staggered from the other cron jobs)
select cron.schedule('audit-events-maintain', '15 3 * * *',
  $cron$ select public.audit_events_maintain(); $cron$);
