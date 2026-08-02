'use client';

import { useState, useEffect } from 'react';
import { ReceiptText, AlertTriangle, ArrowLeftRight, MoreHorizontal } from 'lucide-react';
import { getNextDocNumber } from '@/app/actions/form-actions';
import { getCustomerSession } from '@/app/actions/auth-actions';
import type { ReturnFormData, CustomerSessionInfo } from '../form-types';

interface Step1Props {
  next: () => void;
  updateData: React.Dispatch<React.SetStateAction<ReturnFormData>>;
  initialRequestType?: string;
}

const TYPES = [
  { label: 'รับคืนลดหนี้',     icon: <ReceiptText size={24} className="text-emerald-600" /> },
  { label: 'รับคืน CCR',    icon: <AlertTriangle size={24} className="text-red-600" /> },
  { label: 'รับคืนแลกเปลี่ยน', icon: <ArrowLeftRight size={24} className="text-blue-600" /> },
  { label: 'อื่นๆ',            icon: <MoreHorizontal size={24} className="text-muted-foreground" /> },
] as const;

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest block mb-2 flex items-center gap-1.5">
    <span className="w-1 h-1 rounded-full bg-slate-300" />
    {children}
  </label>
);

const InfoBox = ({ children }: { children: React.ReactNode }) => (
  <div className="px-4 py-3 rounded-xl bg-slate-50 text-slate-700 font-bold text-sm border border-slate-100">
    {children}
  </div>
);

