import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../test/fakeSupabase';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { recordLoginLocation, touchSessionLastSeen } = await import('../known-login');

beforeEach(() => {
  fakeAdmin.seed({ known_login_ips: [], sessions: [] });
});

describe('recordLoginLocation', () => {
  it('stays quiet on the first-ever login for an actor', async () => {
    const res = await recordLoginLocation({ type: 'staff', id: 's1' }, '203.0.113.1');
    expect(res.isNewLocation).toBe(false);
    expect(fakeAdmin.rows('known_login_ips')).toHaveLength(1);
  });

  it('flags a genuinely new IP once the actor already has a known one', async () => {
    fakeAdmin.seed({
      known_login_ips: [
        { id: 'k1', actor_type: 'staff', staff_id: 's1', customer_id: null, ip: '203.0.113.1', last_seen_at: new Date().toISOString() },
      ],
    });
    const res = await recordLoginLocation({ type: 'staff', id: 's1' }, '198.51.100.9');
    expect(res.isNewLocation).toBe(true);
    expect(fakeAdmin.rows('known_login_ips')).toHaveLength(2);
  });

  it('does not flag a returning IP, just bumps last_seen_at', async () => {
    const old = new Date(Date.now() - 5 * 86400_000).toISOString();
    fakeAdmin.seed({
      known_login_ips: [
        { id: 'k1', actor_type: 'staff', staff_id: 's1', customer_id: null, ip: '203.0.113.1', last_seen_at: old },
      ],
    });
    const res = await recordLoginLocation({ type: 'staff', id: 's1' }, '203.0.113.1');
    expect(res.isNewLocation).toBe(false);
    expect(fakeAdmin.rows('known_login_ips')[0].last_seen_at).not.toBe(old);
  });

  it('keeps staff and customer namespaces separate', async () => {
    await recordLoginLocation({ type: 'staff', id: 's1' }, '203.0.113.1');
    const res = await recordLoginLocation({ type: 'customer', id: 42 }, '203.0.113.1');
    expect(res.isNewLocation).toBe(false); // customer's first-ever
    expect(fakeAdmin.rows('known_login_ips')).toHaveLength(2);
  });

  it('ignores an unknown IP', async () => {
    const res = await recordLoginLocation({ type: 'staff', id: 's1' }, 'unknown');
    expect(res.isNewLocation).toBe(false);
    expect(fakeAdmin.rows('known_login_ips')).toHaveLength(0);
  });
});

describe('touchSessionLastSeen', () => {
  it('skips the write when last_seen_at is fresh (<1h)', async () => {
    fakeAdmin.seed({ sessions: [{ token: 't1', last_seen_at: new Date().toISOString() }] });
    const before = fakeAdmin.rows('sessions')[0].last_seen_at;
    await touchSessionLastSeen('t1', before);
    expect(fakeAdmin.rows('sessions')[0].last_seen_at).toBe(before);
  });

  it('writes when last_seen_at is stale or null', async () => {
    const stale = new Date(Date.now() - 2 * 3600_000).toISOString();
    fakeAdmin.seed({ sessions: [{ token: 't1', last_seen_at: stale }] });
    await touchSessionLastSeen('t1', stale);
    expect(fakeAdmin.rows('sessions')[0].last_seen_at).not.toBe(stale);
  });
});
