'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PackageCheck, Truck, User, LogOut, Loader2, ArrowLeft, ArrowRight } from 'lucide-react';
import { getLogisticsDashboardData } from '@/app/actions/logistics-actions';
import { getStaffSession, logoutStaffAction } from '@/app/actions/auth-staff';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationBell } from '@/components/NotificationBell';
import { AnalogClock } from '@/components/AnalogClock';
import type { StaffSessionInfo } from '@/lib/types';

// หน้ากลาง Logistics — เดิมเป็น dashboard เดียวสลับ 3 แท็บ (อนุมัติรับคืนสินค้า/อยู่ระหว่าง
// ขนส่ง/อัปโหลดรูป) ผู้ใช้ขอเปลี่ยนเป็นหน้ากลางแบบ hub เล็กๆ 2 การ์ดกดเข้าไปดูเนื้อหาจริงที่
// หน้าแยก (เหมือน pattern Sale hub → history/workflow): "ส่งรถไปรับคืนสินค้า" (เดิมแท็บ
// "อนุมัติรับคืนสินค้า") ไป /admin/logistics/dashboard/approved และ "รถขนส่งรับคืนสินค้าถึงคลัง"
// (รวมเดิม 2 แท็บ "อยู่ระหว่างขนส่ง" + "อัปโหลดรูปสินค้ารับคืน") ไป
// /admin/logistics/dashboard/in-transit — หน้านี้ดึงมาแค่ตัวเลขสรุปสำหรับ hero/การ์ด ไม่ต้อง
// มี state ของ modal/รายการใบงานอีกต่อไป (ย้ายไปหน้าย่อยตามเนื้อหาที่ใช้จริง)
export default function LogisticsDashboard() {
  const router = useRouter();
  const [requests, setRequests]         = useState<{ current_status: string }[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [staff, setStaff]               = useState<StaffSessionInfo | null>(null);
  const [today, setToday]               = useState('');
  const [now, setNow]                   = useState<Date | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    setToday(new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);

  // นาฬิกาเดินตามเวลาจริง — pattern เดียวกับ CSR/Manager/Sale hub ใช้กับการ์ด "สถานะบัญชี"
  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      const [staffSession, data] = await Promise.all([getStaffSession(), getLogisticsDashboardData()]);
      setStaff(staffSession);
      if (data.success) setRequests(data.requests || []);
      setIsLoading(false);
    }
    fetchData();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutStaffAction();
    router.push('/');
  };

  const approvedCount   = requests.filter((r) => r.current_status === 'approved').length;
  const inTransitCount  = requests.filter((r) => r.current_status === 'in_transit').length;

  return (
    <div className="min-h-screen bg-background">

      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button onClick={() => router.replace('/')}
              className="group flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary px-3 py-2 rounded-md transition-colors shrink-0">
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-border shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-bold text-foreground leading-tight truncate">GPO StaffCommand Center</h1>
              <p className="text-[11px] text-muted-foreground hidden sm:block">GPO Xchange Portal • Logistics Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell scope="log" />
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary border border-border px-3.5 py-2 rounded-md transition-colors disabled:opacity-60 disabled:pointer-events-none"
            >
              {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              <span className="hidden sm:inline">ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <Skeleton className="h-56 rounded-lg md:col-span-4" />
            <div className="flex gap-3 md:col-span-2">
              <Skeleton className="h-28 flex-1 rounded-lg" />
              <Skeleton className="h-28 w-28 md:w-32 shrink-0 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-8 space-y-6">

          {/* ══ hero + การ์ดสถานะบัญชี/บัญชีผู้ใช้ อยู่แถวเดียวกัน (grid 6 คอลัมน์เหมือน CSR hub)
               ตามที่ขอ ให้ hero กว้าง 4/6 ส่วน การ์ดคู่กว้าง 2/6 ส่วน อยู่ข้างกัน ไม่ใช่ตกลงมา
               เป็นแถวแยกด้านล่างแบบเดิม (ต่างจาก CSR ตรงที่ CSR มี tile ที่ 2 ต่อคิว "กรอกแบบฟอร์ม
               แทนลูกค้า" ใต้การ์ดคู่ให้ hero เป็น row-span-2 พอดี — หน้านี้ไม่มี tile ที่ 2 แบบนั้น
               เลยปล่อยให้เป็นแถวเดียว grid default จะยืดการ์ดคู่ให้สูงเท่า hero เอง ซึ่งดูได้เพราะ
               เนื้อหาในการ์ดใช้ items-center justify-center อยู่แล้ว ไม่ใช่ทรงที่แหวกช่องว่างแปลก) ══ */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">

          {/* ── Welcome Banner — โทนน้ำเงินให้เข้ากับสีของหน้านี้ (เหมือนแนวคิด CSR/WH welcome page) ── */}
          <div className="relative overflow-hidden rounded-lg bg-primary p-8 text-primary-foreground md:col-span-4">
            <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary-foreground/10 blur-2xl pointer-events-none" />
            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-primary-foreground/70 text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground/70" /> ยินดีต้อนรับ
                </p>
                <h1 className="text-2xl md:text-3xl font-bold leading-tight flex items-center gap-2">
                  สวัสดีคุณ {staff?.full_name || staff?.username}
                  <User className="w-6 h-6 opacity-80" />
                </h1>
                <p className="text-primary-foreground/85 mt-1.5 flex items-center gap-1.5 text-sm">
                  <Truck className="w-4 h-4" /> แผนกโลจิสติกส์ (Logistics)
                </p>
                <p className="text-primary-foreground/75 mt-3 text-sm leading-relaxed">
                  ขอให้มีความสุขตลอดการทำงาน ในวันที่สดใส{today && <> {today}</>}
                </p>
              </div>
            </div>

            <div className="relative mt-6 pt-5 border-t border-primary-foreground/15 flex items-center gap-6 md:gap-8">
              <div>
                <p className="text-2xl md:text-3xl font-bold tabular-nums leading-none">
                  {requests.length.toLocaleString('th-TH')}
                </p>
                <p className="text-[11px] text-primary-foreground/70 uppercase tracking-wide mt-1">ใบงานรวมทั้งหมด</p>
              </div>
              <div className="w-px h-9 bg-primary-foreground/20 shrink-0" />
              {/* ── "อนุมัติรับคืนสินค้า" แทรกก่อน "อยู่ระหว่างขนส่ง" ตามที่ขอ ── */}
              <div>
                <p className="text-2xl md:text-3xl font-bold tabular-nums leading-none">
                  {approvedCount.toLocaleString('th-TH')}
                </p>
                <p className="text-[11px] text-primary-foreground/70 uppercase tracking-wide mt-1">อนุมัติรับคืนสินค้า</p>
              </div>
              <div className="w-px h-9 bg-primary-foreground/20 shrink-0" />
              <div>
                <p className="text-2xl md:text-3xl font-bold tabular-nums leading-none">
                  {inTransitCount.toLocaleString('th-TH')}
                </p>
                <p className="text-[11px] text-primary-foreground/70 uppercase tracking-wide mt-1">อยู่ระหว่างขนส่ง</p>
              </div>
              <Link
                href="/admin/logistics/dashboard/in-transit"
                className="ml-auto hidden sm:flex items-center gap-1.5 text-xs font-semibold text-primary-foreground/90 hover:text-primary-foreground bg-primary-foreground/10 hover:bg-primary-foreground/15 px-3.5 py-2 rounded-md transition-colors shrink-0"
              >
                ดูรายการขนส่ง <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* ══ Tile คู่: สถานะบัญชี + บัญชีผู้ใช้ — ยกโครงมาจาก CSR hub ตรงๆ ตามที่ขอ
               (app/admin/csr/page.tsx): [การ์ดสถานะ flex-1] + [การ์ด username กว้างคงที่]
               เรียงชิดกันเสมอ ทุกขนาดจอ (เดิมหน้านี้มีแค่ป้าย "Active" เล็กๆ ฝังอยู่ในมุมขวาบน
               ของ hero ไม่มีนาฬิกาเข็ม/บัญชีผู้ใช้ — เอาออกแล้วแทนที่ด้วยการ์ดคู่นี้) — ตอนนี้อยู่
               ในช่อง grid col-span-2 ข้างๆ hero แล้ว (เดิมเป็นแถวแยกเต็มความกว้างด้านล่าง hero) ══ */}
          <div className="flex items-stretch gap-3 min-h-[112px] md:min-h-0 md:col-span-2">
            <div className="flex-1 min-w-0 rounded-lg bg-card border border-border p-4 md:p-5 flex items-center justify-center gap-4 md:gap-6">
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
                 กดเข้าไปจัดการบัญชีได้ (เปลี่ยน username/อีเมล/รหัสผ่าน) ที่หน้ากลาง
                 /admin/account เหมือนที่ทำให้ CSR/Manager/Sale hub แล้ว */}
            <Link
              href="/admin/account"
              className="group flex flex-col items-center justify-center gap-1.5 w-28 md:w-32 shrink-0 rounded-lg bg-card border border-border p-3 text-center hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <User className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <p className="text-xs font-mono font-semibold text-foreground truncate w-full">@{staff?.username}</p>
              <p className="text-[11px] text-muted-foreground">บัญชีผู้ใช้</p>
            </Link>
          </div>

          </div>

          {/* ══ 2 การ์ดกดเข้าไปดูเนื้อหาจริง (แทน sidebar tab เดิม) — เหมือน pattern Sale hub
               ที่ลิงก์ไปหน้า history/workflow แยก ══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link href="/admin/logistics/dashboard/approved" className="group block">
              <div className="h-full flex flex-col bg-card rounded-lg border border-border border-l-[3px] border-l-blue-500 hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden p-6">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-10 h-10 rounded-md flex items-center justify-center bg-blue-100 text-blue-600 shadow-sm shadow-blue-400/30 shrink-0 transition-transform duration-200 group-hover:scale-105">
                    <PackageCheck className="w-5 h-5" />
                  </div>
                  <p className="text-foreground font-bold text-2xl leading-none tabular-nums">{approvedCount.toLocaleString('th-TH')}</p>
                </div>
                <h2 className="text-sm font-bold text-foreground">ส่งรถไปรับคืนสินค้า</h2>
                <p className="text-xs text-muted-foreground mt-1">ใบงานที่อนุมัติแล้ว รอส่งรถไปรับคืนจากหน่วยงาน</p>
                <span className="mt-4 text-xs font-semibold text-primary flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  ดูรายการ <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>

            <Link href="/admin/logistics/dashboard/in-transit" className="group block">
              <div className="h-full flex flex-col bg-card rounded-lg border border-border border-l-[3px] border-l-indigo-500 hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden p-6">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-10 h-10 rounded-md flex items-center justify-center bg-indigo-100 text-indigo-600 shadow-sm shadow-indigo-400/30 shrink-0 transition-transform duration-200 group-hover:scale-105">
                    <Truck className="w-5 h-5" />
                  </div>
                  <p className="text-foreground font-bold text-2xl leading-none tabular-nums">{inTransitCount.toLocaleString('th-TH')}</p>
                </div>
                <h2 className="text-sm font-bold text-foreground">รถขนส่งรับคืนสินค้าถึงคลัง</h2>
                <p className="text-xs text-muted-foreground mt-1">ติดตามรถที่กำลังเดินทาง + อัปโหลดรูปสินค้ารับคืน</p>
                <span className="mt-4 text-xs font-semibold text-primary flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  ดูรายการ <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
