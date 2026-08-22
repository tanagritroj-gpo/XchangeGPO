import { Skeleton } from '@/components/ui/skeleton';

// ── ชุด skeleton ที่ประกอบกันเป็นหน้า dashboard พนักงานได้ (CSR/WH/Logistics/Manager) ──
// ออกแบบให้แต่ละหน้าประกอบเองจากชิ้นย่อยเหล่านี้ แทนที่จะมี component เดียวตายตัว
// เพราะ layout จริงของแต่ละแผนกต่างกัน (จำนวน stat card, มี sidebar ไหม, มี sub-tab ไหม)
// แต่ทุกชิ้นสะท้อนโครงจริงของ element ที่มันแทนที่ ไม่ใช่แค่กล่องเทาทั่วไป

/** แทนที่ top bar: ปุ่มย้อนกลับ + เส้นคั่น + หัวข้อ 2 บรรทัด ... ปุ่ม logout ขวาสุด */
export function SkeletonTopBar() {
  return (
    <div className="sticky top-0 z-30 bg-card border-b border-border">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <Skeleton className="h-9 w-9 sm:w-24 rounded-md" />
          <div className="w-px h-5 bg-border shrink-0" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-2.5 w-20 rounded hidden sm:block" />
          </div>
        </div>
        <Skeleton className="h-9 w-9 sm:w-28 rounded-md" />
      </div>
    </div>
  );
}

/** แทนที่แถบ StatCard N ใบ — icon วงกลม + ตัวเลข + label */
export function SkeletonStatCards({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5 md:p-4">
          <Skeleton className="h-10 w-10 md:h-11 md:w-11 rounded-md shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-5 w-10 rounded" />
            <Skeleton className="h-2.5 w-16 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** แทนที่ sidebar tab แนวตั้ง (desktop) — icon กล่อง + label + badge จำนวน */
export function SkeletonSidebarTabs({ count = 2 }: { count?: number }) {
  return (
    <div className="hidden md:flex md:flex-col gap-2 md:w-60 shrink-0">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3.5 py-3 rounded-md border border-transparent bg-secondary/40">
          <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
          <Skeleton className="h-3.5 flex-1 rounded" />
          <Skeleton className="h-4 w-6 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** แทนที่ sub-tab แนวนอนแบบ segmented control */
export function SkeletonSubTabs({ count = 2 }: { count?: number }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-md bg-secondary border border-border w-fit">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-32 rounded-lg" />
      ))}
    </div>
  );
}

/** แทนที่แถบ filter (input วันที่/dropdown/ค้นหา) แบบ grid หลายคอลัมน์ */
export function SkeletonFilterBar({ fields = 5 }: { fields?: number }) {
  return (
    <div className="bg-card rounded-lg border border-border p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-2.5 w-14 rounded" />
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/**
 * แทนที่แถวตารางแบบ desktop grid-cols-12 ที่ dashboard ส่วนใหญ่ใช้ (ref id / badge
 * สถานะ / รายการสินค้า / action) — มือถือยุบเหลือ 2 บรรทัดให้พอสื่อโครงการ์ดเดียวกัน
 */
export function SkeletonTableRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="hidden md:block px-6 py-2.5 bg-secondary/60 border-b border-border">
        <Skeleton className="h-2.5 w-full max-w-md rounded" />
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i}>
            {/* desktop row */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 items-center">
              <div className="col-span-3 space-y-1.5">
                <Skeleton className="h-3.5 w-24 rounded" />
                <Skeleton className="h-2.5 w-32 rounded" />
              </div>
              <div className="col-span-2"><Skeleton className="h-5 w-20 rounded-full" /></div>
              <div className="col-span-5"><Skeleton className="h-3.5 w-28 rounded" /></div>
              <div className="col-span-2 flex justify-end"><Skeleton className="h-8 w-20 rounded-md" /></div>
            </div>
            {/* mobile card */}
            <div className="md:hidden px-4 py-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-24 rounded" />
                  <Skeleton className="h-2.5 w-28 rounded" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full shrink-0" />
              </div>
              <Skeleton className="h-8 w-full rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** แทนที่รายการแบบการ์ดเรียบง่าย (เช่น "ลูกค้าที่รออนุมัติ") — เลข ลำดับ + ชื่อ + รายละเอียดย่อย */
export function SkeletonSimpleRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden divide-y divide-border/60">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 md:px-6 py-3.5 md:py-4">
          <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40 rounded" />
            <Skeleton className="h-2.5 w-24 rounded" />
          </div>
          <Skeleton className="h-8 w-20 rounded-md shrink-0" />
        </div>
      ))}
    </div>
  );
}

/**
 * โครงเต็มหน้าแบบมาตรฐาน — top bar + stat cards (ถ้ามี) + sidebar (ถ้ามี) + ตาราง
 * ใช้แทนที่ full-page spinner gate เดิมของ CSR/WH/Logistics/Manager dashboard
 */
export function StaffDashboardSkeleton({
  statCount = 0,
  sidebarTabCount = 0,
  subTabCount = 0,
  rows = 5,
  bgClassName = 'bg-background',
}: {
  statCount?: number;
  sidebarTabCount?: number;
  subTabCount?: number;
  rows?: number;
  bgClassName?: string;
}) {
  return (
    <div className={`min-h-screen ${bgClassName}`}>
      <SkeletonTopBar />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-5 md:space-y-7">
        {statCount > 0 && <SkeletonStatCards count={statCount} />}
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          {sidebarTabCount > 0 && <SkeletonSidebarTabs count={sidebarTabCount} />}
          <div className="flex-1 min-w-0 space-y-4">
            {subTabCount > 0 && <SkeletonSubTabs count={subTabCount} />}
            <SkeletonTableRows rows={rows} />
          </div>
        </div>
      </div>
    </div>
  );
}
