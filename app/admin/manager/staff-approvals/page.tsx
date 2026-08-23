'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  FileSpreadsheet,
  Download,
  Search,
  FileText,
  LogOut,
  Briefcase,
  Building2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { getPendingStaff, approveStaff, logoutStaffAction } from '@/app/actions/auth-staff';
import { getCSRDashboardData } from '@/app/actions/csr-actions';
import { getManagerStatusLogs, getManagerRequestDetail } from '@/app/actions/manager-actions';
import { StatCard } from '@/components/StatCard';
import { SkeletonTopBar, SkeletonSidebarTabs, SkeletonSimpleRows, SkeletonManagerInsights } from '@/components/skeletons/DashboardSkeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { RequestHistoryList } from '@/components/history/RequestHistoryList';
import type { LucideIcon } from 'lucide-react';
import type { RequestRow, PendingStaffRow, StatusLogRow, HistorySummaryRow } from '@/lib/types';

// Code-split ManagerInsights (recharts + ~730 บรรทัด) ออกจาก bundle หลักของหน้านี้ — อยู่หลัง
// แท็บ "ภาพรวม & สถิติ" ที่ผู้ใช้ต้องกดเลือกเอง เดิมถูกโหลดมาพร้อมหน้าตั้งแต่แรกเข้าทั้งที่ยังไม่ทัน
// กดดู ใช้ SkeletonManagerInsights ตัวเดียวกับที่มีอยู่แล้วเป็น loading fallback ระหว่างรอโหลด
// chunk ไม่ต้องสร้าง skeleton ใหม่ — ssr: false เพราะ recharts วัดขนาด DOM ฝั่ง client เท่านั้น
// และหน้านี้เป็น 'use client' อยู่แล้ว ไม่มีประโยชน์จาก SSR ของกราฟ
const ManagerInsights = dynamic(() => import('./component/ManagerInsights'), {
  loading: () => <SkeletonManagerInsights />,
  ssr: false,
});

// ── ปุ่ม tab บน sidebar ฝั่งซ้าย (desktop) / แนวนอนเลื่อนได้ (mobile) — pattern เดียวกับ CSR
// Dashboard — accent เดียวทั้งหมด (ตัด indigo/violet/gold/teal ต่อแท็บออก ไม่มีทั้ง 4 แท็บนี้
// เป็นสถานะเชิงความหมาย แค่หมวดเนื้อหาคนละหน้า) ──
function TabButton({ icon: Icon, label, count, active, onClick }: {
  icon: LucideIcon; label: string; count: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-3 px-3.5 py-3 rounded-md text-sm font-semibold transition-colors shrink-0 md:w-full text-left border
        ${active
          ? 'bg-card border-border text-foreground'
          : 'bg-transparent border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
    >
      {active && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary" />
      )}
      <span className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition-colors ${active ? 'bg-accent' : 'bg-secondary'}`}>
        <Icon size={15} className={active ? 'text-accent-foreground' : 'text-muted-foreground'} strokeWidth={2.5} />
      </span>
      <span className="whitespace-nowrap md:whitespace-normal md:flex-1">{label}</span>
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 tabular-nums ${active ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground'}`}>
        {count}
      </span>
    </button>
  );
}

