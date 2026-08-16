'use client'

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, ArrowLeft, LogOut } from 'lucide-react';
import { logoutStaffAction } from '@/app/actions/auth-staff';
import SaleActiveWorkflow from '../component/SaleActiveWorkflow';

// หน้า "Active Workflow" แยกต่างหาก (เดิมฝังตรงในหน้า hub แต่ผู้ใช้ขอให้แยกเป็นการ์ดกดเข้ามาดู
// แทน ตาม pattern เดียวกับ "ประวัติการแลกเปลี่ยน") — โครงหน้า/พื้นหลังเหมือน
// app/admin/sale/history/page.tsx ทุกอย่าง ต่างแค่เนื้อหาหลักเป็น SaleActiveWorkflow board
export default function SaleWorkflowPage() {
  const router = useRouter();

  const handleLogout = async () => {
    await logoutStaffAction();
    router.push('/');
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#FBF6E8] via-[#F8F2DF] to-[#F1E7C8] overflow-hidden">

      {/* ── พื้นหลังลูกเล่น — แสงกระจายแบบสุ่ม + บลอบใหญ่ ตรงกับหน้า Sale Hub/History ── */}
      <div className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute -top-16 -right-14 w-56 h-56 md:-top-20 md:-right-20 md:w-[380px] md:h-[380px] rounded-full bg-[radial-gradient(circle,_#EAD94C_0%,_transparent_72%)] opacity-40 blur-2xl" />
        <div className="absolute top-[42%] -left-14 w-48 h-48 md:top-[45%] md:-left-28 md:w-[340px] md:h-[340px] rounded-full bg-[radial-gradient(circle,_#E1592A_0%,_transparent_72%)] opacity-[0.14] blur-3xl" />
        <div className="absolute -bottom-16 right-[8%] w-56 h-56 md:-bottom-28 md:w-[400px] md:h-[400px] rounded-full bg-[radial-gradient(circle,_#2E2B7A_0%,_transparent_72%)] opacity-[0.10] blur-3xl" />
        <div className="absolute top-[12%] left-[10%] w-12 h-12 rounded-full bg-[#EAD94C] opacity-[0.12] blur-lg hidden sm:block" />
        <div className="absolute top-[24%] right-[8%] w-10 h-10 rounded-full bg-white opacity-20 blur-lg hidden sm:block" />
        <div className="absolute bottom-[16%] left-[8%] w-14 h-14 rounded-full bg-[#E1592A] opacity-[0.09] blur-xl" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto w-full px-4 md:px-6 pt-6">
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/45 backdrop-blur-md border border-white/50 shadow-sm">
          <Link href="/admin/sale" className="flex items-center gap-2 text-sm font-bold text-[#6B6698] hover:text-[#E1592A] transition-colors">
            <ArrowLeft className="w-5 h-5" /> ย้อนกลับ
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm font-bold text-[#6B6698] hover:text-[#E1592A] bg-white/70 hover:bg-[#FBEFE6] border border-white/60 hover:border-[#F0C6AA] px-4 py-2.5 rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5" /> ออกจากระบบ
          </button>
        </div>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto w-full px-4 md:px-6 py-6 md:py-10">
        <div className="flex items-center gap-3 mb-5 px-1">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
            <Eye size={19} className="text-indigo-600" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-base font-bold text-[#241F5E]">Active Workflow</h1>
            <p className="text-xs text-[#6B6698]">ภาพรวมใบงานทุกสถานะในพื้นที่ดูแลรับผิดชอบของคุณ</p>
          </div>
        </div>

        <SaleActiveWorkflow />
      </div>
    </div>
  );
}
