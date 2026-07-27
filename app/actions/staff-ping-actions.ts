'use server';

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getManagerOrCsrSession } from './manager-actions';

/**
 * Server actions ฝั่งทีมงาน (Manager/CSR) สำหรับ "กระดิ่งเร่งงาน" ที่ลูกค้า
 * กดจากหน้า tracking — ใช้ประกอบกับ StaffChatWidget:
 * - getUnreadPingCount()  → badge ตัวเลขบนปุ่มลอย (poll ทุก 30-60 วิ)
 * - getUnreadPings()      → รายละเอียดที่บอททักก่อนตอนเปิดหน้าต่างแชท
 * - markPingsAsRead()     → เรียกตอนเปิดแชท mark ทุก ping ที่ค้างเป็นอ่านแล้ว
 *
 * สิทธิ์เช็คผ่าน getManagerOrCsrSession() ตัวเดียวกับที่ getManagerStatusLogs
 * ใช้ (manager หรือ csr เข้าถึงได้เท่ากัน) — ไม่มี concept "อ่านแยกตามคน"
 * ทุกคนในสองแผนกนี้เห็น/mark อ่านชุดเดียวกันหมด (ตามที่ตัดสินใจไว้ว่า
 * Manager/CSR เห็นข้อมูลเท่ากัน)
 */

export async function getUnreadPingCount() {
  try {
    await getManagerOrCsrSession();

    const { count, error } = await supabaseAdmin
      .from('request_pings')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null);

    if (error) return { success: false, error: error.message };
    return { success: true, count: count ?? 0 };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getUnreadPings() {
  try {
    await getManagerOrCsrSession();

    const { data, error } = await supabaseAdmin
      .from('request_pings')
      .select('id, request_id, ref_id, created_at')
      .is('read_at', null)
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function markPingsAsRead() {
  try {
    const session = await getManagerOrCsrSession();

    const { error } = await supabaseAdmin
      .from('request_pings')
      .update({ read_at: new Date().toISOString(), read_by: session.id })
      .is('read_at', null);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}