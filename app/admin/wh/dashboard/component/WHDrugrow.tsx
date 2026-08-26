'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, PackageCheck, Loader2, Check, Tag, X } from 'lucide-react';
import { stampCheckedIn, stampReceiving, rejectWHItem } from '@/app/actions/wh-actions';
import ReasonSelectFields from '@/components/ReasonSelectFields';
import { REJECTION_REASONS } from '@/lib/rejection-reasons';
import { resolveQuickNote } from '@/lib/quick-note';
import { useToast } from '@/components/ui/toast';
import type { DrugItemRow } from '@/lib/types';

// หมายเหตุตรวจสภาพ/จัดเก็บ — preset ให้เลือกเร็วๆ ไม่ต้องพิมพ์เองทุกครั้ง (ยังพิมพ์
// เพิ่มเติมได้ผ่าน "อื่นๆ") ไม่มีคอลัมน์ enum แยกเก็บเพราะยังไม่มีสถิติใดต้อง group
// ตามหมายเหตุฝั่งนี้ — ดู lib/quick-note.ts
const WH_CHECKED_IN_NOTES = [
  { code: 'condition_good', label: 'สภาพสินค้าสมบูรณ์ ไม่มีความเสียหาย' },
  { code: 'packaging_intact', label: 'บรรจุภัณฑ์อยู่ในสภาพดี' },
  { code: 'matches_document', label: 'ตรงตามรายการในเอกสาร' },
  { code: 'other', label: 'อื่นๆ' },
] as const;

const WH_RECEIVING_NOTES = [
  { code: 'stored_normal', label: 'จัดเก็บเข้าคลังตามปกติ' },
  { code: 'stored_priority', label: 'จัดเก็บพื้นที่เฉพาะ/ลำดับความสำคัญ' },
  { code: 'other', label: 'อื่นๆ' },
] as const;

