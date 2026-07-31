'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileBarChart2, Download, Loader2, Inbox, Search } from 'lucide-react';
import { getCSRDashboardData } from '@/app/actions/csr-actions';
import { getManagerStatusLogs } from '@/app/actions/manager-actions';
import ManagerInsights from '@/app/admin/manager/staff-approvals/component/ManagerInsights';
import { filterCsrRequests, type CsrReportFilters } from '@/lib/csr-report-filters';
import { getStatusLabel } from '@/lib/tracking-status';

const REQUEST_TYPES = ['รับคืนลดหนี้', 'รับคืน CCR', 'รับคืนแลกเปลี่ยน'];

const STATUS_OPTIONS = [
  'pending_review', 'approved', 'rejected', 'in_transit', 'at_warehouse',
  'checked_in', 'receiving', 'exchanging', 'completed', 'out_for_delivery',
];

function formatCurrency(n: number) {
  return `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}

export default function CsrReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<any[]>([]);
  const [statusLogs, setStatusLogs] = useState<any[]>([]);
  const [filters, setFilters] = useState<CsrReportFilters>({ status: 'all', requestType: 'all' });

  useEffect(() => {
    async function load() {
      const [dashboard, logsResult] = await Promise.all([
        getCSRDashboardData(),
        getManagerStatusLogs(),
      ]);
      setRequests(dashboard.success ? dashboard.requests ?? [] : []);
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

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.requestType && filters.requestType !== 'all') params.set('requestType', filters.requestType);
    if (filters.search) params.set('search', filters.search);
    const qs = params.toString();
    return `/admin/csr/reports/export${qs ? `?${qs}` : ''}`;
  }, [filters]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <Loader2 className="w-9 h-9 text-amber-600 animate-spin mx-auto" strokeWidth={2.5} />
        <p className="text-sm text-muted-foreground font-medium">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={() => router.replace('/admin/csr')}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-all group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-slate-200 shrink-0" />
            <div className="min-w-0 flex items-center gap-2">
              <FileBarChart2 className="w-4 h-4 text-amber-600 shrink-0" strokeWidth={2.5} />
              <div className="min-w-0">
                <h1 className="text-sm md:text-base font-bold text-foreground leading-tight truncate">ศูนย์รายงาน (Report Center)</h1>
                <p className="text-[10px] md:text-[11px] text-muted-foreground hidden sm:block">GPO Xchange Portal</p>
              </div>
            </div>
          </div>
          <a
            href={exportHref}
            className="flex items-center gap-1.5 text-xs md:text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 px-3.5 py-2 rounded-xl transition-colors shrink-0"
          >
            <Download size={15} strokeWidth={2.5} />
            <span className="hidden sm:inline">ดาวน์โหลด Excel</span>
          </a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">

        {/* ── Filter bar ── */}
        <div className="bg-white rounded-2xl border border-border p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
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
            <select
              value={filters.status ?? 'all'}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="text-sm border border-border rounded-lg px-2.5 py-1.5"
            >
              <option value="all">ทั้งหมด</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{getStatusLabel(s)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase">ประเภทคำร้อง</label>
            <select
              value={filters.requestType ?? 'all'}
              onChange={(e) => setFilters((f) => ({ ...f, requestType: e.target.value }))}
              className="text-sm border border-border rounded-lg px-2.5 py-1.5"
            >
              <option value="all">ทั้งหมด</option>
              {REQUEST_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-muted-foreground uppercase">ค้นหา</label>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
              <input
                type="text"
                placeholder="Ref ID / หน่วยงาน"
                value={filters.search ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || undefined }))}
                className="w-full text-sm border border-border rounded-lg pl-8 pr-2.5 py-1.5"
              />
            </div>
          </div>
        </div>

        {/* ── สรุปสถิติด้านบน (reuse ManagerInsights) ── */}
        <ManagerInsights requests={filteredRequests} statusLogs={filteredStatusLogs} />

        {/* ── ตารางรายการด้านล่าง ── */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-2.5 bg-slate-50 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-2">Ref ID</div>
            <div className="col-span-2">วันที่</div>
            <div className="col-span-3">หน่วยงาน</div>
            <div className="col-span-2">ประเภท</div>
            <div className="col-span-1">สถานะ</div>
            <div className="col-span-2 text-right">มูลค่า</div>
          </div>

          {filteredRequests.length === 0 ? (
            <div className="py-12 text-center">
              <Inbox className="w-9 h-9 text-slate-300 mx-auto mb-2.5" strokeWidth={1.75} />
              <p className="text-sm text-muted-foreground font-medium">ไม่พบใบงานตามเงื่อนไขที่เลือก</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredRequests.map((r) => (
                <div key={r.id} className="border-l-[3px] border-l-transparent hover:bg-teal-50/50 hover:border-l-teal-400 transition-colors">
                  <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3.5 items-center">
                    <div className="col-span-2 text-sm font-bold text-foreground font-mono">{r.ref_id}</div>
                    <div className="col-span-2 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                    </div>
                    <div className="col-span-3 text-sm text-foreground truncate">{r.hospital_name || '-'}</div>
                    <div className="col-span-2 text-xs text-muted-foreground truncate">{r.request_type || '-'}</div>
                    <div className="col-span-1 text-xs font-semibold text-foreground">{getStatusLabel(r.current_status)}</div>
                    <div className="col-span-2 text-right text-sm font-bold text-teal-600">
                      {formatCurrency(Number(r.total_value) || 0)}
                    </div>
                  </div>

                  <div className="md:hidden px-4 py-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground font-mono">{r.ref_id}</span>
                      <span className="text-sm font-bold text-teal-600">{formatCurrency(Number(r.total_value) || 0)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{r.hospital_name || '-'}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{new Date(r.created_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</span>
                      <span>·</span>
                      <span>{getStatusLabel(r.current_status)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
