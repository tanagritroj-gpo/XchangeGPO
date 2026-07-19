"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";

/**
 * StickyReturnCTA
 *
 * ปุ่มลอย/แถบล่าง พาไปหน้ากรอกฟอร์มคืนสินค้า (/form)
 * โผล่หลังผู้ใช้เลื่อนผ่าน hero ไปแล้ว (กันไม่ให้ซ้ำกับปุ่มใน hero
 * ตอนที่ยังมองเห็นอยู่) เป็น client component เพราะต้องฟัง scroll event
 */
export function StickyReturnCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 320);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 sm:inset-x-auto sm:bottom-6 sm:right-6 ${
        visible ? "translate-y-0" : "translate-y-24 sm:translate-y-32"
      }`}
    >
      {/* Mobile: แถบเต็มความกว้างท้ายจอ */}
      <Link
        href="/form"
        className="flex items-center justify-center gap-2 bg-[#F97362] px-4 py-3.5 text-sm font-medium text-white shadow-[0_-2px_16px_rgba(0,0,0,0.12)] active:bg-[#E2634F] sm:hidden"
      >
        <ClipboardList className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        ยื่นเรื่องคืนสินค้า
      </Link>

      {/* Desktop: ปุ่มลอยมุมล่างขวา */}
      <Link
        href="/form"
        className="hidden items-center gap-2 rounded-full bg-[#F97362] px-5 py-3 text-sm font-medium text-white shadow-[0_8px_24px_rgba(249,115,98,0.35)] transition hover:bg-[#E2634F] hover:shadow-[0_10px_28px_rgba(249,115,98,0.45)] sm:flex"
      >
        <ClipboardList className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        ยื่นเรื่องคืนสินค้า
      </Link>
    </div>
  );
}

export default StickyReturnCTA;