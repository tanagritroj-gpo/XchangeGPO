-- Phase A of 14-audit-logging-design.md — make the 8 immutable domain-log tables append-only.
-- Verified 29 ส.ค. 2569: zero UPDATE/DELETE/TRUNCATE on any of these in app code,
-- in any Postgres function (regexp scan of pg_proc), or via triggers
-- (status_logs' sync_timeline writes only to timeline_summary, never back to status_logs).
-- INSERT + SELECT keep working, which is all the app ever does with them.
-- Rollback: grant update, delete on <table> to service_role; drop trigger trg_<table>_immutable.

do $$
declare
  t text;
begin
  foreach t in array array[
    'access_logs',
    'status_logs',
    'data_correction_logs',
    'customer_access_log',
    'staff_account_change_logs',
    'customer_account_change_logs',
    'staff_password_reset_logs',
    'customer_password_reset_logs'
  ]
  loop
    execute format(
      'revoke update, delete, truncate on public.%I from service_role, authenticated, anon, public', t);
    execute format(
      'create trigger trg_%s_immutable before update or delete on public.%I '
      'for each row execute function public.reject_mutation()', t, t);
  end loop;
end $$;
