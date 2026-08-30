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
  Receipt,
  LogOut,
  MailWarning,
  Send,
  FileCheck2,
} from 'lucide-react';
import { getStatusMeta } from '@/lib/tracking-status';
import { StaffDashboardSkeleton } from '@/components/skeletons/DashboardSkeleton';
import {
  getCSRDashboardData,
  approveRequest,
  rejectRequest,
  startExchangeProcess,
  completeRequest,
  getCSRRequestDetail,
} from '@/app/actions/csr-actions';
import { getStaffSession, logoutStaffAction } from '@/app/actions/auth-staff';
import { getOrgContactsForRequest, generateStaffPdfAction, sendStaffPdfEmailAction } from '@/app/actions/staff-form-actions';
import CSRDrugRow from './component/CSRDrugRow';
import DeliveryPhotoBadge from './component/DeliveryPhotoBadge';
import ReasonSelectFields from '@/components/ReasonSelectFields';
import { REJECTION_REASONS } from '@/lib/rejection-reasons';
import { resolveQuickNote } from '@/lib/quick-note';
import { StatCard } from '@/components/StatCard';
import { RequestDetailPanel } from '@/components/history/RequestHistoryList';
import { useToast } from '@/components/ui/toast';
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

// หมายเหตุตอนกด "เสร็จสิ้น" ปิดใบงาน — ใช้ ReasonSelectFields แบบเดียวกับตอนเริ่มแลกเปลี่ยน
const COMPLETE_EXCHANGE_NOTES = [
  { code: 'debt_reduction', label: 'ลดหนี้สำเร็จ' },
  { code: 'exchange', label: 'แลกเปลี่ยนสำเร็จ' },
  { code: 'other', label: 'อื่นๆ (ระบุ)' },
] as const;

// ── Status config: คงค่าเดิมทั้งหมด แค่ปรับให้ใช้ token สีสม่ำเสมอขึ้น ──
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending_review:   { label: 'รอตรวจสอบ',       color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     dot: 'bg-amber-400'   },
  approved:         { label: 'อนุมัติแล้ว',      color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  receiving:        { label: 'กำลังรับสินค้า',   color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       dot: 'bg-blue-500'    },
  exchanging:       { label: 'กำลังแลกเปลี่ยน', color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200',   dot: 'bg-purple-500'  },
  credit_note:      { label: 'กำลังลดหนี้',      color: 'text-pink-700',    bg: 'bg-pink-50 border-pink-200',       dot: 'bg-pink-500'    },
  completed:        { label: 'เสร็จสิ้น',        color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200',   dot: 'bg-orange-500'  },
  out_for_delivery: { label: 'กำลังส่งคืน',      color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200',   dot: 'bg-indigo-500'  },
  at_warehouse:     { label: 'ถึงคลังสินค้า',    color: 'text-fuchsia-700', bg: 'bg-fuchsia-50 border-fuchsia-200', dot: 'bg-fuchsia-500' },
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
      className={`flex items-center gap-3 px-3.5 py-3 rounded-md text-sm font-semibold transition-colors shrink-0 md:w-full text-left border
        ${active
          ? 'bg-card border-border text-foreground'
          : 'bg-transparent border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
    >
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${active ? accentBg : 'bg-secondary'}`}>
        <Icon size={15} className={active ? accentColor : 'text-muted-foreground'} strokeWidth={2.5} />
      </span>
      <span className="whitespace-nowrap md:whitespace-normal md:flex-1">{label}</span>
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${active ? `${accentBg} ${accentColor}` : 'bg-secondary text-muted-foreground'}`}>
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
      className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold transition-colors shrink-0 whitespace-nowrap
        ${active ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
    >
      <Icon size={15} className={active ? accentColor : 'text-muted-foreground'} strokeWidth={2.5} />
      {label}
      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-accent text-accent-foreground' : 'bg-secondary/60 text-muted-foreground'}`}>
        {count}
      </span>
    </button>
  );
}

function ActionButton({ icon: Icon, label, onClick, tone, loading }: {
  icon: LucideIcon; label: string; onClick: () => void;
  tone: 'blue' | 'emerald';
  loading?: boolean;
}) {
  const tones = {
    blue:    'bg-blue-600 hover:bg-blue-700',
    emerald: 'bg-emerald-600 hover:bg-emerald-700',
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md text-xs font-semibold text-white hover:-translate-y-0.5 active:scale-95 transition-all w-full disabled:opacity-60 disabled:pointer-events-none ${tones[tone]}`}
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
      wrap: 'border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-600 hover:text-white hover:border-emerald-600',
      icon: 'bg-emerald-100 text-emerald-600 group-hover:bg-white/25 group-hover:text-white',
    },
    reject: {
      wrap: 'border-red-200 bg-red-50/70 text-red-700 hover:bg-red-600 hover:text-white hover:border-red-600',
      icon: 'bg-red-100 text-red-600 group-hover:bg-white/25 group-hover:text-white',
    },
  };
  const s = styles[tone];
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-2 px-3.5 py-2.5 rounded-md border text-xs font-bold transition-colors active:scale-95 hover:-translate-y-0.5 w-full justify-center ${s.wrap}`}
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

// ถ้ารายการยาทุกตัวถูกปฏิเสธไปแล้วทีละตัว ปุ่ม "ปฏิเสธใบงาน" ระดับ card จะซ้ำซ้อน (แค่ไปมาร์กซ้ำสิ่งที่ปฏิเสธไปแล้ว)
// เหลือแค่ปุ่ม "อนุมัติ" ซึ่งจริงๆ คือปุ่ม "ยืนยัน/ปิดขั้นตอนตรวจสอบ" ย้ายสถานะออกจาก pending_review เท่านั้น
// ไม่ได้แปลว่าอนุมัติสินค้า — approveRequest() เช็คแค่ว่าไม่มี item ค้าง pending_review เท่านั้น
const isAllItemsRejected = (req: RequestRow) =>
  (req.drug_items?.length ?? 0) > 0 &&
  (req.drug_items ?? []).every((item) => item.current_status === 'rejected');

// วันที่เริ่มสร้างใบงาน — ใช้ในคอลัมน์ "วันที่" ของ "ประวัติใบงาน" เท่านั้น
const formatRequestDate = (createdAt: string | null) =>
  new Date(createdAt || 0).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });

