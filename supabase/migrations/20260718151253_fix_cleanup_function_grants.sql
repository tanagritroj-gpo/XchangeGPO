revoke execute on function public.cleanup_expired_rate_limits() from anon, authenticated, public;
grant execute on function public.cleanup_expired_rate_limits() to service_role;
