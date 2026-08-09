'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { getRequestTrackingForStaff } from '@/app/actions/tracking-actions';
import { TrackingDetailView } from '@/components/tracking/TrackingDetailView';

// หน้า "Track & Trace" ของ CSR — เนื้อหา/ดีไซน์เดียวกับของ Manager ทุกจุด
// (app/admin/manager/tracking/page.tsx) แค่ chrome เปลี่ยนเป็นธีม CSR (badge/ลิงก์ย้อนกลับ)
// ใช้ server action ตัวเดียวกัน (getRequestTrackingForStaff) เพราะ CSR ต้องเปิดดูใบงานทุกใบ
// ในระบบเพื่อตอบลูกค้าได้ถูกต้อง ไม่ต่างจาก manager — ไม่จำกัดแค่หน่วยงานตัวเอง รวมถึงคำร้อง
// ที่ CSR กรอกแทนลูกค้าเองด้วย (submission_channel='csr_manual')
// ไม่มีปุ่ม "เร่งงาน"/"ดาวน์โหลด PDF" เพราะสองปุ่มนั้นผูกกับ customer session โดยตรง — ไม่มี
// ความหมายสำหรับ staff ที่ดูแทนลูกค้า ไม่ได้เป็นเจ้าของคำร้อง (ดู TrackingDetailView.tsx)
// สิทธิ์เข้าถึงหน้านี้เช็คที่ layout.tsx ของโซน CSR แล้ว (department !== 'csr' โดนเตะออก) แต่
// server action getRequestTrackingForStaff ก็ยืนยันซ้ำอิสระอีกชั้นเสมอ ไม่พึ่งแค่ page guard
export default function CsrTrackingPage() {
  const router = useRouter();

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#FBF6E8] via-[#F8F2DF] to-[#F1E7C8]">
      {/* ── พื้นหลังลูกเล่น — ตรงกับหน้า hub (app/admin/csr/page.tsx) ── */}
      <div className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute -top-16 -right-14 w-56 h-56 md:-top-20 md:-right-20 md:w-[380px] md:h-[380px] rounded-full bg-[radial-gradient(circle,_#EAD94C_0%,_transparent_72%)] opacity-40 blur-2xl" />
        <div className="absolute top-[42%] -left-14 w-48 h-48 md:top-[45%] md:-left-28 md:w-[340px] md:h-[340px] rounded-full bg-[radial-gradient(circle,_#E1592A_0%,_transparent_72%)] opacity-[0.14] blur-3xl" />
        <div className="absolute -bottom-16 right-[8%] w-56 h-56 md:-bottom-28 md:w-[400px] md:h-[400px] rounded-full bg-[radial-gradient(circle,_#2E2B7A_0%,_transparent_72%)] opacity-[0.10] blur-3xl" />
      </div>

      {/* ══ Top Bar — เข้าชุดกับหน้า Track & Trace ของ manager ══ */}
      <div className="relative z-30 sticky top-0 bg-white/70 backdrop-blur-xl border-b border-white/50">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={() => router.replace('/admin/csr')}
              className="flex items-center gap-1.5 text-sm font-semibold text-[#6B6698] hover:text-[#241F5E] bg-white/60 hover:bg-white/90 px-3 py-2 rounded-xl transition-all group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-[#EADFAF] shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-bold text-[#241F5E] leading-tight truncate">Track & Trace</h1>
              <p className="text-[10px] md:text-[11px] text-[#6B6698] hidden sm:block">GPO Xchange Portal</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 rounded-full border bg-[#ECEAF6] border-[#D8D5E8] text-[#2E2B7A] text-[11px] md:text-xs font-semibold shrink-0">
            <ShieldCheck size={13} strokeWidth={2.5} />
            <span>CSR</span>
          </span>
        </div>
      </div>

      <div className="relative z-10">
        <TrackingDetailView
          fetchFn={getRequestTrackingForStaff}
          heading="Track & Trace"
          subheading="ติดตามสถานะคำร้องของลูกค้าได้ทุกราย รวมถึงแบบฟอร์มที่ CSR กรอกแทนลูกค้า"
          showPingButton={false}
          showPdfDownload={false}
        />
      </div>
    </div>
  );
}
