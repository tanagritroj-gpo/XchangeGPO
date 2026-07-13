'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Users,
  History,
  ClipboardList,
  ChevronDown,
  Check,
  Loader2,
  Pill,
  Inbox,
  MapPin,
  ShieldCheck,
  BarChart3,
} from 'lucide-react';
import { getPendingStaff, approveStaff } from '@/app/actions/auth-staff';
import { getCSRDashboardData } from '@/app/actions/csr-actions';
import { getManagerStatusLogs } from '@/app/actions/manager-actions';
import ManagerInsights from './component/ManagerInsights';

// ── Status config: ใช้ชุดสีเดียวกับ CSR Dashboard ให้ทั้งระบบสอดคล้องกัน ──
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

// ── ปุ่ม tab บน sidebar ฝั่งซ้าย (desktop) / แนวนอนเลื่อนได้ (mobile) — pattern เดียวกับ CSR Dashboard ──
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

// ── รายการใบงาน แบบดูอย่างเดียว (ไม่มีปุ่ม action — manager มอนิเตอร์ ไม่ได้แก้ไขจากหน้านี้) ──
function RequestOverviewList({ items, emptyText }: { items: any[]; emptyText: string }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {items.length > 0 && (
        <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-2.5 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          <div className="col-span-3">Ref ID</div>
          <div className="col-span-3">หน่วยงาน</div>
          <div className="col-span-2">สถานะ</div>
          <div className="col-span-4">รายการสินค้า</div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="py-12 text-center">
          <Inbox className="w-9 h-9 text-slate-300 mx-auto mb-2.5" strokeWidth={1.75} />
          <p className="text-sm text-slate-400 font-medium">{emptyText}</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((req: any) => {
            const isExpanded = expandedId === req.id;
            const drugCount = req.drug_items?.length ?? 0;
            return (
              <div key={req.id} className="hover:bg-slate-50/60 transition-colors">

                {/* Desktop row */}
                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 items-center">
                  <div className="col-span-3">
                    <p className="text-sm font-bold text-slate-800 font-mono">{req.ref_id}</p>
                    {req.created_at && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(req.created_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                      </p>
                    )}
                  </div>
                  <div className="col-span-3">
                    <p className="text-sm text-slate-600 truncate">{req.hospital_name || '-'}</p>
                    {req.province && (
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <MapPin size={11} strokeWidth={2.5} />
                        {req.province}
                      </p>
                    )}
                  </div>
                  <div className="col-span-2"><StatusBadge status={req.current_status} /></div>
                  <div className="col-span-4">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : req.id)}
                      className="flex items-center gap-2 text-xs text-slate-500 hover:text-teal-700 font-medium transition-colors group"
                    >
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-50 text-teal-600 font-bold text-[10px] group-hover:bg-teal-100">
                        {drugCount}
                      </span>
                      รายการสินค้า
                      <ChevronDown size={14} strokeWidth={2.5} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Mobile card */}
                <div className="md:hidden px-4 py-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 font-mono">{req.ref_id}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{req.hospital_name || '-'}</p>
                    </div>
                    <StatusBadge status={req.current_status} />
                  </div>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : req.id)}
                    className="flex items-center gap-2 text-xs text-slate-500 font-medium w-full py-2 px-3 bg-slate-50 rounded-xl hover:bg-teal-50 hover:text-teal-700 transition-colors"
                  >
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-50 text-teal-600 font-bold text-[10px]">{drugCount}</span>
                    รายการสินค้า
                    <ChevronDown size={14} strokeWidth={2.5} className={`ml-auto transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Drug items expanded — read-only */}
                {isExpanded && drugCount > 0 && (
                  <div className="px-4 md:px-6 pb-4">
                    <div className="space-y-1.5">
                      {req.drug_items.map((item: any) => (
                        <div key={item.id} className="grid grid-cols-12 gap-2 text-xs bg-slate-50 px-3.5 py-2.5 rounded-xl items-center border border-slate-100">
                          <div className="col-span-4 font-semibold text-slate-700 truncate">{item.drug_name}</div>
                          <div className="col-span-2 text-slate-500">{item.qty} {item.unit}</div>
                          <div className="col-span-2 text-slate-400 font-mono text-[10px]">{item.lot_number ?? '-'}</div>
                          <div className="col-span-2">
                            <StatusBadge status={item.current_status} />
                          </div>
                          <div className="col-span-2 text-right font-bold text-teal-600">
                            ฿{Number(item.value_amount || 0).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                    {req.drug_items.some((i: any) => i.value_amount) && (
                      <div className="mt-2.5 flex justify-end">
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
  );
}

export default function StaffApprovalPage() {
  const router = useRouter();
  const [pendingStaff, setPendingStaff] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [statusLogs, setStatusLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'staff' | 'history' | 'all' | 'insights'>('staff');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const [staffResult, dashboardResult, statusLogsResult] = await Promise.all([
      getPendingStaff(),
      getCSRDashboardData(), // manager มีสิทธิ์เรียกอยู่แล้ว (getCSRSession อนุญาต department 'manager')
      getManagerStatusLogs(), // manager-only — ใช้คำนวณเวลาเฉลี่ยแต่ละขั้นตอน + เหตุผลปฏิเสธ
    ]);

    if (staffResult.success) {
      setPendingStaff(staffResult.data || []);
    } else {
      console.error("Error fetching staff:", staffResult.error);
    }

    if (dashboardResult.success) {
      setRequests(dashboardResult.requests || []);
    } else {
      console.error("Error fetching requests:", dashboardResult.error);
    }

    if (statusLogsResult.success) {
      setStatusLogs(statusLogsResult.data || []);
    } else {
      console.error("Error fetching status logs:", statusLogsResult.error);
    }

    setIsLoading(false);
  };

  const handleApprove = async (id: string) => {
    const confirmed = confirm("ยืนยันการอนุมัติพนักงานท่านนี้?");
    if (!confirmed) return;

    const res = await approveStaff(id);

    if (res.success) {
      alert("อนุมัติเรียบร้อยแล้ว");
      fetchData();
    } else {
      alert("เกิดข้อผิดพลาด: " + ((res as any).error || 'ไม่ทราบสาเหตุ'));
    }
  };

  const handleBack = () => {
    router.replace('/');
  };

  // ประวัติใบงาน = เสร็จสิ้นหรือถูกปฏิเสธ (logic เดียวกับ CSR Dashboard)
  const historyRequests = requests.filter(r => r.current_status === 'completed' || r.current_status === 'rejected');
  // ใบงานทั้งหมด = ทุกสถานะไม่กรองเลย
  const allRequests = requests;

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3">
        <Loader2 className="w-9 h-9 text-orange-500 animate-spin mx-auto" strokeWidth={2.5} />
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
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-all group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-slate-200 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-bold text-slate-900 leading-tight truncate">Manager Portal</h1>
              <p className="text-[10px] md:text-[11px] text-slate-400 hidden sm:block">GPO Xchange Portal</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 rounded-full border bg-orange-50 border-orange-100 text-orange-700 text-[11px] md:text-xs font-semibold shrink-0">
            <ShieldCheck size={13} strokeWidth={2.5} />
            <span>Manager</span>
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">

          {/* ══ Sidebar Tabs (แนวตั้ง — เหมือน CSR Dashboard) ══ */}
          <aside className="md:w-60 shrink-0">
            <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible -mx-1 px-1 md:mx-0 md:px-0 pb-1 md:pb-0">
              <TabButton
                icon={Users} label="จัดการสิทธิ์พนักงาน" count={pendingStaff.length}
                active={activeTab === 'staff'} onClick={() => setActiveTab('staff')}
                accentBg="bg-orange-100" accentColor="text-orange-600"
              />
              <TabButton
                icon={History} label="ประวัติใบงาน" count={historyRequests.length}
                active={activeTab === 'history'} onClick={() => setActiveTab('history')}
                accentBg="bg-slate-200" accentColor="text-slate-600"
              />
              <TabButton
                icon={ClipboardList} label="ใบงานทั้งหมด" count={allRequests.length}
                active={activeTab === 'all'} onClick={() => setActiveTab('all')}
                accentBg="bg-blue-100" accentColor="text-blue-600"
              />
              <TabButton
                icon={BarChart3} label="ภาพรวม & สถิติ" count={allRequests.length}
                active={activeTab === 'insights'} onClick={() => setActiveTab('insights')}
                accentBg="bg-purple-100" accentColor="text-purple-600"
              />
            </nav>
          </aside>

          {/* ══ Content ══ */}
          <div className="flex-1 min-w-0">

            {/* ── Tab 1: จัดการสิทธิ์พนักงาน ── */}
            {activeTab === 'staff' && (
              <section>
                <div className="flex items-center gap-2.5 mb-3 px-1">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                    <Users size={16} className="text-orange-600" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">จัดการสิทธิ์พนักงาน</h2>
                    <p className="text-[11px] text-slate-400">{pendingStaff.length} รายการรออนุมัติ</p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  {pendingStaff.length === 0 ? (
                    <div className="py-12 text-center">
                      <Users className="w-9 h-9 text-slate-300 mx-auto mb-2.5" strokeWidth={1.75} />
                      <p className="text-sm text-slate-400 font-medium">ไม่มีรายการรออนุมัติ</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {pendingStaff.map((staff) => (
                        <div key={staff.id}
                          className="flex items-center justify-between px-4 md:px-6 py-3.5 md:py-4 hover:bg-slate-50 transition-colors gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{staff.full_name}</p>
                            <p className="text-xs text-slate-400 font-mono mt-0.5">{staff.employee_id}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[11px] font-bold text-slate-500 uppercase bg-slate-100 px-2.5 py-1 rounded-full">
                              {staff.department}
                            </span>
                            <button
                              onClick={() => handleApprove(staff.id)}
                              className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all"
                            >
                              <Check size={14} strokeWidth={3} /> อนุมัติ
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── Tab 2: ประวัติใบงาน (completed/rejected — logic เดียวกับ CSR) ── */}
            {activeTab === 'history' && (
              <section>
                <div className="flex items-center gap-2.5 mb-3 px-1">
                  <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                    <History size={16} className="text-slate-600" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">ประวัติใบงาน</h2>
                    <p className="text-[11px] text-slate-400">{historyRequests.length} ใบงานที่เสร็จสิ้นหรือถูกปฏิเสธ</p>
                  </div>
                </div>
                <RequestOverviewList items={historyRequests} emptyText="ยังไม่มีประวัติใบงาน" />
              </section>
            )}

            {/* ── Tab 3: ใบงานทั้งหมด (ทุกสถานะ ไม่กรอง) ── */}
            {activeTab === 'all' && (
              <section>
                <div className="flex items-center gap-2.5 mb-3 px-1">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <ClipboardList size={16} className="text-blue-600" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">ใบงานทั้งหมด</h2>
                    <p className="text-[11px] text-slate-400">{allRequests.length} ใบงานในระบบ ทุกสถานะ</p>
                  </div>
                </div>
                <RequestOverviewList items={allRequests} emptyText="ไม่มีใบงานในระบบ" />
              </section>
            )}

            {/* ── Tab 4: ภาพรวม & สถิติ (Visual Dashboard) — แยกไฟล์ ManagerInsights.tsx ── */}
            {activeTab === 'insights' && (
              <ManagerInsights requests={requests} statusLogs={statusLogs} />
            )}

          </div>
        </div>
      </div>
    </div>
  );
}