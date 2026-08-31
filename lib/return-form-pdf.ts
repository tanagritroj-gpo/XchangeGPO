import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { buildReturnFormPdf, type BuildStamp } from '@/app/services/pdf-service';
import { resolveSignaturePng, resolveStaffSignaturePng } from '@/lib/resolve-signature';
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
  opts: { kind: DocKind; storageDir: string; stamp?: BuildStamp | null },
): Promise<{ filePath: string }> {
  const signaturePng = await resolveSignaturePng(request.signature_url);
  const pdfBytes = await buildReturnFormPdf(request, { signaturePng, stamp: opts.stamp ?? null });

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

// สร้าง verified stamp จาก status_logs — หาเจ้าหน้าที่ที่ตรวจ (log ล่าสุดที่มี staff_id ในขั้นตรวจสอบ)
// ใช้ตอนต้อง rebuild final PDF ของใบแลกเปลี่ยน on-demand (generate-pdf-action / staff) ที่ไม่มี
// context ของ CSR โดยตรง — deliverVerifiedExchangeDoc ส่ง stamp เองอยู่แล้ว ไม่ต้องพึ่งฟังก์ชันนี้
export async function resolveVerifiedStamp(requestId: number): Promise<BuildStamp | null> {
  const { data: log } = await supabaseAdmin
    .from('status_logs')
    .select('staff_id, log_date, staff_users(full_name, signature_url)')
    .eq('request_id', requestId)
    .in('status_name', ['document_sent', 'approved', 'rejected', 'compliance_checked'])
    .not('staff_id', 'is', null)
    .order('log_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!log?.staff_id) return null;
  const su = Array.isArray(log.staff_users) ? log.staff_users[0] : log.staff_users;
  return {
    kind: 'verified',
    byName: su?.full_name ?? 'เจ้าหน้าที่ตรวจสอบ',
    at: log.log_date ?? new Date().toISOString(),
    signaturePng: await resolveStaffSignaturePng(su?.signature_url),
  };
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
