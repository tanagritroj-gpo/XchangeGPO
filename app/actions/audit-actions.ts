'use server';

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getManagerSession } from './manager-actions';
import { getErrorMessage } from '@/lib/error-message';
import { z } from 'zod';
import { parseOrError } from '@/lib/validate-input';

// หน้า "บันทึกการตรวจสอบระบบ" (ISO 27001 A.8.16 Monitoring) — Manager อ่านอย่างเดียว
// อ่าน audit_events แบบ keyset pagination (occurred_at, id) — ตารางเป็น append-only
// (ดู 14-audit-logging-design.md) client เห็นได้แต่ไม่มีทางแก้/ลบผ่าน action นี้

export interface AuditEventRow {
  id: number;
  occurred_at: string;
  category: string;
  action: string;
  outcome: string | null;
  actor_type: string | null;
  actor_staff_id: string | null;
  actor_customer_id: number | null;
  actor_label: string | null;
  target_type: string | null;
  target_id: string | null;
  ip: string | null;
  user_agent: string | null;
  detail: Record<string, unknown>;
}

const PAGE_SIZE = 50;

const FiltersSchema = z.object({
  category: z.enum(['auth', 'data_access', 'admin_action', 'system']).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  outcome: z.enum(['success', 'failure']).optional(),
  actorStaffId: z.string().uuid().optional(),
  targetType: z.string().trim().min(1).max(40).optional(),
  targetId: z.string().trim().min(1).max(200).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  // keyset cursor = the id of the last row of the previous page. `id` is a global
  // identity sequence assigned at insert time, so ordering by id desc is exactly
  // reverse-chronological — no compound (occurred_at, id) cursor needed.
  cursor: z.number().int().positive().nullable().optional(),
});

export type AuditFilters = z.infer<typeof FiltersSchema>;

export async function getAuditEvents(rawFilters: AuditFilters = {}): Promise<
  | { success: true; events: AuditEventRow[]; nextCursor: number | null }
  | { success: false; error: string }
> {
  const parsed = parseOrError(FiltersSchema, rawFilters);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const f = parsed.data;

  try {
    await getManagerSession();

    let q = supabaseAdmin
      .from('audit_events')
      .select(
        'id, occurred_at, category, action, outcome, actor_type, actor_staff_id, actor_customer_id, actor_label, target_type, target_id, ip, user_agent, detail',
      )
      .order('id', { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (f.category) q = q.eq('category', f.category);
    if (f.action) q = q.eq('action', f.action);
    if (f.outcome) q = q.eq('outcome', f.outcome);
    if (f.actorStaffId) q = q.eq('actor_staff_id', f.actorStaffId);
    if (f.targetType) q = q.eq('target_type', f.targetType);
    if (f.targetId) q = q.eq('target_id', f.targetId);
    if (f.from) q = q.gte('occurred_at', f.from);
    if (f.to) q = q.lte('occurred_at', f.to);
    if (f.cursor) q = q.lt('id', f.cursor);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    const rows = (data ?? []) as AuditEventRow[];
    const hasMore = rows.length > PAGE_SIZE;
    const events = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const last = events[events.length - 1];
    const nextCursor = hasMore && last ? last.id : null;

    return { success: true, events, nextCursor };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

// ตัวเลือกค่าที่ปรากฏจริงในตาราง — เติมใน dropdown filter (ไม่ hardcode)
export async function getAuditFilterOptions(): Promise<
  { success: true; actions: string[] } | { success: false; error: string }
> {
  try {
    await getManagerSession();
    const { data, error } = await supabaseAdmin
      .from('audit_events')
      .select('action')
      .order('action', { ascending: true })
      .limit(2000);
    if (error) return { success: false, error: error.message };
    const actions = [...new Set((data ?? []).map((r) => r.action as string))].sort();
    return { success: true, actions };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}
