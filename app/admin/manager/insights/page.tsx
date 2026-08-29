'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, BarChart3, Loader2, ShieldCheck, LogOut } from 'lucide-react';
import { getCSRDashboardData } from '@/app/actions/csr-actions';
import { getManagerStatusLogs } from '@/app/actions/manager-actions';
import { logoutStaffAction } from '@/app/actions/auth-staff';
import { SkeletonTopBar, SkeletonManagerInsights } from '@/components/skeletons/DashboardSkeleton';
import type { RequestRow, StatusLogRow } from '@/lib/types';

// ── "ภาพรวม & สถิติ" — เดิมเป็นแท็บ ?tab=insights ของหน้า staff-approvals ตอนนี้แยกเป็นหน้า
// เดี่ยวพร้อม chrome มาตรฐาน (pattern เดียวกับ Track & Trace / Audit log)
//
// Code-split ManagerInsights (recharts + ~730 บรรทัด) ออกจาก bundle หลัก — คงพาธ component
// ไว้ที่เดิม (app/admin/manager/staff-approvals/component/) เพราะยังถูก import โดยหน้า
// รายงานของ CSR และ Sale ด้วย — ssr:false เพราะ recharts วัดขนาด DOM ฝั่ง client เท่านั้น
const ManagerInsights = dynamic(() => import('../staff-approvals/component/ManagerInsights'), {
  loading: () => <SkeletonManagerInsights />,
  ssr: false,
});

export default function ManagerInsightsPage() {
  const router = useRouter();

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [statusLogs, setStatusLogs] = useState<StatusLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      const [dashboardResult, statusLogsResult] = await Promise.all([
        getCSRDashboardData(),
        getManagerStatusLogs(),
      ]);
      if (dashboardResult.success) {
        setRequests(dashboardResult.requests || []);
      } else {
        console.error('Error fetching requests:', dashboardResult.error);
      }
      if (statusLogsResult.success) {
        setStatusLogs(statusLogsResult.data || []);
      } else {
        console.error('Error fetching status logs:', statusLogsResult.error);
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

  if (isLoading) return (
    <div className="min-h-screen bg-background">
      <SkeletonTopBar />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <SkeletonManagerInsights />
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
              <BarChart3 className="w-4 h-4 text-primary shrink-0" strokeWidth={2.5} />
              <div className="min-w-0">
                <h1 className="text-sm md:text-base font-bold text-foreground leading-tight truncate">ภาพรวม & สถิติ</h1>
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
        <ManagerInsights requests={requests} statusLogs={statusLogs} />
      </div>
    </div>
  );
}
