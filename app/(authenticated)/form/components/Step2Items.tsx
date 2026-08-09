'use client';

import { useState, useRef } from 'react';
import { X, Package, Calendar, Tag, Banknote, Pill, ClipboardList, PackageOpen, ChevronDown, Plus, ArrowLeft, ArrowRight } from 'lucide-react';
import type { ReturnFormData, DrugItemEntry } from '../form-types';

interface StepProps {
  next:       () => void;
  back:       () => void;
  updateData: React.Dispatch<React.SetStateAction<ReturnFormData>>;
  formData:   ReturnFormData;
}

const UNITS = ['แผง', 'กล่อง', 'ขวด', 'amp', 'ลัง'] as const;
const MAX   = 5;

const fieldStyle = "w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-white text-base font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:border-teal-400 focus:ring-4 focus:ring-teal-50 outline-none transition-all duration-200";
const selectStyle = "w-full pl-4 pr-10 py-3 rounded-xl border-2 border-slate-100 bg-white text-base font-medium text-slate-700 focus:border-teal-400 focus:ring-4 focus:ring-teal-50 outline-none transition-all duration-200 cursor-pointer appearance-none";

const FieldLabel = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="text-[13px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5 ml-1 flex items-center gap-1.5">
    <span className="w-1 h-1 rounded-full bg-slate-300" />
    {children}
    {required && <span className="text-red-500 normal-case tracking-normal">*</span>}
  </label>
);

function SelectField({ value, onChange, children }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)} className={`${selectStyle} ${!value ? 'text-muted-foreground' : ''}`}>
        {children}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function DrugCard({ item, index, onRemove }: { item: DrugItemEntry; index: number; onRemove: () => void }) {
  return (
    <div className="group relative flex bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
      <div className="w-1.5 shrink-0" style={{ background: 'linear-gradient(180deg,#0f5132,#2dd4bf)' }} />
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0 shadow-sm"
              style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)' }}
            >
              {index + 1}
            </span>
            <span className="font-black text-slate-800 text-base">{item.drugName}</span>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-red-400 hover:text-white hover:bg-red-500 transition-all duration-150 active:scale-90"
          ><X size={14} /></button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-1"><Package size={13} className="text-muted-foreground" /><span className="font-bold text-slate-700">{item.qty}</span> {item.unit}</div>
          <div className="flex items-center gap-1"><Calendar size={13} className="text-muted-foreground" /><span className="font-bold text-slate-700">Exp:</span> {item.exp}</div>
          <div className="flex items-center gap-1"><Tag size={13} className="text-muted-foreground" /><span className="font-bold text-slate-700">Lot:</span> {item.lot}</div>
          <div className="flex items-center gap-1 font-black text-teal-600"><Banknote size={14} /> {parseFloat(item.val || '0').toLocaleString()} ฿</div>
        </div>
      </div>
    </div>
  );
}

