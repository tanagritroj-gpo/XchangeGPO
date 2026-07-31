'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStaffSession, logoutStaffAction } from '@/app/actions/auth-staff';
import Link from 'next/link';
import { ShieldCheck, User, Building2, FileEdit, FolderKanban, ArrowRight, LogOut, Users, Loader2, FileBarChart2 } from 'lucide-react';

export default function CsrHubPage() {
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
        <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-purple-700">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 space-y-7">

        {/* ── LOGO & BRAND IDENTITY ── */}
        <div className="flex items-center justify-between gap-3 px-2 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-600 text-white shadow-sm shadow-purple-200">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">GPO Xchange</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Staff Portal · CSR</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-red-600 bg-white hover:bg-red-50 border border-purple-100 hover:border-red-200 px-3.5 py-2 rounded-xl transition-colors disabled:opacity-60 disabled:pointer-events-none"
          >
            {isLoggingOut ? <Loader2 className="w-4 h-5 animate-spin" /> : <LogOut className="w-4 h-5" />}
            ออกจากระบบ
          </button>
        </div>

        {/* ── Welcome Header — ม่วงสดทึบเต็มแถบ (คงไว้แบบเดียวกับตอนเป็นส้ม แค่เปลี่ยนสี) ── */}
        <div className="relative overflow-hidden rounded-3xl bg-purple-600 p-8 text-white shadow-lg shadow-purple-200">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-20 bg-white" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full opacity-15 bg-white" />
          <div className="absolute top-1/2 right-24 w-20 h-20 rounded-full opacity-10 bg-white hidden md:block" />
          <div className="absolute top-6 left-1/3 w-3 h-3 rounded-full bg-fuchsia-200 opacity-80 hidden md:block" />
          <div className="absolute bottom-10 right-1/3 w-2 h-2 rounded-full bg-fuchsia-200 opacity-70 hidden md:block" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-fuchsia-100 text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-200 animate-pulse" /> ยินดีต้อนรับ
              </p>
              <h1 className="text-2xl md:text-3xl font-black leading-tight flex items-center gap-2">
                สวัสดีคุณ {staff.full_name || staff.username}
                <User className="w-6 h-6 opacity-80" />
              </h1>
              <p className="text-purple-50 mt-1.5 flex items-center gap-1.5 text-sm">
                <Building2 className="w-4 h-4" /> แผนก CSR (Customer Service)
              </p>
              <p className="text-purple-50/90 mt-3 text-sm leading-relaxed">
                ขอให้มีความสุขตลอดการทำงาน ในวันที่สดใส{today && <> {today}</>}
              </p>
            </div>
            <div className="bg-white/15 border border-white/25 rounded-2xl px-5 py-4 text-center hidden md:block backdrop-blur-sm">
              <p className="text-purple-100 text-[11px] font-semibold uppercase tracking-wide mb-1">สถานะบัญชี</p>
              <div className="flex items-center gap-1.5 justify-center">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-white font-bold text-sm">Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Action Grid — การ์ดขาวสด ไอคอนพื้นม่วง/อินดิโก/ชมพูม่วง(fuchsia)/เหลืองอำพัน(amber) แยกแต่ละใบ ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
          {/* Card: กรอกแบบฟอร์มแทนลูกค้า */}
          <Link href="/admin/csr/form" className="group block h-full">
            <div className="h-full flex flex-col bg-white rounded-3xl border border-purple-100 shadow-sm hover:shadow-lg hover:border-purple-300 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="p-7 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-purple-100 shrink-0">
                    <FileEdit className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-foreground">กรอกแบบฟอร์มแทนลูกค้า</h2>
                    <p className="text-xs text-muted-foreground">สร้างคำร้องคืน/แลกเปลี่ยนสินค้าแทนลูกค้าที่ติดต่อเข้ามา</p>
                  </div>
                </div>
                <div className="mt-auto h-16 w-full rounded-2xl font-bold text-white text-sm bg-purple-600 shadow-md shadow-purple-200 group-hover:bg-purple-700 group-hover:shadow-xl group-hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2">
                  <FileEdit className="w-4 h-4" /> เริ่มสร้างคำร้องใหม่
                </div>
              </div>
            </div>
          </Link>

          {/* Card: CSR Dashboard */}
          <Link href="/admin/csr/dashboard" className="group block h-full">
            <div className="h-full flex flex-col bg-white rounded-3xl border border-purple-100 shadow-sm hover:shadow-lg hover:border-purple-300 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="p-7 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-indigo-100 shrink-0">
                    <Building2 className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-foreground">CSR Dashboard</h2>
                    <p className="text-xs text-muted-foreground">ตรวจสอบ/อนุมัติใบงานที่รอดำเนินการ</p>
                  </div>
                </div>
                <div className="mt-auto h-16 flex flex-col items-center justify-center border-2 border-dashed border-indigo-200 rounded-2xl text-sm text-indigo-700 bg-indigo-50 gap-1 group-hover:bg-indigo-100 group-hover:border-indigo-300 transition-colors">
                  <FolderKanban className="w-5 h-5 opacity-70" />
                  <span className="font-bold text-xs flex items-center gap-1">
                    ดูรายการที่รอดำเนินการ <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </Link>

          {/* Card: การจัดการข้อมูลลูกค้า */}
          <Link href="/admin/csr/customers" className="group block h-full">
            <div className="h-full flex flex-col bg-white rounded-3xl border border-purple-100 shadow-sm hover:shadow-lg hover:border-purple-300 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="p-7 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-fuchsia-100 shrink-0">
                    <Users className="w-5 h-5 text-fuchsia-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-foreground">การจัดการข้อมูลลูกค้า</h2>
                    <p className="text-xs text-muted-foreground">อนุมัติ/ปฏิเสธลูกค้าใหม่ที่รอตรวจสอบ</p>
                  </div>
                </div>
                <div className="mt-auto h-16 flex flex-col items-center justify-center border-2 border-dashed border-fuchsia-100 rounded-2xl text-sm text-fuchsia-600 bg-fuchsia-50/60 gap-1 group-hover:bg-fuchsia-50 group-hover:border-fuchsia-300 transition-colors">
                  <Users className="w-5 h-5 opacity-70" />
                  <span className="font-bold text-xs flex items-center gap-1">
                    ดูลูกค้าที่รออนุมัติ <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </Link>

          {/* Card: ศูนย์รายงาน (Report Center) */}
          <Link href="/admin/csr/reports" className="group block h-full">
            <div className="h-full flex flex-col bg-white rounded-3xl border border-purple-100 shadow-sm hover:shadow-lg hover:border-purple-300 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="p-7 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-amber-100 shrink-0">
                    <FileBarChart2 className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-foreground">ศูนย์รายงาน (Report Center)</h2>
                    <p className="text-xs text-muted-foreground">สรุปสถิติและออกรายงานคำร้องคืน/แลกเปลี่ยนสินค้า</p>
                  </div>
                </div>
                <div className="mt-auto h-16 flex flex-col items-center justify-center border-2 border-dashed border-amber-200 rounded-2xl text-sm text-amber-700 bg-amber-50 gap-1 group-hover:bg-amber-100 group-hover:border-amber-300 transition-colors">
                  <FileBarChart2 className="w-5 h-5 opacity-70" />
                  <span className="font-bold text-xs flex items-center gap-1">
                    ดูรายงาน/ดาวน์โหลด Excel <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </main>

      <footer className="mt-4 py-5 px-6 text-center border-t border-purple-100">
        <p className="text-[11px] text-muted-foreground">© 2026 <span className="font-bold text-purple-600">GPO Xchange Portal</span> • องค์การเภสัชกรรม สาขาภาคใต้ &nbsp;|&nbsp; Staff Portal</p>
      </footer>
    </div>
  );
}