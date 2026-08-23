'use client';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

// แทนที่ window.confirm() (~4 จุด: CSR customers page ต่ออายุ/ยกเลิกสิทธิ์/เปิดใช้งานอีกครั้ง,
// Manager staff-approvals อนุมัติพนักงาน — สแกนทั้ง app/ + components/ แล้วไม่มีจุดอื่นอีกทั้ง
// Logistics/WH/Sale/ฝั่งลูกค้า) ด้วย modal ธีมเดียวกับ modal อื่นในระบบ (overlay + card +
// แถบสีบนหัว + ปุ่มยกเลิก/ยืนยัน — pattern เดียวกับ modal ยืนยันส่งรถของ Logistics,
// ตรวจรับของ WH ฯลฯ) — window.confirm() คืนค่า boolean แบบ synchronous (บล็อกทั้งหน้าจอรอ
// ผู้ใช้กด) แต่ modal จริงต้องรอ user คลิกปุ่ม จึงต้องเป็น Promise<boolean> แทน — จุดที่เรียกใช้
// เดิม `if (!confirm('...')) return;` แค่เติม await ข้างหน้า (`if (!(await confirm('...')))
// return;`) ก็ใช้ได้ทันทีเพราะ handler ทุกจุดเป็น async function อยู่แล้ว ไม่ต้องเปลี่ยน logic อื่น
type ConfirmVariant = 'default' | 'destructive';

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
};

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

type PendingConfirm = Required<Pick<ConfirmOptions, 'message'>> &
  Omit<ConfirmOptions, 'message'> & { id: number };

const ConfirmContext = createContext<ConfirmFn | null>(null);

let nextId = 1;

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  // resolve ของ Promise ที่ค้างอยู่ — เก็บใน ref เพราะไม่ใช่ state ที่ต้อง trigger re-render เอง
  // (re-render มาจาก setPending อยู่แล้ว)
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirmFn = useCallback<ConfirmFn>((options) => {
    const normalized: ConfirmOptions = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPending({ id: nextId++, ...normalized });
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setPending(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirmFn}>
      {children}

      {pending && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-card rounded-lg shadow-lg overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div className={`h-1.5 ${pending.variant === 'destructive' ? 'bg-destructive' : 'bg-primary'}`} />
            <div className="p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                  pending.variant === 'destructive' ? 'bg-destructive/10' : 'bg-primary/10'
                }`}>
                  {pending.variant === 'destructive'
                    ? <AlertTriangle size={22} className="text-destructive" strokeWidth={2.5} />
                    : <HelpCircle size={22} className="text-primary" strokeWidth={2.5} />}
                </div>
                <div className="min-w-0">
                  {pending.title && <h3 className="text-base font-bold text-foreground">{pending.title}</h3>}
                  <p className={pending.title ? 'text-sm text-muted-foreground mt-0.5' : 'text-sm font-semibold text-foreground'}>
                    {pending.message}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => settle(false)}
                  className="py-3.5 rounded-md font-bold text-sm text-muted-foreground bg-secondary border border-border hover:bg-muted transition-colors active:scale-[0.98]"
                >
                  {pending.cancelLabel || 'ยกเลิก'}
                </button>
                <button
                  type="button"
                  onClick={() => settle(true)}
                  autoFocus
                  className={`py-3.5 rounded-md font-bold text-sm text-white transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 ${
                    pending.variant === 'destructive'
                      ? 'bg-destructive hover:bg-destructive/90'
                      : 'bg-primary hover:bg-primary/90'
                  }`}
                >
                  {pending.confirmLabel || 'ยืนยัน'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm() ต้องถูกเรียกภายใน <ConfirmDialogProvider> เท่านั้น');
  return ctx;
}
