'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStaffSession, logoutStaffAction } from '@/app/actions/auth-staff';
import { getManagerHubCounts } from '@/app/actions/manager-actions';
import { getManagerSlaBadgeCount } from '@/app/actions/sla-actions';
import Link from 'next/link';
import { Crown, User, ShieldCheck, Users, ClipboardList, BarChart3, FileSpreadsheet, Search, ArrowRight, LogOut, Loader2, AlarmClock, Clock, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import type { StaffSessionInfo } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationBell } from '@/components/NotificationBell';
import { AnalogClock } from '@/components/AnalogClock';
import { MiniStat } from '@/components/MiniStat';

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
//            [Track & Trace 2 คอลัมน์ สูง 1 แถว]
// ตัวเลข (พนักงานรออนุมัติ/ใบงานทั้งหมด) ดึงจริงจาก server action เดิมที่หน้า
// staff-approvals ใช้อยู่แล้ว ไม่ได้เพิ่ม endpoint ใหม่ — โหลดแบบ non-blocking แยกจาก session
// (การ์ด "คำถามที่บอทตอบไม่ได้" ย้ายไปอยู่ที่ CSR hub แล้ว — app/admin/csr/page.tsx —
// Track & Trace เข้ามาแทนที่ตำแหน่งเดิมของการ์ดนั้นในผังนี้)
export default function ManagerHubPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffSessionInfo | null>(null);
  const [today, setToday] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [counts, setCounts] = useState<{
    pendingStaff: number; totalRequests: number; pendingReview: number; completed: number; rejected: number;
  } | null>(null);
  const [slaBadgeCount, setSlaBadgeCount] = useState<number | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setToday(new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);

  // นาฬิกาเดินตามเวลาจริง ป้อนทั้งตัวเลขดิจิทัลและมุมเข็มของ AnalogClock ในการ์ด "สถานะบัญชี"
  // — pattern เดียวกับ CSR hub (app/admin/csr/page.tsx) ตามที่ผู้ใช้ขอให้ทำหน้านี้คล้ายกัน
  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function loadStaff() {
      const session = await getStaffSession();
      setStaff(session);
    }
    loadStaff();
  }, []);

  // ตัวเลขสรุปสำหรับ tile ต่างๆ — โหลดแยกอิสระจาก session ไม่บล็อกการแสดงผลหลัก
  // (tile ที่รอข้อมูลจะโชว์ skeleton pulse ระหว่างนี้แทนตัวเลข ดู <Skeleton> ด้านล่าง)
  useEffect(() => {
    async function loadCounts() {
      const result = await getManagerHubCounts();
      setCounts(
        result.success
          ? {
              pendingStaff: result.pendingStaff, totalRequests: result.totalRequests,
              pendingReview: result.pendingReview, completed: result.completed, rejected: result.rejected,
            }
          : { pendingStaff: 0, totalRequests: 0, pendingReview: 0, completed: 0, rejected: 0 }
      );
    }
    loadCounts();
  }, []);

  useEffect(() => {
    async function loadSlaBadge() {
      const result = await getManagerSlaBadgeCount();
      setSlaBadgeCount(result.success ? result.count ?? 0 : 0);
    }
    loadSlaBadge();
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

  const fmt = (n: number) => n.toLocaleString('th-TH');

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

      {/* pb-24 กันเนื้อหาแถวสุดท้ายโดน bottom nav bar (มือถือเท่านั้น, fixed) บังตอนเลื่อนสุด —
           pattern เดียวกับ CSR hub */}
      <main className="relative z-10 flex-1 max-w-6xl mx-auto w-full px-6 pt-8 pb-24 md:pb-8 space-y-7">

        {/* ── LOGO & BRAND IDENTITY ── */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/45 backdrop-blur-md border border-white/50 shadow-[0_4px_20px_-6px_rgba(36,31,94,0.15)] ring-1 ring-white/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#4A46B0] to-[#241F5E] text-white shadow-md shadow-[#241F5E]/40 ring-1 ring-white/20">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#241F5E] leading-tight">GPO Xchange</p>
              <p className="text-[10px] text-[#6B6698] leading-tight">Staff Portal · Manager</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell scope="manager" />
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-1.5 text-xs font-bold text-[#6B6698] hover:text-[#2E2B7A] bg-white/70 hover:bg-[#ECEAF6] border border-white/60 hover:border-[#D8D5E8] px-3.5 py-2 rounded-xl transition-colors disabled:opacity-60 disabled:pointer-events-none"
            >
              {isLoggingOut ? <Loader2 className="w-4 h-5 animate-spin" /> : <LogOut className="w-4 h-5" />}
              ออกจากระบบ
            </button>
          </div>
        </div>

        {/* ══ Bento Grid — hero + สถานะ + ปลายทางทั้งหมดรวมในผืนเดียว ══
             mobile: เรียงเดี่ยว (col-span-full ทุก tile) / md ขึ้นไป: bento 6 คอลัมน์จริง
             auto-rows คงที่ + row-span 1/2 ต่อ tile คือหัวใจของเลย์เอาต์นี้ */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 md:auto-rows-[128px]">

          {/* Tile: Welcome hero — ใหญ่สุด กว้าง 4/สูง 2 หน่วย โทนน้ำเงินม่วงเข้ม */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#241F5E] via-[#1A1740] to-[#0D0B21] p-6 md:p-7 text-white shadow-2xl shadow-[#0D0B21]/60 ring-1 ring-white/10 md:col-span-4 md:row-span-2">
            <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,_white_1px,_transparent_0)] bg-[length:16px_16px]" />
            <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.08] to-transparent" />
            <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-[radial-gradient(circle,_#EAD94C_0%,_transparent_70%)] opacity-50 blur-sm" />
            <div className="absolute -bottom-10 -left-10 w-44 h-44 rounded-full bg-[radial-gradient(circle,_#6D28D9_0%,_transparent_70%)] opacity-50 blur-sm" />
            <div className="relative h-full flex flex-col justify-center">
              <p className="text-[#EAD94C] text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EAD94C] shadow-[0_0_8px_2px_rgba(234,217,76,0.6)] animate-pulse" /> ยินดีต้อนรับ
              </p>
              <h1 className="text-2xl md:text-3xl font-black leading-tight tracking-tight flex items-center gap-2 drop-shadow-sm">
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

          {/* Tile: สถานะบัญชี — ปรับให้เหมือน CSR hub (app/admin/csr/page.tsx): นาฬิกาเข็ม +
               เวลาดิจิทัล + จุดสถานะแบบ "ping ring" โทนทีล แทนจุด pulse เขียวมรกตตันแบบเดิม
               (เหตุผลเดียวกับ CSR — ping ring ดูตั้งใจ/สะอาดกว่า, ทีลเข้ากับโทนน้ำเงินม่วง/ทอง
               ของแอปมากกว่าเขียวมรกตที่เป็นสีแปลกปลอม) กว้าง 2/สูง 1 หน่วย
               min-h-[112px] md:min-h-0 — กันการ์ดนี้ (สูงขึ้นเพราะมีนาฬิกาเข็ม 64px) กับการ์ด
               "จัดการสิทธิ์พนักงาน" ข้างๆ สูงไม่เท่ากันตอนเรียงบนมือถือ (ปัญหาเดียวกับที่เจอใน
               CSR hub, แก้ด้วย pattern เดียวกัน) */}
          <div className="rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_4px_24px_-8px_rgba(46,43,122,0.15)] ring-1 ring-white/40 p-5 flex items-center justify-between gap-3 min-h-[112px] md:min-h-0 md:col-span-2 md:row-span-1">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B6698] mb-1.5">สถานะบัญชี</p>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-500" />
                </span>
                <span className="text-[#241F5E] font-black text-lg">Active</span>
              </div>
              <p className="text-[11px] text-[#A7A2C4] mt-1.5 font-mono tabular-nums">
                {now ? now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '--:--:--'} น.
              </p>
            </div>
            <AnalogClock now={now} />
          </div>

          {/* Tile: จัดการสิทธิ์พนักงาน — เน้นตัวเลขรออนุมัติ กว้าง 2/สูง 1 หน่วย โทนน้ำเงินม่วง
               (featured) — min-h เหมือน "สถานะบัญชี" ข้างๆ เพื่อความสูงเท่ากันบนมือถือ */}
          <Link href="/admin/manager/staff-approvals?tab=staff" className="group block md:col-span-2 md:row-span-1">
            <div className="relative h-full min-h-[112px] md:min-h-0 rounded-3xl bg-gradient-to-br from-[#4A42B8] via-[#3B37A0] to-[#171335] shadow-md shadow-[#3B37A0]/30 hover:shadow-[0_16px_40px_-12px_rgba(59,55,160,0.55)] transition-all duration-300 overflow-hidden transform hover:-translate-y-0.5 p-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70 mb-1 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> รออนุมัติ
                </p>
                {counts ? (
                  <p className="text-white font-black text-3xl leading-none tabular-nums">{fmt(counts.pendingStaff)}</p>
                ) : (
                  <Skeleton className="h-8 w-12 bg-white/25" />
                )}
                <p className="text-white/70 text-xs mt-1">จัดการสิทธิ์พนักงาน</p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/60 group-hover:translate-x-1 transition-transform shrink-0" />
            </div>
          </Link>

          {/* Tile: ใบงานทั้งหมด — ขยายจาก 2×2 เป็น 4×2 (ตาม pattern เดียวกับ "CSR Dashboard"
               ในหน้า CSR hub) — "ภาพรวม & สถิติ" ถัดไปเลยไหลไปอยู่ข้างการ์ดนี้แทน (grid
               auto-place จัดให้เองจากการขยาย col-span ไม่ต้องกำหนดตำแหน่งเอง) ผลพลอยได้: แถว
               ถัดไป (Download Center/Track & Trace/SLA) พอดี 3 การ์ด × col-span-2 = 6 คอลัมน์
               เต็มแถว เรียงสวยเป็นแถวเดียวที่จอกว้าง แทนที่จะเบียดเป็นคอลัมน์แคบข้าง 2 การ์ด
               ใหญ่แบบเดิม
               ★ เพิ่มแถบมินิสถิติ 5 ช่อง (ทั้งหมด/รอตรวจสอบ/กำลังดำเนินการ/เสร็จสิ้น/ถูกปฏิเสธ)
               แบบเดียวกับ tile "CSR Dashboard" ของ CSR hub (ใช้ MiniStat component กลางร่วมกัน
               — ดู components/MiniStat.tsx) ตัวเลขหลักเดี่ยวๆ + คำอธิบายยาวแบบเดิมตัดออก
               เพราะข้อมูลซ้ำกับแถบใหม่แล้ว (รอตรวจสอบ ⊂ แถบใหม่) ประหยัดพื้นที่แนวตั้งให้พอ
               ใส่แถบสถิติได้โดยไม่ล้น */}
          <Link href="/admin/manager/staff-approvals?tab=all" className="group block md:col-span-4 md:row-span-2">
            <div className="relative h-full flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_-8px_rgba(109,40,217,0.12)] hover:shadow-[0_20px_45px_-15px_rgba(109,40,217,0.4)] hover:border-[#6D28D9]/40 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="absolute top-0 left-6 right-6 h-[3px] rounded-b-full bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-[#6D28D9] shadow-[0_0_10px_rgba(139,92,246,0.6)]" />
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] shadow-md shadow-[#6D28D9]/30 ring-1 ring-white/20 shrink-0">
                    <ClipboardList className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black text-[#241F5E]">ใบงานทั้งหมด</h2>
                    <p className="text-xs text-[#6B6698] truncate">ภาพรวมใบงานทุกสถานะ ทุกแผนก</p>
                  </div>
                </div>

                {counts ? (
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    <MiniStat icon={ClipboardList} value={counts.totalRequests} label="ใบงานรวม" iconBg="bg-[#EDEBFB]" iconText="text-[#6D28D9]" />
                    <MiniStat icon={Clock} value={counts.pendingReview} label="รอตรวจสอบ" iconBg="bg-amber-50" iconText="text-amber-600" />
                    <MiniStat
                      icon={RefreshCw}
                      value={Math.max(counts.totalRequests - counts.pendingReview - counts.completed - counts.rejected, 0)}
                      label="กำลังดำเนินการ" iconBg="bg-blue-50" iconText="text-blue-600"
                    />
                    <MiniStat icon={CheckCircle2} value={counts.completed} label="เสร็จสิ้น" iconBg="bg-emerald-50" iconText="text-emerald-600" />
                    <MiniStat icon={XCircle} value={counts.rejected} label="ถูกปฏิเสธ" iconBg="bg-red-50" iconText="text-red-600" />
                  </div>
                ) : (
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)}
                  </div>
                )}

                <span className="mt-auto text-xs font-bold text-[#6D28D9] flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  ดูใบงานทั้งหมด <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* Tile: ภาพรวม & สถิติ — กว้าง 2/สูง 2 หน่วย โทนทอง/มัสตาร์ด */}
          <Link href="/admin/manager/staff-approvals?tab=insights" className="group block md:col-span-2 md:row-span-2">
            <div className="relative h-full flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_-8px_rgba(138,116,32,0.12)] hover:shadow-[0_20px_45px_-15px_rgba(234,217,76,0.4)] hover:border-[#EAD94C]/60 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="absolute top-0 left-6 right-6 h-[3px] rounded-b-full bg-gradient-to-r from-[#EAD94C] via-[#F4E27E] to-[#EAD94C] shadow-[0_0_10px_rgba(234,217,76,0.6)]" />
              <div className="p-6 flex-1 flex flex-col">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#F4E27E] to-[#EAD94C] shadow-md shadow-[#EAD94C]/30 ring-1 ring-white/40 mb-3">
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

          {/* Tile: Download Center — กว้าง 2/สูง 1 หน่วย โทนทีล — hidden md:block: ตามที่ผู้ใช้
               ขอ ย้ายไปเป็น bottom nav bar บนมือถือแทน (ดูท้ายไฟล์) จอกว้างยังเห็น tile ปกติ */}
          <Link href="/admin/manager/staff-approvals?tab=downloads" className="hidden md:block group md:col-span-2 md:row-span-1">
            <div className="relative h-full rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_4px_20px_-8px_rgba(13,148,136,0.15)] hover:shadow-[0_16px_36px_-12px_rgba(13,148,136,0.4)] hover:border-teal-500/40 transition-all duration-300 overflow-hidden transform hover:-translate-y-0.5 p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-teal-400 to-teal-600 shadow-md shadow-teal-600/30 ring-1 ring-white/30 shrink-0">
                <FileSpreadsheet className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black text-[#241F5E]">รายงานผู้บริหาร</h2>
                <p className="text-xs text-[#6B6698] truncate">รายงาน Excel ในแต่ละส่วนงาน</p>
              </div>
              <ArrowRight className="w-4 h-4 text-teal-600 group-hover:translate-x-1 transition-transform shrink-0" />
            </div>
          </Link>

          {/* Tile: Track & Trace — กว้าง 2/สูง 1 หน่วย โทนทีล เข้าชุดกับหน้าติดตามสถานะฝั่งลูกค้า
              (เดียวกับ Download Center — ไม่มีตัวเลขสรุปเพราะเป็นเครื่องมือค้นหา ไม่ใช่รายการค้าง)
              เข้ามาแทนที่ตำแหน่งเดิมของการ์ด "คำถามที่บอทตอบไม่ได้" ซึ่งย้ายไป CSR hub แล้ว —
              hidden md:block: ย้ายไปเป็น bottom nav bar บนมือถือแทนเช่นกัน */}
          <Link href="/admin/manager/tracking" className="hidden md:block group md:col-span-2 md:row-span-1">
            <div className="relative h-full rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_4px_20px_-8px_rgba(13,148,136,0.15)] hover:shadow-[0_16px_36px_-12px_rgba(13,148,136,0.4)] hover:border-teal-500/40 transition-all duration-300 overflow-hidden transform hover:-translate-y-0.5 p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-teal-400 to-teal-600 shadow-md shadow-teal-600/30 ring-1 ring-white/30 shrink-0">
                <Search className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black text-[#241F5E]">Track & Trace</h2>
                <p className="text-xs text-[#6B6698] truncate">ติดตามสถานะคำร้องของลูกค้าได้ทุกราย</p>
              </div>
              <ArrowRight className="w-4 h-4 text-teal-600 group-hover:translate-x-1 transition-transform shrink-0" />
            </div>
          </Link>

          {/* Tile: SLA Monitoring System — กว้าง 2/สูง 1 หน่วย โทนแดง/ส้ม (แยกจาก teal ที่ใช้ไป
              2 จุดแล้ว เพื่อให้เด่นเป็นสัญญาณเร่งด่วน) รวม dashboard SLA ทุกแผนก, ตั้งค่ากฎ
              sla_rules, และ Audit Trail Report ที่ย้ายมาจาก Download Center — ตัวเลข badge
              คือจำนวนใบงานเกินกำหนดที่ manager ยังไม่เคยเห็น (sla_breach, department is null,
              ดู app/actions/sla-actions.ts getManagerSlaBadgeCount) — hidden md:block: ย้ายไป
              เป็น bottom nav bar บนมือถือแทนเช่นกัน (พร้อม badge ตัวเลขเดียวกัน) */}
          <Link href="/admin/manager/sla" className="hidden md:block group md:col-span-2 md:row-span-1">
            <div className="relative h-full rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_4px_20px_-8px_rgba(225,89,42,0.15)] hover:shadow-[0_16px_36px_-12px_rgba(225,89,42,0.4)] hover:border-red-500/40 transition-all duration-300 overflow-hidden transform hover:-translate-y-0.5 p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-red-400 to-red-600 shadow-md shadow-red-600/30 ring-1 ring-white/30 shrink-0">
                <AlarmClock className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black text-[#241F5E]">SLA Monitoring System</h2>
                <p className="text-xs text-[#6B6698] truncate">
                  {slaBadgeCount ? `${slaBadgeCount} ใบงานเกินกำหนด` : 'ติดตาม SLA ทุกแผนก'}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-red-600 group-hover:translate-x-1 transition-transform shrink-0" />
            </div>
          </Link>
        </div>
      </main>

      {/* ══ Bottom nav bar — เฉพาะมือถือ (md:hidden), fixed เกาะขอบล่างจอเสมอ ══
           pattern เดียวกับ CSR hub (app/admin/csr/page.tsx) — แทนที่ tile "รายงานผู้บริหาร"/
           "Track & Trace"/"SLA Monitoring System" บนมือถือตามที่ผู้ใช้ขอ ทั้ง 3 ทางลัดนี้ใช้
           งานได้จริงทั้งหมด (ต่างจาก CSR ที่ตัด Download Center placeholder ออกเพราะกดไม่ได้จริง
           — ของ manager ทั้ง 3 tile นี้ลิงก์ใช้งานได้ปกติ เลยใส่ครบทั้ง 3) z-30 ต่ำกว่า
           NotificationBell drawer (z-50) เสมอ กันไม่ให้บังตอนเปิดกระดิ่ง — safe-area-inset-
           bottom กันแถบ home indicator ของ iPhone บังปุ่มล่างสุด ══ */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/85 backdrop-blur-xl border-t border-white/60 shadow-[0_-4px_20px_-8px_rgba(46,43,122,0.15)] px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-3 gap-1 max-w-md mx-auto">
          <Link href="/admin/manager/staff-approvals?tab=downloads" className="flex flex-col items-center gap-1 py-1.5 rounded-xl text-teal-700 active:bg-teal-50 transition-colors">
            <FileSpreadsheet className="w-5 h-5" />
            <span className="text-[10px] font-bold">รายงาน</span>
          </Link>
          <Link href="/admin/manager/tracking" className="flex flex-col items-center gap-1 py-1.5 rounded-xl text-teal-700 active:bg-teal-50 transition-colors">
            <Search className="w-5 h-5" />
            <span className="text-[10px] font-bold">ติดตาม</span>
          </Link>
          <Link href="/admin/manager/sla" className="relative flex flex-col items-center gap-1 py-1.5 rounded-xl text-red-600 active:bg-red-50 transition-colors">
            <span className="relative">
              <AlarmClock className="w-5 h-5" />
              {!!slaBadgeCount && (
                <span className="absolute -top-1 -right-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-600 px-1 text-[8px] font-bold text-white ring-2 ring-white">
                  {slaBadgeCount > 9 ? '9+' : slaBadgeCount}
                </span>
              )}
            </span>
            <span className="text-[10px] font-bold">SLA</span>
          </Link>
        </div>
      </nav>

      <footer className="relative mt-4 py-5 px-6 text-center border-t border-[#EADFAF]">
        <div className="absolute left-1/2 -translate-x-1/2 -top-px w-16 h-px bg-gradient-to-r from-transparent via-[#EAD94C] to-transparent" />
        <p className="text-[11px] text-[#6B6698]">© 2026 <span className="font-bold text-[#E1592A]">GPO Xchange Portal</span> • องค์การเภสัชกรรม สาขาภาคใต้ &nbsp;|&nbsp; Staff Portal</p>
      </footer>
    </div>
  );
}
