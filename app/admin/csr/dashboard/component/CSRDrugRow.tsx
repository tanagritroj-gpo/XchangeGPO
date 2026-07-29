'use client';
import { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, Check, X, Receipt, ArrowLeftRight, MoreHorizontal } from 'lucide-react';
import { updateDrugCompliance, approveDrugItem, rejectDrugItem } from '@/app/actions/csr-actions';
import ReasonSelectFields from '@/components/ReasonSelectFields';
import { REJECTION_REASONS } from '@/lib/rejection-reasons';

// ── Badge สำหรับแสดงประเภทคำร้อง — สีตรงกับ TYPES ใน Step1Info.tsx ──
const REQUEST_TYPE_STYLE: Record<string, { icon: any; color: string; bg: string }> = {
  'รับคืนลดหนี้':     { icon: Receipt,        color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100' },
  'รับคืน CCR':       { icon: AlertTriangle,  color: 'text-red-700',     bg: 'bg-red-50 border-red-100'         },
  'รับคืนแลกเปลี่ยน': { icon: ArrowLeftRight, color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-100'       },
};
const DEFAULT_TYPE_STYLE = { icon: MoreHorizontal, color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200' };

export default function CSRDrugRow({ item, onUpdate }: { item: any; onUpdate: () => void }) {
  const isExchangeRequest = item.request_type === 'รับคืนแลกเปลี่ยน';
  const [productType, setProductType] = useState(item.product_type || '');
  const [status, setStatus] = useState({ pass: item.is_compliant, msg: item.compliance_remark || '' });
  const [localStatus, setLocalStatus] = useState(item.current_status);

  // Modal ยืนยันอนุมัติ/ปฏิเสธรายการยา (แทน prompt() เดิม)
  const [actionModal, setActionModal] = useState<'approve' | 'reject' | null>(null);
  const [remark, setRemark] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { setLocalStatus(item.current_status); }, [item.current_status]);

  const handleTypeChange = async (pType: string) => {
    setProductType(pType);
    const today = new Date();
    const expDate = new Date(item.exp_date);
    const diffInMonths = (expDate.getFullYear() - today.getFullYear()) * 12 + (expDate.getMonth() - today.getMonth());
    let result = { pass: true, msg: 'ผ่านเกณฑ์' };
    if (pType === 'GPO' && expDate < today && Math.abs(diffInMonths) > 6) {
      result = { pass: false, msg: 'GPO หมดอายุเกิน 6 เดือน' };
    } else if (pType === 'OTHER' && diffInMonths < 7) {
      result = { pass: false, msg: 'อายุคงเหลือไม่ถึง 7 เดือน' };
    }
    setStatus(result);
    await updateDrugCompliance(item.id, pType, result);
  };

  // เปิด modal แทนการเรียก prompt() เดิม
  const openActionModal = (action: 'approve' | 'reject') => {
    setRemark('');
    setReasonCode('');
    setActionModal(action);
  };

  const submitAction = async () => {
    if (!actionModal) return;
    setIsSubmitting(true);
    try {
      const res = actionModal === 'approve'
        ? await approveDrugItem(item.id, item.request_id, remark)
        : await rejectDrugItem(item.id, item.request_id, reasonCode, remark);

      if (res.success) {
        setLocalStatus(actionModal === 'approve' ? 'approved' : 'rejected');
        setActionModal(null);
        setRemark('');
        onUpdate(); // ★ แจ้ง parent ให้ refetch ข้อมูล — จำเป็นสำหรับ isAllItemsReviewed ที่ระดับ card
      } else {
        alert('เกิดข้อผิดพลาด: ' + (res as any).error);
      }
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Mobile: stack แนวตั้ง / Desktop: grid แนวนอน */}
      <div className="flex flex-col md:grid md:grid-cols-12 md:gap-3 gap-3 px-4 py-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-teal-200 hover:shadow-md transition-all">

        {/* ชื่อยา */}
        <div className="md:col-span-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5 md:hidden">ชื่อยา</p>
          <p className="text-sm font-bold text-slate-800">{item.drug_name}</p>
          {item.request_type && (() => {
            const typeStyle = REQUEST_TYPE_STYLE[item.request_type] ?? DEFAULT_TYPE_STYLE;
            const TypeIcon = typeStyle.icon;
            return (
              <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md border text-[9px] font-bold ${typeStyle.bg} ${typeStyle.color}`}>
                <TypeIcon size={10} strokeWidth={2.5} />
                {item.request_type}
              </span>
            );
          })()}
        </div>

        {/* จำนวน + Lot + Exp — mobile: row / desktop: แยก col */}
        <div className="flex gap-4 md:contents">
          <div className="md:col-span-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5 md:hidden">จำนวน</p>
            <p className="text-sm font-medium text-slate-600">{item.qty} {item.unit}</p>
          </div>
          <div className="md:col-span-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5 md:hidden">Lot</p>
            <p className="text-sm font-mono text-slate-500">{item.lot_number ?? '-'}</p>
          </div>
          <div className="md:col-span-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5 md:hidden">Exp</p>
            <p className="text-sm text-slate-500">
              {item.exp_date ? new Date(item.exp_date).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'}
            </p>
          </div>
        </div>

        {/* ประเภท + เกณฑ์ (เฉพาะแลกเปลี่ยน) */}
        {isExchangeRequest ? (
          <>
            <div className="md:col-span-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 md:hidden">ประเภท</p>
              <div className={`flex rounded-xl border border-slate-200 overflow-hidden text-[11px] font-bold transition-all
                ${localStatus !== 'pending_review' ? 'opacity-50 pointer-events-none' : ''}`}>
                <button
                  type="button"
                  onClick={() => handleTypeChange('GPO')}
                  className={`flex-1 py-2 px-2 text-center transition-all border-r border-slate-200
                    ${productType === 'GPO'
                      ? 'bg-teal-600 text-white border-r-teal-600'
                      : 'bg-white text-slate-400 hover:bg-teal-50 hover:text-teal-700'}`}
                >
                  GPO
                </button>
                <button
                  type="button"
                  onClick={() => handleTypeChange('OTHER')}
                  className={`flex-1 py-2 px-2 text-center transition-all
                    ${productType === 'OTHER'
                      ? 'bg-orange-500 text-white'
                      : 'bg-white text-slate-400 hover:bg-orange-50 hover:text-orange-600'}`}
                >
                  สมุนไพร/ผู้ผลิตอื่น
                </button>
              </div>
            </div>

            <div className="md:col-span-1 flex md:justify-center items-start md:items-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5 md:hidden mr-2 mt-1">เกณฑ์</p>
              {status.pass === true  ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-100">ผ่าน</span> :
               status.pass === false ? <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-black border border-red-100">ไม่ผ่าน</span> :
               <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">รอตรวจ</span>}
            </div>
          </>
        ) : (
          <div className="hidden md:block md:col-span-3" />
        )}

        {/* Actions */}
        <div className="md:col-span-3 flex justify-end gap-2 pt-1 md:pt-0 border-t border-slate-100 md:border-0">
          {localStatus === 'pending_review' ? (
            <>
              <button onClick={() => openActionModal('approve')}
                className="flex-1 md:flex-none px-3 py-2 md:py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-emerald-700 transition-all">
                อนุมัติ
              </button>
              <button onClick={() => openActionModal('reject')}
                className="flex-1 md:flex-none px-3 py-2 md:py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-red-600 transition-all">
                ปฏิเสธ
              </button>
            </>
          ) : (
            <span className={`text-xs font-bold ${localStatus === 'rejected' ? 'text-red-500' : 'text-emerald-600'}`}>
              {localStatus === 'rejected' ? 'ปฏิเสธแล้ว' : 'อนุมัติแล้ว'}
            </span>
          )}
        </div>
      </div>

      {/* ══ Confirm Modal: อนุมัติ/ปฏิเสธรายการยา พร้อมหมายเหตุ ══ */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div
              className="h-1.5"
              style={{
                background: actionModal === 'approve'
                  ? 'linear-gradient(90deg,#059669,#10b981)'
                  : 'linear-gradient(90deg,#dc2626,#f87171)',
              }}
            />

            <div className="p-7">
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: actionModal === 'approve' ? '#d1fae5' : '#fee2e2' }}
                >
                  {actionModal === 'approve'
                    ? <CheckCircle2 size={22} className="text-emerald-600" strokeWidth={2.5} />
                    : <AlertTriangle size={22} className="text-rose-600" strokeWidth={2.5} />}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-800">
                    {actionModal === 'approve' ? 'ยืนยันการอนุมัติรายการยา' : 'ยืนยันการปฏิเสธรายการยา'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{item.drug_name}</p>
                </div>
              </div>

              {actionModal === 'reject' ? (
                <ReasonSelectFields
                  label="เหตุผลที่ปฏิเสธ"
                  options={REJECTION_REASONS}
                  code={reasonCode}
                  detail={remark}
                  onCodeChange={setReasonCode}
                  onDetailChange={setRemark}
                />
              ) : (
                <>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                    หมายเหตุ
                  </label>
                  <textarea
                    rows={3}
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    placeholder="ระบุหมายเหตุ (ถ้ามี)..."
                    maxLength={500}
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all duration-200 resize-none placeholder:text-slate-300 mb-6"
                  />
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setActionModal(null); setRemark(''); setReasonCode(''); }}
                  disabled={isSubmitting}
                  className="py-3.5 rounded-2xl font-bold text-sm text-slate-500 bg-slate-50 border-2 border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={submitAction}
                  disabled={isSubmitting || (actionModal === 'reject' && (!reasonCode || (reasonCode === 'other' && !remark.trim())))}
                  className="py-3.5 rounded-2xl font-bold text-sm text-white transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{
                    background: actionModal === 'approve'
                      ? 'linear-gradient(135deg,#059669,#10b981)'
                      : 'linear-gradient(135deg,#dc2626,#f87171)',
                  }}
                >
                  {isSubmitting
                    ? <><Loader2 size={15} className="animate-spin" strokeWidth={2.5} /> กำลังบันทึก...</>
                    : <><Check size={15} strokeWidth={3} /> ยืนยัน</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}