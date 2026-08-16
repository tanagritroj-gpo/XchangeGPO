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
    <div className="relative min-h-screen bg-gradient-to-b from-[#FBF6E8] via-[#F8F2DF] to-[#F1E7C8] overflow-hidden">

      {/* ── พื้นหลังลูกเล่น — แสงกระจายแบบสุ่ม + บลอบใหญ่ ตรงกับหน้า Sale Hub ──
          ใช้ fixed แทน absolute ตำแหน่ง % จะอ้างอิงความสูงจอเสมอ ไม่ขึ้นกับความยาวเนื้อหา */}
      <div className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute -top-16 -right-14 w-56 h-56 md:-top-20 md:-right-20 md:w-[380px] md:h-[380px] rounded-full bg-[radial-gradient(circle,_#EAD94C_0%,_transparent_72%)] opacity-40 blur-2xl" />
        <div className="absolute top-[42%] -left-14 w-48 h-48 md:top-[45%] md:-left-28 md:w-[340px] md:h-[340px] rounded-full bg-[radial-gradient(circle,_#E1592A_0%,_transparent_72%)] opacity-[0.14] blur-3xl" />
        <div className="absolute -bottom-16 right-[8%] w-56 h-56 md:-bottom-28 md:w-[400px] md:h-[400px] rounded-full bg-[radial-gradient(circle,_#2E2B7A_0%,_transparent_72%)] opacity-[0.10] blur-3xl" />
        <div className="absolute top-[12%] left-[10%] w-12 h-12 rounded-full bg-[#EAD94C] opacity-[0.12] blur-lg hidden sm:block" />
        <div className="absolute top-[24%] right-[8%] w-10 h-10 rounded-full bg-white opacity-20 blur-lg hidden sm:block" />
        <div className="absolute bottom-[16%] left-[8%] w-14 h-14 rounded-full bg-[#E1592A] opacity-[0.09] blur-xl" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto w-full px-4 md:px-6 pt-6">
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/45 backdrop-blur-md border border-white/50 shadow-sm">
          <Link href="/admin/sale" className="flex items-center gap-2 text-sm font-bold text-[#6B6698] hover:text-[#E1592A] transition-colors">
            <ArrowLeft className="w-5 h-5" /> ย้อนกลับ
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm font-bold text-[#6B6698] hover:text-[#E1592A] bg-white/70 hover:bg-[#FBEFE6] border border-white/60 hover:border-[#F0C6AA] px-4 py-2.5 rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5" /> ออกจากระบบ
          </button>
        </div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto w-full px-4 md:px-6 py-6 md:py-10">
        <div className="flex items-center gap-3 mb-5 px-1">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#FBF0C8] to-[#F4DFA0] flex items-center justify-center shrink-0">
            <History size={19} className="text-[#E1592A]" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-base font-bold text-[#241F5E]">ประวัติใบงาน</h1>
            <p className="text-xs text-[#6B6698]">แสดงเฉพาะข้อมูลลูกค้าในพื้นที่ดูแลรับผิดชอบของคุณ</p>
          </div>
        </div>

        {loading && <div className="mb-5"><SkeletonStatCards count={5} /></div>}

        {!loading && history.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-5">
            <StatCard
              icon={ClipboardList} value={history.length} label="ทั้งหมด" iconBg="bg-[#ECEAF6]" iconText="text-[#2E2B7A]"
              isActive={statusFilter === null} activeBorder="border-[#2E2B7A]/40" activeRing="ring-2 ring-[#2E2B7A]/10"
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
