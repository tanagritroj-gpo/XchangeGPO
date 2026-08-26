'use client';

import { useState } from 'react';
import { ClipboardList, Pill, Package, Tag, Calendar, PenLine, ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Check, Camera } from 'lucide-react';
import { ReviewSuccessCard, type PdfActionResult, type EmailActionResult, type OrgContactsResult } from './ReviewSuccessCard';
import type { ReturnFormData } from '../form-types';
import { getErrorMessage } from '@/lib/error-message';
import { useToast } from '@/components/ui/toast';

interface SubmitResult {
  refId?: string;
  id?: number;
  [key: string]: unknown;
}

interface StepProps {
  back:     () => void;
  formData: ReturnFormData;
  onSubmit: () => Promise<SubmitResult>;
  // ── เพิ่มใหม่: ทั้งหมด optional พร้อม default ตรงกับพฤติกรรมเดิมของฝั่งลูกค้าทุกประการ ──
  stepNumber?: number;   // เลขขั้นตอนที่แสดงบน badge — ฝั่งลูกค้า 5 ขั้น, ฝั่ง staff 4 ขั้น (ไม่มี step เซ็น)
  allowEmail?: boolean;  // ส่งต่อไป ReviewSuccessCard ควบคุมปุ่ม "ส่งเข้าอีเมล"
  showTrackingLink?: boolean; // ส่งต่อไป ReviewSuccessCard ควบคุมลิงก์ "ติดตามสถานะคำร้องนี้" แยกจาก allowEmail
  homeHref?: string;     // ส่งต่อไป ReviewSuccessCard ควบคุมปุ่ม "กลับหน้าหลัก"
  generatePdfActionFn?: (requestId: number) => Promise<PdfActionResult>; // override เป็น generateStaffPdfAction ฝั่ง staff
  sendEmailActionFn?: (requestId: number, recipientEmails?: string[]) => Promise<EmailActionResult>;   // override เป็น sendStaffPdfEmailAction ฝั่ง staff
  getEmailRecipientsFn?: (requestId: number) => Promise<OrgContactsResult>; // เฉพาะฝั่ง CSR — getOrgContactsForRequest
}

// ── Helper สำหรับแสดงผลรายการยา ──
const renderExchangeList = (listStr: string) => {
  try {
    const list = JSON.parse(listStr);
    return Array.isArray(list) ? list.join(', ') : listStr;
  } catch {
    return listStr;
  }
};

function ReviewRow({ label, value }: { label: string; value?: string | number }) {
  if (!value) return null;
  return (
    // label:value เดิมวางเคียงข้างแบบคอลัมน์ตายตัว w-32 (128px) ซึ่งพอเจอ label
    // ยาวๆ อย่าง "รูปแบบแลกเปลี่ยน" บนจอมือถือ (375px) จะถูกบีบจนตัดขึ้นบรรทัดใหม่
    // กลางคำ (ภาษาไทยไม่มีช่องว่างให้ตัดคำสวยๆ) ดูไม่ได้สัดส่วนกับ value ที่อยู่บรรทัดเดียว
    // จึงสลับเป็นวางซ้อนกัน (label บน, value ล่าง) บนมือถือ แล้วค่อยเคียงข้างจาก sm: ขึ้นไป
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-3 border-b border-dashed border-slate-100 last:border-0">
      <span className="text-[13px] font-black text-muted-foreground uppercase tracking-widest sm:w-32 sm:shrink-0 pt-0.5 flex items-center gap-1.5">
        <span className="w-1 h-1 rounded-full bg-slate-300" />{label}
      </span>
      <span className="text-base text-slate-800 font-bold flex-1">{value}</span>
    </div>
  );
}

function ReviewCard({ title, gradient, children }: { title: React.ReactNode; gradient: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-md shadow-slate-100/60 overflow-hidden">
      <div className="px-6 py-3.5 font-black text-base text-white flex items-center gap-2" style={{ background: gradient }}>
        {title}
      </div>
      <div className="px-6 py-3">{children}</div>
    </div>
  );
}

