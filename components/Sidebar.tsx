'use client'

import { logoutCustomer } from '@/app/actions/auth-actions';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { Home, History, Building2, UserCog, LogOut, Loader2 } from 'lucide-react';
import type { CustomerSessionInfo } from '@/lib/types';

const navItems = [
  { href: '/welcome', label: 'หน้าหลัก', icon: Home, tint: 'emerald' as const },
  { href: '/customer/history', label: 'ประวัติการยื่นคำร้อง', icon: History, tint: 'blue' as const },
  { href: '/customer/org-history', label: 'ประวัติงานรวมทั้งหน่วยงาน', icon: Building2, tint: 'violet' as const },
  { href: '/account', label: 'บัญชีผู้ใช้', icon: UserCog, tint: 'amber' as const },
];

const tintClasses = {
  emerald: { active: 'bg-emerald-50 text-emerald-700', icon: 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white' },
  blue: { active: 'bg-blue-50 text-blue-700', icon: 'bg-gradient-to-br from-blue-400 to-blue-600 text-white' },
  violet: { active: 'bg-violet-50 text-violet-700', icon: 'bg-gradient-to-br from-violet-400 to-violet-600 text-white' },
  amber: { active: 'bg-amber-50 text-amber-700', icon: 'bg-gradient-to-br from-amber-400 to-amber-600 text-white' },
};

export default function Sidebar({ customer }: { customer: CustomerSessionInfo | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutCustomer();
    router.push('/');
  };

  return (
    <aside className="h-full w-full flex flex-col p-6 bg-gradient-to-b from-teal-50/60 via-white to-white border-r border-slate-100">

      {customer && (
        <div className="relative bg-white border border-slate-100 p-6 rounded-3xl shadow-sm mb-8 overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-teal-100 to-emerald-100 rounded-bl-full -mr-6 -mt-6 opacity-70" />

          <div className="relative flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white text-xl font-black shadow-lg shadow-teal-200">
              {customer?.contact_name?.charAt(0) ?? 'U'}
            </div>
            <div className="flex flex-col justify-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ผู้ใช้งาน</p>
              <p className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md w-fit mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Verified
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-400 uppercase">ชื่อผู้ติดต่อ</p>
              <p className="text-[15px] font-black text-slate-900 leading-snug">{customer?.contact_name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-400 uppercase">หน่วยงาน</p>
              <div className="flex items-center gap-2 text-[12px] font-bold text-teal-700 bg-teal-50 px-3 py-2 rounded-xl border border-teal-100">
                <Building2 className="w-4 h-4 shrink-0" />
                <span className="leading-tight">{customer?.hospital_name}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ★ ระยะห่างระหว่างหัวข้อ — เดิม space-y-1.5 เท่ากันทั้งมือถือ/desktop ผู้ใช้บอกว่าฝั่ง
          desktop ดูติดกันเกินไป (มือถือพอดีอยู่แล้ว ไม่แตะ) เพิ่มเฉพาะ md: ขึ้นไป */}
      <nav className="flex-1 space-y-1.5 md:space-y-3">
        {navItems.map(({ href, label, icon: Icon, tint }) => {
          const isActive = pathname === href || pathname?.startsWith(`${href}/`);
          const t = tintClasses[tint];
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 pl-2.5 pr-4 py-2 rounded-xl text-sm font-bold transition-all ${
                isActive ? `${t.active} shadow-sm` : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${isActive ? `${t.icon} shadow-sm` : 'bg-slate-100 text-slate-400'}`}>
                <Icon className="w-4 h-4" />
              </span>
              {label}
            </Link>
          );
        })}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="w-full flex items-center justify-center gap-2 py-3 mt-4 rounded-xl text-xs font-black text-red-600 bg-red-50 hover:bg-red-500 hover:text-white border border-red-100 transition-all duration-300 active:scale-95 disabled:opacity-60 disabled:pointer-events-none"
        >
          {isLoggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />} ออกจากระบบ
        </button>
      </nav>

      <div className="pt-6 border-t border-slate-100">
        <p className="text-[10px] text-slate-400 text-center">© 2026 GPO Xchange</p>
      </div>
    </aside>
  );
}
