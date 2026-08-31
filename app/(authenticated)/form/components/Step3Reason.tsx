'use client';

import { useState, useEffect } from 'react';
import { ClipboardList, NotebookPen, Truck, Handshake, MapPin, User, Loader2, Check, ChevronDown, ArrowLeft, ArrowRight } from 'lucide-react';
import type { ReturnFormData } from '../form-types';
import { getAssignedSaleRepsForCustomer, type SaleRepLookupResult } from '@/app/actions/sale-lookup-actions';
import { useToast } from '@/components/ui/toast';

interface StepProps {
  next:       () => void;
  back:       () => void;
  updateData: React.Dispatch<React.SetStateAction<ReturnFormData>>;
  formData:   ReturnFormData;
  // ★ เฉพาะฝั่ง CSR override เป็น getAssignedSaleRepsForOrg — ต้องรับ customer_code ของ
  // หน่วยงานที่เลือกไว้ด้วย (ฝั่งลูกค้า default ไม่ใช้ค่านี้ ดึงจาก session ตัวเองเสมอ)
  getSaleRepsFn?: (customerCode?: string) => Promise<SaleRepLookupResult>;
}


const textareaCls = 'w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-white text-base text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all duration-200 resize-none placeholder:text-slate-300';
const inputCls    = 'w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-white text-base text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all duration-200 placeholder:text-slate-300';
// เดิมลองฝัง chevron ผ่าน bg-[url("data:image/svg+xml...")] แต่ Tailwind ไม่ยอม
// generate CSS ให้ (backgroundImage คำนวณออกมาเป็น none) เลยเปลี่ยนมาใช้ไอคอน
// ChevronDown จริงวางทับแทน เหมือนวิธีที่ Step2Items.tsx ใช้กับ select อื่นๆ ทุกตัว
const selectCls   = 'w-full pl-4 pr-10 py-3 rounded-xl border-2 border-slate-100 bg-white text-base text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all duration-200 appearance-none cursor-pointer';

function SectionTitle({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-5 sm:mb-6">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm shrink-0 text-emerald-700" style={{ background: 'linear-gradient(135deg,#d1fae5,#99f6e4)' }}>
        {icon ?? <ClipboardList size={16} />}
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

function BadgeBtn({ label, active, onClick }: { label: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative px-4 sm:px-5 py-2.5 rounded-full text-base font-bold border-2 transition-all duration-200 active:scale-95 inline-flex items-center gap-1.5',
        active
          ? 'border-transparent text-white shadow-lg -translate-y-0.5'
          : 'border-slate-200 bg-white text-muted-foreground hover:border-teal-300 hover:text-teal-600 hover:-translate-y-0.5'
      ].join(' ')}
      style={active ? { background: 'linear-gradient(135deg,#0f5132,#1a7a45)', boxShadow: '0 8px 20px -6px rgba(26,122,69,0.5)' } : {}}
    >
      {active && <Check size={15} strokeWidth={3} />}{label}
    </button>
  );
}

