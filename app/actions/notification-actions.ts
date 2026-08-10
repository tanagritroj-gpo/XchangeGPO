'use server';

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getStaffSession } from './auth-staff';
import { getManagerSession, getManagerOrCsrSession } from './manager-actions';
import { getSaleCoverage } from './sale-actions';
import { getErrorMessage } from '@/lib/error-message';
import type { NotificationLogRow } from '@/lib/types';

const NOTIFICATION_COLUMNS = 'id, type, request_id, ref_id, contact_name, hospital_name, created_at, department';

// type ที่ยิงมาจาก check_sla_notifications() (cron) — มีฟีดของตัวเองแยกต่างหากในแท็บ
// "SLA Monitoring" ของ NotificationBell (ดู app/actions/sla-actions.ts) ฟังก์ชันด้านล่างที่
// ดูแลฟีด "การแจ้งเตือน" เดิม (ping/new_request/new_client) ต้องกันประเภทนี้ออกเสมอ ไม่งั้น
// จะไปปนกับโควตา 10 รายการล่าสุด และ mark อ่านข้าม scope กันเอง
const SLA_NOTIFICATION_TYPES = '(sla_warning,sla_breach)';

// เลือกคอลัมน์ read_by_*_at ทุกตัวแบบ static เสมอ (ไม่ประกอบ column name แบบ dynamic ใน
// .select()) เพราะ supabase-js parse select string เป็น type ตอน compile — string ที่ไม่ใช่
// literal ตรงๆ (เช่น READ_AT_COLUMN[scope]) จะกลาย เป็น ParserError แทน จากนั้นค่อยหยิบ
// คอลัมน์ที่ตรงกับ scope ออกมาเองฝั่ง JS ใน toDisplayRow (index เข้า object ธรรมดา ไม่ผ่าน
// type parser ของ supabase แล้ว จึงไม่มีปัญหาเดียวกัน)
const ALL_READ_AT_COLUMNS = 'read_by_csr_at, read_by_manager_at, read_by_log_at, read_by_wh_at, read_by_sale_at';

// จำนวนรายการล่าสุดที่แสดงใน drawer — ไม่ผูกกับสถานะอ่านแล้ว/ยังไม่อ่าน (ดูด้านล่าง)
const RECENT_LIMIT = 10;

function toDisplayRow(row: Record<string, unknown>, readAtColumn: string): NotificationLogRow {
  const { [readAtColumn]: readAt, ...rest } = row;
  return { ...(rest as Omit<NotificationLogRow, 'isUnread'>), isUnread: readAt == null };
}

/**
 * Server actions สำหรับ "ศูนย์แจ้งเตือน" (NotificationBell) — อ่านจาก notification_log
 * ตารางรวม ครอบคลุมทุก type (ping, new_request, new_client, ...)
 *
 * ── รายการที่แสดง: 10 รายการล่าสุดเสมอ ไม่ใช่แค่ที่ยังไม่อ่าน ──
 * ดึง 10 รายการล่าสุดตาม created_at เสมอ ไม่กรองด้วยสถานะอ่าน แต่ละแถวแนบ isUnread
 * (คำนวณตอน fetch จากคอลัมน์ read_by_<scope>_at ของ scope นั้นๆ) ให้ฝั่ง UI ไฮไลต์รายการ
 * ที่ยังไม่อ่านแยกจากที่อ่านแล้วได้ — badge ตัวเลขนับจาก "ยังไม่อ่านจริง" ทั้งหมดเสมอ
 * (ไม่ใช่แค่ 10 รายการที่โชว์) ผ่าน getUnreadNotificationCount* ของแต่ละ scope
 *
 * ── csr/manager/log/wh: เห็นทุกแจ้งเตือนเหมือนกันหมด ไม่กรอง ──
 * ต่างกันแค่คอลัมน์ read state ของตัวเอง (read_by_<scope>_at/by) — แผนกหนึ่งเปิดอ่านไม่
 * กระทบ badge ของอีกแผนกเลย (ไม่มี concept "อ่านแยกตามคน" แค่แยกระดับ role/แผนกแทน)
 * สิทธิ์เช็คตาม session.department ตรงกับ layout ของแต่ละโซนเป๊ะ (log/wh ยอมรับ role
 * manager เป็นข้อยกเว้นด้วย เหมือนที่ app/admin/logistics/layout.tsx และ app/admin/wh/
 * layout.tsx ทำ — ส่วน manager เองใช้ getManagerSession() role='manager' ล้วนๆ)
 * รวมกันเป็น getUnreadCount/getRecentList/markAsRead ภายในไฟล์นี้ ตัวเดียว พารามิเตอร์
 * เป็น scope แทนการเขียนซ้ำ 4 รอบ — ฟังก์ชันที่ export ออกไปยังคงชื่อเดิมแยกตาม scope
 * (NotificationBell.tsx import ตรงชื่อ)
 *
 * ── sale: เห็นเฉพาะแจ้งเตือนของหน่วยงานในเขตที่ตัวเองดูแล ──
 * กรองด้วย org_type/province (denormalized ไว้ตอน insert ทุก type แล้ว — ดูจุด insert
 * ใน form-actions.ts, staff-form-actions.ts, ping-actions.ts, auth.ts) เทียบกับขอบเขต
 * ของ sale คนนั้น (getSaleCoverage() ใน sale-actions.ts — ตัวเดียวกับที่หน้า Sale
 * Dashboard/History ใช้กรองข้อมูลอยู่แล้ว) แยกเป็นฟังก์ชันของตัวเองเพราะ logic การกรอง
 * ต่างจากกลุ่มข้างบนจริงๆ (ไม่ใช่แค่คอลัมน์ read state ต่างกัน)
 */

