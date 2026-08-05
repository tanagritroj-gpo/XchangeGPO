'use server';

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getCustomerSession } from './auth-actions';
import { getErrorMessage } from '@/lib/error-message';

// คำร้องที่ถือว่า "จบงานแล้ว" — กระดิ่งใช้ไม่ได้กับคำร้องกลุ่มนี้ เพราะเร่งงาน
// ที่จบแล้วไม่มีความหมาย (ตรงกับ current_status check constraint จริงของ
// ตาราง requests ที่เช็คไว้ผ่าน Supabase MCP แล้ว)
const FINISHED_STATUSES = ['completed', 'rejected'];

// cooldown ต่อคำร้อง — กันลูกค้ากดรัวๆ จนทีมงานโดนแจ้งเตือนถล่ม
const PING_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 ชั่วโมง

/** หา ping ล่าสุดของคำร้องนี้ (ถ้ามี) — ใช้ร่วมกันทั้ง pingRequestAttention
 *  (เช็คก่อน insert) และ getPingStatus (โชว์สถานะตอนโหลดหน้า) ให้ตรงกันเป๊ะ
 *  ไม่มีทางเพี้ยนกันเพราะอ่านจากจุดเดียวกัน */
async function getLastPing(requestId: number) {
  const { data } = await supabaseAdmin
    .from('request_pings')
    .select('created_at')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

function msRemaining(lastPingCreatedAt: string) {
  const elapsed = Date.now() - new Date(lastPingCreatedAt).getTime();
  return Math.max(0, PING_COOLDOWN_MS - elapsed);
}

/**
 * ลูกค้ากดกระดิ่งเร่งงาน — แจ้งเตือนไปยัง Manager/CSR ผ่าน StaffChatWidget
 *
 * ── ลำดับการเช็ค (ห้ามสลับ) ──
 * 1. session ลูกค้าต้องมีจริง
 * 2. คำร้องต้องมีอยู่จริง และเป็นของลูกค้าคนนี้เท่านั้น (กัน ping คำร้องคนอื่น)
 * 3. คำร้องต้องยังไม่จบงาน
 * 4. ต้องพ้น cooldown 6 ชม. จาก ping ล่าสุดของคำร้องนี้แล้ว
 */
export async function pingRequestAttention(requestId: number) {
  try {
    const customer = await getCustomerSession();
    if (!customer) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };

    if (!requestId || !Number.isFinite(requestId)) {
      return { success: false, error: 'รหัสคำร้องไม่ถูกต้อง' };
    }

    // join b2b_customers(customer_code) — เช็คสิทธิ์ระดับหน่วยงาน ไม่ใช่ exact b2b_customer_id
    // (เหตุผลเดียวกับ trackMyRequestByRefId ใน tracking-actions.ts — 1 หน่วยงานมี login ได้
    // หลายบัญชี ต้องให้บัญชีไหนของหน่วยงานเดียวกันก็เร่งงานได้ ไม่ใช่แค่บัญชีที่ยื่นคำร้องเป๊ะๆ)
    const { data: request, error: reqErr } = await supabaseAdmin
      .from('requests')
      .select('id, ref_id, b2b_customer_id, current_status, b2b_customers(customer_code)')
      .eq('id', requestId)
      .maybeSingle();

    if (reqErr || !request) {
      return { success: false, error: 'ไม่พบคำร้องนี้' };
    }
    const owner = Array.isArray(request.b2b_customers) ? request.b2b_customers[0] : request.b2b_customers;
    const sameOrg = !!customer.customer_code && !!owner?.customer_code && owner.customer_code === customer.customer_code;
    if (!sameOrg) {
      // ข้อความเดียวกับกรณี "ไม่พบ" โดยตั้งใจ — กันบอกใบ้ว่า request_id นี้
      // มีอยู่จริงแค่ไม่ใช่ของลูกค้าคนนี้ (แนวทางเดียวกับที่ auth-actions.ts
      // ใช้กัน enumeration ตอน sendOTP)
      return { success: false, error: 'ไม่พบคำร้องนี้' };
    }
    if (FINISHED_STATUSES.includes(request.current_status)) {
      return { success: false, error: 'คำร้องนี้เสร็จสิ้นแล้ว ไม่สามารถแจ้งเตือนได้' };
    }

    const lastPing = await getLastPing(requestId);
    if (lastPing) {
      const remaining = msRemaining(lastPing.created_at);
      if (remaining > 0) {
        const remainingHours = Math.ceil(remaining / (60 * 60 * 1000));
        return {
          success: false,
          error: `แจ้งเตือนไปแล้ว รอเจ้าหน้าที่ตรวจสอบ (แจ้งซ้ำได้ในอีกประมาณ ${remainingHours} ชม.)`,
        };
      }
    }

    const { error: insertErr } = await supabaseAdmin.from('request_pings').insert({
      request_id: request.id,
      ref_id: request.ref_id,
      customer_id: customer.id,
    });

    if (insertErr) {
      console.error('pingRequestAttention insert error:', insertErr.message);
      return { success: false, error: 'บันทึกแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่' };
    }

    return { success: true };
  } catch (e: unknown) {
    console.error('pingRequestAttention error:', getErrorMessage(e));
    return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };
  }
}

/**
 * เช็คสถานะกระดิ่งตอนโหลดหน้า tracking — ถ้ายังติด cooldown อยู่ กระดิ่ง
 * ต้องขึ้นเป็น "แจ้งแล้ว" ตั้งแต่โหลดหน้า ไม่ต้องรอให้ลูกค้ากดถึงจะรู้
 */
export async function getPingStatus(requestId: number) {
  try {
    const customer = await getCustomerSession();
    if (!customer) return { success: false, error: 'กรุณาเข้าสู่ระบบ' };

    if (!requestId || !Number.isFinite(requestId)) {
      return { success: false, error: 'รหัสคำร้องไม่ถูกต้อง' };
    }

    // เช็คความเป็นเจ้าของเหมือนกับ pingRequestAttention (ระดับหน่วยงานผ่าน customer_code
    // ไม่ใช่ exact b2b_customer_id) — กันลูกค้าคนอื่นเดา requestId แล้วรู้ cooldown ของคำร้องคนอื่นได้
    const { data: request } = await supabaseAdmin
      .from('requests')
      .select('id, b2b_customer_id, current_status, b2b_customers(customer_code)')
      .eq('id', requestId)
      .maybeSingle();

    const owner = Array.isArray(request?.b2b_customers) ? request.b2b_customers[0] : request?.b2b_customers;
    const sameOrg = !!customer.customer_code && !!owner?.customer_code && owner.customer_code === customer.customer_code;
    if (!request || !sameOrg) {
      return { success: false, error: 'ไม่พบคำร้องนี้' };
    }

    const isFinished = FINISHED_STATUSES.includes(request.current_status);
    const lastPing = await getLastPing(requestId);
    const remaining = lastPing ? msRemaining(lastPing.created_at) : 0;

    return {
      success: true,
      canPing: !isFinished && remaining <= 0,
      onCooldown: remaining > 0,
      cooldownRemainingHours: remaining > 0 ? Math.ceil(remaining / (60 * 60 * 1000)) : 0,
    };
  } catch (e: unknown) {
    console.error('getPingStatus error:', getErrorMessage(e));
    return { success: false, error: 'เกิดข้อผิดพลาด' };
  }
}