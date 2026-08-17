'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, X, Loader2 } from 'lucide-react';
import { getDeliveryNotePhotoUrls } from '@/app/actions/csr-actions';
import type { RequestRow } from '@/lib/types';

type Photo = { index: number; url: string };

// ── badge เล็กในแถว "CSR Workflow" — โผล่เฉพาะใบงานที่มีรูปใบส่งของแนบมาตอนลูกค้ากรอกฟอร์มเอง
// (Step2Items.tsx, allowDeliveryPhoto) — ★ ระดับคำร้อง ไม่ใช่ระดับรายการยา (ใบส่งของคือเอกสาร
// 1 ใบต่อการจัดส่ง ไม่ใช่ 1 ใบต่อยา 1 รายการ) กดแล้วดึง signed URL สดๆ ทุกรูปของใบงานนี้ (ไม่
// fetch ล่วงหน้า กันเปลืองถ้าไม่มีใครกดดู) แสดงเป็น gallery ใน modal — โครง modal (portal +
// backdrop click-to-close + stopPropagation) pattern เดียวกับ CSRDrugRow.tsx ──
export default function DeliveryPhotoBadge({ req }: { req: RequestRow }) {
  const photoCount = req.delivery_note_photo_paths?.length ?? 0;
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [hasError, setHasError] = useState(false);

  if (photoCount === 0) return null;

  const handleOpen = async () => {
    setIsOpen(true);
    setIsLoading(true);
    setHasError(false);
    const res = await getDeliveryNotePhotoUrls(req.id);
    const ok = res.success && 'photos' in res;
    setPhotos(ok ? (res.photos ?? []) : []);
    setHasError(!ok);
    setIsLoading(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-full border border-blue-100 transition-colors shrink-0"
      >
        <Camera size={12} strokeWidth={2.5} />
        รูปใบส่งของ
      </button>

      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-6 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
              <h3 className="text-sm font-bold text-[#241F5E] flex items-center gap-1.5">
                <Camera size={14} strokeWidth={2.5} /> รูปใบส่งของ ({isLoading ? photoCount : photos.length})
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-slate-100 hover:text-slate-600 transition-all"
                aria-label="ปิด"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-[#6B6698]" />
                </div>
              ) : hasError ? (
                <p className="text-sm text-red-600 text-center py-16">โหลดรูปใบส่งของไม่สำเร็จ กรุณาลองใหม่</p>
              ) : photos.length === 0 ? (
                <p className="text-sm text-[#6B6698] text-center py-16">ไม่พบรูปใบส่งของ</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {photos.map((p) => (
                    <a
                      key={p.index}
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block rounded-xl overflow-hidden border border-slate-100"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- รูปจาก signed URL ของ private bucket ไม่ใช่ static asset ที่ next/image จัดการได้ */}
                      <img src={p.url} alt={`รูปใบส่งของ ${p.index + 1}`} className="w-full h-48 object-cover group-hover:opacity-90 transition-opacity" />
                      <p className="text-xs font-bold text-[#241F5E] px-3 py-2">รูปที่ {p.index + 1}</p>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
