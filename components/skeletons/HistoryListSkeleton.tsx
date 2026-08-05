import { Skeleton } from '@/components/ui/skeleton';

// ── skeleton เฉพาะของ RequestHistoryList / RequestDetailPanel (components/history/) ──
// ใช้แทนที่ Loader2 กลมที่เคยแสดงคลุมพื้นที่ทั้งก้อนระหว่างโหลด

/** แถวในรายการประวัติใบงาน (RequestHistoryList) — ref id mono + meta บรรทัดรอง + badge + chevron */
export function HistoryRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-4 md:px-6 py-3.5 gap-3">
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-28 rounded" />
            <Skeleton className="h-2.5 w-36 rounded" />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-4 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** รายละเอียดใบงานที่ขยายออก (RequestDetailPanel) — stepper + detail grid + รายการยา + timeline */
export function RequestDetailSkeleton() {
  return (
    <div className="px-4 md:px-6 py-5 bg-slate-50 border-t border-slate-100 space-y-5">
      {/* Stepper */}
      <div className="flex items-center bg-white rounded-2xl border border-border p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center flex-1 gap-1.5">
              <Skeleton className="w-6 h-6 rounded-full" />
              <Skeleton className="h-2 w-10 rounded" />
            </div>
            {i < 5 && <Skeleton className="h-0.5 flex-1 -mt-5 rounded-none" />}
          </div>
        ))}
      </div>

      {/* Detail grid */}
      <div className="bg-white rounded-2xl border border-border p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-16 rounded" />
            <Skeleton className="h-3.5 w-20 rounded" />
          </div>
        ))}
      </div>

      {/* รายการยา */}
      <div className="bg-white rounded-2xl border border-border p-4 space-y-2">
        <Skeleton className="h-3 w-20 rounded mb-1" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl p-3 border border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
            <div className="space-y-1.5 min-w-0 flex-1">
              <Skeleton className="h-3.5 w-32 rounded" />
              <Skeleton className="h-2.5 w-24 rounded" />
            </div>
            <Skeleton className="h-3.5 w-10 rounded shrink-0" />
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="space-y-1">
        <Skeleton className="h-3 w-28 rounded mb-3 ml-1" />
        <div className="relative border-l-2 border-border ml-3 space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="relative pl-7">
              <Skeleton className="absolute -left-[15px] top-0 w-7 h-7 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-2.5 w-32 rounded" />
                <Skeleton className="h-3.5 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
