'use client';

import { useState } from 'react';

interface StepProps {
  back:     () => void;
  formData: any;
  onSubmit: () => Promise<any>;
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

function SectionTitle({ icon, children }: { icon?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-sm" style={{ background: 'linear-gradient(135deg,#d1fae5,#99f6e4)' }}>
        {icon ?? '📋'}
      </div>
      <span className="text-sm font-black text-slate-800">{children}</span>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string | number }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-dashed border-slate-100 last:border-0">
      <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest w-32 shrink-0 pt-0.5 flex items-center gap-1.5">
        <span className="w-1 h-1 rounded-full bg-slate-300" />{label}
      </span>
      <span className="text-sm text-slate-800 font-bold flex-1">{value}</span>
    </div>
  );
}

function ReviewCard({ title, gradient, children }: { title: string; gradient: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-md shadow-slate-100/60 overflow-hidden">
      <div className="px-6 py-3.5 font-black text-sm text-white flex items-center gap-2" style={{ background: gradient }}>
        {title}
      </div>
      <div className="px-6 py-3">{children}</div>
    </div>
  );
}

export default function ReviewPage({ back, formData, onSubmit }: StepProps) {
  const [loading, setLoading] = useState(false);
  const [status,  setStatus]  = useState<'idle' | 'success' | 'error'>('idle');
  const [refId,   setRefId]   = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    sender, items, totalValue, return_reason, delivery_type,
    addr_street, addr_sub, addr_district, addr_province, agent_info,
    signature_url, signer_name, signer_position, exchange_product_type, exchange_product_list, exchange_product_other 
  } = formData;

  const deliveryDetail = delivery_type === 'ขนส่ง'
    ? `${addr_street || ''} ต.${addr_sub || ''} อ.${addr_district || ''} จ.${addr_province || ''}`
    : agent_info || '-';

  const handleSubmit = async () => {
    setShowConfirm(false);
    setLoading(true);
    try {
      const result = await onSubmit();
      setRefId(result?.refId || 'N/A');
      setStatus('success');
    } catch (error: any) {
      console.error("Error:", error);
      alert("บันทึกไม่สำเร็จ: " + (error?.message || "กรุณาติดต่อเจ้าหน้าที่"));
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  // ── Success state ──
  if (status === 'success') {
    return (
      <div className="w-full max-w-lg mx-auto flex flex-col items-center justify-center gap-6 py-16 px-8 text-center bg-white rounded-3xl shadow-xl border border-slate-100 relative overflow-hidden">
        {/* decorative confetti circles */}
        <div className="absolute top-6 left-8 w-3 h-3 rounded-full bg-teal-200 opacity-60" />
        <div className="absolute top-12 right-10 w-2 h-2 rounded-full bg-emerald-300 opacity-60" />
        <div className="absolute bottom-10 left-12 w-2.5 h-2.5 rounded-full bg-teal-300 opacity-50" />
        <div className="absolute bottom-16 right-8 w-2 h-2 rounded-full bg-emerald-200 opacity-50" />

        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-lg animate-in zoom-in duration-300"
          style={{ background: 'linear-gradient(135deg,#d1fae5,#99f6e4)', boxShadow: '0 10px 25px -8px rgba(16,185,129,0.4)' }}
        >✅</div>
        <div>
          <h2 className="text-xl font-black text-slate-900 mb-1.5">ส่งแบบฟอร์มสำเร็จ!</h2>
          <p className="text-sm text-slate-500">ระบบได้รับข้อมูลและรอดำเนินการตรวจสอบ</p>
        </div>
        <div className="bg-gradient-to-br from-teal-50 to-emerald-50 border-2 border-teal-200 rounded-2xl px-10 py-5 shadow-sm">
          <p className="text-[11px] font-black text-teal-600 uppercase tracking-widest mb-1.5">เลขที่อ้างอิง</p>
          <p className="text-2xl font-black text-teal-700 font-mono tracking-wide">{refId}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-5">

      {/* Progress hint */}
      <div className="flex items-center gap-2 px-1">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-600 text-white text-[11px] font-black">5</span>
        <p className="text-xs font-bold text-slate-400">ตรวจสอบข้อมูลก่อนส่งแบบฟอร์ม</p>
      </div>

      {/* ══ ข้อมูลหน่วยงาน ══ */}
      <ReviewCard title="📋 ข้อมูลหน่วยงาน" gradient="linear-gradient(90deg,#0f5132,#1a7a45)">
        <ReviewRow label="ประเภทรายการ" value={sender?.request_type} />
        <ReviewRow label="หน่วยงาน" value={sender?.hospital_name} />
        <ReviewRow label="ผู้ส่งคืน" value={signer_name} />
        <ReviewRow label="ตำแหน่ง" value={signer_position} />
      </ReviewCard>

      {/* ══ รายการยา ══ */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-md shadow-slate-100/60 overflow-hidden">
        <div className="px-6 py-3.5 font-black text-sm text-white flex items-center gap-2" style={{ background: 'linear-gradient(90deg,#be123c,#f43f5e)' }}>
          💊 รายการยาและเวชภัณฑ์
          <span className="ml-auto bg-white/20 px-2.5 py-0.5 rounded-full text-[11px]">{items?.length ?? 0} รายการ</span>
        </div>
        <div className="px-6 py-4 flex flex-col gap-2.5">
          {items?.map((d: any, i: number) => (
            <div key={i} className="flex gap-3 p-3.5 bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-100 hover:border-rose-200 transition-colors duration-150">
              <span className="w-7 h-7 rounded-lg text-white text-[11px] font-black flex items-center justify-center shrink-0 shadow-sm"
                style={{ background: 'linear-gradient(135deg,#be123c,#f43f5e)' }}>
                {i + 1}
              </span>
              <div className="flex-1">
                <p className="font-black text-sm text-slate-900">{d.drugName}</p>
                <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>📦 {d.qty} {d.unit}</span>
                  <span>🏷️ Lot: {d.lot}</span>
                  <span>📅 Exp: {d.exp}</span>
                </p>
              </div>
            </div>
          ))}
          <div className="flex justify-between items-center pt-3.5 mt-1 border-t-2 border-dashed border-slate-100">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">รวมมูลค่า</span>
            <span className="text-xl font-black text-teal-600">{(totalValue || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿</span>
          </div>
        </div>
      </div>

      {/* ══ เหตุผลและวิธีส่งคืน ══ */}
      <ReviewCard title="📦 เหตุผลและวิธีส่งคืน" gradient="linear-gradient(90deg,#6d28d9,#9333ea)">
        <ReviewRow label="เหตุผล" value={return_reason} />

        {/* เช็คถ้ามีรายการแลกเปลี่ยนถึงค่อยแสดงผล */}
  {exchange_product_type && (
    <>
      <ReviewRow label="รูปแบบแลกเปลี่ยน" value={exchange_product_type} />
      <ReviewRow 
        label="สินค้าที่ต้องการ" 
        value={exchange_product_type === 'รายการเดิม' 
               ? renderExchangeList(exchange_product_list) 
               : exchange_product_other} 
      />
    </>
  )}
  
        <ReviewRow label="วิธีส่งคืน" value={delivery_type} />
        <ReviewRow label="รายละเอียด" value={deliveryDetail} />
      </ReviewCard>

      {/* ══ ลายมือชื่อ ══ */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-md shadow-slate-100/60 overflow-hidden">
        <div className="px-6 py-3.5 font-black text-sm text-white flex items-center gap-2" style={{ background: 'linear-gradient(90deg,#b45309,#d97706)' }}>
          ✍️ ลายมือชื่อผู้ส่งคืน
        </div>
        <div className="px-6 py-6 flex flex-col items-center gap-2">
          {signature_url && (
            <>
              <div className="bg-gradient-to-br from-slate-50 to-amber-50/30 rounded-2xl border-2 border-dashed border-amber-100 px-8 py-4">
                <img src={signature_url} alt="ลายเซ็น" className="max-h-20" />
              </div>
              <div className="text-center mt-2 border-t border-slate-100 pt-3 w-full">
                <p className="text-sm font-black text-slate-800">({signer_name})</p>
                <p className="text-xs text-slate-500 font-medium">{signer_position}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ══ Navigation ══ */}
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={back}
          disabled={loading}
          className="group py-4 rounded-2xl font-black text-sm text-slate-500 bg-white border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <span className="group-hover:-translate-x-1 transition-transform duration-200">←</span> ย้อนกลับ
        </button>
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={loading}
          className="py-4 rounded-2xl font-black text-white text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed hover:-translate-y-0.5 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)', boxShadow: loading ? 'none' : '0 10px 25px -8px rgba(26,122,69,0.45)' }}
        >
          {loading
            ? <><span className="animate-spin">⏳</span> กำลังบันทึก...</>
            : <>✅ ยืนยันและส่งแบบฟอร์ม</>
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
                className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 shadow-md"
                style={{ background: 'linear-gradient(135deg,#fef3c7,#fde68a)' }}
              >⚠️</div>

              <h3 className="text-lg font-black text-slate-800 mb-2">ยืนยันการส่งแบบฟอร์ม</h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-6">
                โปรดตรวจสอบข้อมูลก่อนกดยืนยัน<br />
                <span className="font-bold text-rose-600">หากส่งข้อมูลแล้วจะไม่สามารถแก้ไขข้อมูลเองได้</span>
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="py-3.5 rounded-2xl font-black text-sm text-slate-500 bg-slate-50 border-2 border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-all duration-200 active:scale-[0.98]"
                >
                  ← ย้อนกลับ
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="py-3.5 rounded-2xl font-black text-sm text-white transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5"
                  style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)', boxShadow: '0 8px 20px -6px rgba(26,122,69,0.45)' }}
                >
                  ✓ ยืนยัน
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}