-- Follow-up to add_audit_events: RLS is not inherited by partitions, and PostgREST
-- exposes each partition table directly — so enable RLS + revoke anon/authenticated
-- on every partition, and teach audit_events_maintain() to do the same going forward.
-- Also pin reject_mutation()'s search_path (advisor 0011).

alter function public.reject_mutation() set search_path = '';

-- existing partitions
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_inherits i on i.inhrelid = c.oid
    where i.inhparent = 'public.audit_events'::regclass
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    execute format('revoke all on public.%I from anon, authenticated', r.relname);
  end loop;
end $$;

-- future partitions: fold the lock-down into the maintenance routine
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
      execute format('alter table public.%I enable row level security', v_part);
      execute format('revoke all on public.%I from anon, authenticated', v_part);
      execute format('revoke update, delete, truncate on public.%I from service_role, public', v_part);
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
