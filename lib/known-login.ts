import 'server-only';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';

const LAST_SEEN_THROTTLE_MS = 60 * 60 * 1000; // update at most hourly per session

/**
 * Bump sessions.last_seen_at, but no more than once an hour per session, so the
 * device-list "last active" stays fresh without a write on every page load.
 * Fire-and-forget: never let it break a session lookup.
 */
export async function touchSessionLastSeen(token: string, lastSeenAt: string | null): Promise<void> {
  if (lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < LAST_SEEN_THROTTLE_MS) return;
  try {
    await supabaseAdmin
      .from('sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('token', token);
  } catch {
    /* best-effort */
  }
}

/**
 * Records the (actor, IP) of a successful login. Returns whether this is a
 * brand-new location for an actor who has logged in from somewhere before —
 * the trigger for a "new sign-in location" security-alert email.
 * (Phase 3 of 13-mfa-remember-me-design.md §3.4)
 */
export async function recordLoginLocation(
  actor: { type: 'staff'; id: string } | { type: 'customer'; id: number },
  ip: string,
): Promise<{ isNewLocation: boolean }> {
  if (!ip || ip === 'unknown') return { isNewLocation: false };

  const col = actor.type === 'staff' ? 'staff_id' : 'customer_id';

  const { data: existing } = await supabaseAdmin
    .from('known_login_ips')
    .select('id')
    .eq('actor_type', actor.type)
    .eq(col, actor.id)
    .eq('ip', ip)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('known_login_ips')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', existing.id);
    return { isNewLocation: false };
  }

  // How many locations does this actor already know? (0 => first-ever login, stay quiet)
  const { count } = await supabaseAdmin
    .from('known_login_ips')
    .select('id', { count: 'exact', head: true })
    .eq('actor_type', actor.type)
    .eq(col, actor.id);

  const { error } = await supabaseAdmin.from('known_login_ips').insert({
    actor_type: actor.type,
    staff_id: actor.type === 'staff' ? actor.id : null,
    customer_id: actor.type === 'customer' ? actor.id : null,
    ip,
  });
  // A unique-violation just means a concurrent login beat us to it — not new.
  if (error) return { isNewLocation: false };

  return { isNewLocation: (count ?? 0) > 0 };
}
