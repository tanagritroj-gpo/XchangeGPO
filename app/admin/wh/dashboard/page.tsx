'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getWHData, confirmCheckedInBatch } from '@/app/actions/wh-actions';
import WHDrugRow from './component/WHDrugrow';

// ── Request Card ────────────────────────────────────────────────
function RequestCard({ req, onItemUpdate, onConfirmCheckedIn }: {
  req: any;
  onItemUpdate: (itemId: number, newStatus: 'checked_in' | 'receiving' | 'rejected') => void;
  onConfirmCheckedIn: (requestId: number) => Promise<void>;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const items = req.drug_items ?? [];
  const confirmed = req._confirmStep === 'storage';

  // ── Logic ใหม่: กรองเฉพาะรายการที่ใช้งาน (ไม่นับ rejected) ──
  const activeItems = items.filter((i: any) => i.current_status !== 'rejected');

  // unlock ปุ่ม "ยืนยันตรวจรับทั้งใบ" เมื่อทุก item ที่ใช้งาน (ไม่นับ rejected) เป็น checked_in หรือ receiving แล้ว
  const allCheckedIn = activeItems.length > 0 && activeItems.every((i: any) => ['checked_in', 'receiving'].includes(i.current_status));
  const someCheckedIn = activeItems.some((i: any) => i.current_status === 'checked_in');
  const noneReceiving = activeItems.every((i: any) => i.current_status !== 'receiving');
  const showConfirmBtn = allCheckedIn && someCheckedIn && noneReceiving && !confirmed;

  // progress: แสดงเฉพาะรายการที่รับเข้าแล้ว จากรายการทั้งหมดที่ใช้งาน
  const doneCount = activeItems.filter((i: any) => ['checked_in', 'receiving'].includes(i.current_status)).length;
  const totalActive = activeItems.length;

  const handleConfirm = async () => {
    setIsConfirming(true);
    try { await onConfirmCheckedIn(req.id); }
    finally { setIsConfirming(false); }
  };

  return (
    <div className="px-7 py-5 hover:bg-slate-50/30 transition-colors">

      {/* Request header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-sm font-black text-slate-700 bg-slate-100 px-3 py-1 rounded-lg">{req.ref_id}</span>
          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">
            🏥 {req.hospital_name}
          </span>
        </div>
        {/* Progress indicator */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
          <span className="text-teal-600 font-bold">{doneCount}</span>
          <span>/</span>
          <span>{totalActive}</span>
          <span>รับเข้าแล้ว {activeItems.length !== items.length && `(จาก ${items.length} รายการ)`}</span>
        </div>
      </div>

      {/* Drug items */}
      <div className="space-y-2 mb-4">
        {items.map((item: any) => (
          <WHDrugRow
            key={item.id}
            item={item}
            reqConfirmed={confirmed}
            onUpdate={onItemUpdate}
          />
        ))}
      </div>

      {/* ── Confirm Button Area (Step 1b) ── */}
      {showConfirmBtn && (
        <div className="relative rounded-2xl overflow-hidden">
          <div className="h-1" style={{ background: 'linear-gradient(90deg,#0f5132,#14b8a6)' }} />
          <div className="bg-teal-50 border border-teal-100 px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black text-teal-800">✅ ตรวจรับครบทุกรายการแล้ว</p>
              <p className="text-[11px] text-teal-600 mt-0.5">กดยืนยันเพื่อเปิดขั้นตอนจัดเก็บสินค้าเข้าคลัง</p>
            </div>
            <button
              onClick={handleConfirm}
              disabled={isConfirming}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm text-white shadow-lg transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
              style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)', boxShadow: '0 8px 20px -6px rgba(26,122,69,0.45)' }}
            >
              {isConfirming
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> กำลังยืนยัน...</>
                : <>✓ ยืนยันตรวจรับทั้งใบ</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2 hint: หลัง confirm แล้ว ── */}
      {confirmed && (
        <div className="rounded-2xl overflow-hidden">
          <div className="h-1" style={{ background: 'linear-gradient(90deg,#1d4ed8,#3b82f6)' }} />
          <div className="bg-blue-50 border border-blue-100 px-5 py-3">
            <p className="text-xs font-bold text-blue-700">📦 ยืนยันตรวจรับแล้ว — กด "จัดเก็บ" ทีละรายการเพื่อจัดเก็บเข้าคลัง</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────
export default function WHDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    const res = await getWHData();
    if (res.success) setData(res.data || []);
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ── Optimistic update รายชิ้น ──
  const handleItemUpdate = (requestId: number, itemId: number, newStatus: 'checked_in' | 'receiving' | 'rejected') => {
    setData(prev => {
      let shouldRemove = false;
      const updated = prev.map(req => {
        if (req.id !== requestId) return req;
        const updatedItems = req.drug_items.map((it: any) =>
          it.id === itemId ? { ...it, current_status: newStatus } : it
        );
        // ตัดใบงานออกเมื่อทุกชิ้น receiving ครบ
        if (updatedItems.every((i: any) => i.current_status === 'receiving')) shouldRemove = true;
        return { ...req, drug_items: updatedItems };
      });
      return shouldRemove ? updated.filter(req => req.id !== requestId) : updated;
    });
  };

  // ── ยืนยันตรวจรับทั้งใบ → mark _confirmStep = 'storage' ──
  const handleConfirmCheckedIn = async (requestId: number) => {

    const res = await confirmCheckedInBatch(requestId, 'ยืนยันตรวจรับทั้งใบงาน');
    if (res.success) {
      setData(prev => prev.map(req =>
        req.id !== requestId ? req : { ...req, _confirmStep: 'storage' }
      ));
    } else {
      alert('ยืนยันไม่สำเร็จ: ' + res.error);
    }
  };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground font-medium">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">

      {/* ── Top Bar ── */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-border shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.replace('/')}
              className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground bg-slate-50 hover:bg-slate-100 px-3 py-2 rounded-xl transition-all group">
              <span className="group-hover:-translate-x-0.5 transition-transform">←</span> ย้อนกลับ
            </button>
            <div className="w-px h-5 bg-slate-200" />
            <div>
              <h1 className="text-base font-black text-foreground leading-tight">GPO StaffCommand Center</h1>
              <p className="text-[11px] text-muted-foreground">GPO Xchange Portal • Warehouse Operations</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
              รอดำเนินการ {data.length} ใบงาน
            </span>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <section className="bg-white rounded-3xl shadow-md border border-border overflow-hidden">

          {/* Section header */}
          <div className="flex items-center gap-3 px-7 py-5 border-b border-border"
            style={{ background: 'linear-gradient(90deg,#f0fdf4,#ffffff)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-sm"
              style={{ background: 'linear-gradient(135deg,#bbf7d0,#34d399)' }}>🏭</div>
            <div>
              <h2 className="text-sm font-black text-foreground">Warehouse Operations</h2>
              <p className="text-xs text-muted-foreground">{data.length} ใบงาน • ตรวจรับและจัดเก็บสินค้าเข้าคลัง</p>
            </div>
          </div>

          {/* Table column labels — ซ่อนบนมือถือ เพราะ WHDrugRow เปลี่ยนเป็น layout การ์ด
              2 คอลัมน์พร้อม label ในตัวเองแล้ว ไม่ตรงกับหัวตารางนี้อีกต่อไป */}
          <div className="hidden md:grid grid-cols-12 gap-3 px-7 py-3 bg-slate-50 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-4">ชื่อยา / Lot No.</div>
            <div className="col-span-2">หมดอายุ</div>
            <div className="col-span-2 text-right">จำนวน</div>
            <div className="col-span-2">สถานะ</div>
            <div className="col-span-2 text-right">Action</div>
          </div>

          {/* Empty state */}
          {data.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-4xl mb-3">🏭</div>
              <p className="text-sm text-muted-foreground font-medium">ไม่มีงานค้างในคลังสินค้า</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {data.map((req) => (
                <RequestCard
                  key={req.id}
                  req={req}
                  onItemUpdate={(itemId, newStatus) => handleItemUpdate(req.id, itemId, newStatus)}
                  onConfirmCheckedIn={handleConfirmCheckedIn}
                />
              ))}
            </div>
          )}

        </section>
      </div>
    </div>
  );
}