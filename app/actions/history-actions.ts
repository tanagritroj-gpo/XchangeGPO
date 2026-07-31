'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getCustomerSession } from './auth-actions';

export async function getCustomerExchangeHistory() {
  // ★ ไม่รับ b2bCustomerId จากภายนอกอีกต่อไป ดึงจาก session ที่ verify แล้วเท่านั้น
  const session = await getCustomerSession();
  if (!session) return [];

  const { data, error } = await supabaseAdmin.rpc('get_customer_history', {
    p_customer_id: session.id,
  });

  if (error) {
    console.error('Error fetching history via RPC:', error);
    return [];
  }

  return data || [];
}

// ประวัติงานรวมทั้งหน่วยงาน — รวมคำร้องของทุก user ที่มี customer_code เดียวกับ session ปัจจุบัน
export async function getOrgExchangeHistory() {
  const session = await getCustomerSession();
  if (!session?.customer_code?.trim()) return [];

  const { data, error } = await supabaseAdmin.rpc('get_org_history', {
    p_customer_code: session.customer_code,
  });

  if (error) {
    console.error('Error fetching org history via RPC:', error);
    return [];
  }

  return data || [];
}