import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Append-only audit trail writer (Phase A of 14-audit-logging-design.md, Go-Live Gate G0-3).
 *
 * Rules:
 *  - Fire-and-forget. `logAuditEvent` never throws and should generally be called
 *    without `await` on the happy path — an audit write must not be able to break
 *    a user action. A failed insert goes to Sentry (compliance-relevant) but is swallowed.
 *  - The `audit_events` table is physically immutable (REVOKE + trigger + partition-drop
 *    retention). This module only ever INSERTs.
 *  - Do NOT put a data subject's name / phone / email into `detail` — reference them by
 *    `target` id instead. `actor_label` is the one allowed identity snapshot (needed for
 *    non-repudiation and to survive account deletion).
 */

export type AuditCategory = 'auth' | 'data_access' | 'admin_action' | 'system';

export type AuditActor =
  | { type: 'staff'; id: string; label?: string | null }
  | { type: 'customer'; id: number; label?: string | null }
  | { type: 'system' }
  | { type: 'anon' };

export interface AuditEventInput {
  category: AuditCategory;
  action: string; // dotted name, e.g. 'auth.login.success'
  outcome?: 'success' | 'failure';
  actor?: AuditActor;
  target?: { type: string; id: string | number };
  ip?: string | null;
  userAgent?: string | null;
  detail?: Record<string, unknown>;
}

export async function logAuditEvent(e: AuditEventInput): Promise<void> {
  try {
    const actor = e.actor;
    const { error } = await supabaseAdmin.from('audit_events').insert({
      category: e.category,
      action: e.action,
      outcome: e.outcome ?? null,
      actor_type: actor?.type ?? null,
      actor_staff_id: actor?.type === 'staff' ? actor.id : null,
      actor_customer_id: actor?.type === 'customer' ? actor.id : null,
      actor_label:
        actor && (actor.type === 'staff' || actor.type === 'customer') ? actor.label ?? null : null,
      target_type: e.target?.type ?? null,
      target_id: e.target != null ? String(e.target.id) : null,
      ip: e.ip ?? null,
      user_agent: e.userAgent ?? null,
      detail: e.detail ?? {},
    });
    if (error) throw error;
  } catch (err) {
    // Audit failing is a compliance problem worth an alert — but never surface it
    // to the caller or block the action being audited.
    Sentry.captureException(err, {
      level: 'error',
      tags: { area: 'audit-log' },
      extra: { action: e.action },
    });
  }
}
