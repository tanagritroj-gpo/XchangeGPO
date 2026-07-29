'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, PackageCheck, Loader2, Check } from 'lucide-react';
import { stampCheckedIn, stampReceiving, rejectWHItem } from '@/app/actions/wh-actions';
import ReasonSelectFields from '@/components/ReasonSelectFields';
import { REJECTION_REASONS } from '@/lib/rejection-reasons';
import { resolveQuickNote } from '@/lib/quick-note';

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
  title: string; icon: typeof Check; iconBg: string; iconColor: string; gradient: string; notes?: readonly { code: string; label: string }[];
}> = {
  checked_in: {
    title: 'ยืนยันการตรวจรับสินค้า',
    icon: CheckCircle2,
    iconBg: '#ccfbf1',
    iconColor: 'text-teal-600',
    gradient: 'linear-gradient(135deg,#0f766e,#14b8a6)',
    notes: WH_CHECKED_IN_NOTES,
  },
  receiving: {
    title: 'ยืนยันการจัดเก็บเข้าคลัง',
    icon: PackageCheck,
    iconBg: '#dbeafe',
    iconColor: 'text-blue-600',
    gradient: 'linear-gradient(135deg,#1d4ed8,#3b82f6)',
    notes: WH_RECEIVING_NOTES,
  },
  rejected: {
    title: 'ยืนยันการปฏิเสธรายการ',
    icon: AlertTriangle,
    iconBg: '#fee2e2',
    iconColor: 'text-rose-600',
    gradient: 'linear-gradient(135deg,#dc2626,#f87171)',
    notes: undefined, // ใช้ REJECTION_REASONS แทน
  },
};

// ── WH Drug Row ───────────────────────────────────────────────
export default function WHDrugRow({ item, reqConfirmed, onUpdate }: {
  item: any;
  reqConfirmed: boolean;
  onUpdate: (itemId: number, newStatus: 'checked_in' | 'receiving' | 'rejected') => void;
}) {
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
        alert('บันทึกไม่สำเร็จ: ' + res.error);
      }
    } catch (err) {
      console.error("Error:", err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setIsProcessing(false);
    }
  };

  const meta = actionModal ? MODAL_META[actionModal] : null;
  const ModalIcon = meta?.icon;

  return (
    <div className="grid grid-cols-2 md:grid-cols-12 gap-2 md:gap-3 items-start md:items-center px-4 py-3 bg-white rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/20 transition-all duration-150">
      <div className="col-span-2 md:col-span-4">
        <p className="text-sm font-bold text-slate-800 truncate">{item.drug_name}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
          <span>🏷️</span> {item.lot_number ?? '—'}
        </p>
      </div>
      <div className="col-span-1 md:col-span-2 text-xs text-slate-400">
        <span className="md:hidden text-[10px] text-slate-400">หมดอายุ: </span>
        {item.exp_date ? new Date(item.exp_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
      </div>
      <div className="col-span-1 md:col-span-2 text-xs font-bold text-slate-600 text-left md:text-right">
        <span className="md:hidden text-[10px] font-normal text-slate-400">จำนวน: </span>
        {item.qty} <span className="font-normal text-slate-400">{item.unit}</span>
      </div>
      <div className="col-span-1 md:col-span-2">
        <StatusBadge status={item.current_status} />
      </div>

      {/* Action Area */}
      <div className="col-span-1 md:col-span-2 flex justify-start md:justify-end gap-1.5 flex-wrap">
        {isProcessing ? (
          <div className="flex items-center gap-1.5 text-slate-500">
            <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-[9px] font-bold">กำลังบันทึก...</span>
          </div>
        ) : (
          <>
            {/* ปุ่มปฏิเสธ: แสดงในขั้นตอน at_warehouse และ checked_in (ที่ยังไม่ผ่านจัดเก็บ) */}
            {item.current_status === 'at_warehouse' && (
              <button
                onClick={() => openActionModal('rejected')}
                className="px-2 py-1.5 rounded-lg text-[9px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-all"
              >X ปฏิเสธ</button>
            )}

            {/* ปุ่มรับเข้า */}
            {item.current_status === 'at_warehouse' && (
              <button
                onClick={() => openActionModal('checked_in')}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all"
                style={{ background: 'linear-gradient(135deg,#0f766e,#14b8a6)' }}
              >✓ ผ่าน</button>
            )}

            {/* สถานะตรวจรับแล้ว (รอ confirm ทั้งใบ) */}
            {item.current_status === 'checked_in' && !reqConfirmed && (
              <span className="text-[10px] font-bold text-teal-600 flex items-center gap-1">✓ ตรวจรับแล้ว</span>
            )}

            {/* ปุ่มจัดเก็บ (หลัง confirm ทั้งใบแล้ว) */}
            {item.current_status === 'checked_in' && reqConfirmed && (
              <button
                onClick={() => openActionModal('receiving')}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all"
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)' }}
              >📦 จัดเก็บ</button>
            )}

            {/* สถานะหลังจัดเก็บแล้ว */}
            {item.current_status === 'receiving' && (
              <span className="text-[10px] font-bold text-blue-500 flex items-center gap-1">✓ จัดเก็บแล้ว</span>
            )}

            {/* สถานะปฏิเสธ */}
            {item.current_status === 'rejected' && (
              <span className="text-[10px] font-bold text-rose-500">❌ ปฏิเสธแล้ว</span>
            )}
          </>
        )}
      </div>

      {/* ══ Confirm Modal: ตรวจรับ/จัดเก็บ/ปฏิเสธรายการยา พร้อมหมายเหตุ ══ */}
      {actionModal && meta && ModalIcon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 col-span-12">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div className="h-1.5" style={{ background: meta.gradient }} />

            <div className="p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: meta.iconBg }}>
                  <ModalIcon size={22} className={meta.iconColor} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-800">{meta.title}</h3>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{item.drug_name}</p>
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
                  className="py-3.5 rounded-2xl font-bold text-sm text-slate-500 bg-slate-50 border-2 border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={submitAction}
                  disabled={isProcessing || !reasonCode || (reasonCode === 'other' && !detail.trim())}
                  className="py-3.5 rounded-2xl font-bold text-sm text-white transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: meta.gradient }}
                >
                  {isProcessing
                    ? <><Loader2 size={15} className="animate-spin" strokeWidth={2.5} /> กำลังบันทึก...</>
                    : <><Check size={15} strokeWidth={3} /> ยืนยัน</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
