import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createFakeAdmin } from '../../test/fakeSupabase';

vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeAdmin } = await import('../../test/fakeSupabase');
  return { admin: undefined, __fake: createFakeAdmin() };
});
const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureException(...a) }));

const adminModule: any = await import('@/lib/supabase/admin');
const fakeAdmin: ReturnType<typeof createFakeAdmin> = adminModule.__fake;
adminModule.admin = fakeAdmin.client;

const { logAuditEvent } = await import('../audit');

beforeEach(() => {
  fakeAdmin.seed({ audit_events: [] });
  captureException.mockClear();
});

describe('logAuditEvent', () => {
  it('maps a staff auth event onto the audit_events row shape', async () => {
    await logAuditEvent({
      category: 'auth',
      action: 'auth.login.success',
      outcome: 'success',
      actor: { type: 'staff', id: 's-1', label: 'somchai' },
      ip: '203.0.113.5',
      userAgent: 'Chrome',
      detail: { method: 'password' },
    });
    const row = fakeAdmin.rows('audit_events')[0];
    expect(row).toMatchObject({
      category: 'auth',
      action: 'auth.login.success',
      outcome: 'success',
      actor_type: 'staff',
      actor_staff_id: 's-1',
      actor_customer_id: null,
      actor_label: 'somchai',
      ip: '203.0.113.5',
      user_agent: 'Chrome',
      detail: { method: 'password' },
    });
  });

  it('routes a customer actor id to actor_customer_id', async () => {
    await logAuditEvent({
      category: 'data_access',
      action: 'data.export.generated',
      actor: { type: 'customer', id: 42 },
      target: { type: 'export', id: 'portfolio' },
    });
    const row = fakeAdmin.rows('audit_events')[0];
    expect(row.actor_customer_id).toBe(42);
    expect(row.actor_staff_id).toBeNull();
    expect(row.actor_label).toBeNull();
    expect(row.target_type).toBe('export');
    expect(row.target_id).toBe('portfolio');
  });

  it('handles a system actor and defaults detail to {}', async () => {
    await logAuditEvent({ category: 'system', action: 'system.retention.purged', actor: { type: 'system' } });
    const row = fakeAdmin.rows('audit_events')[0];
    expect(row.actor_type).toBe('system');
    expect(row.detail).toEqual({});
    expect(row.outcome).toBeNull();
  });

  it('leaves actor_type null when no actor is given', async () => {
    await logAuditEvent({ category: 'system', action: 'system.boot' });
    expect(fakeAdmin.rows('audit_events')[0].actor_type).toBeNull();
  });

  it('stringifies a numeric target id', async () => {
    await logAuditEvent({
      category: 'data_access',
      action: 'data.request.detail_viewed',
      actor: { type: 'staff', id: 's-1' },
      target: { type: 'request', id: 1234 },
    });
    expect(fakeAdmin.rows('audit_events')[0].target_id).toBe('1234');
  });

  it('swallows a DB error and reports it to Sentry (never throws)', async () => {
    const orig = fakeAdmin.client.from;
    (fakeAdmin.client as any).from = () => ({
      insert: async () => ({ data: null, error: { message: 'audit_events is append-only' } }),
    });
    try {
      await expect(
        logAuditEvent({ category: 'auth', action: 'auth.logout', actor: { type: 'staff', id: 's-1' } }),
      ).resolves.toBeUndefined();
      expect(captureException).toHaveBeenCalledOnce();
    } finally {
      (fakeAdmin.client as any).from = orig;
    }
  });
});
