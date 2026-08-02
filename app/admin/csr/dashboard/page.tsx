'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ClipboardList,
  ChevronDown,
  Check,
  X,
  XCircle,
  Loader2,
  Pill,
  RefreshCw,
  CheckCircle2,
  Inbox,
  AlertTriangle,
  ClipboardCheck,
  Clock,
  History,
  ClipboardEdit,
  Eye,
  ChevronLeft,
  ChevronRight,
  Truck,
  Warehouse,
} from 'lucide-react';
import { getStatusMeta } from '@/lib/tracking-status';
import {
  getCSRDashboardData,
  approveRequest,
  rejectRequest,
  startExchangeProcess,
  completeRequest,
} from '@/app/actions/csr-actions';
import { getStaffSession } from '@/app/actions/auth-staff';
import CSRDrugRow from './component/CSRDrugRow';
import ReasonSelectFields from '@/components/ReasonSelectFields';
import { REJECTION_REASONS } from '@/lib/rejection-reasons';
import { resolveQuickNote } from '@/lib/quick-note';
import { StatCard } from '@/components/StatCard';
import type { LucideIcon } from 'lucide-react';
import type { RequestRow, DrugItemRow } from '@/lib/types';

// หมายเหตุตอนเริ่มกระบวนการแลกเปลี่ยน — preset ให้เลือกเร็วๆ (ยังพิมพ์เพิ่มเติมได้
// ผ่าน "อื่นๆ") ไม่มีคอลัมน์ enum แยกเก็บเพราะยังไม่มีสถิติใดต้อง group ตามหมายเหตุ
// ฝั่งนี้ — ดู lib/quick-note.ts
const START_EXCHANGE_NOTES = [
  { code: 'debt_reduction', label: 'เริ่มลดหนี้' },
  { code: 'exchange', label: 'เริ่มแลกเปลี่ยน' },
  { code: 'other', label: 'อื่นๆ' },
] as const;

