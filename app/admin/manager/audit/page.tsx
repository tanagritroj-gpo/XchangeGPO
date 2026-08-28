'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck, ScrollText } from 'lucide-react';
import { AuditLogViewer } from '@/components/audit/AuditLogViewer';

// "บันทึกการตรวจสอบระบบ" (ISO 27001 A.8.16) — Manager อ่านอย่างเดียว
// สิทธิ์เช็คที่ layout ของโซน /admin/manager (redirect ถ้าไม่ใช่ manager) และ
// getAuditEvents ก็ยืนยัน getManagerSession() ซ้ำอิสระอีกชั้น
export default function ManagerAuditPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      <div className="relative z-30 sticky top-0 bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={() => router.replace('/admin/manager')}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary px-3 py-2 rounded-md transition-colors group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-border shrink-0" />
            <div className="min-w-0 flex items-center gap-2">
              <ScrollText size={17} className="text-accent-foreground shrink-0" />
              <div className="min-w-0">
                <h1 className="text-sm md:text-base font-bold text-foreground leading-tight truncate">บันทึกการตรวจสอบระบบ</h1>
                <p className="text-[11px] text-muted-foreground hidden sm:block">Audit log — append-only เก็บ 24 เดือน</p>
              </div>
            </div>
          </div>
          <span className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 rounded-full border bg-accent border-transparent text-accent-foreground text-[11px] md:text-xs font-semibold shrink-0">
            <ShieldCheck size={13} strokeWidth={2.5} />
            <span>Manager</span>
          </span>
        </div>
      </div>

      <AuditLogViewer />
    </div>
  );
}
