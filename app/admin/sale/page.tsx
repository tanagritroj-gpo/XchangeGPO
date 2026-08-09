'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStaffSession, logoutStaffAction } from '@/app/actions/auth-staff';
import Link from 'next/link';
import { TrendingUp, User, MapPin, Users, History, ArrowRight, LogOut, Loader2, BarChart3 } from 'lucide-react';
import { SALE_CUSTOMER_TYPE_OPTIONS } from '@/lib/sale-coverage';
import type { StaffSessionInfo } from '@/lib/types';
import { NotificationBell } from '@/components/NotificationBell';

export default function SaleHubPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffSessionInfo | null>(null);
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#FBF6E8] to-[#F1E7C8]">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-[#E1592A] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-[#2E2B7A]">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  const customerTypeLabels = (staff.sale_customer_types ?? []).map(
    (v: string) => SALE_CUSTOMER_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v,
  );
  const provinces: string[] = staff.sale_provinces ?? [];

  return (
    <div className="relative min-h-screen flex flex-col bg-gradient-to-b from-[#FBF6E8] via-[#F8F2DF] to-[#F1E7C8] overflow-hidden">

      {/* ── พื้นหลังลูกเล่น — แสงกระจายแบบสุ่ม + บลอบใหญ่ให้มิติ ──
          ใช้ fixed แทน absolute เพื่อให้ตำแหน่ง % อ้างอิงกับความสูงจอ ไม่ใช่ความสูงเนื้อหาทั้งหน้า
          (มือถือเนื้อหาเรียงต่อกันยาวกว่ามาก ถ้าใช้ absolute จุดแสงจะไปกองอยู่จุดเดียว) */}
      <div className="pointer-events-none fixed inset-0 -z-0">
        {/* บลอบหลัก 3 จุด ให้บรรยากาศโดยรวม — ยึดมุมจอ ขนาดเล็กลงบนมือถือ */}
        <div className="absolute -top-16 -right-10 w-64 h-64 md:-top-24 md:-right-16 md:w-[420px] md:h-[420px] rounded-full bg-[radial-gradient(circle,_#EAD94C_0%,_transparent_72%)] opacity-40 blur-2xl" />
        <div className="absolute top-[42%] -left-16 w-56 h-56 md:top-[38%] md:-left-28 md:w-[380px] md:h-[380px] rounded-full bg-[radial-gradient(circle,_#E1592A_0%,_transparent_72%)] opacity-[0.15] blur-3xl" />
        <div className="absolute -bottom-20 right-[6%] w-64 h-64 md:-bottom-32 md:w-[460px] md:h-[460px] rounded-full bg-[radial-gradient(circle,_#2E2B7A_0%,_transparent_72%)] opacity-[0.10] blur-3xl" />
        {/* จุดแสงกระจายเล็ก ๆ แบบสุ่ม — ยึดกับขอบจอ ไม่ใช่กลางเนื้อหา จึงไม่ไปทับการ์ด */}
        <div className="absolute top-[10%] left-[8%] w-14 h-14 rounded-full bg-[#EAD94C] opacity-[0.12] blur-xl hidden sm:block" />
        <div className="absolute top-[20%] right-[10%] w-10 h-10 rounded-full bg-white opacity-20 blur-lg hidden sm:block" />
        <div className="absolute bottom-[22%] left-[6%] w-16 h-16 rounded-full bg-[#E1592A] opacity-[0.10] blur-xl" />
        <div className="absolute bottom-[8%] right-[12%] w-14 h-14 rounded-full bg-[#EAD94C] opacity-[0.10] blur-xl" />
      </div>

      <main className="relative z-10 flex-1 max-w-6xl mx-auto w-full px-6 py-8 space-y-7">

        {/* ── LOGO & BRAND IDENTITY ── */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 mb-8 rounded-2xl bg-white/45 backdrop-blur-md border border-white/50 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#F4E27E] to-[#EAD94C] text-[#241F5E] shadow-sm shadow-[#EAD94C]/40">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#241F5E] leading-tight">GPO Xchange</p>
              <p className="text-[10px] text-[#6B6698] leading-tight">Staff Portal · Sale</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell scope="sale" />
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-1.5 text-xs font-bold text-[#6B6698] hover:text-[#E1592A] bg-white/70 hover:bg-[#FBEFE6] border border-white/60 hover:border-[#F0C6AA] px-3.5 py-2 rounded-xl transition-colors disabled:opacity-60 disabled:pointer-events-none"
            >
              {isLoggingOut ? <Loader2 className="w-4 h-5 animate-spin" /> : <LogOut className="w-4 h-5" />}
              ออกจากระบบ
            </button>
          </div>
        </div>

        {/* ── Welcome Header ── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#38339B] via-[#2E2B7A] to-[#211D57] p-8 text-white shadow-lg shadow-[#2E2B7A]/30">
          {/* พื้นผิวจุดจาง ๆ ให้ความรู้สึกลายผ้า/กระดาษเหมือนปกอ้างอิง */}
          <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,_white_1px,_transparent_0)] bg-[length:16px_16px]" />
          <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-[radial-gradient(circle,_#EAD94C_0%,_transparent_70%)] opacity-60 blur-sm" />
          <div className="absolute -bottom-10 -left-10 w-44 h-44 rounded-full bg-[radial-gradient(circle,_#E1592A_0%,_transparent_70%)] opacity-50 blur-sm" />
          <div className="absolute top-1/2 left-1/3 w-24 h-24 -translate-y-1/2 rounded-full bg-white/5 blur-2xl" />

          <div className="relative flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div>
              <p className="text-[#EAD94C] text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EAD94C] animate-pulse" /> ยินดีต้อนรับ
              </p>
              <h1 className="text-2xl md:text-3xl font-black leading-tight flex items-center gap-2">
                สวัสดีคุณ {staff.full_name || staff.username}
                <User className="w-6 h-6 opacity-80" />
              </h1>
              <p className="text-[#D8D5F0] mt-1.5 flex items-center gap-1.5 text-sm">
                <TrendingUp className="w-4 h-4" /> แผนก Sale (พนักงานขาย)
              </p>
              <p className="text-[#D8D5F0]/90 mt-3 text-sm leading-relaxed">
                ขอให้มีความสุขตลอดการทำงาน ในวันที่สดใส{today && <> {today}</>}
              </p>
            </div>

            {/* ขอบเขตดูแล — สรุปให้เห็นชัดว่า sale คนนี้ดูแลลูกค้าประเภทไหน จังหวัดไหนบ้าง */}
            <div className="bg-white/15 border border-white/25 rounded-2xl px-5 py-4 backdrop-blur-md min-w-[220px]">
              <p className="text-[#EAD94C] text-[11px] font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> ขอบเขตที่ดูแล
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {customerTypeLabels.length > 0 ? customerTypeLabels.map((label: string) => (
                  <span key={label} className="text-[11px] font-bold bg-white/20 px-2 py-1 rounded-lg">{label}</span>
                )) : <span className="text-[11px] text-[#D8D5F0]">ยังไม่ได้กำหนด</span>}
              </div>
              <p className="text-[#EAD94C] text-[11px] font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> จังหวัด
              </p>
              <div className="flex flex-wrap gap-1.5">
                {provinces.length > 0 ? provinces.map((p) => (
                  <span key={p} className="text-[11px] font-bold bg-white/20 px-2 py-1 rounded-lg">{p}</span>
                )) : <span className="text-[11px] text-[#D8D5F0]">ยังไม่ได้กำหนด</span>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Action Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
          {/* Card: ประวัติการแลกเปลี่ยน */}
          <Link href="/admin/sale/history" className="group block h-full">
            <div className="relative h-full flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-sm hover:shadow-xl hover:border-[#E1592A]/40 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="absolute top-0 left-7 right-7 h-1 rounded-b-full bg-gradient-to-r from-[#EAD94C] via-[#E1592A] to-[#2E2B7A] opacity-70" />
              <div className="p-7 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#FBF0C8] to-[#F4DFA0] shrink-0">
                    <History className="w-5 h-5 text-[#E1592A]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-[#241F5E]">ประวัติการแลกเปลี่ยน</h2>
                    <p className="text-xs text-[#6B6698]">แสดงเฉพาะข้อมูลลูกค้าในพื้นที่ดูแลรับผิดชอบของคุณ</p>
                  </div>
                </div>
                <div className="mt-auto h-16 w-full rounded-2xl font-bold text-white text-sm bg-gradient-to-r from-[#E1592A] to-[#C9481E] shadow-md shadow-[#E1592A]/30 group-hover:shadow-xl group-hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2">
                  <History className="w-4 h-4" /> ดูประวัติการแลกเปลี่ยน <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </Link>

          {/* Card: ศูนย์รายงาน — รอพัฒนาต่อ */}
          <div className="h-full flex flex-col bg-white/60 backdrop-blur-xl rounded-3xl border border-dashed border-white/60 opacity-70 overflow-hidden">
            <div className="p-7 flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[#F1EDE0] shrink-0">
                  <BarChart3 className="w-5 h-5 text-[#6B6698]" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-[#241F5E] flex items-center gap-2">
                    ศูนย์รายงาน (Report Center)
                    <span className="text-[9px] font-bold uppercase tracking-wide bg-[#F1EDE0] text-[#6B6698] px-2 py-0.5 rounded-full">เร็วๆ นี้</span>
                  </h2>
                  <p className="text-xs text-[#6B6698]">สรุปสถิติยอดขาย/คำร้องของลูกค้าที่ดูแล — อยู่ระหว่างการพัฒนา</p>
                </div>
              </div>
              <div className="mt-auto h-16 flex items-center justify-center rounded-2xl text-sm text-[#A7A2C4] bg-[#F1EDE0] border-2 border-dashed border-[#EADFAF]">
                กำลังพัฒนา
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-4 py-5 px-6 text-center border-t border-[#EADFAF]">
        <p className="text-[11px] text-[#6B6698]">© 2026 <span className="font-bold text-[#E1592A]">GPO Xchange Portal</span> • องค์การเภสัชกรรม สาขาภาคใต้ &nbsp;|&nbsp; Staff Portal</p>
      </footer>
    </div>
  );
}
