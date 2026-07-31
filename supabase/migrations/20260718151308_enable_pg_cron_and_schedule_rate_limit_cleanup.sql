create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'cleanup-rate-limits-daily',
  '0 3 * * *', -- ทุกวัน เวลา 03:00 UTC (~10:00 น. เวลาไทย) ช่วง traffic ต่ำ
  $$ select public.cleanup_expired_rate_limits(); $$
);
