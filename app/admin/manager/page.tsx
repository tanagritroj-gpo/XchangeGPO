'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStaffSession, logoutStaffAction } from '@/app/actions/auth-staff';
import { getManagerHubCounts } from '@/app/actions/manager-actions';
import { getManagerSlaBadgeCount } from '@/app/actions/sla-actions';
import Link from 'next/link';
import { Crown, User, ShieldCheck, Users, ClipboardList, BarChart3, FileSpreadsheet, Search, ArrowRight, LogOut, Loader2, Clock, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import type { StaffSessionInfo } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationBell } from '@/components/NotificationBell';
import { AnalogClock } from '@/components/AnalogClock';
import { MiniStat } from '@/components/MiniStat';

// ── หน้า hub ของ Manager — จัดวางแบบ "bento grid" (กล่องเบนโตะ): เซลล์ขนาดต่างกันบน grid
// เดียว ผสม hero/สถานะ/ปุ่มปฏิบัติการ/ตัวเลขสรุปไว้ในผืนเดียวกัน (โครง grid ไม่เปลี่ยนจากเดิม)
//
// ★ ปรับสไตล์ตาม "Option B — Institutional Green" (ดูเอกสารเสนอทิศทาง UI): เลิกให้แต่ละ tile
// คิดสีของตัวเอง (เดิมม่วง/ทอง/ทีล/แดงปนกัน) เหลือ accent เดียวคือสีเขียวแบรนด์ผ่าน CSS
// variable กลาง (--primary/--accent ใน globals.css) ยกเว้น SLA tile ที่แดง/destructive ไว้
// เพราะเป็นสีเชิงความหมาย (แจ้งเตือนเกินกำหนด) ไม่ใช่การตกแต่ง — radius/shadow ลดเหลือ 2 ระดับ
// (rounded-md/rounded-lg) แทน rounded-2xl/3xl ที่ใช้ปนกันแบบไม่มีกฎ ตัดพื้นหลัง blob ไล่เฉด,
// noise texture, glassmorphism, และ pulse dot ที่เป็นแค่ของตกแต่งออกทั้งหมด — เนื้อหา/ลิงก์/
// logic การโหลดข้อมูลไม่เปลี่ยนจากเดิม
export default function ManagerHubPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffSessionInfo | null>(null);
  const [today, setToday] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [counts, setCounts] = useState<{
    pendingStaff: number; totalRequests: number; pendingReview: number; completed: number; rejected: number;
  } | null>(null);
  const [slaBadgeCount, setSlaBadgeCount] = useState<number | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setToday(new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);

  // นาฬิกาเดินตามเวลาจริง ป้อนทั้งตัวเลขดิจิทัลและมุมเข็มของ AnalogClock ในการ์ด "สถานะบัญชี"
  // — pattern เดียวกับ CSR hub (app/admin/csr/page.tsx) ตามที่ผู้ใช้ขอให้ทำหน้านี้คล้ายกัน
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

  // ตัวเลขสรุปสำหรับ tile ต่างๆ — โหลดแยกอิสระจาก session ไม่บล็อกการแสดงผลหลัก
  // (tile ที่รอข้อมูลจะโชว์ skeleton pulse ระหว่างนี้แทนตัวเลข ดู <Skeleton> ด้านล่าง)
  useEffect(() => {
    async function loadCounts() {
      const result = await getManagerHubCounts();
      setCounts(
        result.success
          ? {
              pendingStaff: result.pendingStaff, totalRequests: result.totalRequests,
              pendingReview: result.pendingReview, completed: result.completed, rejected: result.rejected,
            }
          : { pendingStaff: 0, totalRequests: 0, pendingReview: 0, completed: 0, rejected: 0 }
      );
    }
    loadCounts();
  }, []);

  useEffect(() => {
    async function loadSlaBadge() {
      const result = await getManagerSlaBadgeCount();
      setSlaBadgeCount(result.success ? result.count ?? 0 : 0);
    }
    loadSlaBadge();
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

      {/* pb-24 กันเนื้อหาแถวสุดท้ายโดน bottom nav bar (มือถือเท่านั้น, fixed) บังตอนเลื่อนสุด —
           pattern เดียวกับ CSR hub */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 pt-8 pb-24 md:pb-8 space-y-6">

        {/* ── LOGO & BRAND IDENTITY ── */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md flex items-center justify-center bg-primary text-primary-foreground">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">GPO Xchange</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Staff Portal · Manager</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell scope="manager" />
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary border border-border px-3.5 py-2 rounded-md transition-colors disabled:opacity-60 disabled:pointer-events-none"
            >
              {isLoggingOut ? <Loader2 className="w-4 h-5 animate-spin" /> : <LogOut className="w-4 h-5" />}
              ออกจากระบบ
            </button>
          </div>
        </div>

        {/* ══ Bento Grid — hero + สถานะ + ปลายทางทั้งหมดรวมในผืนเดียว ══
             mobile: เรียงเดี่ยว (col-span-full ทุก tile) / md ขึ้นไป: bento 6 คอลัมน์จริง
             auto-rows คงที่ + row-span 1/2 ต่อ tile คือหัวใจของเลย์เอาต์นี้ */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 md:auto-rows-[128px]">

          {/* Tile: Welcome hero — ใหญ่สุด กว้าง 4/สูง 2 หน่วย พื้นสีเขียวแบรนด์ทึบ (accent เดียว
               ของทั้งหน้า ไม่ใช่ gradient เฉพาะจุด) — glow วงกลมเดียวโทนเดียวกับพื้นมุมขวาบน
               ให้มีมิติ + แถบสรุปตัวเลขด่วนด้านล่าง (ดึงจาก counts ที่ fetch ไว้แล้วสำหรับ tile
               อื่นอยู่แล้ว) กันพื้นที่ว่างโล่งเกินไปตอนการ์ดสูง 2 หน่วยแต่มีแค่ข้อความทักทาย */}
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
                <ShieldCheck className="w-4 h-4" /> ทีมบริหาร (Manager)
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
                    {counts ? fmt(counts.pendingStaff) : '—'}
                  </p>
                  <p className="text-[11px] text-primary-foreground/70 uppercase tracking-wide mt-1">พนักงานรออนุมัติ</p>
                </div>
                <Link
                  href="/admin/manager/requests"
                  className="ml-auto hidden sm:flex items-center gap-1.5 text-xs font-semibold text-primary-foreground/90 hover:text-primary-foreground bg-primary-foreground/10 hover:bg-primary-foreground/15 px-3.5 py-2 rounded-md transition-colors shrink-0"
                >
                  ดูภาพรวม <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {/* Tile คู่: สถานะบัญชี + บัญชีผู้ใช้ — เดิมเป็นการ์ดเดียว (นาฬิกาเข็ม + เวลาดิจิทัล +
               จุด ping สื่อสถานะจริง เปลี่ยนสีจากทีลเป็น primary ให้ตรงชุดเดียวกับทั้งหน้า) แยก
               เป็น 2 การ์ดวางติดกันแบบเดียวกับที่ทำให้ CSR hub แล้ว (app/admin/csr/page.tsx) */}
          <div className="flex items-stretch gap-3 min-h-[112px] md:min-h-0 md:col-span-2 md:row-span-1">
            {/* Card: สถานะบัญชี — justify-center + gap คงที่ กันไม่ให้ข้อความ/นาฬิกาถูกดันไปสุด
                 ขอบการ์ดตอนการ์ด flex-1 กว้างขึ้น (บทเรียนจากตอนแก้ CSR: justify-between เดิมทำ
                 ให้ช่องว่างตรงกลางยืดจนดูแปลกเมื่อมีการ์ด username แคบๆ อยู่ข้างๆ) */}
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
                 w-28 บนมือถือ กันตัดคำ username ยาว (เช่น "@Csr_staff" ที่ font-mono 12px กว้าง
                 ~75px), md:w-32 บนจอ desktop — กดเข้าไปจัดการบัญชีได้ (เปลี่ยน username/อีเมล/
                 รหัสผ่าน) ที่หน้ากลาง /admin/account เหมือนที่ทำให้ CSR hub แล้ว */}
            <Link
              href="/admin/account"
              className="group flex flex-col items-center justify-center gap-1.5 w-28 md:w-32 shrink-0 rounded-lg bg-card border border-border p-3 text-center hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <User className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <p className="text-xs font-mono font-semibold text-foreground truncate w-full">@{staff.username}</p>
              <p className="text-[11px] text-muted-foreground">บัญชีผู้ใช้</p>
            </Link>
          </div>

          {/* Tile: จัดการสิทธิ์พนักงาน — เดิมเป็น tile เดียวที่พื้นทึบสีม่วง featured แยกจากใบอื่น
               ตอนนี้ใช้การ์ดขอบเดียวกับ tile อื่นทั้งหมด ให้ลำดับความสำคัญมาจากขนาดตัวเลขแทน */}
          <Link href="/admin/manager/staff-approvals" className="group block md:col-span-2 md:row-span-1">
            <div className="relative h-full min-h-[112px] md:min-h-0 rounded-lg bg-card border border-border hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> รออนุมัติ
                </p>
                {counts ? (
                  <p className="text-foreground font-bold text-3xl leading-none tabular-nums">{fmt(counts.pendingStaff)}</p>
                ) : (
                  <Skeleton className="h-8 w-12" />
                )}
                <p className="text-muted-foreground text-xs mt-1">จัดการสิทธิ์พนักงาน</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all shrink-0" />
            </div>
          </Link>

          {/* Tile: ใบงานทั้งหมด — ขยาย 4×2 แถบสี border-left แทนแถบ gradient ลอยเดิม + ไอคอนพื้น
               สีเขียวแบรนด์ทึบ (เดิมไล่เฉดม่วง) MiniStat 5 ช่องยังใช้สี semantic ของแต่ละสถานะ
               (เหลือง/ฟ้า/เขียว/แดง) เหมือนเดิม เพราะสื่อความหมายจริง ไม่ใช่การตกแต่งสุ่ม */}
          <Link href="/admin/manager/requests" className="group block md:col-span-4 md:row-span-2">
            <div className="relative h-full flex flex-col bg-card rounded-lg border border-border border-l-[3px] border-l-primary hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-md flex items-center justify-center bg-primary text-primary-foreground shadow-sm shadow-primary/30 shrink-0">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-foreground">ใบงานทั้งหมด</h2>
                    <p className="text-xs text-muted-foreground truncate">ภาพรวมใบงานทุกสถานะ ทุกแผนก</p>
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
                  ดูใบงานทั้งหมด <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* Tile: ภาพรวม & สถิติ — เดิมโทนทอง/มัสตาร์ด ตอนนี้ใช้ชุดเดียวกับ tile อื่น */}
          <Link href="/admin/manager/insights" className="group block md:col-span-2 md:row-span-2">
            <div className="relative h-full flex flex-col bg-card rounded-lg border border-border hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
              <div className="p-6 flex-1 flex flex-col">
                <div className="w-10 h-10 rounded-md flex items-center justify-center bg-accent text-accent-foreground shadow-sm shadow-accent/40 mb-3">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <h2 className="text-sm font-bold text-foreground mb-1">ภาพรวม & สถิติ</h2>
                <p className="text-xs text-muted-foreground mb-4">กราฟสรุปผลการดำเนินงานทุกแผนก + คุยกับ chatbot วิเคราะห์ข้อมูล</p>
                <span className="mt-auto text-xs font-semibold text-primary flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  ดูภาพรวม & สถิติ <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* Tile: Download Center — เดิมโทนทีล ตอนนี้ใช้ชุดเดียวกับ tile อื่น — hidden md:block:
               ย้ายไปเป็น bottom nav bar บนมือถือแทน (ดูท้ายไฟล์) */}
          <Link href="/admin/manager/reports" className="hidden md:block group md:col-span-2 md:row-span-1">
            <div className="relative h-full rounded-lg bg-card border border-border hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md flex items-center justify-center bg-accent text-accent-foreground shadow-sm shadow-accent/40 shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-foreground">รายงานผู้บริหาร</h2>
                <p className="text-xs text-muted-foreground truncate">รายงาน Excel ในแต่ละส่วนงาน</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all shrink-0" />
            </div>
          </Link>

          {/* Tile: Track & Trace — เดิมโทนทีล ตอนนี้ใช้ชุดเดียวกับ tile อื่น — hidden md:block:
               ย้ายไปเป็น bottom nav bar บนมือถือแทนเช่นกัน */}
          <Link href="/admin/manager/tracking" className="hidden md:block group md:col-span-2 md:row-span-1">
            <div className="relative h-full rounded-lg bg-card border border-border hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md flex items-center justify-center bg-accent text-accent-foreground shadow-sm shadow-accent/40 shrink-0">
                <Search className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-foreground">Track & Trace</h2>
                <p className="text-xs text-muted-foreground truncate">ติดตามสถานะคำร้องของลูกค้าได้ทุกราย</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-all shrink-0" />
            </div>
          </Link>

          {/* Tile: SLA & การตรวจสอบระบบ — รวม SLA Monitoring System + บันทึกการตรวจสอบระบบ
               ไว้ที่เดียว (audit trail ประเภทเดียวกัน) หน้าเดียว /admin/manager/audit-trail —
               ไอคอนกรอบ + โทนแดง/destructive เสมอ เพราะเป็นสีเชิงความหมาย (การตรวจสอบ/แจ้งเตือน
               SLA) ไม่ใช่การตกแต่ง — hidden md:block: ย้ายไปเป็น bottom nav bar บนมือถือแทน */}
          <Link href="/admin/manager/audit-trail" className="hidden md:block group md:col-span-2 md:row-span-1">
            <div className="relative h-full rounded-lg bg-card border border-border hover:border-destructive/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 bg-destructive/10 text-destructive border border-destructive/25 shadow-sm shadow-destructive/20">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-foreground">SLA & การตรวจสอบระบบ</h2>
                <p className="text-xs text-muted-foreground truncate">
                  {slaBadgeCount ? `${slaBadgeCount} ใบงานเกินกำหนด SLA` : 'ภาพรวม SLA · กฎ SLA · บันทึกการตรวจสอบ (Audit log)'}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-destructive group-hover:translate-x-1 transition-transform shrink-0" />
            </div>
          </Link>
        </div>
      </main>

      {/* ══ Bottom nav bar — เฉพาะมือถือ (md:hidden), fixed เกาะขอบล่างจอเสมอ ══
           pattern เดียวกับ CSR hub (app/admin/csr/page.tsx) — แทนที่ tile "รายงานผู้บริหาร"/
           "Track & Trace"/"SLA Monitoring System" บนมือถือ z-30 ต่ำกว่า NotificationBell drawer
           (z-50) เสมอ กันไม่ให้บังตอนเปิดกระดิ่ง — safe-area-inset-bottom กันแถบ home indicator
           ของ iPhone บังปุ่มล่างสุด ══ */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-3 gap-1 max-w-md mx-auto">
          <Link href="/admin/manager/reports" className="flex flex-col items-center gap-1 py-1.5 rounded-md text-primary active:bg-accent transition-colors">
            <FileSpreadsheet className="w-5 h-5" />
            <span className="text-[10px] font-semibold">รายงาน</span>
          </Link>
          <Link href="/admin/manager/tracking" className="flex flex-col items-center gap-1 py-1.5 rounded-md text-primary active:bg-accent transition-colors">
            <Search className="w-5 h-5" />
            <span className="text-[10px] font-semibold">ติดตาม</span>
          </Link>
          <Link href="/admin/manager/audit-trail" className="relative flex flex-col items-center gap-1 py-1.5 rounded-md text-destructive active:bg-destructive/10 transition-colors">
            <span className="relative flex items-center justify-center w-7 h-7 rounded-md border border-destructive/30 bg-destructive/5">
              <ShieldCheck className="w-[18px] h-[18px]" />
              {!!slaBadgeCount && (
                <span className="absolute -top-1.5 -right-2 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-destructive px-1 text-[8px] font-bold text-destructive-foreground ring-2 ring-card">
                  {slaBadgeCount > 9 ? '9+' : slaBadgeCount}
                </span>
              )}
            </span>
            <span className="text-[10px] font-semibold">ตรวจสอบ</span>
          </Link>
        </div>
      </nav>

      <footer className="mt-4 py-5 px-6 text-center border-t border-border">
        <p className="text-[11px] text-muted-foreground">© 2026 <span className="font-semibold text-foreground">GPO Xchange Portal</span> • องค์การเภสัชกรรม สาขาภาคใต้ &nbsp;|&nbsp; Staff Portal</p>
      </footer>
    </div>
  );
}
