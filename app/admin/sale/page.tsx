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

// ── หน้า hub ของ Sale — จัดวางแบบ "bento grid" เดียวกับ CSR/Manager hub: hero (4×2) + tile
// "สถานะบัญชี" พร้อมนาฬิกาเข็ม (2×1) + tile "ขอบเขตที่ดูแล" (2×1) แล้วปิดท้ายด้วยการ์ดลิงก์ 3
// ใบเท่ากัน (2×2 ต่อใบ): "Active Workflow", "ประวัติใบงาน", "ศูนย์รายงาน"
//
// ★ ปรับสไตล์ตาม "Option B — Institutional Green" (เอกสารเสนอทิศทาง UI, ทำแบบเดียวกับหน้า
// Manager ที่ app/admin/manager/page.tsx): เลิกให้แต่ละ tile คิดสีของตัวเอง (เดิม indigo/ทอง/
// ส้ม/อำพันปนกัน) เหลือ accent เดียวคือสีเขียวแบรนด์ผ่าน CSS variable กลาง (--primary/--accent
// ใน globals.css) ตัดพื้นหลัง blob ไล่เฉด, noise texture, glassmorphism และ pulse ที่เป็นแค่
// ของตกแต่งออก — radius เหลือ 2 ระดับ (rounded-md/rounded-lg) เนื้อหา/ลิงก์/logic การโหลด
// ข้อมูลไม่เปลี่ยนจากเดิม
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
  // "รับคืน CCR" เพราะการ์ดนี้โชว์แค่ 2 ประเภทหลักตามที่ผู้ใช้ขอ — completed แยกไว้ให้ hero
  // ใช้เป็นสถิติผลงาน (ไม่ซ้ำกับ total/active ที่ขึ้นบนป้าย Active Workflow/ประวัติใบงานอยู่แล้ว)
  const [counts, setCounts] = useState<{ total: number; active: number; completed: number; debtReduction: number; exchange: number } | null>(null);
  useEffect(() => {
    async function loadCounts() {
      const data = await getSaleCustomerHistory();
      const rows: { current_status: string; request_type: string | null }[] = data ?? [];
      const active = rows.filter((r) => !['completed', 'rejected'].includes(r.current_status)).length;
      const completed = rows.filter((r) => r.current_status === 'completed').length;
      const debtReduction = rows.filter((r) => r.request_type === 'รับคืนลดหนี้').length;
      const exchange = rows.filter((r) => r.request_type === 'รับคืนแลกเปลี่ยน').length;
      setCounts({ total: rows.length, active, completed, debtReduction, exchange });
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

  const customerTypeLabels = (staff.sale_customer_types ?? []).map(
    (v: string) => SALE_CUSTOMER_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v,
  );
  const provinces: string[] = staff.sale_provinces ?? [];

  // ══ เนื้อหาของ 3 การ์ด (สถานะบัญชี/บัญชีผู้ใช้/ขอบเขตที่ดูแล) แยกเป็นตัวแปร JSX ไว้ใช้ซ้ำ —
  // เพราะการ์ดทั้ง 3 ต้อง "จับคู่กันคนละแบบ" ระหว่างมือถือกับ desktop (มือถือ: บัญชีผู้ใช้คู่กับ
  // ขอบเขตที่ดูแล / desktop: บัญชีผู้ใช้คู่กับสถานะบัญชีแบบ CSR/Manager) ต่างกันที่ตัว adjacency
  // ของ DOM จริงๆ ไม่ใช่แค่ขนาด/breakpoint เฉยๆ เลย render โครง wrapper 2 ชุดแยกกันด้านล่าง
  // (ชุดมือถือ md:hidden / ชุดเดสก์ท็อป hidden md:contents) แต่ใช้เนื้อหาการ์ดชุดเดียวกันนี้
  // ทั้งคู่ กันโค้ดซ้ำ
  const statusCardBody = (
    <>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">สถานะบัญชี</p>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
          <span className="text-foreground font-bold text-base md:text-lg">Active</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5 font-mono tabular-nums">
          {now ? now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '--:--:--'} น.
        </p>
      </div>
      <AnalogClock now={now} />
    </>
  );

  const usernameCardBody = (
    <>
      <User className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
      <p className="text-xs font-mono font-semibold text-foreground truncate w-full">@{staff.username}</p>
      <p className="text-[11px] text-muted-foreground">บัญชีผู้ใช้</p>
    </>
  );

  const scopeCardBody = (
    <>
      {/* mx-auto: จำเป็นเฉพาะใน flex-col (มือถือ) ให้ไอคอนอยู่กึ่งกลางความกว้างการ์ด — ใน
          flex-row (desktop) ไม่มีผลอะไรเพราะการ์ด content ข้างๆ เป็น flex-1 กินพื้นที่ว่าง
          ที่เหลือหมดแล้ว ไม่มี free space เหลือให้ mx-auto ไปแย่งจับ เลยใช้ class เดียวได้ทั้งคู่ */}
      <div className="w-9 h-9 rounded-md flex items-center justify-center bg-accent text-accent-foreground shrink-0 mt-0.5 mx-auto">
        <MapPin className="w-4 h-4" strokeWidth={2.5} />
      </div>
      <div className="min-w-0 flex-1 flex flex-col justify-center gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">ประเภท</p>
          <div className="flex flex-wrap gap-1">
            {customerTypeLabels.length > 0 ? (
              customerTypeLabels.map((label: string) => (
                <span key={label} className="text-[11px] font-semibold bg-accent text-accent-foreground px-1.5 py-0.5 rounded">{label}</span>
              ))
            ) : <span className="text-[11px] text-muted-foreground">ยังไม่ได้กำหนด</span>}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">จังหวัด</p>
          <div className="flex flex-wrap gap-1">
            {provinces.length > 0 ? (
              provinces.map((p) => (
                <span key={p} className="text-[11px] font-semibold bg-accent text-accent-foreground px-1.5 py-0.5 rounded">{p}</span>
              ))
            ) : <span className="text-[11px] text-muted-foreground">ยังไม่ได้กำหนด</span>}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 md:px-6 pt-6 pb-8 space-y-6">

        {/* ── LOGO & BRAND IDENTITY ── */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md flex items-center justify-center bg-primary text-primary-foreground">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">GPO Xchange</p>
              <p className="text-[11px] text-muted-foreground leading-tight">Staff Portal · Sale</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell scope="sale" />
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

        {/* ══ Bento Grid — 6 คอลัมน์ เท่ากับ CSR/Manager hub ══ auto-rows เป็น minmax(128px,auto)
             แทน 128px ตายตัว — ให้ tile "ขอบเขตที่ดูแล" ขยายสูงได้เองถ้ามีชิปเยอะ (โชว์ครบทุก
             อัน ไม่ตัด +N) โดยไม่กระทบ tile อื่นที่เนื้อหาพอดี 128px อยู่แล้ว */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 md:auto-rows-[minmax(128px,auto)]">

          {/* Tile: Welcome hero — 4×2 พื้นสีเขียวแบรนด์ทึบ (accent เดียวของทั้งหน้า) — เพิ่ม glow
               วงกลมเดียว โทนเดียวกับพื้น (primary-foreground จางๆ) มุมขวาบนให้มีมิติ ต่างจาก
               บลอบหลายลูกหลายสีของดีไซน์เดิม อันนี้มีจุดเดียว สีเดียว ไม่ใช่ของตกแต่งสุ่ม */}
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
                <TrendingUp className="w-4 h-4" /> แผนก Sale (พนักงานขาย)
              </p>
              <p className="text-primary-foreground/75 mt-3 text-sm leading-relaxed">
                ขอให้มีความสุขตลอดการทำงาน ในวันที่สดใส{today && <> {today}</>}
              </p>

              {/* ── แถบสรุปตัวเลขด่วน — เดิมโชว์ total/active ซ้ำกับตัวเลขบนป้ายมุมขวาบนของ
                   การ์ด "Active Workflow"/"ประวัติใบงาน" ด้านล่างทุกตัวเป๊ะๆ (ผู้ใช้ทักว่าดูแปลก
                   เห็นเลขชุดเดียวกันวนซ้ำ 3 รอบ) เปลี่ยนมาโชว์ "ผลงาน" แทน (เสร็จสิ้นแล้ว +
                   อัตราปิดงานสำเร็จ) ซึ่งเป็นมุมมองที่ 2 การ์ดด้านล่างไม่ได้บอก ใช้ counts ชุด
                   เดียวกันที่ fetch ไว้อยู่แล้ว ไม่ query เพิ่ม ── */}
              <div className="mt-6 pt-5 border-t border-primary-foreground/15 flex items-center gap-6 md:gap-8">
                <div>
                  <p className="text-2xl md:text-3xl font-bold tabular-nums leading-none">
                    {counts ? counts.completed.toLocaleString('th-TH') : '—'}
                  </p>
                  <p className="text-[11px] text-primary-foreground/70 uppercase tracking-wide mt-1">เสร็จสิ้นแล้ว</p>
                </div>
                <div className="w-px h-9 bg-primary-foreground/20 shrink-0" />
                <div>
                  <p className="text-2xl md:text-3xl font-bold tabular-nums leading-none">
                    {counts && counts.total > 0 ? `${Math.round((counts.completed / counts.total) * 100)}%` : '—'}
                  </p>
                  <p className="text-[11px] text-primary-foreground/70 uppercase tracking-wide mt-1">อัตราปิดงานสำเร็จ</p>
                </div>
                <Link
                  href="/admin/sale/workflow"
                  className="ml-auto hidden sm:flex items-center gap-1.5 text-xs font-semibold text-primary-foreground/90 hover:text-primary-foreground bg-primary-foreground/10 hover:bg-primary-foreground/15 px-3.5 py-2 rounded-md transition-colors shrink-0"
                >
                  ดูภาพรวม <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {/* ══ กลุ่ม สถานะบัญชี + บัญชีผู้ใช้ + ขอบเขตที่ดูแล — จับคู่กันคนละแบบระหว่าง
               มือถือ/desktop ตามที่ผู้ใช้ขอ (มือถือ: บัญชีผู้ใช้จับคู่กับขอบเขตที่ดูแล /
               desktop: บัญชีผู้ใช้จับคู่กับสถานะบัญชีแบบ CSR/Manager) — ต่างจาก media query
               ปกติตรงที่ adjacency ของ DOM เปลี่ยนจริง ไม่ใช่แค่ขนาด/ทิศทาง เลย render wrapper
               2 ชุดแยกกัน (mobile-only / desktop-only) โดยใช้เนื้อหาการ์ดชุดเดียวกัน
               (statusCardBody/usernameCardBody/scopeCardBody ด้านบนของไฟล์) กันโค้ดซ้ำ ══ */}

          {/* ── ชุดมือถือ (ซ่อนที่ md ขึ้นไป) — แถวบน: สถานะบัญชี+นาฬิกาเต็มความกว้าง เดี่ยวๆ
               (justify-between เพราะตอนนี้ไม่มีการ์ดข้างๆ แล้ว ใช้ได้เต็มที่ไม่เกิดช่องว่าง
               แปลกแบบตอนพยายามจับคู่กับบัญชีผู้ใช้) — แถวล่าง: บัญชีผู้ใช้คู่กับขอบเขตที่ดูแล
               ปล่อยให้ grid stretch ยืดสูงเท่ากัน (ไม่ใส่ items-start) ตามที่ผู้ใช้ขอให้การ์ด
               ทั้งสองสูงเท่ากัน — ต่างจากบั๊กรอบก่อน (สถานะบัญชี+ขอบเขตที่ดูแล) ตรงที่การ์ด
               บัญชีผู้ใช้ใช้ items-center justify-center อยู่แล้ว เนื้อหาทั้งกลุ่ม (ไอคอน+
               username+label) เลยแค่เลื่อนไปกึ่งกลางกล่องที่สูงขึ้น ไม่ได้แหวกเป็นช่องว่างกลาง
               การ์ดแบบ "ขอบเขตที่ดูแล" เดิมที่ไอคอนตรึงบนแยกจากเนื้อหาด้านล่าง ── */}
          <div className="md:hidden space-y-3">
            {/* justify-between เดิมดันข้อความ/นาฬิกาไปสุดขอบการ์ดจนช่องว่างตรงกลางดูแปลก
                (การ์ดนี้กว้างเต็มจอเดี่ยวๆ ไม่มีการ์ดข้างๆ มาจำกัดความกว้างแล้ว) เปลี่ยนเป็น
                justify-center + gap คงที่ ให้ทั้งกลุ่มอยู่กึ่งกลางการ์ดแทน เหมือนที่แก้ให้ CSR */}
            <div className="rounded-lg bg-card border border-border p-4 flex items-center justify-center gap-6">
              {statusCardBody}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/admin/account"
                className="group flex flex-col items-center justify-center gap-1.5 rounded-lg bg-card border border-border p-3 text-center hover:border-primary/50 hover:shadow-md transition-all duration-200"
              >
                {usernameCardBody}
              </Link>
              <div className="relative rounded-lg bg-card border border-border overflow-hidden p-3 flex flex-col gap-2">
                {scopeCardBody}
              </div>
            </div>
          </div>

          {/* ── ชุดเดสก์ท็อป (md ขึ้นไป, ซ่อนบนมือถือด้วย hidden) — display:contents ที่ md+
               ถอด wrapper ออกจาก layout ให้ลูกทั้งสองกลายเป็น grid item ของ bento grid หลักตรงๆ
               (เหมือนที่ CSR/Manager hub ทำ): สถานะบัญชี+บัญชีผู้ใช้แถวเดียวกัน (row1 col5-6)
               แล้วขอบเขตที่ดูแลเต็มแถวถัดไป (row2 col5-6) เท่าความสูง hero พอดี ── */}
          <div className="hidden md:contents">
            <div className="flex items-stretch gap-3 md:col-span-2 md:row-span-1">
              <div className="flex-1 min-w-0 rounded-lg bg-card border border-border p-5 flex items-center justify-center gap-6">
                {statusCardBody}
              </div>
              <Link
                href="/admin/account"
                className="group flex flex-col items-center justify-center gap-1.5 w-28 md:w-32 shrink-0 rounded-lg bg-card border border-border p-3 text-center hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                {usernameCardBody}
              </Link>
            </div>

            <div className="relative rounded-lg bg-card border border-border overflow-hidden p-4 flex flex-row gap-3 md:col-span-2 md:row-span-1">
              {scopeCardBody}
            </div>
          </div>

          {/* Tile: Active Workflow — 2×2 การ์ดลิงก์ไปหน้าบอร์ดแยก (app/admin/sale/workflow) */}
          <Link href="/admin/sale/workflow" className="group block md:col-span-2 md:row-span-2">
            <div className="relative h-full flex flex-col bg-card rounded-lg border border-border border-l-[3px] border-l-primary hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-10 h-10 rounded-md flex items-center justify-center bg-primary text-primary-foreground shadow-sm shadow-primary/30 shrink-0 transition-transform duration-200 group-hover:scale-105">
                    <Eye className="w-5 h-5" />
                  </div>
                  {counts ? (
                    <p className="text-foreground font-bold text-2xl leading-none tabular-nums">{counts.active.toLocaleString('th-TH')}</p>
                  ) : (
                    <Skeleton className="h-7 w-10" />
                  )}
                </div>
                <h2 className="text-sm font-bold text-foreground">Active Workflow</h2>
                <p className="text-xs text-muted-foreground mt-1">ใบงานกำลังดำเนินการในพื้นที่ดูแลของคุณ</p>

                {/* แถบไอคอนขั้นตอนเป็นของตกแต่งล้วนๆ (ไม่ใช่ stepper ที่คำนวณสถานะจริง) — แสดง
                     ภาพรวม pipeline ตั้งแต่รับคำร้องจนอนุมัติ ใช้โทน accent เดียวกับส่วนอื่นของ
                     หน้า ยกเว้นไอคอนสุดท้าย (เสร็จสิ้น) ที่ใช้ primary ทึบแทน ให้เป็นจุดหมายปลายทาง
                     ที่เด่นกว่าขั้นตอนระหว่างทาง — สื่อความหมายจริง ไม่ใช่ไล่สีสุ่ม */}
                <div className="flex items-center justify-center gap-0.5 my-4">
                  {[ClipboardCheck, PackageSearch, Truck, Warehouse, CheckCircle2].map((Icon, i, arr) => {
                    const isLast = i === arr.length - 1;
                    return (
                    <div key={i} className="flex items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${isLast ? 'bg-primary' : 'bg-accent'}`}>
                        <Icon className={`w-3.5 h-3.5 ${isLast ? 'text-primary-foreground' : 'text-accent-foreground'}`} strokeWidth={2.5} />
                      </div>
                      {i < arr.length - 1 && (
                        <div className="w-2.5 sm:w-3 h-0 border-t-2 border-dotted border-border mx-0.5 shrink-0" />
                      )}
                    </div>
                    );
                  })}
                </div>

                <span className="mt-auto text-xs font-semibold text-primary flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  ดูภาพรวมใบงาน <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* Tile: ประวัติใบงาน — 2×2 การ์ดลิงก์ */}
          <Link href="/admin/sale/history" className="group block md:col-span-2 md:row-span-2">
            <div className="relative h-full flex flex-col bg-card rounded-lg border border-border border-l-[3px] border-l-primary hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-10 h-10 rounded-md flex items-center justify-center bg-primary text-primary-foreground shadow-sm shadow-primary/30 shrink-0 transition-transform duration-200 group-hover:scale-105">
                    <History className="w-5 h-5" />
                  </div>
                  {counts ? (
                    <p className="text-foreground font-bold text-2xl leading-none tabular-nums">{counts.total.toLocaleString('th-TH')}</p>
                  ) : (
                    <Skeleton className="h-7 w-10" />
                  )}
                </div>
                <h2 className="text-sm font-bold text-foreground">ประวัติใบงาน</h2>
                <p className="text-xs text-muted-foreground mt-1">แสดงเฉพาะข้อมูลลูกค้าในพื้นที่ดูแลรับผิดชอบของคุณ</p>

                {/* mini stat แยกตามประเภทคำร้อง 2 ประเภทหลักที่ sale ต้องติดตามบ่อยที่สุด —
                     div เฉยๆ ไม่ใช่ button จริง เพราะทั้งการ์ดถูกห่อด้วย Link ไปหน้ารายละเอียด
                     แล้ว ซ้อน button คลิกได้จริงเข้าไปอีกชั้นจะผิด HTML semantics — ทั้งสองช่อง
                     ใช้โทนเดียวกัน (accent) เพราะเป็นแค่ประเภทคำร้อง ไม่ใช่สถานะที่ต้องแยกสี */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {counts ? (
                    <>
                      <MiniStat icon={Receipt} value={counts.debtReduction} label="รับคืนลดหนี้" iconBg="bg-accent" iconText="text-accent-foreground" />
                      <MiniStat icon={ArrowLeftRight} value={counts.exchange} label="รับคืนแลกเปลี่ยน" iconBg="bg-accent" iconText="text-accent-foreground" />
                    </>
                  ) : (
                    <>
                      <Skeleton className="h-[68px] rounded-md" />
                      <Skeleton className="h-[68px] rounded-md" />
                    </>
                  )}
                </div>

                <span className="mt-auto pt-3 text-xs font-semibold text-primary flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  ดูประวัติใบงาน <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* Tile: ศูนย์รายงาน — 2×2 ยังเป็น placeholder เหมือนเดิม (รอพัฒนาต่อ) */}
          <div className="md:col-span-2 md:row-span-2 h-full min-h-[128px] flex flex-col bg-card rounded-lg border border-dashed border-border opacity-80 overflow-hidden">
            <div className="p-6 flex-1 flex flex-col">
              <div className="w-10 h-10 rounded-md flex items-center justify-center bg-secondary shrink-0 mb-3">
                <BarChart3 className="w-5 h-5 text-muted-foreground" />
              </div>
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2 flex-wrap">
                ศูนย์รายงาน (Report Center)
                <span className="text-[11px] font-bold uppercase tracking-wide bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">เร็วๆ นี้</span>
              </h2>
              <p className="text-xs text-muted-foreground mt-1">สรุปสถิติยอดขาย/คำร้องของลูกค้าที่ดูแล — อยู่ระหว่างการพัฒนา</p>
              <div className="mt-auto flex items-center justify-center rounded-md text-xs text-muted-foreground bg-secondary border-2 border-dashed border-border py-4">
                กำลังพัฒนา
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-4 py-5 px-6 text-center border-t border-border">
        <p className="text-[11px] text-muted-foreground">© 2026 <span className="font-semibold text-foreground">GPO Xchange Portal</span> • องค์การเภสัชกรรม สาขาภาคใต้ &nbsp;|&nbsp; Staff Portal</p>
      </footer>
    </div>
  );
}