export default function Step3Reason({ next, back, updateData, formData, getSaleRepsFn = getAssignedSaleRepsForCustomer }: StepProps) {
  const toast = useToast();
  const isExchange = formData?.sender?.request_type === 'รับคืนแลกเปลี่ยน';
  const items = formData?.items || [];

  const [reason, setReason]               = useState(formData?.return_reason?.startsWith('อื่นๆ: ') ? 'อื่นๆ' : (formData?.return_reason || ''));
  const [reasonOther, setReasonOther]     = useState(formData?.return_reason?.startsWith('อื่นๆ: ') ? formData.return_reason.replace('อื่นๆ: ', '') : '');
  const [exchangeMode, setExchangeMode]   = useState(formData?.exchange_product_type || '');
  const [checkedItems, setCheckedItems]   = useState<string[]>(
    typeof formData?.exchange_product_list === 'string'
      ? JSON.parse(formData.exchange_product_list)
      : (formData?.exchange_product_list || [])
  );
  const [exchangeOtherText, setExchangeOtherText] = useState(formData?.exchange_product_other || '');
  const [deliveryType, setDeliveryType]   = useState(formData?.delivery_type || '');
  const [addrStreet, setAddrStreet]       = useState(formData?.addr_street || '');
  const [addrSub, setAddrSub]             = useState(formData?.addr_sub || '');
  const [addrDistrict, setAddrDistrict]   = useState(formData?.addr_district || '');
  const [addrProvince, setAddrProvince]   = useState(formData?.addr_province || '');

  // ผู้แทน — ระบบดึงชื่อ sale ที่ดูแลหน่วยงานนี้มาโชว์อัตโนมัติ (logic เดียวกับที่ CSR
  // ใช้หา sale เพื่อเป็นผู้รับอีเมล) ถ้าไม่มี sale คนไหนดูแลเขต/ประเภทหน่วยงานนี้เลย
  // (bucket ไม่ match ใครสักคน) ค่อย fallback เป็นช่องกรอกเองแทน
  const [saleReps, setSaleReps]           = useState<{ id: string; full_name: string }[]>([]);
  const [saleRepsLoading, setSaleRepsLoading] = useState(false);
  const [saleRepsFetched, setSaleRepsFetched] = useState(false);
  const [manualAgentInfo, setManualAgentInfo] = useState(formData?.agent_info || '');
  // วันนัดรับสินค้า — เก็บเป็น date จริง (agent_appointment_date, ลง PDF ช่อง "วันที่ส่งมอบ")
  // แยกจาก note ที่เป็นข้อความอิสระ (ช่วงเวลา/รายละเอียดเพิ่มเติม)
  const [appointmentDate, setAppointmentDate] = useState(formData?.agent_appointment_date || '');
  const [appointmentNote, setAppointmentNote] = useState(formData?.agent_appointment_note || '');
  useEffect(() => {
    if (deliveryType !== 'ผู้แทน' || saleRepsFetched) return;
    let cancelled = false;
    setSaleRepsLoading(true);
    getSaleRepsFn(formData?.sender?.customer_code ?? undefined).then((result) => {
      if (cancelled) return;
      setSaleReps(result.success ? result.reps : []);
      setSaleRepsLoading(false);
      setSaleRepsFetched(true);
    });
    return () => { cancelled = true; };
  }, [deliveryType, saleRepsFetched, getSaleRepsFn, formData?.sender?.customer_code]);

  const canProceed = Boolean(
    reason &&
    (reason !== 'อื่นๆ' || reasonOther.trim()) &&
    (!isExchange || (
      exchangeMode &&
      (exchangeMode !== 'รายการเดิม' || checkedItems.length > 0) &&
      (exchangeMode !== 'อื่นๆ' || exchangeOtherText.trim())
    )) &&
    deliveryType
  );

  const toggleItem = (name: string) =>
    setCheckedItems(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);

  const handleNext = () => {
    if (!reason) return toast.error('กรุณาระบุเหตุผลการส่งคืนครับ');
    if (reason === 'อื่นๆ' && !reasonOther.trim()) return toast.error('กรุณาระบุรายละเอียดเหตุผลครับ');
    if (isExchange) {
      if (!exchangeMode) return toast.error('กรุณาระบุสินค้าที่ต้องการแลกเปลี่ยนครับ');
      if (exchangeMode === 'รายการเดิม' && checkedItems.length === 0) return toast.error('กรุณาเลือกรายการสินค้าเดิมอย่างน้อย 1 รายการ');
      if (exchangeMode === 'อื่นๆ' && !exchangeOtherText.trim()) return toast.error('กรุณาระบุชื่อสินค้าที่ต้องการครับ');
    }
    if (!deliveryType) return toast.error('กรุณาเลือกวิธีส่งคืนครับ');
    // ถ้ามี sale ที่ระบบจับคู่ให้อัตโนมัติ ใช้ชื่อ sale เป็นหลัก ถ้าไม่มีใครดูแลเขตนี้เลย
    // ใช้ข้อความที่กรอกเองแทน (ช่องว่างให้กรอกเอง ตามที่ตกลงไว้) — โน้ตนัดหมายเก็บแยกคอลัมน์
    // ของตัวเอง (agent_appointment_note) ไม่ยัดรวมเป็น string เดียวกับ agent_info อีกต่อไป
    const agentInfo = saleReps.length > 0 ? saleReps.map(r => r.full_name).join(', ') : manualAgentInfo;
    const isAgent = deliveryType === 'ผู้แทน';
    updateData((prev) => ({
      ...prev,
      return_reason:            reason === 'อื่นๆ' ? `อื่นๆ: ${reasonOther}` : reason,
      exchange_product_type:    exchangeMode,
      exchange_product_list:    JSON.stringify(checkedItems),
      exchange_product_other:   exchangeOtherText,
      delivery_type:            deliveryType,
      addr_street:              addrStreet,
      addr_sub:                 addrSub,
      addr_district:            addrDistrict,
      addr_province:            addrProvince,
      agent_info:               agentInfo,
      agent_appointment_date:   isAgent ? appointmentDate || undefined : undefined,
      agent_appointment_note:   isAgent ? appointmentNote.trim() || undefined : undefined,
    }));
    next();
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-6 font-sarabun">

      {/* Progress hint */}
      <div className="flex items-center gap-2 px-1">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-black">3</span>
        <p className="text-sm font-bold text-muted-foreground">เหตุผลการส่งคืนและวิธีจัดส่ง</p>
      </div>

      {/* ══ เหตุผลการส่งคืน ══ */}
      <div className="relative bg-white rounded-3xl border border-slate-100 shadow-md shadow-slate-100/60 p-5 sm:p-7 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: 'linear-gradient(90deg,#0f5132,#1a7a45,#2dd4bf)' }} />

        <SectionTitle icon={<NotebookPen size={16} className="text-emerald-700" />}>เหตุผลการส่งคืน</SectionTitle>

        <div className="flex flex-col gap-5 sm:gap-6">
          <div className="flex flex-col gap-3">
            <FieldLabel>ระบุเหตุผลการส่งคืน *</FieldLabel>
            <div className="flex flex-wrap gap-2.5">
              {['สินค้าหมดอายุ', 'อื่นๆ'].map(r => (
                <BadgeBtn key={r} label={r} active={reason === r} onClick={() => setReason(r)} />
              ))}
            </div>
            {reason === 'อื่นๆ' && (
              <textarea
                rows={2}
                value={reasonOther}
                onChange={e => setReasonOther(e.target.value)}
                placeholder="พิมพ์รายละเอียดเหตุผล..."
                maxLength={500}
                className={`${textareaCls} animate-in fade-in slide-in-from-top-2 duration-200`}
              />
            )}
          </div>

          {isExchange && (
            <div className="flex flex-col gap-3 border-t border-dashed border-slate-200 pt-5 sm:pt-6">
              <FieldLabel>กรณีแลกเปลี่ยน ระบุสินค้าที่ต้องการ *</FieldLabel>
              <div className="flex flex-wrap gap-2.5">
                {(['รายการเดิม', 'อื่นๆ'] as const).map(m => (
                  <BadgeBtn key={m} label={m} active={exchangeMode === m} onClick={() => setExchangeMode(m)} />
                ))}
              </div>
              {exchangeMode === 'รายการเดิม' && (
                <div className="mt-1 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  {items.map((d, i: number) => {
                    const checked = checkedItems.includes(d.drugName);
                    return (
                      <label
                        key={i}
                        className={[
                          'flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-200',
                          checked
                            ? 'border-teal-400 bg-teal-50 shadow-sm'
                            : 'border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200'
                        ].join(' ')}
                      >
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center text-white transition-all shrink-0 ${checked ? 'bg-teal-600' : 'bg-white border-2 border-slate-300'}`}>
                          {checked && <Check size={13} strokeWidth={3} />}
                        </div>
                        <input type="checkbox" checked={checked} onChange={() => toggleItem(d.drugName)} className="hidden" />
                        <span className={`text-base font-semibold ${checked ? 'text-teal-800' : 'text-slate-600'}`}>{d.drugName}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {exchangeMode === 'อื่นๆ' && (
                <textarea
                  rows={2}
                  value={exchangeOtherText}
                  onChange={e => setExchangeOtherText(e.target.value)}
                  placeholder="ระบุชื่อสินค้าที่ต้องการแลกเปลี่ยน..."
                  className={`${textareaCls} animate-in fade-in slide-in-from-top-2 duration-200`}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══ วิธีการส่งคืนสินค้า ══ */}
      <div className="relative bg-white rounded-3xl border border-slate-100 shadow-md shadow-slate-100/60 p-5 sm:p-7 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: 'linear-gradient(90deg,#1a5c96,#1a7a45,#0f5132)' }} />

        <SectionTitle icon={<Truck size={16} className="text-emerald-700" />}>วิธีการส่งคืนสินค้า</SectionTitle>

        <div className="flex flex-col gap-4 sm:gap-5">
          <div className="flex flex-col gap-3">
            <FieldLabel>เลือกวิธีส่งคืน *</FieldLabel>
            {/* Mobile: stack / Desktop: row */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              {(['ขนส่ง', 'ผู้แทน'] as const).map(d => (
                <BadgeBtn
                  key={d}
                  label={d === 'ขนส่ง' ? <><Truck size={16} /> โดยบริษัทขนส่ง</> : <><Handshake size={16} /> จัดส่งผ่านผู้แทน</>}
                  active={deliveryType === d}
                  onClick={() => setDeliveryType(d)}
                />
              ))}
            </div>
          </div>

          {deliveryType === 'ขนส่ง' && (
            <div className="flex flex-col gap-4 p-4 sm:p-5 bg-gradient-to-br from-slate-50 to-white rounded-2xl border-2 border-dashed border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
              <p className="text-sm font-black text-muted-foreground flex items-center gap-1.5"><MapPin size={15} /> ที่อยู่สำหรับไปรับสินค้า</p>
              <div className="flex flex-col gap-1.5">
                <FieldLabel>เลขที่ / ถนน</FieldLabel>
                <input value={addrStreet} onChange={e => setAddrStreet(e.target.value)} placeholder="เลขที่ / หมู่ / ถนน" className={inputCls} />
              </div>
              {/* Mobile: 1 col / Desktop: 3 cols */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>ตำบล</FieldLabel>
                  <input value={addrSub} onChange={e => setAddrSub(e.target.value)} placeholder="ตำบล" className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>อำเภอ</FieldLabel>
                  <input value={addrDistrict} onChange={e => setAddrDistrict(e.target.value)} placeholder="อำเภอ" className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>จังหวัด</FieldLabel>
                  <div className="relative">
                    <select value={addrProvince} onChange={e => setAddrProvince(e.target.value)} className={selectCls}>
                      <option value="">-- เลือกจังหวัด --</option>
                      {['สงขลา', 'พัทลุง', 'สตูล', 'ตรัง', 'ปัตตานี', 'ยะลา', 'นราธิวาส'].map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <ChevronDown size={15} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {deliveryType === 'ผู้แทน' && (
            <div className="flex flex-col gap-4 p-4 sm:p-5 bg-gradient-to-br from-slate-50 to-white rounded-2xl border-2 border-dashed border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex flex-col gap-1.5">
                <FieldLabel>ผู้แทนที่ดูแล</FieldLabel>

                {saleRepsLoading && (
                  <div className="px-4 py-3 rounded-xl bg-white border border-slate-100 text-muted-foreground font-bold text-base flex items-center gap-2">
                    <Loader2 size={15} className="animate-spin" /> กำลังค้นหาผู้แทนที่ดูแล...
                  </div>
                )}

                {!saleRepsLoading && saleRepsFetched && saleReps.length > 0 && (
                  <div className="px-4 py-3 rounded-xl bg-teal-50 border-2 border-teal-100 text-teal-800 font-bold text-base flex flex-col gap-1.5">
                    {saleReps.map(r => (
                      <span key={r.id} className="inline-flex items-center gap-1.5">
                        <User size={15} className="text-teal-500 shrink-0" /> {r.full_name}
                      </span>
                    ))}
                  </div>
                )}

                {/* ★ ไม่มี sale คนไหนดูแลเขต/ประเภทหน่วยงานนี้เลย — ปล่อยเป็นช่องว่างให้กรอกเอง
                    ตามที่ตกลงไว้ แทนการโชว์แค่ข้อความว่าไม่พบ */}
                {!saleRepsLoading && saleRepsFetched && saleReps.length === 0 && (
                  <input
                    value={manualAgentInfo}
                    onChange={e => setManualAgentInfo(e.target.value)}
                    placeholder="ชื่อผู้แทน"
                    className={inputCls}
                  />
                )}
              </div>

              {/* วันนัดรับสินค้า + หมายเหตุ — โชว์หลังค้นหาผู้แทนเสร็จ (มีหรือไม่มี sale ก็กรอกได้)
                  วันที่ลง PDF ช่อง "วันที่ส่งมอบ" (agent_appointment_date), หมายเหตุเก็บช่วงเวลา/
                  รายละเอียดเพิ่มเติมแยก (agent_appointment_note) ไม่ลง PDF */}
              {!saleRepsLoading && saleRepsFetched && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>วันนัดรับสินค้า (ถ้ามี)</FieldLabel>
                    <input
                      type="date"
                      value={appointmentDate}
                      onChange={e => setAppointmentDate(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>หมายเหตุนัดรับ / ช่วงเวลา (ถ้ามี)</FieldLabel>
                    <input
                      value={appointmentNote}
                      onChange={e => setAppointmentNote(e.target.value)}
                      placeholder="เช่น ช่วงบ่าย, โทรก่อนเข้ารับ"
                      className={inputCls}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══ Navigation ══ */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={back}
          className="group py-4 rounded-2xl font-black text-base text-muted-foreground bg-white border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform duration-200" /> ย้อนกลับ
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!canProceed}
          className="group py-4 rounded-2xl font-black text-white text-base transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)', boxShadow: canProceed ? '0 10px 25px -8px rgba(26,122,69,0.45)' : 'none', opacity: canProceed ? 1 : 0.5, cursor: canProceed ? 'pointer' : 'not-allowed' }}
        >
          ดำเนินการต่อ <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform duration-200" />
        </button>
      </div>
    </div>
  );
}