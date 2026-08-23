'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, FileBarChart2, Download, Loader2, Inbox, Search, ChevronLeft, ChevronRight, ChevronDown, LogOut } from 'lucide-react';
import { getSaleCustomerHistory, getSaleStatusLogs } from '@/app/actions/sale-actions';
import { logoutStaffAction } from '@/app/actions/auth-staff';
import { filterCsrRequests, type CsrReportFilters } from '@/lib/csr-report-filters';
import { getStatusLabel } from '@/lib/tracking-status';
import { SkeletonTopBar, SkeletonFilterBar, SkeletonManagerInsights, SkeletonTableRows } from '@/components/skeletons/DashboardSkeleton';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import type { ReportRequestRow, StatusLogRow } from '@/lib/types';

// Code-split ManagerInsights (recharts + ~730 บรรทัด) — เหตุผลเดียวกับ CSR reports
// (app/admin/csr/reports/page.tsx) ลด initial JS ของหน้า ใช้ SkeletonManagerInsights เดิม
// เป็น loading fallback
const ManagerInsights = dynamic(() => import('@/app/admin/manager/staff-approvals/component/ManagerInsights'), {
  loading: () => <SkeletonManagerInsights />,
  ssr: false,
});

// "ศูนย์รายงาน (Report Center)" ของ Sale — เดิมเป็น placeholder ("เร็วๆ นี้") บนหน้า
// app/admin/sale/page.tsx ผู้ใช้ขอให้ต่อยอดเป็นหน้าจริง โดยแสดงสถิติแบบเดียวกับที่ทำให้
// Manager/CSR แล้ว (reuse ManagerInsights.tsx ตัวเดียวกันเป๊ะ) แต่กรองเฉพาะลูกค้าของ sale
// คนนี้ตาม org_type + sale_provinces เดิม (ผ่าน getSaleCustomerHistory/getSaleCoverage ที่มี
// อยู่แล้ว ไม่แตะ logic การกรอง) — โครงหน้าก็อปมาจาก app/admin/csr/reports/page.tsx เกือบทั้งหมด
// ต่างแค่แหล่งข้อมูล (getSaleCustomerHistory/getSaleStatusLogs แทน getCSRDashboardData/
// getManagerStatusLogs) และปุ่มย้อนกลับไป /admin/sale

const REQUEST_TYPES = ['รับคืนลดหนี้', 'รับคืน CCR', 'รับคืนแลกเปลี่ยน'];

const STATUS_OPTIONS = [
  'pending_review', 'approved', 'rejected', 'in_transit', 'at_warehouse',
  'checked_in', 'receiving', 'exchanging', 'credit_note', 'completed', 'out_for_delivery',
];

const PAGE_SIZE = 5;

