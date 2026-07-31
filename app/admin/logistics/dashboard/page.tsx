'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PackageCheck, Truck, Camera, Inbox, ChevronLeft, ChevronRight, Loader2, Check, User } from 'lucide-react';
import { getLogisticsDashboardData, updateLogisticsStatus } from '@/app/actions/logistics-actions';
import { getStaffSession } from '@/app/actions/auth-staff';
import ReasonSelectFields from '@/components/ReasonSelectFields';
import { resolveQuickNote } from '@/lib/quick-note';
import LOGDrugRow from './component/LOGDrugrow';

const LOGISTICS_STATUS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  approved:     { label: 'อนุมัติรับคืนสินค้า',  color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     dot: 'bg-blue-500'   },
  in_transit:   { label: 'อยู่ระหว่างขนส่ง',     color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', dot: 'bg-indigo-500' },
  at_warehouse: { label: 'ถึงคลังแล้ว',          color: 'text-teal-700',   bg: 'bg-teal-50 border-teal-200',     dot: 'bg-teal-500'   },
  rejected:     { label: 'ถูกปฏิเสธ',            color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       dot: 'bg-red-500'    },
};

// หมายเหตุส่งรถไปรับคืน — preset ให้เลือกเร็วๆ (ยังพิมพ์เพิ่มเติมได้ผ่าน "อื่นๆ")
// แทนที่ prompt() เดิม ให้เป็น modal มาตรฐานแบบเดียวกับ LOGDrugrow.tsx / CSR dashboard
const TRANSIT_NOTES = [
  { code: 'dispatched', label: 'ส่งรถออกไปรับคืนแล้ว' },
  { code: 'scheduled', label: 'นัดหมายรับคืนกับหน่วยงานแล้ว' },
  { code: 'other', label: 'อื่นๆ' },
] as const;

