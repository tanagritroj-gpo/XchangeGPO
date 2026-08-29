'use client';

import { useRouter } from 'next/navigation';
import { ShieldCheck, LogOut } from 'lucide-react';
import { MfaEnrollFlow } from '@/components/mfa/MfaEnrollFlow';
import { logoutStaffAction } from '@/app/actions/auth-staff';

const DEPT_HOME: Record<string, string> = {
  manager: '/admin/manager',
  csr: '/admin/csr',
  log: '/admin/logistics/dashboard',
  wh: '/admin/wh/dashboard',
  sale: '/admin/sale',
};

export default function MfaSetupPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-xl bg-card border border-border p-6 md:p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-accent text-accent-foreground flex items-center justify-center shrink-0">
            <ShieldCheck size={19} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">ตั้งค่าการยืนยันตัวตนสองชั้น (MFA)</h1>
            <p className="text-xs text-muted-foreground">
              องค์กรกำหนดให้พนักงานทุกคนเปิดใช้งาน MFA เพื่อความปลอดภัยของระบบ
            </p>
          </div>
        </div>

        <MfaEnrollFlow
          completeLabel="เข้าสู่ระบบ"
          onComplete={(info) => {
            router.push(info ? DEPT_HOME[info.department] ?? '/' : '/');
          }}
        />

        <div className="pt-3 border-t border-border">
          <button
            onClick={async () => { await logoutStaffAction(); router.push('/'); }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-3.5 h-3.5" /> ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  );
}
