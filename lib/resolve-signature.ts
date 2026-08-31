import { admin as supabaseAdmin } from '@/lib/supabase/admin';

// ลายเซ็นลูกค้าเก็บเป็น path ภายใน bucket return-documents (signatures/{id}/{ref}.png —
// ดู app/actions/form-actions.ts) ดึงกลับมาเป็น bytes ให้ pdf-service ฝังลงเอกสาร
// คืน null ถ้าไม่มี/โหลดไม่ได้ (ไม่ throw — PDF ยังออกได้โดยไม่มีลายเซ็น เช่นใบที่ CSR กรอกแทน)
export async function resolveSignaturePng(signatureUrl: string | null | undefined): Promise<Uint8Array | null> {
  if (!signatureUrl) return null;

  // เผื่อข้อมูลเก่าที่เคยเก็บเป็น data URI หรือ URL เต็ม (ปัจจุบันเก็บเป็น path ล้วน)
  if (signatureUrl.startsWith('data:')) {
    const b64 = signatureUrl.split(',')[1];
    return b64 ? new Uint8Array(Buffer.from(b64, 'base64')) : null;
  }

  try {
    if (signatureUrl.startsWith('http://') || signatureUrl.startsWith('https://')) {
      const res = await fetch(signatureUrl);
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    }
    const { data, error } = await supabaseAdmin.storage.from('return-documents').download(signatureUrl);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  } catch {
    return null;
  }
}

// ลายเซ็นพนักงาน (staff_users.signature_url) — เก็บใน bucket 'signatures' (ดู csr-actions.ts
// ที่ resolve แบบเดียวกันตอนออกเอกสารยืนยันการลงทะเบียน) คนละ bucket กับลายเซ็นลูกค้า
export async function resolveStaffSignaturePng(signatureUrl: string | null | undefined): Promise<Uint8Array | null> {
  if (!signatureUrl) return null;
  try {
    const { data, error } = await supabaseAdmin.storage.from('signatures').download(signatureUrl);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  } catch {
    return null;
  }
}
