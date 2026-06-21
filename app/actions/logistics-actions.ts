'use server'

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function getLogisticsDashboardData() {
  const supabase = await createClient();
  
  // กรองเฉพาะสถานะที่ Logistics ต้องรับผิดชอบ: 
  // 'approved' (รอขนส่ง) และ 'in_transit' (ระหว่างขนส่ง)
  const { data, error } = await supabase
    .from('requests')
    .select(`
      *,
      drug_items (*)
    `)
    .in('current_status', ['approved', 'in_transit'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching logistics data:", error);
    return { success: false, requests: [], error: error.message };
  }

  if (data) {
    // กรอง item ที่ rejected ออกจากแต่ละใบงาน
    const filteredRequests = data.map(req => ({
      ...req,
      drug_items: req.drug_items.filter((item: any) => item.current_status !== 'rejected')
    })).filter(req => req.drug_items.length > 0);
    
    return { success: true, requests: filteredRequests };
  }

  return { success: true, requests: [] };
}

export async function updateLogisticsStatus(
  requestId: number,
  staffId: string,
  newStatus: 'in_transit' | 'at_warehouse',
  remark: string
) {
  const supabase = await createClient();

  // 1. บันทึก Log
  await supabase.from('status_logs').insert({
    request_id: requestId,
    staff_id: staffId,
    department: 'logistics',
    status_name: newStatus,
    staff_remark: remark
  });

  // 2. อัปเดตตาราง requests
  await supabase
    .from('requests')
    .update({
      current_status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', requestId);

  // 3. อัปเดต drug_items แบบป้องกันการทับสถานะเดิม
  if (newStatus === 'at_warehouse') {
    // กรณีถึงคลัง: อัปเดตเฉพาะอันที่ยังไม่ถูกจัดการ (ไม่ใช่ rejected และไม่ใช่ at_warehouse)
    await supabase
      .from('drug_items')
      .update({ current_status: 'at_warehouse' })
      .eq('request_id', requestId)
      .neq('current_status', 'rejected'); // ✅ ใส่ตรงนี้ครับ!
  } else {
    // กรณี in_transit: อัปเดตเฉพาะอันที่ยังไม่มีสถานะ หรือเป็นสถานะเริ่มต้น
    await supabase
      .from('drug_items')
      .update({ current_status: newStatus })
      .eq('request_id', requestId)
      .neq('current_status', 'rejected'); // ✅ ใส่ตรงนี้ด้วย!
  }

  revalidatePath('/admin/logistics/dashboard');
  return { success: true };
}

// 3. อัปเดตสถานะรายชิ้น (ตรวจรับเข้าคลัง)
export async function updateItemStatus(
  itemId: number,
  staffId: string,
  nextStatus: 'at_warehouse',
  remark: string
) {
  const supabase = await createClient();

  const { data: item, error: fetchErr } = await supabase
    .from('drug_items')
    .select('request_id')
    .eq('id', itemId)
    .single();

  if (fetchErr) throw new Error("หาข้อมูลยาไม่พบ");

  // 1. อัปเดตสถานะยาเป็น at_warehouse
  await supabase.from('drug_items').update({ current_status: nextStatus }).eq('id', itemId);

  // 2. ดึงสถานะของทุกรายการยามาเช็คเพื่อปิดใบงาน
  const { data: allItems } = await supabase
    .from('drug_items')
    .select('id, current_status')
    .eq('request_id', item.request_id);

  const hasAccepted = allItems?.some(i => i.current_status === 'at_warehouse');
  const isAllProcessed = allItems?.every(i => ['at_warehouse', 'rejected'].includes(i.current_status));

  // 3. กำหนดสถานะใบงานตามเงื่อนไขที่กิตต้องการ
  if (isAllProcessed) {
    const finalRequestStatus = hasAccepted ? 'at_warehouse' : 'rejected';
    
    await supabase
      .from('requests')
      .update({ 
        current_status: finalRequestStatus, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', item.request_id);
  }

  // 4. บันทึก Log
  await supabase.from('status_logs').insert({
    request_id: item.request_id,
    staff_id: staffId,
    department: 'logistics',
    status_name: nextStatus,
    staff_remark: remark
  });

  revalidatePath('/admin/logistics/dashboard');
  return { success: true };
}

// 4. ปฏิเสธรายการรายชิ้น
export async function rejectItemStatus(
  itemId: number,
  staffId: string,
  remark: string
) {
  const supabase = await createClient();

  const { data: item } = await supabase
    .from('drug_items')
    .select('request_id')
    .eq('id', itemId)
    .single();

  // 1. อัปเดตสถานะยาเป็น rejected
  const { error: updateError } = await supabase
    .from('drug_items')
    .update({ current_status: 'rejected' })
    .eq('id', itemId);

  if (updateError) throw new Error("ปฏิเสธรายการยาไม่สำเร็จ");

  // 2. เช็คสถานะเพื่อปิดใบงานแบบแยกกรณี (at_warehouse vs rejected)
  if (item?.request_id) {
    const { data: allItems } = await supabase
      .from('drug_items')
      .select('id, current_status')
      .eq('request_id', item.request_id);

    const hasAccepted = allItems?.some(i => i.current_status === 'at_warehouse');
    const isAllProcessed = allItems?.every(i => ['at_warehouse', 'rejected'].includes(i.current_status));

    if (isAllProcessed) {
      // ถ้ามีอย่างน้อย 1 รายการผ่าน ให้เป็น at_warehouse, ถ้าไม่เลยให้เป็น rejected
      const finalRequestStatus = hasAccepted ? 'at_warehouse' : 'rejected';
      
      await supabase
        .from('requests')
        .update({ 
          current_status: finalRequestStatus, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', item.request_id);
    }
  }

  // 3. บันทึก Log
  await supabase.from('status_logs').insert({
    request_id: item?.request_id,
    staff_id: staffId,
    department: 'logistics',
    status_name: 'rejected',
    staff_remark: remark || `ปฏิเสธรายการยา ID: ${itemId}`
  });

  revalidatePath('/admin/logistics/dashboard');
  return { success: true };
}

export async function confirmLogisticsBatch(
  requestId: number,
  staffId: string,
  actions: { itemId: number, status: 'at_warehouse' | 'rejected', remark: string }[]
) {
  const supabase = await createClient();

  // 1. อัปเดตรายรายการยา
  for (const action of actions) {
    await supabase.from('drug_items').update({ current_status: action.status }).eq('id', action.itemId);

    // 2. บันทึก Log แยกตามรายการ
    await supabase.from('status_logs').insert({
      request_id: requestId,
      staff_id: staffId,
      department: 'logistics',
      status_name: action.status,
      staff_remark: action.remark
    });
  }

  // 3. ดึงสถานะของทุกรายการยาในใบงานนี้มาเช็ค
  const { data: allItems } = await supabase
    .from('drug_items')
    .select('id, current_status')
    .eq('request_id', requestId); // ✅ ใช้ requestId ตรงๆ

  // 4. เช็คเงื่อนไข
  const hasAccepted = allItems?.some(i => i.current_status === 'at_warehouse');
  const isAllProcessed = allItems?.every(i => ['at_warehouse', 'rejected'].includes(i.current_status));

  // 5. กำหนดสถานะใบงาน
  let finalRequestStatus = 'rejected'; 
  if (hasAccepted) {
    finalRequestStatus = 'at_warehouse'; 
  }

  // 6. ถ้าจบกระบวนการครบ ค่อยอัปเดตสถานะใบงานหลัก
  if (isAllProcessed) {
    await supabase
      .from('requests')
      .update({ 
        current_status: finalRequestStatus, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', requestId); // ✅ ใช้ requestId ตรงๆ
  }

  revalidatePath('/admin/logistics/dashboard');
  return { success: true };
}