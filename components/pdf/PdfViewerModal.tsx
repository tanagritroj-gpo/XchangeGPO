'use client';

import { useEffect } from 'react';
import { FileDown, X } from 'lucide-react';

// ── โมดัลดูไฟล์ PDF ใบรับคืนสินค้า — pattern เดียวกับตอนสร้างแบบฟอร์มเสร็จใหม่ๆ
// (ReviewSuccessCard.tsx) และหน้าติดตามสถานะของลูกค้า (TrackingDetailView.tsx)
// แยกออกมาเป็น component กลางเพื่อให้หน้า "ประวัติการยื่นคำร้อง" ใช้ตัวเดียวกันได้
// signed URL อายุ 5 นาที (สร้างสดทุกครั้งที่เปิด ไม่ cache)

export function PdfViewerModal({
  url,
  title = 'ใบรับคืนสินค้า',
  onClose,
}: {
  url: string;
  title?: string;
  onClose: () => void;
}) {
  // ปิดด้วย Esc — โมดัลนี้ครอบทั้งจอ ผู้ใช้ที่ถือคีย์บอร์ดคาดหวังปุ่ม Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm md:p-6 print:hidden"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="relative flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md border border-teal-100 bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-700 transition-colors hover:bg-teal-100"
            >
              <FileDown className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
              เปิดแท็บใหม่ / ดาวน์โหลด
            </a>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="ปิด"
            >
              <X className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            </button>
          </div>
        </div>
        <iframe src={url} className="w-full flex-1" title={title} />
      </div>
    </div>
  );
}