function StatusBadge({ status }: { status: string }) {
  const cfg = LOGISTICS_STATUS[status] ?? { label: status, color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── ปุ่ม tab แนวตั้ง (sidebar บน desktop / แนวนอนเลื่อนได้บนมือถือ) — แถบซ้ายสีเขียว
// บอกว่ากำลังดูหัวข้อไหนอยู่ (จาง = แค่ hover, เข้ม = เลือกอยู่) ── ──
function LogTabButton({ icon: Icon, label, count, active, onClick, accentBg, accentColor }: {
  icon: any; label: string; count: number; active: boolean; onClick: () => void;
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

const LOG_PAGE_SIZE = 5;

// ── รายการใบงาน + แบ่งหน้า 5 รายการ (เหมือน CSR Report Center) ใช้ร่วมกันทั้งแท็บ
// "อนุมัติรับคืนสินค้า" และ "อยู่ระหว่างขนส่ง" ── ──
function LogisticsRequestList({
  items, expandedReq, setExpandedReq, onSendTruck, handleDrugItemUpdate, emptyText,
}: {
  items: any[];
  expandedReq: number | null;
  setExpandedReq: (id: number | null) => void;
  onSendTruck: (req: any) => void;
  handleDrugItemUpdate: (requestId: number, itemId: number, newStatus: 'at_warehouse' | 'rejected') => void;
  emptyText: string;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / LOG_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = items.slice((currentPage - 1) * LOG_PAGE_SIZE, currentPage * LOG_PAGE_SIZE);

  return (
    <section className="bg-white rounded-2xl md:rounded-3xl shadow-md border border-border overflow-hidden">

      {/* Table header — desktop only */}
      {items.length > 0 && (
        <div className="hidden md:grid grid-cols-12 gap-4 px-7 py-3 bg-slate-50 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          <div className="col-span-3">Ref ID</div>
          <div className="col-span-3">สถานะ</div>
          <div className="col-span-4">รายการสินค้า</div>
          <div className="col-span-2 text-right">Action</div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="py-10 md:py-14 text-center">
          <Inbox className="w-9 h-9 text-slate-300 mx-auto mb-3" strokeWidth={1.75} />
          <p className="text-sm text-muted-foreground font-medium">{emptyText}</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-50">
            {pagedItems.map((req) => {
              const isExpanded = expandedReq === req.id;
              const drugCount  = req.drug_items?.length ?? 0;
              return (
                <div key={req.id} className="hover:bg-slate-50/40 transition-colors">

                  {/* Desktop row */}
                  <div className="hidden md:grid grid-cols-12 gap-4 px-7 py-4 items-center">
                    <div className="col-span-3">
                      <p className="text-sm font-black text-foreground font-mono">{req.ref_id}</p>
                      {req.hospital_name && <p className="text-xs text-muted-foreground mt-0.5 truncate">{req.hospital_name}</p>}
                    </div>
                    <div className="col-span-3"><StatusBadge status={req.current_status} /></div>
                    <div className="col-span-4">
                      <button onClick={() => setExpandedReq(isExpanded ? null : req.id)}
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-indigo-700 font-semibold transition-colors group">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 font-black text-[10px] group-hover:bg-indigo-100">
                          {drugCount}
                        </span>
                        รายการสินค้า
                        <span className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                      </button>
                    </div>
                    <div className="col-span-2 flex flex-col items-end gap-2">
                      {req.current_status === 'approved' && (
                        <button onClick={() => onSendTruck(req)}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all w-full bg-blue-600 hover:bg-blue-700">
                          ส่งรถไปรับคืน
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mobile card */}
                  <div className="md:hidden px-4 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-foreground font-mono">{req.ref_id}</p>
                        {req.hospital_name && <p className="text-xs text-muted-foreground mt-0.5 truncate">{req.hospital_name}</p>}
                      </div>
                      <StatusBadge status={req.current_status} />
                    </div>
                    <button onClick={() => setExpandedReq(isExpanded ? null : req.id)}
                      className="flex items-center gap-2 text-xs text-muted-foreground font-semibold w-full py-2 px-3 bg-slate-50 rounded-xl hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 font-black text-[10px]">{drugCount}</span>
                      รายการสินค้า
                      <span className={`ml-auto transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    <div className="flex gap-2">
                      {req.current_status === 'approved' && (
                        <button onClick={() => onSendTruck(req)}
                          className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 active:scale-95 transition-all">
                          ส่งรถไปรับคืน
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Drug items expanded */}
                  {isExpanded && drugCount > 0 && (
                    <div className="px-4 md:px-7 pb-4">
                      <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wide px-3 mb-1.5">
                        <div className="col-span-4">ชื่อยา</div>
                        <div className="col-span-2">จำนวน</div>
                        <div className="col-span-2">LOT</div>
                        <div className="col-span-2">หมดอายุ</div>
                        <div className="col-span-2 text-right">Action</div>
                      </div>
                      <div className="space-y-1.5">
                        {req.drug_items.map((item: any) => (
                          <LOGDrugRow
                            key={item.id}
                            item={item}
                            reqStatus={req.current_status}
                            onUpdate={(itemId, newStatus) => handleDrugItemUpdate(req.id, itemId, newStatus)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-7 py-3.5 border-t border-border bg-slate-50">
              <p className="text-xs text-muted-foreground">
                แสดง {(currentPage - 1) * LOG_PAGE_SIZE + 1}–{Math.min(currentPage * LOG_PAGE_SIZE, items.length)} จาก {items.length} รายการ
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

export default function LogisticsDashboard() {
  const router = useRouter();
  const [requests, setRequests]               = useState<any[]>([]);
  const [isLoading, setIsLoading]             = useState(true);
  const [expandedReq, setExpandedReq]         = useState<number | null>(null);
  const [activeTab, setActiveTab]             = useState<'approved' | 'in_transit' | 'photos'>('approved');
  const [staff, setStaff]                     = useState<any>(null);
  const [today, setToday]                     = useState('');

  useEffect(() => {
    setToday(new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);

  // ══ Modal ยืนยันส่งรถไปรับคืน — แทนที่ prompt() เดิม ด้วย modal มาตรฐานแบบเดียวกับ
  // LOGDrugrow.tsx / CSR dashboard (overlay + card + gradient bar + ReasonSelectFields) ══
  const [transitModal, setTransitModal]     = useState<{ requestId: number; refId: string } | null>(null);
  const [transitCode, setTransitCode]       = useState('');
  const [transitDetail, setTransitDetail]   = useState('');
  const [isSubmittingTransit, setIsSubmittingTransit] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    const [staffSession, data] = await Promise.all([getStaffSession(), getLogisticsDashboardData()]);
    setStaff(staffSession);
    if (data.success) setRequests(data.requests || []);
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openTransitModal = (req: any) => {
    setTransitCode('');
    setTransitDetail('');
    setTransitModal({ requestId: req.id, refId: req.ref_id });
  };

  const submitTransitModal = async () => {
    if (!transitModal) return;
    setIsSubmittingTransit(true);
    try {
      const remark = resolveQuickNote(TRANSIT_NOTES, transitCode, transitDetail);
      const res = await updateLogisticsStatus(transitModal.requestId, 'in_transit', remark);
      if (res.success) {
        setRequests(prev => prev.map(req =>
          req.id !== transitModal.requestId ? req : {
            ...req,
            current_status: 'in_transit',
            drug_items: req.drug_items.map((it: any) => ({ ...it, current_status: 'in_transit' })),
          }
        ));
        setTransitModal(null);
      } else {
        alert('Error: ' + res.error);
      }
    } finally {
      setIsSubmittingTransit(false);
    }
  };

  const handleDrugItemUpdate = (requestId: number, itemId: number, newStatus: 'at_warehouse' | 'rejected') => {
    setRequests(prev => {
      let shouldRemove = false;
      const updated = prev.map(req => {
        if (req.id !== requestId) return req;
        const updatedItems = req.drug_items.map((it: any) =>
          it.id === itemId ? { ...it, current_status: newStatus } : it
        );
        const hasAccepted    = updatedItems.some((i: any) => i.current_status === 'at_warehouse');
        const isAllProcessed = updatedItems.every((i: any) => ['at_warehouse', 'rejected'].includes(i.current_status));
        if (isAllProcessed) shouldRemove = true;
        return { ...req, drug_items: updatedItems, current_status: isAllProcessed ? (hasAccepted ? 'at_warehouse' : 'rejected') : req.current_status };
      });
      return shouldRemove ? updated.filter(req => req.id !== requestId) : updated;
    });
  };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground font-medium">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  const approvedRequests  = requests.filter(r => r.current_status === 'approved');
  const inTransitRequests = requests.filter(r => r.current_status === 'in_transit');

  return (
    <div className="min-h-screen bg-background">

      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-border shadow-sm">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button onClick={() => router.replace('/')}
              className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground bg-slate-50 hover:bg-slate-100 px-3 py-2 rounded-xl transition-all group shrink-0">
              <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-slate-200 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-black text-foreground leading-tight truncate">GPO StaffCommand Center</h1>
              <p className="text-[10px] md:text-[11px] text-muted-foreground hidden sm:block">GPO Xchange Portal • Logistics Dashboard</p>
            </div>
          </div>
          <span className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] md:text-xs font-bold shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
            <span>{requests.length}</span>
            <span className="hidden sm:inline">ใบงาน</span>
          </span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-8 space-y-6">

        {/* ── Welcome Banner — โทนน้ำเงินให้เข้ากับสีของหน้านี้ (เหมือนแนวคิด CSR/WH welcome page) ── */}
        <div className="relative overflow-hidden rounded-3xl bg-blue-600 p-8 text-white shadow-lg shadow-blue-200">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-20 bg-white" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full opacity-15 bg-white" />
          <div className="absolute top-1/2 right-24 w-20 h-20 rounded-full opacity-10 bg-white hidden md:block" />
          <div className="absolute top-6 left-1/3 w-3 h-3 rounded-full bg-sky-200 opacity-80 hidden md:block" />
          <div className="absolute bottom-10 right-1/3 w-2 h-2 rounded-full bg-sky-200 opacity-70 hidden md:block" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-blue-100 text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-200 animate-pulse" /> ยินดีต้อนรับ
              </p>
              <h1 className="text-2xl md:text-3xl font-black leading-tight flex items-center gap-2">
                สวัสดีคุณ {staff?.full_name || staff?.username}
                <User className="w-6 h-6 opacity-80" />
              </h1>
              <p className="text-blue-50 mt-1.5 flex items-center gap-1.5 text-sm">
                <Truck className="w-4 h-4" /> แผนกโลจิสติกส์ (Logistics)
              </p>
              <p className="text-blue-50/90 mt-3 text-sm leading-relaxed">
                ขอให้มีความสุขตลอดการทำงาน ในวันที่สดใส{today && <> {today}</>}
              </p>
            </div>
            <div className="bg-white/15 border border-white/25 rounded-2xl px-5 py-4 text-center hidden md:block backdrop-blur-sm">
              <p className="text-blue-100 text-[11px] font-semibold uppercase tracking-wide mb-1">สถานะบัญชี</p>
              <div className="flex items-center gap-1.5 justify-center">
                <span className="w-2 h-2 rounded-full bg-sky-300 animate-pulse" />
                <span className="text-white font-bold text-sm">Active</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 md:gap-8">

          {/* ══ Sidebar Tabs (แนวตั้ง — เหมือน CSR/Manager Dashboard) ══ */}
          <aside className="md:w-60 shrink-0">
            <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible -mx-1 px-1 md:mx-0 md:px-0 pb-1 md:pb-0">
              <LogTabButton
                icon={PackageCheck} label="อนุมัติรับคืนสินค้า" count={approvedRequests.length}
                active={activeTab === 'approved'} onClick={() => setActiveTab('approved')}
                accentBg="bg-blue-100" accentColor="text-blue-600"
              />
              <LogTabButton
                icon={Truck} label="อยู่ระหว่างขนส่ง" count={inTransitRequests.length}
                active={activeTab === 'in_transit'} onClick={() => setActiveTab('in_transit')}
                accentBg="bg-indigo-100" accentColor="text-indigo-600"
              />
              <LogTabButton
                icon={Camera} label="อัปโหลดรูปสินค้ารับคืน" count={0}
                active={activeTab === 'photos'} onClick={() => setActiveTab('photos')}
                accentBg="bg-purple-100" accentColor="text-purple-600"
              />
            </nav>
          </aside>

          {/* ══ Content ══ */}
          <div className="flex-1 min-w-0">
            {activeTab === 'approved' && (
              <section>
                <div className="flex items-center gap-2.5 mb-3 px-1">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <PackageCheck size={16} className="text-blue-600" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">อนุมัติรับคืนสินค้า</h2>
                    <p className="text-[11px] text-muted-foreground">{approvedRequests.length} ใบงานรอส่งรถไปรับคืน</p>
                  </div>
                </div>
                <LogisticsRequestList
                  items={approvedRequests}
                  expandedReq={expandedReq}
                  setExpandedReq={setExpandedReq}
                  onSendTruck={openTransitModal}
                  handleDrugItemUpdate={handleDrugItemUpdate}
                  emptyText="ไม่มีใบงานที่รออนุมัติรับคืนสินค้า"
                />
              </section>
            )}

            {activeTab === 'in_transit' && (
              <section>
                <div className="flex items-center gap-2.5 mb-3 px-1">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                    <Truck size={16} className="text-indigo-600" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">อยู่ระหว่างขนส่ง</h2>
                    <p className="text-[11px] text-muted-foreground">{inTransitRequests.length} ใบงานกำลังเดินทางกลับคลัง</p>
                  </div>
                </div>
                <LogisticsRequestList
                  items={inTransitRequests}
                  expandedReq={expandedReq}
                  setExpandedReq={setExpandedReq}
                  onSendTruck={openTransitModal}
                  handleDrugItemUpdate={handleDrugItemUpdate}
                  emptyText="ไม่มีใบงานที่อยู่ระหว่างขนส่ง"
                />
              </section>
            )}

            {activeTab === 'photos' && (
              <section className="bg-white rounded-2xl md:rounded-3xl shadow-md border border-border overflow-hidden py-16 text-center">
                <Camera className="w-10 h-10 text-purple-300 mx-auto mb-3" strokeWidth={1.75} />
                <p className="text-sm font-bold text-foreground">อัปโหลดรูปสินค้ารับคืน</p>
                <p className="text-xs text-muted-foreground mt-1">ฟีเจอร์นี้กำลังอยู่ระหว่างการพัฒนา เร็วๆ นี้</p>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* ══ Confirm Modal: ส่งรถไปรับคืน พร้อมหมายเหตุ — มาตรฐานเดียวกับ LOGDrugrow.tsx / CSR dashboard ══ */}
      {transitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg,#2563eb,#60a5fa)' }} />

            <div className="p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: '#dbeafe' }}>
                  <Truck size={22} className="text-blue-600" strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-foreground">ยืนยันส่งรถไปรับคืน</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">Ref: {transitModal.refId}</p>
                </div>
              </div>

              <ReasonSelectFields
                label="หมายเหตุการขนส่ง"
                options={TRANSIT_NOTES}
                code={transitCode}
                detail={transitDetail}
                onCodeChange={setTransitCode}
                onDetailChange={setTransitDetail}
              />

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setTransitModal(null); setTransitCode(''); setTransitDetail(''); }}
                  disabled={isSubmittingTransit}
                  className="py-3.5 rounded-2xl font-bold text-sm text-muted-foreground bg-slate-50 border-2 border-border hover:bg-slate-100 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={submitTransitModal}
                  disabled={isSubmittingTransit || !transitCode || (transitCode === 'other' && !transitDetail.trim())}
                  className="py-3.5 rounded-2xl font-bold text-sm text-white transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#2563eb,#60a5fa)' }}
                >
                  {isSubmittingTransit
                    ? <><Loader2 size={15} className="animate-spin" strokeWidth={2.5} /> กำลังบันทึก...</>
                    : <><Check size={15} strokeWidth={3} /> ยืนยัน</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
