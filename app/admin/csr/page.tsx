'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStaffSession, logoutStaffAction } from '@/app/actions/auth-staff';
import Link from 'next/link';
import { ShieldCheck, User, Building2, FileEdit, FolderKanban, ArrowRight, LogOut, Users } from 'lucide-react';

export default function CsrHubPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<any>(null);
  const [today, setToday] = useState('');

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
    await logoutStaffAction();
    router.push('/admin/login');
  };

  if (!staff) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#fff7ed' }}>
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-orange-600 font-medium">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg,#fff7ed 0%,#f0f4f8 100%)' }}>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 space-y-7">

        {/* ── LOGO & BRAND IDENTITY ── */}
        <div className="flex items-center justify-between gap-3 px-2 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm bg-gradient-to-tr from-[#ea580c] to-[#fb923c] text-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-800 leading-tight">GPO Xchange</p>
              <p className="text-[10px] text-slate-400 leading-tight">Staff Portal · CSR</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-red-600 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 px-3.5 py-2 rounded-xl transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            ออกจากระบบ
          </button>
        </div>

        {/* ── Welcome Header ── */}
        <div className="relative overflow-hidden rounded-3xl p-8 text-white shadow-xl" style={{ background: 'linear-gradient(135deg, #c2410c 0%, #ea580c 45%, #f97316 75%, #fb923c 100%)' }}>
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-20 bg-white" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full opacity-15 bg-white" />
          <div className="absolute top-1/2 right-24 w-20 h-20 rounded-full opacity-[0.12] bg-white hidden md:block" />
          <div className="absolute top-6 left-1/3 w-3 h-3 rounded-full bg-yellow-200 opacity-70 hidden md:block" />
          <div className="absolute bottom-10 right-1/3 w-2 h-2 rounded-full bg-yellow-200 opacity-60 hidden md:block" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-yellow-100 text-xs font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-200 animate-pulse" /> ยินดีต้อนรับ
              </p>
              <h1 className="text-2xl md:text-3xl font-black leading-tight flex items-center gap-2">
                สวัสดีคุณ {staff.full_name || staff.username}
                <User className="w-6 h-6 opacity-80" />
              </h1>
              <p className="text-orange-100 mt-1.5 flex items-center gap-1.5 text-sm">
                <Building2 className="w-4 h-4" /> แผนก CSR (Customer Service)
              </p>
              <p className="text-orange-100/90 mt-3 text-sm leading-relaxed">
                ขอให้มีความสุขตลอดการทำงานในวันที่สดใส{today && <> วัน{today}</>}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl px-5 py-4 text-center hidden md:block">
              <p className="text-orange-100 text-[11px] font-semibold uppercase tracking-wide mb-1">สถานะบัญชี</p>
              <div className="flex items-center gap-1.5 justify-center">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-white font-bold text-sm">Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Action Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Card: กรอกแบบฟอร์มแทนลูกค้า */}
          <Link href="/admin/csr/form" className="group block">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-lg hover:border-orange-200 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="p-7">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: 'linear-gradient(135deg,#ffedd5,#fdba74)' }}>
                    <FileEdit className="w-5 h-5 text-orange-700" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-800">กรอกแบบฟอร์มแทนลูกค้า</h2>
                    <p className="text-xs text-slate-400">สร้างคำร้องคืน/แลกเปลี่ยนสินค้าแทนลูกค้าที่ติดต่อเข้ามา</p>
                  </div>
                </div>
                <div
                  className="w-full py-3.5 rounded-2xl font-bold text-white text-sm text-center shadow-md shadow-orange-200 group-hover:shadow-xl group-hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#ea580c,#f97316)' }}
                >
                  <FileEdit className="w-4 h-4" /> เริ่มสร้างคำร้องใหม่
                </div>
              </div>
            </div>
          </Link>

          {/* Card: CSR Dashboard */}
          <Link href="/admin/csr/dashboard" className="group block">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-lg hover:border-orange-200 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="p-7">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: 'linear-gradient(135deg,#ffedd5,#fed7aa)' }}>
                    <Building2 className="w-5 h-5 text-orange-700" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-800">CSR Dashboard</h2>
                    <p className="text-xs text-slate-400">ตรวจสอบ/อนุมัติใบงานที่รอดำเนินการ</p>
                  </div>
                </div>
                <div className="h-20 flex flex-col items-center justify-center border-2 border-dashed border-orange-100 rounded-2xl text-sm text-orange-600 bg-orange-50/40 gap-1.5 group-hover:bg-orange-50 group-hover:border-orange-300 transition-colors">
                  <FolderKanban className="w-6 h-6 opacity-60" />
                  <span className="font-bold text-xs flex items-center gap-1">
                    ดูรายการที่รอดำเนินการ <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </Link>

          {/* Card: การจัดการข้อมูลลูกค้า */}
          <Link href="/admin/csr/customers" className="group block">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-lg hover:border-orange-200 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="p-7">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: 'linear-gradient(135deg,#ffedd5,#fb923c)' }}>
                    <Users className="w-5 h-5 text-orange-700" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-800">การจัดการข้อมูลลูกค้า</h2>
                    <p className="text-xs text-slate-400">อนุมัติ/ปฏิเสธลูกค้าใหม่ที่รอตรวจสอบ</p>
                  </div>
                </div>
                <div className="h-20 flex flex-col items-center justify-center border-2 border-dashed border-orange-100 rounded-2xl text-sm text-orange-600 bg-orange-50/40 gap-1.5 group-hover:bg-orange-50 group-hover:border-orange-300 transition-colors">
                  <Users className="w-6 h-6 opacity-60" />
                  <span className="font-bold text-xs flex items-center gap-1">
                    ดูลูกค้าที่รออนุมัติ <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </main>

      <footer className="mt-4 py-5 px-6 text-center border-t border-orange-50">
        <p className="text-[11px] text-slate-400">© 2026 <span className="font-bold text-orange-600">GPO Xchange Portal</span> • องค์การเภสัชกรรม สาขาภาคใต้ &nbsp;|&nbsp; Staff Portal</p>
      </footer>
    </div>
  );
}