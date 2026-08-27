'use client'

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logoutCustomer } from '@/app/actions/auth-actions';
import { useState } from 'react';
import { Home, History, Building2, UserCog, LogOut, Loader2 } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutCustomer();
    router.push('/');
  };

  const tabs = [
    { href: '/welcome',              icon: Home,      label: 'หน้าหลัก' },
    { href: '/customer/history',     icon: History,   label: 'ประวัติ'  },
    { href: '/customer/org-history', icon: Building2, label: 'หน่วยงาน' },
    { href: '/account',              icon: UserCog,   label: 'บัญชี'    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-100 flex items-stretch min-h-16 pb-[env(safe-area-inset-bottom)]">

      {tabs.map(tab => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors
              ${active ? 'text-teal-700' : 'text-slate-400'}`}
          >
            <Icon className={`w-5 h-5 transition-transform ${active ? 'scale-110' : ''}`} />
            {tab.label}
            {active && (
              <span className="absolute bottom-0 w-10 h-0.5 rounded-full bg-teal-500" />
            )}
          </Link>
        );
      })}

      <button
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold text-red-400 active:text-red-600 disabled:opacity-60"
      >
        {isLoggingOut ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
        ออกจากระบบ
      </button>
    </nav>
  );
}