'use server';

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getManagerOrCsrSession } from './manager-actions';
import { getSaleCoverage } from './sale-actions';
import { getErrorMessage } from '@/lib/error-message';

const NOTIFICATION_COLUMNS = 'id, type, request_id, ref_id, contact_name, hospital_name, created_at';

/**
 * Server actions สำหรับ "ศูนย์แจ้งเตือน" (NotificationBell) — อ่าน/mark อ่านจาก
 * notification_log ตารางรวม ครอบคลุมทุก type (ping, new_request, new_client, ...)
 *
 * ── CSR/Manager เห็นทุกแจ้งเตือน ไม่กรอง ──
 * getUnreadNotificationCount / getUnreadNotifications / markNotificationsAsRead —
 * สิทธิ์เช็คผ่าน getManagerOrCsrSession() เหมือนเดิม ไม่มี concept "อ่านแยกตามคน"
 * ใช้คอลัมน์ read_by_csr_at/read_by_csr_by
 *
 * ── Sale เห็นเฉพาะแจ้งเตือนของหน่วยงานในเขตที่ตัวเองดูแล ──
 * getUnreadNotificationCountForSale / getUnreadNotificationsForSale /
 * markNotificationsAsReadForSale — กรองด้วย org_type/province (denormalized ไว้ตอน
 * insert ทุก type แล้ว — ดูจุด insert ใน form-actions.ts, staff-form-actions.ts,
 * ping-actions.ts, auth.ts) เทียบกับขอบเขตของ sale คนนั้น (getSaleCoverage() ใน
 * sale-actions.ts — ตัวเดียวกับที่หน้า Sale Dashboard/History ใช้กรองข้อมูลอยู่แล้ว)
 * ใช้คอลัมน์ read_by_sale_at/read_by_sale_by แยกอิสระจากฝั่ง CSR โดยสิ้นเชิง — CSR
 * เปิดอ่านแล้วไม่กระทบ badge ฝั่ง Sale และกลับกัน (แต่ยังคง "ไม่มี concept อ่านแยกตาม
 * คน" ไว้เหมือนเดิม แค่แยกระดับ role แทนระดับ individual — sale ทุกคนที่ขอบเขตคาบเกี่ยว
 * กันยังเห็น/mark อ่านชุดเดียวกัน ไม่ใช่แยกรายคน)
 */

// ═══ CSR/Manager — ไม่กรอง เห็นทุกแจ้งเตือน ═══

export async function getUnreadNotificationCount() {
  try {
    await getManagerOrCsrSession();

    const { count, error } = await supabaseAdmin
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .is('read_by_csr_at', null);

    if (error) return { success: false, error: error.message };
    return { success: true, count: count ?? 0 };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

export async function getUnreadNotifications() {
  try {
    await getManagerOrCsrSession();

    const { data, error } = await supabaseAdmin
      .from('notification_log')
      .select(NOTIFICATION_COLUMNS)
      .is('read_by_csr_at', null)
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

export async function markNotificationsAsRead() {
  try {
    const session = await getManagerOrCsrSession();

    const { error } = await supabaseAdmin
      .from('notification_log')
      .update({ read_by_csr_at: new Date().toISOString(), read_by_csr_by: session.id })
      .is('read_by_csr_at', null);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: getErrorMessage(e) };
  }
}

// ═══ Sale — กรองเฉพาะหน่วยงานในเขตที่ตัวเองดูแล ═══

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

export async function getUnreadNotificationsForSale() {
  try {
    const coverage = await getSaleCoverage();
    if (!coverage) return { success: false, error: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้' };

    const { data, error } = await supabaseAdmin
      .from('notification_log')
      .select(NOTIFICATION_COLUMNS)
      .is('read_by_sale_at', null)
      .in('org_type', coverage.orgTypes)
      .in('province', coverage.provinces)
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
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
