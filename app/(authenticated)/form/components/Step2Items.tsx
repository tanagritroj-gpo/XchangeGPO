'use client';

import { useState, useRef } from 'react';

// ── Types & Constants ──────────────────────────────────────────────────────
interface StepProps {
  next:       () => void;
  back:       () => void;
  updateData: React.Dispatch<React.SetStateAction<any>>;
  formData:   any;
}

const UNITS = ['แผง', 'กล่อง', 'ขวด', 'amp', 'ลัง'] as const;
const MAX   = 5;

// ── Shared field style ──────────────────────────────────────────────────────
const fieldStyle = "w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:border-teal-400 focus:ring-4 focus:ring-teal-50 outline-none transition-all duration-200";

const selectStyle = "w-full pl-4 pr-10 py-3 rounded-xl border-2 border-slate-100 bg-white text-sm font-medium text-slate-700 focus:border-teal-400 focus:ring-4 focus:ring-teal-50 outline-none transition-all duration-200 cursor-pointer appearance-none";

// ── Custom Select wrapper (with chevron icon) ───────────────────────────────
function SelectField({ value, onChange, children, placeholder }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`${selectStyle} ${!value ? 'text-slate-400' : ''}`}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs transition-transform">▾</span>
    </div>
  );
}

// ── DrugCard ───────────────────────────────────────────────────────────────
function DrugCard({ item, index, onRemove }: { item: any; index: number; onRemove: () => void }) {
  return (
    <div className="group relative flex bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
      <div className="w-1.5 shrink-0" style={{ background: 'linear-gradient(180deg,#0f5132,#2dd4bf)' }} />
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg text-white text-[11px] font-black flex items-center justify-center shrink-0 shadow-sm"
              style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)' }}>
              {index + 1}
            </span>
            <span className="font-black text-slate-800 text-sm">{item.drugName}</span>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-red-400 hover:text-white hover:bg-red-500 transition-all duration-150 active:scale-90"
          >✕</button>
        </div>
        
        {/* รายละเอียดด้านล่างยังคงเดิม แต่ดูสะอาดตาขึ้นเพราะมีที่ว่างเพิ่มขึ้นครับ */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-500">
          <div className="flex items-center gap-1"><span className="text-slate-400">📦</span><span className="font-bold text-slate-700">{item.qty}</span> {item.unit}</div>
          <div className="flex items-center gap-1"><span className="text-slate-400">📅</span><span className="font-bold text-slate-700">Exp:</span> {item.exp}</div>
          <div className="flex items-center gap-1"><span className="text-slate-400">🏷️</span><span className="font-bold text-slate-700">Lot:</span> {item.lot}</div>
          <div className="flex items-center gap-1 font-black text-teal-600">💵 {parseFloat(item.val || '0').toLocaleString()} ฿</div>
        </div>
      </div>
    </div>
  );
}

