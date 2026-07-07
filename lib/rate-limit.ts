import 'server-only';
import { admin as supabaseAdmin } from './supabase/admin';

export async function checkRateLimit(key: string, windowSec = 60, max = 5) {
  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_key: key, p_window_sec: windowSec, p_max: max,
  });
  return error ? false : data === true; // fail-closed ถ้า error
}