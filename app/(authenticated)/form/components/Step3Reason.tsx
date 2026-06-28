'use client';

import { useState } from 'react';

interface StepProps {
  next:       () => void;
  back:       () => void;
  updateData: React.Dispatch<React.SetStateAction<any>>;
  formData:   any;
}

const textareaCls = 'w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-white text-sm text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all duration-200 resize-none placeholder:text-slate-300';
const inputCls    = 'w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-white text-sm text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all duration-200 placeholder:text-slate-300';
const selectCls   = 'w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-white text-sm text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all duration-200 appearance-none cursor-pointer bg-[url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3E%3Cpath stroke=\'%230d9488\' stroke-width=\'1.5\' stroke-linecap=\'round\' d=\'M6 8l4 4 4-4\'/%3E%3C/svg%3E")] bg-no-repeat bg-[right_14px_center] bg-[length:18px] pr-10';

function SectionTitle({ icon, children }: { icon?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-5 sm:mb-6">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-sm shrink-0" style={{ background: 'linear-gradient(135deg,#d1fae5,#99f6e4)' }}>
        {icon ?? '📋'}
      </div>
      <span className="text-sm font-black text-slate-800">{children}</span>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
      <span className="w-1 h-1 rounded-full bg-slate-300" />
      {children}
    </label>
  );
}

function BadgeBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative px-4 sm:px-5 py-2.5 rounded-full text-sm font-bold border-2 transition-all duration-200 active:scale-95',
        active
          ? 'border-transparent text-white shadow-lg -translate-y-0.5'
          : 'border-slate-200 bg-white text-slate-500 hover:border-teal-300 hover:text-teal-600 hover:-translate-y-0.5'
      ].join(' ')}
      style={active ? { background: 'linear-gradient(135deg,#0f5132,#1a7a45)', boxShadow: '0 8px 20px -6px rgba(26,122,69,0.5)' } : {}}
    >
      {active && <span className="mr-1">✓</span>}{label}
    </button>
  );
}

export default function Step3Reason({ next, back, updateData, formData }: StepProps) {
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
  const [agentInfo, setAgentInfo]         = useState(formData?.agent_info || '');

  const toggleItem = (name: string) =>
    setCheckedItems(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);

  const handleNext = () => {
    if (!reason) return alert('กรุณาระบุเหตุผลการส่งคืนครับ');
    if (reason === 'อื่นๆ' && !reasonOther.trim()) return alert('กรุณาระบุรายละเอียดเหตุผลครับ');
    if (isExchange) {
      if (!exchangeMode) return alert('กรุณาระบุสินค้าที่ต้องการแลกเปลี่ยนครับ');
      if (exchangeMode === 'รายการเดิม' && checkedItems.length === 0) return alert('กรุณาเลือกรายการสินค้าเดิมอย่างน้อย 1 รายการ');
      if (exchangeMode === 'อื่นๆ' && !exchangeOtherText.trim()) return alert('กรุณาระบุชื่อสินค้าที่ต้องการครับ');
    }
    if (!deliveryType) return alert('กรุณาเลือกวิธีส่งคืนครับ');
    updateData((prev: any) => ({
      ...prev,
      return_reason:          reason === 'อื่นๆ' ? `อื่นๆ: ${reasonOther}` : reason,
      exchange_product_type:  exchangeMode,
      exchange_product_list:  JSON.stringify(checkedItems),
      exchange_product_other: exchangeOtherText,
      delivery_type:          deliveryType,
      addr_street:            addrStreet,
      addr_sub:               addrSub,
      addr_district:          addrDistrict,
      addr_province:          addrProvince,
      agent_info:             agentInfo,
    }));
    next();
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-6 font-sarabun">

      {/* Progress hint */}
      <div className="flex items-center gap-2 px-1">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-600 text-white text-[11px] font-black">3</span>
        <p className="text-xs font-bold text-slate-400">เหตุผลการส่งคืนและวิธีจัดส่ง</p>
      </div>

      {/* ══ เหตุผลการส่งคืน ══ */}
      <div className="relative bg-white rounded-3xl border border-slate-100 shadow-md shadow-slate-100/60 p-5 sm:p-7 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: 'linear-gradient(90deg,#0f5132,#1a7a45,#2dd4bf)' }} />

        <SectionTitle icon="📝">เหตุผลการส่งคืน</SectionTitle>

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
                  {items.map((d: any, i: number) => {
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
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center text-white text-[10px] font-black transition-all shrink-0 ${checked ? 'bg-teal-600' : 'bg-white border-2 border-slate-300'}`}>
                          {checked && '✓'}
                        </div>
                        <input type="checkbox" checked={checked} onChange={() => toggleItem(d.drugName)} className="hidden" />
                        <span className={`text-sm font-semibold ${checked ? 'text-teal-800' : 'text-slate-600'}`}>{d.drugName}</span>
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

        <SectionTitle icon="🚚">วิธีการส่งคืนสินค้า</SectionTitle>

        <div className="flex flex-col gap-4 sm:gap-5">
          <div className="flex flex-col gap-3">
            <FieldLabel>เลือกวิธีส่งคืน *</FieldLabel>
            {/* Mobile: stack / Desktop: row */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              {(['ขนส่ง', 'ผู้แทน'] as const).map(d => (
                <BadgeBtn
                  key={d}
                  label={d === 'ขนส่ง' ? '🚚 โดยบริษัทขนส่ง' : '🤝 จัดส่งผ่านผู้แทน'}
                  active={deliveryType === d}
                  onClick={() => setDeliveryType(d)}
                />
              ))}
            </div>
          </div>

          {deliveryType === 'ขนส่ง' && (
            <div className="flex flex-col gap-4 p-4 sm:p-5 bg-gradient-to-br from-slate-50 to-white rounded-2xl border-2 border-dashed border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
              <p className="text-xs font-black text-slate-500 flex items-center gap-1.5">📍 ที่อยู่สำหรับไปรับสินค้า</p>
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
                  <select value={addrProvince} onChange={e => setAddrProvince(e.target.value)} className={selectCls}>
                    <option value="">-- เลือกจังหวัด --</option>
                    {['สงขลา', 'พัทลุง', 'สตูล', 'ตรัง', 'ปัตตานี', 'ยะลา', 'นราธิวาส'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {deliveryType === 'ผู้แทน' && (
            <div className="flex flex-col gap-1.5 p-4 sm:p-5 bg-gradient-to-br from-slate-50 to-white rounded-2xl border-2 border-dashed border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
              <FieldLabel>ชื่อผู้แทน / วันนัดหมาย</FieldLabel>
              <input value={agentInfo} onChange={e => setAgentInfo(e.target.value)} placeholder="ชื่อผู้แทน และวันนัดหมายรับสินค้า" className={inputCls} />
            </div>
          )}
        </div>
      </div>

      {/* ══ Navigation ══ */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={back}
          className="group py-4 rounded-2xl font-black text-sm text-slate-500 bg-white border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <span className="group-hover:-translate-x-1 transition-transform duration-200">←</span> ย้อนกลับ
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="group py-4 rounded-2xl font-black text-white text-sm transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)', boxShadow: '0 10px 25px -8px rgba(26,122,69,0.45)' }}
        >
          ดำเนินการต่อ <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
        </button>
      </div>
    </div>
  );
}