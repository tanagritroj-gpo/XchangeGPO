'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStaffSession, logoutStaffAction } from '@/app/actions/auth-staff';
import { getSaleCustomerHistory } from '@/app/actions/sale-actions';
import Link from 'next/link';
import { TrendingUp, User, MapPin, History, Eye, ArrowRight, LogOut, Loader2, BarChart3, Receipt, ArrowLeftRight, ClipboardCheck, PackageSearch, Truck, Warehouse, CheckCircle2 } from 'lucide-react';
import { SALE_CUSTOMER_TYPE_OPTIONS } from '@/lib/sale-coverage';
import type { StaffSessionInfo } from '@/lib/types';
import { NotificationBell } from '@/components/NotificationBell';
import { AnalogClock } from '@/components/AnalogClock';
import { Skeleton } from '@/components/ui/skeleton';
import { MiniStat } from '@/components/MiniStat';

// ── หน้า hub ของ Sale — จัดวางแบบ "bento grid" เดียวกับ CSR hub (app/admin/csr/page.tsx):
// hero (4×2) + tile "สถานะบัญชี" พร้อมนาฬิกาเข็ม (2×1) + tile "ขอบเขตที่ดูแล" (2×1, แยกออก
// จาก hero เดิมที่เคยฝังไว้ด้วยกัน — ตัดปัญหาเดียวกับที่ CSR เจอ คือพื้นหลัง hero มี glow
// ทองอยู่แล้ว ยัดเนื้อหาเพิ่มเข้าไปจะดูอึดอัด) แล้วปิดท้ายด้วยการ์ดลิงก์ 3 ใบเท่ากัน (2×2 ต่อใบ):
// "Active Workflow", "ประวัติการแลกเปลี่ยน", "ศูนย์รายงาน" — ★ Active Workflow เดิมฝังบอร์ดตรง
// ในหน้า hub เลย แต่ผู้ใช้ขอให้แยกเป็นการ์ดกดเข้าไปดูแทน (เหมือน "ประวัติการแลกเปลี่ยน") จึงย้าย
// ไปเป็นหน้าแยก app/admin/sale/workflow/page.tsx
export default function SaleHubPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffSessionInfo | null>(null);
  const [today, setToday] = useState('');
  const [now, setNow] = useState<Date | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    setToday(new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);

  // นาฬิกาเดินตามเวลาจริง — pattern เดียวกับ CSR hub (app/admin/csr/page.tsx) ใช้เวลาปัจจุบัน
  // จริงเพราะเป็นตัวเลขที่ขยับได้ตลอดโดยไม่ต้องเพิ่ม field login time ใหม่ฝั่ง session
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

  // ตัวเลขสรุปสำหรับการ์ด "Active Workflow"/"ประวัติใบงาน" — ใช้ getSaleCustomerHistory() ตัว
  // เดียวกับที่ SaleActiveWorkflow ใช้ (ยิงแยกกันคนละหน้า ไม่ผูก state ร่วม เหมือน pattern
  // getCSRHubCounts ของ CSR hub ที่แยกอิสระจาก getCSRDashboardData) — โหลดแยกไม่บล็อกหน้าหลัก
  // debtReduction/exchange นับตาม request_type ("รับคืนลดหนี้"/"รับคืนแลกเปลี่ยน") ไม่รวม
  // "รับคืน CCR" เพราะการ์ดนี้โชว์แค่ 2 ประเภทหลักตามที่ผู้ใช้ขอ
  const [counts, setCounts] = useState<{ total: number; active: number; debtReduction: number; exchange: number } | null>(null);
  useEffect(() => {
    async function loadCounts() {
      const data = await getSaleCustomerHistory();
      const rows: { current_status: string; request_type: string | null }[] = data ?? [];
      const active = rows.filter((r) => !['completed', 'rejected'].includes(r.current_status)).length;
      const debtReduction = rows.filter((r) => r.request_type === 'รับคืนลดหนี้').length;
      const exchange = rows.filter((r) => r.request_type === 'รับคืนแลกเปลี่ยน').length;
      setCounts({ total: rows.length, active, debtReduction, exchange });
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

  const customerTypeLabels = (staff.sale_customer_types ?? []).map(
    (v: string) => SALE_CUSTOMER_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v,
  );
  const provinces: string[] = staff.sale_provinces ?? [];

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

      <main className="relative z-10 flex-1 max-w-6xl mx-auto w-full px-6 py-8 space-y-7">

        {/* ── LOGO & BRAND IDENTITY ── */}
        <div className="relative z-20 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/45 backdrop-blur-md border border-white/50 shadow-[0_4px_20px_-6px_rgba(46,43,122,0.12)] ring-1 ring-white/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#F4E27E] to-[#EAD94C] text-[#241F5E] shadow-md shadow-[#EAD94C]/40 ring-1 ring-white/50">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#241F5E] leading-tight">GPO Xchange</p>
              <p className="text-[10px] text-[#6B6698] leading-tight">Staff Portal · Sale</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell scope="sale" />
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

        {/* ══ Bento Grid — 6 คอลัมน์ เท่ากับ CSR hub ══ auto-rows เป็น minmax(128px,auto) แทน
             128px ตายตัว — ให้ tile "ขอบเขตที่ดูแล" ขยายสูงได้เองถ้ามีชิปเยอะ (โชว์ครบทุกอัน
             ไม่ตัด +N) โดยไม่กระทบ tile อื่นที่เนื้อหาพอดี 128px อยู่แล้ว (minmax ไม่ทำอะไรกับ
             row ที่เนื้อหาไม่เกิน min อยู่แล้ว) */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 md:auto-rows-[minmax(128px,auto)]">

          {/* Tile: Welcome hero — 4×2 โทน indigo เดียวกับ CSR (ตัด "ขอบเขตที่ดูแล" ออกไปเป็น
               tile ของตัวเองแล้ว ดู tile ถัดไป) */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#38339B] via-[#2E2B7A] to-[#211D57] p-6 md:p-7 text-white shadow-2xl shadow-[#1A1740]/50 ring-1 ring-white/10 md:col-span-4 md:row-span-2">
            <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,_white_1px,_transparent_0)] bg-[length:16px_16px]" />
            <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.08] to-transparent" />
            <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-[radial-gradient(circle,_#EAD94C_0%,_transparent_70%)] opacity-60 blur-sm" />
            <div className="absolute -bottom-10 -left-10 w-44 h-44 rounded-full bg-[radial-gradient(circle,_#E1592A_0%,_transparent_70%)] opacity-50 blur-sm" />
            <div className="relative h-full flex flex-col justify-center">
              <p className="text-[#EAD94C] text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EAD94C] shadow-[0_0_8px_2px_rgba(234,217,76,0.6)] animate-pulse" /> ยินดีต้อนรับ
              </p>
              <h1 className="text-2xl md:text-3xl font-black leading-tight tracking-tight flex items-center gap-2 drop-shadow-sm">
                สวัสดีคุณ {staff.full_name || staff.username}
                <User className="w-6 h-6 opacity-80" />
              </h1>
              <p className="text-[#D8D5F0] mt-1.5 flex items-center gap-1.5 text-sm">
                <TrendingUp className="w-4 h-4" /> แผนก Sale (พนักงานขาย)
              </p>
              <p className="text-[#D8D5F0]/90 mt-3 text-sm leading-relaxed">
                ขอให้มีความสุขตลอดการทำงาน ในวันที่สดใส{today && <> {today}</>}
              </p>
            </div>
          </div>

          {/* wrapper คู่ "สถานะบัญชี" + "ขอบเขตที่ดูแล" — บนมือถือ grid หลักมีคอลัมน์เดียว
               (grid-cols-1) ทำให้ทั้งสอง tile (เดิม col-span-2 มีผลแค่ md+) เรียงชิดกันตาม
               ธรรมชาติแต่ยืดเต็มความกว้างจอทีละใบ ดูโล่งเพราะเนื้อหาน้อยแต่กว้างเกินไป —
               ครอบด้วย wrapper ที่เป็น grid-cols-2 เฉพาะช่วง base (มือถือ) ให้ทั้งคู่อยู่แถว
               เดียวกันแทน ส่วน md+ ใช้ "md:contents" ถอด wrapper ออกจาก layout (ลูกกลับไปเป็น
               grid item ตรงของ grid หลักเหมือนเดิมทุกอย่าง ไม่กระทบตำแหน่งบนจอกว้างเลย) */}
          <div className="grid grid-cols-2 gap-4 md:contents">
            {/* Tile: สถานะบัญชี — 2×1 พร้อมนาฬิกาเข็ม เหมือน CSR hub เป๊ะ (AnalogClock component
                 กลางตัวเดียวกัน) */}
            <div className="rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_4px_24px_-8px_rgba(46,43,122,0.15)] ring-1 ring-white/40 p-4 md:p-5 flex flex-col md:flex-row items-center md:items-center justify-center md:justify-between gap-2 md:gap-3 min-h-[112px] md:min-h-0 md:col-span-2 md:row-span-1">
              <div className="min-w-0 text-center md:text-left">
                <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-wide text-[#6B6698] mb-1 md:mb-1.5">สถานะบัญชี</p>
                <div className="flex items-center justify-center md:justify-start gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-500" />
                  </span>
                  <span className="text-[#241F5E] font-black text-base md:text-lg">Active</span>
                </div>
                <p className="text-[10px] md:text-[11px] text-[#A7A2C4] mt-1 md:mt-1.5 font-mono tabular-nums">
                  {now ? now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '--:--:--'} น.
                </p>
              </div>
              <AnalogClock now={now} />
            </div>

            {/* Tile: ขอบเขตที่ดูแล — 2×1 แยกออกมาจาก hero เดิม (ประเภทลูกค้า + จังหวัดที่ดูแล) —
                 เพิ่ม icon chip gradient เหลืองด้านซ้าย ให้ระดับความหรูเท่า tile อื่น (เดิมมีแค่
                 ไอคอนเล็กลอยเดี่ยวๆ ไม่มี chip เหมือนจุดอื่นในหน้า ดูจืดกว่าจุดอื่น) — ไม่มี accent
                 bar ด้านบนแล้ว (ตามที่ผู้ใช้ขอให้เอาออก) */}
            <div className="relative rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_4px_24px_-8px_rgba(46,43,122,0.15)] ring-1 ring-white/40 overflow-hidden p-3 md:p-4 flex flex-col md:flex-row gap-2 md:gap-3 min-h-[112px] md:min-h-0 md:col-span-2 md:row-span-1">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#F4E27E] to-[#EAD94C] shadow-sm shadow-[#EAD94C]/40 ring-1 ring-white/50 shrink-0 mt-0.5 mx-auto md:mx-0">
                <MapPin className="w-4 h-4 text-[#241F5E]" strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1 flex flex-col justify-center gap-2">
                {/* ★ โชว์ครบทุกรายการ ไม่ตัด +N แล้ว (ตามที่ผู้ใช้ขอ) — customerTypeLabels
                     มีได้สูงสุดแค่ 2 ค่าอยู่แล้วจริงๆ (ดู SALE_CUSTOMER_TYPE_OPTIONS ใน
                     lib/sale-coverage.ts) ส่วน provinces อาจมีหลายจังหวัดจึงเป็นตัวที่ยาวได้
                     จริง — โทนเหลืองตามที่ผู้ใช้ขอ (เดิม indigo ให้ตัดกับ "จังหวัด" โทนส้ม)
                     ★ label แยกขึ้นบรรทัดของตัวเองแทนการวางรวมไว้ในแถว flex-wrap เดียวกับชิป
                     (เดิม label กับชิปตัวแรกๆ แย่งพื้นที่บรรทัดแรกกัน พอชิปเยอะ/จอแคบ (มือถือ)
                     จะ wrap ไม่สม่ำเสมอ ดูไม่เป็นระเบียบ ตามที่ผู้ใช้ทักมา) — แยกบรรทัดแล้วให้
                     ชิปทุกตัว wrap ชิดซ้ายเป็นบล็อกของตัวเอง อ่านง่ายกว่าทุกความกว้างจอ */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-[#6B6698] mb-1">ประเภท</p>
                  <div className="flex flex-wrap gap-1">
                    {customerTypeLabels.length > 0 ? (
                      customerTypeLabels.map((label: string) => (
                        <span key={label} className="text-[10px] font-bold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md">{label}</span>
                      ))
                    ) : <span className="text-[10px] text-[#A7A2C4]">ยังไม่ได้กำหนด</span>}
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-[#6B6698] mb-1">จังหวัด</p>
                  <div className="flex flex-wrap gap-1">
                    {provinces.length > 0 ? (
                      provinces.map((p) => (
                        <span key={p} className="text-[10px] font-bold bg-[#FBEFE6] text-[#E1592A] px-1.5 py-0.5 rounded-md">{p}</span>
                      ))
                    ) : <span className="text-[10px] text-[#A7A2C4]">ยังไม่ได้กำหนด</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tile: Active Workflow — 2×2 การ์ดลิงก์ไปหน้าบอร์ดแยก (app/admin/sale/workflow) */}
          <Link href="/admin/sale/workflow" className="group block md:col-span-2 md:row-span-2">
            <div className="relative h-full flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_-8px_rgba(46,43,122,0.12)] hover:shadow-[0_20px_45px_-15px_rgba(79,70,229,0.35)] hover:border-indigo-400/50 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="absolute top-0 left-6 right-6 h-[3px] rounded-b-full bg-gradient-to-r from-indigo-400 via-indigo-600 to-[#2E2B7A] shadow-[0_0_10px_rgba(79,70,229,0.5)]" />
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-md shadow-indigo-600/30 ring-1 ring-white/20 shrink-0">
                    <Eye className="w-5 h-5 text-white" />
                  </div>
                  {counts ? (
                    <p className="text-indigo-600 font-black text-2xl leading-none tabular-nums">{counts.active.toLocaleString('th-TH')}</p>
                  ) : (
                    <Skeleton className="h-7 w-10" />
                  )}
                </div>
                <h2 className="text-sm font-black text-[#241F5E]">Active Workflow</h2>
                <p className="text-xs text-[#6B6698] mt-1">ใบงานกำลังดำเนินการในพื้นที่ดูแลของคุณ</p>

                {/* แถบไอคอนขั้นตอนเป็นของตกแต่งล้วนๆ (ไม่ใช่ stepper ที่คำนวณสถานะจริง) — แสดง
                     ภาพรวม pipeline ตั้งแต่รับคำร้องจนอนุมัติ ให้การ์ดดูมีชีวิตชีวาขึ้น ตามที่
                     ผู้ใช้ขอ (แนบภาพตัวอย่างมา) ปรับโทนสีให้เข้ากับ indigo ของการ์ดนี้แทนโทนทีล
                     ในภาพตัวอย่าง ให้เข้ากับส่วนอื่นของหน้า */}
                <div className="flex items-center justify-center gap-0.5 my-4">
                  {[ClipboardCheck, PackageSearch, Truck, Warehouse, CheckCircle2].map((Icon, i, arr) => (
                    <div key={i} className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center ring-1 ring-indigo-100 shadow-sm shrink-0">
                        <Icon className="w-3.5 h-3.5 text-indigo-600" strokeWidth={2.5} />
                      </div>
                      {i < arr.length - 1 && (
                        <div className="w-2.5 sm:w-3 h-0 border-t-2 border-dotted border-indigo-200 mx-0.5 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>

                <span className="mt-auto text-xs font-bold text-indigo-600 flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  ดูภาพรวมใบงาน <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* Tile: ประวัติใบงาน — 2×2 การ์ดลิงก์ (เดิมชื่อ "ประวัติการแลกเปลี่ยน" เปลี่ยนตามที่
               ผู้ใช้ขอ — ครอบคลุมคำร้องทุกประเภทไม่ใช่แค่แลกเปลี่ยน ชื่อเดิมจึงแคบเกินจริง) */}
          <Link href="/admin/sale/history" className="group block md:col-span-2 md:row-span-2">
            <div className="relative h-full flex flex-col bg-white/70 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_-8px_rgba(46,43,122,0.12)] hover:shadow-[0_20px_45px_-15px_rgba(225,89,42,0.4)] hover:border-[#E1592A]/40 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="absolute top-0 left-6 right-6 h-[3px] rounded-b-full bg-gradient-to-r from-[#EAD94C] via-[#E1592A] to-[#2E2B7A] shadow-[0_0_10px_rgba(225,89,42,0.5)]" />
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#EA6A3B] to-[#C9481E] shadow-md shadow-[#E1592A]/30 ring-1 ring-white/20 shrink-0">
                    <History className="w-5 h-5 text-white" />
                  </div>
                  {counts ? (
                    <p className="text-[#E1592A] font-black text-2xl leading-none tabular-nums">{counts.total.toLocaleString('th-TH')}</p>
                  ) : (
                    <Skeleton className="h-7 w-10" />
                  )}
                </div>
                <h2 className="text-sm font-black text-[#241F5E]">ประวัติใบงาน</h2>
                <p className="text-xs text-[#6B6698] mt-1">แสดงเฉพาะข้อมูลลูกค้าในพื้นที่ดูแลรับผิดชอบของคุณ</p>

                {/* mini stat แยกตามประเภทคำร้อง 2 ประเภทหลักที่ sale ต้องติดตามบ่อยที่สุด —
                     div เฉยๆ ไม่ใช่ button จริง เพราะทั้งการ์ดถูกห่อด้วย Link ไปหน้ารายละเอียด
                     แล้ว ซ้อน button คลิกได้จริงเข้าไปอีกชั้นจะผิด HTML semantics (pattern
                     เดียวกับ MiniStat ที่ CSR hub ใช้ในการ์ด "CSR Dashboard") */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {counts ? (
                    <>
                      <MiniStat icon={Receipt} value={counts.debtReduction} label="รับคืนลดหนี้" iconBg="bg-[#FBEFE6]" iconText="text-[#E1592A]" />
                      <MiniStat icon={ArrowLeftRight} value={counts.exchange} label="รับคืนแลกเปลี่ยน" iconBg="bg-[#ECEAF6]" iconText="text-[#2E2B7A]" />
                    </>
                  ) : (
                    <>
                      <Skeleton className="h-[68px] rounded-xl" />
                      <Skeleton className="h-[68px] rounded-xl" />
                    </>
                  )}
                </div>

                <span className="mt-auto pt-3 text-xs font-bold text-[#E1592A] flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  ดูประวัติใบงาน <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* Tile: ศูนย์รายงาน — 2×2 ยังเป็น placeholder เหมือนเดิม (รอพัฒนาต่อ) */}
          <div className="md:col-span-2 md:row-span-2 h-full min-h-[128px] flex flex-col bg-white/60 backdrop-blur-xl rounded-3xl border border-dashed border-white/60 opacity-70 overflow-hidden">
            <div className="p-6 flex-1 flex flex-col">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[#F1EDE0] shrink-0 mb-3">
                <BarChart3 className="w-5 h-5 text-[#6B6698]" />
              </div>
              <h2 className="text-sm font-black text-[#241F5E] flex items-center gap-2 flex-wrap">
                ศูนย์รายงาน (Report Center)
                <span className="text-[9px] font-bold uppercase tracking-wide bg-[#F1EDE0] text-[#6B6698] px-2 py-0.5 rounded-full">เร็วๆ นี้</span>
              </h2>
              <p className="text-xs text-[#6B6698] mt-1">สรุปสถิติยอดขาย/คำร้องของลูกค้าที่ดูแล — อยู่ระหว่างการพัฒนา</p>
              <div className="mt-auto flex items-center justify-center rounded-2xl text-xs text-[#A7A2C4] bg-[#F1EDE0] border-2 border-dashed border-[#EADFAF] py-4">
                กำลังพัฒนา
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative mt-4 py-5 px-6 text-center border-t border-[#EADFAF]">
        <div className="absolute left-1/2 -translate-x-1/2 -top-px w-16 h-px bg-gradient-to-r from-transparent via-[#EAD94C] to-transparent" />
        <p className="text-[11px] text-[#6B6698]">© 2026 <span className="font-bold text-[#E1592A]">GPO Xchange Portal</span> • องค์การเภสัชกรรม สาขาภาคใต้ &nbsp;|&nbsp; Staff Portal</p>
      </footer>
    </div>
  );
}