// สถานะที่ CSR เป็นคนกดอัปเดตเอง (มีปุ่ม action ให้กดใน RequestListSection)
// สถานะอื่นนอกจากนี้ (approved, in_transit, at_warehouse, checked_in, out_for_delivery) เป็นของฝ่าย log/wh — CSR แค่มอนิเตอร์
const CSR_ACTIONABLE_STATUSES = ['pending_review', 'receiving', 'exchanging', 'credit_note'];

// ── ส่วนแสดงรายการใบงาน — logic เหมือนกันทุกอย่าง แค่รับ items แยกกันเพื่อแยกหัวข้อ ──
// pageSize เป็น optional — ใส่ค่าถึงจะแบ่งหน้า (เผื่ออนาคตรายการเยอะขึ้น) ไม่ใส่ = แสดง
// ทั้งหมดแบบเดิม (คงพฤติกรรมเดิมของแท็บ CSR Workflow ที่ยังไม่ต้องแบ่งหน้า)
function RequestListSection({
  title, icon: Icon, iconBg, iconColor, subtitle, items,
  expandedReq, setExpandedReq, openConfirmModal, openExchangeModal, openCompleteModal, fetchData,
  emptyIcon: EmptyIcon, emptyText, pageSize, readOnly, headerExtra,
}: {
  title: string; icon: LucideIcon; iconBg: string; iconColor: string; subtitle: string; items: RequestRow[];
  expandedReq: number | null; setExpandedReq: (id: number | null) => void;
  openConfirmModal: (requestId: number, action: 'approved' | 'rejected') => void;
  openExchangeModal: (requestId: number) => void;
  openCompleteModal: (requestId: number) => void;
  fetchData: (opts?: { silent?: boolean }) => void;
  emptyIcon: LucideIcon; emptyText: string; pageSize?: number; readOnly?: boolean;
  headerExtra?: React.ReactNode;
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
        <div className="flex-1 min-w-0 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-foreground">{title}</h2>
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          </div>
          {headerExtra}
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {items.length > 0 && (
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-2.5 bg-secondary/60 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-3">Ref ID</div>
            <div className="col-span-2">สถานะ</div>
            <div className="col-span-5">รายการสินค้า</div>
            <div className="col-span-2 text-right">{readOnly ? 'วันที่' : 'การดำเนินการ'}</div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="py-12 text-center">
            <EmptyIcon className="w-9 h-9 text-muted-foreground/40 mx-auto mb-2.5" strokeWidth={1.75} />
            <p className="text-sm text-muted-foreground font-medium">{emptyText}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {pagedItems.map((req: RequestRow) => {
              const isExpanded = expandedReq === req.id;
              const drugCount  = req.drug_items?.length ?? 0;
              return (
                <div
                  key={req.id}
                  className={`group relative transition-colors ${isExpanded ? 'bg-accent/70' : 'hover:bg-accent/40'}`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 w-[3px] transition-opacity duration-150 ${
                      isExpanded ? 'bg-primary opacity-100' : 'bg-primary opacity-0 group-hover:opacity-100'
                    }`}
                  />

                  {/* Desktop row */}
                  <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 items-center">
                    <div className="col-span-3">
                      <p className="text-sm font-bold text-foreground font-mono">{req.ref_id}</p>
                      {req.hospital_name && <p className="text-xs text-muted-foreground mt-0.5 truncate">{req.hospital_name}</p>}
                    </div>
                    <div className="col-span-2"><StatusBadge status={req.current_status} /></div>
                    <div className="col-span-5 flex items-center gap-3">
                      <button
                        onClick={() => setExpandedReq(isExpanded ? null : req.id)}
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary font-medium transition-colors group"
                      >
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-accent-foreground font-bold text-[11px] group-hover:bg-primary/15">
                          {drugCount}
                        </span>
                        รายการสินค้า
                        <ChevronDown size={14} strokeWidth={2.5} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      <DeliveryPhotoBadge req={req} />
                    </div>
                    <div className="col-span-2 flex flex-col items-end gap-2">
                      {!readOnly && req.current_status === 'pending_review' && (
                        isAllItemsReviewed(req) ? (
                          isAllItemsRejected(req) ? (
                            <WorkflowDecisionButton icon={Check} label="อนุมัติ" tone="approve" onClick={() => openConfirmModal(req.id, 'approved')} />
                          ) : (
                            <>
                              <WorkflowDecisionButton icon={Check} label="อนุมัติ" tone="approve" onClick={() => openConfirmModal(req.id, 'approved')} />
                              <WorkflowDecisionButton icon={X} label="ปฏิเสธใบงาน" tone="reject" onClick={() => openConfirmModal(req.id, 'rejected')} />
                            </>
                          )
                        ) : (
                          <p className="text-[11px] text-muted-foreground text-right leading-snug flex items-center gap-1 justify-end">
                            <ClipboardCheck size={12} strokeWidth={2.5} />
                            ตรวจรายการยาให้ครบก่อน
                          </p>
                        )
                      )}
                      {!readOnly && req.current_status === 'receiving' && (
                        req.request_type === 'รับคืนแลกเปลี่ยน' ? (
                          <ActionButton icon={RefreshCw} label="เริ่มแลกเปลี่ยน" tone="blue" onClick={() => openExchangeModal(req.id)} />
                        ) : (
                          <ActionButton icon={Receipt} label="เริ่มลดหนี้" tone="blue" onClick={() => openExchangeModal(req.id)} />
                        )
                      )}
                      {!readOnly && (req.current_status === 'exchanging' || req.current_status === 'credit_note') && (
                        <ActionButton icon={CheckCircle2} label="เสร็จสิ้น" tone="emerald" onClick={() => openCompleteModal(req.id)} />
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
                      className="flex items-center gap-2 text-xs text-muted-foreground font-medium w-full py-2 px-3 bg-secondary/60 rounded-md hover:bg-accent hover:text-primary transition-colors"
                    >
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-accent-foreground font-bold text-[11px]">{drugCount}</span>
                      รายการสินค้า
                      <ChevronDown size={14} strokeWidth={2.5} className={`ml-auto transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    <DeliveryPhotoBadge req={req} />

                    {!readOnly && (
                      <div className="flex gap-2">
                        {req.current_status === 'pending_review' && (
                          isAllItemsReviewed(req) ? (
                            isAllItemsRejected(req) ? (
                              <WorkflowDecisionButton icon={Check} label="อนุมัติ" tone="approve" onClick={() => openConfirmModal(req.id, 'approved')} />
                            ) : (
                              <>
                                <WorkflowDecisionButton icon={Check} label="อนุมัติ" tone="approve" onClick={() => openConfirmModal(req.id, 'approved')} />
                                <WorkflowDecisionButton icon={X} label="ปฏิเสธ" tone="reject" onClick={() => openConfirmModal(req.id, 'rejected')} />
                              </>
                            )
                          ) : (
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 py-2">
                              <ClipboardCheck size={13} strokeWidth={2.5} />
                              ตรวจรายการยาให้ครบก่อนอนุมัติ/ปฏิเสธ
                            </p>
                          )
                        )}
                        {req.current_status === 'receiving' && (
                          req.request_type === 'รับคืนแลกเปลี่ยน' ? (
                            <ActionButton icon={RefreshCw} label="เริ่มแลกเปลี่ยน" tone="blue" onClick={() => openExchangeModal(req.id)} />
                          ) : (
                            <ActionButton icon={Receipt} label="เริ่มลดหนี้" tone="blue" onClick={() => openExchangeModal(req.id)} />
                          )
                        )}
                        {(req.current_status === 'exchanging' || req.current_status === 'credit_note') && (
                          <ActionButton icon={CheckCircle2} label="เสร็จสิ้น" tone="emerald" onClick={() => openCompleteModal(req.id)} />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Drug items expanded — readOnly (ประวัติใบงาน) ใช้ RequestDetailPanel แบบเดียวกับ
                      sale/history (stepper + รายละเอียด + timeline) ส่วนแท็บที่ยังต้องดำเนินการ
                      (ปุ่มอนุมัติ/ปฏิเสธรายชิ้น) ยังคงใช้ CSRDrugRow แบบเดิม */}
                  {isExpanded && (
                    readOnly ? (
                      <RequestDetailPanel requestId={req.id} fetchDetail={getCSRRequestDetail} size="default" />
                    ) : drugCount > 0 && (
                      <div className="px-4 md:px-6 pb-4">
                        <div className="hidden md:grid grid-cols-12 gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wide px-3 mb-1.5">
                          <div className="col-span-3">ชื่อยา</div>
                          <div className="col-span-1">จำนวน</div>
                          <div className="col-span-1 text-center">Lot</div>
                          <div className="col-span-1 text-center">Exp</div>
                          <div className="col-span-2">ประเภท</div>
                          <div className="col-span-1 text-center">เกณฑ์</div>
                          <div className="col-span-3 text-right">Actions</div>
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
                            <div className="flex items-center gap-2 bg-accent border border-border rounded-md px-4 py-2 text-xs">
                              <Pill size={13} className="text-muted-foreground" strokeWidth={2.5} />
                              <span className="text-muted-foreground">มูลค่ารวม:</span>
                              <span className="font-bold text-primary">
                                {(req.drug_items ?? []).reduce((s: number, i: DrugItemRow) => s + (Number(i.value_amount) || 0), 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
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
              className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
              aria-label="หน้าก่อนหน้า"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                  p === currentPage ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
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
    <div className="bg-card rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-foreground font-mono truncate">{req.ref_id}</p>
        {role && (
          <span className={`flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-bold ${role.bg} ${role.color}`}>
            <RoleIcon className="w-2.5 h-2.5" strokeWidth={2.5} />
            {role.label}
          </span>
        )}
      </div>
      {req.hospital_name && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{req.hospital_name}</p>}

      <button
        onClick={onToggle}
        className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary font-semibold transition-colors"
      >
        <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-accent text-accent-foreground font-bold text-[11px] leading-none">{drugCount}</span>
        รายการสินค้า
        <ChevronDown size={12} strokeWidth={2.5} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && drugCount > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-border pt-2">
          {(req.drug_items ?? []).map((item: DrugItemRow) => (
            <div key={item.id} className="text-[11px] bg-secondary/60 rounded-lg px-2 py-1.5">
              <p className="font-bold text-foreground truncate">{item.drug_name}</p>
              <p className="text-muted-foreground mt-0.5">
                {item.qty} {item.unit}{item.lot_number ? ` · Lot ${item.lot_number}` : ''}
              </p>
            </div>
          ))}
          {totalValue > 0 && (
            <p className="text-right text-[11px] font-bold text-primary pt-0.5">
              {totalValue.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
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
            <div key={statusKey} className="bg-secondary/50 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 mb-3 px-0.5">
                <span className={`flex items-center justify-center w-6 h-6 rounded-lg shrink-0 ${meta.bg}`}>
                  <StageIcon className={`w-3.5 h-3.5 ${meta.fg}`} strokeWidth={2.5} />
                </span>
                <span className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
                <span className="ml-auto text-[11px] font-bold text-muted-foreground bg-card px-1.5 py-0.5 rounded-full border border-border">
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

type OrgContact = { id: number | string; contact_name: string | null; email: string };

// ── ใบงานแลกเปลี่ยนที่ CSR กรอกแทนลูกค้า ผ่านการตรวจสอบแล้วแต่ "เอกสารฉบับตรวจสอบแล้ว"
// ยังไม่ถึงมือลูกค้า — CSR ไม่ได้เลือกผู้รับตอนแจ้งรับเรื่อง หรือตอนนั้นระบบส่งไม่สำเร็จ
// (ปกติ email #2 ส่งอัตโนมัติหลังกดอนุมัติ/ปฏิเสธ ถ้ามีชุดผู้รับที่ CSR เลือกไว้แล้ว) ──
const isDocDeliveryPending = (r: RequestRow, sentIds: Set<number>) =>
  r.submission_channel === 'csr_manual' &&
  r.request_type === 'รับคืนแลกเปลี่ยน' &&
  r.current_status !== 'pending_review' &&
  !sentIds.has(r.id);

function PendingDocBanner({ items, onSend }: { items: RequestRow[]; onSend: (requestId: number) => void }) {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
          <MailWarning size={18} className="text-amber-600" strokeWidth={2.5} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-900">
            เอกสารฉบับตรวจสอบแล้วยังไม่ถึงลูกค้า ({items.length})
          </p>
          <p className="text-[11px] text-amber-700 leading-snug">
            ใบงานแลกเปลี่ยนที่ท่านกรอกแทนลูกค้า — ผ่านการตรวจสอบแล้วแต่ยังไม่ได้เลือกผู้รับอีเมล หรือระบบส่งไม่สำเร็จ
          </p>
        </div>
        <ChevronDown size={16} className={`text-amber-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2.5} />
      </button>

      {open && (
        <div className="border-t border-amber-200 divide-y divide-amber-200/70">
          {items.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-amber-900 font-mono">{r.ref_id}</p>
                {r.hospital_name && (
                  <p className="text-[11px] text-amber-700 truncate">{r.hospital_name}</p>
                )}
              </div>
              <button
                onClick={() => onSend(r.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:scale-95 transition-all shrink-0"
              >
                <Send size={13} strokeWidth={2.5} /> เลือกผู้รับและส่ง
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CSRDashboard() {
  const router = useRouter();
  const toast = useToast();
  const [requests, setRequests]       = useState<RequestRow[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [expandedReq, setExpandedReq] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [workflowSubTab, setWorkflowSubTab] = useState<'csr' | 'monitor'>('csr');
  // ตัวกรองด่วนจากแถบสถิติด้านบน — ข้ามระบบแท็บ/แท็บย่อยไปแสดงเฉพาะกลุ่มสถานะที่กด
  // null = ไม่ได้กรอง (แสดงตามแท็บ/แท็บย่อยปกติ) — คลิกแท็บ/แท็บย่อยเดิมจะล้างตัวกรองนี้เสมอ
  const [statusFilter, setStatusFilter] = useState<'pending_review' | 'in_progress' | 'completed' | 'rejected' | null>(null);
  // ตัวกรองประเภทงานในแท็บ "ประวัติใบงาน" — แยกอิสระจาก statusFilter ใช้ร่วมกันได้ (AND)
  // กดซ้ำที่ตัวที่เลือกอยู่แล้วจะล้างกลับเป็น "ทั้งหมด"
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'รับคืนลดหนี้' | 'รับคืนแลกเปลี่ยน' | null>(null);

  // Modal ยืนยันอนุมัติ/ปฏิเสธใบงาน (พร้อมหมายเหตุ) — เปิดเมื่อรายการยาครบทุกตัวแล้วเท่านั้น
  const [confirmModal, setConfirmModal] = useState<{ requestId: number; action: 'approved' | 'rejected' } | null>(null);
  const [remark, setRemark] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal ยืนยันเริ่มกระบวนการแลกเปลี่ยน (แทน prompt() เดิม)
  const [exchangeModal, setExchangeModal] = useState<{ requestId: number } | null>(null);
  const [exchangeReasonCode, setExchangeReasonCode] = useState('');
  const [exchangeDetail, setExchangeDetail] = useState('');

  // Modal ยืนยันเสร็จสิ้นใบงาน (แทน prompt() เดิม)
  const [completeModal, setCompleteModal] = useState<{ requestId: number } | null>(null);
  const [completeReasonCode, setCompleteReasonCode] = useState('');
  const [completeDetail, setCompleteDetail] = useState('');

  // ── ส่ง "เอกสารฉบับตรวจสอบแล้ว" ให้ลูกค้าย้อนหลัง (ใบงานแลกเปลี่ยนที่ CSR กรอกแทน) ──
  // id ของใบงานที่ส่งเอกสารถึงลูกค้าแล้ว (status_logs 'document_sent') — จาก getCSRDashboardData
  const [verifiedDocSentIds, setVerifiedDocSentIds] = useState<Set<number>>(new Set());
  const [sendDocModal, setSendDocModal] = useState<{ requestId: number } | null>(null);
  const [docRecipients, setDocRecipients] = useState<OrgContact[]>([]);
  const [docRecipientsLoaded, setDocRecipientsLoaded] = useState(false);
  const [selectedDocEmails, setSelectedDocEmails] = useState<string[]>([]);
  const [docSending, setDocSending] = useState(false);

  const fetchData = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true);
    const data = await getCSRDashboardData();
    if (data.success) {
      setRequests(data.requests || []);
      setVerifiedDocSentIds(new Set(data.verifiedDocSentIds || []));
    }
    if (!opts?.silent) setIsLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const session = await getStaffSession();
      // ★ แก้ redirect เดิมที่ชี้ไป '/login' ซึ่งไม่มี route นี้อยู่จริงในระบบ (404) —
      // หน้า login พนักงานตัวจริงคือหน้าแรก '/' (แท็บ "พนักงาน GPO")
      if (!session?.id) { router.replace('/'); return; }
      await fetchData();
    };
    init();
  }, [router]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutStaffAction();
    router.push('/');
  };

  // เปิด modal ยืนยันเสร็จสิ้นใบงาน แทนการเรียก prompt() เดิม
  const openCompleteModal = (requestId: number) => {
    setCompleteReasonCode('');
    setCompleteDetail('');
    setCompleteModal({ requestId });
  };

  const submitCompleteModal = async () => {
    if (!completeModal) return;
    setIsSubmitting(true);
    try {
      const remarkText = resolveQuickNote(COMPLETE_EXCHANGE_NOTES, completeReasonCode, completeDetail);
      const res = await completeRequest(completeModal.requestId, remarkText);
      if (res.success) {
        setCompleteModal(null);
        fetchData();
      } else {
        toast.error(`${('error' in res && res.error) || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'}`);
      }
    } catch (err) {
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อ');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
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
        toast.error(`${('error' in res && res.error) || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'}`);
      }
    } catch (err) {
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อ');
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
        // แลกเปลี่ยน: ระบบสร้างเอกสารฉบับตรวจสอบแล้ว + ส่งอีเมลอัตโนมัติ
        //  - ลูกค้ายื่นเอง → ส่งให้ลูกค้า + sale ที่ดูแลหน่วยงาน
        //  - CSR กรอกแทน  → ส่งไปที่อีเมลชุดที่ CSR เลือกไว้ตอนแจ้งรับเรื่อง (requests.notify_emails)
        const emailedTo = 'emailedTo' in res ? (res.emailedTo as string[] | undefined) : undefined;
        if (emailedTo && emailedTo.length > 0) {
          toast.success(`ส่งเอกสาร PDF ฉบับตรวจสอบแล้วทางอีเมล: ${emailedTo.join(', ')}`);
        } else if (emailedTo) {
          // csr_manual ที่ยังไม่มีชุดผู้รับ / ส่งไม่ผ่าน — เปิด modal ให้ CSR เลือกผู้รับแล้วส่งทันที
          toast.error('สร้างเอกสารฉบับตรวจสอบแล้ว แต่ยังไม่ได้ส่ง — กรุณาเลือกผู้รับอีเมล');
          openSendDocModal(requestId);
        }
        fetchData();
      } else {
        toast.error(`${('error' in res && res.error) || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'}`);
      }
    } catch (err) {
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อ');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── เปิด modal ส่งเอกสารฉบับตรวจสอบแล้วให้ลูกค้าย้อนหลัง ──
  const openSendDocModal = (requestId: number) => {
    setDocRecipients([]);
    setDocRecipientsLoaded(false);
    setSelectedDocEmails([]);
    setSendDocModal({ requestId });
  };

  // โหลดรายชื่อผู้รับของหน่วยงาน + default เลือกชุดที่ CSR เคยเลือกไว้ (notify_emails) ถ้ามี ไม่งั้นเลือกทั้งหมด
  useEffect(() => {
    if (!sendDocModal) return;
    let cancelled = false;
    (async () => {
      const req = requests.find((r) => r.id === sendDocModal.requestId);
      const res = await getOrgContactsForRequest(sendDocModal.requestId);
      if (cancelled) return;
      if (res.success && res.data) {
        setDocRecipients(res.data);
        const prev = (req?.notify_emails ?? []).filter(Boolean);
        const allowed = new Set(res.data.map((c) => c.email));
        const preset = prev.filter((e) => allowed.has(e));
        setSelectedDocEmails(preset.length > 0 ? preset : res.data.map((c) => c.email));
      }
      setDocRecipientsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [sendDocModal, requests]);

  const toggleDocEmail = (email: string) =>
    setSelectedDocEmails((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]));

  const submitSendDoc = async () => {
    if (!sendDocModal || selectedDocEmails.length === 0) return;
    setDocSending(true);
    try {
      const { requestId } = sendDocModal;
      // 1. การันตีว่ามีเอกสารฉบับตรวจสอบแล้ว (kind='final') — สร้าง on-demand ถ้ายังไม่มี
      const gen = await generateStaffPdfAction(requestId);
      if (!gen.success) {
        toast.error(`สร้างเอกสารไม่สำเร็จ: ${gen.error}`);
        return;
      }
      // 2. ส่งอีเมลพร้อมลิงก์เอกสารให้ผู้รับที่เลือก (allowlist ตรวจซ้ำฝั่ง server)
      const res = await sendStaffPdfEmailAction(requestId, selectedDocEmails);
      if (res.success) {
        toast.success(res.message || 'ส่งเอกสารให้ลูกค้าเรียบร้อยแล้ว');
        setSendDocModal(null);
        fetchData({ silent: true });
      } else {
        toast.error(res.error || 'ส่งเอกสารไม่สำเร็จ');
      }
    } catch (err) {
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อ');
      console.error(err);
    } finally {
      setDocSending(false);
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
  const historyRequestsFiltered = !historyTypeFilter ? historyRequestsSorted
    : historyRequestsSorted.filter((r) => r.request_type === historyTypeFilter);

  // ใบงานแลกเปลี่ยน (CSR กรอกแทน) ที่ผ่านการตรวจแล้วแต่เอกสารฉบับตรวจสอบยังไม่ถึงลูกค้า
  const pendingDocRequests = requests.filter((r) => isDocDeliveryPending(r, verifiedDocSentIds));

  // ใบงานที่ modal "เริ่มกระบวนการ" กำลังเปิดอยู่ — ใช้ตัดสินใจว่าเป็นแลกเปลี่ยนหรือลดหนี้ (คำในปุ่ม/หัวข้อ modal ต้องตรงกัน)
  const exchangeModalRequest = exchangeModal ? requests.find(r => r.id === exchangeModal.requestId) : undefined;
  const isExchangeModalType = exchangeModalRequest?.request_type === 'รับคืนแลกเปลี่ยน';

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
      icon: XCircle, iconBg: 'bg-red-100', iconColor: 'text-red-600',
    },
  };

  // คลิกแท็บ/แท็บย่อยเดิมล้างตัวกรองด่วนเสมอ กันสับสนว่าทำไมกดแท็บแล้วเนื้อหาไม่เปลี่ยน
  const selectTab = (tab: 'active' | 'history') => { setStatusFilter(null); setActiveTab(tab); };
  const selectWorkflowSubTab = (tab: 'csr' | 'monitor') => { setStatusFilter(null); setWorkflowSubTab(tab); };

  if (isLoading) return <StaffDashboardSkeleton statCount={5} sidebarTabCount={2} subTabCount={2} rows={5} />;

  return (
    <div className="min-h-screen bg-background">

      {/* ══ Top Bar ══ */}
      <div className="relative z-30 sticky top-0 bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={() => router.replace('/admin/csr')}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary px-3 py-2 rounded-md transition-colors group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-border shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-bold text-foreground leading-tight truncate">CSR Dashboard</h1>
              <p className="text-[11px] text-muted-foreground hidden sm:block">GPO Xchange Portal</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary px-3 py-2 rounded-md transition-colors shrink-0 disabled:opacity-60 disabled:pointer-events-none"
          >
            {isLoggingOut ? <Loader2 size={15} className="animate-spin" strokeWidth={2.5} /> : <LogOut size={15} strokeWidth={2.5} />}
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-5 md:space-y-7">

        {/* ── แถบสถิติสรุป — คลิกได้จริง กดแล้วกระโดดไปดูเฉพาะกลุ่มสถานะนั้นทันที ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          <StatCard
            icon={ClipboardList} value={requests.length} label="ใบงานรวม" iconBg="bg-accent" iconText="text-accent-foreground"
            isActive={statusFilter === null && activeTab === 'history'} activeBorder="border-primary/40" activeRing="ring-2 ring-primary/10"
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
            icon={XCircle} value={rejectedCount} label="ถูกปฏิเสธ" iconBg="bg-red-50" iconText="text-red-600"
            isActive={statusFilter === 'rejected'} activeBorder="border-red-300" activeRing="ring-2 ring-red-100"
            onClick={() => setStatusFilter('rejected')}
          />
        </div>

        <PendingDocBanner items={pendingDocRequests} onSend={openSendDocModal} />

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
                accentBg="bg-accent" accentColor="text-accent-foreground"
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
                openCompleteModal={openCompleteModal}
                fetchData={fetchData}
                emptyIcon={Inbox}
                emptyText="ไม่มีใบงานในกลุ่มนี้"
              />
            ) : (
            <>
            {activeTab === 'active' && (
            <div>
              {/* ── Sub-tab แนวนอน (segmented control) ── */}
              <div className="flex items-center gap-1 p-1 mb-4 rounded-md bg-secondary border border-border overflow-x-auto max-w-full">
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
                  openCompleteModal={openCompleteModal}
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
              iconBg="bg-accent"
              iconColor="text-accent-foreground"
              subtitle={`${requests.length} ใบงานทั้งหมดในระบบ (ทุกสถานะ)`}
              items={historyRequestsFiltered}
              pageSize={10}
              readOnly
              expandedReq={expandedReq}
              setExpandedReq={setExpandedReq}
              openConfirmModal={openConfirmModal}
              openExchangeModal={openExchangeModal}
              openCompleteModal={openCompleteModal}
              fetchData={fetchData}
              emptyIcon={Inbox}
              emptyText="ยังไม่มีใบงานในระบบ"
              headerExtra={
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHistoryTypeFilter(historyTypeFilter === 'รับคืนลดหนี้' ? null : 'รับคืนลดหนี้')}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                      historyTypeFilter === 'รับคืนลดหนี้'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                    }`}
                  >
                    รับคืนลดหนี้
                  </button>
                  <button
                    onClick={() => setHistoryTypeFilter(historyTypeFilter === 'รับคืนแลกเปลี่ยน' ? null : 'รับคืนแลกเปลี่ยน')}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                      historyTypeFilter === 'รับคืนแลกเปลี่ยน'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                    }`}
                  >
                    รับคืนแลกเปลี่ยน
                  </button>
                </div>
              }
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
          <div className="relative w-full max-w-md bg-card rounded-lg shadow-lg overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div className={`h-1.5 ${confirmModal.action === 'approved' ? 'bg-emerald-600' : 'bg-destructive'}`} />

            <div className="p-7">
              <div className="flex items-center gap-3 mb-5">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                    confirmModal.action === 'approved' ? 'bg-emerald-100' : 'bg-destructive/10'
                  }`}
                >
                  {confirmModal.action === 'approved'
                    ? <CheckCircle2 size={22} className="text-emerald-600" strokeWidth={2.5} />
                    : <AlertTriangle size={22} className="text-destructive" strokeWidth={2.5} />}
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
                    className="w-full px-4 py-3 rounded-md border border-border bg-secondary text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors resize-none placeholder:text-muted-foreground/50 mb-6"
                  />
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setConfirmModal(null); setRemark(''); setReasonCode(''); }}
                  disabled={isSubmitting}
                  className="py-3.5 rounded-md font-bold text-sm text-muted-foreground bg-secondary border border-border hover:bg-muted transition-colors active:scale-[0.98] disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={isSubmitting || (confirmModal.action === 'rejected' && (!reasonCode || (reasonCode === 'other' && !remark.trim())))}
                  className={`py-3.5 rounded-md font-bold text-sm text-white transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                    confirmModal.action === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-destructive hover:bg-destructive/90'
                  }`}
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
          <div className="relative w-full max-w-md bg-card rounded-lg shadow-lg overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div className="h-1.5 bg-blue-600" />

            <div className="p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-blue-100">
                  {isExchangeModalType
                    ? <RefreshCw size={22} className="text-blue-600" strokeWidth={2.5} />
                    : <Receipt size={22} className="text-blue-600" strokeWidth={2.5} />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    {isExchangeModalType ? 'ยืนยันเริ่มกระบวนการแลกเปลี่ยน' : 'ยืนยันเริ่มกระบวนการลดหนี้'}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ref: {exchangeModalRequest?.ref_id}
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
                  className="py-3.5 rounded-md font-bold text-sm text-muted-foreground bg-secondary border border-border hover:bg-muted transition-colors active:scale-[0.98] disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={submitExchangeModal}
                  disabled={isSubmitting || !exchangeReasonCode || (exchangeReasonCode === 'other' && !exchangeDetail.trim())}
                  className="py-3.5 rounded-md font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

      {/* ══ Confirm Modal: เสร็จสิ้นใบงาน พร้อมหมายเหตุ ══ */}
      {completeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-card rounded-lg shadow-lg overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div className="h-1.5 bg-emerald-600" />

            <div className="p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-emerald-100">
                  <CheckCircle2 size={22} className="text-emerald-600" strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">ยืนยันเสร็จสิ้นใบงาน</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ref: {requests.find(r => r.id === completeModal.requestId)?.ref_id}
                  </p>
                </div>
              </div>

              <ReasonSelectFields
                label="ผลการดำเนินการ"
                options={COMPLETE_EXCHANGE_NOTES}
                code={completeReasonCode}
                detail={completeDetail}
                onCodeChange={setCompleteReasonCode}
                onDetailChange={setCompleteDetail}
              />

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setCompleteModal(null); setCompleteReasonCode(''); setCompleteDetail(''); }}
                  disabled={isSubmitting}
                  className="py-3.5 rounded-md font-bold text-sm text-muted-foreground bg-secondary border border-border hover:bg-muted transition-colors active:scale-[0.98] disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={submitCompleteModal}
                  disabled={isSubmitting || !completeReasonCode || (completeReasonCode === 'other' && !completeDetail.trim())}
                  className="py-3.5 rounded-md font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

      {/* ══ Modal: ส่งเอกสารฉบับตรวจสอบแล้วให้ลูกค้าย้อนหลัง (csr_manual แลกเปลี่ยน) ══ */}
      {sendDocModal && (() => {
        const req = requests.find((r) => r.id === sendDocModal.requestId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-md bg-card rounded-lg shadow-lg overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
              <div className="h-1.5 bg-amber-500" />
              <div className="p-7">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <FileCheck2 size={22} className="text-amber-600" strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-foreground">ส่งเอกสารฉบับตรวจสอบแล้ว</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Ref: {req?.ref_id}{req?.hospital_name ? ` · ${req.hospital_name}` : ''}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  ระบบจะส่งอีเมลพร้อมลิงก์ดาวน์โหลด <span className="font-semibold text-foreground">เอกสารฉบับตรวจสอบแล้ว</span> ไปยังผู้รับที่เลือก
                  {req?.notify_emails?.length ? ' (ครั้งก่อนส่งไม่สำเร็จ ระบบจะส่งซ้ำ)' : ' — ใบงานนี้ยังไม่เคยเลือกผู้รับ'}
                </p>

                {!docRecipientsLoaded ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 size={16} className="animate-spin" /> กำลังโหลดรายชื่อผู้รับ…
                  </div>
                ) : docRecipients.length === 0 ? (
                  <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700 font-medium">
                    ไม่พบผู้ติดต่อของหน่วยงานนี้ในระบบ — ไม่สามารถส่งอีเมลได้
                  </div>
                ) : (
                  <div className="rounded-md border border-border bg-secondary/50 p-3 mb-1">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">
                        ผู้รับ ({selectedDocEmails.length}/{docRecipients.length})
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectedDocEmails(docRecipients.map((r) => r.email))}
                        className="text-xs font-black text-amber-600 hover:text-amber-700 underline underline-offset-2"
                      >
                        เลือกทั้งหมด
                      </button>
                    </div>
                    <div className="flex flex-col gap-0.5 max-h-44 overflow-y-auto">
                      {docRecipients.map((r) => (
                        <label key={r.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-card cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedDocEmails.includes(r.email)}
                            onChange={() => toggleDocEmail(r.email)}
                            className="w-4 h-4 rounded border-slate-300 accent-amber-600 shrink-0"
                          />
                          <span className="text-sm font-bold text-foreground truncate">{r.contact_name || 'ไม่ระบุชื่อ'}</span>
                          <span className="text-xs text-muted-foreground truncate ml-auto">{r.email}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mt-5">
                  <button
                    type="button"
                    onClick={() => setSendDocModal(null)}
                    disabled={docSending}
                    className="py-3.5 rounded-md font-bold text-sm text-muted-foreground bg-secondary border border-border hover:bg-muted transition-colors active:scale-[0.98] disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={submitSendDoc}
                    disabled={docSending || selectedDocEmails.length === 0}
                    className="py-3.5 rounded-md font-bold text-sm text-white bg-amber-600 hover:bg-amber-700 transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {docSending
                      ? <><Loader2 size={15} className="animate-spin" strokeWidth={2.5} /> กำลังส่ง…</>
                      : <><Send size={15} strokeWidth={2.5} /> ส่งเอกสาร ({selectedDocEmails.length})</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}