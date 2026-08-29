'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  LogOut,
  Briefcase,
  FileText,
  Building2,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getCSRDashboardData } from '@/app/actions/csr-actions';
import { logoutStaffAction } from '@/app/actions/auth-staff';
import { SkeletonTopBar, SkeletonSimpleRows } from '@/components/skeletons/DashboardSkeleton';
import type { RequestRow } from '@/lib/types';

// ── "รายงานผู้บริหาร" (Download Center) — เดิมเป็นแท็บ ?tab=downloads ของหน้า staff-approvals
// ตอนนี้แยกเป็นหน้าเดี่ยวพร้อม chrome มาตรฐาน (pattern เดียวกับ Track & Trace / Audit log)
// export ไฟล์ Excel ยังยิงไป /admin/manager/downloads-export เหมือนเดิม (route ไม่เปลี่ยน)

// ── segmented control สำหรับ sub-tab ภายในหน้านี้ ──
function DownloadSubTabButton({ icon: Icon, label, active, onClick }: {
  icon: LucideIcon; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold transition-colors shrink-0 whitespace-nowrap
        ${active ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
    >
      <Icon size={15} className={active ? 'text-primary' : 'text-muted-foreground'} strokeWidth={2.5} />
      {label}
    </button>
  );
}

const SINGLE_PAGE_SIZE = 10;

export default function ManagerReportsPage() {
  const router = useRouter();

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [downloadSubTab, setDownloadSubTab] = useState<'reports' | 'single'>('reports');
  const [downloadSearch, setDownloadSearch] = useState('');
  // แบ่งหน้าสำหรับแท็บ "ตามใบงานเดี่ยว" — 10 รายการต่อหน้า
  const [singlePage, setSinglePage] = useState(1);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      const dashboardResult = await getCSRDashboardData();
      if (dashboardResult.success) {
        setRequests(dashboardResult.requests || []);
      } else {
        console.error('Error fetching requests:', dashboardResult.error);
      }
      setIsLoading(false);
    }
    fetchData();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutStaffAction();
    router.push('/');
  };

  const allRequests = requests;

  // ── ค้นหาใบงานเดี่ยว (ref id หรือชื่อหน่วยงาน) เรียงใหม่สุดก่อน — แบ่งหน้าละ SINGLE_PAGE_SIZE ──
  const downloadSearchTrimmed = downloadSearch.trim().toLowerCase();
  const singleRequestResults = [...allRequests]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .filter((r) => {
      if (!downloadSearchTrimmed) return true;
      const haystack = `${r.ref_id ?? ''} ${r.hospital_name ?? ''}`.toLowerCase();
      return haystack.includes(downloadSearchTrimmed);
    });
  const singleTotalPages = Math.max(1, Math.ceil(singleRequestResults.length / SINGLE_PAGE_SIZE));
  const singlePageClamped = Math.min(singlePage, singleTotalPages);
  const singleRequestPageItems = singleRequestResults.slice(
    (singlePageClamped - 1) * SINGLE_PAGE_SIZE,
    singlePageClamped * SINGLE_PAGE_SIZE,
  );

  if (isLoading) return (
    <div className="min-h-screen bg-background">
      <SkeletonTopBar />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <SkeletonSimpleRows rows={5} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">

      {/* ══ Top Bar ══ */}
      <div className="relative z-30 sticky top-0 bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={() => router.replace('/admin/manager')}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary px-3 py-2 rounded-md transition-colors group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-border shrink-0" />
            <div className="min-w-0 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-primary shrink-0" strokeWidth={2.5} />
              <div className="min-w-0">
                <h1 className="text-sm md:text-base font-bold text-foreground leading-tight truncate">รายงานผู้บริหาร</h1>
                <p className="text-[11px] text-muted-foreground hidden sm:block">GPO Xchange Portal</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <span className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 rounded-full border bg-accent border-transparent text-accent-foreground text-[11px] md:text-xs font-semibold shrink-0">
              <ShieldCheck size={13} strokeWidth={2.5} />
              <span>Manager</span>
            </span>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary border border-border px-3 py-2 rounded-md transition-colors disabled:opacity-60 disabled:pointer-events-none"
            >
              {isLoggingOut ? <Loader2 size={15} className="animate-spin" strokeWidth={2.5} /> : <LogOut size={15} strokeWidth={2.5} />}
              <span className="hidden sm:inline">ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <section className="space-y-4">
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shrink-0">
              <FileSpreadsheet size={16} className="text-accent-foreground" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">รายงานผู้บริหาร</h2>
              <p className="text-[11px] text-muted-foreground">
                ดาวน์โหลดรายงานสรุปสำหรับผู้บริหาร เป็นไฟล์ Excel ไว้เก็บ/ตรวจสอบย้อนหลัง (Audit Trail Report ย้ายไปที่ SLA Monitoring System แล้ว)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-md bg-secondary w-fit">
            <DownloadSubTabButton
              icon={Briefcase} label="รายงานผู้บริหาร"
              active={downloadSubTab === 'reports'} onClick={() => setDownloadSubTab('reports')}
            />
            <DownloadSubTabButton
              icon={FileText} label="ตามใบงานเดี่ยว"
              active={downloadSubTab === 'single'} onClick={() => setDownloadSubTab('single')}
            />
          </div>

          {downloadSubTab === 'single' && (
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="p-4 border-b border-border">
                <div className="relative max-w-sm">
                  <Search size={14} strokeWidth={2.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text" value={downloadSearch}
                    onChange={(e) => { setDownloadSearch(e.target.value); setSinglePage(1); }}
                    placeholder="ค้นหา ref id หรือชื่อหน่วยงาน..."
                    className="w-full text-sm border border-border rounded-md pl-8 pr-3 py-2"
                  />
                </div>
              </div>
              <div className="divide-y divide-border">
                {singleRequestResults.length === 0 ? (
                  <div className="py-10 text-center">
                    <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" strokeWidth={1.75} />
                    <p className="text-sm text-muted-foreground font-medium">ไม่พบใบงานที่ตรงกับคำค้นหา</p>
                  </div>
                ) : (
                  singleRequestPageItems.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 px-4 md:px-6 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground font-mono">{r.ref_id}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {r.hospital_name ?? '-'} · {new Date(r.created_at || 0).toLocaleDateString('th-TH')}
                        </p>
                      </div>
                      <a
                        href={`/admin/manager/downloads-export?mode=request&requestId=${r.id}`}
                        className="flex items-center gap-1.5 text-xs font-bold text-accent-foreground bg-accent hover:bg-primary/15 px-3 py-2 rounded-md transition-colors shrink-0"
                      >
                        <Download size={13} strokeWidth={2.5} /> ดาวน์โหลด
                      </a>
                    </div>
                  ))
                )}
              </div>

              {/* ── ส่วนกำกับหน้า — pattern เดียวกับ components/history/RequestHistoryList.tsx ── */}
              {singleTotalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 md:px-6 py-3.5 border-t border-border bg-secondary">
                  <p className="text-xs text-muted-foreground">
                    แสดง {(singlePageClamped - 1) * SINGLE_PAGE_SIZE + 1}–{Math.min(singlePageClamped * SINGLE_PAGE_SIZE, singleRequestResults.length)} จาก {singleRequestResults.length} รายการ
                  </p>
                  <div className="flex items-center gap-1 overflow-x-auto">
                    <button
                      onClick={() => setSinglePage((p) => Math.max(1, p - 1))}
                      disabled={singlePageClamped === 1}
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
                      aria-label="หน้าก่อนหน้า"
                    >
                      <ChevronLeft size={16} strokeWidth={2.5} />
                    </button>
                    {Array.from({ length: singleTotalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setSinglePage(p)}
                        className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                          p === singlePageClamped ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      onClick={() => setSinglePage((p) => Math.min(singleTotalPages, p + 1))}
                      disabled={singlePageClamped === singleTotalPages}
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
                      aria-label="หน้าถัดไป"
                    >
                      <ChevronRight size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {downloadSubTab === 'reports' && (
            <div className="space-y-4">
              {/* ── รายงานพอร์ตลูกค้า/หน่วยงาน — ภาพรวมสะสมทั้งหมด ไม่มีตัวกรองวันที่ ── */}
              <div className="bg-card rounded-lg border border-border p-5 space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shrink-0">
                    <Building2 size={16} className="text-accent-foreground" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">พอร์ตลูกค้า/หน่วยงาน</h3>
                    <p className="text-[11px] text-muted-foreground">รายชื่อหน่วยงานที่ลงทะเบียนทั้งหมด พร้อมยอดใบงาน/มูลค่ารวมสะสม — ภาพรวมทั้งพอร์ต ไม่กรองตามช่วงเวลา</p>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <a
                    href="/admin/manager/downloads-export?mode=customer-portfolio"
                    className="flex items-center gap-1.5 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 px-3.5 py-2.5 rounded-md transition-colors shrink-0"
                  >
                    <Download size={14} strokeWidth={2.5} /> ดาวน์โหลด Excel
                  </a>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
