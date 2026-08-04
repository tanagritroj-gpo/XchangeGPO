'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Warehouse, User, LogOut, Loader2, Building2, CheckCircle2, Check,
  PackageCheck, PackageSearch, Boxes, ChevronLeft, ChevronRight, ClipboardList,
} from 'lucide-react';
import { getWHData, confirmCheckedInBatch } from '@/app/actions/wh-actions';
import { getStaffSession, logoutStaffAction } from '@/app/actions/auth-staff';
import WHDrugRow from './component/WHDrugrow';
import type { LucideIcon } from 'lucide-react';
import type { RequestRow, DrugItemRow, StaffSessionInfo } from '@/lib/types';

type WHRequestRow = RequestRow & { _confirmStep?: string };

// ── Request Card ────────────────────────────────────────────────
function RequestCard({ req, onItemUpdate, onConfirmCheckedIn }: {
  req: WHRequestRow;
  onItemUpdate: (itemId: number, newStatus: 'checked_in' | 'receiving' | 'rejected') => void;
  onConfirmCheckedIn: (requestId: number) => Promise<void>;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const items = req.drug_items ?? [];
  const confirmed = req._confirmStep === 'storage';

  // ── Logic ใหม่: กรองเฉพาะรายการที่ใช้งาน (ไม่นับ rejected) ──
  const activeItems = items.filter((i: DrugItemRow) => i.current_status !== 'rejected');

  // unlock ปุ่ม "ยืนยันตรวจรับทั้งใบ" เมื่อทุก item ที่ใช้งาน (ไม่นับ rejected) เป็น checked_in หรือ receiving แล้ว
  const allCheckedIn = activeItems.length > 0 && activeItems.every((i: DrugItemRow) => ['checked_in', 'receiving'].includes(i.current_status ?? ''));
  const someCheckedIn = activeItems.some((i: DrugItemRow) => i.current_status === 'checked_in');
  const noneReceiving = activeItems.every((i: DrugItemRow) => i.current_status !== 'receiving');
  const showConfirmBtn = allCheckedIn && someCheckedIn && noneReceiving && !confirmed;

  // progress: แสดงเฉพาะรายการที่รับเข้าแล้ว จากรายการทั้งหมดที่ใช้งาน
  const doneCount = activeItems.filter((i: DrugItemRow) => ['checked_in', 'receiving'].includes(i.current_status ?? '')).length;
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
          <span className="flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">
            <Building2 size={12} strokeWidth={2.5} /> {req.hospital_name}
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
        {items.map((item: DrugItemRow) => (
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
              <p className="text-sm font-black text-teal-800 flex items-center gap-1.5">
                <CheckCircle2 size={15} strokeWidth={2.5} /> ตรวจรับครบทุกรายการแล้ว
              </p>
              <p className="text-[11px] text-teal-600 mt-0.5">กดยืนยันเพื่อเปิดขั้นตอนจัดเก็บสินค้าเข้าคลัง</p>
            </div>
            <button
              onClick={handleConfirm}
              disabled={isConfirming}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm text-white shadow-lg transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
              style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)', boxShadow: '0 8px 20px -6px rgba(26,122,69,0.45)' }}
            >
              {isConfirming
                ? <><Loader2 size={15} className="animate-spin" strokeWidth={2.5} /> กำลังยืนยัน...</>
                : <><Check size={15} strokeWidth={3} /> ยืนยันตรวจรับทั้งใบ</>
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
            <p className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
              <PackageCheck size={14} strokeWidth={2.5} /> ยืนยันตรวจรับแล้ว — กด &quot;จัดเก็บ&quot; ทีละรายการเพื่อจัดเก็บเข้าคลัง
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const WH_PAGE_SIZE = 5;

// ── ปุ่ม tab แนวตั้ง — แพทเทิร์นเดียวกับ Logistics Dashboard (แถบซ้ายสีเขียว
// ค้างไว้ตอนเลือก, จางๆ ตอน hover) ──
function WHTabButton({ icon: Icon, label, count, active, onClick, accentBg, accentColor }: {
  icon: LucideIcon; label: string; count: number; active: boolean; onClick: () => void;
  accentBg: string; accentColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 shrink-0 md:w-full text-left border overflow-hidden
        ${active
          ? 'bg-white shadow-sm border-border text-foreground'
          : 'bg-transparent border-transparent text-muted-foreground hover:bg-white/70 hover:text-slate-700'}`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-[3px] transition-opacity duration-150 ${
          active ? 'bg-teal-500 opacity-100' : 'bg-teal-400 opacity-0 group-hover:opacity-100'
        }`}
      />
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${active ? accentBg : 'bg-slate-100'}`}>
        <Icon size={15} className={active ? accentColor : 'text-muted-foreground'} strokeWidth={2.5} />
      </span>
      <span className="whitespace-nowrap md:whitespace-normal md:flex-1">{label}</span>
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${active ? `${accentBg} ${accentColor}` : 'bg-slate-100 text-muted-foreground'}`}>
        {count}
      </span>
    </button>
  );
}

// ── การ์ดสถิติสรุปย่อ — ใช้แทนป้าย "N ใบงาน" ตัวเดียวเดิมในแถบด้านบน
// (เหมือน Logistics Dashboard) ไฮไลต์กรอบสีตามแท็บที่กำลังเลือกอยู่ ──
function StatCard({ icon: Icon, value, label, iconBg, iconText, isActive, activeBorder, activeRing }: {
  icon: LucideIcon; value: number; label: string; iconBg: string; iconText: string;
  isActive?: boolean; activeBorder?: string; activeRing?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border bg-white p-3.5 md:p-4 shadow-sm transition-all duration-200 ${
        isActive ? `${activeBorder} ${activeRing} shadow-md` : 'border-border'
      }`}
    >
      <div className={`flex h-10 w-10 md:h-11 md:w-11 shrink-0 items-center justify-center rounded-xl ${iconBg} ${iconText}`}>
        <Icon className="h-5 w-5" strokeWidth={2.25} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xl md:text-2xl font-black leading-tight text-foreground">{value.toLocaleString('th-TH')}</p>
        <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-snug text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ── รายการใบงาน + แบ่งหน้า 5 รายการ (เหมือน Logistics/CSR Report Center) ใช้ร่วมกัน
// ทั้งแท็บ "รอตรวจรับ" และ "รอจัดเก็บ" ──
function WHRequestList({ items, onItemUpdate, onConfirmCheckedIn, emptyText }: {
  items: WHRequestRow[];
  onItemUpdate: (requestId: number, itemId: number, newStatus: 'checked_in' | 'receiving' | 'rejected') => void;
  onConfirmCheckedIn: (requestId: number) => Promise<void>;
  emptyText: string;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / WH_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = items.slice((currentPage - 1) * WH_PAGE_SIZE, currentPage * WH_PAGE_SIZE);

  return (
    <section className="bg-white rounded-3xl shadow-md border border-border overflow-hidden">

      {/* Table column labels — ซ่อนบนมือถือ เพราะ WHDrugRow เปลี่ยนเป็น layout การ์ด
          2 คอลัมน์พร้อม label ในตัวเองแล้ว ไม่ตรงกับหัวตารางนี้อีกต่อไป */}
      {items.length > 0 && (
        <div className="hidden md:grid grid-cols-12 gap-3 px-7 py-3 bg-slate-50 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          <div className="col-span-4">ชื่อยา / Lot No.</div>
          <div className="col-span-2">หมดอายุ</div>
          <div className="col-span-2 text-right">จำนวน</div>
          <div className="col-span-2">สถานะ</div>
          <div className="col-span-2 text-right">Action</div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="py-16 text-center">
          <Warehouse className="w-10 h-10 text-slate-300 mx-auto mb-3" strokeWidth={1.75} />
          <p className="text-sm text-muted-foreground font-medium">{emptyText}</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-50">
            {pagedItems.map((req) => (
              <RequestCard
                key={req.id}
                req={req}
                onItemUpdate={(itemId, newStatus) => onItemUpdate(req.id, itemId, newStatus)}
                onConfirmCheckedIn={onConfirmCheckedIn}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-7 py-3.5 border-t border-border bg-slate-50">
              <p className="text-xs text-muted-foreground">
                แสดง {(currentPage - 1) * WH_PAGE_SIZE + 1}–{Math.min(currentPage * WH_PAGE_SIZE, items.length)} จาก {items.length} รายการ
              </p>
              <div className="flex items-center gap-1 overflow-x-auto">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
                  aria-label="หน้าก่อนหน้า"
                >
                  <ChevronLeft size={16} strokeWidth={2.5} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                      p === currentPage ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
                  aria-label="หน้าถัดไป"
                >
                  <ChevronRight size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Main Component ─────────────────────────────────────────────
export default function WHDashboard() {
  const router = useRouter();
  const [data, setData] = useState<WHRequestRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [staff, setStaff] = useState<StaffSessionInfo | null>(null);
  const [today, setToday] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<'at_warehouse' | 'checked_in'>('at_warehouse');

  useEffect(() => {
    setToday(new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const [staffSession, res] = await Promise.all([getStaffSession(), getWHData()]);
    setStaff(staffSession);
    if (res.success) setData(res.data || []);
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutStaffAction();
    router.push('/');
  };

  // ── Optimistic update รายชิ้น ──
  const handleItemUpdate = (requestId: number, itemId: number, newStatus: 'checked_in' | 'receiving' | 'rejected') => {
    setData(prev => {
      let shouldRemove = false;
      const updated = prev.map(req => {
        if (req.id !== requestId) return req;
        const updatedItems = (req.drug_items ?? []).map((it: DrugItemRow) =>
          it.id === itemId ? { ...it, current_status: newStatus } : it
        );
        // ตัดใบงานออกเมื่อทุกชิ้น receiving ครบ
        if (updatedItems.every((i: DrugItemRow) => i.current_status === 'receiving')) shouldRemove = true;
        return { ...req, drug_items: updatedItems };
      });
      return shouldRemove ? updated.filter(req => req.id !== requestId) : updated;
    });
  };

  // ── ยืนยันตรวจรับทั้งใบ → เซ็ต current_status เป็น 'checked_in' (ตรงกับที่ฝั่ง
  // server อัปเดตจริง) เพื่อให้ย้ายไปแท็บ "รอจัดเก็บ" ได้ทันทีโดยไม่ต้อง refetch ──
  const handleConfirmCheckedIn = async (requestId: number) => {
    const res = await confirmCheckedInBatch(requestId, 'ยืนยันตรวจรับทั้งใบงาน');
    if (res.success) {
      setData(prev => prev.map(req =>
        req.id !== requestId ? req : { ...req, current_status: 'checked_in', _confirmStep: 'storage' }
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

  const atWarehouseRequests = data.filter(req => req.current_status === 'at_warehouse');
  const checkedInRequests   = data.filter(req => req.current_status === 'checked_in');

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
          <div className="flex items-center gap-2">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-red-600 bg-white hover:bg-red-50 border border-emerald-100 hover:border-red-200 px-3.5 py-2 rounded-xl transition-colors disabled:opacity-60 disabled:pointer-events-none"
            >
              {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              <span className="hidden sm:inline">ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* ── Welcome Banner — ธีมเขียว/มรกตให้เข้ากับสีของหน้านี้ (เหมือนแนวคิด CSR welcome page) ── */}
        <div className="relative overflow-hidden rounded-3xl bg-emerald-600 p-8 text-white shadow-lg shadow-emerald-200">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-20 bg-white" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full opacity-15 bg-white" />
          <div className="absolute top-1/2 right-24 w-20 h-20 rounded-full opacity-10 bg-white hidden md:block" />
          <div className="absolute top-6 left-1/3 w-3 h-3 rounded-full bg-lime-200 opacity-80 hidden md:block" />
          <div className="absolute bottom-10 right-1/3 w-2 h-2 rounded-full bg-lime-200 opacity-70 hidden md:block" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-emerald-100 text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-lime-200 animate-pulse" /> ยินดีต้อนรับ
              </p>
              <h1 className="text-2xl md:text-3xl font-black leading-tight flex items-center gap-2">
                สวัสดีคุณ {staff?.full_name || staff?.username}
                <User className="w-6 h-6 opacity-80" />
              </h1>
              <p className="text-emerald-50 mt-1.5 flex items-center gap-1.5 text-sm">
                <Warehouse className="w-4 h-4" /> แผนกคลังสินค้า (Warehouse)
              </p>
              <p className="text-emerald-50/90 mt-3 text-sm leading-relaxed">
                ขอให้มีความสุขตลอดการทำงาน ในวันที่สดใส{today && <> {today}</>}
              </p>
            </div>
            <div className="bg-white/15 border border-white/25 rounded-2xl px-5 py-4 text-center hidden md:block backdrop-blur-sm">
              <p className="text-emerald-100 text-[11px] font-semibold uppercase tracking-wide mb-1">สถานะบัญชี</p>
              <div className="flex items-center gap-1.5 justify-center">
                <span className="w-2 h-2 rounded-full bg-lime-300 animate-pulse" />
                <span className="text-white font-bold text-sm">Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Warehouse Operations header — คงอีโมจิหลัก 🏭 ไว้ตามเดิม ── */}
        <div className="rounded-2xl overflow-hidden shadow-sm border border-border">
          <div className="flex items-center gap-3 px-7 py-5"
            style={{ background: 'linear-gradient(90deg,#f0fdf4,#ffffff)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-sm"
              style={{ background: 'linear-gradient(135deg,#bbf7d0,#34d399)' }}>🏭</div>
            <div>
              <h2 className="text-sm font-black text-foreground">Warehouse Operations</h2>
              <p className="text-xs text-muted-foreground">{data.length} ใบงาน • ตรวจรับและจัดเก็บสินค้าเข้าคลัง</p>
            </div>
          </div>
        </div>

        {/* ── สถิติสรุปย่อ — แทนป้าย "รอดำเนินการ N ใบงาน" ตัวเดียวเดิมที่เคยอยู่บนแถบด้านบน ── */}
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          <StatCard icon={ClipboardList} value={data.length} label="ใบงานรวม" iconBg="bg-slate-100" iconText="text-slate-600" />
          <StatCard
            icon={PackageSearch} value={atWarehouseRequests.length} label="รอตรวจรับ" iconBg="bg-amber-100" iconText="text-amber-600"
            isActive={activeTab === 'at_warehouse'} activeBorder="border-amber-300" activeRing="ring-2 ring-amber-100"
          />
          <StatCard
            icon={Boxes} value={checkedInRequests.length} label="รอจัดเก็บเข้าคลัง" iconBg="bg-blue-100" iconText="text-blue-600"
            isActive={activeTab === 'checked_in'} activeBorder="border-blue-300" activeRing="ring-2 ring-blue-100"
          />
        </div>

        <div className="flex flex-col md:flex-row gap-4 md:gap-8">

          {/* ══ Sidebar Tabs (แนวตั้ง — เหมือน Logistics Dashboard) ══ */}
          <aside className="md:w-60 shrink-0">
            <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible -mx-1 px-1 md:mx-0 md:px-0 pb-1 md:pb-0">
              <WHTabButton
                icon={PackageSearch} label="รอตรวจรับ" count={atWarehouseRequests.length}
                active={activeTab === 'at_warehouse'} onClick={() => setActiveTab('at_warehouse')}
                accentBg="bg-amber-100" accentColor="text-amber-600"
              />
              <WHTabButton
                icon={Boxes} label="รอจัดเก็บเข้าคลัง" count={checkedInRequests.length}
                active={activeTab === 'checked_in'} onClick={() => setActiveTab('checked_in')}
                accentBg="bg-blue-100" accentColor="text-blue-600"
              />
            </nav>
          </aside>

          {/* ══ Content ══ */}
          <div className="flex-1 min-w-0">
            {activeTab === 'at_warehouse' && (
              <WHRequestList
                items={atWarehouseRequests}
                onItemUpdate={handleItemUpdate}
                onConfirmCheckedIn={handleConfirmCheckedIn}
                emptyText="ไม่มีใบงานที่รอตรวจรับ"
              />
            )}

            {activeTab === 'checked_in' && (
              <WHRequestList
                items={checkedInRequests}
                onItemUpdate={handleItemUpdate}
                onConfirmCheckedIn={handleConfirmCheckedIn}
                emptyText="ไม่มีใบงานที่รอจัดเก็บเข้าคลัง"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}