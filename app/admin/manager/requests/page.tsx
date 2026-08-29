'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ClipboardList,
  Clock,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldCheck,
  LogOut,
} from 'lucide-react';
import { getCSRDashboardData } from '@/app/actions/csr-actions';
import { getManagerRequestDetail } from '@/app/actions/manager-actions';
import { logoutStaffAction } from '@/app/actions/auth-staff';
import { StatCard } from '@/components/StatCard';
import { SkeletonTopBar, SkeletonStatCards, SkeletonSimpleRows } from '@/components/skeletons/DashboardSkeleton';
import { RequestHistoryList } from '@/components/history/RequestHistoryList';
import type { RequestRow, HistorySummaryRow } from '@/lib/types';

// ── "ใบงานทั้งหมด" — เดิมเป็นแท็บ ?tab=all ของหน้า staff-approvals ตอนนี้แยกเป็นหน้าเดี่ยว
// พร้อม chrome มาตรฐาน (pattern เดียวกับ Track & Trace / Audit log) — ดีไซน์รายการเหมือน
// "ประวัติการแลกเปลี่ยน" ของหน้า sale/history แต่ manager เห็นได้ทุกใบงานในระบบ ทุกลูกค้า
export default function ManagerRequestsPage() {
  const router = useRouter();

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // ตัวกรองด่วนตามสถานะ — แพทเทิร์นเดียวกับ "ประวัติการแลกเปลี่ยน" ของ Sale
  const [statusFilter, setStatusFilter] = useState<'pending_review' | 'in_progress' | 'completed' | 'rejected' | null>(null);
  // ตัวกรองประเภทงาน (request_type) — แยกอิสระจาก statusFilter ใช้ร่วมกันได้ (AND)
  // กดซ้ำที่ตัวที่เลือกอยู่แล้วจะล้างกลับเป็น "ทั้งหมด"
  const [requestTypeFilter, setRequestTypeFilter] = useState<'รับคืนลดหนี้' | 'รับคืนแลกเปลี่ยน' | null>(null);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      const dashboardResult = await getCSRDashboardData(); // manager มีสิทธิ์เรียกอยู่แล้ว
      if (dashboardResult.success) {
        setRequests(dashboardResult.requests || []);
      } else {
        console.error('Error fetching requests:', dashboardResult.error);
      }
      setIsLoading(false);
    }
    fetchData();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutStaffAction();
    router.push('/');
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

  // ── นับจำนวนต่อกลุ่มสำหรับแถบสถิติ ──
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
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-5">
        <SkeletonStatCards count={5} />
        <SkeletonSimpleRows rows={4} />
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
              onClick={() => router.replace('/admin/manager')}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary px-3 py-2 rounded-md transition-colors group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-border shrink-0" />
            <div className="min-w-0 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary shrink-0" strokeWidth={2.5} />
              <div className="min-w-0">
                <h1 className="text-sm md:text-base font-bold text-foreground leading-tight truncate">ใบงานทั้งหมด</h1>
                <p className="text-[11px] text-muted-foreground hidden sm:block">GPO Xchange Portal</p>
              </div>
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
      </div>
    </div>
  );
}
