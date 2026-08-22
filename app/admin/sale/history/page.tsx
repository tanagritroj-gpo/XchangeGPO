'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { History, ArrowLeft, LogOut, ClipboardList, Clock, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { logoutStaffAction } from '@/app/actions/auth-staff';
import { getSaleCustomerHistory, getSaleRequestDetail } from '@/app/actions/sale-actions';
import { RequestHistoryList } from '@/components/history/RequestHistoryList';
import { StatCard } from '@/components/StatCard';
import { SkeletonStatCards } from '@/components/skeletons/DashboardSkeleton';
import type { HistorySummaryRow } from '@/lib/types';

type StatusFilter = 'pending_review' | 'in_progress' | 'completed' | 'rejected' | null;

export default function SaleHistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<HistorySummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getSaleCustomerHistory();
      if (cancelled) return;
      setHistory(data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── นับจำนวนต่อกลุ่มสำหรับแถบสถิติด้านบน — แพทเทิร์นเดียวกับ CSR Dashboard ──
  const pendingReviewCount = history.filter((r) => r.current_status === 'pending_review').length;
  const completedCount = history.filter((r) => r.current_status === 'completed').length;
  const rejectedCount = history.filter((r) => r.current_status === 'rejected').length;
  const inProgressCount = history.length - pendingReviewCount - completedCount - rejectedCount;

  const filteredHistory = !statusFilter ? history
    : statusFilter === 'in_progress'
      ? history.filter((r) => !['pending_review', 'completed', 'rejected'].includes(r.current_status))
      : history.filter((r) => r.current_status === statusFilter);

  const handleLogout = async () => {
    await logoutStaffAction();
    router.push('/');
  };

  return (
    // ★ พื้นหลัง/การ์ด ปรับตาม design.md (Option B — Institutional Green) ให้ตรงกับ
    // app/admin/sale/page.tsx — accent เดียว (primary/accent token), ไม่มี gradient/blur/blob
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto w-full px-4 md:px-6 pt-6">
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-card border border-border">
          <Link href="/admin/sale" className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" /> ย้อนกลับ
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary border border-border px-4 py-2.5 rounded-md transition-colors"
          >
            <LogOut className="w-5 h-5" /> ออกจากระบบ
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full px-4 md:px-6 py-6 md:py-10">
        <div className="flex items-center gap-3 mb-5 px-1">
          <div className="w-10 h-10 rounded-md bg-accent text-accent-foreground shadow-sm shadow-accent/40 flex items-center justify-center shrink-0">
            <History size={19} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">ประวัติใบงาน</h1>
            <p className="text-xs text-muted-foreground">แสดงเฉพาะข้อมูลลูกค้าในพื้นที่ดูแลรับผิดชอบของคุณ</p>
          </div>
        </div>

        {loading && <div className="mb-5"><SkeletonStatCards count={5} /></div>}

        {!loading && history.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-5">
            <StatCard
              icon={ClipboardList} value={history.length} label="ทั้งหมด" iconBg="bg-accent" iconText="text-accent-foreground"
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
        )}

        <RequestHistoryList
          history={filteredHistory}
          loading={loading}
          emptyText="ยังไม่มีคำร้องจากลูกค้าในพื้นที่ดูแลของคุณ"
          fetchDetail={getSaleRequestDetail}
          showOrgBadge
          size="lg"
        />
      </div>
    </div>
  );
}