// ═══ csr/manager/log/wh — ไม่กรอง เห็นทุกแจ้งเตือนเหมือนกันหมด ═══

type UnfilteredScope = 'csr' | 'manager' | 'log' | 'wh';

const READ_AT_COLUMN: Record<UnfilteredScope, string> = {
  csr: 'read_by_csr_at',
  manager: 'read_by_manager_at',
  log: 'read_by_log_at',
  wh: 'read_by_wh_at',
};
const READ_BY_COLUMN: Record<UnfilteredScope, string> = {
  csr: 'read_by_csr_by',
  manager: 'read_by_manager_by',
  log: 'read_by_log_by',
  wh: 'read_by_wh_by',
};

async function getSessionForScope(scope: UnfilteredScope) {
  if (scope === 'csr') return getManagerOrCsrSession();
  if (scope === 'manager') return getManagerSession();

  // log/wh — ตรงกับ layout ของแต่ละโซน: department ตรง หรือ role เป็น manager
  const session = await getStaffSession();
  if (!session) throw new Error('ไม่ได้ Login');
  if (session.role !== 'manager' && session.department !== scope) {
    throw new Error('คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
  }
  return session;
}

async function getUnreadCount(scope: UnfilteredScope) {
  try {
    await getSessionForScope(scope);

    const { count, error } = await supabaseAdmin
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .not('type', 'in', SLA_NOTIFICATION_TYPES)
      .is(READ_AT_COLUMN[scope], null);

    if (error) return { success: false, error: error.message };
    return { success: true, count: count ?? 0 };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

async function getRecentList(scope: UnfilteredScope) {
  try {
    await getSessionForScope(scope);

    const { data, error } = await supabaseAdmin
      .from('notification_log')
      .select(`${NOTIFICATION_COLUMNS}, ${ALL_READ_AT_COLUMNS}`)
      .not('type', 'in', SLA_NOTIFICATION_TYPES)
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT);

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map((row) => toDisplayRow(row, READ_AT_COLUMN[scope])) };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

async function markAsRead(scope: UnfilteredScope) {
  try {
    const session = await getSessionForScope(scope);

    const { error } = await supabaseAdmin
      .from('notification_log')
      .update({ [READ_AT_COLUMN[scope]]: new Date().toISOString(), [READ_BY_COLUMN[scope]]: session.id })
      .not('type', 'in', SLA_NOTIFICATION_TYPES)
      .is(READ_AT_COLUMN[scope], null);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

export async function getUnreadNotificationCount() {
  return getUnreadCount('csr');
}
export async function getRecentNotifications() {
  return getRecentList('csr');
}
export async function markNotificationsAsRead() {
  return markAsRead('csr');
}

export async function getUnreadNotificationCountForManager() {
  return getUnreadCount('manager');
}
export async function getRecentNotificationsForManager() {
  return getRecentList('manager');
}
export async function markNotificationsAsReadForManager() {
  return markAsRead('manager');
}

export async function getUnreadNotificationCountForLog() {
  return getUnreadCount('log');
}
export async function getRecentNotificationsForLog() {
  return getRecentList('log');
}
export async function markNotificationsAsReadForLog() {
  return markAsRead('log');
}

export async function getUnreadNotificationCountForWh() {
  return getUnreadCount('wh');
}
export async function getRecentNotificationsForWh() {
  return getRecentList('wh');
}
export async function markNotificationsAsReadForWh() {
  return markAsRead('wh');
}

// ═══ sale — กรองเฉพาะหน่วยงานในเขตที่ตัวเองดูแล ═══

export async function getUnreadNotificationCountForSale() {
  try {
    const coverage = await getSaleCoverage();
    if (!coverage) return { success: false, error: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' };

    const { count, error } = await supabaseAdmin
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .is('read_by_sale_at', null)
      .in('org_type', coverage.orgTypes)
      .in('province', coverage.provinces);

    if (error) return { success: false, error: error.message };
    return { success: true, count: count ?? 0 };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

export async function getRecentNotificationsForSale() {
  try {
    const coverage = await getSaleCoverage();
    if (!coverage) return { success: false, error: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' };

    const { data, error } = await supabaseAdmin
      .from('notification_log')
      .select(`${NOTIFICATION_COLUMNS}, read_by_sale_at`)
      .in('org_type', coverage.orgTypes)
      .in('province', coverage.provinces)
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT);

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map((row) => toDisplayRow(row, 'read_by_sale_at')) };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

export async function markNotificationsAsReadForSale() {
  try {
    const coverage = await getSaleCoverage();
    if (!coverage) return { success: false, error: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' };

    // ★ update ต้องกรองด้วยขอบเขตเดียวกับตอนอ่านเป๊ะ — ไม่งั้นจะไป mark แจ้งเตือนของ
    // หน่วยงานนอกเขตที่ sale คนอื่นดูแลอยู่ (ที่ sale คนนี้ไม่เคยเห็น) ว่าอ่านแล้วด้วย
    const { error } = await supabaseAdmin
      .from('notification_log')
      .update({ read_by_sale_at: new Date().toISOString(), read_by_sale_by: coverage.staffId })
      .is('read_by_sale_at', null)
      .in('org_type', coverage.orgTypes)
      .in('province', coverage.provinces);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}