// ── Status config: คงค่าเดิมทั้งหมด แค่ปรับให้ใช้ token สีสม่ำเสมอขึ้น ──
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending_review:   { label: 'รอตรวจสอบ',       color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     dot: 'bg-amber-400'   },
  approved:         { label: 'อนุมัติแล้ว',      color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  receiving:        { label: 'กำลังรับสินค้า',   color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       dot: 'bg-blue-500'    },
  exchanging:       { label: 'กำลังแลกเปลี่ยน', color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200',   dot: 'bg-purple-500'  },
  completed:        { label: 'เสร็จสิ้น',        color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200',   dot: 'bg-orange-500'  },
  out_for_delivery: { label: 'กำลังส่งคืน',      color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200',   dot: 'bg-indigo-500'  },
  at_warehouse:     { label: 'ถึงคลังสินค้า',    color: 'text-rose-700',    bg: 'bg-rose-50 border-rose-200',       dot: 'bg-rose-500'    },
  checked_in:       { label: 'ตรวจรับแล้ว',      color: 'text-teal-700',    bg: 'bg-teal-50 border-teal-200',       dot: 'bg-teal-500'    },
  rejected:         { label: 'ถูกปฏิเสธ',        color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         dot: 'bg-red-500'     },
  in_transit:       { label: 'อยู่ระหว่างขนส่ง', color: 'text-cyan-700',    bg: 'bg-cyan-50 border-cyan-200',       dot: 'bg-cyan-500'    },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── ปุ่ม tab บน sidebar ฝั่งซ้าย (desktop) / แนวนอนเลื่อนได้ (mobile) ──
function TabButton({ icon: Icon, label, count, active, onClick, accentBg, accentColor }: {
  icon: LucideIcon; label: string; count: number; active: boolean; onClick: () => void;
  accentBg: string; accentColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 shrink-0 md:w-full text-left border
        ${active
          ? 'bg-white shadow-sm border-border text-foreground'
          : 'bg-transparent border-transparent text-muted-foreground hover:bg-white/70 hover:text-slate-700'}`}
    >
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${active ? accentBg : 'bg-slate-100'}`}>
        <Icon size={15} className={active ? accentColor : 'text-muted-foreground'} strokeWidth={2.5} />
      </span>
      <span className="whitespace-nowrap md:whitespace-normal md:flex-1">{label}</span>
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${active ? `${accentBg} ${accentColor}` : 'bg-slate-100 text-muted-foreground'}`}>
        {count}
      </span>
    </button>
  );
}

// ── Sub-tab แนวนอนแบบ segmented control (สำหรับสลับ CSR Workflow / Active Workflow ภายใน tab "จัดการใบงาน") ──
function SubTabButton({ icon: Icon, label, count, active, onClick, accentColor }: {
  icon: LucideIcon; label: string; count: number; active: boolean; onClick: () => void; accentColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200
        ${active ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-slate-700'}`}
    >
      <Icon size={15} className={active ? accentColor : 'text-muted-foreground'} strokeWidth={2.5} />
      {label}
      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/70 text-muted-foreground'}`}>
        {count}
      </span>
    </button>
  );
}

function ActionButton({ icon: Icon, label, onClick, tone, loading }: {
  icon: LucideIcon; label: string; onClick: () => void;
  tone: 'blue' | 'red' | 'orange' | 'emerald';
  loading?: boolean;
}) {
  const tones = {
    blue:    'bg-blue-600 hover:bg-blue-700 shadow-blue-200',
    red:     'bg-rose-500 hover:bg-rose-600 shadow-rose-200',
    orange:  'bg-orange-500 hover:bg-orange-600 shadow-orange-200',
    emerald: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200',
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all w-full disabled:opacity-60 disabled:pointer-events-none ${tones[tone]}`}
    >
      {loading ? <Loader2 size={14} className="animate-spin" strokeWidth={2.5} /> : <Icon size={14} strokeWidth={2.5} />}
      {label}
    </button>
  );
}

// ── ปุ่มตัดสินใจระดับใบงาน (อนุมัติ/ปฏิเสธ) — outline ที่ fill สีตอน hover ดูพรีเมียมกว่าปุ่มทึบ ──
function WorkflowDecisionButton({ icon: Icon, label, onClick, tone }: {
  icon: LucideIcon; label: string; onClick: () => void; tone: 'approve' | 'reject';
}) {
  const styles = {
    approve: {
      wrap: 'border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 hover:shadow-emerald-200',
      icon: 'bg-emerald-100 text-emerald-600 group-hover:bg-white/25 group-hover:text-white',
    },
    reject: {
      wrap: 'border-rose-200 bg-rose-50/70 text-rose-700 hover:bg-rose-600 hover:text-white hover:border-rose-600 hover:shadow-rose-200',
      icon: 'bg-rose-100 text-rose-600 group-hover:bg-white/25 group-hover:text-white',
    },
  };
  const s = styles[tone];
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-2 px-3.5 py-2.5 rounded-xl border-2 text-xs font-bold transition-all duration-200 active:scale-95 hover:-translate-y-0.5 hover:shadow-md w-full justify-center ${s.wrap}`}
    >
      <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors duration-200 ${s.icon}`}>
        <Icon size={11} strokeWidth={3} />
      </span>
      {label}
    </button>
  );
}

// ใบงานพร้อมให้อนุมัติ/ปฏิเสธระดับ card ก็ต่อเมื่อรายการยาทุกตัวถูกจัดการแล้ว (ไม่มีตัวไหนค้าง pending_review)
const isAllItemsReviewed = (req: RequestRow) =>
  (req.drug_items?.length ?? 0) > 0 &&
  (req.drug_items ?? []).every((item) => item.current_status !== 'pending_review');

// วันที่เริ่มสร้างใบงาน — ใช้ในคอลัมน์ "วันที่" ของ "ประวัติใบงาน" เท่านั้น
const formatRequestDate = (createdAt: string | null) =>
  new Date(createdAt || 0).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });

// สถานะที่ CSR เป็นคนกดอัปเดตเอง (มีปุ่ม action ให้กดใน RequestListSection)
// สถานะอื่นนอกจากนี้ (approved, in_transit, at_warehouse, checked_in, out_for_delivery) เป็นของฝ่าย log/wh — CSR แค่มอนิเตอร์
const CSR_ACTIONABLE_STATUSES = ['pending_review', 'receiving', 'exchanging'];

// ── ส่วนแสดงรายการใบงาน — logic เหมือนกันทุกอย่าง แค่รับ items แยกกันเพื่อแยกหัวข้อ ──
// pageSize เป็น optional — ใส่ค่าถึงจะแบ่งหน้า (เผื่ออนาคตรายการเยอะขึ้น) ไม่ใส่ = แสดง
// ทั้งหมดแบบเดิม (คงพฤติกรรมเดิมของแท็บ CSR Workflow ที่ยังไม่ต้องแบ่งหน้า)
function RequestListSection({
  title, icon: Icon, iconBg, iconColor, subtitle, items,
  expandedReq, setExpandedReq, openConfirmModal, openExchangeModal, handleUpdateStatus, fetchData,
  emptyIcon: EmptyIcon, emptyText, completingId, pageSize, readOnly,
}: {
  title: string; icon: LucideIcon; iconBg: string; iconColor: string; subtitle: string; items: RequestRow[];
  expandedReq: number | null; setExpandedReq: (id: number | null) => void;
  openConfirmModal: (requestId: number, action: 'approved' | 'rejected') => void;
  openExchangeModal: (requestId: number) => void;
  handleUpdateStatus: (id: number, newStatus: string) => void;
  fetchData: (opts?: { silent?: boolean }) => void;
  emptyIcon: LucideIcon; emptyText: string; completingId: number | null; pageSize?: number; readOnly?: boolean;
}) {
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [items]);

  const totalPages = pageSize ? Math.max(1, Math.ceil(items.length / pageSize)) : 1;
  const currentPage = Math.min(page, totalPages);
  const pagedItems = pageSize ? items.slice((currentPage - 1) * pageSize, currentPage * pageSize) : items;

  return (
    <section>
      <div className="flex items-center gap-2.5 mb-3 px-1">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
          <Icon size={16} className={iconColor} strokeWidth={2.5} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        {items.length > 0 && (
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-2.5 bg-slate-50 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-3">Ref ID</div>
            <div className="col-span-2">สถานะ</div>
            <div className="col-span-5">รายการสินค้า</div>
            <div className="col-span-2 text-right">{readOnly ? 'วันที่' : 'การดำเนินการ'}</div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="py-12 text-center">
            <EmptyIcon className="w-9 h-9 text-slate-300 mx-auto mb-2.5" strokeWidth={1.75} />
            <p className="text-sm text-muted-foreground font-medium">{emptyText}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {pagedItems.map((req: RequestRow) => {
              const isExpanded = expandedReq === req.id;
              const drugCount  = req.drug_items?.length ?? 0;
              return (
                <div
                  key={req.id}
                  className={`group relative transition-colors ${isExpanded ? 'bg-teal-50/70' : 'hover:bg-teal-50/50'}`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 w-[3px] transition-opacity duration-150 ${
                      isExpanded ? 'bg-teal-600 opacity-100' : 'bg-teal-400 opacity-0 group-hover:opacity-100'
                    }`}
                  />

                  {/* Desktop row */}
                  <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 items-center">
                    <div className="col-span-3">
                      <p className="text-sm font-bold text-foreground font-mono">{req.ref_id}</p>
                      {req.hospital_name && <p className="text-xs text-muted-foreground mt-0.5 truncate">{req.hospital_name}</p>}
                    </div>
                    <div className="col-span-2"><StatusBadge status={req.current_status} /></div>
                    <div className="col-span-5">
                      <button
                        onClick={() => setExpandedReq(isExpanded ? null : req.id)}
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-teal-700 font-medium transition-colors group"
                      >
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-50 text-teal-600 font-bold text-[10px] group-hover:bg-teal-100">
                          {drugCount}
                        </span>
                        รายการสินค้า
                        <ChevronDown size={14} strokeWidth={2.5} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    <div className="col-span-2 flex flex-col items-end gap-2">
                      {!readOnly && req.current_status === 'pending_review' && (
                        isAllItemsReviewed(req) ? (
                          <>
                            <WorkflowDecisionButton icon={Check} label="อนุมัติ" tone="approve" onClick={() => openConfirmModal(req.id, 'approved')} />
                            <WorkflowDecisionButton icon={X} label="ปฏิเสธใบงาน" tone="reject" onClick={() => openConfirmModal(req.id, 'rejected')} />
                          </>
                        ) : (
                          <p className="text-[10px] text-muted-foreground text-right leading-snug flex items-center gap-1 justify-end">
                            <ClipboardCheck size={12} strokeWidth={2.5} />
                            ตรวจรายการยาให้ครบก่อน
                          </p>
                        )
                      )}
                      {!readOnly && req.current_status === 'receiving' && (
                        <ActionButton icon={RefreshCw} label="เริ่มแลกเปลี่ยน" tone="orange" onClick={() => openExchangeModal(req.id)} />
                      )}
                      {!readOnly && req.current_status === 'exchanging' && (
                        <ActionButton icon={CheckCircle2} label="เสร็จสิ้น" tone="emerald" loading={completingId === req.id} onClick={() => handleUpdateStatus(req.id, 'completed')} />
                      )}
                      {readOnly && (
                        <p className="text-xs font-semibold text-muted-foreground">{formatRequestDate(req.created_at)}</p>
                      )}
                    </div>
                  </div>

                  {/* Mobile card */}
                  <div className="md:hidden px-4 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground font-mono">{req.ref_id}</p>
                        {req.hospital_name && <p className="text-xs text-muted-foreground mt-0.5 truncate">{req.hospital_name}</p>}
                        {readOnly && <p className="text-[11px] text-muted-foreground mt-0.5">{formatRequestDate(req.created_at)}</p>}
                      </div>
                      <StatusBadge status={req.current_status} />
                    </div>

                    <button
                      onClick={() => setExpandedReq(isExpanded ? null : req.id)}
                      className="flex items-center gap-2 text-xs text-muted-foreground font-medium w-full py-2 px-3 bg-slate-50 rounded-xl hover:bg-teal-50 hover:text-teal-700 transition-colors"
                    >
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-50 text-teal-600 font-bold text-[10px]">{drugCount}</span>
                      รายการสินค้า
                      <ChevronDown size={14} strokeWidth={2.5} className={`ml-auto transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {!readOnly && (
                      <div className="flex gap-2">
                        {req.current_status === 'pending_review' && (
                          isAllItemsReviewed(req) ? (
                            <>
                              <WorkflowDecisionButton icon={Check} label="อนุมัติ" tone="approve" onClick={() => openConfirmModal(req.id, 'approved')} />
                              <WorkflowDecisionButton icon={X} label="ปฏิเสธ" tone="reject" onClick={() => openConfirmModal(req.id, 'rejected')} />
                            </>
                          ) : (
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 py-2">
                              <ClipboardCheck size={13} strokeWidth={2.5} />
                              ตรวจรายการยาให้ครบก่อนอนุมัติ/ปฏิเสธ
                            </p>
                          )
                        )}
                        {req.current_status === 'receiving' && (
                          <ActionButton icon={RefreshCw} label="เริ่มแลกเปลี่ยน" tone="orange" onClick={() => openExchangeModal(req.id)} />
                        )}
                        {req.current_status === 'exchanging' && (
                          <ActionButton icon={CheckCircle2} label="เสร็จสิ้น" tone="emerald" loading={completingId === req.id} onClick={() => handleUpdateStatus(req.id, 'completed')} />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Drug items expanded */}
                  {isExpanded && drugCount > 0 && (
                    <div className="px-4 md:px-6 pb-4">
                      <div className="hidden md:grid grid-cols-12 gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wide px-3 mb-1.5">
                        <div className="col-span-3">ชื่อยา</div>
                        <div className="col-span-1">จำนวน</div>
                        <div className="col-span-1 text-center">Lot</div>
                        <div className="col-span-1 text-center">Exp</div>
                        <div className="col-span-2">ประเภท</div>
                        <div className="col-span-1 text-center">เกณฑ์</div>
                        <div className="col-span-3 text-right">{readOnly ? 'สถานะ' : 'Actions'}</div>
                      </div>
                      <div className="space-y-2 md:space-y-1.5">
                        {(req.drug_items ?? []).map((item: DrugItemRow) => (
                          <CSRDrugRow
                            key={item.id}
                            item={{ ...item, request_type: req.request_type ?? undefined }}
                            onUpdate={() => fetchData({ silent: true })}
                            readOnly={readOnly}
                          />
                        ))}
                      </div>
                      {(req.drug_items ?? []).some((i: DrugItemRow) => i.value_amount) && (
                        <div className="mt-3 flex justify-end">
                          <div className="flex items-center gap-2 bg-teal-50 border border-teal-100 rounded-xl px-4 py-2 text-xs">
                            <Pill size={13} className="text-teal-500" strokeWidth={2.5} />
                            <span className="text-muted-foreground">มูลค่ารวม:</span>
                            <span className="font-bold text-teal-700">
                              ฿{(req.drug_items ?? []).reduce((s: number, i: DrugItemRow) => s + (Number(i.value_amount) || 0), 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pageSize && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-3 px-1">
          <p className="text-xs text-muted-foreground">
            แสดง {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, items.length)} จาก {items.length} รายการ
          </p>
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
              aria-label="หน้าก่อนหน้า"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                  p === currentPage ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-slate-200'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
              aria-label="หน้าถัดไป"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ลำดับ pipeline จริงของ "Active Workflow" (สถานะที่ log/wh เป็นคนอัปเดต CSR แค่มอนิเตอร์)
// เรียงตามลำดับที่ใบงานเคลื่อนผ่านจริง: อนุมัติ → ขนส่งไปรับ → ถึงคลัง → ตรวจรับ → จัดส่งคืน
const MONITOR_STAGE_ORDER = ['approved', 'in_transit', 'at_warehouse', 'checked_in', 'out_for_delivery'];

// ฝ่ายที่รับผิดชอบอยู่ ณ สถานะนั้นๆ — approved/in_transit/out_for_delivery เป็นช่วงที่
// ของอยู่บนรถ/รอรถ (โลจิสติกส์) ส่วน at_warehouse/checked_in คือของถึง/อยู่ในคลังแล้ว (คลังสินค้า)
const MONITOR_STAGE_ROLE: Record<string, { label: string; icon: LucideIcon; color: string; bg: string }> = {
  approved:         { label: 'โลจิสติกส์', icon: Truck,     color: 'text-blue-700',   bg: 'bg-blue-50' },
  in_transit:       { label: 'โลจิสติกส์', icon: Truck,     color: 'text-blue-700',   bg: 'bg-blue-50' },
  at_warehouse:     { label: 'คลังสินค้า', icon: Warehouse, color: 'text-purple-700', bg: 'bg-purple-50' },
  checked_in:       { label: 'คลังสินค้า', icon: Warehouse, color: 'text-purple-700', bg: 'bg-purple-50' },
  out_for_delivery: { label: 'โลจิสติกส์', icon: Truck,     color: 'text-blue-700',   bg: 'bg-blue-50' },
};

// การ์ดใบงาน 1 ใบในกระดาน — read-only ไม่มีปุ่ม action เพราะสถานะกลุ่มนี้ log/wh
// เป็นคนอัปเดต ไม่ใช่ CSR (ต่างจาก CSRDrugRow ที่มีปุ่มอนุมัติ/ปฏิเสธสำหรับ workflow ของ CSR เอง)
function MonitorBoardCard({ req, isExpanded, onToggle }: { req: RequestRow; isExpanded: boolean; onToggle: () => void }) {
  const drugCount = req.drug_items?.length ?? 0;
  const totalValue = req.drug_items?.reduce((s: number, i: DrugItemRow) => s + (Number(i.value_amount) || 0), 0) ?? 0;
  const role = MONITOR_STAGE_ROLE[req.current_status];
  const RoleIcon = role?.icon;
  return (
    <div className="bg-white rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-black text-foreground font-mono truncate">{req.ref_id}</p>
        {role && (
          <span className={`flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-bold ${role.bg} ${role.color}`}>
            <RoleIcon className="w-2.5 h-2.5" strokeWidth={2.5} />
            {role.label}
          </span>
        )}
      </div>
      {req.hospital_name && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{req.hospital_name}</p>}

      <button
        onClick={onToggle}
        className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-teal-700 font-semibold transition-colors"
      >
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-teal-50 text-teal-600 font-bold text-[9px]">{drugCount}</span>
        รายการสินค้า
        <ChevronDown size={12} strokeWidth={2.5} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && drugCount > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
          {(req.drug_items ?? []).map((item: DrugItemRow) => (
            <div key={item.id} className="text-[10.5px] bg-slate-50 rounded-lg px-2 py-1.5">
              <p className="font-bold text-slate-700 truncate">{item.drug_name}</p>
              <p className="text-muted-foreground mt-0.5">
                {item.qty} {item.unit}{item.lot_number ? ` · Lot ${item.lot_number}` : ''}
              </p>
            </div>
          ))}
          {totalValue > 0 && (
            <p className="text-right text-[10.5px] font-bold text-teal-700 pt-0.5">
              ฿{totalValue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── กระดานภาพรวม "Active Workflow" — จัดกลุ่มใบงานตามสถานะจริงเป็นบล็อกเรียงแนวตั้ง
// ทีละสถานะ (บนลงล่าง) ให้เห็นภาพรวมทั้ง pipeline ขนส่ง/คลังโดยไม่ต้องเลื่อนแนวนอน
// การ์ดภายในแต่ละบล็อกจัดเป็น grid responsive ใช้พื้นที่แนวนอนที่ว่างจากการเลิกเป็นคอลัมน์แคบๆ ──
function MonitorBoard({ items, expandedReq, setExpandedReq }: {
  items: RequestRow[]; expandedReq: number | null; setExpandedReq: (id: number | null) => void;
}) {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-3 px-1">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
          <Eye size={16} className="text-indigo-600" strokeWidth={2.5} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground">Active Workflow</h2>
          <p className="text-[11px] text-muted-foreground">{items.length} ใบงานกำลังดำเนินการโดยฝ่ายขนส่ง/คลังสินค้า — จัดกลุ่มตามสถานะจริง</p>
        </div>
      </div>

      <div className="space-y-3">
        {MONITOR_STAGE_ORDER.map((statusKey) => {
          const cfg = STATUS_CONFIG[statusKey];
          const colItems = items.filter((r) => r.current_status === statusKey);
          const meta = getStatusMeta(statusKey);
          const StageIcon = meta.icon;
          return (
            <div key={statusKey} className="bg-slate-50 rounded-2xl border border-border p-3">
              <div className="flex items-center gap-2 mb-3 px-0.5">
                <span className={`flex items-center justify-center w-6 h-6 rounded-lg shrink-0 ${meta.bg}`}>
                  <StageIcon className={`w-3.5 h-3.5 ${meta.fg}`} strokeWidth={2.5} />
                </span>
                <span className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
                <span className="ml-auto text-[10px] font-bold text-muted-foreground bg-white px-1.5 py-0.5 rounded-full border border-border">
                  {colItems.length}
                </span>
              </div>
              {colItems.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-6">ไม่มีใบงาน</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {colItems.map((req) => (
                    <MonitorBoardCard
                      key={req.id}
                      req={req}
                      isExpanded={expandedReq === req.id}
                      onToggle={() => setExpandedReq(expandedReq === req.id ? null : req.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function CSRDashboard() {
  const router = useRouter();
  const [requests, setRequests]       = useState<RequestRow[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [expandedReq, setExpandedReq] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [workflowSubTab, setWorkflowSubTab] = useState<'csr' | 'monitor'>('csr');
  // ตัวกรองด่วนจากแถบสถิติด้านบน — ข้ามระบบแท็บ/แท็บย่อยไปแสดงเฉพาะกลุ่มสถานะที่กด
  // null = ไม่ได้กรอง (แสดงตามแท็บ/แท็บย่อยปกติ) — คลิกแท็บ/แท็บย่อยเดิมจะล้างตัวกรองนี้เสมอ
  const [statusFilter, setStatusFilter] = useState<'pending_review' | 'in_progress' | 'completed' | 'rejected' | null>(null);

  // Modal ยืนยันอนุมัติ/ปฏิเสธใบงาน (พร้อมหมายเหตุ) — เปิดเมื่อรายการยาครบทุกตัวแล้วเท่านั้น
  const [confirmModal, setConfirmModal] = useState<{ requestId: number; action: 'approved' | 'rejected' } | null>(null);
  const [remark, setRemark] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // request id ที่กำลังกด "เสร็จสิ้น" อยู่ — กันปุ่มค้างไม่มี feedback ระหว่างรอ server action
  const [completingId, setCompletingId] = useState<number | null>(null);

  // Modal ยืนยันเริ่มกระบวนการแลกเปลี่ยน (แทน prompt() เดิม)
  const [exchangeModal, setExchangeModal] = useState<{ requestId: number } | null>(null);
  const [exchangeReasonCode, setExchangeReasonCode] = useState('');
  const [exchangeDetail, setExchangeDetail] = useState('');

  const fetchData = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true);
    const data = await getCSRDashboardData();
    if (data.success) { setRequests(data.requests || []); }
    if (!opts?.silent) setIsLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const session = await getStaffSession();
      if (!session?.id) { router.replace('/login'); return; }
      await fetchData();
    };
    init();
  }, []);

  // ใช้กับปุ่มที่ยังเป็น prompt แบบเดิม (เสร็จสิ้น) — ไม่เกี่ยวกับ approve/reject ระดับ card อีกต่อไป
  // "เริ่มแลกเปลี่ยน" แยกไปใช้ exchangeModal ด้านล่างแล้ว (มี dropdown แทน prompt)
  const handleUpdateStatus = async (id: number, newStatus: string) => {
    const remarkInput = prompt('ระบุหมายเหตุ:');
    if (remarkInput === null) return;
    setCompletingId(id);
    try {
      if (newStatus !== 'completed') { alert('สถานะไม่รู้จัก'); return; }
      const res = await completeRequest(id, remarkInput || '');
      if (res.success) { alert('อัปเดตสถานะเรียบร้อย'); fetchData(); }
      else alert('Error: ' + (('error' in res && res.error) || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'));
    } catch (err) { alert('เกิดข้อผิดพลาดในการเชื่อมต่อ'); console.error(err); }
    finally { setCompletingId(null); }
  };

  // เปิด modal เริ่มแลกเปลี่ยน แทนการเรียก prompt() เดิม
  const openExchangeModal = (requestId: number) => {
    setExchangeReasonCode('');
    setExchangeDetail('');
    setExchangeModal({ requestId });
  };

  const submitExchangeModal = async () => {
    if (!exchangeModal) return;
    setIsSubmitting(true);
    try {
      const remarkText = resolveQuickNote(START_EXCHANGE_NOTES, exchangeReasonCode, exchangeDetail);
      const res = await startExchangeProcess(exchangeModal.requestId, remarkText);
      if (res.success) {
        setExchangeModal(null);
        fetchData();
      } else {
        alert('Error: ' + (('error' in res && res.error) || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'));
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // เปิด modal ยืนยัน อนุมัติ/ปฏิเสธ ใบงาน (แสดงได้ก็ต่อเมื่อรายการยาครบทุกตัวแล้ว)
  const openConfirmModal = (requestId: number, action: 'approved' | 'rejected') => {
    setRemark('');
    setReasonCode('');
    setConfirmModal({ requestId, action });
  };

  const handleConfirmSubmit = async () => {
    if (!confirmModal) return;
    setIsSubmitting(true);
    try {
      const { requestId, action } = confirmModal;
      const res = action === 'approved'
        ? await approveRequest(requestId, remark)
        : await rejectRequest(requestId, reasonCode, remark);

      if (res.success) {
        setConfirmModal(null);
        setRemark('');
        fetchData();
      } else {
        alert('Error: ' + (('error' in res && res.error) || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'));
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // แยกใบงาน active ออกจากใบงานที่จบแล้ว (completed/rejected) เพื่อไม่ให้ปนกันในรายการเดียว
  const activeRequests  = requests.filter(r => r.current_status !== 'completed' && r.current_status !== 'rejected');
  // "ประวัติใบงาน" แสดงใบงานทุกสถานะ (ไม่กรองเฉพาะ completed/rejected อีกต่อไป) — เป็น log
  // รวมทุกใบงานที่เคยเข้าระบบ แยกจาก "จัดการใบงาน" ที่โฟกัสเฉพาะรายการที่ต้องดำเนินการ
  // เรียงตามวันที่สร้างใหม่สุดก่อนเสมอ (ไม่พึ่งพา order จาก query อย่างเดียว กันกรณีลำดับเปลี่ยนในอนาคต)
  const historyRequestsSorted = [...requests].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );

  // แยกใบงาน active อีกชั้น: ที่ CSR ต้องอัปเดตเอง vs ที่ log/wh อัปเดต (CSR แค่มอนิเตอร์)
  const csrWorkflowRequests     = activeRequests.filter(r => CSR_ACTIONABLE_STATUSES.includes(r.current_status));
  const monitorWorkflowRequests = activeRequests.filter(r => !CSR_ACTIONABLE_STATUSES.includes(r.current_status));

  // ── นับจำนวนต่อกลุ่มสำหรับแถบสถิติด้านบน ──
  const pendingReviewCount = requests.filter(r => r.current_status === 'pending_review').length;
  const inProgressCount    = activeRequests.length - pendingReviewCount;
  const completedCount     = requests.filter(r => r.current_status === 'completed').length;
  const rejectedCount      = requests.filter(r => r.current_status === 'rejected').length;

  // ── เลือก item ที่จะแสดงตามตัวกรองด่วน (ถ้ามี) — ใช้แทนที่เนื้อหาแท็บ/แท็บย่อยปกติ ──
  const statFilterMeta: Record<string, { title: string; subtitle: string; items: RequestRow[]; icon: LucideIcon; iconBg: string; iconColor: string }> = {
    pending_review: {
      title: 'รอตรวจสอบ', subtitle: `${pendingReviewCount} ใบงานรอตรวจสอบ`, items: requests.filter(r => r.current_status === 'pending_review'),
      icon: Clock, iconBg: 'bg-amber-100', iconColor: 'text-amber-600',
    },
    in_progress: {
      title: 'กำลังดำเนินการ', subtitle: `${inProgressCount} ใบงานกำลังดำเนินการ (CSR + ฝ่ายขนส่ง/คลัง)`, items: activeRequests.filter(r => r.current_status !== 'pending_review'),
      icon: RefreshCw, iconBg: 'bg-blue-100', iconColor: 'text-blue-600',
    },
    completed: {
      title: 'เสร็จสิ้น', subtitle: `${completedCount} ใบงานเสร็จสิ้น`, items: requests.filter(r => r.current_status === 'completed'),
      icon: CheckCircle2, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600',
    },
    rejected: {
      title: 'ถูกปฏิเสธ', subtitle: `${rejectedCount} ใบงานถูกปฏิเสธ`, items: requests.filter(r => r.current_status === 'rejected'),
      icon: XCircle, iconBg: 'bg-rose-100', iconColor: 'text-rose-600',
    },
  };

  // คลิกแท็บ/แท็บย่อยเดิมล้างตัวกรองด่วนเสมอ กันสับสนว่าทำไมกดแท็บแล้วเนื้อหาไม่เปลี่ยน
  const selectTab = (tab: 'active' | 'history') => { setStatusFilter(null); setActiveTab(tab); };
  const selectWorkflowSubTab = (tab: 'csr' | 'monitor') => { setStatusFilter(null); setWorkflowSubTab(tab); };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <Loader2 className="w-9 h-9 text-teal-600 animate-spin mx-auto" strokeWidth={2.5} />
        <p className="text-sm text-muted-foreground font-medium">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">

      {/* ══ Top Bar ══ */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={() => router.replace('/admin/csr')}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-all group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-slate-200 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-bold text-foreground leading-tight truncate">CSR Dashboard</h1>
              <p className="text-[10px] md:text-[11px] text-muted-foreground hidden sm:block">GPO Xchange Portal</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-5 md:space-y-7">

        {/* ── แถบสถิติสรุป — คลิกได้จริง กดแล้วกระโดดไปดูเฉพาะกลุ่มสถานะนั้นทันที ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          <StatCard
            icon={ClipboardList} value={requests.length} label="ใบงานรวม" iconBg="bg-slate-100" iconText="text-slate-600"
            isActive={statusFilter === null && activeTab === 'history'} activeBorder="border-slate-300" activeRing="ring-2 ring-slate-100"
            onClick={() => selectTab('history')}
          />
          <StatCard
            icon={Clock} value={pendingReviewCount} label="รอตรวจสอบ" iconBg="bg-amber-50" iconText="text-amber-600"
            isActive={statusFilter === 'pending_review'} activeBorder="border-amber-300" activeRing="ring-2 ring-amber-100"
            onClick={() => setStatusFilter('pending_review')}
          />
          <StatCard
            icon={RefreshCw} value={inProgressCount} label="กำลังดำเนินการ" iconBg="bg-blue-50" iconText="text-blue-600"
            isActive={statusFilter === 'in_progress'} activeBorder="border-blue-300" activeRing="ring-2 ring-blue-100"
            onClick={() => setStatusFilter('in_progress')}
          />
          <StatCard
            icon={CheckCircle2} value={completedCount} label="เสร็จสิ้น" iconBg="bg-emerald-50" iconText="text-emerald-600"
            isActive={statusFilter === 'completed'} activeBorder="border-emerald-300" activeRing="ring-2 ring-emerald-100"
            onClick={() => setStatusFilter('completed')}
          />
          <StatCard
            icon={XCircle} value={rejectedCount} label="ถูกปฏิเสธ" iconBg="bg-rose-50" iconText="text-rose-600"
            isActive={statusFilter === 'rejected'} activeBorder="border-rose-300" activeRing="ring-2 ring-rose-100"
            onClick={() => setStatusFilter('rejected')}
          />
        </div>

        <div className="flex flex-col md:flex-row gap-4 md:gap-8">

          {/* ══ Sidebar Tabs (แนวตั้ง — ตัด "ลูกค้าที่รออนุมัติ" ออก ย้ายไปหน้าแยกแล้ว) ══ */}
          <aside className="md:w-60 shrink-0">
            <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible -mx-1 px-1 md:mx-0 md:px-0 pb-1 md:pb-0">
              <TabButton
                icon={ClipboardList} label="จัดการใบงาน" count={activeRequests.length}
                active={statusFilter === null && activeTab === 'active'} onClick={() => selectTab('active')}
                accentBg="bg-blue-100" accentColor="text-blue-600"
              />
              <TabButton
                icon={History} label="ประวัติใบงาน" count={requests.length}
                active={statusFilter === null && activeTab === 'history'} onClick={() => selectTab('history')}
                accentBg="bg-slate-200" accentColor="text-slate-600"
              />
            </nav>
          </aside>

          {/* ══ Content ══ */}
          <div className="flex-1 min-w-0">

            {statusFilter ? (
              <RequestListSection
                title={statFilterMeta[statusFilter].title}
                icon={statFilterMeta[statusFilter].icon}
                iconBg={statFilterMeta[statusFilter].iconBg}
                iconColor={statFilterMeta[statusFilter].iconColor}
                subtitle={statFilterMeta[statusFilter].subtitle}
                items={statFilterMeta[statusFilter].items}
                expandedReq={expandedReq}
                setExpandedReq={setExpandedReq}
                openConfirmModal={openConfirmModal}
                openExchangeModal={openExchangeModal}
                handleUpdateStatus={handleUpdateStatus}
                completingId={completingId}
                fetchData={fetchData}
                emptyIcon={Inbox}
                emptyText="ไม่มีใบงานในกลุ่มนี้"
              />
            ) : (
            <>
            {activeTab === 'active' && (
            <div>
              {/* ── Sub-tab แนวนอน (segmented control) ── */}
              <div className="inline-flex items-center gap-1 p-1 mb-4 rounded-xl bg-slate-100">
                <SubTabButton
                  icon={ClipboardEdit} label="CSR Workflow" count={csrWorkflowRequests.length}
                  active={workflowSubTab === 'csr'} onClick={() => selectWorkflowSubTab('csr')}
                  accentColor="text-blue-600"
                />
                <SubTabButton
                  icon={Eye} label="Active Workflow" count={monitorWorkflowRequests.length}
                  active={workflowSubTab === 'monitor'} onClick={() => selectWorkflowSubTab('monitor')}
                  accentColor="text-indigo-600"
                />
              </div>

              {workflowSubTab === 'csr' && (
                <RequestListSection
                  title="CSR Workflow"
                  icon={ClipboardEdit}
                  iconBg="bg-blue-100"
                  iconColor="text-blue-600"
                  subtitle={`${csrWorkflowRequests.length} ใบงานที่ CSR ต้องดำเนินการ`}
                  items={csrWorkflowRequests}
                  expandedReq={expandedReq}
                  setExpandedReq={setExpandedReq}
                  openConfirmModal={openConfirmModal}
                  openExchangeModal={openExchangeModal}
                  handleUpdateStatus={handleUpdateStatus}
                  completingId={completingId}
                  fetchData={fetchData}
                  emptyIcon={Inbox}
                  emptyText="ไม่มีใบงานที่ต้องดำเนินการตอนนี้"
                />
              )}

              {workflowSubTab === 'monitor' && (
                <MonitorBoard
                  items={monitorWorkflowRequests}
                  expandedReq={expandedReq}
                  setExpandedReq={setExpandedReq}
                />
              )}
            </div>
            )}

            {activeTab === 'history' && (
            <RequestListSection
              title="ประวัติใบงาน"
              icon={History}
              iconBg="bg-slate-100"
              iconColor="text-muted-foreground"
              subtitle={`${requests.length} ใบงานทั้งหมดในระบบ (ทุกสถานะ)`}
              items={historyRequestsSorted}
              pageSize={10}
              readOnly
              expandedReq={expandedReq}
              setExpandedReq={setExpandedReq}
              openConfirmModal={openConfirmModal}
              openExchangeModal={openExchangeModal}
              handleUpdateStatus={handleUpdateStatus}
              completingId={completingId}
              fetchData={fetchData}
              emptyIcon={Inbox}
              emptyText="ยังไม่มีใบงานในระบบ"
            />
            )}
            </>
            )}

          </div>
        </div>
      </div>

      {/* ══ Confirm Modal: อนุมัติ/ปฏิเสธใบงาน พร้อมหมายเหตุ ══ */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div
              className="h-1.5"
              style={{
                background: confirmModal.action === 'approved'
                  ? 'linear-gradient(90deg,#059669,#10b981)'
                  : 'linear-gradient(90deg,#dc2626,#f87171)',
              }}
            />

            <div className="p-7">
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: confirmModal.action === 'approved' ? '#d1fae5' : '#fee2e2',
                  }}
                >
                  {confirmModal.action === 'approved'
                    ? <CheckCircle2 size={22} className="text-emerald-600" strokeWidth={2.5} />
                    : <AlertTriangle size={22} className="text-rose-600" strokeWidth={2.5} />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    {confirmModal.action === 'approved' ? 'ยืนยันการอนุมัติใบงาน' : 'ยืนยันการปฏิเสธใบงาน'}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ref: {requests.find(r => r.id === confirmModal.requestId)?.ref_id}
                  </p>
                </div>
              </div>

              {confirmModal.action === 'rejected' ? (
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
                  onClick={() => { setConfirmModal(null); setRemark(''); setReasonCode(''); }}
                  disabled={isSubmitting}
                  className="py-3.5 rounded-2xl font-bold text-sm text-muted-foreground bg-slate-50 border-2 border-border hover:bg-slate-100 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={isSubmitting || (confirmModal.action === 'rejected' && (!reasonCode || (reasonCode === 'other' && !remark.trim())))}
                  className="py-3.5 rounded-2xl font-bold text-sm text-white transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{
                    background: confirmModal.action === 'approved'
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

      {/* ══ Confirm Modal: เริ่มกระบวนการแลกเปลี่ยน พร้อมหมายเหตุ ══ */}
      {exchangeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg,#ea580c,#fb923c)' }} />

            <div className="p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: '#ffedd5' }}>
                  <RefreshCw size={22} className="text-orange-600" strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">ยืนยันเริ่มกระบวนการแลกเปลี่ยน</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ref: {requests.find(r => r.id === exchangeModal.requestId)?.ref_id}
                  </p>
                </div>
              </div>

              <ReasonSelectFields
                label="ประเภทการดำเนินการ"
                options={START_EXCHANGE_NOTES}
                code={exchangeReasonCode}
                detail={exchangeDetail}
                onCodeChange={setExchangeReasonCode}
                onDetailChange={setExchangeDetail}
              />

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setExchangeModal(null); setExchangeReasonCode(''); setExchangeDetail(''); }}
                  disabled={isSubmitting}
                  className="py-3.5 rounded-2xl font-bold text-sm text-muted-foreground bg-slate-50 border-2 border-border hover:bg-slate-100 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={submitExchangeModal}
                  disabled={isSubmitting || !exchangeReasonCode || (exchangeReasonCode === 'other' && !exchangeDetail.trim())}
                  className="py-3.5 rounded-2xl font-bold text-sm text-white transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#ea580c,#fb923c)' }}
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
    </div>
  );
}