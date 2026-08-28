-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE to anon/authenticated on every
-- new function in public. Revoking from PUBLIC (done in add_staff_mfa) does not touch
-- those direct grants, so revoke them by name too. Matches increment_rate_limit et al.
revoke execute on function public.set_staff_mfa_secret(uuid, text, text) from anon, authenticated;
revoke execute on function public.get_staff_mfa_secret(uuid, text) from anon, authenticated;
