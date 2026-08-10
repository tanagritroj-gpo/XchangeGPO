'use server';

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getStaffSession } from './auth-staff';
import { getManagerSession } from './manager-actions';
import { getErrorMessage } from '@/lib/error-message';
import { STATUS_OWNER_DEPARTMENT, SCOPE_TO_DEPARTMENT } from '@/lib/sla';
import type { SlaQueueRow, SlaRuleRow } from '@/lib/types';

type StaffSlaScope = 'csr' | 'log' | 'wh';

const READ_AT_COLUMN: Record<StaffSlaScope, string> = {
  csr: 'read_by_csr_at',
  log: 'read_by_log_at',
  wh: 'read_by_wh_at',
};
const READ_BY_COLUMN: Record<StaffSlaScope, string> = {
  csr: 'read_by_csr_by',
  log: 'read_by_log_by',
  wh: 'read_by_wh_by',
};

// สถานะที่แต่ละแผนกถือครอง (กลับด้านจาก STATUS_OWNER_DEPARTMENT ใน lib/sla.ts) — ใช้กรอง
// live queue ต่อแผนก
const DEPARTMENT_STATUSES: Record<'csr' | 'logistics' | 'warehouse', string[]> = {
  csr: [],
  logistics: [],
  warehouse: [],
};
for (const [status, dept] of Object.entries(STATUS_OWNER_DEPARTMENT)) {
  DEPARTMENT_STATUSES[dept].push(status);
}

