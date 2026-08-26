'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, Loader2, Check, X, Receipt, ArrowLeftRight, MoreHorizontal } from 'lucide-react';
import { updateDrugCompliance, approveDrugItem, rejectDrugItem } from '@/app/actions/csr-actions';
import ReasonSelectFields from '@/components/ReasonSelectFields';
import { REJECTION_REASONS } from '@/lib/rejection-reasons';
import { useToast } from '@/components/ui/toast';
import type { LucideIcon } from 'lucide-react';
import type { DrugItemRow } from '@/lib/types';

// ── Badge สำหรับแสดงประเภทคำร้อง — สีตรงกับ TYPES ใน Step1Info.tsx ──
const REQUEST_TYPE_STYLE: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  'รับคืนลดหนี้':     { icon: Receipt,        color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100' },
  'รับคืน CCR':       { icon: AlertTriangle,  color: 'text-red-700',     bg: 'bg-red-50 border-red-100'         },
  'รับคืนแลกเปลี่ยน': { icon: ArrowLeftRight, color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-100'       },
};
const DEFAULT_TYPE_STYLE = { icon: MoreHorizontal, color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200' };

type CSRDrugItem = DrugItemRow & { request_type?: string };

export default function CSRDrugRow({ item, onUpdate, readOnly }: { item: CSRDrugItem; onUpdate: () => void; readOnly?: boolean }) {
  const toast = useToast();
  const isExchangeRequest = item.request_type === 'รับคืนแลกเปลี่ยน';
  const [productType, setProductType] = useState(item.product_type || '');
  // ใบงาน "รับคืนแลกเปลี่ยน" ต้องเลือกประเภทสินค้าก่อน ถึงจะอนุมัติได้ — ปฏิเสธยังกดได้ตามปกติ
  const missingProductType = isExchangeRequest && !productType;
  const [status, setStatus] = useState({ pass: item.is_compliant, msg: item.compliance_remark || '' });
  const [localStatus, setLocalStatus] = useState(item.current_status);
  // บันทึกประเภทสินค้า/เกณฑ์ — เดิมอัปเดต UI ก่อนแล้วยิง server action แบบไม่เช็คผลเลย
  // ถ้า network พังตอนนั้น หน้าจอจะค้างโชว์ผลที่ไม่เคยถูกบันทึกจริงโดยไม่มีใครรู้
  const [isTypeSaving, setIsTypeSaving] = useState(false);

  // Modal ยืนยันอนุมัติ/ปฏิเสธรายการยา (แทน prompt() เดิม)
  const [actionModal, setActionModal] = useState<'approve' | 'reject' | null>(null);
  const [remark, setRemark] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { setLocalStatus(item.current_status); }, [item.current_status]);

  const handleTypeChange = async (pType: string) => {
    const prevType = productType;
    const prevStatus = status;

    setProductType(pType);

    let result: { pass: boolean | null; msg: string };
    if (!pType) {
      // ยกเลิกการเลือก — กลับไปสถานะ "รอตรวจ" เหมือนยังไม่เคยเลือก
      result = { pass: null, msg: '' };
    } else {
      const today = new Date();
      const expDate = new Date(item.exp_date || 0);
      const diffInMonths = (expDate.getFullYear() - today.getFullYear()) * 12 + (expDate.getMonth() - today.getMonth());
      result = { pass: true, msg: 'ผ่านเกณฑ์' };
      if (pType === 'GPO' && expDate < today && Math.abs(diffInMonths) > 6) {
        result = { pass: false, msg: 'GPO หมดอายุเกิน 6 เดือน' };
      } else if (pType === 'OTHER' && diffInMonths < 7) {
        result = { pass: false, msg: 'อายุคงเหลือไม่ถึง 7 เดือน' };
      }
    }
    setStatus(result);

    setIsTypeSaving(true);
    try {
      const res = await updateDrugCompliance(item.id, pType, result);
      if (!res.success) {
        setProductType(prevType);
        setStatus(prevStatus);
        toast.error(`บันทึกประเภทสินค้าไม่สำเร็จ: ${('error' in res && res.error) || 'ไม่ทราบสาเหตุ'}`);
      }
    } catch (err) {
      setProductType(prevType);
      setStatus(prevStatus);
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อ บันทึกประเภทสินค้าไม่สำเร็จ');
      console.error(err);
    } finally {
      setIsTypeSaving(false);
    }
  };

  // เปิด modal แทนการเรียก prompt() เดิม
  const openActionModal = (action: 'approve' | 'reject') => {
    setRemark('');
    setReasonCode('');
    setActionModal(action);
  };

  // ── "รับคืนแลกเปลี่ยน" เท่านั้น: หลังเลือกประเภทแล้วผล "เกณฑ์" (status.pass) คำนวณ
  // อัตโนมัติเสมอ (ดู handleTypeChange) ไม่ต้องให้ csr เลือกอนุมัติ/ปฏิเสธเองซ้ำอีกชั้น —
  // ปุ่ม "ยืนยัน" เดียวเปิด modal เดิม โดยเลือก action ให้ตรงกับผลเกณฑ์ที่คำนวณไว้แล้ว
  // (pass=true -> approve, pass=false -> reject พร้อม prefill เหตุผลจาก status.msg)
  const openConfirmModal = () => {
    if (status.pass === false) {
      setReasonCode('other');
      setRemark(status.msg || '');
      setActionModal('reject');
    } else {
      setRemark('');
      setReasonCode('');
      setActionModal('approve');
    }
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
        toast.error(('error' in res && res.error) || 'ไม่ทราบสาเหตุ');
      }
    } catch (err) {
      console.error(err);
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Mobile: stack แนวตั้ง / Desktop: grid แนวนอน */}
      <div className="flex flex-col md:grid md:grid-cols-12 md:gap-3 gap-3 px-4 py-4 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-sm hover:border-[#2E2B7A]/30 hover:shadow-md transition-all">

        {/* ชื่อยา */}
        <div className="md:col-span-3">
          <p className="text-[10px] font-bold text-[#6B6698] uppercase tracking-wide mb-0.5 md:hidden">ชื่อยา</p>
          <p className="text-sm font-bold text-[#241F5E]">{item.drug_name}</p>
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
            <p className="text-[10px] font-bold text-[#6B6698] uppercase tracking-wide mb-0.5 md:hidden">จำนวน</p>
            <p className="text-sm font-medium text-[#241F5E]/80">{item.qty} {item.unit}</p>
          </div>
          <div className="md:col-span-1">
            <p className="text-[10px] font-bold text-[#6B6698] uppercase tracking-wide mb-0.5 md:hidden">Lot</p>
            <p className="text-sm font-mono text-[#6B6698]">{item.lot_number ?? '-'}</p>
          </div>
          <div className="md:col-span-1">
            <p className="text-[10px] font-bold text-[#6B6698] uppercase tracking-wide mb-0.5 md:hidden">Exp</p>
            <p className="text-sm text-[#6B6698]">
              {item.exp_date ? new Date(item.exp_date).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'}
            </p>
          </div>
        </div>

        {/* ประเภท + เกณฑ์ (เฉพาะแลกเปลี่ยน) */}
        {isExchangeRequest ? (
          <>
            <div className="md:col-span-2">
              <p className="text-[10px] font-bold text-[#6B6698] uppercase tracking-wide mb-1 md:hidden">ประเภท</p>
              {readOnly ? (
                <span className="inline-flex px-2.5 py-1 rounded-lg bg-[#F1EDE0] text-[#6B6698] text-[11px] font-bold">
                  {productType === 'GPO' ? 'GPO' : productType === 'OTHER' ? 'สมุนไพร/ผู้ผลิตอื่น' : 'ยังไม่ระบุ'}
                </span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <div className={`relative flex-1 flex rounded-xl border border-[#EADFAF] overflow-hidden text-[11px] font-bold transition-all
                    ${localStatus !== 'pending_review' || isTypeSaving ? 'opacity-50 pointer-events-none' : ''}`}>
                    <button
                      type="button"
                      onClick={() => handleTypeChange('GPO')}
                      className={`flex-1 py-2 px-2 text-center transition-all border-r border-[#EADFAF]
                        ${productType === 'GPO'
                          ? 'bg-[#2E2B7A] text-white border-r-[#2E2B7A]'
                          : 'bg-white text-[#A7A2C4] hover:bg-[#ECEAF6] hover:text-[#2E2B7A]'}`}
                    >
                      GPO
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTypeChange('OTHER')}
                      className={`flex-1 py-2 px-2 text-center transition-all
                        ${productType === 'OTHER'
                          ? 'bg-[#E1592A] text-white'
                          : 'bg-white text-[#A7A2C4] hover:bg-[#FBEFE6] hover:text-[#E1592A]'}`}
                    >
                      สมุนไพร/ผู้ผลิตอื่น
                    </button>
                    {isTypeSaving && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                        <Loader2 size={13} className="animate-spin text-slate-500" strokeWidth={2.5} />
                      </div>
                    )}
                  </div>
                  {productType && localStatus === 'pending_review' && (
                    <button
                      type="button"
                      onClick={() => handleTypeChange('')}
                      disabled={isTypeSaving}
                      title="ยกเลิกการเลือกประเภท"
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <X size={13} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              )}
              {!readOnly && missingProductType && localStatus === 'pending_review' && (
                <p className="text-[10px] font-bold text-red-500 mt-1">* กรุณาเลือกประเภทก่อนอนุมัติ</p>
              )}
            </div>

            <div className="md:col-span-1 flex md:justify-center items-start md:items-center">
              <p className="text-[10px] font-bold text-[#6B6698] uppercase tracking-wide mb-0.5 md:hidden mr-2 mt-1">เกณฑ์</p>
              {status.pass === true  ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-100">ผ่าน</span> :
               status.pass === false ? <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-black border border-red-100">ไม่ผ่าน</span> :
               <span className="px-2.5 py-1 rounded-full bg-[#F1EDE0] text-[#6B6698] text-[10px] font-bold">รอตรวจ</span>}
            </div>
          </>
        ) : (
          <div className="hidden md:block md:col-span-3" />
        )}

        {/* Actions — ซ่อนทั้งหมดเมื่อ readOnly (ใช้กับ "ประวัติใบงาน" ที่เป็นแค่ดูข้อมูล) */}
        <div className="md:col-span-3 flex justify-end gap-2 pt-1 md:pt-0 border-t border-[#EADFAF] md:border-0">
          {!readOnly && localStatus === 'pending_review' ? (
            isExchangeRequest ? (
              // ★ รับคืนแลกเปลี่ยน: เหลือปุ่มเดียว — ผล อนุมัติ/ปฏิเสธ มาจากผล "เกณฑ์" ที่คำนวณ
              // อัตโนมัติตอนเลือกประเภทแล้ว (ดู openConfirmModal) ไม่ให้ csr เลือกเองอีกชั้น
              <button onClick={openConfirmModal}
                disabled={missingProductType}
                title={missingProductType ? 'กรุณาเลือกประเภทสินค้าก่อนยืนยัน' : undefined}
                className={`flex-1 md:flex-none px-3 py-2 md:py-1.5 text-white rounded-lg text-xs font-bold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed
                  ${status.pass === false ? 'bg-red-500 hover:bg-red-600 disabled:hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-700 disabled:hover:bg-emerald-600'}`}>
                ยืนยัน
              </button>
            ) : (
              <>
                <button onClick={() => openActionModal('approve')}
                  disabled={missingProductType}
                  title={missingProductType ? 'กรุณาเลือกประเภทสินค้าก่อนอนุมัติ' : undefined}
                  className="flex-1 md:flex-none px-3 py-2 md:py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-600">
                  อนุมัติ
                </button>
                <button onClick={() => openActionModal('reject')}
                  className="flex-1 md:flex-none px-3 py-2 md:py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-red-600 transition-all">
                  ปฏิเสธ
                </button>
              </>
            )
          ) : localStatus === 'pending_review' ? (
            <span className="text-xs font-bold text-amber-600">รอตรวจสอบ</span>
          ) : (
            <span className={`text-xs font-bold ${localStatus === 'rejected' ? 'text-red-500' : 'text-emerald-600'}`}>
              {localStatus === 'rejected' ? 'ปฏิเสธแล้ว' : 'อนุมัติแล้ว'}
            </span>
          )}
        </div>
      </div>

      {/* ══ Confirm Modal: อนุมัติ/ปฏิเสธรายการยา พร้อมหมายเหตุ — render ผ่าน portal ตรงไปที่
          document.body (ไม่ใช่ลูกของแถวในลิสต์) กัน fixed inset-0 โดนบีบกรอบ ถ้าแถวอยู่ในสาย
          ancestor ที่มี transform (เช่น hover:-translate-y-* บนการ์ดแม่) ซึ่งจะเปลี่ยน containing
          block ของ position:fixed จาก viewport เป็นกรอบนั้นแทน ทำให้ modal เพี้ยนตำแหน่ง/ขนาด ══ */}
      {actionModal && createPortal(
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
                  <h3 className="text-base font-bold text-foreground">
                    {actionModal === 'approve' ? 'ยืนยันการอนุมัติรายการยา' : 'ยืนยันการปฏิเสธรายการยา'}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.drug_name}</p>
                </div>
              </div>

              {actionModal === 'reject' && isExchangeRequest ? (
                // ★ เหตุผลมาจากผล "เกณฑ์" อัตโนมัติแล้ว (ดู openConfirmModal) — ไม่ให้เลือก
                // เหตุผลปฏิเสธเองซ้ำเหมือน flow ปกติ แค่โชว์ผลที่คำนวณได้ + แก้หมายเหตุเพิ่มได้
                <>
                  <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100">
                    <p className="text-[11px] font-bold text-red-700 uppercase tracking-wide mb-1">เหตุผล (จากผลเกณฑ์อัตโนมัติ)</p>
                    <p className="text-sm text-red-800">{status.msg || 'ไม่ผ่านเกณฑ์'}</p>
                  </div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">
                    หมายเหตุเพิ่มเติม
                  </label>
                  <textarea
                    rows={2}
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    maxLength={500}
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm text-foreground focus:outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all duration-200 resize-none mb-6"
                  />
                </>
              ) : actionModal === 'reject' ? (
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
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">
                    หมายเหตุ
                  </label>
                  <textarea
                    rows={3}
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    placeholder="ระบุหมายเหตุ (ถ้ามี)..."
                    maxLength={500}
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm text-foreground focus:outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all duration-200 resize-none placeholder:text-slate-300 mb-6"
                  />
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setActionModal(null); setRemark(''); setReasonCode(''); }}
                  disabled={isSubmitting}
                  className="py-3.5 rounded-2xl font-bold text-sm text-muted-foreground bg-slate-50 border-2 border-border hover:bg-slate-100 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={submitAction}
                  disabled={
                    isSubmitting ||
                    (actionModal === 'reject' && (!reasonCode || (reasonCode === 'other' && !remark.trim()))) ||
                    (actionModal === 'approve' && missingProductType)
                  }
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
        </div>,
        document.body
      )}
    </>
  );
}