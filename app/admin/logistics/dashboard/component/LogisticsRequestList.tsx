'use client';
import { useState } from 'react';
import { Inbox, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import LOGDrugRow from './LOGDrugrow';
import type { RequestRow, DrugItemRow } from '@/lib/types';

// ย้ายมาจาก app/admin/logistics/dashboard/page.tsx (เดิมอยู่ไฟล์เดียวกับหน้า dashboard) —
// ตอนนี้ใช้ร่วมกัน 2 หน้าย่อยที่แยก route จริงแล้ว (approved/page.tsx, in-transit/page.tsx
// แทนที่การสลับ tab แบบเดิม) จึงต้องแยกออกมาเป็น component กลาง
export const LOGISTICS_STATUS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  approved:     { label: 'อนุมัติรับคืนสินค้า',  color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     dot: 'bg-blue-500'   },
  in_transit:   { label: 'อยู่ระหว่างขนส่ง',     color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', dot: 'bg-indigo-500' },
  at_warehouse: { label: 'ถึงคลังแล้ว',          color: 'text-teal-700',   bg: 'bg-teal-50 border-teal-200',     dot: 'bg-teal-500'   },
  rejected:     { label: 'ถูกปฏิเสธ',            color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       dot: 'bg-red-500'    },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = LOGISTICS_STATUS[status] ?? { label: status, color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

const LOG_PAGE_SIZE = 5;

// ── รายการใบงาน + แบ่งหน้า 5 รายการ (เหมือน CSR Report Center) ใช้ร่วมกันทั้งหน้า
// "ส่งรถไปรับคืนสินค้า" และ "รถขนส่งรับคืนสินค้าถึงคลัง" ── ──
// ไม่มี wrapper <section>/border/rounded ของตัวเอง — ผู้เรียกใช้ (หน้า approved/in-transit)
// ห่อด้วยการ์ดของตัวเองแทน กันเห็นกรอบซ้อนกัน 2 ชั้น
export function LogisticsRequestList({
  items, expandedReq, setExpandedReq, onSendTruck, handleDrugItemUpdate, emptyText,
}: {
  items: RequestRow[];
  expandedReq: number | null;
  setExpandedReq: (id: number | null) => void;
  onSendTruck: (req: RequestRow) => void;
  handleDrugItemUpdate: (requestId: number, itemId: number, newStatus: 'at_warehouse' | 'rejected') => void;
  emptyText: string;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / LOG_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = items.slice((currentPage - 1) * LOG_PAGE_SIZE, currentPage * LOG_PAGE_SIZE);

  return (
    <>
      {/* Table header — desktop only */}
      {items.length > 0 && (
        <div className="hidden md:grid grid-cols-12 gap-4 px-7 py-3 bg-secondary border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          <div className="col-span-3">Ref ID</div>
          <div className="col-span-3">สถานะ</div>
          <div className="col-span-4">รายการสินค้า</div>
          <div className="col-span-2 text-right">Action</div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="py-10 md:py-14 text-center">
          <Inbox className="w-9 h-9 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.75} />
          <p className="text-sm text-muted-foreground font-medium">{emptyText}</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border">
            {pagedItems.map((req) => {
              const isExpanded = expandedReq === req.id;
              const drugCount  = req.drug_items?.length ?? 0;
              return (
                <div key={req.id} className="hover:bg-secondary/40 transition-colors">

                  {/* Desktop row */}
                  <div className="hidden md:grid grid-cols-12 gap-4 px-7 py-4 items-center">
                    <div className="col-span-3">
                      <p className="text-sm font-bold text-foreground font-mono">{req.ref_id}</p>
                      {req.hospital_name && <p className="text-xs text-muted-foreground mt-0.5 truncate">{req.hospital_name}</p>}
                    </div>
                    <div className="col-span-3"><StatusBadge status={req.current_status} /></div>
                    <div className="col-span-4">
                      <button onClick={() => setExpandedReq(isExpanded ? null : req.id)}
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary font-semibold transition-colors group">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-accent-foreground font-bold text-[11px] group-hover:bg-primary/15">
                          {drugCount}
                        </span>
                        รายการสินค้า
                        <ChevronDown size={14} strokeWidth={2.5} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    <div className="col-span-2 flex flex-col items-end gap-2">
                      {req.current_status === 'approved' && (
                        <button onClick={() => onSendTruck(req)}
                          className="px-4 py-2 rounded-md text-xs font-bold text-white active:scale-95 transition-colors w-full bg-blue-600 hover:bg-blue-700">
                          ส่งรถไปรับคืน
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mobile card */}
                  <div className="md:hidden px-4 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground font-mono">{req.ref_id}</p>
                        {req.hospital_name && <p className="text-xs text-muted-foreground mt-0.5 truncate">{req.hospital_name}</p>}
                      </div>
                      <StatusBadge status={req.current_status} />
                    </div>
                    <button onClick={() => setExpandedReq(isExpanded ? null : req.id)}
                      className="flex items-center gap-2 text-xs text-muted-foreground font-semibold w-full py-2 px-3 bg-secondary rounded-md hover:bg-accent hover:text-primary transition-colors">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-accent-foreground font-bold text-[11px]">{drugCount}</span>
                      รายการสินค้า
                      <ChevronDown size={14} strokeWidth={2.5} className={`ml-auto transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    <div className="flex gap-2">
                      {req.current_status === 'approved' && (
                        <button onClick={() => onSendTruck(req)}
                          className="flex-1 py-2.5 rounded-md text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-colors">
                          ส่งรถไปรับคืน
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Drug items expanded */}
                  {isExpanded && drugCount > 0 && (
                    <div className="px-4 md:px-7 pb-4">
                      <div className="hidden md:grid grid-cols-12 gap-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wide px-3 mb-1.5">
                        <div className="col-span-4">ชื่อยา</div>
                        <div className="col-span-2">จำนวน</div>
                        <div className="col-span-2">LOT</div>
                        <div className="col-span-2">หมดอายุ</div>
                        <div className="col-span-2 text-right">Action</div>
                      </div>
                      <div className="space-y-1.5">
                        {(req.drug_items ?? []).map((item: DrugItemRow) => (
                          <LOGDrugRow
                            key={item.id}
                            item={item}
                            reqStatus={req.current_status}
                            onUpdate={(itemId, newStatus) => handleDrugItemUpdate(req.id, itemId, newStatus)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-7 py-3.5 border-t border-border bg-secondary">
              <p className="text-xs text-muted-foreground">
                แสดง {(currentPage - 1) * LOG_PAGE_SIZE + 1}–{Math.min(currentPage * LOG_PAGE_SIZE, items.length)} จาก {items.length} รายการ
              </p>
              <div className="flex items-center gap-1 overflow-x-auto">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
                  aria-label="หน้าก่อนหน้า"
                >
                  <ChevronLeft size={16} strokeWidth={2.5} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                      p === currentPage ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
                  aria-label="หน้าถัดไป"
                >
                  <ChevronRight size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
