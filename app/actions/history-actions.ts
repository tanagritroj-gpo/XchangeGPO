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