export default function Step2Items({ next, back, updateData, formData }: StepProps) {
  const [items, setItems] = useState<DrugItemEntry[]>(formData?.items || []);
  const [temp, setTemp] = useState({ drugName: '', qty: '', unit: '', lot: '', exp: '', unitPrice: '', val: '', inv: '' });
  const drugNameInputRef = useRef<HTMLInputElement>(null);

  const canProceed = items.length > 0;

  const set = (field: string, value: string) => setTemp(prev => ({ ...prev, [field]: value }));

  // มูลค่ารวม = จำนวน × ราคาต่อหน่วย — คำนวณอัตโนมัติ ไม่ให้พิมพ์เองแล้ว
  const tempComputedVal = (parseFloat(temp.qty) || 0) * (parseFloat(temp.unitPrice) || 0);

  // Field บังคับของแต่ละรายการยา — เหลือแค่ 5 ตัวนี้ (ราคาต่อหน่วย/เลขใบส่งของ เป็น optional)
  const canAddItem = Boolean(
    temp.drugName.trim() && temp.qty && temp.unit && temp.lot.trim() && temp.exp
  );

  const addItemToList = () => {
    if (items.length >= MAX) return alert(`จำกัดสูงสุด ${MAX} รายการ`);
    if (!canAddItem) return alert('กรุณากรอกชื่อยา จำนวน หน่วย Lot No. และวันหมดอายุให้ครบถ้วน');
    setItems([...items, { ...temp, val: tempComputedVal.toFixed(2), id: Date.now() }]);
    setTemp({ drugName: '', qty: '', unit: '', lot: '', exp: '', unitPrice: '', val: '', inv: '' });
    drugNameInputRef.current?.focus();
  };

  const handleNext = () => {
    if (items.length === 0) return alert('กรุณาเพิ่มรายการยาอย่างน้อย 1 รายการ');
    const totalValue = items.reduce((s, i) => s + parseFloat(i.val || '0'), 0);
    updateData((prev) => ({ ...prev, items, totalValue }));
    next();
  };

  const totalValuePreview = items.reduce((s, i) => s + parseFloat(i.val || '0'), 0);

  return (
    <div className="space-y-6 font-sarabun max-w-3xl mx-auto">

      {/* Progress hint */}
      <div className="flex items-center gap-2 px-1">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-black">2</span>
        <p className="text-sm font-bold text-muted-foreground">รายการยาและเวชภัณฑ์</p>
        {items.length > 0 && (
          <span className="ml-auto text-xs font-bold text-teal-600 bg-teal-50 px-2.5 py-1 rounded-full">
            {items.length}/{MAX} รายการ
          </span>
        )}
      </div>

      {/* ══ ฟอร์มเพิ่มรายการ ══ */}
      <div className="relative bg-white rounded-3xl border border-slate-100 shadow-md shadow-slate-100/60 p-5 sm:p-7 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: 'linear-gradient(90deg,#0f5132,#1a7a45,#2dd4bf)' }} />

        <h2 className="text-base font-black text-slate-800 mb-6 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm" style={{ background: 'linear-gradient(135deg,#d1fae5,#99f6e4)' }}><Pill size={16} className="text-emerald-700" /></div>
          รายการยาและเวชภัณฑ์
        </h2>

        <div className="space-y-4 bg-gradient-to-br from-slate-50 to-white p-5 sm:p-6 rounded-2xl border-2 border-dashed border-slate-200">

          {/* ชื่อยา — full width */}
          <div>
            <FieldLabel required>ชื่อยา</FieldLabel>
            <input
              ref={drugNameInputRef}
              value={temp.drugName}
              onChange={e => set('drugName', e.target.value)}
              placeholder="ชื่อยาและขนาด..."
              className={fieldStyle}
            />
          </div>

          {/* จำนวน + หน่วย */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <FieldLabel required>จำนวน</FieldLabel>
              <input type="number" min="0" value={temp.qty} onChange={e => set('qty', e.target.value)} placeholder="0" className={fieldStyle} />
            </div>
            <div>
              <FieldLabel required>หน่วย</FieldLabel>
              <SelectField value={temp.unit} onChange={v => set('unit', v)}>
                <option value="">เลือกหน่วย</option>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </SelectField>
            </div>
          </div>

          {/* Lot + Exp */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <FieldLabel required>Lot No.</FieldLabel>
              <input value={temp.lot} onChange={e => set('lot', e.target.value)} placeholder="Lot No." className={fieldStyle} />
            </div>
            <div>
              <FieldLabel required>วันหมดอายุ</FieldLabel>
              <input type="date" value={temp.exp} onChange={e => set('exp', e.target.value)} className={fieldStyle} />
            </div>
          </div>

          {/* ราคาต่อหน่วย + มูลค่ารวม (คำนวณอัตโนมัติ) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <FieldLabel>ราคาต่อหน่วย (฿)</FieldLabel>
              <input type="number" min="0" step="0.01" value={temp.unitPrice} onChange={e => set('unitPrice', e.target.value)} placeholder="0.00" className={fieldStyle} />
            </div>
            <div>
              <FieldLabel>มูลค่ารวม (฿)</FieldLabel>
              <input
                type="text"
                readOnly
                value={tempComputedVal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                className={`${fieldStyle} bg-slate-100 text-slate-500 cursor-not-allowed`}
              />
            </div>
          </div>

          {/* เลขใบส่งของ */}
          <div>
            <FieldLabel>เลขใบส่งของ</FieldLabel>
            <input value={temp.inv} onChange={e => set('inv', e.target.value)} placeholder="เลขใบส่งของ" className={fieldStyle} />
          </div>

          <button
            onClick={addItemToList}
            disabled={!canAddItem}
            className="w-full py-4 text-white rounded-2xl font-black text-base transition-all duration-200 shadow-lg active:scale-[0.98] hover:-translate-y-0.5 hover:shadow-xl flex items-center justify-center gap-2 disabled:pointer-events-none"
            style={{
              background: 'linear-gradient(135deg,#0f5132,#1a7a45)',
              boxShadow: canAddItem ? '0 10px 25px -8px rgba(26,122,69,0.45)' : 'none',
              opacity: canAddItem ? 1 : 0.5,
              cursor: canAddItem ? 'pointer' : 'not-allowed',
            }}
          >
            <Plus size={18} strokeWidth={2.75} /> เพิ่มรายการลงตาราง
          </button>
          {!canAddItem && (
            <p className="text-xs font-bold text-red-500 text-center -mt-1">
              * กรุณากรอกชื่อยา จำนวน หน่วย Lot No. และวันหมดอายุให้ครบก่อน
            </p>
          )}
        </div>
      </div>

      {/* ══ รายการที่เพิ่มแล้ว ══ */}
      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-black text-muted-foreground flex items-center gap-1.5">
              <ClipboardList size={15} className="text-teal-500" /> รายการที่เพิ่มแล้ว
            </p>
            <p className="text-sm font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-full">
              รวม {totalValuePreview.toLocaleString()} ฿
            </p>
          </div>
          <div className="space-y-3">
            {items.map((item, i) => (
              <DrugCard
                key={item.id}
                item={item}
                index={i}
                onRemove={() => setItems(items.filter(it => it.id !== item.id))}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-8 px-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <PackageOpen className="w-7 h-7 mx-auto mb-2 text-slate-300" strokeWidth={1.75} />
          <p className="text-sm text-muted-foreground font-medium">ยังไม่มีรายการยา กรุณาเพิ่มอย่างน้อย 1 รายการ</p>
        </div>
      )}

      {/* ══ Navigation ══ */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <button
          onClick={back}
          className="group py-4 rounded-2xl font-black text-muted-foreground bg-white border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform duration-200" /> ย้อนกลับ
        </button>
        <button
          onClick={handleNext}
          disabled={!canProceed}
          className="group py-4 rounded-2xl font-black text-white transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)', boxShadow: canProceed ? '0 10px 25px -8px rgba(26,122,69,0.45)' : 'none', opacity: canProceed ? 1 : 0.5, cursor: canProceed ? 'pointer' : 'not-allowed' }}
        >
          ดำเนินการต่อ <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform duration-200" />
        </button>
      </div>
    </div>
  );
}