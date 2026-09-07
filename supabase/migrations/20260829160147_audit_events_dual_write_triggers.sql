-- Phase B2 of 14-audit-logging-design.md — dual-write the immutable domain-log
-- tables into audit_events via AFTER INSERT triggers, so admin_action events are
-- captured centrally without touching ~25 insert call sites in the app.
-- occurred_at is left to default (now()) so rows always route to a live partition.

-- 1. request status changes -------------------------------------------------
create or replace function public.audit_status_log_insert()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.audit_events(
    category, action, actor_type, actor_staff_id, actor_label, target_type, target_id, detail
  ) values (
    'admin_action', 'admin.request.status_changed',
    coalesce(new.actor_type, 'staff'),
    new.staff_id,
    (select username from public.staff_users where id = new.staff_id),
    'request', new.request_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'status_name', new.status_name,
      'department', new.department,
      'drug_item_id', new.drug_item_id,
      'rejection_reason_code', new.rejection_reason_code
    ))
  );
  return new;
end $$;

create trigger trg_audit_status_logs
  after insert on public.status_logs
  for each row execute function public.audit_status_log_insert();

-- 2. retroactive data corrections ------------------------------------------
create or replace function public.audit_data_correction_insert()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.audit_events(
    category, action, actor_type, actor_staff_id, actor_label, target_type, target_id, detail
  ) values (
    'admin_action', 'admin.data.corrected', 'staff',
    new.staff_id,
    (select username from public.staff_users where id = new.staff_id),
    'request', new.request_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'field_name', new.field_name,
      'reason', new.reason,
      'drug_item_id', new.drug_item_id,
      'status_log_id', new.status_log_id
    ))
  );
  return new;
end $$;

create trigger trg_audit_data_correction_logs
  after insert on public.data_correction_logs
  for each row execute function public.audit_data_correction_insert();

-- 3. customer access grant / renew / cancel / reactivate ------------------
create or replace function public.audit_customer_access_insert()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.audit_events(
    category, action, actor_type, actor_staff_id, actor_label, target_type, target_id, detail
  ) values (
    'admin_action', 'admin.customer.access.' || new.action, 'staff',
    new.staff_id,
    (select username from public.staff_users where id = new.staff_id),
    'customer', new.b2b_customer_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'previous_expires_at', new.previous_expires_at,
      'new_expires_at', new.new_expires_at
    ))
  );
  return new;
end $$;

create trigger trg_audit_customer_access_log
  after insert on public.customer_access_log
  for each row execute function public.audit_customer_access_insert();

revoke execute on function public.audit_status_log_insert(), public.audit_data_correction_insert(), public.audit_customer_access_insert() from anon, authenticated, public;
