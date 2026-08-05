'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getCustomerSession } from './auth-actions';
import { checkRateLimit } from '@/lib/rate-limit';
import type { ReturnFormData, DrugItemEntry } from '../(authenticated)/form/form-types';

const sanitizeDate = (dateStr: string) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
};

interface ReturnItemInput {
  drug_name: string;
  qty: number;
  unit: string;
  lot_number: string;
  exp_date: string | null;
  unit_price: number;
  value_amount: number;
  invoice_number: string;
}

// แค่ตัวอย่างเลขที่จะได้ ไม่ได้จองเลขจริง (ไม่ lock ไม่กันชนกัน) — เลขจริงเกิดขึ้นแบบ atomic
// ใน create_exchange_request ตอน submit จริงเท่านั้น (ดู migration
// 20260805000000_fix_doc_number_race_condition.sql)
export async function getNextDocNumber() {
  const session = await getCustomerSession();
  if (!session) throw new Error("กรุณาเข้าสู่ระบบ");

  const { data, error } = await supabaseAdmin.rpc('peek_next_doc_number');
  if (error || !data) return "S001/" + new Date().getFullYear();
  return data;
}

export async function createReturnRequest(formData: ReturnFormData) {
  // ★ 1. ต้อง login เสมอ — identity มาจาก session ที่ verify แล้วเท่านั้น
  const session = await getCustomerSession();
  if (!session) {
    throw new Error("กรุณาเข้าสู่ระบบก่อนส่งแบบฟอร์ม");
  }

  // ★ 2. Rate limit ป้องกันสแปมยื่นคำร้อง
  const allowed = await checkRateLimit(`create-request:${session.id}`, 10, 3600);
  if (!allowed.allowed) {
    throw new Error("ส่งคำร้องถี่เกินไป กรุณาลองใหม่ภายหลัง");
  }

  if (!formData.items || formData.items.length === 0) {
    throw new Error("ต้องมีรายการสินค้าอย่างน้อย 1 รายการครับ");
  }

  // ★ 6. จำกัดจำนวนรายการยาให้ตรงกับ MAX ฝั่ง UI (Step2Items.tsx) กัน request ผิดปกติ
  if (formData.items.length > 5) {
    throw new Error("จำกัดสูงสุด 5 รายการต่อคำร้อง");
  }

  // ★ 7. ตรวจ + upload ลายเซ็นฝั่ง server แทนการเชื่อ URL จาก client
  //    (client ส่งมาเป็น base64 data URI จาก canvas.toDataURL() ไม่ใช่ URL จริง)
  if (!formData.signature_url?.startsWith('data:image/png;base64,')) {
    throw new Error("ข้อมูลลายเซ็นไม่ถูกต้อง");
  }

  const base64Data = formData.signature_url.split(',')[1];
  const buffer = Buffer.from(base64Data, 'base64');

  if (buffer.length > 2 * 1024 * 1024) {
    throw new Error("ไฟล์ลายเซ็นมีขนาดใหญ่เกินไป");
  }

  const refId = `REF-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
  const signaturePath = `signatures/${session.id}/${refId}.png`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('return-documents')
    .upload(signaturePath, buffer, { contentType: 'image/png', upsert: true });

  if (uploadErr) {
    console.error('Signature upload failed:', uploadErr);
    throw new Error("บันทึกลายเซ็นไม่สำเร็จ กรุณาลองใหม่");
  }

  // ★ 8. มูลค่ารวมคำนวณจาก จำนวน × ราคาต่อหน่วย ฝั่ง server เสมอ (เชื่อ item.val จาก client ตรงๆ ไม่ได้
  //    เหมือนกับ computedTotal ด้านล่างที่ไม่เชื่อ formData.totalValue)
  const items: ReturnItemInput[] = formData.items.map((item: DrugItemEntry): ReturnItemInput => {
    const qty = Math.max(0, Number(item.qty) || 0);
    const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
    return {
      drug_name: String(item.drugName ?? '').slice(0, 200),
      qty,
      unit: item.unit || 'ไม่ระบุ',
      lot_number: item.lot || '',
      exp_date: sanitizeDate(item.exp),
      unit_price: unitPrice,
      value_amount: qty * unitPrice,
      invoice_number: item.inv || '',
    };
  });

  // ★ 3. คำนวณมูลค่ารวมใหม่ฝั่ง server แทนการเชื่อ formData.totalValue
  const computedTotal = items.reduce((sum: number, i: { value_amount?: number }) => {
    return sum + (Number(i.value_amount) || 0);
  }, 0);

  const requestData = {
    ref_id: refId,
    // doc_number ไม่รับจาก client อีกต่อไป — create_exchange_request จอง atomic เอง
    request_type: formData.sender?.request_type,
    hospital_name: formData.sender?.hospital_name,
    contact_name: formData.sender?.contact_name,
    phone: formData.sender?.phone,

    // ★ 4. ใช้ email จาก session ที่ verify แล้ว ไม่ใช่จาก formData
    customer_email: session.email,
    province: session.province,

    // ★ 5. ใช้ b2b_customer_id จาก session เท่านั้น ไม่รับจาก client
    b2b_customer_id: session.id,

    return_reason: formData.return_reason,
    delivery_type: formData.delivery_type,
    addr_street: formData.addr_street,
    addr_sub: formData.addr_sub,
    addr_district: formData.addr_district,
    addr_province: formData.addr_province,
    agent_info: formData.agent_info,
    exchange_product_type: formData.exchange_product_type,
    exchange_product_list: formData.exchange_product_list,
    exchange_product_other: formData.exchange_product_other,

    // ★ เก็บ path ภายใน bucket ไม่ใช่ base64 หรือ public URL
    signature_url: signaturePath,

    signer_name: formData.signer_name,
    signer_position: formData.signer_position,
    total_value: computedTotal,
    request_date: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin.rpc('create_exchange_request', {
    p_b2b_customer_id: session.id, // ★ ไม่ใช่ formData.sender.b2b_customer_id อีกต่อไป
    p_request_data: requestData,
    p_drug_items: items,
  });

  if (error) throw error;

  return { id: data[0].request_id, refId: data[0].ref_id };
}