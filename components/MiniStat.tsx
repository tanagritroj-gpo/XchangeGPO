'use client';

import type { LucideIcon } from 'lucide-react';

// การ์ดมินิสถิติ — ใช้ร่วมกันระหว่าง CSR hub (tile "CSR Dashboard") และ Manager hub (tile
// "ใบงานทั้งหมด") แสดงแถบ 5 ช่อง (ทั้งหมด/รอตรวจสอบ/กำลังดำเนินการ/เสร็จสิ้น/ถูกปฏิเสธ) —
// แยกออกมาเป็น component กลางเพราะใช้ซ้ำ 2 จุดแล้ว (เดิมอยู่ในไฟล์ CSR ไฟล์เดียว)
//
// เป็น <div> ล้วนๆ ไม่ใช่ปุ่มคลิกได้เหมือน components/StatCard.tsx ตัวเต็ม (ที่ใช้ใน
// staff-approvals) เพราะ tile ที่ใช้ component นี้ทั้งใบห่อด้วย <Link> ไปหน้ารายละเอียดเต็ม
// อยู่แล้ว — ถ้าซ้อน <button> ไว้ข้างในอีกจะกลายเป็น interactive element ซ้อนกัน (ผิด HTML
// semantics + คลิกแล้วพฤติกรรมกำกวมว่าจะไปไหน) ใช้ตัวเลข/สี/ไอคอนชุดเดียวกับ StatCard เพื่อ
// ความสม่ำเสมอทางสายตากับหน้า staff-approvals แค่ตัวเล็กลงให้พอดีกับพื้นที่แคบของ tile บน hub
export function MiniStat({ icon: Icon, value, label, iconBg, iconText }: {
  icon: LucideIcon; value: number; label: string; iconBg: string; iconText: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white/80 p-2 flex flex-col gap-1 min-w-0">
      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${iconBg} ${iconText}`}>
        <Icon className="w-3 h-3" strokeWidth={2.5} />
      </div>
      <p className="text-base font-black text-[#241F5E] leading-none tabular-nums">{value.toLocaleString('th-TH')}</p>
      <p className="text-[9px] font-bold text-[#6B6698] leading-tight truncate">{label}</p>
    </div>
  );
}

export default MiniStat;