async function getSessionForSlaScope(scope: StaffSlaScope) {
  const session = await getStaffSession();
  if (!session) throw new Error('ไม่ได้ Login');
  if (session.role !== 'manager' && session.department !== scope) {
    throw new Error('คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
  }
  return session;
}

const SLA_QUEUE_COLUMNS = 'id, ref_id, hospital_name, contact_name, current_status, status_due_at, status_warn_at';

/**
 * รายการใบงานที่ใกล้ครบ/เกินกำหนด SLA ณ ปัจจุบัน — query สดจาก requests โดยตรง (ไม่ใช่ประวัติ
 * จาก notification_log) เพราะ log เก็บได้แค่เหตุการณ์ที่เกิดไปแล้ว จะไม่เห็นใบงานที่ใกล้ครบแต่
 * ยังไม่ถูก cron แจ้งเตือน และจะเจอแถว "เกินกำหนดรายวัน" ซ้ำๆ ที่ไม่มีประโยชน์ต่อการแสดงผล —
 * ใช้ทั้งในแท็บ "SLA Monitoring" ของ NotificationBell (สำหรับ csr/log/wh) และ dashboard ของ
 * manager (department = 'all')
 */
async function getSlaQueue(department: 'csr' | 'logistics' | 'warehouse' | 'all') {
  let query = supabaseAdmin
    .from('requests')
    .select(SLA_QUEUE_COLUMNS)
    .not('status_due_at', 'is', null)
    .lte('status_warn_at', new Date().toISOString())
    .order('status_due_at', { ascending: true });

  if (department !== 'all') {
    query = query.in('current_status', DEPARTMENT_STATUSES[department]);
  }

  const { data, error } = await query;
  if (error) return { success: false as const, error: error.message };

  const now = Date.now();
  const rows: SlaQueueRow[] = (data ?? []).map((r) => ({
    ...r,
    isOverdue: new Date(r.status_due_at as string).getTime() <= now,
    department: STATUS_OWNER_DEPARTMENT[r.current_status as string],
  }));
  return { success: true as const, data: rows };
}

export async function getSlaQueueForCsr() {
  await getSessionForSlaScope('csr');
  return getSlaQueue('csr');
}
export async function getSlaQueueForLog() {
  await getSessionForSlaScope('log');
  return getSlaQueue('logistics');
}
export async function getSlaQueueForWh() {
  await getSessionForSlaScope('wh');
  return getSlaQueue('warehouse');
}
export async function getSlaQueueForManager() {
  await getManagerSession();
  return getSlaQueue('all');
}

// ═══ Badge ของกระดิ่งต่อ scope (csr/log/wh) — นับ/ดึง/mark อ่าน type=sla_warning|sla_breach
// กรองด้วย department เจ้าของงาน (ต่างจาก notification-actions.ts เดิมที่ csr/log/wh เห็น
// เหมือนกันหมด — SLA ต้องเห็นเฉพาะของแผนกตัวเองเท่านั้น) ═══

async function getUnreadSlaCount(scope: StaffSlaScope) {
  try {
    await getSessionForSlaScope(scope);

    const { count, error } = await supabaseAdmin
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .in('type', ['sla_warning', 'sla_breach'])
      .eq('department', SCOPE_TO_DEPARTMENT[scope])
      .is(READ_AT_COLUMN[scope], null);

    if (error) return { success: false, error: error.message };
    return { success: true, count: count ?? 0 };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

async function markSlaNotificationsAsRead(scope: StaffSlaScope) {
  try {
    const session = await getSessionForSlaScope(scope);

    const { error } = await supabaseAdmin
      .from('notification_log')
      .update({ [READ_AT_COLUMN[scope]]: new Date().toISOString(), [READ_BY_COLUMN[scope]]: session.id })
      .in('type', ['sla_warning', 'sla_breach'])
      .eq('department', SCOPE_TO_DEPARTMENT[scope])
      .is(READ_AT_COLUMN[scope], null);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

export async function getUnreadSlaCountForCsr() { return getUnreadSlaCount('csr'); }
export async function markSlaNotificationsAsReadForCsr() { return markSlaNotificationsAsRead('csr'); }

export async function getUnreadSlaCountForLog() { return getUnreadSlaCount('log'); }
export async function markSlaNotificationsAsReadForLog() { return markSlaNotificationsAsRead('log'); }

export async function getUnreadSlaCountForWh() { return getUnreadSlaCount('wh'); }
export async function markSlaNotificationsAsReadForWh() { return markSlaNotificationsAsRead('wh'); }

// ═══ Badge ของ manager บน Manager Hub tile — เฉพาะ sla_breach ที่ department IS NULL
// (sentinel เฉพาะ manager — ยิงครั้งเดียวตลอด ไม่ใช่ทุกวันแบบฝั่งแผนก) ═══

export async function getManagerSlaBadgeCount() {
  try {
    await getManagerSession();
    const { count, error } = await supabaseAdmin
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'sla_breach')
      .is('department', null)
      .is('read_by_manager_at', null);

    if (error) return { success: false, error: error.message };
    return { success: true, count: count ?? 0 };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

export async function markManagerSlaBadgeAsRead() {
  try {
    const session = await getManagerSession();
    const { error } = await supabaseAdmin
      .from('notification_log')
      .update({ read_by_manager_at: new Date().toISOString(), read_by_manager_by: session.id })
      .eq('type', 'sla_breach')
      .is('department', null)
      .is('read_by_manager_at', null);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

// ═══ sla_rules CRUD — manager เท่านั้น ═══

export async function getSlaRules() {
  try {
    await getManagerSession();
    const { data, error } = await supabaseAdmin
      .from('sla_rules')
      .select('status_name, sla_days, warning_days, updated_at')
      .order('status_name', { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as SlaRuleRow[] };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

export async function updateSlaRule(
  statusName: string,
  fields: { slaDays: number; warningDays: number }
) {
  try {
    const session = await getManagerSession();
    if (!Number.isInteger(fields.slaDays) || fields.slaDays <= 0) {
      return { success: false, error: 'จำนวนวัน SLA ต้องเป็นจำนวนเต็มมากกว่า 0' };
    }
    if (!Number.isInteger(fields.warningDays) || fields.warningDays < 0) {
      return { success: false, error: 'จำนวนวันเตือนล่วงหน้าต้องเป็นจำนวนเต็มไม่ติดลบ' };
    }

    const { error } = await supabaseAdmin
      .from('sla_rules')
      .update({
        sla_days: fields.slaDays,
        warning_days: fields.warningDays,
        updated_by: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq('status_name', statusName);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}
