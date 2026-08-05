import { Skeleton } from '@/components/ui/skeleton';

// ── skeleton สำหรับ ExchangeHistoryView (หน้าประวัติ/ประวัติหน่วยงาน ฝั่งลูกค้า) ──
// แทนที่ Loader2 กลม ด้วยโครงการ์ดใบงานจริง (header+badge, แถวรายการยา, ปุ่ม CTA)

/** แถบ stat card 5 ใบด้านบนของหน้าประวัติ — แสดงระหว่างโหลดแทนการซ่อนไปเฉยๆ */
export function ExchangeStatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 rounded-xl border border-border bg-white p-2.5">
          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-8 rounded" />
            <Skeleton className="h-2 w-14 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ExchangeCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border border-l-4 border-l-slate-200 bg-white p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32 rounded" />
          <Skeleton className="h-3 w-24 rounded" />
        </div>
        <Skeleton className="h-7 w-20 rounded-full shrink-0" />
      </div>
      <div className="mb-5 space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-9 w-full rounded-xl" />
    </div>
  );
}

/** รายการการ์ดประวัติ N ใบ พร้อมแถบ tab กรองสถานะด้านบน (skeleton) */
export function ExchangeCardsSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-6">
      <ExchangeStatCardsSkeleton />
      <div className="-mx-6 flex gap-3 overflow-x-auto border-b border-border px-6 pb-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full shrink-0" />
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: cards }).map((_, i) => (
          <ExchangeCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
