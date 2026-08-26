'use client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

// แทนที่ alert()/window.confirm ที่กระจายอยู่ทั่วระบบ (~60 จุด) ด้วย toast แบบเดียวกันทั้งแอป
// — alert() เป็น browser-native dialog บล็อกทั้งหน้าจอ ดูหลุดธีมและหยาบกว่า UI ที่เหลือทั้งหมด
// มาก ตัวนี้เป็น non-blocking, สไตล์ตรงกับ token ของระบบ (bg-card/border/rounded-lg เหมือน
// modal อื่นๆ), และ dismiss เองอัตโนมัติ — hand-roll เอง (ไม่ดึง sonner/react-hot-toast เพิ่ม)
// เพราะ UI primitive อื่นในระบบ (Skeleton, PasswordInput) ก็ทำเองทั้งหมดอยู่แล้ว ไม่อยากเพิ่ม
// dependency ใหม่สำหรับ component ง่ายขนาดนี้
type ToastVariant = 'success' | 'error';

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const VARIANT_STYLE: Record<ToastVariant, { Icon: typeof CheckCircle2; border: string; iconBg: string; iconText: string }> = {
  success: { Icon: CheckCircle2, border: 'border-l-emerald-500', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600' },
  error:   { Icon: XCircle,      border: 'border-l-destructive', iconBg: 'bg-destructive/10', iconText: 'text-destructive' },
};

const AUTO_DISMISS_MS = 5000;

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ใส่ toast ใหม่ไว้ "หน้าสุด" ของ array (ไม่ใช่ต่อท้าย) — เพราะ container ยึดขอบบนแล้ว
  // (ดู comment ที่ตำแหน่ง container ด้านล่าง) อยากให้ toast ล่าสุดอยู่ใกล้ขอบบนสุดเสมอ
  // ดันตัวเก่ากว่าลงมาด้านล่าง ไม่ใช่โผล่ท้าย stack ที่มองไม่เห็นง่ายๆ
  const push = useCallback((message: string, variant: ToastVariant) => {
    const id = nextId++;
    setToasts((prev) => [{ id, message, variant }, ...prev]);
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    success: (message: string) => push(message, 'success'),
    error: (message: string) => push(message, 'error'),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* Responsive: บนขวา (top-right) บนจอ md ขึ้นไป — บนกลาง (top-center) บนมือถือ เพราะ
          บนขวาของมือถือมักชนกับปุ่ม/กระดิ่งแจ้งเตือนในมุมขวาบนของ topbar หลายหน้า — เดิมเคย
          ลองมุมล่างขวา (bottom-right) แล้วเจอปัญหาจริง 2 จุด: (1) ชนกับ BottomNav.tsx ที่ CSR/
          Manager hub มี fixed bottom-0 อยู่แล้วบนมือถือ (2) คีย์บอร์ดเสมือนตอนกรอกฟอร์มบนมือถือ
          บังของที่อยู่ล่างสุดจอ — z สูงกว่า modal (z-50) เพราะ toast ต้องเห็นแม้มี modal เปิดอยู่
          (เช่น modal ปิดพร้อมกับ toast ผลลัพธ์โผล่ขึ้นมาพร้อมกัน) */}
      {/* top-[72px] ไม่ใช่ top-4 เฉยๆ — เจอตอนทดสอบจริงว่า top-4 ทับกับ header สูง 56px ที่
          ครอบทุกหน้าจาก app/layout.tsx (โลโก้ GPO + "สาขาภาคใต้") เว้น 16px ใต้ header แทน */}
      <div className="fixed top-[72px] left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-4 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
        {toasts.map((t) => {
          const cfg = VARIANT_STYLE[t.variant];
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 bg-card border border-border ${cfg.border} border-l-[3px] rounded-lg shadow-lg p-3.5 pr-2.5 animate-in slide-in-from-top-2 fade-in duration-200`}
            >
              <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${cfg.iconBg}`}>
                <cfg.Icon size={15} className={cfg.iconText} strokeWidth={2.5} />
              </div>
              <p className="flex-1 text-sm text-foreground leading-snug pt-1">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-secondary transition-colors"
                aria-label="ปิดการแจ้งเตือน"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast() ต้องถูกเรียกภายใน <ToastProvider> เท่านั้น');
  return ctx;
}