export default function Step2Items({ next, back, updateData, formData }: StepProps) {
// ให้เปลี่ยนเป็นแบบนี้ครับ (ลบ productType ออกจากโครงสร้าง)
const [temp, setTemp] = useState<{
  drugName: string;
  qty: string;
  unit: string;
  lot: string;
  exp: string;
  val: string;
  inv: string;
}>({
  drugName: '', qty: '', unit: '', lot: '', exp: '', val: '', inv: '',
});

  const isExchange = formData?.sender?.request_type === 'รับคืนแลกเปลี่ยน';
  const drugNameInputRef = useRef<HTMLInputElement>(null);
  const set = (field: string, value: string) => setTemp(prev => ({ ...prev, [field]: value }));

const addItemToList = () => {
    // 1. เช็คจำนวน
    if (items.length >= MAX) return alert(`จำกัดสูงสุด ${MAX} รายการ`);
    
    // 2. เช็คค่าว่าง (ยึดตามโครงสร้าง temp ใหม่ที่กิตแก้ไว้)
    if (!temp.drugName || !temp.qty || !temp.unit) {
      return alert('กรุณากรอกชื่อยา จำนวน และหน่วยให้ครบถ้วน');
    }

    // 3. สร้าง Object รายการใหม่ให้ตรงกับโครงสร้าง temp ปัจจุบัน
    const newItem = {
      drugName: temp.drugName,
      qty: temp.qty,
      unit: temp.unit,
      lot: temp.lot,
      exp: temp.exp,
      val: temp.val,
      inv: temp.inv,
      id: Date.now()
    };

    setItems([...items, newItem]);
    
    // 4. Reset temp ให้ตรงกับโครงสร้างใหม่
    setTemp({ 
      drugName: '', 
      qty: '', 
      unit: '', 
      lot: '', 
      exp: '', 
      val: '', 
      inv: '' 
    });
    
    drugNameInputRef.current?.focus();
  };

  const handleNext = () => {
    if (items.length === 0) return alert('กรุณาเพิ่มรายการยาอย่างน้อย 1 รายการ');
    const totalValue = items.reduce((s, i) => s + parseFloat(i.val || '0'), 0);
    updateData((prev: any) => ({ ...prev, items, totalValue }));
    next();
  };

  const totalValuePreview = items.reduce((s, i) => s + parseFloat(i.val || '0'), 0);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">

      {/* Progress hint */}
      <div className="flex items-center gap-2 px-1">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-600 text-white text-[11px] font-black">2</span>
        <p className="text-xs font-bold text-slate-400">รายการยาและเวชภัณฑ์</p>
        {items.length > 0 && (
          <span className="ml-auto text-[11px] font-bold text-teal-600 bg-teal-50 px-2.5 py-1 rounded-full">
            {items.length}/{MAX} รายการ
          </span>
        )}
      </div>

      {/* ══ ฟอร์มเพิ่มรายการ ══ */}
      <div className="relative bg-white rounded-3xl border border-slate-100 shadow-md shadow-slate-100/60 p-7 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: 'linear-gradient(90deg,#0f5132,#1a7a45,#2dd4bf)' }} />

        <h2 className="text-sm font-black text-slate-800 mb-6 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-sm" style={{ background: 'linear-gradient(135deg,#d1fae5,#99f6e4)' }}>💊</div>
          รายการยาและเวชภัณฑ์
        </h2>

        <div className="space-y-4 bg-gradient-to-br from-slate-50 to-white p-6 rounded-2xl border-2 border-dashed border-slate-200">

          <div>
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">ชื่อยา</label>
            <input
              ref={drugNameInputRef}
              value={temp.drugName}
              onChange={e => set('drugName', e.target.value)}
              placeholder="ชื่อยาและขนาด..."
              className={fieldStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">จำนวน</label>
              <input type="number" value={temp.qty} onChange={e => set('qty', e.target.value)} placeholder="0" className={fieldStyle} />
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">หน่วย</label>
              <SelectField value={temp.unit} onChange={(v) => set('unit', v)}>
                <option value="">เลือกหน่วย</option>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </SelectField>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Lot No.</label>
              <input value={temp.lot} onChange={e => set('lot', e.target.value)} placeholder="Lot No." className={fieldStyle} />
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">วันหมดอายุ</label>
              <input type="date" value={temp.exp} onChange={e => set('exp', e.target.value)} className={fieldStyle} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">มูลค่ารวม (฿)</label>
              <input type="number" value={temp.val} onChange={e => set('val', e.target.value)} placeholder="0.00" className={fieldStyle} />
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">เลขใบส่งของ</label>
              <input value={temp.inv} onChange={e => set('inv', e.target.value)} placeholder="เลขใบส่งของ" className={fieldStyle} />
            </div>
          </div>

          <button
            onClick={addItemToList}
            className="w-full py-4 text-white rounded-2xl font-black text-sm transition-all duration-200 shadow-lg active:scale-[0.98] hover:-translate-y-0.5 hover:shadow-xl flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)', boxShadow: '0 10px 25px -8px rgba(26,122,69,0.45)' }}
          >
            <span className="text-base">＋</span> เพิ่มรายการลงตาราง
          </button>
        </div>
      </div>

      {/* ══ รายการที่เพิ่มแล้ว ══ */}
      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-black text-slate-500 flex items-center gap-1.5">
              <span className="text-teal-500">📋</span> รายการที่เพิ่มแล้ว
            </p>
            <p className="text-xs font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-full">
              รวม {totalValuePreview.toLocaleString()} ฿
            </p>
          </div>
          <div className="space-y-3">
            {items.map((item, i) => (
              <DrugCard key={item.id} item={item} index={i} onRemove={() => setItems(items.filter(it => it.id !== item.id))} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-8 px-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <p className="text-2xl mb-2 opacity-50">📭</p>
          <p className="text-xs text-slate-400 font-medium">ยังไม่มีรายการยา กรุณาเพิ่มอย่างน้อย 1 รายการ</p>
        </div>
      )}

      {/* ══ Navigation ══ */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={back}
          className="group py-4 rounded-2xl font-black text-slate-500 bg-white border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <span className="group-hover:-translate-x-1 transition-transform duration-200">←</span> ย้อนกลับ
        </button>
        <button
          onClick={handleNext}
          className="group py-4 rounded-2xl font-black text-white transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)', boxShadow: '0 10px 25px -8px rgba(26,122,69,0.45)' }}
        >
          ดำเนินการต่อ <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
        </button>
      </div>
    </div>
  );
}