'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Users,
  ClipboardList,
  Clock,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Check,
  Loader2,
  ShieldCheck,
  BarChart3,
  HelpCircle,
} from 'lucide-react';
import { getPendingStaff, approveStaff } from '@/app/actions/auth-staff';
import { getCSRDashboardData } from '@/app/actions/csr-actions';
import { getManagerStatusLogs, getUnansweredChatbotQuestions, getManagerRequestDetail } from '@/app/actions/manager-actions';
import ManagerInsights from './component/ManagerInsights';
import { StatCard } from '@/components/StatCard';
import { RequestHistoryList } from '@/components/history/RequestHistoryList';
import type { LucideIcon } from 'lucide-react';
import type { RequestRow, PendingStaffRow, UnansweredQuestionRow, StatusLogRow, HistorySummaryRow } from '@/lib/types';

// ── ปุ่ม tab บน sidebar ฝั่งซ้าย (desktop) / แนวนอนเลื่อนได้ (mobile) — pattern เดียวกับ CSR Dashboard ──
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

export default function StaffApprovalPage() {
  const router = useRouter();
  const [pendingStaff, setPendingStaff] = useState<PendingStaffRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [statusLogs, setStatusLogs] = useState<StatusLogRow[]>([]);
  const [unansweredQuestions, setUnansweredQuestions] = useState<UnansweredQuestionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // id พนักงานที่กำลังกดอนุมัติอยู่ — กันปุ่มค้างไม่มี feedback ระหว่างรอ server action
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'staff' | 'all' | 'insights' | 'chatbot'>('staff');
  // ตัวกรองด่วนในแท็บ "ใบงานทั้งหมด" — แพทเทิร์นเดียวกับ "ประวัติการแลกเปลี่ยน" ของ Sale
  const [statusFilter, setStatusFilter] = useState<'pending_review' | 'in_progress' | 'completed' | 'rejected' | null>(null);
  // ตัวกรองประเภทงาน (request_type) — แยกอิสระจาก statusFilter ใช้ร่วมกันได้ (AND)
  // กดซ้ำที่ตัวที่เลือกอยู่แล้วจะล้างกลับเป็น "ทั้งหมด"
  const [requestTypeFilter, setRequestTypeFilter] = useState<'รับคืนลดหนี้' | 'รับคืนแลกเปลี่ยน' | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const [staffResult, dashboardResult, statusLogsResult, unansweredResult] = await Promise.all([
      getPendingStaff(),
      getCSRDashboardData(), // manager มีสิทธิ์เรียกอยู่แล้ว (getCSRSession อนุญาต department 'manager')
      getManagerStatusLogs(), // manager-only — ใช้คำนวณเวลาเฉลี่ยแต่ละขั้นตอน + เหตุผลปฏิเสธ
      getUnansweredChatbotQuestions(), // manager-only — คำถามที่บอทลูกค้าตอบ "ไม่แน่ใจ"
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

    if (unansweredResult.success) {
      setUnansweredQuestions(unansweredResult.data || []);
    } else {
      console.error("Error fetching unanswered chatbot questions:", unansweredResult.error);
    }

    setIsLoading(false);
  };

  const handleApprove = async (id: string) => {
    const confirmed = confirm("ยืนยันการอนุมัติพนักงานท่านนี้?");
    if (!confirmed) return;

    setApprovingId(id);
    try {
      const res = await approveStaff(id);

      if (res.success) {
        alert("อนุมัติเรียบร้อยแล้ว");
        fetchData();
      } else {
        alert("เกิดข้อผิดพลาด: " + (('error' in res && res.error) || 'ไม่ทราบสาเหตุ'));
      }
    } finally {
      setApprovingId(null);
    }
  };

  const handleBack = () => {
    router.replace('/');
  };

  // ใบงานทั้งหมด = ทุกสถานะไม่กรองเลย ทุกลูกค้า ไม่จำกัดขอบเขต (ต่างจาก sale ที่ scope ตามลูกค้าที่ดูแล)
  const allRequests = requests;

  // แปลงเป็น HistorySummaryRow[] เพื่อป้อนให้ RequestHistoryList แบบเดียวกับหน้า sale/history —
  // ข้อมูลตัวเต็ม (drug_items ฯลฯ) โหลดแยกต่างหากตอนขยายแถวผ่าน getManagerRequestDetail
  const allRequestsHistory: HistorySummaryRow[] = allRequests.map((r) => ({
    id: r.id,
    ref_id: r.ref_id,
    request_type: r.request_type,
    current_status: r.current_status,
    total_value: r.total_value,
    created_at: r.created_at,
    hospital_name: r.hospital_name,
    province: r.province,
  }));

  // ── นับจำนวนต่อกลุ่มสำหรับแถบสถิติ "ใบงานทั้งหมด" ──
  const pendingReviewCount = allRequestsHistory.filter((r) => r.current_status === 'pending_review').length;
  const completedCount = allRequestsHistory.filter((r) => r.current_status === 'completed').length;
  const rejectedCount = allRequestsHistory.filter((r) => r.current_status === 'rejected').length;
  const inProgressCount = allRequestsHistory.length - pendingReviewCount - completedCount - rejectedCount;

  const statusFilteredHistory = !statusFilter ? allRequestsHistory
    : statusFilter === 'in_progress'
      ? allRequestsHistory.filter((r) => !['pending_review', 'completed', 'rejected'].includes(r.current_status))
      : allRequestsHistory.filter((r) => r.current_status === statusFilter);

  const filteredAllRequestsHistory = !requestTypeFilter ? statusFilteredHistory
    : statusFilteredHistory.filter((r) => r.request_type === requestTypeFilter);

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <Loader2 className="w-9 h-9 text-orange-500 animate-spin mx-auto" strokeWidth={2.5} />
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
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-all group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-slate-200 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-bold text-foreground leading-tight truncate">Manager Portal</h1>
              <p className="text-[10px] md:text-[11px] text-muted-foreground hidden sm:block">GPO Xchange Portal</p>
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
                icon={ClipboardList} label="ใบงานทั้งหมด" count={allRequests.length}
                active={activeTab === 'all'} onClick={() => setActiveTab('all')}
                accentBg="bg-blue-100" accentColor="text-blue-600"
              />
              <TabButton
                icon={BarChart3} label="ภาพรวม & สถิติ" count={allRequests.length}
                active={activeTab === 'insights'} onClick={() => setActiveTab('insights')}
                accentBg="bg-purple-100" accentColor="text-purple-600"
              />
              <TabButton
                icon={HelpCircle} label="คำถามที่บอทตอบไม่ได้" count={unansweredQuestions.length}
                active={activeTab === 'chatbot'} onClick={() => setActiveTab('chatbot')}
                accentBg="bg-teal-100" accentColor="text-teal-600"
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
                    <h2 className="text-sm font-bold text-foreground">จัดการสิทธิ์พนักงาน</h2>
                    <p className="text-[11px] text-muted-foreground">{pendingStaff.length} รายการรออนุมัติ</p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-border overflow-hidden">
                  {pendingStaff.length === 0 ? (
                    <div className="py-12 text-center">
                      <Users className="w-9 h-9 text-slate-300 mx-auto mb-2.5" strokeWidth={1.75} />
                      <p className="text-sm text-muted-foreground font-medium">ไม่มีรายการรออนุมัติ</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {pendingStaff.map((staff) => (
                        <div key={staff.id}
                          className="flex items-center justify-between px-4 md:px-6 py-3.5 md:py-4 hover:bg-slate-50 transition-colors gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{staff.full_name}</p>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">{staff.employee_id}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[11px] font-bold text-muted-foreground uppercase bg-slate-100 px-2.5 py-1 rounded-full">
                              {staff.department}
                            </span>
                            <button
                              onClick={() => handleApprove(staff.id)}
                              disabled={approvingId === staff.id}
                              className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-60 disabled:pointer-events-none"
                            >
                              {approvingId === staff.id
                                ? <Loader2 size={14} className="animate-spin" strokeWidth={2.5} />
                                : <Check size={14} strokeWidth={3} />}
                              อนุมัติ
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── Tab 2: ใบงานทั้งหมด — ดีไซน์เดียวกับ "ประวัติการแลกเปลี่ยน" ของหน้า sale/history
                แต่ manager เห็นได้ทุกใบงานในระบบ ทุกลูกค้า ไม่ต้อง scope ตามขอบเขตที่ดูแลเหมือน sale ── */}
            {activeTab === 'all' && (
              <section>
                <div className="flex items-center gap-2.5 mb-3 px-1">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <ClipboardList size={16} className="text-blue-600" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-sm font-bold text-foreground">ใบงานทั้งหมด</h2>
                      <p className="text-[11px] text-muted-foreground">{allRequests.length} ใบงานในระบบ ทุกสถานะ ทุกลูกค้า</p>
                    </div>

                    {/* ── badge กรองประเภทงาน — กดซ้ำเพื่อล้างตัวกรอง ── */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setRequestTypeFilter(requestTypeFilter === 'รับคืนลดหนี้' ? null : 'รับคืนลดหนี้')}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                          requestTypeFilter === 'รับคืนลดหนี้'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                        }`}
                      >
                        รับคืนลดหนี้
                      </button>
                      <button
                        onClick={() => setRequestTypeFilter(requestTypeFilter === 'รับคืนแลกเปลี่ยน' ? null : 'รับคืนแลกเปลี่ยน')}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                          requestTypeFilter === 'รับคืนแลกเปลี่ยน'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                        }`}
                      >
                        รับคืนแลกเปลี่ยน
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-5">
                  <StatCard
                    icon={ClipboardList} value={allRequestsHistory.length} label="ทั้งหมด" iconBg="bg-slate-100" iconText="text-slate-600"
                    isActive={statusFilter === null} activeBorder="border-slate-300" activeRing="ring-2 ring-slate-100"
                    onClick={() => setStatusFilter(null)}
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

                <RequestHistoryList
                  history={filteredAllRequestsHistory}
                  emptyText="ไม่มีใบงานในระบบ"
                  fetchDetail={getManagerRequestDetail}
                  showOrgBadge
                />
              </section>
            )}

            {/* ── Tab 4: ภาพรวม & สถิติ (Visual Dashboard) — แยกไฟล์ ManagerInsights.tsx ── */}
            {activeTab === 'insights' && (
              <ManagerInsights requests={requests} statusLogs={statusLogs} />
            )}

            {/* ── Tab 5: คำถามที่บอทลูกค้าตอบ "ไม่แน่ใจ" — ดูว่าควรเพิ่มเข้า FAQ_ENTRIES ไหม ── */}
            {activeTab === 'chatbot' && (
              <section>
                <div className="flex items-center gap-2.5 mb-3 px-1">
                  <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
                    <HelpCircle size={16} className="text-teal-600" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">คำถามที่บอทตอบไม่ได้</h2>
                    <p className="text-[11px] text-muted-foreground">
                      {unansweredQuestions.length} คำถามล่าสุดที่บอทลูกค้าตอบว่า "ไม่แน่ใจ" — ถ้าเจอคำถามซ้ำๆ ควรเพิ่มเข้า FAQ ใน lib/chatbot-knowledge.ts
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-border overflow-hidden">
                  {unansweredQuestions.length === 0 ? (
                    <div className="py-12 text-center">
                      <HelpCircle className="w-9 h-9 text-slate-300 mx-auto mb-2.5" strokeWidth={1.75} />
                      <p className="text-sm text-muted-foreground font-medium">ยังไม่มีคำถามที่บอทตอบไม่ได้</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {unansweredQuestions.map((q) => (
                        <div key={q.id} className="px-4 md:px-6 py-4 space-y-1.5">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold text-foreground">{q.question}</p>
                            <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                              {new Date(q.created_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                            </span>
                          </div>
                          {q.answer && (
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{q.answer}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}