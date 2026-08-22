'use client'

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, ArrowLeft, LogOut } from 'lucide-react';
import { logoutStaffAction } from '@/app/actions/auth-staff';
import SaleActiveWorkflow from '../component/SaleActiveWorkflow';

// หน้า "Active Workflow" แยกต่างหาก (เดิมฝังตรงในหน้า hub แต่ผู้ใช้ขอให้แยกเป็นการ์ดกดเข้ามาดู
// แทน ตาม pattern เดียวกับ "ประวัติใบงาน") — โครงหน้าเหมือน app/admin/sale/history/page.tsx
// ทุกอย่าง ต่างแค่เนื้อหาหลักเป็น SaleActiveWorkflow board — สไตล์ตาม design.md (Option B)
export default function SaleWorkflowPage() {
  const router = useRouter();

  const handleLogout = async () => {
    await logoutStaffAction();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto w-full px-4 md:px-6 pt-6">
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-card border border-border">
          <Link href="/admin/sale" className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" /> ย้อนกลับ
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary border border-border px-4 py-2.5 rounded-md transition-colors"
          >
            <LogOut className="w-5 h-5" /> ออกจากระบบ
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full px-4 md:px-6 py-6 md:py-10">
        <div className="flex items-center gap-3 mb-5 px-1">
          <div className="w-10 h-10 rounded-md bg-accent text-accent-foreground shadow-sm shadow-accent/40 flex items-center justify-center shrink-0">
            <Eye size={19} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">Active Workflow</h1>
            <p className="text-xs text-muted-foreground">ภาพรวมใบงานทุกสถานะในพื้นที่ดูแลรับผิดชอบของคุณ</p>
          </div>
        </div>

        <SaleActiveWorkflow />
      </div>
    </div>
  );
}
