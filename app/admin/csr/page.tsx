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

// ── หน้า hub ของ CSR — จัดวางแบบ "bento grid" เดียวกับ Manager/Sale hub — ตัวเลขจริง
// (ลูกค้ารออนุมัติ, ใบงานรอตรวจสอบ, คำถามบอทค้าง) ดึงจาก getCSRHubCounts() ตัวเดิม
//
// ★ ปรับสไตล์ตาม "Option B — Institutional Green" (design.md, ทำแบบเดียวกับหน้า Manager/Sale):
// เลิกให้แต่ละ tile คิดสีของตัวเอง (เดิม indigo hero/ส้ม CTA/มัสตาร์ดลูกค้า/ทีล tracking ปนกัน)
// เหลือ accent เดียวคือสีเขียวแบรนด์ผ่าน CSS variable กลาง — ตัดพื้นหลัง blob ไล่เฉด, noise
// texture, glassmorphism และ pulse ที่เป็นแค่ของตกแต่งออก — radius เหลือ 2 ระดับ
// (rounded-md/rounded-lg) เนื้อหา/ลิงก์/logic การโหลดข้อมูลไม่เปลี่ยนจากเดิม
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

  // นาฬิกาเดินตามเวลาจริง — pattern เดียวกับ Manager/Sale hub
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
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-primary">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  const fmt = (n: number) => n.toLocaleString('th-TH');

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* pb-24 กันเนื้อหาแถวสุดท้ายโดน bottom nav bar (มือถือเท่านั้น, fixed) บังตอนเลื่อนสุด */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 md:px-6 pt-6 pb-24 md:pb-8 space-y-6">

        {/* ── LOGO & BRAND IDENTITY ── */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md flex items-center justify-center bg-primary text-primary-foreground">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">GPO Xchange</p>
              <p className="text-[11px] text-muted-foreground leading-tight">Staff Portal · CSR</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell scope="csr" />
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary border border-border px-4 py-2.5 rounded-md transition-colors disabled:opacity-60 disabled:pointer-events-none"
            >
              {isLoggingOut ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
              ออกจากระบบ
            </button>
          </div>
        </div>

        {/* ══ Bento Grid — 6 คอลัมน์ เท่ากับ Manager/Sale hub ══ */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 md:auto-rows-[128px]">

          {/* Tile: Welcome hero — ใหญ่สุด กว้าง 4/สูง 2 หน่วย พื้นสีเขียวแบรนด์ทึบ — glow วงกลม
               เดียวโทนเดียวกับพื้นมุมขวาบน + แถบสรุปตัวเลขด่วนด้านล่าง (ดึงจาก counts ที่
               fetch ไว้แล้วสำหรับ tile อื่นอยู่แล้ว) กันพื้นที่ว่างโล่งเกินไป */}
          <div className="relative overflow-hidden rounded-lg bg-primary p-6 md:p-7 text-primary-foreground md:col-span-4 md:row-span-2">
            <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary-foreground/10 blur-2xl pointer-events-none" />
            <div className="relative h-full flex flex-col justify-center">
              <p className="text-primary-foreground/70 text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground/70" /> ยินดีต้อนรับ
              </p>
              <h1 className="text-2xl md:text-3xl font-bold leading-tight tracking-tight flex items-center gap-2">
                สวัสดีคุณ {staff.full_name || staff.username}
                <User className="w-6 h-6 opacity-80" />
              </h1>
              <p className="text-primary-foreground/85 mt-1.5 flex items-center gap-1.5 text-sm">
                <Building2 className="w-4 h-4" /> แผนก CSR (Customer Service)
              </p>
              <p className="text-primary-foreground/75 mt-3 text-sm leading-relaxed">
                ขอให้มีความสุขตลอดการทำงาน ในวันที่สดใส{today && <> {today}</>}
              </p>

              <div className="mt-6 pt-5 border-t border-primary-foreground/15 flex items-center gap-6 md:gap-8">
                <div>
                  <p className="text-2xl md:text-3xl font-bold tabular-nums leading-none">
                    {counts ? fmt(counts.totalRequests) : '—'}
                  </p>
                  <p className="text-[11px] text-primary-foreground/70 uppercase tracking-wide mt-1">ใบงานทั้งหมดในระบบ</p>
                </div>
                <div className="w-px h-9 bg-primary-foreground/20 shrink-0" />
                <div>
                  <p className="text-2xl md:text-3xl font-bold tabular-nums leading-none">
                    {counts ? fmt(counts.pendingReview) : '—'}
                  </p>
                  <p className="text-[11px] text-primary-foreground/70 uppercase tracking-wide mt-1">รอตรวจสอบ</p>
                </div>
                <Link
                  href="/admin/csr/dashboard"
                  className="ml-auto hidden sm:flex items-center gap-1.5 text-xs font-semibold text-primary-foreground/90 hover:text-primary-foreground bg-primary-foreground/10 hover:bg-primary-foreground/15 px-3.5 py-2 rounded-md transition-colors shrink-0"
                >
                  ดูภาพรวม <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {/* Tile คู่: สถานะบัญชี + บัญชีผู้ใช้ — เดิมลองรวมไว้การ์ดเดียวกันคั่นด้วยเส้นแบ่ง
               ผู้ใช้ขอให้แยกเป็นคนละการ์ดชัดเจนแต่จัดวางติดกัน จึงยังอยู่ grid slot เดิม
               (md:col-span-2 md:row-span-1) แค่ข้างในเปลี่ยนจาก 1 การ์ดเป็น flex 2 การ์ดแยก */}
          <div className="flex items-stretch gap-3 min-h-[112px] md:min-h-0 md:col-span-2 md:row-span-1">
            {/* Card: สถานะบัญชี — นาฬิกาเข็ม + เวลาดิจิทัล + จุด ping ยังคงไว้ (สื่อสถานะจริง) —
                 เดิม justify-between ดันข้อความ/นาฬิกาไปสุดขอบการ์ด พอการ์ด flex-1 กว้างขึ้น
                 (เพราะมีการ์ด username แคบๆ อยู่ข้างๆ) ช่องว่างตรงกลางเลยยืดจนดูแปลก เปลี่ยนเป็น
                 justify-center + gap คงที่ ให้สองส่วนอยู่ติดกันเป็นกลุ่มเดียวเสมอไม่ว่าการ์ดจะกว้างแค่ไหน */}
            <div className="flex-1 min-w-0 rounded-lg bg-card border border-border p-4 flex items-center justify-center gap-4 md:gap-6">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">สถานะบัญชี</p>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                  </span>
                  <span className="text-foreground font-bold text-lg">Active</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 font-mono tabular-nums">
                  {now ? now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '--:--:--'} น.
                </p>
              </div>
              <AnalogClock now={now} />
            </div>

            {/* Card: บัญชีผู้ใช้ — username จาก session ที่ fetch ไว้แล้ว (ไม่ query เพิ่ม) —
                 w-28 md:w-32 กันตัดคำ username ยาว (คำนวณไว้ตอนแก้ก่อนหน้านี้) — กดเข้าไปจัดการ
                 บัญชีได้ (เปลี่ยน username/อีเมล/รหัสผ่าน) ที่หน้ากลาง /admin/account */}
            <Link
              href="/admin/account"
              className="group flex flex-col items-center justify-center gap-1.5 w-28 md:w-32 shrink-0 rounded-lg bg-card border border-border p-3 text-center hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <User className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <p className="text-xs font-mono font-semibold text-foreground truncate w-full">@{staff.username}</p>
              <p className="text-[11px] text-muted-foreground">บัญชีผู้ใช้</p>
            </Link>
          </div>

          {/* Tile: กรอกแบบฟอร์มแทนลูกค้า — CTA หลักของหน้านี้ ใช้ไอคอนพื้นเขียวแบรนด์ทึบ
               (เดิมไล่เฉดส้ม) + แถบซ้าย border-l-primary ให้เด่นเหมือน tile featured อื่น */}
          <Link href="/admin/csr/form" className="group block md:col-span-2 md:row-span-1">
            <div className="relative h-full min-h-[112px] md:min-h-0 rounded-lg bg-card border border-border border-l-[3px] border-l-primary hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md flex items-center justify-center bg-primary text-primary-foreground shadow-sm shadow-primary/30 shrink-0">
                <PenLine className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-foreground">กรอกแบบฟอร์มแทนลูกค้า</h2>
                <p className="text-xs text-muted-foreground truncate">สร้างคำร้องคืน/แลกเปลี่ยนแทนลูกค้า</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all shrink-0" />
            </div>
          </Link>

          {/* Tile: CSR Dashboard — ขยาย 4×2 แถบสี border-left แทนแถบ gradient ลอยเดิม + ไอคอน
               พื้นสีเขียวแบรนด์ทึบ MiniStat 5 ช่องยังใช้สี semantic ของแต่ละสถานะเหมือนเดิม */}
          <Link href="/admin/csr/dashboard" className="group block md:col-span-4 md:row-span-2">
            <div className="relative h-full flex flex-col bg-card rounded-lg border border-border border-l-[3px] border-l-primary hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-md flex items-center justify-center bg-primary text-primary-foreground shadow-sm shadow-primary/30 shrink-0">
                    <LayoutDashboard className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-foreground">CSR Dashboard</h2>
                    <p className="text-xs text-muted-foreground truncate">ภาพรวมใบงานทุกสถานะ — ตรวจสอบรายการที่รอดำเนินการ</p>
                  </div>
                </div>

                {counts ? (
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    <MiniStat icon={ClipboardList} value={counts.totalRequests} label="ใบงานรวม" iconBg="bg-accent" iconText="text-accent-foreground" />
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
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-md" />)}
                  </div>
                )}

                <span className="mt-auto text-xs font-semibold text-primary flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  ดูรายการที่รอดำเนินการ <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* Tile: การจัดการข้อมูลลูกค้า — เดิมโทนมัสตาร์ด ตอนนี้ใช้ชุดเดียวกับ tile featured อื่น */}
          <Link href="/admin/csr/customers" className="group block md:col-span-2 md:row-span-2">
            <div className="relative h-full flex flex-col bg-card rounded-lg border border-border border-l-[3px] border-l-primary hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
              <div className="p-6 flex-1 flex flex-col">
                <div className="w-10 h-10 rounded-md flex items-center justify-center bg-primary text-primary-foreground shadow-sm shadow-primary/30 mb-3">
                  <Users className="w-5 h-5" />
                </div>
                {counts ? (
                  <p className="text-foreground font-bold text-3xl leading-none tabular-nums mb-1">{fmt(counts.pendingClients)}</p>
                ) : (
                  <Skeleton className="h-8 w-14 mb-1" />
                )}
                <h2 className="text-sm font-bold text-foreground mb-1">การจัดการข้อมูลลูกค้า</h2>
                <p className="text-xs text-muted-foreground mb-4">ลูกค้าใหม่รออนุมัติ — ตรวจสอบและกำหนดรหัสลูกค้า</p>
                <span className="mt-auto text-xs font-semibold text-primary flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  ดูลูกค้าที่รออนุมัติ <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* Panel "เครื่องมือเสริม" — md:col-span-6 กินเต็มความกว้าง ภายในเป็น grid ของตัวเอง
               (2 คอลัมน์มือถือ / 4 คอลัมน์จอกว้าง) — hidden md:block: บนมือถือซ่อน panel นี้
               ทั้งก้อน เปลี่ยนไปใช้ bottom nav bar แบบ fixed แทน (ดูท้ายไฟล์) */}
          <div className="hidden md:block md:col-span-6 md:row-span-2 rounded-lg bg-card border border-border p-5 md:p-6">
            <div className="flex items-center gap-2.5 mb-4 px-1">
              <div className="w-9 h-9 rounded-md bg-accent text-accent-foreground shadow-sm shadow-accent/40 flex items-center justify-center shrink-0">
                <Wrench className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">เครื่องมือเสริม</h2>
                <p className="text-xs text-muted-foreground">ทางลัดไปเครื่องมือและรายงานที่ใช้บ่อย</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
              {/* Tile: Download Center — placeholder "อยู่ระหว่างการพัฒนา" ยังไม่ลิงก์ไปไหน */}
              <div className="relative rounded-md bg-secondary border border-dashed border-border opacity-80 overflow-hidden p-4 flex flex-col gap-2 min-h-[128px]">
                <div className="w-9 h-9 rounded-md flex items-center justify-center bg-card shrink-0">
                  <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-foreground">Download Center</h3>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">อยู่ระหว่างการพัฒนา</p>
                </div>
              </div>

              {/* Tile: ศูนย์รายงาน (Report Center) */}
              <Link href="/admin/csr/reports" className="group block">
                <div className="h-full rounded-md bg-card border border-border hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-4 flex flex-col gap-2 min-h-[128px]">
                  <div className="w-9 h-9 rounded-md flex items-center justify-center bg-accent text-accent-foreground shadow-sm shadow-accent/40 shrink-0">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-bold text-foreground">Report Center</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Visual Dashboard</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all" />
                </div>
              </Link>

              {/* Tile: คำถามที่บอทตอบไม่ได้ — เน้นตัวเลขค้างทบทวน */}
              <Link href="/admin/csr/chatbot" className="group block">
                <div className="h-full rounded-md bg-card border border-border hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-4 flex flex-col gap-2 min-h-[128px]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-9 h-9 rounded-md flex items-center justify-center bg-accent text-accent-foreground shadow-sm shadow-accent/40 shrink-0">
                      <HelpCircle className="w-4 h-4" />
                    </div>
                    {!!counts?.unanswered && (
                      <span className="text-[11px] font-bold text-primary-foreground bg-primary px-1.5 py-0.5 rounded-full shrink-0">{fmt(counts.unanswered)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-bold text-foreground">Follow-up Question</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">ทบทวนคำถาม &quot;เพื่อพัฒนา chat-AI&quot;</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all" />
                </div>
              </Link>

              {/* Tile: Track & Trace */}
              <Link href="/admin/csr/tracking" className="group block">
                <div className="h-full rounded-md bg-card border border-border hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-4 flex flex-col gap-2 min-h-[128px]">
                  <div className="w-9 h-9 rounded-md flex items-center justify-center bg-accent text-accent-foreground shadow-sm shadow-accent/40 shrink-0">
                    <Search className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-bold text-foreground">Track & Trace</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">ติดตามสถานะ</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all" />
                </div>
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* ══ Bottom nav bar — เฉพาะมือถือ (md:hidden), fixed เกาะขอบล่างจอเสมอ ══ */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-3 gap-1 max-w-md mx-auto">
          <Link href="/admin/csr/reports" className="flex flex-col items-center gap-1 py-1.5 rounded-md text-primary active:bg-accent transition-colors">
            <BarChart3 className="w-5 h-5" />
            <span className="text-[11px] font-semibold">รายงาน</span>
          </Link>
          <Link href="/admin/csr/chatbot" className="flex flex-col items-center gap-1 py-1.5 rounded-md text-primary active:bg-accent transition-colors">
            <span className="relative">
              <HelpCircle className="w-5 h-5" />
              {!!counts?.unanswered && (
                <span className="absolute -top-1 -right-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground ring-2 ring-card">
                  {counts.unanswered > 9 ? '9+' : counts.unanswered}
                </span>
              )}
            </span>
            <span className="text-[11px] font-semibold">คำถามบอท</span>
          </Link>
          <Link href="/admin/csr/tracking" className="flex flex-col items-center gap-1 py-1.5 rounded-md text-primary active:bg-accent transition-colors">
            <Search className="w-5 h-5" />
            <span className="text-[11px] font-semibold">ติดตาม</span>
          </Link>
        </div>
      </nav>

      <footer className="mt-4 py-5 px-6 text-center border-t border-border">
        <p className="text-[11px] text-muted-foreground">© 2026 <span className="font-semibold text-foreground">GPO Xchange Portal</span> • องค์การเภสัชกรรม สาขาภาคใต้ &nbsp;|&nbsp; Staff Portal</p>
      </footer>
    </div>
  );
}
