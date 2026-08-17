'use client';

import { useState, useRef } from 'react';
import { X, Package, Calendar, Tag, Banknote, Pill, ClipboardList, PackageOpen, ChevronDown, Plus, ArrowLeft, ArrowRight, Camera, ImagePlus } from 'lucide-react';
import type { ReturnFormData, DrugItemEntry } from '../form-types';
import { MAX_DELIVERY_PHOTOS as MAX_PHOTOS, MAX_DELIVERY_PHOTO_BYTES as MAX_PHOTO_BYTES } from '@/lib/delivery-photo-limits';

interface StepProps {
  next:       () => void;
  back:       () => void;
  updateData: React.Dispatch<React.SetStateAction<ReturnFormData>>;
  formData:   ReturnFormData;
  // ★ เปิดตัวเลือก "ถ่าย/แนบรูปใบส่งของ" (ระดับคำร้อง ไม่ใช่ระดับรายการยา — ดูการ์ด
  // "แนบรูปใบส่งของ" ท้ายไฟล์) — เฉพาะฟอร์มที่ลูกค้ากรอกเอง (app/(authenticated)/form/
  // FormWizardPage.tsx ส่ง true) ฟอร์มที่ CSR กรอกแทนลูกค้า (app/admin/csr/form/
  // FormWizardPageStaff.tsx) ไม่ส่ง prop นี้เลย จึงปิดอยู่โดย default — ไม่กระทบ flow ของ
  // CSR แม้แต่น้อยตามที่ผู้ใช้ขอ
  allowDeliveryPhoto?: boolean;
}

const PHOTO_MAX_DIMENSION = 1600; // px — ด้านยาวสุด พอสำหรับอ่านตัวหนังสือบนใบส่งของ
const PHOTO_JPEG_QUALITY = 0.75;

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// บีบอัดรูป (resize ด้านยาวสุดไม่เกิน PHOTO_MAX_DIMENSION + re-encode เป็น JPEG) ก่อนแปลงเป็น
// base64 — รูปถ่ายจากกล้องมือถือจริงมักมีขนาดหลาย MB/ความละเอียดสูงเกินความจำเป็นสำหรับแค่
// อ่านตัวหนังสือบนเอกสาร บีบอัดแล้วมักเหลือแค่หลักร้อย KB ต่อรูป — ล้ม (เช่น decode HEIC บาง
// เบราว์เซอร์ไม่ได้) ให้ throw แล้ว caller ไปโชว์ error แทนที่จะเงียบส่งรูปดิบไม่บีบอัดออกไป
async function compressImageToDataUri(file: File): Promise<string> {
  const rawDataUri = await fileToDataUri(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > PHOTO_MAX_DIMENSION || height > PHOTO_MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * PHOTO_MAX_DIMENSION) / width);
          width = PHOTO_MAX_DIMENSION;
        } else {
          width = Math.round((width * PHOTO_MAX_DIMENSION) / height);
          height = PHOTO_MAX_DIMENSION;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas ไม่รองรับ'));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY));
    };
    img.onerror = () => reject(new Error('โหลดรูปไม่สำเร็จ'));
    img.src = rawDataUri;
  });
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
          <div className="flex items-center gap-1 font-black text-teal-600"><Banknote size={14} /> {parseFloat(item.val || '0').toLocaleString()} บาท</div>
        </div>
      </div>
    </div>
  );
}

