import 'server-only';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { sendPdfDocumentEmail } from '@/lib/email-service';
import { formatThaiDate } from '@/lib/format-thai-date';
import type { RequestRow, DrugItemRow } from '@/lib/types';

export type ReturnEmailMode = 'ack' | 'verified' | 'standard';

// exchange ที่ CSR ตรวจแล้วมี item ไม่ผ่านเกณฑ์ → ต้องส่งฉบับ verified (ขีดคร่อม + ยอดหักรายการ reject)
export function resolveEmailMode(request: Pick<RequestRow, 'request_type' | 'drug_items'>): ReturnEmailMode {
  if (request.request_type !== 'รับคืนแลกเปลี่ยน') return 'standard';
  return (request.drug_items ?? []).some((it) => it.is_compliant === false) ? 'verified' : 'standard';
}

// จุดเดียวที่ map request → email params + สร้าง signed URL ของฉบับ final
// - ack       : ไม่ต้องมีไฟล์ (email #1 แจ้งรับเรื่อง)
// - verified  : ต้องมี document_attachments kind='final' — ยอด/รายการ reject หักออก
// - standard  : ต้องมี kind='final' — เนื้อหาปกติ
export async function sendReturnFormEmail(opts: {
  request: RequestRow; // ต้อง select drug_items (พร้อม is_compliant/compliance_remark/value_amount) มาด้วย
  to: string;
  mode: ReturnEmailMode;
  preparedByStaff?: boolean;
}): Promise<{ error: Error | null }> {
  const { request, to, mode } = opts;

  let downloadUrl: string | null = null;
  if (mode !== 'ack') {
    const { data: doc } = await supabaseAdmin
      .from('document_attachments')
      .select('file_path')
      .eq('request_id', request.id)
      .eq('kind', 'final')
      .maybeSingle();
    if (!doc?.file_path) return { error: new Error('ไม่พบเอกสารฉบับสมบูรณ์') };

    const { data: signed } = await supabaseAdmin.storage
      .from('return-documents')
      .createSignedUrl(doc.file_path, 60 * 60 * 24);
    if (!signed?.signedUrl) return { error: new Error('สร้างลิงก์เอกสารไม่สำเร็จ') };
    downloadUrl = signed.signedUrl;
  }

  const items = (request.drug_items ?? []) as DrugItemRow[];
  const verified = mode === 'verified';
  const counted = verified ? items.filter((i) => i.is_compliant !== false) : items;
  const totalValue = verified
    ? counted.reduce((s, i) => s + (Number(i.value_amount) || 0), 0)
    : Number(request.total_value ?? 0);

  return sendPdfDocumentEmail({
    to,
    refId: request.ref_id,
    hospitalName: request.hospital_name ?? 'หน่วยงานของท่าน',
    docNumber: request.doc_number ?? null,
    requestDateText: formatThaiDate(request.request_date ?? request.created_at),
    requestType: request.request_type ?? null,
    returnReason: request.return_reason ?? null,
    deliveryType: request.delivery_type ?? null,
    totalValueText: totalValue.toLocaleString('th-TH', { minimumFractionDigits: 2 }),
    items: items.map((d) => ({
      drugName: d.drug_name,
      qty: d.qty,
      unit: d.unit,
      lot: d.lot_number,
      exp: formatThaiDate(d.exp_date),
      rejected: verified && d.is_compliant === false,
      rejectReason: verified ? d.compliance_remark : null,
    })),
    downloadUrl,
    preparedByStaff: opts.preparedByStaff,
    mode,
  });
}
