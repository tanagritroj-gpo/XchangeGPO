'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import * as Sentry from '@sentry/nextjs';
import { getCustomerSession } from './auth-actions';
import { checkRateLimit } from '@/lib/rate-limit';
import { DrugItemInputSchema, sanitizeFreeText } from '@/lib/return-request-schema';
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
    Sentry.captureException(uploadErr, { tags: { area: 'signature-upload' } });
    throw new Error("บันทึกลายเซ็นไม่สำเร็จ กรุณาลองใหม่");
  }

  // ★ 8. มูลค่ารวมคำนวณจาก จำนวน × ราคาต่อหน่วย ฝั่ง server เสมอ (เชื่อ item.val จาก client ตรงๆ ไม่ได้
  //    เหมือนกับ computedTotal ด้านล่างที่ไม่เชื่อ formData.totalValue) — DrugItemInputSchema
  //    (lib/return-request-schema.ts) กัน qty/unit_price ไม่มีขอบเขตบนด้วย (พบระหว่าง
  //    security audit 11 ส.ค. 2569 — เดิมกันแค่ติดลบ/NaN)
  const items: ReturnItemInput[] = formData.items.map((item: DrugItemEntry): ReturnItemInput => {
    const parsed = DrugItemInputSchema.parse(item);
    return {
      drug_name: parsed.drugName,
      qty: parsed.qty,
      unit: parsed.unit,
      lot_number: parsed.lot,
      exp_date: sanitizeDate(parsed.exp),
      unit_price: parsed.unitPrice,
      value_amount: parsed.qty * parsed.unitPrice,
      invoice_number: parsed.inv,
    };
  });

  // ★ 3. คำนวณมูลค่ารวมใหม่ฝั่ง server แทนการเชื่อ formData.totalValue
  const computedTotal = items.reduce((sum: number, i: { value_amount?: number }) => {
    return sum + (Number(i.value_amount) || 0);
  }, 0);

  const requestData = {
    ref_id: refId,
    // doc_number ไม่รับจาก client อีกต่อไป — create_exchange_request จอง atomic เอง
    request_type: sanitizeFreeText(formData.sender?.request_type),
    hospital_name: sanitizeFreeText(formData.sender?.hospital_name),
    contact_name: sanitizeFreeText(formData.sender?.contact_name),
    phone: sanitizeFreeText(formData.sender?.phone),

    // ★ 4. ใช้ email จาก session ที่ verify แล้ว ไม่ใช่จาก formData
    customer_email: session.email,
    customer_code: session.customer_code,
    province: session.province,

    // ★ 5. ใช้ b2b_customer_id จาก session เท่านั้น ไม่รับจาก client
    b2b_customer_id: session.id,

    // ★ sanitizeFreeText (lib/return-request-schema.ts) ตัดความยาวข้อความอิสระที่ DB ไม่ได้
    //    จำกัดไว้เอง (พบระหว่าง security audit 11 ส.ค. 2569 — เดิมส่งตรงจาก client ไม่มี cap)
    return_reason: sanitizeFreeText(formData.return_reason),
    delivery_type: sanitizeFreeText(formData.delivery_type),
    addr_street: sanitizeFreeText(formData.addr_street),
    addr_sub: sanitizeFreeText(formData.addr_sub),
    addr_district: sanitizeFreeText(formData.addr_district),
    addr_province: sanitizeFreeText(formData.addr_province),
    agent_info: sanitizeFreeText(formData.agent_info),
    exchange_product_type: sanitizeFreeText(formData.exchange_product_type),
    exchange_product_list: sanitizeFreeText(formData.exchange_product_list),
    exchange_product_other: sanitizeFreeText(formData.exchange_product_other),

    // ★ เก็บ path ภายใน bucket ไม่ใช่ base64 หรือ public URL
    signature_url: signaturePath,

    signer_name: sanitizeFreeText(formData.signer_name),
    signer_position: sanitizeFreeText(formData.signer_position),
    total_value: computedTotal,
    request_date: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin.rpc('create_exchange_request', {
    p_b2b_customer_id: session.id, // ★ ไม่ใช่ formData.sender.b2b_customer_id อีกต่อไป
    p_request_data: requestData,
    p_drug_items: items,
  });

  if (error) throw error;

  // แจ้งเตือน Manager/CSR/Sale ว่ามีคำร้องใหม่เข้าระบบ — เงียบๆ ถ้าพลาด ไม่ให้กระทบการส่งคำร้อง
  // จริงของลูกค้า (แจ้งเตือนเป็นแค่ side effect รอง ไม่ใช่ core flow)
  // org_type/province ต้อง query แยกจาก organizations เพราะ customer session (getCustomerSession)
  // ไม่ได้ join org_type มาด้วย — ใช้ requestData.customer_code (มาจาก session.customer_code
  // อยู่แล้ว) หา org_type ให้ Sale กรองแจ้งเตือนเฉพาะหน่วยงานในเขตที่ตัวเองดูแลได้
  try {
    const { data: orgInfo } = await supabaseAdmin
      .from('organizations')
      .select('org_type, province')
      .eq('customer_code', requestData.customer_code)
      .maybeSingle();

    await supabaseAdmin.from('notification_log').insert({
      type: 'new_request',
      request_id: data[0].request_id,
      ref_id: data[0].ref_id,
      org_type: orgInfo?.org_type ?? null,
      province: orgInfo?.province ?? null,
    });
  } catch (notifyErr) {
    console.error('createReturnRequest: failed to log notification', notifyErr);
    // level: warning เพราะ non-blocking (คำร้องหลักสร้างสำเร็จแล้ว) แต่ยังอยากรู้ถ้าเกิดถี่
    // เพราะแปลว่า CSR/Manager/Sale ไม่เห็นแจ้งเตือนคำร้องใหม่เข้าระบบเงียบๆ
    Sentry.captureException(notifyErr, { level: 'warning', tags: { area: 'notification-log' } });
  }

  return { id: data[0].request_id, refId: data[0].ref_id };
}