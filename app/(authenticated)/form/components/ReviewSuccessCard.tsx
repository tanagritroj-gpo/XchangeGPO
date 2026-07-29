'use client';

import { useEffect, useState } from 'react';
import { generatePdfAction } from '@/app/actions/generate-pdf-action';
import { sendPdfEmailAction } from '@/app/actions/send-pdf-email-action'; 

type PdfState = 'preparing' | 'ready' | 'error';
type PdfActionResult = { success: true; url: string; expiresIn: number; refId: string; docNumber: string | null } | { success: false; error: string };
type EmailActionResult = { success: boolean; message?: string; error?: string };

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
  sendEmailActionFn?: (requestId: number) => Promise<EmailActionResult>;
}) {
  const [pdfState, setPdfState] = useState<PdfState>('preparing');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copyLabel, setCopyLabel] = useState('คัดลอกเลขอ้างอิง');
  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // 1. เตรียมเอกสารอัตโนมัติทันทีที่โหลดหน้าจอ
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await generatePdfActionFn(requestId);
      if (cancelled) return;

      if (result.success) {
        setDownloadUrl(result.url);
        setPdfState('ready');
      } else {
        setErrorMsg(result.error);
        setPdfState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  // 2. ฟังก์ชันลองสร้าง PDF ใหม่กรณี Error
  const retryGenerate = async () => {
    setPdfState('preparing');
    setErrorMsg('');
    const result = await generatePdfActionFn(requestId);
    if (result.success) {
      setDownloadUrl(result.url);
      setPdfState('ready');
    } else {
      setErrorMsg(result.error);
      setPdfState('error');
    }
  };

  // 3. ฟังก์ชันดาวน์โหลด (ขอ URL ใหม่เสมอ ป้องกันลิงก์หมดอายุ 5 นาที)
  const handleDownload = async () => {
    const fresh = await generatePdfActionFn(requestId);
    if (!fresh.success) {
      setErrorMsg(fresh.error);
      setPdfState('error');
      return;
    }
    const a = document.createElement('a');
    a.href = fresh.url;
    a.download = `FM-AJJ0-008_${refId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // 4. ฟังก์ชันคัดลอกเลข Ref
  const handleCopyRef = async () => {
    await navigator.clipboard.writeText(refId);
    setCopyLabel('คัดลอกแล้ว ✓');
    setTimeout(() => setCopyLabel('คัดลอกเลขอ้างอิง'), 2000);
  };

  // 5. ฟังก์ชันส่งอีเมล
  const handleEmailCopy = async () => {
    setEmailState('sending');
    const result = await sendEmailActionFn(requestId);
    
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
            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-lg"
            style={{ background: 'linear-gradient(135deg,#d1fae5,#99f6e4)' }}
          >
            {pdfState === 'error' ? '⚠️' : '✅'}
          </div>

          <div>
            <h2 className="text-xl font-black text-slate-900 mb-1.5">ส่งแบบฟอร์มสำเร็จ!</h2>
            <p className="text-sm text-muted-foreground">บันทึกคำร้องของท่านเรียบร้อยแล้ว</p>
          </div>

          <div className="bg-teal-50 border-2 border-teal-200 rounded-2xl px-10 py-5 w-full">
            <p className="text-[11px] font-black text-teal-600 uppercase tracking-widest mb-1.5">
              เลขที่อ้างอิง
            </p>
            <p className="text-2xl font-black text-teal-700 font-mono">{refId}</p>
            {docNumber && <p className="text-xs text-muted-foreground mt-1 font-mono">เอกสารเลขที่ {docNumber}</p>}
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
                <span className={`text-[9px] font-bold ${i === 0 ? 'text-teal-600' : 'text-slate-300'}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {/* ── ส่วนแสดงสถานะ PDF ── */}
          {pdfState === 'preparing' && (
            <div className="w-full py-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center gap-2 text-sm font-bold text-muted-foreground">
              <span className="animate-spin">⏳</span> กำลังจัดเตรียมเอกสาร…
            </div>
          )}

          {pdfState === 'error' && (
            <div className="w-full py-4 px-4 rounded-2xl bg-rose-50 border border-rose-200 text-sm font-bold text-rose-600 flex flex-col items-center gap-2">
              <span>{errorMsg}</span>
              <button
                onClick={retryGenerate}
                className="text-xs font-black text-rose-700 underline underline-offset-2"
              >
                ลองสร้างเอกสารอีกครั้ง
              </button>
            </div>
          )}

          {pdfState === 'ready' && (
            <div className="grid grid-cols-1 gap-3 w-full">
              <button
                onClick={handleDownload}
                className="py-4 rounded-2xl font-black text-sm text-teal-700 bg-teal-100 border-2 border-teal-200 hover:bg-teal-200 transition-all flex items-center justify-center gap-2"
              >
                📥 ดาวน์โหลดใบรับคืน (PDF)
              </button>

              <div className={`grid gap-3 ${allowEmail ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <button
                  onClick={handleCopyRef}
                  className="py-3 rounded-2xl font-bold text-xs text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-all"
                >
                  📋 {copyLabel}
                </button>
                {/* ปุ่มส่งอีเมล — ซ่อนทั้งบล็อกถ้า allowEmail=false (ฝั่ง staff ไม่ต้องส่งอีเมล) */}
                {allowEmail && (
                  <button
                    onClick={handleEmailCopy}
                    disabled={emailState === 'sending' || !customerEmail}
                    className="py-3 rounded-2xl font-bold text-xs text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-all disabled:opacity-50"
                  >
                    {emailState === 'sending' && '⏳ กำลังส่ง…'}
                    {emailState === 'sent' && '✓ ส่งแล้ว'}
                    {emailState === 'error' && 'ส่งไม่สำเร็จ ลองใหม่'}
                    {emailState === 'idle' && '✉️ ส่งเข้าอีเมล'}
                  </button>
                )}
              </div>

              {/* ลิงก์ "ติดตามสถานะคำร้องนี้" — ควบคุมแยกจากปุ่มอีเมลแล้ว ผ่าน showTrackingLink
                  ฝั่งลูกค้า (default true) ยังเห็นเหมือนเดิม ฝั่ง staff (false) ไม่เห็นตามที่ตกลงกันไว้ */}
              {showTrackingLink && (
                <a
                  href={`/customer/tracking?ref=${refId}`}
                  className="text-center text-xs font-bold text-teal-600 hover:text-teal-700 underline underline-offset-2 mt-1"
                >
                  ติดตามสถานะคำร้องนี้ →
                </a>
              )}
            </div>
          )}

          <button
            onClick={() => (window.location.href = homeHref)}
            className="text-xs font-bold text-muted-foreground hover:text-muted-foreground mt-1"
          >
            กลับหน้าหลัก
          </button>
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground mt-3">
        ลิงก์ดาวน์โหลดมีอายุ 5 นาทีต่อการกดหนึ่งครั้ง เพื่อความปลอดภัยของข้อมูล — กดดาวน์โหลดใหม่ได้ทุกเมื่อ
      </p>
    </div>
  );
}