'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStaffSession, logoutStaffAction } from '@/app/actions/auth-staff';
import { getCSRHubCounts } from '@/app/actions/csr-actions';
import Link from 'next/link';
import { ShieldCheck, User, Building2, PenLine, LayoutDashboard, Users, ArrowRight, LogOut, Loader2, BarChart3, FileSpreadsheet, Clock, HelpCircle } from 'lucide-react';
import type { StaffSessionInfo } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

// ── หน้า hub ของ CSR — จัดวางแบบ "bento grid" เดียวกับ Manager hub (app/admin/manager/page.tsx)
// คงโทนสีเดิมของ CSR ไว้ทั้งหมด (hero indigo, ปุ่มฟอร์มส้ม, จัดการลูกค้ามัสตาร์ด, รายงานเทา)
// แค่ปรับโครงจาก "hero + action grid แยกกัน" มาเป็น "grid เดียวผสมกัน" พร้อมเสียบตัวเลขจริง
// (ลูกค้ารออนุมัติ, ใบงานรอตรวจสอบ) เข้าไปในบาง tile — ดึงจาก getCSRDashboardData() ตัวเดิม
// ที่หน้า dashboard/customers ใช้อยู่แล้ว ไม่เพิ่ม endpoint ใหม่
//
// Download Center เป็น tile ใหม่ที่เพิ่มเข้ามาตาม request — แต่ยัง "อยู่ระหว่างการพัฒนา"
// (placeholder เท่านั้น ไม่ลิงก์ไปไหน) ทำเป็น template ไว้รอออกแบบเนื้อหาจริงภายหลัง
// (ดู pattern เดียวกันที่ Sale hub ใช้กับการ์ด "ศูนย์รายงาน — เร็วๆ นี้")
//
// การ์ด "คำถามที่บอทตอบไม่ได้" ย้ายมาจาก manager hub ตาม request ผู้ใช้ — ใช้ server action
// เดิม (getUnansweredChatbotQuestions ใน manager-actions.ts) เปลี่ยนแค่เกตสิทธิ์ให้ CSR เรียกได้
export default function CsrHubPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffSessionInfo | null>(null);
  const [today, setToday] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [counts, setCounts] = useState<{ pendingClients: number; pendingReview: number; unanswered: number } | null>(null);

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

  // ตัวเลขสรุปสำหรับ tile "การจัดการข้อมูลลูกค้า" / "CSR Dashboard" — โหลดแยกอิสระจาก
  // session ไม่บล็อกการแสดงผลหลัก (tile ที่รอข้อมูลจะโชว์ skeleton pulse ระหว่างนี้แทนตัวเลข)
  useEffect(() => {
    async function loadCounts() {
      const result = await getCSRHubCounts();
      setCounts(
        result.success
          ? { pendingClients: result.pendingClients, pendingReview: result.pendingReview, unanswered: result.unanswered }
          : { pendingClients: 0, pendingReview: 0, unanswered: 0 }
      );
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
        <div className="w-10 h-10 border-4 border-[#E1592A] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-[#2E2B7A]">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  const fmt = (n: number) => n.toLocaleString('th-TH');

  return (
    <div className="relative min-h-screen flex flex-col bg-gradient-to-b from-[#FBF6E8] via-[#F8F2DF] to-[#F1E7C8] overflow-hidden">

      {/* ── พื้นหลังลูกเล่น — แสงกระจายแบบสุ่ม + บลอบใหญ่ให้มิติ ── */}
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
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/45 backdrop-blur-md border border-white/50 shadow-[0_4px_20px_-6px_rgba(46,43,122,0.12)] ring-1 ring-white/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#F4E27E] to-[#EAD94C] text-[#241F5E] shadow-md shadow-[#EAD94C]/40 ring-1 ring-white/50">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#241F5E] leading-tight">GPO Xchange</p>
              <p className="text-[10px] text-[#6B6698] leading-tight">Staff Portal · CSR</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center gap-1.5 text-xs font-bold text-[#6B6698] hover:text-[#E1592A] bg-white/70 hover:bg-[#FBEFE6] border border-white/60 hover:border-[#F0C6AA] px-3.5 py-2 rounded-xl transition-colors disabled:opacity-60 disabled:pointer-events-none"
          >
            {isLoggingOut ? <Loader2 className="w-4 h-5 animate-spin" /> : <LogOut className="w-4 h-5" />}
            ออกจากระบบ
          </button>
        </div>

        {/* ══ Bento Grid — hero + สถานะ + ปลายทางทั้งหมดรวมในผืนเดียว (pattern เดียวกับ
             Manager hub) — mobile เรียงเดี่ยว / md ขึ้นไปเป็น bento 6 คอลัมน์จริง ══ */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 md:auto-rows-[128px]">

          {/* Tile: Welcome hero — ใหญ่สุด กว้าง 4/สูง 2 หน่วย โทน indigo เดิมของ CSR */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#38339B] via-[#2E2B7A] to-[#211D57] p-6 md:p-7 text-white shadow-2xl shadow-[#1A1740]/50 ring-1 ring-white/10 md:col-span-4 md:row-span-2">
            <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,_white_1px,_transparent_0)] bg-[length:16px_16px]" />
            <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.08] to-transparent" />
            <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-[radial-gradient(circle,_#EAD94C_0%,_transparent_70%)] opacity-60 blur-sm" />
            <div className="absolute -bottom-10 -left-10 w-44 h-44 rounded-full bg-[radial-gradient(circle,_#E1592A_0%,_transparent_70%)] opacity-50 blur-sm" />
            <div className="relative h-full flex flex-col justify-center">
              <p className="text-[#EAD94C] text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EAD94C] shadow-[0_0_8px_2px_rgba(234,217,76,0.6)] animate-pulse" /> ยินดีต้อนรับ
              </p>
              <h1 className="text-2xl md:text-3xl font-black leading-tight tracking-tight flex items-center gap-2 drop-shadow-sm">
                สวัสดีคุณ {staff.full_name || staff.username}
                <User className="w-6 h-6 opacity-80" />
              </h1>
              <p className="text-[#D8D5F0] mt-1.5 flex items-center gap-1.5 text-sm">
                <Building2 className="w-4 h-4" /> แผนก CSR (Customer Service)
              </p>
              <p className="text-[#D8D5F0]/90 mt-3 text-sm leading-relaxed">
                ขอให้มีความสุขตลอดการทำงาน ในวันที่สดใส{today && <> {today}</>}
              </p>
            </div>
          </div>

          {/* Tile: สถานะบัญชี — เล็ก กว้าง 2/สูง 1 หน่วย */}
          <div className="rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_4px_24px_-8px_rgba(46,43,122,0.15)] ring-1 ring-white/40 p-5 flex flex-col justify-center md:col-span-2 md:row-span-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B6698] mb-1.5">สถานะบัญชี</p>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,0.5)] animate-pulse" />
              <span className="text-[#241F5E] font-black text-lg">Active</span>
            </div>
          </div>

          {/* Tile: กรอกแบบฟอร์มแทนลูกค้า — featured action, กว้าง 2/สูง 1 หน่วย โทนส้ม (คำร้องหลัก) */}
          <Link href="/admin/csr/form" className="group block md:col-span-2 md:row-span-1">
            <div className="relative h-full rounded-3xl bg-gradient-to-br from-[#EA6A3B] via-[#E1592A] to-[#B84018] shadow-md shadow-[#E1592A]/25 hover:shadow-[0_16px_40px_-12px_rgba(225,89,42,0.55)] transition-all duration-300 overflow-hidden transform hover:-translate-y-0.5 p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20 ring-1 ring-white/30 shrink-0">
                <PenLine className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black text-white">กรอกแบบฟอร์มแทนลูกค้า</h2>
                <p className="text-xs text-white/80 truncate">สร้างคำร้องคืน/แลกเปลี่ยนแทนลูกค้า</p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/80 group-hover:translate-x-1 transition-transform shrink-0" />
            </div>
          </Link>

          {/* Tile: CSR Dashboard — กว้าง 2/สูง 2 หน่วย โทนน้ำเงินม่วง เน้นตัวเลขรอตรวจสอบ */}
          <Link href="/admin/csr/dashboard" className="group block md:col-span-2 md:row-span-2">
            <div className="relative h-full flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_-8px_rgba(46,43,122,0.12)] hover:shadow-[0_20px_45px_-15px_rgba(46,43,122,0.45)] hover:border-[#2E2B7A]/40 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="absolute top-0 left-6 right-6 h-[3px] rounded-b-full bg-gradient-to-r from-[#2E2B7A] via-[#4A46B0] to-[#2E2B7A] shadow-[0_0_10px_rgba(74,70,176,0.6)]" />
              <div className="p-6 flex-1 flex flex-col">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#4A46B0] to-[#2E2B7A] shadow-md shadow-[#2E2B7A]/30 ring-1 ring-white/20 mb-3">
                  <LayoutDashboard className="w-5 h-5 text-white" />
                </div>
                {counts ? (
                  <p className="text-[#2E2B7A] font-black text-3xl leading-none tabular-nums mb-1 flex items-center gap-1.5">
                    {fmt(counts.pendingReview)}
                    <Clock className="w-4 h-4 opacity-60" />
                  </p>
                ) : (
                  <Skeleton className="h-8 w-14 mb-1" />
                )}
                <h2 className="text-sm font-black text-[#241F5E] mb-1">CSR Dashboard</h2>
                <p className="text-xs text-[#6B6698] mb-4">ใบงานรอตรวจสอบ/อนุมัติ — ตรวจสอบรายการที่รอดำเนินการ</p>
                <span className="mt-auto text-xs font-bold text-[#2E2B7A] flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  ดูรายการที่รอดำเนินการ <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* Tile: การจัดการข้อมูลลูกค้า — กว้าง 2/สูง 2 หน่วย โทนมัสตาร์ด เน้นตัวเลขรออนุมัติ */}
          <Link href="/admin/csr/customers" className="group block md:col-span-2 md:row-span-2">
            <div className="relative h-full flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_-8px_rgba(138,116,32,0.12)] hover:shadow-[0_20px_45px_-15px_rgba(234,217,76,0.4)] hover:border-[#EAD94C]/60 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="absolute top-0 left-6 right-6 h-[3px] rounded-b-full bg-gradient-to-r from-[#EAD94C] via-[#F4E27E] to-[#EAD94C] shadow-[0_0_10px_rgba(234,217,76,0.6)]" />
              <div className="p-6 flex-1 flex flex-col">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#F4E27E] to-[#EAD94C] shadow-md shadow-[#EAD94C]/30 ring-1 ring-white/40 mb-3">
                  <Users className="w-5 h-5 text-[#241F5E]" />
                </div>
                {counts ? (
                  <p className="text-[#8A7420] font-black text-3xl leading-none tabular-nums mb-1">{fmt(counts.pendingClients)}</p>
                ) : (
                  <Skeleton className="h-8 w-14 mb-1" />
                )}
                <h2 className="text-sm font-black text-[#241F5E] mb-1">การจัดการข้อมูลลูกค้า</h2>
                <p className="text-xs text-[#6B6698] mb-4">ลูกค้าใหม่รออนุมัติ — ตรวจสอบและกำหนดรหัสลูกค้า</p>
                <span className="mt-auto text-xs font-bold text-[#8A7420] flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  ดูลูกค้าที่รออนุมัติ <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* Tile: Download Center — placeholder "อยู่ระหว่างการพัฒนา" ตาม request ผู้ใช้
               (ยังไม่ลิงก์ไปไหน เป็น template รอออกแบบเนื้อหาจริงภายหลัง — pattern เดียวกับ
               การ์ด "ศูนย์รายงาน — เร็วๆ นี้" ที่ Sale hub ใช้) — กว้าง 2/สูง 1 หน่วย โทนทีล */}
          <div className="relative rounded-3xl bg-white/50 backdrop-blur-xl border border-dashed border-[#C9C4E0]/70 opacity-80 overflow-hidden md:col-span-2 md:row-span-1">
            <div className="absolute inset-0 opacity-[0.5] bg-[repeating-linear-gradient(135deg,_rgba(107,102,152,0.06)_0px,_rgba(107,102,152,0.06)_1px,_transparent_1px,_transparent_10px)]" />
            <div className="relative h-full p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#F1EDE0] ring-1 ring-white/50 shrink-0">
                <FileSpreadsheet className="w-5 h-5 text-[#6B6698]" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black text-[#241F5E] flex items-center gap-1.5 flex-wrap">
                  Download Center
                  <span className="text-[9px] font-bold uppercase tracking-wide bg-[#F1EDE0] text-[#6B6698] px-2 py-0.5 rounded-full shrink-0">อยู่ระหว่างการพัฒนา</span>
                </h2>
                <p className="text-xs text-[#A7A2C4] truncate">อยู่ระหว่างการพัฒนา และออกแบบเนื้อหาภายหลัง</p>
              </div>
            </div>
          </div>

          {/* Tile: ศูนย์รายงาน (Report Center) — กว้าง 2/สูง 1 หน่วย โทนเทา */}
          <Link href="/admin/csr/reports" className="group block md:col-span-2 md:row-span-1">
            <div className="relative h-full rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_4px_20px_-8px_rgba(107,102,152,0.15)] hover:shadow-[0_16px_36px_-12px_rgba(107,102,152,0.4)] hover:border-[#6B6698]/40 transition-all duration-300 overflow-hidden transform hover:-translate-y-0.5 p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#ECEAF6] ring-1 ring-white/50 shrink-0">
                <BarChart3 className="w-5 h-5 text-[#6B6698]" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black text-[#241F5E]">ศูนย์รายงาน (Report Center)</h2>
                <p className="text-xs text-[#6B6698] truncate">สรุปสถิติและ Visual dashboard</p>
              </div>
              <ArrowRight className="w-4 h-4 text-[#6B6698] group-hover:translate-x-1 transition-transform shrink-0" />
            </div>
          </Link>

          {/* Tile: คำถามที่บอทตอบไม่ได้ — กว้าง 2/สูง 1 หน่วย โทนเทา เน้นตัวเลขค้างทบทวน
              (ย้ายมาจาก manager hub — ใช้ logic/ดีไซน์เดิมทุกจุด) */}
          <Link href="/admin/csr/chatbot" className="group block md:col-span-2 md:row-span-1">
            <div className="relative h-full rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_4px_20px_-8px_rgba(107,102,152,0.15)] hover:shadow-[0_16px_36px_-12px_rgba(107,102,152,0.4)] hover:border-[#6B6698]/40 transition-all duration-300 overflow-hidden transform hover:-translate-y-0.5 p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#ECEAF6] ring-1 ring-white/50 shrink-0">
                <HelpCircle className="w-5 h-5 text-[#6B6698]" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black text-[#241F5E] flex items-center gap-1.5">
                  คำถามที่บอทตอบไม่ได้
                  {!!counts?.unanswered && (
                    <span className="text-[10px] font-bold text-white bg-[#6B6698] px-1.5 py-0.5 rounded-full shrink-0">{fmt(counts.unanswered)}</span>
                  )}
                </h2>
                <p className="text-xs text-[#6B6698] truncate">ทบทวนคำถามที่ตอบว่า &quot;ไม่แน่ใจ&quot;</p>
              </div>
              <ArrowRight className="w-4 h-4 text-[#6B6698] group-hover:translate-x-1 transition-transform shrink-0" />
            </div>
          </Link>
        </div>
      </main>

      <footer className="relative mt-4 py-5 px-6 text-center border-t border-[#EADFAF]">
        <div className="absolute left-1/2 -translate-x-1/2 -top-px w-16 h-px bg-gradient-to-r from-transparent via-[#EAD94C] to-transparent" />
        <p className="text-[11px] text-[#6B6698]">© 2026 <span className="font-bold text-[#E1592A]">GPO Xchange Portal</span> • องค์การเภสัชกรรม สาขาภาคใต้ &nbsp;|&nbsp; Staff Portal</p>
      </footer>
    </div>
  );
}
