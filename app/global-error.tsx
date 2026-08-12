'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// จับ error ระดับร้ายแรงที่สุด (root layout เอง render พัง) — ต้องมี <html>/<body> ของ
// ตัวเอง เพราะ error ระดับนี้แทนที่ root layout ทั้งก้อนไปเลย ไม่ใช่แค่ error.tsx ปกติ
// ที่ยัง render อยู่ใน layout เดิมได้
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="th">
      <body>
        <div className="min-h-screen flex items-center justify-center bg-background px-6">
          <div className="text-center space-y-4 max-w-sm">
            <div className="text-4xl">⚠️</div>
            <h1 className="text-lg font-black text-foreground">เกิดข้อผิดพลาดที่ไม่คาดคิด</h1>
            <p className="text-sm text-muted-foreground">
              ระบบขัดข้องชั่วคราว ทีมงานได้รับแจ้งเตือนแล้ว กรุณาลองใหม่อีกครั้ง
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl font-bold text-white text-sm shadow-md"
              style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)' }}
            >
              โหลดหน้าใหม่
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
