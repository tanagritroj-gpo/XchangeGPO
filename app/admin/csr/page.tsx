'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStaffSession, logoutStaffAction } from '@/app/actions/auth-staff';
import { getCSRHubCounts } from '@/app/actions/csr-actions';
import Link from 'next/link';
import { ShieldCheck, User, Building2, PenLine, LayoutDashboard, Users, ArrowRight, LogOut, Loader2, BarChart3, FileSpreadsheet, Clock, HelpCircle, Search, Wrench, ClipboardList, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import type { StaffSessionInfo } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationBell } from '@/components/NotificationBell';
import { AnalogClock } from '@/components/AnalogClock';
import { MiniStat } from '@/components/MiniStat';

// ── หน้า hub ของ CSR — จัดวางแบบ "bento grid" เดียวกับ Manager hub (app/admin/manager/page.tsx)
// คงโทนสีเดิมของ CSR ไว้ทั้งหมด (hero indigo, ปุ่มฟอร์มส้ม, จัดการลูกค้ามัสตาร์ด, รายงานเทา)
// แค่ปรับโครงจาก "hero + action grid แยกกัน" มาเป็น "grid เดียวผสมกัน" พร้อมเสียบตัวเลขจริง
// (ลูกค้ารออนุมัติ, ใบงานรอตรวจสอบ) เข้าไปในบาง tile — ดึงจาก getCSRDashboardData() ตัวเดิม
// ที่หน้า dashboard/customers ใช้อยู่แล้ว ไม่เพิ่ม endpoint ใหม่
//
// Download Center เป็น tile ใหม่ที่เพิ่มเข้ามาตาม request — แต่ยัง "อยู่ระหว่างการพัฒนา"
// (placeholder เท่านั้น ไม่ลิงก์ไปไหน) ทำเป็น template ไว้รอออกแบบเนื้อหาจริงภายหลัง
// (ดู pattern เดียวกันที่ Sale hub ใช้กับการ์ด "ศูนย์รายงาน — เร็วๆ นี้")
//
// การ์ด "คำถามที่บอทตอบไม่ได้" ย้ายมาจาก manager hub ตาม request ผู้ใช้ — ใช้ server action
// เดิม (getUnansweredChatbotQuestions ใน manager-actions.ts) เปลี่ยนแค่เกตสิทธิ์ให้ CSR เรียกได้
export default function CsrHubPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffSessionInfo | null>(null);
  const [today, setToday] = useState('');
  const [now, setNow] = useState<Date | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [counts, setCounts] = useState<{
    pendingClients: number; pendingReview: number; unanswered: number;
    totalRequests: number; completed: number; rejected: number;
  } | null>(null);

  useEffect(() => {
    setToday(new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);

  // นาฬิกาเดินตามเวลาจริง ใส่ไว้ในการ์ด "สถานะบัญชี" เป็นลูกเล่นกันการ์ดดูโล่ง — เก็บเป็น Date
  // ดิบๆ ใช้ป้อนทั้งตัวเลขดิจิทัล (24 ชม., hour12:false ตามมาตรฐานที่วางไว้แล้วในระบบ) และมุม
  // เข็มของ AnalogClock จากค่าเดียวกัน ไม่ต้องแยกคำนวณ 2 รอบ — เลือกใช้เวลาปัจจุบันจริงเพราะ
  // เป็นตัวเลขที่ขยับได้ตลอดโดยไม่ต้องเพิ่ม field login time ใหม่ฝั่ง session
  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function loadStaff() {
      const session = await getStaffSession();
      setStaff(session);
    }
    loadStaff();
  }, []);

  // ตัวเลขสรุปสำหรับ tile "การจัดการข้อมูลลูกค้า" / "CSR Dashboard" — โหลดแยกอิสระจาก
  // session ไม่บล็อกการแสดงผลหลัก (tile ที่รอข้อมูลจะโชว์ skeleton pulse ระหว่างนี้แทนตัวเลข)
  useEffect(() => {
    async function loadCounts() {
      const result = await getCSRHubCounts();
      setCounts(
        result.success
          ? {
              pendingClients: result.pendingClients, pendingReview: result.pendingReview,
              unanswered: result.unanswered,
              totalRequests: result.totalRequests, completed: result.completed, rejected: result.rejected,
            }
          : { pendingClients: 0, pendingReview: 0, unanswered: 0, totalRequests: 0, completed: 0, rejected: 0 }
      );
    }
    loadCounts();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutStaffAction();
    router.push('/');
  };

  if (!staff) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#FBF6E8] to-[#F1E7C8]">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-[#E1592A] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-[#2E2B7A]">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  const fmt = (n: number) => n.toLocaleString('th-TH');

  return (
    <div className="relative min-h-screen flex flex-col bg-gradient-to-b from-[#FBF6E8] via-[#F8F2DF] to-[#F1E7C8] overflow-hidden">

      {/* ── พื้นหลังลูกเล่น — แสงกระจายแบบสุ่ม + บลอบใหญ่ให้มิติ ── */}
      <div className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute -top-16 -right-10 w-64 h-64 md:-top-24 md:-right-16 md:w-[420px] md:h-[420px] rounded-full bg-[radial-gradient(circle,_#EAD94C_0%,_transparent_72%)] opacity-40 blur-2xl" />
        <div className="absolute top-[42%] -left-16 w-56 h-56 md:top-[38%] md:-left-28 md:w-[380px] md:h-[380px] rounded-full bg-[radial-gradient(circle,_#E1592A_0%,_transparent_72%)] opacity-[0.15] blur-3xl" />
        <div className="absolute -bottom-20 right-[6%] w-64 h-64 md:-bottom-32 md:w-[460px] md:h-[460px] rounded-full bg-[radial-gradient(circle,_#2E2B7A_0%,_transparent_72%)] opacity-[0.10] blur-3xl" />
        <div className="absolute top-[10%] left-[8%] w-14 h-14 rounded-full bg-[#EAD94C] opacity-[0.12] blur-xl hidden sm:block" />
        <div className="absolute top-[20%] right-[10%] w-10 h-10 rounded-full bg-white opacity-20 blur-lg hidden sm:block" />
        <div className="absolute bottom-[22%] left-[6%] w-16 h-16 rounded-full bg-[#E1592A] opacity-[0.10] blur-xl" />
        <div className="absolute bottom-[8%] right-[12%] w-14 h-14 rounded-full bg-[#EAD94C] opacity-[0.10] blur-xl" />
      </div>

      {/* pb-24 กันเนื้อหาแถวสุดท้ายโดน bottom nav bar (มือถือเท่านั้น, fixed) บังตอนเลื่อนสุด —
           md:pb-8 กลับเป็นค่าปกติบนจอกว้างที่ไม่มี bottom bar */}
      <main className="relative z-10 flex-1 max-w-6xl mx-auto w-full px-6 pt-8 pb-24 md:pb-8 space-y-7">

        {/* ── LOGO & BRAND IDENTITY ── relative z-20: บาร์นี้มี backdrop-blur-md ซึ่งสร้าง
             stacking context ของตัวเอง ถ้าไม่ตั้ง z-index ให้ตัวบาร์เอง มันจะเทียบชั้นกับ
             bento grid ด้านล่าง (ที่ tile แต่ละใบก็มี transform สร้าง stacking context
             เหมือนกัน) ด้วยลำดับ DOM แทน — grid มาทีหลังเลยวาดทับบาร์ทั้งกล่อง ทำให้ dropdown
             ของ NotificationBell (z-50) ที่อยู่ข้างในบาร์นี้ ถูกบังไปด้วยทั้งที่ z-index สูงกว่า
             (z-50 มีผลแค่ภายใน stacking context ของบาร์เอง ไม่ได้เทียบกับข้างนอกโดยตรง) */}
        <div className="relative z-20 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/45 backdrop-blur-md border border-white/50 shadow-[0_4px_20px_-6px_rgba(46,43,122,0.12)] ring-1 ring-white/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#F4E27E] to-[#EAD94C] text-[#241F5E] shadow-md shadow-[#EAD94C]/40 ring-1 ring-white/50">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#241F5E] leading-tight">GPO Xchange</p>
              <p className="text-[10px] text-[#6B6698] leading-tight">Staff Portal · CSR</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell scope="csr" />
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-1.5 text-xs font-bold text-[#6B6698] hover:text-[#E1592A] bg-white/70 hover:bg-[#FBEFE6] border border-white/60 hover:border-[#F0C6AA] px-3.5 py-2 rounded-xl transition-colors disabled:opacity-60 disabled:pointer-events-none"
            >
              {isLoggingOut ? <Loader2 className="w-4 h-5 animate-spin" /> : <LogOut className="w-4 h-5" />}
              ออกจากระบบ
            </button>
          </div>
        </div>

        {/* ══ Bento Grid v2 (ทดลองดีไซน์ใหม่) — เปลี่ยน 3 จุดหลักจากเวอร์ชันเดิม:
             1) การ์ด "สถานะบัญชี" (มีแค่คำว่า Active เฉยๆ ไม่ค่อยมีข้อมูล) ย้ายไปเป็น badge
                เล็กๆ ในตัว hero แทน แทนที่จะกินพื้นที่ทั้ง tile
             2) พื้นที่ที่ว่างขึ้นจากข้อ 1 ให้การ์ด "กรอกแบบฟอร์มแทนลูกค้า" (CTA หลักของหน้านี้)
                ขยายจาก 2×1 เป็น 2×2 เต็มความสูงคู่กับ hero — เน้นเป็น hero action คู่กัน
                ชัดเจนขึ้นแทนที่จะเป็นแค่ปุ่มเล็กๆ ต่อท้ายรายการ
             3) กลุ่มการ์ดเครื่องมือเสริม 4 ใบท้ายกริด เพิ่มหัวข้อกำกับ "เครื่องมือเสริม" แยก
                จากกลุ่มการ์ดงานหลักด้านบนอย่างชัดเจน (แทนที่จะเรียงต่อกันเป็นก้อนเดียวไม่มี
                จุดคั่นให้รู้ว่าเป็นคนละกลุ่มความสำคัญ) ══ */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 md:auto-rows-[128px]">

          {/* Tile: Welcome hero — ใหญ่สุด กว้าง 4/สูง 2 หน่วย โทน indigo เดิมของ CSR — เพิ่ม
               badge สถานะบัญชีเข้ามาในตัว (เดิมแยกเป็นการ์ดของตัวเอง) */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#38339B] via-[#2E2B7A] to-[#211D57] p-6 md:p-7 text-white shadow-2xl shadow-[#1A1740]/50 ring-1 ring-white/10 md:col-span-4 md:row-span-2">
            <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,_white_1px,_transparent_0)] bg-[length:16px_16px]" />
            <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.08] to-transparent" />
            <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-[radial-gradient(circle,_#EAD94C_0%,_transparent_70%)] opacity-60 blur-sm" />
            <div className="absolute -bottom-10 -left-10 w-44 h-44 rounded-full bg-[radial-gradient(circle,_#E1592A_0%,_transparent_70%)] opacity-50 blur-sm" />
            <div className="relative h-full flex flex-col justify-center">
              {/* badge "บัญชี Active" ย้ายออกจาก hero แล้ว — ผู้ใช้เสนอให้แยกเป็นการ์ดเล็ก
                   ต่างหาก (ดู tile "สถานะบัญชี" ถัดไป) เพราะต้นตอปัญหาสีขัดกันคือพื้นหลัง
                   hero เองมี glow ทองที่แรงอยู่แล้ว ไม่ว่าจะปรับสี badge ยังไงก็ยังมีความเสี่ยง
                   ชนกับโทนนั้นอยู่ดี — ย้ายออกไปอยู่การ์ดพื้นขาวเรียบๆ ตัดปัญหาที่ต้นตอเลย */}
              <p className="text-[#EAD94C] text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EAD94C] shadow-[0_0_8px_2px_rgba(234,217,76,0.6)] animate-pulse" /> ยินดีต้อนรับ
              </p>
              <h1 className="text-2xl md:text-3xl font-black leading-tight tracking-tight flex items-center gap-2 drop-shadow-sm">
                สวัสดีคุณ {staff.full_name || staff.username}
                <User className="w-6 h-6 opacity-80" />
              </h1>
              <p className="text-[#D8D5F0] mt-1.5 flex items-center gap-1.5 text-sm">
                <Building2 className="w-4 h-4" /> แผนก CSR (Customer Service)
              </p>
              <p className="text-[#D8D5F0]/90 mt-3 text-sm leading-relaxed">
                ขอให้มีความสุขตลอดการทำงาน ในวันที่สดใส{today && <> {today}</>}
              </p>
            </div>
          </div>

          {/* Tile: สถานะบัญชี — แยกออกมาเป็นการ์ดเล็กของตัวเองอีกครั้งตามที่ผู้ใช้เสนอ (เดิม
               พยายามยัดเป็น badge ในตัว hero แต่พื้นหลัง hero มี glow ทองแรงอยู่แล้ว ปรับสี
               badge ยังไงก็เสี่ยงชนอยู่ดี — ย้ายมาอยู่การ์ดพื้นขาวเรียบๆ ตัดปัญหาที่ต้นตอ)
               ใช้สีทีล + pattern "ping ring" (วงแหวนขยายจางหายซ้อนจุดทึบ) แทนจุด pulse เดิม
               ที่เป็นแค่เขียวมรกตตัน — กว้าง 2/สูง 1 หน่วย
               ★ เพิ่มนาฬิกาเข็ม (AnalogClock ด้านบนของไฟล์) วางคู่ขวามือ + เวลาดิจิทัลกำกับ
               ไว้ใต้สถานะ Active เป็นลูกเล่นกันการ์ดดูโล่ง (ตามที่ผู้ใช้ขอ — เดิมมีแค่เวลา
               ดิจิทัลบรรทัดเดียว ผู้ใช้ชอบแต่อยากได้เป็นนาฬิกาเข็มด้วย) — จัดเป็น flex แนวนอน
               ข้อความชิดซ้าย/นาฬิกาชิดขวา เลือกใช้ "เวลาปัจจุบัน" เพราะเป็นข้อมูลจริงที่มีอยู่
               แล้วไม่ต้องพึ่ง field ใหม่จาก session ต่างจากการนับเวลาตั้งแต่ login ที่ต้องเพิ่ม
               field ฝั่ง server และจะรีเซ็ตให้ดูแปลกๆ ทุกครั้งที่ refresh หน้า
               ★ min-h-[112px] md:min-h-0 — บนมือถือ grid ไม่มี auto-rows บังคับความสูงเหมือน
               md+ (แถวยืดตามเนื้อหาอิสระ) การ์ดนี้เนื้อหาสูงกว่า "กรอกแบบฟอร์มแทนลูกค้า" ข้างล่าง
               อยู่แล้ว (มีนาฬิกาเข็ม 64px) ทำให้ 2 การ์ดสูงไม่เท่ากันตอนเรียงบนมือถือ — ล็อกความ
               สูงขั้นต่ำเท่ากันทั้งคู่ (ดูการ์ดถัดไปด้วย) md:min-h-0 รีเซ็ตทิ้งที่ md+ เพราะ
               md:row-span-1 + auto-rows-[128px] ของ grid หลักคุมความสูงที่แน่นอนอยู่แล้ว */}
          <div className="rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_4px_24px_-8px_rgba(46,43,122,0.15)] ring-1 ring-white/40 p-5 flex items-center justify-between gap-3 min-h-[112px] md:min-h-0 md:col-span-2 md:row-span-1">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B6698] mb-1.5">สถานะบัญชี</p>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-500" />
                </span>
                <span className="text-[#241F5E] font-black text-lg">Active</span>
              </div>
              <p className="text-[11px] text-[#A7A2C4] mt-1.5 font-mono tabular-nums">
                {now ? now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '--:--:--'} น.
              </p>
            </div>
            <AnalogClock now={now} />
          </div>

          {/* Tile: กรอกแบบฟอร์มแทนลูกค้า — featured action กลับมาเป็น 2×1 เท่าเดิม (หลังแยก
               "สถานะบัญชี" กลับมาเป็นการ์ดของตัวเองแล้ว พื้นที่แถวบนไม่พอให้ 2×2 อีกต่อไป) */}
          <Link href="/admin/csr/form" className="group block md:col-span-2 md:row-span-1">
            <div className="relative h-full min-h-[112px] md:min-h-0 rounded-3xl bg-gradient-to-br from-[#EA6A3B] via-[#E1592A] to-[#B84018] shadow-md shadow-[#E1592A]/25 hover:shadow-[0_16px_40px_-12px_rgba(225,89,42,0.55)] transition-all duration-300 overflow-hidden transform hover:-translate-y-0.5 p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20 ring-1 ring-white/30 shrink-0">
                <PenLine className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black text-white">กรอกแบบฟอร์มแทนลูกค้า</h2>
                <p className="text-xs text-white/80 truncate">สร้างคำร้องคืน/แลกเปลี่ยนแทนลูกค้า</p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/80 group-hover:translate-x-1 transition-transform shrink-0" />
            </div>
          </Link>

          {/* Tile: CSR Dashboard — ขยายจาก 2×2 เป็น 4×2 ตามที่ผู้ใช้ขอ เพื่อให้มีที่พอสำหรับ
               แถบมินิสถิติ 5 ช่อง (ทั้งหมด/รอตรวจสอบ/กำลังดำเนินการ/เสร็จสิ้น/ถูกปฏิเสธ —
               ดู MiniStat component ด้านบนของไฟล์) จำลองมาจากชุด StatCard ที่ใช้ในหน้า
               staff-approvals — "การจัดการข้อมูลลูกค้า" ถัดไปเลยหดจาก 2×2 เหลือ 2×2 เท่าเดิม
               แต่ไหลไปอยู่ "ข้าง" การ์ดนี้แทนที่จะอยู่คู่ขนานเท่ากันเหมือนเดิม (grid auto-place
               จัดให้เองจากการขยาย col-span ของการ์ดนี้ ไม่ต้องกำหนดตำแหน่งเอง)
               ตัวเลขหลัก + pill "รอลดหนี้/แลกเปลี่ยน" แบบเดิมตัดออก เพราะข้อมูลซ้ำกับแถบ
               มินิสถิติใหม่แล้ว (รอตรวจสอบ ⊂ แถบใหม่, receiving ⊂ "กำลังดำเนินการ") ประหยัด
               พื้นที่แนวตั้งให้พอใส่แถบสถิติได้โดยไม่ล้น */}
          <Link href="/admin/csr/dashboard" className="group block md:col-span-4 md:row-span-2">
            <div className="relative h-full flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_-8px_rgba(46,43,122,0.12)] hover:shadow-[0_20px_45px_-15px_rgba(46,43,122,0.45)] hover:border-[#2E2B7A]/40 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="absolute top-0 left-6 right-6 h-[3px] rounded-b-full bg-gradient-to-r from-[#2E2B7A] via-[#4A46B0] to-[#2E2B7A] shadow-[0_0_10px_rgba(74,70,176,0.6)]" />
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#4A46B0] to-[#2E2B7A] shadow-md shadow-[#2E2B7A]/30 ring-1 ring-white/20 shrink-0">
                    <LayoutDashboard className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black text-[#241F5E]">CSR Dashboard</h2>
                    <p className="text-xs text-[#6B6698] truncate">ภาพรวมใบงานทุกสถานะ — ตรวจสอบรายการที่รอดำเนินการ</p>
                  </div>
                </div>

                {counts ? (
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    <MiniStat icon={ClipboardList} value={counts.totalRequests} label="ใบงานรวม" iconBg="bg-[#ECEAF6]" iconText="text-[#4A46B0]" />
                    <MiniStat icon={Clock} value={counts.pendingReview} label="รอตรวจสอบ" iconBg="bg-amber-50" iconText="text-amber-600" />
                    <MiniStat
                      icon={RefreshCw}
                      value={Math.max(counts.totalRequests - counts.pendingReview - counts.completed - counts.rejected, 0)}
                      label="กำลังดำเนินการ" iconBg="bg-blue-50" iconText="text-blue-600"
                    />
                    <MiniStat icon={CheckCircle2} value={counts.completed} label="เสร็จสิ้น" iconBg="bg-emerald-50" iconText="text-emerald-600" />
                    <MiniStat icon={XCircle} value={counts.rejected} label="ถูกปฏิเสธ" iconBg="bg-red-50" iconText="text-red-600" />
                  </div>
                ) : (
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)}
                  </div>
                )}

                <span className="mt-auto text-xs font-bold text-[#2E2B7A] flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  ดูรายการที่รอดำเนินการ <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* Tile: การจัดการข้อมูลลูกค้า — กว้าง 2/สูง 2 หน่วย โทนมัสตาร์ด เน้นตัวเลขรออนุมัติ
               (ขนาดเท่าเดิม แค่ไหลไปอยู่ข้าง CSR Dashboard ที่ขยายกว้างขึ้นแทน) */}
          <Link href="/admin/csr/customers" className="group block md:col-span-2 md:row-span-2">
            <div className="relative h-full flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_-8px_rgba(138,116,32,0.12)] hover:shadow-[0_20px_45px_-15px_rgba(234,217,76,0.4)] hover:border-[#EAD94C]/60 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="absolute top-0 left-6 right-6 h-[3px] rounded-b-full bg-gradient-to-r from-[#EAD94C] via-[#F4E27E] to-[#EAD94C] shadow-[0_0_10px_rgba(234,217,76,0.6)]" />
              <div className="p-6 flex-1 flex flex-col">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#F4E27E] to-[#EAD94C] shadow-md shadow-[#EAD94C]/30 ring-1 ring-white/40 mb-3">
                  <Users className="w-5 h-5 text-[#241F5E]" />
                </div>
                {counts ? (
                  <p className="text-[#8A7420] font-black text-3xl leading-none tabular-nums mb-1">{fmt(counts.pendingClients)}</p>
                ) : (
                  <Skeleton className="h-8 w-14 mb-1" />
                )}
                <h2 className="text-sm font-black text-[#241F5E] mb-1">การจัดการข้อมูลลูกค้า</h2>
                <p className="text-xs text-[#6B6698] mb-4">ลูกค้าใหม่รออนุมัติ — ตรวจสอบและกำหนดรหัสลูกค้า</p>
                <span className="mt-auto text-xs font-bold text-[#8A7420] flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  ดูลูกค้าที่รออนุมัติ <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* ── Panel "เครื่องมือเสริม" (รอบ 2) — เดิมใช้แค่ label เล็ก+เส้นบางๆ ผู้ใช้ feedback
               ว่าอ่านไม่ชัด ไม่โดดเด่น กลัวเลื่อนผ่านแล้วไม่เจอ — เปลี่ยนมาห่อทั้งกลุ่มด้วย panel
               ที่มีพื้นหลัง/ขอบของตัวเอง (ไม่ใช่การ์ดลอยเดี่ยวๆ บนพื้นหลังหน้าเว็บเหมือนเดิม) ให้
               เป็น "โซนที่จับต้องได้" ชัดเจนขณะเลื่อนผ่าน พร้อม header ทรง icon-chip + h2 +
               subtitle ตาม pattern เดียวกับหน้าอื่นในระบบ (staff-approvals, /admin/manager/sla)
               แทนที่จะเป็น label ทรงใหม่ที่ไม่มีที่ไหนในแอปใช้มาก่อน — md:col-span-6 กินเต็ม
               ความกว้าง 6 คอลัมน์เสมอ ภายในเป็น grid ของตัวเอง (2 คอลัมน์มือถือ / 4 คอลัมน์
               จอกว้าง) ไม่ต้องพึ่ง md:contents hack แบบเดิมแล้วเพราะไม่ได้ร่วม flow กับ bento
               grid หลักโดยตรงอีกต่อไป — ไอคอนแต่ละใบย้ายขึ้นด้านบน (แนวตั้ง) แทนแนวนอน ให้
               กวาดตาเจอง่ายขึ้นตอนมี 4 ใบเรียงในแถวเดียว — hidden md:block: บนมือถือซ่อน
               panel นี้ทั้งก้อน เปลี่ยนไปใช้ bottom nav bar แบบ fixed แทน (ดูท้ายไฟล์) ตาม
               ที่ผู้ใช้เสนอ เพราะแก้ปัญหา "เลื่อนผ่านแล้วไม่เจอ" ได้เด็ดขาดกว่า (bar ไม่เลื่อน
               หายไปไหนเลย) — จอกว้างยังคงเห็น panel เดิมตามปกติ ไม่มี bottom bar
               ★ md:row-span-2 (แก้บั๊ก) — auto-rows-[128px] ของ grid หลักเป็น track ขนาดตายตัว
               ไม่ยืดตามเนื้อหา ถ้า panel นี้กิน row เดียว (128px) แต่เนื้อหาจริง (header +
               grid การ์ด 4 ใบสูง min-h-[128px] แต่ละใบ + padding) สูงกว่านั้นมาก มันจะ "ล้น"
               ออกนอก track ไปทับ footer ที่อยู่ถัดไปในหน้า (เจอจริงจากการทดสอบ) — ให้ 2 rows
               (~272px รวม gap) เผื่อพื้นที่พอสำหรับเนื้อหาจริงแทน */}
          <div className="hidden md:block md:col-span-6 md:row-span-2 rounded-3xl bg-white/40 backdrop-blur-md border border-white/50 shadow-[0_4px_20px_-8px_rgba(107,102,152,0.1)] p-5 md:p-6">
            <div className="flex items-center gap-2.5 mb-4 px-1">
              <div className="w-9 h-9 rounded-xl bg-[#ECEAF6] ring-1 ring-white/50 flex items-center justify-center shrink-0">
                <Wrench className="w-4 h-4 text-[#6B6698]" />
              </div>
              <div>
                <h2 className="text-sm font-black text-[#241F5E]">เครื่องมือเสริม</h2>
                <p className="text-xs text-[#6B6698]">ทางลัดไปเครื่องมือและรายงานที่ใช้บ่อย</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
              {/* Tile: Download Center — placeholder "อยู่ระหว่างการพัฒนา" ตาม request ผู้ใช้
                   (ยังไม่ลิงก์ไปไหน เป็น template รอออกแบบเนื้อหาจริงภายหลัง) */}
              <div className="relative rounded-2xl bg-white/60 border border-dashed border-[#C9C4E0]/70 opacity-80 overflow-hidden p-4 flex flex-col gap-2 min-h-[128px]">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#F1EDE0] ring-1 ring-white/50 shrink-0">
                  <FileSpreadsheet className="w-4 h-4 text-[#6B6698]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-black text-[#241F5E]">Download Center</h3>
                  <p className="text-[10px] text-[#A7A2C4] leading-snug mt-0.5">อยู่ระหว่างการพัฒนา</p>
                </div>
              </div>

              {/* Tile: ศูนย์รายงาน (Report Center) */}
              <Link href="/admin/csr/reports" className="group block">
                <div className="h-full rounded-2xl bg-white/70 border border-white/60 hover:border-[#6B6698]/40 hover:shadow-[0_10px_24px_-12px_rgba(107,102,152,0.4)] transition-all duration-300 p-4 flex flex-col gap-2 min-h-[128px]">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#ECEAF6] ring-1 ring-white/50 shrink-0">
                    <BarChart3 className="w-4 h-4 text-[#6B6698]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-black text-[#241F5E]">Report Center</h3>
                    <p className="text-[10px] text-[#6B6698] mt-0.5">Visual Dashboard</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-[#6B6698] group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              {/* Tile: คำถามที่บอทตอบไม่ได้ — เน้นตัวเลขค้างทบทวน (ย้ายมาจาก manager hub) */}
              <Link href="/admin/csr/chatbot" className="group block">
                <div className="h-full rounded-2xl bg-white/70 border border-white/60 hover:border-[#6B6698]/40 hover:shadow-[0_10px_24px_-12px_rgba(107,102,152,0.4)] transition-all duration-300 p-4 flex flex-col gap-2 min-h-[128px]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#ECEAF6] ring-1 ring-white/50 shrink-0">
                      <HelpCircle className="w-4 h-4 text-[#6B6698]" />
                    </div>
                    {!!counts?.unanswered && (
                      <span className="text-[9px] font-bold text-white bg-[#6B6698] px-1.5 py-0.5 rounded-full shrink-0">{fmt(counts.unanswered)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-black text-[#241F5E]">Follow-up Question</h3>
                    <p className="text-[10px] text-[#6B6698] mt-0.5 leading-snug">ทบทวนคำถาม &quot;เพื่อพัฒนา chat-AI&quot;</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-[#6B6698] group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              {/* Tile: Track & Trace — เข้าชุดกับการ์ดเดียวกันบน manager hub */}
              <Link href="/admin/csr/tracking" className="group block">
                <div className="h-full rounded-2xl bg-white/70 border border-white/60 hover:border-teal-500/40 hover:shadow-[0_10px_24px_-12px_rgba(13,148,136,0.4)] transition-all duration-300 p-4 flex flex-col gap-2 min-h-[128px]">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-teal-400 to-teal-600 shadow-sm shadow-teal-600/30 ring-1 ring-white/30 shrink-0">
                    <Search className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-black text-[#241F5E]">Track & Trace</h3>
                    <p className="text-[10px] text-[#6B6698] mt-0.5">ติดตามสถานะ</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-teal-600 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* ══ Bottom nav bar — เฉพาะมือถือ (md:hidden), fixed เกาะขอบล่างจอเสมอ ══
           แทนที่ panel "เครื่องมือเสริม" บนมือถือตามที่ผู้ใช้เสนอ — แก้ปัญหา "เลื่อนผ่านแล้ว
           ไม่เจอ" เด็ดขาดกว่า label/panel เพราะ bar นี้ไม่เลื่อนหายไปไหนเลย อยู่ติดขอบล่าง
           ตลอดเวลาไม่ว่าจะเลื่อนหน้าไปถึงไหน — เอาเฉพาะ 3 ทางลัดที่ใช้งานได้จริง (ไม่รวม
           Download Center ที่ยังเป็นแค่ placeholder "อยู่ระหว่างการพัฒนา" ไม่คุ้มเปลืองที่ในแถบ
           ที่มีพื้นที่จำกัด — ยังดูได้จากหน้าจอกว้างในตัว panel เดิม)
           z-30 ต่ำกว่า NotificationBell drawer (z-50) เสมอ กันไม่ให้บังตอนเปิดกระดิ่ง —
           safe-area-inset-bottom กันแถบ home indicator ของ iPhone บังปุ่มล่างสุด ══ */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/85 backdrop-blur-xl border-t border-white/60 shadow-[0_-4px_20px_-8px_rgba(46,43,122,0.15)] px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-3 gap-1 max-w-md mx-auto">
          <Link href="/admin/csr/reports" className="flex flex-col items-center gap-1 py-1.5 rounded-xl text-[#6B6698] active:bg-slate-100 transition-colors">
            <BarChart3 className="w-5 h-5" />
            <span className="text-[10px] font-bold">รายงาน</span>
          </Link>
          <Link href="/admin/csr/chatbot" className="flex flex-col items-center gap-1 py-1.5 rounded-xl text-[#6B6698] active:bg-slate-100 transition-colors">
            <span className="relative">
              <HelpCircle className="w-5 h-5" />
              {!!counts?.unanswered && (
                <span className="absolute -top-1 -right-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[#6B6698] px-1 text-[8px] font-bold text-white ring-2 ring-white">
                  {counts.unanswered > 9 ? '9+' : counts.unanswered}
                </span>
              )}
            </span>
            <span className="text-[10px] font-bold">คำถามบอท</span>
          </Link>
          <Link href="/admin/csr/tracking" className="flex flex-col items-center gap-1 py-1.5 rounded-xl text-teal-700 active:bg-teal-50 transition-colors">
            <Search className="w-5 h-5" />
            <span className="text-[10px] font-bold">ติดตาม</span>
          </Link>
        </div>
      </nav>

      <footer className="relative mt-4 py-5 px-6 text-center border-t border-[#EADFAF]">
        <div className="absolute left-1/2 -translate-x-1/2 -top-px w-16 h-px bg-gradient-to-r from-transparent via-[#EAD94C] to-transparent" />
        <p className="text-[11px] text-[#6B6698]">© 2026 <span className="font-bold text-[#E1592A]">GPO Xchange Portal</span> • องค์การเภสัชกรรม สาขาภาคใต้ &nbsp;|&nbsp; Staff Portal</p>
      </footer>
    </div>
  );
}