// ── segmented control สำหรับ sub-tab ภายใน Download Center ──
function DownloadSubTabButton({ icon: Icon, label, active, onClick }: {
  icon: LucideIcon; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold transition-colors shrink-0 whitespace-nowrap
        ${active ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
    >
      <Icon size={15} className={active ? 'text-primary' : 'text-muted-foreground'} strokeWidth={2.5} />
      {label}
    </button>
  );
}

// tab ที่ยอมรับได้จาก query param ?tab= (ลิงก์มาจากการ์ดในหน้า hub — app/admin/manager/page.tsx)
// 'chatbot' เดิมอยู่ตรงนี้ ย้ายไปเป็นหน้าแยกที่ CSR hub แล้ว (app/admin/csr/chatbot/page.tsx)
const VALID_TABS = ['staff', 'all', 'insights', 'downloads'] as const;
type ManagerTab = (typeof VALID_TABS)[number];

function StaffApprovalPageInner() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const initialTab: ManagerTab = (VALID_TABS as readonly string[]).includes(tabFromUrl ?? '')
    ? (tabFromUrl as ManagerTab)
    : 'staff';

  const [pendingStaff, setPendingStaff] = useState<PendingStaffRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [statusLogs, setStatusLogs] = useState<StatusLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // id พนักงานที่กำลังกดอนุมัติอยู่ — กันปุ่มค้างไม่มี feedback ระหว่างรอ server action
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ManagerTab>(initialTab);
  // ตัวกรองด่วนในแท็บ "ใบงานทั้งหมด" — แพทเทิร์นเดียวกับ "ประวัติการแลกเปลี่ยน" ของ Sale
  const [statusFilter, setStatusFilter] = useState<'pending_review' | 'in_progress' | 'completed' | 'rejected' | null>(null);
  // ตัวกรองประเภทงาน (request_type) — แยกอิสระจาก statusFilter ใช้ร่วมกันได้ (AND)
  // กดซ้ำที่ตัวที่เลือกอยู่แล้วจะล้างกลับเป็น "ทั้งหมด"
  const [requestTypeFilter, setRequestTypeFilter] = useState<'รับคืนลดหนี้' | 'รับคืนแลกเปลี่ยน' | null>(null);

  // ── Download Center (แท็บ downloads) — sub-tab + คำค้นหาใบงานเดี่ยว ── (ตัวกรองช่วงวันที่ +
  // Audit Trail Report ย้ายไปหน้า /admin/manager/sla แล้ว — ดู 06-sla-monitoring-design.md หัวข้อ 7)
  const [downloadSubTab, setDownloadSubTab] = useState<'reports' | 'single'>('reports');
  const [downloadSearch, setDownloadSearch] = useState('');
  // แบ่งหน้าสำหรับแท็บ "ตามใบงานเดี่ยว" — 10 รายการต่อหน้า
  const [singlePage, setSinglePage] = useState(1);
  const SINGLE_PAGE_SIZE = 10;

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

  useEffect(() => {
    fetchData();
  }, []);

  const handleApprove = async (id: string) => {
    const confirmed = await confirm("ยืนยันการอนุมัติพนักงานท่านนี้?");
    if (!confirmed) return;

    setApprovingId(id);
    try {
      const res = await approveStaff(id);

      if (res.success) {
        toast.success("อนุมัติเรียบร้อยแล้ว");
        fetchData();
      } else {
        toast.error(('error' in res && res.error) || 'ไม่ทราบสาเหตุ');
      }
    } finally {
      setApprovingId(null);
    }
  };

  const handleBack = () => {
    router.replace('/admin/manager');
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutStaffAction();
    router.push('/');
  };

  // ใบงานทั้งหมด = ทุกสถานะไม่กรองเลย ทุกลูกค้า ไม่จำกัดขอบเขต (ต่างจาก sale ที่ scope ตามลูกค้าที่ดูแล)
  const allRequests = requests;

  // ── Download Center: ค้นหาใบงานเดี่ยว (ref id หรือชื่อหน่วยงาน) เรียงใหม่สุดก่อน — แบ่งหน้าละ
  // SINGLE_PAGE_SIZE รายการแทนการตัด 30 แถวแรกทิ้งแบบเดิม เพื่อให้เข้าถึงใบงานเก่าๆ ได้ครบ ──
  const downloadSearchTrimmed = downloadSearch.trim().toLowerCase();
  const singleRequestResults = [...allRequests]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .filter((r) => {
      if (!downloadSearchTrimmed) return true;
      const haystack = `${r.ref_id ?? ''} ${r.hospital_name ?? ''}`.toLowerCase();
      return haystack.includes(downloadSearchTrimmed);
    });
  const singleTotalPages = Math.max(1, Math.ceil(singleRequestResults.length / SINGLE_PAGE_SIZE));
  const singlePageClamped = Math.min(singlePage, singleTotalPages);
  const singleRequestPageItems = singleRequestResults.slice(
    (singlePageClamped - 1) * SINGLE_PAGE_SIZE,
    singlePageClamped * SINGLE_PAGE_SIZE,
  );

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
    <div className="min-h-screen bg-background">
      <SkeletonTopBar />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          <SkeletonSidebarTabs count={4} />
          {/* activeTab รู้ค่าแล้วตั้งแต่ตอน mount (มาจาก URL ?tab= ก่อนเริ่ม fetch) — ใช้
              โครง skeleton ให้ตรงกับแท็บที่จะโชว์จริงหลังโหลดเสร็จ กันเนื้อหากราฟ "โผล่" แทรก
              กลางหน้าตอนสลับจาก SkeletonSimpleRows ทั่วไปเป็น ManagerInsights ทันที */}
          <div className="flex-1 min-w-0">
            {activeTab === 'insights' ? <SkeletonManagerInsights /> : <SkeletonSimpleRows rows={4} />}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">

      {/* ══ Top Bar ══ */}
      <div className="relative z-30 sticky top-0 bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary px-3 py-2 rounded-md transition-colors group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-border shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-bold text-foreground leading-tight truncate">Manager Portal</h1>
              <p className="text-[11px] text-muted-foreground hidden sm:block">GPO Xchange Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <span className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 rounded-full border bg-accent border-transparent text-accent-foreground text-[11px] md:text-xs font-semibold shrink-0">
              <ShieldCheck size={13} strokeWidth={2.5} />
              <span>Manager</span>
            </span>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary border border-border px-3 py-2 rounded-md transition-colors disabled:opacity-60 disabled:pointer-events-none"
            >
              {isLoggingOut ? <Loader2 size={15} className="animate-spin" strokeWidth={2.5} /> : <LogOut size={15} strokeWidth={2.5} />}
              <span className="hidden sm:inline">ออกจากระบบ</span>
            </button>
          </div>
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
              />
              <TabButton
                icon={ClipboardList} label="ใบงานทั้งหมด" count={allRequests.length}
                active={activeTab === 'all'} onClick={() => setActiveTab('all')}
              />
              <TabButton
                icon={BarChart3} label="ภาพรวม & สถิติ" count={allRequests.length}
                active={activeTab === 'insights'} onClick={() => setActiveTab('insights')}
              />
              <TabButton
                icon={FileSpreadsheet} label="รายงานผู้บริหาร" count={allRequests.length}
                active={activeTab === 'downloads'} onClick={() => setActiveTab('downloads')}
              />
            </nav>
          </aside>

          {/* ══ Content ══ */}
          <div className="flex-1 min-w-0">

            {/* ── Tab 1: จัดการสิทธิ์พนักงาน ── */}
            {activeTab === 'staff' && (
              <section>
                <div className="flex items-center gap-2.5 mb-3 px-1">
                  <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shrink-0">
                    <Users size={16} className="text-accent-foreground" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">จัดการสิทธิ์พนักงาน</h2>
                    <p className="text-[11px] text-muted-foreground">{pendingStaff.length} รายการรออนุมัติ</p>
                  </div>
                </div>

                <div className="bg-card rounded-lg border border-border overflow-hidden">
                  {pendingStaff.length === 0 ? (
                    <div className="py-12 text-center">
                      <Users className="w-9 h-9 text-muted-foreground/40 mx-auto mb-2.5" strokeWidth={1.75} />
                      <p className="text-sm text-muted-foreground font-medium">ไม่มีรายการรออนุมัติ</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {pendingStaff.map((staff) => (
                        <div key={staff.id}
                          className="flex items-center justify-between px-4 md:px-6 py-3.5 md:py-4 hover:bg-secondary/50 transition-colors gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{staff.full_name}</p>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">{staff.employee_id}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[11px] font-bold text-muted-foreground uppercase bg-secondary px-2.5 py-1 rounded-full">
                              {staff.department}
                            </span>
                            <button
                              onClick={() => handleApprove(staff.id)}
                              disabled={approvingId === staff.id}
                              className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-md text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-colors disabled:opacity-60 disabled:pointer-events-none"
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
                  <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shrink-0">
                    <ClipboardList size={16} className="text-accent-foreground" strokeWidth={2.5} />
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
                    icon={ClipboardList} value={allRequestsHistory.length} label="ทั้งหมด" iconBg="bg-accent" iconText="text-accent-foreground"
                    isActive={statusFilter === null} activeBorder="border-primary/40" activeRing="ring-2 ring-primary/10"
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

            {/* ── Tab: รายงานผู้บริหาร — export audit trail + รายงานสรุปต่างๆ เป็นไฟล์ Excel
                 ให้ manager โหลดเก็บไว้ตรวจสอบย้อนหลังได้ (ดู downloads-export/route.ts) ── */}
            {activeTab === 'downloads' && (
              <section className="space-y-4">
                <div className="flex items-center gap-2.5 px-1">
                  <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shrink-0">
                    <FileSpreadsheet size={16} className="text-accent-foreground" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">รายงานผู้บริหาร</h2>
                    <p className="text-[11px] text-muted-foreground">
                      ดาวน์โหลดรายงานสรุปสำหรับผู้บริหาร เป็นไฟล์ Excel ไว้เก็บ/ตรวจสอบย้อนหลัง (Audit Trail Report ย้ายไปที่ SLA Monitoring System แล้ว)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 p-1 rounded-md bg-secondary w-fit">
                  <DownloadSubTabButton
                    icon={Briefcase} label="รายงานผู้บริหาร"
                    active={downloadSubTab === 'reports'} onClick={() => setDownloadSubTab('reports')}
                  />
                  <DownloadSubTabButton
                    icon={FileText} label="ตามใบงานเดี่ยว"
                    active={downloadSubTab === 'single'} onClick={() => setDownloadSubTab('single')}
                  />
                </div>

                {downloadSubTab === 'single' && (
                  <div className="bg-card rounded-lg border border-border overflow-hidden">
                    <div className="p-4 border-b border-border">
                      <div className="relative max-w-sm">
                        <Search size={14} strokeWidth={2.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text" value={downloadSearch}
                          onChange={(e) => { setDownloadSearch(e.target.value); setSinglePage(1); }}
                          placeholder="ค้นหา ref id หรือชื่อหน่วยงาน..."
                          className="w-full text-sm border border-border rounded-md pl-8 pr-3 py-2"
                        />
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {singleRequestResults.length === 0 ? (
                        <div className="py-10 text-center">
                          <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" strokeWidth={1.75} />
                          <p className="text-sm text-muted-foreground font-medium">ไม่พบใบงานที่ตรงกับคำค้นหา</p>
                        </div>
                      ) : (
                        singleRequestPageItems.map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-3 px-4 md:px-6 py-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-foreground font-mono">{r.ref_id}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {r.hospital_name ?? '-'} · {new Date(r.created_at || 0).toLocaleDateString('th-TH')}
                              </p>
                            </div>
                            <a
                              href={`/admin/manager/downloads-export?mode=request&requestId=${r.id}`}
                              className="flex items-center gap-1.5 text-xs font-bold text-accent-foreground bg-accent hover:bg-primary/15 px-3 py-2 rounded-md transition-colors shrink-0"
                            >
                              <Download size={13} strokeWidth={2.5} /> ดาวน์โหลด
                            </a>
                          </div>
                        ))
                      )}
                    </div>

                    {/* ── ส่วนกำกับหน้า — pattern เดียวกับ components/history/RequestHistoryList.tsx
                         ที่ใช้อยู่แล้วในแท็บ "ใบงานทั้งหมด" ของหน้านี้ (และหน้าประวัติของ CSR) ── */}
                    {singleTotalPages > 1 && (
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 md:px-6 py-3.5 border-t border-border bg-secondary">
                        <p className="text-xs text-muted-foreground">
                          แสดง {(singlePageClamped - 1) * SINGLE_PAGE_SIZE + 1}–{Math.min(singlePageClamped * SINGLE_PAGE_SIZE, singleRequestResults.length)} จาก {singleRequestResults.length} รายการ
                        </p>
                        <div className="flex items-center gap-1 overflow-x-auto">
                          <button
                            onClick={() => setSinglePage((p) => Math.max(1, p - 1))}
                            disabled={singlePageClamped === 1}
                            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
                            aria-label="หน้าก่อนหน้า"
                          >
                            <ChevronLeft size={16} strokeWidth={2.5} />
                          </button>
                          {Array.from({ length: singleTotalPages }, (_, i) => i + 1).map((p) => (
                            <button
                              key={p}
                              onClick={() => setSinglePage(p)}
                              className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                                p === singlePageClamped ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                          <button
                            onClick={() => setSinglePage((p) => Math.min(singleTotalPages, p + 1))}
                            disabled={singlePageClamped === singleTotalPages}
                            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
                            aria-label="หน้าถัดไป"
                          >
                            <ChevronRight size={16} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {downloadSubTab === 'reports' && (
                  <div className="space-y-4">
                    {/* ── รายงานพอร์ตลูกค้า/หน่วยงาน — ภาพรวมสะสมทั้งหมด ไม่มีตัวกรองวันที่ ──
                         (Audit Trail Report ย้ายไปหน้า /admin/manager/sla แล้ว — รวมกับ
                         SLA Monitoring System ตาม 06-sla-monitoring-design.md หัวข้อ 7) */}
                    <div className="bg-card rounded-lg border border-border p-5 space-y-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shrink-0">
                          <Building2 size={16} className="text-accent-foreground" strokeWidth={2.5} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-foreground">พอร์ตลูกค้า/หน่วยงาน</h3>
                          <p className="text-[11px] text-muted-foreground">รายชื่อหน่วยงานที่ลงทะเบียนทั้งหมด พร้อมยอดใบงาน/มูลค่ารวมสะสม — ภาพรวมทั้งพอร์ต ไม่กรองตามช่วงเวลา</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end">
                        <a
                          href="/admin/manager/downloads-export?mode=customer-portfolio"
                          className="flex items-center gap-1.5 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 px-3.5 py-2.5 rounded-md transition-colors shrink-0"
                        >
                          <Download size={14} strokeWidth={2.5} /> ดาวน์โหลด Excel
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

export default function StaffApprovalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background">
        <SkeletonTopBar />
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="flex flex-col md:flex-row gap-4 md:gap-8">
            <SkeletonSidebarTabs count={4} />
            <div className="flex-1 min-w-0"><SkeletonSimpleRows rows={4} /></div>
          </div>
        </div>
      </div>
    }>
      <StaffApprovalPageInner />
    </Suspense>
  );
}