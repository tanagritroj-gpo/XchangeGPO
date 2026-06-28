'use client'

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logoutCustomer } from '@/app/actions/auth-actions';

export default function BottomNav({ customerId }: { customerId: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const tabs = [
    { href: '/welcome',                        icon: '🏠', label: 'หน้าหลัก' },
    { href: `/customer/${customerId}/history`, icon: '🔄', label: 'ประวัติ'  },
  ];

  return (
    // เปลี่ยนจาก sm:hidden → md:hidden
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-100 flex items-stretch h-16">

      {tabs.map(tab => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors
              ${active ? 'text-teal-700' : 'text-slate-400'}`}
          >
            <span className={`text-xl leading-none transition-transform ${active ? 'scale-110' : ''}`}>
              {tab.icon}
            </span>
            {tab.label}
            {active && (
              <span className="absolute bottom-0 w-10 h-0.5 rounded-full bg-teal-500" />
            )}
          </Link>
        );
      })}

      <button
        onClick={async () => { await logoutCustomer(); router.push('/'); }}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold text-red-400 active:text-red-600"
      >
        <span className="text-xl leading-none">❌</span>
        ออกจากระบบ
      </button>
    </nav>
  );
}