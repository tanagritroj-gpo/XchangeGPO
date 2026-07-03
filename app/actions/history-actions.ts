'use server'

import { createClient } from '@/lib/supabase/server';

export async function getCustomerExchangeHistory(b2bCustomerId: string) {
  const supabase = await createClient();
  const numericId = parseInt(b2bCustomerId, 10);

  if (isNaN(numericId)) return [];

  // เรียกใช้ RPC ที่เราเพิ่งสร้างขึ้น
  const { data, error } = await supabase.rpc('get_customer_history', { 
    p_customer_id: numericId 
  });

  if (error) {
    console.error('Error fetching history via RPC:', error);
    return [];
  }

  // เนื่องจาก RPC ส่งค่ากลับมาเป็น JSON (Array) เราก็พร้อมใช้งานได้ทันที
  return data || [];
}