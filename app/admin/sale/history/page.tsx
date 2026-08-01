'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { History, ArrowLeft, LogOut } from 'lucide-react';
import { logoutStaffAction } from '@/app/actions/auth-staff';
import { getSaleCustomerHistory, getSaleRequestDetail } from '@/app/actions/sale-actions';
import { RequestHistoryList } from '@/components/history/RequestHistoryList';

export default function SaleHistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  const handleLogout = async () => {
    await logoutStaffAction();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto w-full px-4 md:px-6 pt-8 flex items-center justify-between gap-3">
        <Link href="/admin/sale" className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-rose-600 transition-colors">
          <ArrowLeft className="w-5 h-5" /> ย้อนกลับ
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-red-600 bg-white hover:bg-red-50 border border-rose-100 hover:border-red-200 px-4 py-2.5 rounded-xl transition-colors"
        >
          <LogOut className="w-5 h-5" /> ออกจากระบบ
        </button>
      </div>

      <div className="max-w-4xl mx-auto w-full px-4 md:px-6 py-6 md:py-10">
        <div className="flex items-center gap-3 mb-5 px-1">
          <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
            <History size={19} className="text-rose-600" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">ประวัติการแลกเปลี่ยน</h1>
            <p className="text-xs text-muted-foreground">แสดงเฉพาะข้อมูลลูกค้าในพื้นที่ดูแลรับผิดชอบของคุณ</p>
          </div>
        </div>

        <RequestHistoryList
          history={history}
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