// ── Status Config ──────────────────────────────────────────────
export const WH_STATUS: Record<string, { label: string; color: string; bg: string; dot: string; border: string }> = {
  at_warehouse: { label: 'รอตรวจรับ',       color: 'text-rose-700', bg: 'bg-rose-50',  dot: 'bg-rose-400',  border: 'border-rose-200' },
  checked_in:   { label: 'ตรวจรับแล้ว',     color: 'text-teal-700', bg: 'bg-teal-50',  dot: 'bg-teal-500',  border: 'border-teal-200' },
  receiving:    { label: 'จัดเก็บเข้าคลัง', color: 'text-blue-700', bg: 'bg-blue-50',  dot: 'bg-blue-500',  border: 'border-blue-200' },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = WH_STATUS[status] ?? { label: status, color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-400', border: 'border-slate-200' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

type ActionModal = 'checked_in' | 'receiving' | 'rejected' | null;

const MODAL_META: Record<Exclude<ActionModal, null>, {
  title: string; icon: typeof Check; iconBg: string; iconColor: string; solidBg: string; notes?: readonly { code: string; label: string }[];
}> = {
  checked_in: {
    title: 'ยืนยันการตรวจรับสินค้า',
    icon: CheckCircle2,
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-600',
    solidBg: 'bg-teal-600 hover:bg-teal-700',
    notes: WH_CHECKED_IN_NOTES,
  },
  receiving: {
    title: 'ยืนยันการจัดเก็บเข้าคลัง',
    icon: PackageCheck,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    solidBg: 'bg-blue-600 hover:bg-blue-700',
    notes: WH_RECEIVING_NOTES,
  },
  rejected: {
    title: 'ยืนยันการปฏิเสธรายการ',
    icon: AlertTriangle,
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-600',
    solidBg: 'bg-rose-600 hover:bg-rose-700',
    notes: undefined, // ใช้ REJECTION_REASONS แทน
  },
};

// ── WH Drug Row ───────────────────────────────────────────────
export default function WHDrugRow({ item, reqConfirmed, onUpdate }: {
  item: DrugItemRow;
  reqConfirmed: boolean;
  onUpdate: (itemId: number, newStatus: 'checked_in' | 'receiving' | 'rejected') => void;
}) {
  const toast = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [detail, setDetail] = useState('');

  const openActionModal = (action: Exclude<ActionModal, null>) => {
    setReasonCode('');
    setDetail('');
    setActionModal(action);
  };

  const submitAction = async () => {
    if (!actionModal) return;
    setIsProcessing(true);
    try {
      const res = actionModal === 'checked_in'
        ? await stampCheckedIn(item.id, resolveQuickNote(WH_CHECKED_IN_NOTES, reasonCode, detail))
        : actionModal === 'receiving'
        ? await stampReceiving(item.id, resolveQuickNote(WH_RECEIVING_NOTES, reasonCode, detail))
        : await rejectWHItem(item.id, reasonCode, detail);

      if (res.success) {
        onUpdate(item.id, actionModal);
        setActionModal(null);
      } else {
        toast.error(`บันทึกไม่สำเร็จ: ${res.error || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'}`);
      }
    } catch (err) {
      console.error("Error:", err);
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setIsProcessing(false);
    }
  };

  const meta = actionModal ? MODAL_META[actionModal] : null;
  const ModalIcon = meta?.icon;

  return (
    <div className="grid grid-cols-2 md:grid-cols-12 gap-2 md:gap-3 items-start md:items-center px-4 py-3 bg-card rounded-md border border-border hover:border-primary/30 transition-colors">
      <div className="col-span-2 md:col-span-4">
        <p className="text-sm font-bold text-foreground truncate">{item.drug_name}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
          <Tag size={11} strokeWidth={2.5} /> {item.lot_number ?? '—'}
        </p>
      </div>
      <div className="col-span-1 md:col-span-2 text-xs text-muted-foreground">
        <span className="md:hidden text-[11px] text-muted-foreground">หมดอายุ: </span>
        {item.exp_date ? new Date(item.exp_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
      </div>
      <div className="col-span-1 md:col-span-2 text-xs font-bold text-foreground text-left md:text-right">
        <span className="md:hidden text-[11px] font-normal text-muted-foreground">จำนวน: </span>
        {item.qty} <span className="font-normal text-muted-foreground">{item.unit}</span>
      </div>
      <div className="col-span-1 md:col-span-2">
        <StatusBadge status={item.current_status ?? ''} />
      </div>

      {/* Action Area */}
      <div className="col-span-1 md:col-span-2 flex justify-start md:justify-end gap-1.5 flex-wrap">
        {isProcessing ? (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <div className="w-3 h-3 border-2 border-muted-foreground/40 border-t-transparent rounded-full animate-spin" />
            <span className="text-[11px] font-bold">กำลังบันทึก...</span>
          </div>
        ) : (
          <>
            {/* ปุ่มอนุมัติ/ปฏิเสธ (รอตรวจรับ) — สีทึบตัน คงโทนสีเดิมของ WH (teal=checked_in,
                rose=rejected) ให้ตรงกับ WH_STATUS ด้านบน */}
            {item.current_status === 'at_warehouse' && (
              <button
                onClick={() => openActionModal('checked_in')}
                className="flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-2 md:py-1.5 bg-teal-600 text-white rounded-md text-xs font-bold hover:bg-teal-700 transition-colors"
              ><Check size={13} strokeWidth={3} /> อนุมัติ</button>
            )}

            {/* ปุ่มปฏิเสธ: แสดงในขั้นตอน at_warehouse และ checked_in (ที่ยังไม่ผ่านจัดเก็บ) */}
            {item.current_status === 'at_warehouse' && (
              <button
                onClick={() => openActionModal('rejected')}
                className="flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-2 md:py-1.5 bg-rose-600 text-white rounded-md text-xs font-bold hover:bg-rose-700 transition-colors"
              ><X size={13} strokeWidth={3} /> ปฏิเสธ</button>
            )}

            {/* สถานะตรวจรับแล้ว (รอ confirm ทั้งใบ) */}
            {item.current_status === 'checked_in' && !reqConfirmed && (
              <span className="text-[11px] font-bold text-teal-600 flex items-center gap-1"><Check size={11} strokeWidth={3} /> ตรวจรับแล้ว</span>
            )}

            {/* ปุ่มจัดเก็บ (หลัง confirm ทั้งใบแล้ว) */}
            {item.current_status === 'checked_in' && reqConfirmed && (
              <button
                onClick={() => openActionModal('receiving')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-colors"
              ><PackageCheck size={11} strokeWidth={2.5} /> จัดเก็บ</button>
            )}

            {/* สถานะหลังจัดเก็บแล้ว */}
            {item.current_status === 'receiving' && (
              <span className="text-[11px] font-bold text-blue-600 flex items-center gap-1"><Check size={11} strokeWidth={3} /> จัดเก็บแล้ว</span>
            )}

            {/* สถานะปฏิเสธ */}
            {item.current_status === 'rejected' && (
              <span className="text-[11px] font-bold text-rose-600 flex items-center gap-1"><X size={11} strokeWidth={3} /> ปฏิเสธแล้ว</span>
            )}
          </>
        )}
      </div>

      {/* ══ Confirm Modal: ตรวจรับ/จัดเก็บ/ปฏิเสธรายการยา พร้อมหมายเหตุ — render ผ่าน portal
          ตรงไปที่ document.body มาตรฐานเดียวกับ CSRDrugRow.tsx กัน fixed inset-0 โดนบีบกรอบ
          ถ้าแถวอยู่ในสาย ancestor ที่มี transform (เช่น hover:-translate-y-* บนการ์ดแม่) ══ */}
      {actionModal && meta && ModalIcon && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-card rounded-lg shadow-lg overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div className={`h-1.5 ${meta.solidBg}`} />

            <div className="p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${meta.iconBg}`}>
                  <ModalIcon size={22} className={meta.iconColor} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-foreground">{meta.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.drug_name}</p>
                </div>
              </div>

              <ReasonSelectFields
                label={actionModal === 'rejected' ? 'เหตุผลที่ปฏิเสธ' : 'หมายเหตุ'}
                options={actionModal === 'rejected' ? REJECTION_REASONS : meta.notes!}
                code={reasonCode}
                detail={detail}
                onCodeChange={setReasonCode}
                onDetailChange={setDetail}
              />

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setActionModal(null)}
                  disabled={isProcessing}
                  className="py-3.5 rounded-md font-bold text-sm text-muted-foreground bg-secondary border border-border hover:bg-muted transition-colors active:scale-[0.98] disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={submitAction}
                  disabled={isProcessing || !reasonCode || (reasonCode === 'other' && !detail.trim())}
                  className={`py-3.5 rounded-md font-bold text-sm text-white transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${meta.solidBg}`}
                >
                  {isProcessing
                    ? <><Loader2 size={15} className="animate-spin" strokeWidth={2.5} /> กำลังบันทึก...</>
                    : <><Check size={15} strokeWidth={3} /> ยืนยัน</>}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
