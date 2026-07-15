'use client';
import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, Check } from 'lucide-react';
import { updateItemStatus, rejectItemStatus } from '@/app/actions/logistics-actions';

export default function LOGDrugRow({ item, reqStatus, onUpdate }: {
  item: any;
  reqStatus: string;
  onUpdate: (itemId: number, newStatus: 'at_warehouse' | 'rejected') => void;
}) {
  // Modal ยืนยันตรวจรับ/ปฏิเสธรายการยา (แทน prompt() เดิม)
  const [actionModal, setActionModal] = useState<'at_warehouse' | 'rejected' | null>(null);
  const [remark, setRemark] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // เปิด modal แทนการเรียก prompt() เดิม
  const openActionModal = (action: 'at_warehouse' | 'rejected') => {
    setRemark('');
    setActionModal(action);
  };

  const submitAction = async () => {
    if (!actionModal) return;
    setIsSubmitting(true);
    try {
      const res = actionModal === 'at_warehouse'
        ? await updateItemStatus(item.id, 'at_warehouse', remark || '')
        : await rejectItemStatus(item.id, remark || '');

      if (res.success) {
        onUpdate(item.id, actionModal);
        setActionModal(null);
        setRemark('');
      } else {
        alert('บันทึกไม่สำเร็จ: ' + (res as any).error);
      }
    } catch (err) {
      console.error('Error:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* ปรับ grid ให้รองรับทั้งสองขนาด */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 text-xs px-3 py-3 bg-white rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all items-center">

        {/* ชื่อยา (4 ส่วนบน Desktop) */}
        <div className="col-span-1 md:col-span-4 font-semibold text-slate-800 truncate">
          {item.drug_name}
        </div>

        {/* ข้อมูลยาอื่นๆ */}
        <div className="col-span-1 md:col-span-2 text-slate-500 font-medium">
          <span className="md:hidden text-[10px] text-slate-400">จำนวน: </span>
          {item.qty} {item.unit}
        </div>

        <div className="col-span-1 md:col-span-2 text-slate-400 font-mono truncate">
          <span className="md:hidden text-[10px] text-slate-400">LOT: </span>
          {item.lot_number ?? '—'}
        </div>

        {/* Action Buttons */}
        <div className="col-span-1 md:col-span-2 flex justify-end gap-1.5 mt-2 md:mt-0">
          {reqStatus === 'in_transit' &&
           item.current_status !== 'at_warehouse' &&
           item.current_status !== 'rejected' && (
            <>
              <button onClick={() => openActionModal('at_warehouse')}
                className="px-2.5 py-1.5 bg-teal-600 text-white rounded-lg text-[10px] font-bold hover:bg-teal-700 transition-all">ตรวจรับ</button>
              <button onClick={() => openActionModal('rejected')}
                className="px-2.5 py-1.5 bg-red-500 text-white rounded-lg text-[10px] font-bold hover:bg-red-600 transition-all">ปฏิเสธ</button>
            </>
          )}
          {item.current_status === 'at_warehouse' && <span className="text-[10px] text-teal-600 font-bold">ถึงคลังแล้ว</span>}
          {item.current_status === 'rejected'     && <span className="text-[10px] text-red-500 font-bold">ปฏิเสธแล้ว</span>}
        </div>
      </div>

      {/* ══ Confirm Modal: ตรวจรับ/ปฏิเสธรายการยา พร้อมหมายเหตุ ══ */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div
              className="h-1.5"
              style={{
                background: actionModal === 'at_warehouse'
                  ? 'linear-gradient(90deg,#0d9488,#14b8a6)'
                  : 'linear-gradient(90deg,#dc2626,#f87171)',
              }}
            />

            <div className="p-7">
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: actionModal === 'at_warehouse' ? '#ccfbf1' : '#fee2e2' }}
                >
                  {actionModal === 'at_warehouse'
                    ? <CheckCircle2 size={22} className="text-teal-600" strokeWidth={2.5} />
                    : <AlertTriangle size={22} className="text-rose-600" strokeWidth={2.5} />}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-800">
                    {actionModal === 'at_warehouse' ? 'ยืนยันการตรวจรับสินค้า' : 'ยืนยันการปฏิเสธรายการ'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{item.drug_name}</p>
                </div>
              </div>

              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                หมายเหตุ {actionModal === 'rejected' && <span className="text-rose-500">*จำเป็น</span>}
              </label>
              <textarea
                rows={3}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder={actionModal === 'at_warehouse' ? 'ระบุหมายเหตุการตรวจรับ...' : 'ระบุเหตุผลที่ปฏิเสธ...'}
                maxLength={500}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all duration-200 resize-none placeholder:text-slate-300 mb-6"
              />

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setActionModal(null); setRemark(''); }}
                  disabled={isSubmitting}
                  className="py-3.5 rounded-2xl font-bold text-sm text-slate-500 bg-slate-50 border-2 border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={submitAction}
                  disabled={isSubmitting || (actionModal === 'rejected' && !remark.trim())}
                  className="py-3.5 rounded-2xl font-bold text-sm text-white transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{
                    background: actionModal === 'at_warehouse'
                      ? 'linear-gradient(135deg,#0d9488,#14b8a6)'
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