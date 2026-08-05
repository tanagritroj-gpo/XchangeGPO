'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStaffSession, logoutStaffAction, getPendingStaff } from '@/app/actions/auth-staff';
import { getCSRDashboardData } from '@/app/actions/csr-actions';
import { getUnansweredChatbotQuestions } from '@/app/actions/manager-actions';
import Link from 'next/link';
import { Crown, User, ShieldCheck, Users, ClipboardList, BarChart3, HelpCircle, FileSpreadsheet, ArrowRight, LogOut, Loader2 } from 'lucide-react';
import type { StaffSessionInfo } from '@/lib/types';

// ── หน้า hub ของ Manager — จัดวางแบบ "bento grid" (กล่องเบนโตะ): เซลล์ขนาดต่างกันบน grid
// เดียว ผสม hero/สถานะ/ปุ่มปฏิบัติการ/ตัวเลขสรุปไว้ในผืนเดียวกัน ต่างจาก CSR/Sale hub ที่แยก
// hero กับ action-grid เป็นคนละส่วน — โทนสีหลักยังเป็นน้ำเงินม่วงเข้ม (เข้มกว่า hero ของ
// CSR/Sale โดยตั้งใจ) คู่กับทอง/ม่วง/ทีล/เทาไล่ตามความสำคัญของแต่ละปลายทาง
//
// โครง grid (lg: 6 คอลัมน์, แถวสูงคงที่ต่อหน่วย ผสม row-span 1/2 ให้เกิดมิติสูง-ต่ำแบบเบนโตะ):
//   แถบบน: [Welcome hero กว้าง 4 คอลัมน์ สูง 2 แถว] [สถานะบัญชี 2 คอลัมน์ สูง 1 แถว]
//                                                    [จัดการสิทธิ์พนักงาน 2 คอลัมน์ สูง 1 แถว]
//   แถบล่าง: [ใบงานทั้งหมด 2 คอลัมน์ สูง 2 แถว] [ภาพรวม&สถิติ 2 คอลัมน์ สูง 2 แถว]
//            [Download Center 2 คอลัมน์ สูง 1 แถว]
//            [คำถามบอทตอบไม่ได้ 2 คอลัมน์ สูง 1 แถว]
// ตัวเลข (พนักงานรออนุมัติ/ใบงานทั้งหมด/คำถามค้าง) ดึงจริงจาก server action เดิมที่หน้า
// staff-approvals ใช้อยู่แล้ว ไม่ได้เพิ่ม endpoint ใหม่ — โหลดแบบ non-blocking แยกจาก session
export default function ManagerHubPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffSessionInfo | null>(null);
  const [today, setToday] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [counts, setCounts] = useState<{ pendingStaff: number; totalRequests: number; unanswered: number } | null>(null);

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

  // ตัวเลขสรุปสำหรับ tile ต่างๆ — โหลดแยกอิสระจาก session ไม่บล็อกการแสดงผลหลัก
  // (tile ที่รอข้อมูลจะโชว์ "…" ระหว่างนี้แทนตัวเลข)
  useEffect(() => {
    async function loadCounts() {
      const [staffResult, dashboardResult, unansweredResult] = await Promise.all([
        getPendingStaff(),
        getCSRDashboardData(),
        getUnansweredChatbotQuestions(),
      ]);
      setCounts({
        pendingStaff: staffResult.success ? (staffResult.data?.length ?? 0) : 0,
        totalRequests: dashboardResult.success ? (dashboardResult.requests?.length ?? 0) : 0,
        unanswered: unansweredResult.success ? (unansweredResult.data?.length ?? 0) : 0,
      });
    }
    loadCounts();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutStaffAction();
    router.push('/');
  };

  if (!staff) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#FBF6E8] to-[#F1E7C8]">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-[#2E2B7A] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-[#2E2B7A]">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  const fmt = (n: number | undefined) => (n === undefined ? '…' : n.toLocaleString('th-TH'));

  return (
    <div className="relative min-h-screen flex flex-col bg-gradient-to-b from-[#FBF6E8] via-[#F8F2DF] to-[#F1E7C8] overflow-hidden">

      {/* ── พื้นหลังลูกเล่น — เหมือน CSR/Sale hub ทุกประการ (identity ของระบบร่วมกัน) ── */}
      <div className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute -top-16 -right-10 w-64 h-64 md:-top-24 md:-right-16 md:w-[420px] md:h-[420px] rounded-full bg-[radial-gradient(circle,_#EAD94C_0%,_transparent_72%)] opacity-40 blur-2xl" />
        <div className="absolute top-[42%] -left-16 w-56 h-56 md:top-[38%] md:-left-28 md:w-[380px] md:h-[380px] rounded-full bg-[radial-gradient(circle,_#E1592A_0%,_transparent_72%)] opacity-[0.15] blur-3xl" />
        <div className="absolute -bottom-20 right-[6%] w-64 h-64 md:-bottom-32 md:w-[460px] md:h-[460px] rounded-full bg-[radial-gradient(circle,_#2E2B7A_0%,_transparent_72%)] opacity-[0.10] blur-3xl" />
        <div className="absolute top-[10%] left-[8%] w-14 h-14 rounded-full bg-[#EAD94C] opacity-[0.12] blur-xl hidden sm:block" />
        <div className="absolute top-[20%] right-[10%] w-10 h-10 rounded-full bg-white opacity-20 blur-lg hidden sm:block" />
        <div className="absolute bottom-[22%] left-[6%] w-16 h-16 rounded-full bg-[#E1592A] opacity-[0.10] blur-xl" />
        <div className="absolute bottom-[8%] right-[12%] w-14 h-14 rounded-full bg-[#EAD94C] opacity-[0.10] blur-xl" />
      </div>

      <main className="relative z-10 flex-1 max-w-6xl mx-auto w-full px-6 py-8 space-y-7">

        {/* ── LOGO & BRAND IDENTITY ── */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/45 backdrop-blur-md border border-white/50 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#4A46B0] to-[#241F5E] text-white shadow-sm shadow-[#241F5E]/40">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#241F5E] leading-tight">GPO Xchange</p>
              <p className="text-[10px] text-[#6B6698] leading-tight">Staff Portal · Manager</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center gap-1.5 text-xs font-bold text-[#6B6698] hover:text-[#2E2B7A] bg-white/70 hover:bg-[#ECEAF6] border border-white/60 hover:border-[#D8D5E8] px-3.5 py-2 rounded-xl transition-colors disabled:opacity-60 disabled:pointer-events-none"
          >
            {isLoggingOut ? <Loader2 className="w-4 h-5 animate-spin" /> : <LogOut className="w-4 h-5" />}
            ออกจากระบบ
          </button>
        </div>

        {/* ══ Bento Grid — hero + สถานะ + ปลายทางทั้งหมดรวมในผืนเดียว ══
             mobile: เรียงเดี่ยว (col-span-full ทุก tile) / md ขึ้นไป: bento 6 คอลัมน์จริง
             auto-rows คงที่ + row-span 1/2 ต่อ tile คือหัวใจของเลย์เอาต์นี้ */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 md:auto-rows-[128px]">

          {/* Tile: Welcome hero — ใหญ่สุด กว้าง 4/สูง 2 หน่วย โทนน้ำเงินม่วงเข้ม */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#241F5E] via-[#1A1740] to-[#0D0B21] p-6 md:p-7 text-white shadow-lg shadow-[#1A1740]/40 md:col-span-4 md:row-span-2">
            <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,_white_1px,_transparent_0)] bg-[length:16px_16px]" />
            <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-[radial-gradient(circle,_#EAD94C_0%,_transparent_70%)] opacity-50 blur-sm" />
            <div className="absolute -bottom-10 -left-10 w-44 h-44 rounded-full bg-[radial-gradient(circle,_#6D28D9_0%,_transparent_70%)] opacity-50 blur-sm" />
            <div className="relative h-full flex flex-col justify-center">
              <p className="text-[#EAD94C] text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EAD94C] animate-pulse" /> ยินดีต้อนรับ
              </p>
              <h1 className="text-2xl md:text-3xl font-black leading-tight flex items-center gap-2">
                สวัสดีคุณ {staff.full_name || staff.username}
                <User className="w-6 h-6 opacity-80" />
              </h1>
              <p className="text-white/85 mt-1.5 flex items-center gap-1.5 text-sm">
                <ShieldCheck className="w-4 h-4" /> ทีมบริหาร (Manager)
              </p>
              <p className="text-white/75 mt-3 text-sm leading-relaxed">
                ขอให้มีความสุขตลอดการทำงาน ในวันที่สดใส{today && <> {today}</>}
              </p>
            </div>
          </div>

          {/* Tile: สถานะบัญชี — เล็ก กว้าง 2/สูง 1 หน่วย */}
          <div className="rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-sm p-5 flex flex-col justify-center md:col-span-2 md:row-span-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B6698] mb-1.5">สถานะบัญชี</p>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[#241F5E] font-black text-lg">Active</span>
            </div>
          </div>

          {/* Tile: จัดการสิทธิ์พนักงาน — เน้นตัวเลขรออนุมัติ กว้าง 2/สูง 1 หน่วย โทนน้ำเงินม่วง (featured) */}
          <Link href="/admin/manager/staff-approvals?tab=staff" className="group block md:col-span-2 md:row-span-1">
            <div className="relative h-full rounded-3xl bg-gradient-to-br from-[#3B37A0] to-[#1A1740] shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden transform hover:-translate-y-0.5 p-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70 mb-1 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> รออนุมัติ
                </p>
                <p className="text-white font-black text-3xl leading-none">{fmt(counts?.pendingStaff)}</p>
                <p className="text-white/70 text-xs mt-1">จัดการสิทธิ์พนักงาน</p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/60 group-hover:translate-x-1 transition-transform shrink-0" />
            </div>
          </Link>

          {/* Tile: ใบงานทั้งหมด — กว้าง 2/สูง 2 หน่วย โทนม่วง */}
          <Link href="/admin/manager/staff-approvals?tab=all" className="group block md:col-span-2 md:row-span-2">
            <div className="relative h-full flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-sm hover:shadow-xl hover:border-[#6D28D9]/40 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="absolute top-0 left-6 right-6 h-1 rounded-b-full bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#6D28D9] opacity-70" />
              <div className="p-6 flex-1 flex flex-col">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] mb-3">
                  <ClipboardList className="w-5 h-5 text-white" />
                </div>
                <p className="text-[#6D28D9] font-black text-3xl leading-none mb-1">{fmt(counts?.totalRequests)}</p>
                <h2 className="text-sm font-black text-[#241F5E] mb-1">ใบงานทั้งหมด</h2>
                <p className="text-xs text-[#6B6698] mb-4">ดูใบงานคืน/แลกเปลี่ยนทุกใบในระบบ ทุกแผนก</p>
                <span className="mt-auto text-xs font-bold text-[#6D28D9] flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  ดูใบงานทั้งหมด <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* Tile: ภาพรวม & สถิติ — กว้าง 2/สูง 2 หน่วย โทนทอง/มัสตาร์ด */}
          <Link href="/admin/manager/staff-approvals?tab=insights" className="group block md:col-span-2 md:row-span-2">
            <div className="relative h-full flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-sm hover:shadow-xl hover:border-[#EAD94C]/60 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="absolute top-0 left-6 right-6 h-1 rounded-b-full bg-gradient-to-r from-[#EAD94C] via-[#F4E27E] to-[#EAD94C] opacity-70" />
              <div className="p-6 flex-1 flex flex-col">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#F4E27E] to-[#EAD94C] mb-3">
                  <BarChart3 className="w-5 h-5 text-[#241F5E]" />
                </div>
                <h2 className="text-sm font-black text-[#241F5E] mb-1">ภาพรวม & สถิติ</h2>
                <p className="text-xs text-[#6B6698] mb-4">กราฟสรุปผลการดำเนินงานทุกแผนก + คุยกับ chatbot วิเคราะห์ข้อมูล</p>
                <span className="mt-auto text-xs font-bold text-[#8A7420] flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  ดูภาพรวม & สถิติ <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* Tile: Download Center — กว้าง 2/สูง 1 หน่วย โทนทีล */}
          <Link href="/admin/manager/staff-approvals?tab=downloads" className="group block md:col-span-2 md:row-span-1">
            <div className="relative h-full rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-sm hover:shadow-xl hover:border-teal-500/40 transition-all duration-300 overflow-hidden transform hover:-translate-y-0.5 p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-teal-400 to-teal-600 shrink-0">
                <FileSpreadsheet className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black text-[#241F5E]">Download Center</h2>
                <p className="text-xs text-[#6B6698] truncate">โหลด Excel audit trail รายใบงาน</p>
              </div>
              <ArrowRight className="w-4 h-4 text-teal-600 group-hover:translate-x-1 transition-transform shrink-0" />
            </div>
          </Link>

          {/* Tile: คำถามที่บอทตอบไม่ได้ — กว้าง 2/สูง 1 หน่วย โทนเทา เน้นตัวเลขค้างทบทวน */}
          <Link href="/admin/manager/staff-approvals?tab=chatbot" className="group block md:col-span-2 md:row-span-1">
            <div className="relative h-full rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-sm hover:shadow-xl hover:border-[#6B6698]/40 transition-all duration-300 overflow-hidden transform hover:-translate-y-0.5 p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#ECEAF6] shrink-0">
                <HelpCircle className="w-5 h-5 text-[#6B6698]" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black text-[#241F5E] flex items-center gap-1.5">
                  คำถามที่บอทตอบไม่ได้
                  {!!counts?.unanswered && (
                    <span className="text-[10px] font-bold text-white bg-[#6B6698] px-1.5 py-0.5 rounded-full shrink-0">{fmt(counts?.unanswered)}</span>
                  )}
                </h2>
                <p className="text-xs text-[#6B6698] truncate">ทบทวนคำถามที่ตอบว่า &quot;ไม่แน่ใจ&quot;</p>
              </div>
              <ArrowRight className="w-4 h-4 text-[#6B6698] group-hover:translate-x-1 transition-transform shrink-0" />
            </div>
          </Link>
        </div>
      </main>

      <footer className="mt-4 py-5 px-6 text-center border-t border-[#EADFAF]">
        <p className="text-[11px] text-[#6B6698]">© 2026 <span className="font-bold text-[#E1592A]">GPO Xchange Portal</span> • องค์การเภสัชกรรม สาขาภาคใต้ &nbsp;|&nbsp; Staff Portal</p>
      </footer>
    </div>
  );
}
