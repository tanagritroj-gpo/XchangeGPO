'use server'

import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import * as Sentry from '@sentry/nextjs';
import { getCustomerSession } from './auth-actions';
import { checkRateLimit } from '@/lib/rate-limit';
import { DrugItemInputSchema, sanitizeFreeText, sanitizeDateOrNull } from '@/lib/return-request-schema';
import type { ReturnFormData, DrugItemEntry } from '../(authenticated)/form/form-types';
import type { RequestRow } from '@/lib/types';
import { MAX_DELIVERY_PHOTOS, MAX_DELIVERY_PHOTO_BYTES } from '@/lib/delivery-photo-limits';
import { buildAndStoreReturnPdf, draftDir } from '@/lib/return-form-pdf';
import { sendReturnFormEmail } from '@/lib/send-return-form-email';

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

const DELIVERY_PHOTO_MIME_RE = /^data:(image\/(?:png|jpe?g|webp));base64,/;

// ★ magic-byte ตรวจว่าเนื้อไฟล์จริงตรงกับ MIME ที่ประกาศใน data URI prefix — prefix เป็น string
// ที่ client ส่งมาเอง ปลอมได้ (เช่น ใส่ "data:image/png;base64," แล้วตามด้วย base64 ของไฟล์อื่น)
// เช็คแค่ regex prefix อย่างเดียวไม่พอสำหรับไฟล์ที่จะถูกเก็บและเปิดดูโดย staff อื่นภายหลัง
function matchesImageMagicBytes(buffer: Buffer, contentType: string): boolean {
  if (contentType === 'image/png') {
    return buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (contentType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (contentType === 'image/webp') {
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

// ★ เฉพาะฟอร์มที่ลูกค้ากรอกเอง (Step2Items.tsx เปิด allowDeliveryPhoto เฉพาะที่นี่) — ตรวจ +
// upload รูปถ่ายใบส่งของฝั่ง server เหมือน signature_url ทุกจุด (prefix data URI, decode,
// จำกัดขนาด, เก็บ path ไม่ใช่ base64/public URL) ต่างแค่ยอมรับ png/jpeg/webp ไม่ใช่ png อย่างเดียว
// เพราะเป็นรูปถ่ายจากกล้องจริง ไม่ใช่ canvas เซ็นชื่อ — ★ ระดับคำร้อง ไม่ใช่ระดับรายการยา
// (ใบส่งของคือเอกสาร 1 ใบต่อการจัดส่ง ไม่ใช่ 1 ใบต่อยา 1 รายการ) จึงอัปโหลดครั้งเดียวเป็น
// array แทนการวนอัปโหลดต่อ item เหมือนดีไซน์แรกเริ่ม
async function uploadDeliveryNotePhotos(dataUris: string[], customerId: number, refId: string): Promise<string[]> {
  if (dataUris.length > MAX_DELIVERY_PHOTOS) {
    throw new Error(`แนบรูปใบส่งของได้สูงสุด ${MAX_DELIVERY_PHOTOS} รูปต่อคำร้อง`);
  }
  return Promise.all(dataUris.map(async (dataUri, index) => {
    const match = DELIVERY_PHOTO_MIME_RE.exec(dataUri);
    if (!match) throw new Error("รูปใบส่งของไม่ถูกต้อง");

    const contentType = match[1];
    const ext = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
    const base64Data = dataUri.slice(match[0].length);
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length === 0 || buffer.length > MAX_DELIVERY_PHOTO_BYTES) {
      const maxMb = MAX_DELIVERY_PHOTO_BYTES / (1024 * 1024);
      throw new Error(`ไฟล์รูปใบส่งของมีขนาดใหญ่เกินไป (สูงสุด ${maxMb}MB)`);
    }

    if (!matchesImageMagicBytes(buffer, contentType)) {
      throw new Error("รูปใบส่งของไม่ถูกต้อง");
    }

    const photoPath = `delivery-notes/${customerId}/${refId}-${index + 1}.${ext}`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('return-documents')
      .upload(photoPath, buffer, { contentType, upsert: true });

    if (uploadErr) {
      console.error('Delivery note photo upload failed:', uploadErr);
      Sentry.captureException(uploadErr, { tags: { area: 'delivery-note-photo-upload' } });
      throw new Error("บันทึกรูปใบส่งของไม่สำเร็จ กรุณาลองใหม่");
    }

    return photoPath;
  }));
}

// แค่ตัวอย่างเลขที่จะได้ ไม่ได้จองเลขจริง (ไม่ lock ไม่กันชนกัน) — เลขจริงเกิดขึ้นแบบ atomic
// ใน create_exchange_request ตอน submit จริงเท่านั้น (ดู migration
// 20260805164944_fix_doc_number_race_condition.sql)
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

  // ★ รูปใบส่งของ — ระดับคำร้อง (ไม่บังคับแนบเลย ต่างจากลายเซ็นด้านบนที่บังคับ) อัปโหลดครั้งเดียว
  // ให้ทุกรายการยาในคำร้องนี้ใช้ร่วมกัน
  const deliveryNotePhotoPaths = formData.deliveryNotePhotoUrls?.length
    ? await uploadDeliveryNotePhotos(formData.deliveryNotePhotoUrls, session.id, refId)
    : null;

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
    agent_appointment_note: sanitizeFreeText(formData.agent_appointment_note),
    agent_appointment_date: sanitizeDateOrNull(formData.agent_appointment_date),
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
    p_delivery_note_photo_paths: deliveryNotePhotoPaths,
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

  // ── แลกเปลี่ยน: สร้าง PDF ฉบับ draft + ส่งอีเมลแจ้งรับเรื่อง (email #1) ฝั่ง server ──
  // ยังไม่ส่งลิงก์ PDF — ระบบจะส่งเอกสารฉบับสมบูรณ์อีกครั้งหลัง CSR ตรวจ compliance เสร็จ
  // (approveRequest/rejectRequest) best-effort: ถ้าพลาด ReviewSuccessCard มี generatePdfAction
  // เป็น fallback สร้าง draft on-demand และลูกค้ายังติดตามสถานะได้จาก QR/ลิงก์ในอีเมลนี้
  if (requestData.request_type === 'รับคืนแลกเปลี่ยน') {
    try {
      const { data: fullReq } = await supabaseAdmin
        .from('requests')
        .select('*, drug_items(*)')
        .eq('id', data[0].request_id)
        .single();
      if (fullReq) {
        const req = fullReq as RequestRow;
        await buildAndStoreReturnPdf(req, { kind: 'draft', storageDir: draftDir(session.id) });
        const { error: ackErr } = await sendReturnFormEmail({ request: req, to: session.email, mode: 'ack' });
        if (ackErr) throw ackErr;
        await supabaseAdmin.from('status_logs').insert({
          request_id: data[0].request_id,
          department: 'system',
          status_name: 'ack_email_sent',
          actor_type: 'system',
          staff_remark: `แจ้งรับเรื่องทางอีเมล ${session.email} — รอเจ้าหน้าที่ตรวจสอบรายการสินค้า`,
        });
      }
    } catch (exchangeAckErr) {
      console.error('createReturnRequest: exchange draft/ack email failed', exchangeAckErr);
      Sentry.captureException(exchangeAckErr, { level: 'warning', tags: { area: 'exchange-ack' } });
    }
  }

  return { id: data[0].request_id, refId: data[0].ref_id };
}