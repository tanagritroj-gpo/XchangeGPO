import { Skeleton } from '@/components/ui/skeleton';

// ── skeleton สำหรับ ExchangeHistoryView (หน้าประวัติ/ประวัติหน่วยงาน ฝั่งลูกค้า) ──
// โครงตรงกับการ์ดจริง: header+badge, แถบสรุป 3 ช่อง, ปุ่ม CTA — เรียงเป็น grid 2 คอลัมน์

/** แถบ stat card 5 ใบด้านบนของหน้าประวัติ — แสดงระหว่างโหลดแทนการซ่อนไปเฉยๆ */
export function ExchangeStatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-5 w-8 rounded" />
            <Skeleton className="h-2 w-14 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ExchangeCardSkeleton() {
  return (
    <div className="rounded-lg border border-border border-l-[3px] border-l-slate-200 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32 rounded" />
          <Skeleton className="h-3 w-40 rounded" />
        </div>
        <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-14 w-full rounded-md" />
      <Skeleton className="mt-3 h-7 w-full rounded-md" />
      <div className="mt-3 space-y-2">
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
    </div>
  );
}

/** รายการการ์ดประวัติ N ใบ พร้อมแถบ tab กรองสถานะด้านบน (skeleton) */
export function ExchangeCardsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-6">
      <ExchangeStatCardsSkeleton />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: cards }).map((_, i) => (
          <ExchangeCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
