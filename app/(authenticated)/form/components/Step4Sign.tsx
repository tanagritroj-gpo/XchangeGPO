'use client';

import { useRef, useEffect, useState } from 'react';
import type { ReturnFormData } from '../form-types';

interface StepProps {
  next:        () => void;
  back:        () => void;
  updateData:  React.Dispatch<React.SetStateAction<ReturnFormData>>;
  formData:    ReturnFormData;
}

type CanvasPointerEvent = React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>;

const inputCls = 'w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-white text-base text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all duration-200 placeholder:text-slate-300';

function SectionTitle({ icon, children }: { icon?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-6">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base shadow-sm" style={{ background: 'linear-gradient(135deg,#d1fae5,#99f6e4)' }}>
        {icon ?? '✍️'}
      </div>
      <span className="text-base font-black text-slate-800">{children}</span>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[13px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
      <span className="w-1 h-1 rounded-full bg-slate-300" />
      {children}
    </label>
  );
}

// ── SignaturePad: stable, high-DPI aware ────────────────────────────────────
function SignaturePad({ canvasRef, isEmpty, setIsEmpty }: {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isEmpty: boolean;
  setIsEmpty: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // ── Setup canvas with correct pixel ratio (runs once on mount) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = wrapper.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#0f5132';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    setReady(true);
  }, [canvasRef]); // ← canvasRef เป็น ref stable ข้ามการ re-render อยู่แล้ว (useRef ที่ parent),
  // ใส่ในนี้แค่ให้ผ่าน exhaustive-deps ไม่ได้ทำให้รันซ้ำ ยังรันครั้งเดียวตอน mount เท่านั้น

  const getPos = (e: CanvasPointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const point = 'touches' in e ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };

  const startDraw = (e: CanvasPointerEvent) => {
    if (!ready) return;
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
    setIsEmpty(false);
  };

  const draw = (e: CanvasPointerEvent) => {
    if (!drawing.current || !lastPos.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };

  const stopDraw = () => { drawing.current = false; lastPos.current = null; };

  return (
    <div
      ref={wrapperRef}
      className="relative w-full h-52 rounded-2xl border-2 border-dashed border-teal-200 bg-gradient-to-br from-slate-50 to-teal-50/30 overflow-hidden transition-colors duration-200 hover:border-teal-300"
    >
      {/* subtle baseline guide */}
      <div className="absolute left-6 right-6 bottom-10 h-px bg-teal-100 pointer-events-none" />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
        style={{ touchAction: 'none' }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />

      {isEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-teal-300 gap-2">
          <span className="text-2xl">✍️</span>
          <span className="text-base font-bold">ลงลายเซ็นที่นี่</span>
          <span className="text-xs text-teal-200 font-medium">ใช้เมาส์หรือนิ้วลากเพื่อเซ็นชื่อ</span>
        </div>
      )}
    </div>
  );
}

export default function Step4Signature({ next, back, updateData, formData }: StepProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const [isEmpty, setIsEmpty] = useState(true);

  const [fullname, setFullname] = useState(formData?.sender?.contact_name || '');
  const [position, setPosition] = useState(formData?.sender?.position || '');
  const [pdpa, setPdpa] = useState(false);

  const canProceed = !isEmpty && fullname.trim().length > 0 && pdpa;

  const clearSig = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setIsEmpty(true);
  };

  const handleNext = () => {
    if (isEmpty) return alert('กรุณาลงลายเซ็นก่อนครับ');
    if (!fullname.trim()) return alert('กรุณาระบุชื่อผู้ลงนาม');
    if (!pdpa) return alert('กรุณายินยอม PDPA');

    const sigDataUrl = canvasRef.current!.toDataURL('image/png');

    updateData((prev) => ({
      ...prev,
      signature_url: sigDataUrl,
      signer_name: fullname,
      signer_position: position
    }));
    next();
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-6">

      {/* Progress hint */}
      <div className="flex items-center gap-2 px-1">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-black">4</span>
        <p className="text-sm font-bold text-muted-foreground">ยืนยันข้อมูลและลงนาม</p>
      </div>

      {/* ══ ลายเซ็น + ข้อมูลผู้ลงนาม ══ */}
      <div className="relative bg-white rounded-3xl border border-slate-100 shadow-md shadow-slate-100/60 p-7 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: 'linear-gradient(90deg,#0f5132,#1a7a45,#2dd4bf)' }} />

        <SectionTitle icon="✍️">ยืนยันข้อมูลและลงนาม</SectionTitle>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <FieldLabel>ลายมือชื่อผู้ส่งคืน *</FieldLabel>
            {!isEmpty && (
              <button
                type="button"
                onClick={clearSig}
                className="flex items-center gap-1 text-sm font-bold text-red-400 hover:text-red-600 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-all duration-150 active:scale-95"
              >
                🗑️ ล้างลายเซ็น
              </button>
            )}
          </div>
          <SignaturePad canvasRef={canvasRef} isEmpty={isEmpty} setIsEmpty={setIsEmpty} />
          {!isEmpty && (
            <p className="text-xs text-teal-600 font-bold flex items-center gap-1.5 mt-1">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-teal-500 text-white text-[11px]">✓</span>
              ลงลายเซ็นต์เรียบร้อยแล้ว
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <div className="flex flex-col gap-1.5">
            <FieldLabel>ชื่อ-นามสกุล ผู้ส่งคืน *</FieldLabel>
            <input value={fullname} onChange={e => setFullname(e.target.value)} placeholder="ชื่อ-นามสกุล" className={inputCls} />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>ตำแหน่ง</FieldLabel>
            <input value={position} onChange={e => setPosition(e.target.value)} placeholder="ตำแหน่ง" className={inputCls} />
          </div>
        </div>
      </div>

      {/* ══ PDPA Consent ══ */}
      <label className={`group flex items-start gap-4 p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200 ${
        pdpa ? 'border-teal-400 bg-teal-50 shadow-sm' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
      }`}>
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-black shrink-0 mt-0.5 transition-all duration-200 ${
          pdpa ? 'bg-teal-600 scale-105' : 'bg-white border-2 border-slate-300'
        }`}>
          {pdpa && '✓'}
        </div>
        <input type="checkbox" checked={pdpa} onChange={e => setPdpa(e.target.checked)} className="hidden" />
        <p className="text-base text-slate-600 leading-relaxed">
          <span className="mr-1">🔒</span>
          ข้าพเจ้ายินยอมให้ <span className="font-black text-slate-800">องค์การเภสัชกรรม (GPO)</span> จัดเก็บข้อมูลตามนโยบายคุ้มครองข้อมูลส่วนบุคคล
        </p>
      </label>

      {/* ══ Navigation ══ */}
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={back}
          className="group py-4 rounded-2xl font-black text-base text-muted-foreground bg-white border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <span className="group-hover:-translate-x-1 transition-transform duration-200">←</span> ย้อนกลับ
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!canProceed}
          className="group py-4 rounded-2xl font-black text-white text-base transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)', boxShadow: canProceed ? '0 10px 25px -8px rgba(26,122,69,0.45)' : 'none', opacity: canProceed ? 1 : 0.5, cursor: canProceed ? 'pointer' : 'not-allowed' }}
        >
          ตรวจสอบและยืนยัน <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
        </button>
      </div>
    </div>
  );
}