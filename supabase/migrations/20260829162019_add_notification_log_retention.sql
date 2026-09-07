-- Phase C of 14-audit-logging-design.md — notification_log is a work queue + read
-- receipts (NOT an audit log), and it accumulates customer/hospital names forever.
-- PDPA ม.37(3): keep only as long as needed. Requests complete in days/weeks; 12
-- months is a very generous ceiling for "still actionable". Purge older rows nightly.
--
-- Safe to delete:
--   - getRecentList only shows the newest N; getUnreadCount / markAsRead operate on
--     unread rows regardless of age, but a 12-month-old unread notification is stale
--     and nobody will action it.
--   - The SLA dedup check in check_sla_notifications only guards against re-alerting
--     an OPEN request; a request unresolved after 12 months getting a fresh alert is
--     acceptable (arguably desirable).

create or replace function public.cleanup_old_notifications()
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from notification_log
  where created_at < now() - interval '12 months';
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('notifications_deleted', v_deleted, 'ran_at', now());
end $$;

revoke execute on function public.cleanup_old_notifications() from anon, authenticated, public;
grant  execute on function public.cleanup_old_notifications() to service_role;

-- 03:45 UTC — after audit-events-maintain (03:15) and auth-artifacts (03:30)
select cron.schedule('cleanup-old-notifications', '45 3 * * *',
  $cron$ select public.cleanup_old_notifications(); $cron$);
