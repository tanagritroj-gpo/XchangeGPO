'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Download, Copy, Check, Mail, ArrowRight, X } from 'lucide-react';
import { generatePdfAction } from '@/app/actions/generate-pdf-action';
import { sendPdfEmailAction } from '@/app/actions/send-pdf-email-action';

type PdfState = 'preparing' | 'ready' | 'error';
export type PdfActionResult = { success: true; url: string; expiresIn: number; refId: string; docNumber: string | null } | { success: false; error: string };
export type EmailActionResult = { success: boolean; message?: string; error?: string };
// id เป็น number | string เพราะแหล่งข้อมูลต่างกันตามฝั่งที่เรียก: ฝั่ง CSR ใช้
// b2b_customers.id (bigint) ส่วนฝั่งลูกค้าเองใช้ 'self' + staff_users.id (uuid) สำหรับ sale rep
export type OrgContact = { id: number | string; contact_name: string | null; email: string };
export type OrgContactsResult = { success: boolean; data?: OrgContact[]; error?: string };

// ลำดับสถานะงานตาม enum จริงใน requests.current_status
const STATUS_STEPS: { key: string; label: string }[] = [
  { key: 'pending_review', label: 'รอตรวจสอบ' },
  { key: 'approved', label: 'อนุมัติ' },
  { key: 'in_transit', label: 'อยู่ระหว่างขนส่ง' },
  { key: 'at_warehouse', label: 'ถึงคลัง' },
  { key: 'completed', label: 'เสร็จสิ้น' },
];

