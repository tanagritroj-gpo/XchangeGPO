'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStaffSession, logoutStaffAction } from '@/app/actions/auth-staff';
import Link from 'next/link';
import { TrendingUp, User, MapPin, Users, History, ArrowRight, LogOut, Loader2, BarChart3 } from 'lucide-react';
import { SALE_CUSTOMER_TYPE_OPTIONS } from '@/lib/sale-coverage';

export default function SaleHubPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<any>(null);
  const [today, setToday] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    setToday(new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);

  useEffect(() => {
    async function loadStaff() {
      const session = await getStaffSession();
      setStaff(session);
    }
    loadStaff();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutStaffAction();
    router.push('/');
  };

  if (!staff) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-rose-700">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  const customerTypeLabels = (staff.sale_customer_types ?? []).map(
    (v: string) => SALE_CUSTOMER_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v,
  );
  const provinces: string[] = staff.sale_provinces ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-background">

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 space-y-7">

        {/* ── LOGO & BRAND IDENTITY ── */}
        <div className="flex items-center justify-between gap-3 px-2 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-600 text-white shadow-sm shadow-rose-200">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">GPO Xchange</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Staff Portal · Sale</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-red-600 bg-white hover:bg-red-50 border border-rose-100 hover:border-red-200 px-3.5 py-2 rounded-xl transition-colors disabled:opacity-60 disabled:pointer-events-none"
          >
            {isLoggingOut ? <Loader2 className="w-4 h-5 animate-spin" /> : <LogOut className="w-4 h-5" />}
            ออกจากระบบ
          </button>
        </div>

        {/* ── Welcome Header ── */}
        <div className="relative overflow-hidden rounded-3xl bg-rose-600 p-8 text-white shadow-lg shadow-rose-200">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-20 bg-white" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full opacity-15 bg-white" />

          <div className="relative flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div>
              <p className="text-rose-100 text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-200 animate-pulse" /> ยินดีต้อนรับ
              </p>
              <h1 className="text-2xl md:text-3xl font-black leading-tight flex items-center gap-2">
                สวัสดีคุณ {staff.full_name || staff.username}
                <User className="w-6 h-6 opacity-80" />
              </h1>
              <p className="text-rose-50 mt-1.5 flex items-center gap-1.5 text-sm">
                <TrendingUp className="w-4 h-4" /> แผนก Sale (พนักงานขาย)
              </p>
              <p className="text-rose-50/90 mt-3 text-sm leading-relaxed">
                ขอให้มีความสุขตลอดการทำงาน ในวันที่สดใส{today && <> {today}</>}
              </p>
            </div>

            {/* ขอบเขตดูแล — สรุปให้เห็นชัดว่า sale คนนี้ดูแลลูกค้าประเภทไหน จังหวัดไหนบ้าง */}
            <div className="bg-white/15 border border-white/25 rounded-2xl px-5 py-4 backdrop-blur-sm min-w-[220px]">
              <p className="text-rose-100 text-[11px] font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> ขอบเขตที่ดูแล
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {customerTypeLabels.length > 0 ? customerTypeLabels.map((label: string) => (
                  <span key={label} className="text-[11px] font-bold bg-white/20 px-2 py-1 rounded-lg">{label}</span>
                )) : <span className="text-[11px] text-rose-100">ยังไม่ได้กำหนด</span>}
              </div>
              <p className="text-rose-100 text-[11px] font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> จังหวัด
              </p>
              <div className="flex flex-wrap gap-1.5">
                {provinces.length > 0 ? provinces.map((p) => (
                  <span key={p} className="text-[11px] font-bold bg-white/20 px-2 py-1 rounded-lg">{p}</span>
                )) : <span className="text-[11px] text-rose-100">ยังไม่ได้กำหนด</span>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Action Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
          {/* Card: ประวัติการแลกเปลี่ยน */}
          <Link href="/admin/sale/history" className="group block h-full">
            <div className="h-full flex flex-col bg-white rounded-3xl border border-rose-100 shadow-sm hover:shadow-lg hover:border-rose-300 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="p-7 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-rose-100 shrink-0">
                    <History className="w-5 h-5 text-rose-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-foreground">ประวัติการแลกเปลี่ยน</h2>
                    <p className="text-xs text-muted-foreground">แสดงเฉพาะข้อมูลลูกค้าในพื้นที่ดูแลรับผิดชอบของคุณ</p>
                  </div>
                </div>
                <div className="mt-auto h-16 w-full rounded-2xl font-bold text-white text-sm bg-rose-600 shadow-md shadow-rose-200 group-hover:bg-rose-700 group-hover:shadow-xl group-hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2">
                  <History className="w-4 h-4" /> ดูประวัติการแลกเปลี่ยน <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </Link>

          {/* Card: ศูนย์รายงาน — รอพัฒนาต่อ */}
          <div className="h-full flex flex-col bg-white rounded-3xl border border-dashed border-slate-200 opacity-70 overflow-hidden">
            <div className="p-7 flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-slate-100 shrink-0">
                  <BarChart3 className="w-5 h-5 text-slate-500" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-foreground flex items-center gap-2">
                    ศูนย์รายงาน (Report Center)
                    <span className="text-[9px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">เร็วๆ นี้</span>
                  </h2>
                  <p className="text-xs text-muted-foreground">สรุปสถิติยอดขาย/คำร้องของลูกค้าที่ดูแล — อยู่ระหว่างการพัฒนา</p>
                </div>
              </div>
              <div className="mt-auto h-16 flex items-center justify-center rounded-2xl text-sm text-slate-400 bg-slate-50 border-2 border-dashed border-slate-200">
                กำลังพัฒนา
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-4 py-5 px-6 text-center border-t border-rose-100">
        <p className="text-[11px] text-muted-foreground">© 2026 <span className="font-bold text-rose-600">GPO Xchange Portal</span> • องค์การเภสัชกรรม สาขาภาคใต้ &nbsp;|&nbsp; Staff Portal</p>
      </footer>
    </div>
  );
}