export default function Step2Items({ next, back, updateData, formData, allowDeliveryPhoto }: StepProps) {
  const [items, setItems] = useState<DrugItemEntry[]>(formData?.items || []);
  const [temp, setTemp] = useState({ drugName: '', qty: '', unit: '', lot: '', exp: '', unitPrice: '', val: '', inv: '' });
  const drugNameInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // ★ รูปใบส่งของ — ระดับคำร้อง ไม่ใช่ระดับรายการยา (ใบส่งของคือเอกสาร 1 ใบต่อการจัดส่ง
  // ไม่ใช่ 1 ใบต่อยา 1 รายการ) แนบครั้งเดียวใช้กับทุกรายการในคำร้องนี้ รองรับได้สูงสุด
  // MAX_PHOTOS รูป (เผื่อหน้า-หลัง/หลายแผ่น) เฉพาะ allowDeliveryPhoto เท่านั้น
  const [photos, setPhotos] = useState<string[]>(formData?.deliveryNotePhotoUrls || []);
  const [photoError, setPhotoError] = useState('');

  const canProceed = items.length > 0;

  const set = (field: string, value: string) => setTemp(prev => ({ ...prev, [field]: value }));

  // เลือกรูปจากคลัง/ถ่ายจากกล้อง (capture="environment" เปิดกล้องหลังตรงๆ บนมือถือ) แปลงเป็น
  // base64 data URI เก็บไว้ใน state แล้วค่อยอัปโหลดจริงฝั่ง server ตอน submit (pattern
  // เดียวกับ SignaturePad/Step4Sign)
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // กันเลือกไฟล์เดิมซ้ำแล้วไม่ trigger onChange
    if (!file) return;
    setPhotoError('');
    if (photos.length >= MAX_PHOTOS) {
      setPhotoError(`แนบได้สูงสุด ${MAX_PHOTOS} รูป`);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setPhotoError('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    // เช็คไฟล์ดิบแบบกว้างๆ ก่อน (กันไฟล์ประหลาดขนาดหลักร้อย MB โหลดเข้า memory/canvas โดยตรง)
    // ขนาดจริงที่อัปโหลดจะเช็คอีกทีหลังบีบอัดด้านล่าง ไม่ใช่จุดนี้
    if (file.size > 20 * 1024 * 1024) {
      setPhotoError('ไฟล์รูปใหญ่เกินไป กรุณาเลือกไฟล์อื่น');
      return;
    }
    try {
      const dataUri = await compressImageToDataUri(file);
      const approxBytes = Math.ceil((dataUri.length - dataUri.indexOf(',') - 1) * 0.75);
      if (approxBytes > MAX_PHOTO_BYTES) {
        setPhotoError('บีบอัดรูปแล้วยังมีขนาดใหญ่เกินไป กรุณาลองรูปอื่น');
        return;
      }
      setPhotos((prev) => [...prev, dataUri]);
    } catch {
      setPhotoError('ประมวลผลรูปไม่สำเร็จ กรุณาลองใหม่หรือเลือกรูปอื่น');
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoError('');
  };

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
    updateData((prev) => ({ ...prev, items, totalValue, deliveryNotePhotoUrls: photos }));
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
              <FieldLabel>ราคาต่อหน่วย (บาท)</FieldLabel>
              <input type="number" min="0" step="0.01" value={temp.unitPrice} onChange={e => set('unitPrice', e.target.value)} placeholder="0.00" className={fieldStyle} />
            </div>
            <div>
              <FieldLabel>มูลค่ารวม (บาท)</FieldLabel>
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
              รวม {totalValuePreview.toLocaleString()} บาท
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

      {/* ══ แนบรูปใบส่งของ — ระดับคำร้อง (ครั้งเดียว ใช้กับทุกรายการ) เฉพาะ allowDeliveryPhoto
          และหลังมีรายการยาอย่างน้อย 1 รายการแล้ว (แนบเป็นหลักฐานคู่กับรายการที่กรอกไปแล้ว) ══ */}
      {allowDeliveryPhoto && items.length > 0 && (
        <div className="bg-teal-50/60 border-2 border-teal-100 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-1">
            <Camera size={16} className="text-teal-600" />
            <p className="text-sm font-black text-teal-800">แนบรูปใบส่งของ</p>
            <span className="ml-auto text-[10px] font-bold text-teal-600 bg-white px-2 py-0.5 rounded-full shrink-0">ไม่บังคับ</span>
          </div>
          <p className="text-xs text-teal-700/80 mb-3.5 leading-relaxed">
            แนบครั้งเดียวสำหรับคำร้องนี้ ไม่ต้องแนบซ้ำต่อรายการยา (อัปโหลดได้สูงสุด {MAX_PHOTOS} รูป)
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {photos.map((url, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden border-2 border-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element -- preview ของ base64 data URI ที่ยังไม่ได้อัปโหลด ไม่ใช่ static asset ที่ next/image ปรับ optimize ให้ได้ */}
                <img src={url} alt={`รูปใบส่งของ ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-black/60 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-teal-200 bg-white hover:bg-teal-50 hover:border-teal-300 text-teal-500 hover:text-teal-600 flex flex-col items-center justify-center gap-1 transition-colors"
              >
                <ImagePlus size={20} />
                <span className="text-[11px] font-bold">เพิ่มรูป</span>
              </button>
            )}
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoChange}
            className="hidden"
          />
          {photoError && <p className="text-xs font-bold text-red-500 mt-2">{photoError}</p>}
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