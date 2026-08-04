'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStaffSession, logoutStaffAction } from '@/app/actions/auth-staff';
import Link from 'next/link';
import { ShieldCheck, User, Building2, PenLine, LayoutDashboard, ArrowRight, LogOut, Users, Loader2, BarChart3 } from 'lucide-react';
import type { StaffSessionInfo } from '@/lib/types';

export default function CsrHubPage() {
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
        <div className="flex items-center justify-between gap-3 px-4 py-3 mb-8 rounded-2xl bg-white/45 backdrop-blur-md border border-white/50 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#F4E27E] to-[#EAD94C] text-[#241F5E] shadow-sm shadow-[#EAD94C]/40">
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

        {/* ── Welcome Header ── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#38339B] via-[#2E2B7A] to-[#211D57] p-8 text-white shadow-lg shadow-[#2E2B7A]/30">
          <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,_white_1px,_transparent_0)] bg-[length:16px_16px]" />
          <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-[radial-gradient(circle,_#EAD94C_0%,_transparent_70%)] opacity-60 blur-sm" />
          <div className="absolute -bottom-10 -left-10 w-44 h-44 rounded-full bg-[radial-gradient(circle,_#E1592A_0%,_transparent_70%)] opacity-50 blur-sm" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-[#EAD94C] text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EAD94C] animate-pulse" /> ยินดีต้อนรับ
              </p>
              <h1 className="text-2xl md:text-3xl font-black leading-tight flex items-center gap-2">
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
            <div className="bg-white/15 border border-white/25 rounded-2xl px-5 py-4 text-center hidden md:block backdrop-blur-md">
              <p className="text-[#EAD94C] text-[11px] font-semibold uppercase tracking-wide mb-1">สถานะบัญชี</p>
              <div className="flex items-center gap-1.5 justify-center">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-white font-bold text-sm">Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Action Grid — การ์ดแก้ว ไอคอนไล่เฉดในโทนเดียวกัน แยกแต่ละใบด้วยสีเน้น ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
          {/* Card: กรอกแบบฟอร์มแทนลูกค้า — สีเน้นส้ม (คำร้องหลัก) */}
          <Link href="/admin/csr/form" className="group block h-full">
            <div className="relative h-full flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-sm hover:shadow-xl hover:border-[#E1592A]/40 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="absolute top-0 left-7 right-7 h-1 rounded-b-full bg-gradient-to-r from-[#EAD94C] via-[#E1592A] to-[#2E2B7A] opacity-70" />
              <div className="p-7 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#F4917A] to-[#E1592A] shrink-0">
                    <PenLine className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-[#241F5E]">กรอกแบบฟอร์มแทนลูกค้า</h2>
                    <p className="text-xs text-[#6B6698]">สร้างคำร้องคืน/แลกเปลี่ยนสินค้าแทนลูกค้าที่ติดต่อเข้ามา</p>
                  </div>
                </div>
                <div className="mt-auto h-16 w-full rounded-2xl font-bold text-white text-sm bg-gradient-to-r from-[#E1592A] to-[#C9481E] shadow-md shadow-[#E1592A]/30 group-hover:shadow-xl group-hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2">
                  <PenLine className="w-4 h-4" /> เริ่มสร้างคำร้องใหม่
                </div>
              </div>
            </div>
          </Link>

          {/* Card: CSR Dashboard — สีเน้นน้ำเงินม่วง (แบรนด์หลัก) */}
          <Link href="/admin/csr/dashboard" className="group block h-full">
            <div className="relative h-full flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-sm hover:shadow-xl hover:border-[#2E2B7A]/40 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="absolute top-0 left-7 right-7 h-1 rounded-b-full bg-gradient-to-r from-[#2E2B7A] via-[#4A46B0] to-[#2E2B7A] opacity-70" />
              <div className="p-7 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#4A46B0] to-[#2E2B7A] shrink-0">
                    <LayoutDashboard className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-[#241F5E]">CSR Dashboard</h2>
                    <p className="text-xs text-[#6B6698]">ตรวจสอบ/อนุมัติใบงานที่รอดำเนินการ</p>
                  </div>
                </div>
                <div className="mt-auto h-16 flex flex-col items-center justify-center border-2 border-dashed border-[#2E2B7A]/25 rounded-2xl text-sm text-[#2E2B7A] bg-[#ECEAF6] gap-1 group-hover:bg-[#E2DEF6] group-hover:border-[#2E2B7A]/40 transition-colors">
                  <LayoutDashboard className="w-5 h-5 opacity-70" />
                  <span className="font-bold text-xs flex items-center gap-1">
                    ดูรายการที่รอดำเนินการ <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </Link>

          {/* Card: การจัดการข้อมูลลูกค้า — สีเน้นมัสตาร์ด */}
          <Link href="/admin/csr/customers" className="group block h-full">
            <div className="relative h-full flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-sm hover:shadow-xl hover:border-[#EAD94C]/60 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="absolute top-0 left-7 right-7 h-1 rounded-b-full bg-gradient-to-r from-[#EAD94C] via-[#F4E27E] to-[#EAD94C] opacity-70" />
              <div className="p-7 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#F4E27E] to-[#EAD94C] shrink-0">
                    <Users className="w-5 h-5 text-[#241F5E]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-[#241F5E]">การจัดการข้อมูลลูกค้า</h2>
                    <p className="text-xs text-[#6B6698]">อนุมัติ/ปฏิเสธลูกค้าใหม่ที่รอตรวจสอบ</p>
                  </div>
                </div>
                <div className="mt-auto h-16 flex flex-col items-center justify-center border-2 border-dashed border-[#EADFAF] rounded-2xl text-sm text-[#8A7420] bg-[#FBF0C8]/60 gap-1 group-hover:bg-[#FBF0C8] group-hover:border-[#EAD94C] transition-colors">
                  <Users className="w-5 h-5 opacity-70" />
                  <span className="font-bold text-xs flex items-center gap-1">
                    ดูลูกค้าที่รออนุมัติ <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </Link>

          {/* Card: ศูนย์รายงาน (Report Center) — สีเน้นน้ำเงินอ่อน/กลาง */}
          <Link href="/admin/csr/reports" className="group block h-full">
            <div className="relative h-full flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-sm hover:shadow-xl hover:border-[#6B6698]/40 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="absolute top-0 left-7 right-7 h-1 rounded-b-full bg-gradient-to-r from-[#6B6698] via-[#9490C0] to-[#6B6698] opacity-70" />
              <div className="p-7 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[#ECEAF6] shrink-0">
                    <BarChart3 className="w-5 h-5 text-[#6B6698]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-[#241F5E]">ศูนย์รายงาน (Report Center)</h2>
                    <p className="text-xs text-[#6B6698]">สรุปสถิติและออกรายงานคำร้องคืน/แลกเปลี่ยนสินค้า</p>
                  </div>
                </div>
                <div className="mt-auto h-16 flex flex-col items-center justify-center border-2 border-dashed border-[#D8D5E8] rounded-2xl text-sm text-[#6B6698] bg-[#F1EDE0] gap-1 group-hover:bg-[#ECEAF6] group-hover:border-[#6B6698]/40 transition-colors">
                  <BarChart3 className="w-5 h-5 opacity-70" />
                  <span className="font-bold text-xs flex items-center gap-1">
                    ดูรายงาน/ดาวน์โหลด Excel <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
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