'use client';

import { useState } from 'react';
import { stampCheckedIn, stampReceiving, rejectWHItem } from '@/app/actions/wh-actions';

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

// ── WH Drug Row ───────────────────────────────────────────────
export default function WHDrugRow({ item, reqConfirmed, onUpdate }: {
  item: any;
  reqConfirmed: boolean;
  onUpdate: (itemId: number, newStatus: 'checked_in' | 'receiving' | 'rejected') => void;
}) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAction = async (action: 'checked_in' | 'receiving' | 'rejected', remark?: string) => {
    setIsProcessing(true);
    try {

      let res;
      if (action === 'checked_in') {
        res = await stampCheckedIn(item.id, 'ตรวจรับเรียบร้อย');
      } else if (action === 'receiving') {
        res = await stampReceiving(item.id, 'จัดเก็บเข้าคลังแล้ว');
      } else {
        res = await rejectWHItem(item.id, remark || "ปฏิเสธรายการ");
      }

      if (res?.success) {
        onUpdate(item.id, action);
      } else {
        alert('บันทึกไม่สำเร็จ: ' + (res as any)?.error);
      }
    } catch (err) {
      console.error("Error:", err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-3 items-center px-4 py-3 bg-white rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/20 transition-all duration-150">
      <div className="col-span-4">
        <p className="text-sm font-bold text-slate-800 truncate">{item.drug_name}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
          <span>🏷️</span> {item.lot_number ?? '—'}
        </p>
      </div>
      <div className="col-span-2 text-xs text-slate-400">
        {item.exp_date ? new Date(item.exp_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
      </div>
      <div className="col-span-2 text-xs font-bold text-slate-600 text-right">
        {item.qty} <span className="font-normal text-slate-400">{item.unit}</span>
      </div>
      <div className="col-span-2">
        <StatusBadge status={item.current_status} />
      </div>

      {/* Action Area */}
      <div className="col-span-2 flex justify-end gap-1.5">
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
                onClick={() => {
                  const remark = prompt("ระบุเหตุผลที่ปฏิเสธ:");
                  if (remark && remark.trim() !== "") handleAction('rejected', remark);
                }}
                className="px-2 py-1.5 rounded-lg text-[9px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-all"
              >X ปฏิเสธ</button>
            )}

            {/* ปุ่มรับเข้า */}
            {item.current_status === 'at_warehouse' && (
              <button
                onClick={() => handleAction('checked_in')}
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
                onClick={() => handleAction('receiving')}
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
    </div>
  );
}