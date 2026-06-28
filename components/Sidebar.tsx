'use client'

import { logoutCustomer } from '@/app/actions/auth-actions';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Sidebar({ customer }: { customer: any }) {
  const router = useRouter();
  const customerId = customer?.id || '';

  return (
    <aside className="h-full w-full flex flex-col p-6 bg-white border-r border-slate-100">

      {customer && (
        <div className="relative bg-white border border-slate-100 p-6 rounded-3xl shadow-sm mb-8 overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-50 rounded-bl-full -mr-6 -mt-6 opacity-60" />

          <div className="relative flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white text-xl font-black shadow-lg shadow-teal-200">
              {customer?.contact_name?.charAt(0) ?? 'U'}
            </div>
            <div className="flex flex-col justify-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ผู้ใช้งาน</p>
              <p className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-md w-fit mt-0.5">Verified</p>
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
                <span className="shrink-0">🏥</span>
                <span className="leading-tight">{customer?.hospital_name}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-2">
        <Link href="/welcome" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold bg-teal-50 text-teal-700 transition-all">
          <span className="text-base">🏠</span> หน้าหลัก
        </Link>
        <Link
          href={`/customer/${customerId}/history`}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 hover:text-teal-700 transition-all"
        >
          <span className="text-base">🔄</span> ประวัติการแลกเปลี่ยน
        </Link>
        <button
          onClick={async () => { await logoutCustomer(); router.push('/'); }}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black text-red-600 bg-red-50 hover:bg-red-500 hover:text-white border border-red-100 transition-all duration-300 active:scale-95"
        >
          <span className="text-sm">❌</span> ออกจากระบบ
        </button>
      </nav>

      <div className="pt-6 border-t border-slate-100">
        <p className="text-[10px] text-slate-400 text-center">© 2026 GPO Xchange</p>
      </div>
    </aside>
  );
}