export default function ReviewPage({
  back,
  formData,
  onSubmit,
  stepNumber = 5,
  allowEmail = true,
  showTrackingLink = true,
  homeHref = '/welcome',
  generatePdfActionFn,
  sendEmailActionFn,
  getEmailRecipientsFn,
}: StepProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [status,  setStatus]  = useState<'idle' | 'success' | 'error'>('idle');
  const [refId,   setRefId]   = useState('');
  const [currentRequestId, setCurrentRequestId] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    sender, items, totalValue, return_reason, delivery_type,
    addr_street, addr_sub, addr_district, addr_province, agent_info, agent_appointment_note,
    signature_url, signer_name, signer_position, exchange_product_type, exchange_product_list, exchange_product_other,
    deliveryNotePhotoUrls,
  } = formData;

  // ★ ไม่มี step เซ็น (ฝั่ง staff) → signer_name/signer_position ไม่มีค่า
  //   fallback ไปใช้ข้อมูลผู้ติดต่อของลูกค้าที่เลือกไว้ใน sender แทน กันการ์ด "ข้อมูลหน่วยงาน" ขาดชื่อไปเงียบๆ
  const displaySignerName = signer_name || sender?.contact_name || undefined;
  const displaySignerPosition = signer_position || sender?.position || undefined;

  const deliveryDetail = delivery_type === 'ขนส่ง'
    ? `${addr_street || ''} ต.${addr_sub || ''} อ.${addr_district || ''} จ.${addr_province || ''}`
    : agent_info || '-';

  const handleSubmit = async () => {
    setShowConfirm(false);
    setLoading(true);
    try {
      const result = await onSubmit();
      setRefId(result?.refId || 'N/A');
      setCurrentRequestId(result?.id ?? null);
      setStatus('success');
    } catch (error: unknown) {
      console.error("Error:", error);
      toast.error(`บันทึกไม่สำเร็จ: ${getErrorMessage(error)}`);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  // ── ส่วนนี้คือการเช็ค Success แล้วตัดจบด้วย Component ใหม่ ──
if (status === 'success') {
  if (!currentRequestId) {
    return <div className="text-center text-red-500 py-10">เกิดข้อผิดพลาด ไม่พบเลขที่คำร้อง</div>;
  } 
    return (
      <ReviewSuccessCard
        requestId={currentRequestId}
        refId={refId} 
        customerEmail={formData.sender?.email}
        allowEmail={allowEmail}
        showTrackingLink={showTrackingLink}
        homeHref={homeHref}
        generatePdfActionFn={generatePdfActionFn}
        sendEmailActionFn={sendEmailActionFn}
        getEmailRecipientsFn={getEmailRecipientsFn}
      />
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-5">

      {/* Progress hint */}
      <div className="flex items-center gap-2 px-1">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-black">{stepNumber}</span>
        <p className="text-sm font-bold text-muted-foreground">ตรวจสอบข้อมูลก่อนส่งแบบฟอร์ม</p>
      </div>

      {/* ══ ข้อมูลหน่วยงาน ══ */}
      <ReviewCard title={<><ClipboardList size={17} /> ข้อมูลหน่วยงาน</>} gradient="linear-gradient(90deg,#0f5132,#1a7a45)">
        <ReviewRow label="ประเภทรายการ" value={sender?.request_type} />
        <ReviewRow label="หน่วยงาน" value={sender?.hospital_name} />
        <ReviewRow label="ผู้ส่งคืน" value={displaySignerName} />
        <ReviewRow label="ตำแหน่ง" value={displaySignerPosition} />
      </ReviewCard>

      {/* ══ รายการยา ══ */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-md shadow-slate-100/60 overflow-hidden">
        <div className="px-6 py-3.5 font-black text-base text-white flex items-center gap-2" style={{ background: 'linear-gradient(90deg,#be123c,#f43f5e)' }}>
          <Pill size={17} /> รายการยาและเวชภัณฑ์
          <span className="ml-auto bg-white/20 px-2.5 py-0.5 rounded-full text-xs">{items?.length ?? 0} รายการ</span>
        </div>
        <div className="px-6 py-4 flex flex-col gap-2.5">
          {items?.map((d, i: number) => (
            <div key={i} className="flex gap-3 p-3.5 bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-100 hover:border-rose-200 transition-colors duration-150">
              <span className="w-7 h-7 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0 shadow-sm"
                style={{ background: 'linear-gradient(135deg,#be123c,#f43f5e)' }}>
                {i + 1}
              </span>
              <div className="flex-1">
                <p className="font-black text-base text-slate-900">{d.drugName}</p>
                <p className="text-sm text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="inline-flex items-center gap-1"><Package size={13} /> {d.qty} {d.unit}</span>
                  <span className="inline-flex items-center gap-1"><Tag size={13} /> Lot: {d.lot}</span>
                  <span className="inline-flex items-center gap-1"><Calendar size={13} /> Exp: {d.exp}</span>
                </p>
              </div>
            </div>
          ))}
          <div className="flex justify-between items-center pt-3.5 mt-1 border-t-2 border-dashed border-slate-100">
            <span className="text-sm font-black text-muted-foreground uppercase tracking-widest">รวมมูลค่า</span>
            <span className="text-xl font-black text-teal-600">{totalValue?.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</span>
          </div>
        </div>
      </div>

      {/* ══ รูปใบส่งของ — โชว์เฉพาะตอนมีรูปแนบมา (ระดับคำร้อง ไม่ใช่ระดับรายการยา ตามการ์ดใน
          Step2Items.tsx) ให้ลูกค้าตรวจรูปซ้ำก่อนกดส่งจริง เผื่อแนบรูปผิด/เบลอ จะได้ย้อนกลับไป
          แก้ก่อนส่ง ไม่ใช่มารู้ตัวทีหลัง ══ */}
      {deliveryNotePhotoUrls && deliveryNotePhotoUrls.length > 0 && (
        <ReviewCard
          title={<><Camera size={17} /> รูปใบส่งของ<span className="ml-auto bg-white/20 px-2.5 py-0.5 rounded-full text-xs">{deliveryNotePhotoUrls.length} รูป</span></>}
          gradient="linear-gradient(90deg,#1d4ed8,#3b82f6)"
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-2">
            {deliveryNotePhotoUrls.map((url, i) => (
              // base64 data URI จาก canvas compression (Step2Items.tsx) ไม่ใช่ network fetch เหมือนลายเซ็นด้านล่าง
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt={`รูปใบส่งของ ${i + 1}`}
                className="w-full h-28 object-cover rounded-xl border border-slate-100"
              />
            ))}
          </div>
        </ReviewCard>
      )}

      {/* ══ เหตุผลและวิธีส่งคืน ══ */}
      <ReviewCard title={<><Package size={17} /> เหตุผลและวิธีส่งคืน</>} gradient="linear-gradient(90deg,#6d28d9,#9333ea)">
        <ReviewRow label="เหตุผล" value={return_reason} />

        {/* เช็คถ้ามีรายการแลกเปลี่ยนถึงค่อยแสดงผล */}
  {exchange_product_type && (
    <>
      <ReviewRow label="รูปแบบแลกเปลี่ยน" value={exchange_product_type} />
      <ReviewRow 
        label="สินค้าที่ต้องการ" 
        value={exchange_product_type === 'รายการเดิม' 
               ? renderExchangeList(exchange_product_list || '')
               : exchange_product_other} 
      />
    </>
  )}
  
        <ReviewRow label="วิธีส่งคืน" value={delivery_type} />
        <ReviewRow label="รายละเอียด" value={deliveryDetail} />
        <ReviewRow label="วันนัดหมายรับสินค้า" value={agent_appointment_note} />
      </ReviewCard>

      {/* ══ ลายมือชื่อ — โชว์เฉพาะตอนมีค่า (ฝั่ง staff ไม่มี step เซ็น การ์ดนี้จะหายไปเองอัตโนมัติ) ══ */}
      {signature_url && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-md shadow-slate-100/60 overflow-hidden">
          <div className="px-6 py-3.5 font-black text-base text-white flex items-center gap-2" style={{ background: 'linear-gradient(90deg,#b45309,#d97706)' }}>
            <PenLine size={17} /> ลายมือชื่อผู้ส่งคืน
          </div>
          <div className="px-6 py-6 flex flex-col items-center gap-2">
            <div className="bg-gradient-to-br from-slate-50 to-amber-50/30 rounded-2xl border-2 border-dashed border-amber-100 px-8 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- signature_url คือ
                  base64 data URI จาก canvas.toDataURL() (Step4Sign.tsx) ไม่ใช่ network fetch
                  next/image ไม่มีประโยชน์ตรงนี้ (ไม่มี request ให้ optimize) แถมต้องบังคับ
                  width/height ทั้งที่ลายเซ็นแต่ละคนสัดส่วนไม่เท่ากัน */}
              <img src={signature_url} alt="ลายเซ็น" className="max-h-20" />
            </div>
            <div className="text-center mt-2 border-t border-slate-100 pt-3 w-full">
              <p className="text-base font-black text-slate-800">({signer_name})</p>
              <p className="text-sm text-muted-foreground font-medium">{signer_position}</p>
            </div>
          </div>
        </div>
      )}

      {/* ══ Navigation ══ */}
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={back}
          disabled={loading}
          className="group py-4 rounded-2xl font-black text-base text-muted-foreground bg-white border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform duration-200" /> ย้อนกลับ
        </button>
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={loading}
          className="py-4 rounded-2xl font-black text-white text-base transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed hover:-translate-y-0.5 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)', boxShadow: loading ? 'none' : '0 10px 25px -8px rgba(26,122,69,0.45)' }}
        >
          {loading
            ? <><Loader2 size={16} className="animate-spin" /> กำลังบันทึก...</>
            : <><CheckCircle2 size={16} /> ยืนยันและส่งแบบฟอร์ม</>
          }
        </button>
      </div>

      {/* ══ Confirm Modal ══ */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            {/* top accent */}
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg,#d97706,#f59e0b)' }} />

            <div className="p-7 text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-md text-amber-600"
                style={{ background: 'linear-gradient(135deg,#fef3c7,#fde68a)' }}
              ><AlertTriangle size={28} /></div>

              <h3 className="text-lg font-black text-slate-800 mb-2">ยืนยันการส่งแบบฟอร์ม</h3>
              <p className="text-base text-muted-foreground leading-relaxed mb-6">
                โปรดตรวจสอบข้อมูลก่อนกดยืนยัน<br />
                <span className="font-bold text-rose-600">หากส่งข้อมูลแล้วจะไม่สามารถแก้ไขข้อมูลเองได้</span>
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="py-3.5 rounded-2xl font-black text-base text-muted-foreground bg-slate-50 border-2 border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] inline-flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft size={15} /> ย้อนกลับ
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="py-3.5 rounded-2xl font-black text-base text-white transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 inline-flex items-center justify-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)', boxShadow: '0 8px 20px -6px rgba(26,122,69,0.45)' }}
                >
                  <Check size={15} strokeWidth={3} /> ยืนยัน
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}