// ── Status config — สีเดียวกับที่ใช้ในหน้า CSR Report Center (สถานะชุดเดียวกันทั้งระบบ) ──
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending_review:   { label: 'รอตรวจสอบ',       color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     dot: 'bg-amber-400'   },
  approved:         { label: 'อนุมัติแล้ว',      color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  receiving:        { label: 'กำลังรับสินค้า',   color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       dot: 'bg-blue-500'    },
  exchanging:       { label: 'กำลังแลกเปลี่ยน', color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200',   dot: 'bg-purple-500'  },
  credit_note:      { label: 'กำลังลดหนี้',      color: 'text-pink-700',    bg: 'bg-pink-50 border-pink-200',       dot: 'bg-pink-500'    },
  completed:        { label: 'เสร็จสิ้น',        color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200',   dot: 'bg-orange-500'  },
  out_for_delivery: { label: 'กำลังส่งคืน',      color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200',   dot: 'bg-indigo-500'  },
  at_warehouse:     { label: 'ถึงคลังสินค้า',    color: 'text-fuchsia-700', bg: 'bg-fuchsia-50 border-fuchsia-200', dot: 'bg-fuchsia-500' },
  checked_in:       { label: 'ตรวจรับแล้ว',      color: 'text-teal-700',    bg: 'bg-teal-50 border-teal-200',       dot: 'bg-teal-500'    },
  rejected:         { label: 'ถูกปฏิเสธ',        color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         dot: 'bg-red-500'     },
  in_transit:       { label: 'อยู่ระหว่างขนส่ง', color: 'text-cyan-700',    bg: 'bg-cyan-50 border-cyan-200',       dot: 'bg-cyan-500'    },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex max-w-full items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      <span className="truncate">{cfg.label}</span>
    </span>
  );
}

function formatCurrency(n: number) {
  return `${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })} บาท`;
}

export default function SaleReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ReportRequestRow[]>([]);
  const [statusLogs, setStatusLogs] = useState<StatusLogRow[]>([]);
  const [filters, setFilters] = useState<CsrReportFilters>({ status: 'all', requestType: 'all' });
  const [page, setPage] = useState(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // ช่องพิมพ์ค้นหาแยก state ออกจาก filters.search — เหตุผลเดียวกับหน้า CSR reports
  // (app/admin/csr/reports/page.tsx): พิมพ์ตอบสนองทันที filters.search ค่อยตามหลัง 300ms
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  useEffect(() => {
    setFilters((f) => (f.search === (debouncedSearch || undefined) ? f : { ...f, search: debouncedSearch || undefined }));
  }, [debouncedSearch]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutStaffAction();
    router.push('/');
  };

  useEffect(() => {
    async function load() {
      const [history, logsResult] = await Promise.all([
        getSaleCustomerHistory(),
        getSaleStatusLogs(),
      ]);
      setRequests((history ?? []) as ReportRequestRow[]);
      setStatusLogs(logsResult.success ? logsResult.data ?? [] : []);
      setLoading(false);
    }
    load();
  }, []);

  const filteredRequests = useMemo(
    () => filterCsrRequests(requests, filters),
    [requests, filters],
  );

  const filteredStatusLogs = useMemo(() => {
    const ids = new Set(filteredRequests.map((r) => r.id));
    return statusLogs.filter((l) => ids.has(l.request_id));
  }, [statusLogs, filteredRequests]);

  // ── ตัวเลือกที่ค้นหาบ่อยของ Ref ID / หน่วยงาน แสดงเป็น dropdown ตอนพิมพ์ในช่องค้นหา ──
  const searchSuggestions = useMemo(() => {
    const q = filters.search?.trim().toLowerCase();
    if (!q) return [] as { type: 'ref' | 'hospital'; value: string }[];

    const refMatches = new Set<string>();
    const hospitalMatches = new Set<string>();
    for (const r of requests) {
      if (refMatches.size >= 5 && hospitalMatches.size >= 5) break;
      if (refMatches.size < 5 && r.ref_id && r.ref_id.toLowerCase().includes(q)) {
        refMatches.add(r.ref_id);
      }
      if (hospitalMatches.size < 5 && r.hospital_name && r.hospital_name.toLowerCase().includes(q)) {
        hospitalMatches.add(r.hospital_name);
      }
    }

    return [
      ...Array.from(refMatches).map((value) => ({ type: 'ref' as const, value })),
      ...Array.from(hospitalMatches).map((value) => ({ type: 'hospital' as const, value })),
    ];
  }, [requests, filters.search]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRequests = useMemo(
    () => filteredRequests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredRequests, currentPage],
  );

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.requestType && filters.requestType !== 'all') params.set('requestType', filters.requestType);
    if (filters.search) params.set('search', filters.search);
    const qs = params.toString();
    return `/admin/sale/reports/export${qs ? `?${qs}` : ''}`;
  }, [filters]);

  if (loading) return (
    <div className="min-h-screen bg-background">
      <SkeletonTopBar />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">
        <SkeletonFilterBar fields={5} />
        <SkeletonManagerInsights />
        <SkeletonTableRows rows={5} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">

      <div className="relative z-30 sticky top-0 bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={() => router.replace('/admin/sale')}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary px-3 py-2 rounded-md transition-colors group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-border shrink-0" />
            <div className="min-w-0 flex items-center gap-2">
              <FileBarChart2 className="w-4 h-4 text-primary shrink-0" strokeWidth={2.5} />
              <div className="min-w-0">
                <h1 className="text-sm md:text-base font-bold text-foreground leading-tight truncate">ศูนย์รายงาน (Report Center)</h1>
                <p className="text-[11px] text-muted-foreground hidden sm:block">GPO Xchange Portal</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={exportHref}
              className="flex items-center gap-1.5 text-xs md:text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 px-3.5 py-2 rounded-md transition-colors shrink-0"
            >
              <Download size={15} strokeWidth={2.5} />
              <span className="hidden sm:inline">ดาวน์โหลด Excel</span>
            </a>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary px-3 py-2 rounded-md transition-colors shrink-0 disabled:opacity-60 disabled:pointer-events-none"
            >
              {isLoggingOut ? <Loader2 size={15} className="animate-spin" strokeWidth={2.5} /> : <LogOut size={15} strokeWidth={2.5} />}
              <span className="hidden sm:inline">ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">

        {/* ── Filter bar ── */}
        <div className="bg-card rounded-lg border border-border p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase">จากวันที่</label>
            <input
              type="date"
              value={filters.dateFrom ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value || undefined }))}
              className="text-sm border border-border rounded-lg px-2.5 py-1.5"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase">ถึงวันที่</label>
            <input
              type="date"
              value={filters.dateTo ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value || undefined }))}
              className="text-sm border border-border rounded-lg px-2.5 py-1.5"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase">สถานะ</label>
            <div className="relative">
              <select
                value={filters.status ?? 'all'}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                className="w-full appearance-none cursor-pointer bg-card text-sm border border-border rounded-md pl-2.5 pr-8 py-1.5 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-colors"
              >
                <option value="all">ทั้งหมด</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{getStatusLabel(s)}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" strokeWidth={2.5} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase">ประเภทคำร้อง</label>
            <div className="relative">
              <select
                value={filters.requestType ?? 'all'}
                onChange={(e) => setFilters((f) => ({ ...f, requestType: e.target.value }))}
                className="w-full appearance-none cursor-pointer bg-card text-sm border border-border rounded-md pl-2.5 pr-8 py-1.5 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-colors"
              >
                <option value="all">ทั้งหมด</option>
                {REQUEST_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" strokeWidth={2.5} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase">ค้นหา</label>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
              <input
                type="text"
                placeholder="Ref ID / หน่วยงาน"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setSearchOpen(false)}
                className="w-full text-sm border border-border rounded-lg pl-8 pr-2.5 py-1.5"
              />
              {searchOpen && searchSuggestions.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg max-h-56 overflow-y-auto">
                  {searchSuggestions.map((s, i) => (
                    <button
                      key={`${s.type}-${s.value}-${i}`}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSearchInput(s.value);
                        setFilters((f) => ({ ...f, search: s.value }));
                        setSearchOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                    >
                      <span
                        className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          s.type === 'ref' ? 'bg-accent text-accent-foreground' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {s.type === 'ref' ? 'Ref ID' : 'หน่วยงาน'}
                      </span>
                      <span className="truncate text-foreground">{s.value}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── สรุปสถิติด้านบน (reuse ManagerInsights ตัวเดียวกับ Manager/CSR) ── */}
        <ManagerInsights requests={filteredRequests} statusLogs={filteredStatusLogs} />

        {/* ── ตารางรายการด้านล่าง ── */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-2.5 bg-secondary/60 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-2">Ref ID</div>
            <div className="col-span-2">วันที่</div>
            <div className="col-span-2">หน่วยงาน</div>
            <div className="col-span-2">ประเภท</div>
            <div className="col-span-2">สถานะ</div>
            <div className="col-span-2 text-right">มูลค่า</div>
          </div>

          {filteredRequests.length === 0 ? (
            <div className="py-12 text-center">
              <Inbox className="w-9 h-9 text-muted-foreground/40 mx-auto mb-2.5" strokeWidth={1.75} />
              <p className="text-sm text-muted-foreground font-medium">ไม่พบใบงานตามเงื่อนไขที่เลือก</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border/60">
                {pagedRequests.map((r) => (
                  <div key={r.id} className="group relative hover:bg-accent/40 transition-colors">
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-[3px] bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    />
                    <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3.5 items-center">
                      <div className="col-span-2 text-sm font-bold text-foreground font-mono">{r.ref_id}</div>
                      <div className="col-span-2 text-xs text-muted-foreground">
                        {new Date(r.created_at || 0).toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                      </div>
                      <div className="col-span-2 text-sm text-foreground truncate">{r.hospital_name || '-'}</div>
                      <div className="col-span-2 text-xs text-muted-foreground truncate">{r.request_type || '-'}</div>
                      <div className="col-span-2"><StatusBadge status={r.current_status} /></div>
                      <div className="col-span-2 text-right text-sm font-bold text-primary">
                        {formatCurrency(Number(r.total_value) || 0)}
                      </div>
                    </div>

                    <div className="md:hidden px-4 py-3.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-foreground font-mono truncate">{r.ref_id}</span>
                        <span className="text-sm font-bold text-primary shrink-0">{formatCurrency(Number(r.total_value) || 0)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{r.hospital_name || '-'}</p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{new Date(r.created_at || 0).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</span>
                        <StatusBadge status={r.current_status} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3.5 border-t border-border bg-secondary/40">
                  <p className="text-xs text-muted-foreground">
                    แสดง {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredRequests.length)} จาก {filteredRequests.length} รายการ
                  </p>
                  <div className="flex items-center gap-1 overflow-x-auto">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
                      aria-label="หน้าก่อนหน้า"
                    >
                      <ChevronLeft size={16} strokeWidth={2.5} />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                          p === currentPage
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
                      aria-label="หน้าถัดไป"
                    >
                      <ChevronRight size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
