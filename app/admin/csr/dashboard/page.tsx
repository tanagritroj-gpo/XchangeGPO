'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ClipboardList,
  ChevronDown,
  Check,
  X,
  Loader2,
  Pill,
  RefreshCw,
  CheckCircle2,
  Inbox,
  AlertTriangle,
  ClipboardCheck,
  History,
  ClipboardEdit,
  Eye,
} from 'lucide-react';
import {
  getCSRDashboardData,
  approveRequest,
  rejectRequest,
  startExchangeProcess,
  completeRequest,
} from '@/app/actions/csr-actions';
import { getStaffSession } from '@/app/actions/auth-staff';
import CSRDrugRow from './component/CSRDrugRow';

// ── Status config: คงค่าเดิมทั้งหมด แค่ปรับให้ใช้ token สีสม่ำเสมอขึ้น ──
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending_review:   { label: 'รอตรวจสอบ',       color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     dot: 'bg-amber-400'   },
  approved:         { label: 'อนุมัติแล้ว',      color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  receiving:        { label: 'กำลังรับสินค้า',   color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       dot: 'bg-blue-500'    },
  exchanging:       { label: 'กำลังแลกเปลี่ยน', color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200',   dot: 'bg-purple-500'  },
  completed:        { label: 'เสร็จสิ้น',        color: 'text-slate-600',   bg: 'bg-slate-100 border-slate-200',    dot: 'bg-slate-400'   },
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

function StatPill({ icon: Icon, value, label, tone }: { icon: any; value: number; label: string; tone: 'amber' | 'teal' }) {
  const tones = {
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    teal:  'bg-teal-50 border-teal-100 text-teal-700',
  };
  return (
    <span className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 rounded-full border text-[11px] md:text-xs font-semibold ${tones[tone]}`}>
      <Icon size={13} strokeWidth={2.5} />
      <span>{value}</span>
      <span className="hidden sm:inline opacity-80">{label}</span>
    </span>
  );
}

// ── ปุ่ม tab บน sidebar ฝั่งซ้าย (desktop) / แนวนอนเลื่อนได้ (mobile) ──
function TabButton({ icon: Icon, label, count, active, onClick, accentBg, accentColor }: {
  icon: any; label: string; count: number; active: boolean; onClick: () => void;
  accentBg: string; accentColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 shrink-0 md:w-full text-left border
        ${active
          ? 'bg-white shadow-sm border-slate-200 text-slate-800'
          : 'bg-transparent border-transparent text-slate-500 hover:bg-white/70 hover:text-slate-700'}`}
    >
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${active ? accentBg : 'bg-slate-100'}`}>
        <Icon size={15} className={active ? accentColor : 'text-slate-400'} strokeWidth={2.5} />
      </span>
      <span className="whitespace-nowrap md:whitespace-normal md:flex-1">{label}</span>
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${active ? `${accentBg} ${accentColor}` : 'bg-slate-100 text-slate-400'}`}>
        {count}
      </span>
    </button>
  );
}

