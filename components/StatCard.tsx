'use client';

import type { LucideIcon } from 'lucide-react';

// การ์ดสถิติที่คลิกได้จริง (ต่างจาก StatCard เวอร์ชัน highlight-only ของ Logistics/WH
// ที่แค่ mirror สถานะแท็บที่เลือกอยู่) — ใช้ร่วมกันระหว่าง CSR Dashboard และ Sale History
// กดแล้วกรอง/สลับมุมมองไปดูเฉพาะกลุ่มนั้นได้เลย
export function StatCard({ icon: Icon, value, label, iconBg, iconText, isActive, activeBorder, activeRing, onClick }: {
  icon: LucideIcon; value: number; label: string; iconBg: string; iconText: string;
  isActive?: boolean; activeBorder?: string; activeRing?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg border bg-card p-3.5 md:p-4 transition-colors duration-200 text-left ${
        isActive ? `${activeBorder} ${activeRing}` : 'border-border hover:border-primary/40'
      }`}
    >
      <div className={`flex h-10 w-10 md:h-11 md:w-11 shrink-0 items-center justify-center rounded-md ${iconBg} ${iconText}`}>
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xl md:text-2xl font-bold leading-tight text-foreground">{value.toLocaleString('th-TH')}</p>
        <p className="truncate text-[11px] md:text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </button>
  );
}