export default function Step1Info({ next, updateData, initialRequestType }: Step1Props) {
  const [selectedType, setSelectedType] = useState(initialRequestType || '');
  const [otherDetail, setOtherDetail] = useState('');
  const [today, setToday] = useState('');
  const [docNumber, setDocNumber] = useState('กำลังโหลด...');
  const [clientData, setClientData] = useState<CustomerSessionInfo | null>(null);

  useEffect(() => {
    const init = async () => {
      const session = await getCustomerSession();
      if (!session) {
        setDocNumber('กรุณาเข้าสู่ระบบใหม่');
        return;
      } 

      // ★ session ที่ verify แล้วมีข้อมูลครบอยู่แล้ว ไม่ต้อง query ซ้ำจาก browser
      setClientData(session);

      try {
        const nextDoc = await getNextDocNumber();
        setDocNumber(nextDoc);
      } catch (err) {
        console.error("Failed to load doc number:", err);
        setDocNumber('Error');
      }
    };
    
    init();
    setToday(new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);

  const handleNext = async () => {
    if (!selectedType) return alert('กรุณาเลือกประเภทรายการ');
    if (selectedType === 'อื่นๆ' && !otherDetail.trim()) return alert('กรุณาระบุรายละเอียดเพิ่มเติม');
    const latestDocNumber = await getNextDocNumber();
    updateData((prev) => ({
      ...prev,
      sender: {
        ...prev.sender,
        doc_number: latestDocNumber,
        request_type: selectedType,
        return_reason: selectedType === 'อื่นๆ' ? otherDetail : selectedType,
        hospital_name: clientData?.hospital_name,
        contact_name: clientData?.contact_name,
        position: clientData?.position,
        phone: clientData?.phone,
        customer_email: clientData?.email,
        b2b_customer_id: clientData?.id,
      },
    }));
    next();
  };

  return (
    <div className="space-y-6 font-sarabun max-w-3xl mx-auto">

      {/* Progress hint */}
      <div className="flex items-center gap-2 px-1">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-600 text-white text-[11px] font-black">1</span>
        <p className="text-xs font-bold text-muted-foreground">ข้อมูลรายการและผู้ประสานงาน</p>
      </div>

      {/* ══ ประเภทการส่งคืน ══ */}
      <div className="relative bg-white rounded-3xl border border-slate-100 shadow-md shadow-slate-100/60 p-5 sm:p-7 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: 'linear-gradient(90deg,#0f5132,#1a7a45,#2dd4bf)' }} />

        <h2 className="text-sm font-black text-slate-800 mb-5 sm:mb-6 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-sm" style={{ background: 'linear-gradient(135deg,#d1fae5,#99f6e4)' }}>📦</div>
          ประเภทการส่งคืน
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          {TYPES.map((t) => {
            const active = selectedType === t.label;
            return (
              <button
                key={t.label}
                type="button"
                onClick={() => setSelectedType(t.label)}
                className={`relative flex flex-col items-center gap-3 py-5 sm:py-6 px-2 rounded-2xl border-2 transition-all duration-200 active:scale-95 min-h-[88px] sm:min-h-0
                  ${active
                    ? 'border-teal-500 bg-gradient-to-br from-teal-50 to-emerald-50 shadow-lg shadow-teal-100 -translate-y-0.5'
                    : 'border-transparent bg-slate-50 hover:bg-slate-100 hover:-translate-y-0.5'}`}
              >
                {active && (
                  <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-teal-500 text-white text-[9px] flex items-center justify-center font-black">✓</span>
                )}
                <span className={`transition-transform duration-200 ${active ? 'scale-110' : ''}`}>{t.icon}</span>
                <span className={`text-[12px] font-black text-center leading-tight ${active ? 'text-teal-700' : 'text-muted-foreground'}`}>{t.label}</span>
              </button>
            );
          })}
        </div>

        {selectedType === 'อื่นๆ' && (
          <div className="mb-5 sm:mb-6 animate-in fade-in slide-in-from-top-2 duration-200">
            <FieldLabel>ระบุรายละเอียดเพิ่มเติม</FieldLabel>
            <input
              type="text"
              value={otherDetail}
              onChange={(e) => setOtherDetail(e.target.value)}
              placeholder="โปรดระบุสาเหตุการส่งคืน..."
              className="w-full px-5 py-3.5 rounded-xl bg-slate-50 text-slate-700 font-bold text-sm border-2 border-slate-100 focus:bg-white focus:border-teal-400 focus:ring-4 focus:ring-teal-50 outline-none transition-all duration-200"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 pt-1">
          <div>
            <FieldLabel>เลขที่เอกสาร</FieldLabel>
            <InfoBox><span className="inline-flex items-center gap-1.5"><span className="text-teal-500">📄</span>{docNumber}</span></InfoBox>
          </div>
          <div>
            <FieldLabel>วันที่ทำรายการ</FieldLabel>
            <InfoBox><span className="inline-flex items-center gap-1.5"><span className="text-teal-500">📅</span>{today}</span></InfoBox>
          </div>
        </div>
      </div>

      {/* ══ ข้อมูลผู้ประสานงาน ══ */}
      <div className="relative bg-white rounded-3xl border border-slate-100 shadow-md shadow-slate-100/60 p-5 sm:p-7 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: 'linear-gradient(90deg,#1a5c96,#1a7a45,#0f5132)' }} />

        <h2 className="text-sm font-black text-slate-800 mb-5 sm:mb-6 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-sm" style={{ background: 'linear-gradient(135deg,#dbeafe,#bfdbfe)' }}>👤</div>
          ข้อมูลผู้ประสานงาน
          {!clientData && <span className="ml-auto text-[10px] font-bold text-slate-300 animate-pulse">กำลังโหลด...</span>}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 sm:gap-y-5">
          <div className="sm:col-span-2">
            <FieldLabel>ชื่อหน่วยงาน (โรงพยาบาล)</FieldLabel>
            <InfoBox>{clientData?.hospital_name || '...'}</InfoBox>
          </div>
          <div>
            <FieldLabel>ชื่อ-นามสกุล ผู้ประสานงาน</FieldLabel>
            <InfoBox>{clientData?.contact_name || '-'}</InfoBox>
          </div>
          <div>
            <FieldLabel>ตำแหน่ง</FieldLabel>
            <InfoBox>{clientData?.position || '-'}</InfoBox>
          </div>
          <div>
            <FieldLabel>เบอร์โทรศัพท์</FieldLabel>
            <InfoBox><span className="inline-flex items-center gap-1.5">📞 {clientData?.phone || '-'}</span></InfoBox>
          </div>
          <div>
            <FieldLabel>อีเมล</FieldLabel>
            <InfoBox><span className="inline-flex items-center gap-1.5">✉️ {clientData?.email || '-'}</span></InfoBox>
          </div>
        </div>
      </div>

      {/* ══ ปุ่มดำเนินการต่อ ══ */}
      <button
        onClick={handleNext}
        disabled={!selectedType}
        className={`group w-full py-4 rounded-2xl font-black text-white text-sm shadow-xl transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 hover:shadow-2xl ${
          !selectedType ? 'opacity-50 cursor-not-allowed grayscale' : 'opacity-100'
        }`}
        style={{
          background: 'linear-gradient(135deg,#0f5132 0%,#1a7a45 60%,#16a085 100%)',
          boxShadow: '0 12px 28px -8px rgba(26,122,69,0.45)',
        }}
      >
        <span className="flex items-center justify-center gap-2">
          ดำเนินการต่อ
          <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
        </span>
      </button>
    </div>
  );
}