export function ReviewSuccessCard({
  requestId,
  refId,
  docNumber,
  customerEmail,
  allowEmail = true,
  showTrackingLink = true,
  homeHref = '/welcome',
  generatePdfActionFn = generatePdfAction,
  sendEmailActionFn = sendPdfEmailAction,
  getEmailRecipientsFn,
}: {
  requestId: number;
  refId: string;
  docNumber?: string | null;
  customerEmail?: string;
  allowEmail?: boolean;       // false ฝั่ง staff เดิม — ตอนนี้เปิดใช้ทั้ง 2 ฝั่งแล้ว (CSR ก็ส่งอีเมลให้ลูกค้าได้)
  showTrackingLink?: boolean; // ควบคุมแยกจาก allowEmail แล้ว — ฝั่ง staff ยังไม่โชว์ลิงก์นี้ตามที่ตกลงไว้
  homeHref?: string;    // ปุ่ม "กลับหน้าหลัก" ชี้ไปคนละที่ระหว่างลูกค้า/staff
  // ★ จุดสำคัญ: default เป็นตัว customer-only เดิม แต่ฝั่ง staff ต้อง override เป็น
  //   generateStaffPdfAction / sendStaffPdfEmailAction เพราะตัว default เรียก getCustomerSession()
  //   ข้างในตรงๆ ถ้าไม่ override จะ error "กรุณาเข้าสู่ระบบ" ทันทีเมื่อ staff เป็นคนกด
  generatePdfActionFn?: (requestId: number) => Promise<PdfActionResult>;
  // recipientEmails พารามิเตอร์ที่ 2 เป็น optional เสมอ — ฝั่งลูกค้า (sendPdfEmailAction เดิม)
  // ไม่รับ/ไม่ใช้พารามิเตอร์นี้เลยก็ยัง assignable กับ type นี้ได้ปกติ
  sendEmailActionFn?: (requestId: number, recipientEmails?: string[]) => Promise<EmailActionResult>;
  // ★ เฉพาะฝั่ง CSR กรอกแทนเท่านั้น (staff-form-actions.ts: getOrgContactsForRequest) — ไม่ส่ง
  // prop นี้มา = ฝั่งลูกค้าเดิมทุกประการ (ปุ่มส่งอีเมลเดี่ยวแบบเก่า ไม่มี picker ผู้รับ) เพราะ
  // ลูกค้าส่งหาตัวเองคนเดียวอยู่แล้ว ไม่มีแนวคิด "เลือกผู้รับหลายคน" ในฝั่งนั้น
  getEmailRecipientsFn?: (requestId: number) => Promise<OrgContactsResult>;
}) {
  const [pdfState, setPdfState] = useState<PdfState>('preparing');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [downloading, setDownloading] = useState(false);
  const [docModalUrl, setDocModalUrl] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<OrgContact[]>([]);
  const [recipientsLoaded, setRecipientsLoaded] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);

  // 1. เตรียมเอกสารอัตโนมัติทันทีที่โหลดหน้าจอ
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await generatePdfActionFn(requestId);
      if (cancelled) return;

      if (result.success) {
        setPdfState('ready');
      } else {
        setErrorMsg(result.error);
        setPdfState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestId, generatePdfActionFn]);

  // 1b. โหลดรายชื่อผู้รับอีเมลของหน่วยงาน (เฉพาะเมื่อมี getEmailRecipientsFn ส่งมา — ฝั่ง CSR
  // เท่านั้น) พร้อมกับเตรียมเอกสารด้านบน — default เลือกทุกคนไว้ก่อน (พฤติกรรมใกล้เคียงเดิมที่
  // ส่งหาอีเมลเดียวโดยอัตโนมัติ) ให้ CSR ติ๊กออกเองถ้าต้องการส่งเฉพาะบางคน
  useEffect(() => {
    if (!getEmailRecipientsFn) return;
    let cancelled = false;

    (async () => {
      const res = await getEmailRecipientsFn(requestId);
      if (cancelled) return;
      if (res.success && res.data) {
        setRecipients(res.data);
        setSelectedEmails(res.data.map((r) => r.email));
      }
      setRecipientsLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [requestId, getEmailRecipientsFn]);

  const toggleRecipient = (email: string) => {
    setSelectedEmails((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]));
  };
  const selectAllRecipients = () => setSelectedEmails(recipients.map((r) => r.email));

  // 2. ฟังก์ชันลองสร้าง PDF ใหม่กรณี Error
  const retryGenerate = async () => {
    setPdfState('preparing');
    setErrorMsg('');
    const result = await generatePdfActionFn(requestId);
    if (result.success) {
      setPdfState('ready');
    } else {
      setErrorMsg(result.error);
      setPdfState('error');
    }
  };

  // 3. ฟังก์ชันเปิดเอกสาร (ขอ URL ใหม่เสมอ ป้องกันลิงก์หมดอายุ 5 นาที) — เปิดเป็น modal
  //    แทนการจำลองคลิก <a download> เดิม เพราะ URL เป็น signed URL ของ Supabase Storage
  //    (คนละ origin กับหน้าเว็บ) ทำให้ attribute `download` ใช้ไม่ได้จริงกับ cross-origin
  //    URL — browser จะเปลี่ยนไป "เปิดหน้าเดิม" แทนการดาวน์โหลดแทน (pattern เดียวกับ
  //    เอกสารยืนยันการลงทะเบียนฝั่ง CSR ใน app/admin/csr/customers/page.tsx)
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const fresh = await generatePdfActionFn(requestId);
      if (!fresh.success) {
        setErrorMsg(fresh.error);
        setPdfState('error');
        return;
      }
      setDocModalUrl(fresh.url);
    } finally {
      setDownloading(false);
    }
  };

  // 4. ฟังก์ชันคัดลอกเลข Ref
  const handleCopyRef = async () => {
    await navigator.clipboard.writeText(refId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 5. ฟังก์ชันส่งอีเมล — ฝั่ง CSR ส่งเฉพาะผู้รับที่ติ๊กเลือกไว้ (getEmailRecipientsFn ให้มา)
  // ฝั่งลูกค้าไม่ส่ง recipientEmails เลย (undefined) ให้ sendPdfEmailAction ทำงานแบบเดิมทุกประการ
  const handleEmailCopy = async () => {
    setEmailState('sending');
    const result = await sendEmailActionFn(requestId, getEmailRecipientsFn ? selectedEmails : undefined);

    if (result.success) {
      setEmailState('sent');
    } else {
      setEmailState('error');
      // เพิ่มบรรทัดนี้ เพื่อให้มันเด้งบอกว่าพังเพราะอะไร
      alert(`สาเหตุที่ส่งไม่สำเร็จ: ${result.error}`); 
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* ── การ์ดใบเสร็จ พร้อมเส้นปรุกระดาษด้านบน ── */}
      <div className="relative bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        <div
          className="h-2"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, #0f5132 0 10px, transparent 10px 18px)',
          }}
        />

        <div className="flex flex-col items-center gap-5 py-10 px-8 text-center">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg ${pdfState === 'error' ? 'text-amber-600' : 'text-emerald-700'}`}
            style={{ background: 'linear-gradient(135deg,#d1fae5,#99f6e4)' }}
          >
            {pdfState === 'error' ? <AlertTriangle size={28} /> : <CheckCircle2 size={28} />}
          </div>

          <div>
            <h2 className="text-xl font-black text-slate-900 mb-1.5">ส่งแบบฟอร์มสำเร็จ!</h2>
            <p className="text-base text-muted-foreground">บันทึกคำร้องของท่านเรียบร้อยแล้ว</p>
          </div>

          <div className="bg-teal-50 border-2 border-teal-200 rounded-2xl px-10 py-5 w-full">
            <p className="text-[13px] font-black text-teal-600 uppercase tracking-widest mb-1.5">
              เลขที่อ้างอิง
            </p>
            <p className="text-2xl font-black text-teal-700 font-mono">{refId}</p>
            {docNumber && <p className="text-sm text-muted-foreground mt-1 font-mono">เอกสารเลขที่ {docNumber}</p>}
          </div>

          {/* ── Mini timeline ของสถานะงาน ── */}
          <div className="w-full flex items-center justify-between px-1">
            {STATUS_STEPS.map((step, i) => (
              <div key={step.key} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full flex items-center">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      i === 0 ? 'bg-teal-600' : 'bg-slate-200'
                    }`}
                  />
                  {i < STATUS_STEPS.length - 1 && <span className="flex-1 h-0.5 bg-slate-100" />}
                </div>
                <span className={`text-[11px] font-bold ${i === 0 ? 'text-teal-600' : 'text-slate-300'}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {/* ── ส่วนแสดงสถานะ PDF ── */}
          {pdfState === 'preparing' && (
            <div className="w-full py-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center gap-2 text-base font-bold text-muted-foreground">
              <Loader2 size={18} className="animate-spin" /> กำลังจัดเตรียมเอกสาร…
            </div>
          )}

          {pdfState === 'error' && (
            <div className="w-full py-4 px-4 rounded-2xl bg-rose-50 border border-rose-200 text-base font-bold text-rose-600 flex flex-col items-center gap-2">
              <span>{errorMsg}</span>
              <button
                onClick={retryGenerate}
                className="text-sm font-black text-rose-700 underline underline-offset-2"
              >
                ลองสร้างเอกสารอีกครั้ง
              </button>
            </div>
          )}

          {pdfState === 'ready' && (
            <div className="grid grid-cols-1 gap-3 w-full">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="py-4 rounded-2xl font-black text-base text-teal-700 bg-teal-100 border-2 border-teal-200 hover:bg-teal-200 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:pointer-events-none"
              >
                {downloading ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />} ดาวน์โหลดใบรับคืน (PDF)
              </button>

              {/* ── เลือกผู้รับอีเมล — เฉพาะฝั่ง CSR (getEmailRecipientsFn) เมื่อหน่วยงานนี้มี
                  contact มากกว่า 1 คน — ฝั่งลูกค้าไม่มี prop นี้เลยจะไม่เห็นส่วนนี้เลย ── */}
              {allowEmail && getEmailRecipientsFn && recipientsLoaded && recipients.length > 1 && emailState !== 'sent' && (
                <div className="w-full text-left bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3 mb-2.5">
                    <p className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">
                      ผู้รับอีเมล ({selectedEmails.length}/{recipients.length})
                    </p>
                    <button
                      type="button"
                      onClick={selectAllRecipients}
                      className="text-xs font-black text-teal-600 hover:text-teal-700 underline underline-offset-2 shrink-0"
                    >
                      เลือกทั้งหมด
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
                    {recipients.map((r) => (
                      <label
                        key={r.id}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEmails.includes(r.email)}
                          onChange={() => toggleRecipient(r.email)}
                          className="w-4 h-4 rounded border-slate-300 accent-teal-600 shrink-0"
                        />
                        <span className="text-sm font-bold text-slate-700 truncate">{r.contact_name || 'ไม่ระบุชื่อ'}</span>
                        <span className="text-xs text-muted-foreground truncate">{r.email}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className={`grid gap-3 ${allowEmail ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <button
                  onClick={handleCopyRef}
                  className="py-3 rounded-2xl font-bold text-sm text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-all flex items-center justify-center gap-1.5"
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'คัดลอกแล้ว' : 'คัดลอกเลขอ้างอิง'}
                </button>
                {/* ปุ่มส่งอีเมล — ซ่อนทั้งบล็อกถ้า allowEmail=false (ฝั่ง staff ไม่ต้องส่งอีเมล)
                    เงื่อนไข disabled แยกสองแบบ: ฝั่ง CSR (getEmailRecipientsFn) เช็คว่ามีผู้รับ
                    ที่ติ๊กเลือกไว้ไหม ฝั่งลูกค้าเดิมเช็ค customerEmail เหมือนเดิมทุกประการ */}
                {allowEmail && (
                  <button
                    onClick={handleEmailCopy}
                    disabled={emailState === 'sending' || (getEmailRecipientsFn ? selectedEmails.length === 0 : !customerEmail)}
                    className="py-3 rounded-2xl font-bold text-sm text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {emailState === 'sending' && <><Loader2 size={15} className="animate-spin" /> กำลังส่ง…</>}
                    {emailState === 'sent' && <><Check size={15} /> ส่งแล้ว</>}
                    {emailState === 'error' && 'ส่งไม่สำเร็จ ลองใหม่'}
                    {emailState === 'idle' && <><Mail size={15} /> ส่งเข้าอีเมล</>}
                  </button>
                )}
              </div>

              {/* ลิงก์ "ติดตามสถานะคำร้องนี้" — ควบคุมแยกจากปุ่มอีเมลแล้ว ผ่าน showTrackingLink
                  ฝั่งลูกค้า (default true) ยังเห็นเหมือนเดิม ฝั่ง staff (false) ไม่เห็นตามที่ตกลงกันไว้ */}
              {showTrackingLink && (
                <a
                  href={`/customer/tracking?ref=${refId}`}
                  className="text-center text-sm font-bold text-teal-600 hover:text-teal-700 underline underline-offset-2 mt-1 inline-flex items-center justify-center gap-1"
                >
                  ติดตามสถานะคำร้องนี้ <ArrowRight size={14} />
                </a>
              )}
            </div>
          )}

          <button
            onClick={() => (window.location.href = homeHref)}
            className="text-sm font-bold text-muted-foreground hover:text-muted-foreground mt-1"
          >
            กลับหน้าหลัก
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-3">
        ลิงก์ดาวน์โหลดมีอายุ 5 นาทีต่อการกดหนึ่งครั้ง เพื่อความปลอดภัยของข้อมูล — กดดาวน์โหลดใหม่ได้ทุกเมื่อ
      </p>

      {/* ══ โมดัลดูใบรับคืน — เปิดในหน้าเดียวกันแทน window.open()/<a download> เดิม
          (pattern เดียวกับเอกสารยืนยันการลงทะเบียนฝั่ง CSR) ══ */}
      {docModalUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-6 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setDocModalUrl(null)}
        >
          <div
            className="relative w-full max-w-3xl h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
              <h3 className="text-base font-bold text-foreground">ใบรับคืนสินค้า</h3>
              <div className="flex items-center gap-2">
                <a
                  href={docModalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-100 transition-all"
                >
                  <Download size={14} /> เปิดในแท็บใหม่ / ดาวน์โหลด
                </a>
                <button
                  onClick={() => setDocModalUrl(null)}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-slate-100 hover:text-slate-600 transition-all"
                  aria-label="ปิด"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <iframe src={docModalUrl} className="flex-1 w-full" title="ใบรับคืนสินค้า" />
          </div>
        </div>
      )}
    </div>
  );
}