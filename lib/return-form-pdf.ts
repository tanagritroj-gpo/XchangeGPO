import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { buildReturnFormPdf } from '@/app/services/pdf-service';
import { resolveSignaturePng } from '@/lib/resolve-signature';
import type { RequestRow } from '@/lib/types';

export type DocKind = 'draft' | 'final';

// จุดเดียวที่ "สร้าง PDF ใบรับคืน/แลกเปลี่ยน + อัปโหลด + บันทึก document_attachments"
// - draft  = ฉบับที่ลูกค้ากรอกมา (storageDir ขึ้นต้น drafts/)
// - final  = ฉบับที่ส่งให้ลูกค้าจริง (storageDir ขึ้นต้น returns/)
// verified (ขีดคร่อมรายการไม่ผ่านเกณฑ์) คำนวณเองใน buildReturnFormPdf จาก drug_items.is_compliant
//
// upsert ด้วย conflict target (request_id, kind) → เรียกซ้ำได้ ไฟล์ล่าสุดทับของเดิม
export async function buildAndStoreReturnPdf(
  request: RequestRow,
  opts: { kind: DocKind; storageDir: string },
): Promise<{ filePath: string }> {
  const signaturePng = await resolveSignaturePng(request.signature_url);
  const pdfBytes = await buildReturnFormPdf(request, { signaturePng });

  const filePath = `${opts.storageDir.replace(/\/$/, '')}/${request.ref_id}.pdf`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('return-documents')
    .upload(filePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (uploadErr) throw uploadErr;

  const { error: daErr } = await supabaseAdmin
    .from('document_attachments')
    .upsert(
      { request_id: request.id, ref_id: request.ref_id, file_path: filePath, kind: opts.kind },
      { onConflict: 'request_id,kind' },
    );
  if (daErr) throw daErr;

  return { filePath };
}

// storageDir มาตรฐานตามช่องทาง
export function draftDir(b2bCustomerId: number | null): string {
  return `drafts/${b2bCustomerId ?? 'staff'}`;
}
export function finalDir(request: Pick<RequestRow, 'b2b_customer_id' | 'submission_channel'>): string {
  return request.submission_channel === 'csr_manual' || request.b2b_customer_id == null
    ? 'returns/staff'
    : `returns/${request.b2b_customer_id}`;
}

// best-effort — ใช้ในจุดที่ PDF เป็น side effect รอง (สร้าง draft ตอน submit, สร้าง final ตอน CSR ยืนยัน)
// ไม่ throw ให้กระทบ flow หลัก แต่ยิง Sentry ไว้ให้รู้ถ้าเกิดถี่
export async function tryBuildAndStoreReturnPdf(
  request: RequestRow,
  opts: { kind: DocKind; storageDir: string },
): Promise<{ filePath: string } | null> {
  try {
    return await buildAndStoreReturnPdf(request, opts);
  } catch (err) {
    console.error(`buildAndStoreReturnPdf(${opts.kind}) failed for request ${request.id}:`, err);
    Sentry.captureException(err, { level: 'warning', tags: { area: 'return-form-pdf', kind: opts.kind } });
    return null;
  }
}