// ── Sub-tab แนวนอนแบบ segmented control (สำหรับสลับ CSR Workflow / Active Workflow ภายใน tab "จัดการใบงาน") ──
function SubTabButton({ icon: Icon, label, count, active, onClick, accentColor }: {
  icon: any; label: string; count: number; active: boolean; onClick: () => void; accentColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200
        ${active ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
    >
      <Icon size={15} className={active ? accentColor : 'text-slate-400'} strokeWidth={2.5} />
      {label}
      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/70 text-slate-500'}`}>
        {count}
      </span>
    </button>
  );
}

function ActionButton({ icon: Icon, label, onClick, tone }: {
  icon: any; label: string; onClick: () => void;
  tone: 'blue' | 'red' | 'orange' | 'emerald';
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
      className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all w-full ${tones[tone]}`}
    >
      <Icon size={14} strokeWidth={2.5} />
      {label}
    </button>
  );
}

// ── ปุ่มตัดสินใจระดับใบงาน (อนุมัติ/ปฏิเสธ) — outline ที่ fill สีตอน hover ดูพรีเมียมกว่าปุ่มทึบ ──
function WorkflowDecisionButton({ icon: Icon, label, onClick, tone }: {
  icon: any; label: string; onClick: () => void; tone: 'approve' | 'reject';
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
const isAllItemsReviewed = (req: any) =>
  (req.drug_items?.length ?? 0) > 0 &&
  req.drug_items.every((item: any) => item.current_status !== 'pending_review');

// สถานะที่ CSR เป็นคนกดอัปเดตเอง (มีปุ่ม action ให้กดใน RequestListSection)
// สถานะอื่นนอกจากนี้ (approved, in_transit, at_warehouse, checked_in, out_for_delivery) เป็นของฝ่าย log/wh — CSR แค่มอนิเตอร์
const CSR_ACTIONABLE_STATUSES = ['pending_review', 'receiving', 'exchanging'];

// ── ส่วนแสดงรายการใบงาน — logic เหมือนกันทุกอย่าง แค่รับ items แยกกันเพื่อแยกหัวข้อ ──
function RequestListSection({
  title, icon: Icon, iconBg, iconColor, subtitle, items,
  expandedReq, setExpandedReq, openConfirmModal, handleUpdateStatus, fetchData,
  emptyIcon: EmptyIcon, emptyText,
}: any) {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-3 px-1">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
          <Icon size={16} className={iconColor} strokeWidth={2.5} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800">{title}</h2>
          <p className="text-[11px] text-slate-400">{subtitle}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {items.length > 0 && (
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-2.5 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <div className="col-span-3">Ref ID</div>
            <div className="col-span-2">สถานะ</div>
            <div className="col-span-5">รายการสินค้า</div>
            <div className="col-span-2 text-right">การดำเนินการ</div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="py-12 text-center">
            <EmptyIcon className="w-9 h-9 text-slate-300 mx-auto mb-2.5" strokeWidth={1.75} />
            <p className="text-sm text-slate-400 font-medium">{emptyText}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((req: any) => {
              const isExpanded = expandedReq === req.id;
              const drugCount  = req.drug_items?.length ?? 0;
              return (
                <div key={req.id} className="hover:bg-slate-50/60 transition-colors">

                  {/* Desktop row */}
                  <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 items-center">
                    <div className="col-span-3">
                      <p className="text-sm font-bold text-slate-800 font-mono">{req.ref_id}</p>
                      {req.hospital_name && <p className="text-xs text-slate-400 mt-0.5 truncate">{req.hospital_name}</p>}
                    </div>
                    <div className="col-span-2"><StatusBadge status={req.current_status} /></div>
                    <div className="col-span-5">
                      <button
                        onClick={() => setExpandedReq(isExpanded ? null : req.id)}
                        className="flex items-center gap-2 text-xs text-slate-500 hover:text-teal-700 font-medium transition-colors group"
                      >
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-50 text-teal-600 font-bold text-[10px] group-hover:bg-teal-100">
                          {drugCount}
                        </span>
                        รายการสินค้า
                        <ChevronDown size={14} strokeWidth={2.5} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    <div className="col-span-2 flex flex-col items-end gap-2">
                      {req.current_status === 'pending_review' && (
                        isAllItemsReviewed(req) ? (
                          <>
                            <WorkflowDecisionButton icon={Check} label="อนุมัติ" tone="approve" onClick={() => openConfirmModal(req.id, 'approved')} />
                            <WorkflowDecisionButton icon={X} label="ปฏิเสธใบงาน" tone="reject" onClick={() => openConfirmModal(req.id, 'rejected')} />
                          </>
                        ) : (
                          <p className="text-[10px] text-slate-400 text-right leading-snug flex items-center gap-1 justify-end">
                            <ClipboardCheck size={12} strokeWidth={2.5} />
                            ตรวจรายการยาให้ครบก่อน
                          </p>
                        )
                      )}
                      {req.current_status === 'receiving' && (
                        <ActionButton icon={RefreshCw} label="เริ่มแลกเปลี่ยน" tone="orange" onClick={() => handleUpdateStatus(req.id, 'exchanging')} />
                      )}
                      {req.current_status === 'exchanging' && (
                        <ActionButton icon={CheckCircle2} label="เสร็จสิ้น" tone="emerald" onClick={() => handleUpdateStatus(req.id, 'completed')} />
                      )}
                    </div>
                  </div>

                  {/* Mobile card */}
                  <div className="md:hidden px-4 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 font-mono">{req.ref_id}</p>
                        {req.hospital_name && <p className="text-xs text-slate-400 mt-0.5 truncate">{req.hospital_name}</p>}
                      </div>
                      <StatusBadge status={req.current_status} />
                    </div>

                    <button
                      onClick={() => setExpandedReq(isExpanded ? null : req.id)}
                      className="flex items-center gap-2 text-xs text-slate-500 font-medium w-full py-2 px-3 bg-slate-50 rounded-xl hover:bg-teal-50 hover:text-teal-700 transition-colors"
                    >
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-50 text-teal-600 font-bold text-[10px]">{drugCount}</span>
                      รายการสินค้า
                      <ChevronDown size={14} strokeWidth={2.5} className={`ml-auto transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    <div className="flex gap-2">
                      {req.current_status === 'pending_review' && (
                        isAllItemsReviewed(req) ? (
                          <>
                            <WorkflowDecisionButton icon={Check} label="อนุมัติ" tone="approve" onClick={() => openConfirmModal(req.id, 'approved')} />
                            <WorkflowDecisionButton icon={X} label="ปฏิเสธ" tone="reject" onClick={() => openConfirmModal(req.id, 'rejected')} />
                          </>
                        ) : (
                          <p className="text-[11px] text-slate-400 flex items-center gap-1.5 py-2">
                            <ClipboardCheck size={13} strokeWidth={2.5} />
                            ตรวจรายการยาให้ครบก่อนอนุมัติ/ปฏิเสธ
                          </p>
                        )
                      )}
                      {req.current_status === 'receiving' && (
                        <ActionButton icon={RefreshCw} label="เริ่มแลกเปลี่ยน" tone="orange" onClick={() => handleUpdateStatus(req.id, 'exchanging')} />
                      )}
                      {req.current_status === 'exchanging' && (
                        <ActionButton icon={CheckCircle2} label="เสร็จสิ้น" tone="emerald" onClick={() => handleUpdateStatus(req.id, 'completed')} />
                      )}
                    </div>
                  </div>

                  {/* Drug items expanded */}
                  {isExpanded && drugCount > 0 && (
                    <div className="px-4 md:px-6 pb-4">
                      <div className="hidden md:grid grid-cols-12 gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide px-3 mb-1.5">
                        <div className="col-span-3">ชื่อยา</div>
                        <div className="col-span-1">จำนวน</div>
                        <div className="col-span-1 text-center">Lot</div>
                        <div className="col-span-1 text-center">Exp</div>
                        <div className="col-span-2">ประเภท</div>
                        <div className="col-span-1 text-center">เกณฑ์</div>
                        <div className="col-span-3 text-right">Actions</div>
                      </div>
                      <div className="space-y-2 md:space-y-1.5">
                        {req.drug_items.map((item: any) => (
                          <CSRDrugRow
                            key={item.id}
                            item={{ ...item, request_type: req.request_type }}
                            onUpdate={() => fetchData({ silent: true })}
                          />
                        ))}
                      </div>
                      {req.drug_items.some((i: any) => i.value_amount) && (
                        <div className="mt-3 flex justify-end">
                          <div className="flex items-center gap-2 bg-teal-50 border border-teal-100 rounded-xl px-4 py-2 text-xs">
                            <Pill size={13} className="text-teal-500" strokeWidth={2.5} />
                            <span className="text-slate-500">มูลค่ารวม:</span>
                            <span className="font-bold text-teal-700">
                              ฿{req.drug_items.reduce((s: number, i: any) => s + (Number(i.value_amount) || 0), 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
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
    </section>
  );
}

export default function CSRDashboard() {
  const router = useRouter();
  const [requests, setRequests]       = useState<any[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [expandedReq, setExpandedReq] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [workflowSubTab, setWorkflowSubTab] = useState<'csr' | 'monitor'>('csr');

  // Modal ยืนยันอนุมัติ/ปฏิเสธใบงาน (พร้อมหมายเหตุ) — เปิดเมื่อรายการยาครบทุกตัวแล้วเท่านั้น
  const [confirmModal, setConfirmModal] = useState<{ requestId: number; action: 'approved' | 'rejected' } | null>(null);
  const [remark, setRemark] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // ใช้กับปุ่มที่ยังเป็น prompt แบบเดิม (เริ่มแลกเปลี่ยน / เสร็จสิ้น) — ไม่เกี่ยวกับ approve/reject ระดับ card อีกต่อไป
  const handleUpdateStatus = async (id: number, newStatus: string) => {
    const remarkInput = prompt('ระบุหมายเหตุ:');
    if (remarkInput === null) return;
    try {
      let res;
      if (newStatus === 'exchanging') res = await startExchangeProcess(id, remarkInput || '');
      else if (newStatus === 'completed') res = await completeRequest(id, remarkInput || '');
      else { alert('สถานะไม่รู้จัก'); return; }
      if (res.success) { alert('อัปเดตสถานะเรียบร้อย'); fetchData(); }
      else alert('Error: ' + ((res as any).error || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'));
    } catch (err) { alert('เกิดข้อผิดพลาดในการเชื่อมต่อ'); console.error(err); }
  };

  // เปิด modal ยืนยัน อนุมัติ/ปฏิเสธ ใบงาน (แสดงได้ก็ต่อเมื่อรายการยาครบทุกตัวแล้ว)
  const openConfirmModal = (requestId: number, action: 'approved' | 'rejected') => {
    setRemark('');
    setConfirmModal({ requestId, action });
  };

  const handleConfirmSubmit = async () => {
    if (!confirmModal) return;
    setIsSubmitting(true);
    try {
      const { requestId, action } = confirmModal;
      const res = action === 'approved'
        ? await approveRequest(requestId, remark)
        : await rejectRequest(requestId, remark);

      if (res.success) {
        setConfirmModal(null);
        setRemark('');
        fetchData();
      } else {
        alert('Error: ' + ((res as any).error || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'));
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
  const historyRequests = requests.filter(r => r.current_status === 'completed' || r.current_status === 'rejected');

  // แยกใบงาน active อีกชั้น: ที่ CSR ต้องอัปเดตเอง vs ที่ log/wh อัปเดต (CSR แค่มอนิเตอร์)
  const csrWorkflowRequests     = activeRequests.filter(r => CSR_ACTIONABLE_STATUSES.includes(r.current_status));
  const monitorWorkflowRequests = activeRequests.filter(r => !CSR_ACTIONABLE_STATUSES.includes(r.current_status));

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3">
        <Loader2 className="w-9 h-9 text-teal-600 animate-spin mx-auto" strokeWidth={2.5} />
        <p className="text-sm text-slate-500 font-medium">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ══ Top Bar ══ */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={() => router.replace('/admin/csr')}
              className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-all group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-slate-200 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-bold text-slate-900 leading-tight truncate">CSR Dashboard</h1>
              <p className="text-[10px] md:text-[11px] text-slate-400 hidden sm:block">GPO Xchange Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            <StatPill icon={ClipboardList} value={requests.length} label="ใบงาน" tone="teal" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">

          {/* ══ Sidebar Tabs (แนวตั้ง — ตัด "ลูกค้าที่รออนุมัติ" ออก ย้ายไปหน้าแยกแล้ว) ══ */}
          <aside className="md:w-60 shrink-0">
            <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible -mx-1 px-1 md:mx-0 md:px-0 pb-1 md:pb-0">
              <TabButton
                icon={ClipboardList} label="จัดการใบงาน" count={activeRequests.length}
                active={activeTab === 'active'} onClick={() => setActiveTab('active')}
                accentBg="bg-blue-100" accentColor="text-blue-600"
              />
              <TabButton
                icon={History} label="ประวัติใบงาน" count={historyRequests.length}
                active={activeTab === 'history'} onClick={() => setActiveTab('history')}
                accentBg="bg-slate-200" accentColor="text-slate-600"
              />
            </nav>
          </aside>

          {/* ══ Content ══ */}
          <div className="flex-1 min-w-0">

            {activeTab === 'active' && (
            <div>
              {/* ── Sub-tab แนวนอน (segmented control) ── */}
              <div className="inline-flex items-center gap-1 p-1 mb-4 rounded-xl bg-slate-100">
                <SubTabButton
                  icon={ClipboardEdit} label="CSR Workflow" count={csrWorkflowRequests.length}
                  active={workflowSubTab === 'csr'} onClick={() => setWorkflowSubTab('csr')}
                  accentColor="text-blue-600"
                />
                <SubTabButton
                  icon={Eye} label="Active Workflow" count={monitorWorkflowRequests.length}
                  active={workflowSubTab === 'monitor'} onClick={() => setWorkflowSubTab('monitor')}
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
                  handleUpdateStatus={handleUpdateStatus}
                  fetchData={fetchData}
                  emptyIcon={Inbox}
                  emptyText="ไม่มีใบงานที่ต้องดำเนินการตอนนี้"
                />
              )}

              {workflowSubTab === 'monitor' && (
                <RequestListSection
                  title="Active Workflow"
                  icon={Eye}
                  iconBg="bg-indigo-100"
                  iconColor="text-indigo-600"
                  subtitle={`${monitorWorkflowRequests.length} ใบงานกำลังดำเนินการโดยฝ่ายขนส่ง/คลังสินค้า`}
                  items={monitorWorkflowRequests}
                  expandedReq={expandedReq}
                  setExpandedReq={setExpandedReq}
                  openConfirmModal={openConfirmModal}
                  handleUpdateStatus={handleUpdateStatus}
                  fetchData={fetchData}
                  emptyIcon={Inbox}
                  emptyText="ไม่มีใบงานที่กำลังดำเนินการโดยฝ่ายอื่น"
                />
              )}
            </div>
            )}

            {activeTab === 'history' && (
            <RequestListSection
              title="ประวัติใบงาน (Complete)"
              icon={History}
              iconBg="bg-slate-100"
              iconColor="text-slate-500"
              subtitle={`${historyRequests.length} ใบงานที่เสร็จสิ้นหรือถูกปฏิเสธ`}
              items={historyRequests}
              expandedReq={expandedReq}
              setExpandedReq={setExpandedReq}
              openConfirmModal={openConfirmModal}
              handleUpdateStatus={handleUpdateStatus}
              fetchData={fetchData}
              emptyIcon={Inbox}
              emptyText="ยังไม่มีประวัติใบงาน"
            />
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
                  <h3 className="text-base font-bold text-slate-800">
                    {confirmModal.action === 'approved' ? 'ยืนยันการอนุมัติใบงาน' : 'ยืนยันการปฏิเสธใบงาน'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Ref: {requests.find(r => r.id === confirmModal.requestId)?.ref_id}
                  </p>
                </div>
              </div>

              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                หมายเหตุ {confirmModal.action === 'rejected' && <span className="text-rose-500">*จำเป็น</span>}
              </label>
              <textarea
                rows={3}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder={confirmModal.action === 'approved' ? 'ระบุหมายเหตุ (ถ้ามี)...' : 'ระบุเหตุผลที่ปฏิเสธ...'}
                maxLength={500}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all duration-200 resize-none placeholder:text-slate-300 mb-6"
              />

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setConfirmModal(null); setRemark(''); }}
                  disabled={isSubmitting}
                  className="py-3.5 rounded-2xl font-bold text-sm text-slate-500 bg-slate-50 border-2 border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={isSubmitting || (confirmModal.action === 'rejected' && !remark.trim())}
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
    </div>
  );
}