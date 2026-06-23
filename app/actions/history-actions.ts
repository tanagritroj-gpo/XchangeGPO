'use server'

import { createClient } from '@/lib/supabase/server';

export async function getCustomerExchangeHistory(b2bCustomerId: string) {
  const supabase = await createClient();

  // แปลง string เป็น number (bigint) ให้ชัวร์ก่อน Query
  const numericId = parseInt(b2bCustomerId, 10);

  const { data, error } = await supabase
    .from('requests')
    .select(`
      id,
      ref_id,
      created_at,
      current_status,
      drug_items (id, drug_name, current_status)
    `)
    .eq('b2b_customer_id', numericId) 
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching history:', error);
    return [];
  }

  // Log ออกมาดูอีกครั้งใน Terminal ว่าสรุปแล้ว data คืออะไร
  console.log('Result for ID', numericId, ':', data);

  return data || [];
}