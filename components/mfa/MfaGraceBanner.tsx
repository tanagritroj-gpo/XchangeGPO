'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShieldAlert, X } from 'lucide-react';

// แถบเตือนช่วงผ่อนผัน MFA — ปิดได้ต่อ session (sessionStorage) แต่จะกลับมาแสดงเมื่อเปิดแท็บใหม่
export function MfaGraceBanner({ graceUntil }: { graceUntil: string }) {
  const [daysLeft] = useState(() =>
    Math.max(0, Math.ceil((new Date(graceUntil).getTime() - Date.now()) / 86400_000)),
  );
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem('mfa-grace-banner-dismissed') === '1';
  });

  if (dismissed) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
      <div className="max-w-6xl mx-auto flex items-center gap-3 text-xs">
        <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
        <p className="text-amber-800 flex-1">
          บัญชีนี้ยังไม่ได้เปิดใช้งาน MFA — เหลือเวลาอีก{' '}
          <span className="font-bold">{daysLeft} วัน</span> ก่อนระบบจะบังคับตั้งค่า{' '}
          <Link href="/mfa-setup" className="font-bold underline hover:text-amber-900">
            ตั้งค่าตอนนี้
          </Link>
        </p>
        <button
          onClick={() => {
            window.sessionStorage.setItem('mfa-grace-banner-dismissed', '1');
            setDismissed(true);
          }}
          aria-label="ปิดการแจ้งเตือน"
          className="text-amber-600 hover:text-amber-800 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
