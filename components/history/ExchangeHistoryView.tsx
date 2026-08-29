'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Hash,
  Calendar,
  ArrowRight,
  Inbox,
  XCircle,
  CheckCircle2,
  ClipboardList,
  Wallet,
  History,
  UserRound,
  Pill,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import {
  STAGES,
  REJECTED_STATUS,
  getStatusLabel,
  getStatusMeta,
  getCurrentStageIndex,
  formatCurrency,
} from '@/lib/tracking-status';
import { generatePdfAction } from '@/app/actions/generate-pdf-action';
import { PdfViewerModal } from '@/components/pdf/PdfViewerModal';
import { ExchangeCardsSkeleton } from '@/components/skeletons/ExchangeCardsSkeleton';
import type { RequestRow, DrugItemRow as DrugItemRowType } from '@/lib/types';

// history RPC (get_customer_history / get_org_history) แนบ submitted_by เพิ่มมา
// เหนือคอลัมน์ปกติของ requests — ไม่มีในตารางจริง เป็นผลจาก RPC เท่านั้น
type HistoryRequestRow = RequestRow & { submitted_by?: string };

/** badge/ขอบสีของการ์ด — อิงจาก "สถานะจริงของทั้งใบงาน" (request.current_status)
 *  เท่านั้น ไม่ผูกกับสถานะของรายการย่อยข้างในอีกต่อไป — ถ้าใบงานยังไม่ถูก
 *  ยกเลิกทั้งใบ (แค่บางรายการถูกปฏิเสธ) การ์ดจะยังโชว์สถานะจริงตามปกติ */
function getCardTone(request: HistoryRequestRow) {
  if (request.current_status === REJECTED_STATUS) {
    return { badge: 'bg-red-50 text-red-600', border: 'border-l-red-500', dot: 'bg-red-500' };
  }
  if (request.current_status === 'completed') {
    return { badge: 'bg-emerald-50 text-emerald-600', border: 'border-l-emerald-500', dot: 'bg-emerald-500' };
  }
  return { badge: 'bg-amber-50 text-amber-600', border: 'border-l-amber-500', dot: 'bg-amber-500' };
}

type Group = { key: string; label: string; icon: LucideIcon; iconTone: string };

// แท็บแรกสุด — รวมทุกสถานะไม่กรองเลย (เดิมไม่มีแท็บนี้ ค่า default ที่โหลดมาคือ "ปฏิเสธคำร้อง"
// ซึ่งให้ความรู้สึกลบเป็นมุมมองแรกที่เห็น) items ของแท็บนี้ handle แยกเป็นพิเศษใน tabs ด้านล่าง
// (ใช้ history เต็มก้อน ไม่ผ่าน getGroupKey เหมือนแท็บอื่น)
const ALL_GROUP: Group = {
  key: 'all',
  label: 'ทั้งหมด',
  icon: ClipboardList,
  iconTone: 'text-slate-600',
};

const REJECTED_GROUP: Group = {
  key: 'rejected',
  label: 'ปฏิเสธคำร้อง',
  icon: XCircle,
  iconTone: 'text-red-600',
};

const STAGE_GROUPS: Group[] = STAGES.map((stage) => {
  const meta = getStatusMeta(stage.key);
  return { key: stage.key, label: stage.label, icon: meta.icon, iconTone: meta.fg };
});

// ลำดับแท็บ: ทั้งหมด -> ตามขั้นตอนงานจริง (จบที่ "เสร็จสิ้น") -> ปฏิเสธคำร้อง (ย้ายไปท้ายสุด
// แทนที่จะขึ้นก่อนตามที่ตกลงกันไว้)
const GROUP_ORDER: Group[] = [ALL_GROUP, ...STAGE_GROUPS, REJECTED_GROUP];

// จำนวนรายการต่อหน้าในแต่ละแท็บสถานะ — เดิมโชว์ทุกรายการรวดเดียว พอสถานะไหนมีเยอะจะเลื่อนยาว
const PAGE_SIZE = 8;

function getGroupKey(request: HistoryRequestRow): string {
  if (request.current_status === REJECTED_STATUS) return 'rejected';
  const idx = getCurrentStageIndex(request.current_status);
  if (idx === -1) return 'rejected';
  return STAGES[idx].key;
}

function formatExp(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('th-TH', { month: '2-digit', year: '2-digit' });
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
}

/** แถวรายการยา 1 ตัว — เลย์เอาต์คอมแพ็คบรรทัดเดียว/สองบรรทัดที่ยืดหยุ่นตามความกว้างการ์ด
 *  (การ์ดในหน้านี้เรียงเป็น grid 2 คอลัมน์บนจอใหญ่ จึงแคบเกินกว่าจะใช้ตาราง 12 คอลัมน์แบบเดิม) */
function DrugItemRow({ item }: { item: DrugItemRowType }) {
  const itemRejected = item.current_status === REJECTED_STATUS;
  const rowTone = itemRejected ? 'border-red-100 bg-red-50/60' : 'border-border bg-secondary/40';

  return (
    <div className={`rounded-md border p-2.5 text-xs ${rowTone}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {itemRejected && (
            <XCircle
              className="h-3.5 w-3.5 shrink-0 text-red-500"
              strokeWidth={2.5}
              aria-label="รายการนี้ถูกปฏิเสธ"
            />
          )}
          <span className="truncate font-bold text-slate-700">{item.drug_name}</span>
        </span>
        <span className="shrink-0 font-bold text-primary">
          {formatCurrency(item.value_amount) ?? '-'}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span className="font-medium text-slate-600">
          {item.qty} {item.unit}
        </span>
        <span className="flex items-center gap-1 font-mono">
          <Hash className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
          {item.lot_number ?? '-'}
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
          {formatExp(item.exp_date)}
        </span>
      </div>
    </div>
  );
}

/** ปุ่ม "ตรวจสอบ PDF ใบรับคืน/แลกเปลี่ยน" — เรียก generatePdfAction สดทุกครั้ง (signed URL
 *  อายุ 5 นาที ไม่ cache) แล้วเปิดใน PdfViewerModal ตัวเดียวกับหน้าติดตามสถานะของลูกค้า
 *  (generatePdfAction เช็ค customer session + org ownership ภายใน จึงปลอดภัยทั้งหน้า
 *  ประวัติของตัวเองและประวัติรวมทั้งหน่วยงาน) */
function RequestPdfButton({ requestId, onOpen }: { requestId: number; onOpen: (url: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generatePdfAction(requestId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onOpen(result.url);
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-2.5 text-xs font-bold text-slate-600 transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
      >
        <FileText className={`h-3.5 w-3.5 ${loading ? 'animate-pulse' : ''}`} strokeWidth={2.5} aria-hidden="true" />
        {loading ? 'กำลังเตรียมเอกสาร...' : 'ตรวจสอบ PDF ใบรับคืน/แลกเปลี่ยน'}
      </button>
      {error && <p className="mt-1 text-[11px] font-medium text-red-500">{error}</p>}
    </div>
  );
}

function RequestCard({
  request,
  showSubmitter,
  showPdf,
  onOpenPdf,
}: {
  request: HistoryRequestRow;
  showSubmitter?: boolean;
  showPdf?: boolean;
  onOpenPdf: (url: string) => void;
}) {
  const tone = getCardTone(request);
  const [expanded, setExpanded] = useState(false);

  const items = request.drug_items ?? [];
  const cardValue = items.reduce(
    (sum, item) => (item.current_status === REJECTED_STATUS ? sum : sum + Number(item.value_amount || 0)),
    0,
  );

  return (
    <article
      className={`flex flex-col rounded-lg border border-border border-l-[3px] bg-card p-4 transition-colors hover:border-primary/40 ${tone.border}`}
    >
      {/* หัวการ์ด — เลขอ้างอิง + ประเภทงาน + สถานะ */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-mono text-base font-bold tracking-wide text-foreground">{request.ref_id}</h3>
            {request.request_type && (
              <span className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {request.request_type}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            ยื่นเมื่อ {new Date(request.created_at || 0).toLocaleDateString('th-TH', { dateStyle: 'long' })}
          </p>
          {showSubmitter && request.submitted_by && (
            <p className="mt-1 flex items-center gap-1 text-xs font-bold text-slate-500">
              <UserRound className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
              {request.submitted_by}
            </p>
          )}
        </div>
        <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${tone.badge}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
          {getStatusLabel(request.current_status)}
        </span>
      </div>

      {/* แถบสรุป — เติมพื้นที่แนวนอนที่เคยว่าง ด้วยตัวเลขที่ลูกค้าอยากเห็นเร็วๆ */}
      <div className="mt-3 grid grid-cols-3 divide-x divide-border rounded-md border border-border bg-secondary/40 text-center">
        <div className="px-2 py-2">
          <p className="text-sm font-bold text-foreground">{items.length}</p>
          <p className="text-[11px] text-muted-foreground">รายการยา</p>
        </div>
        <div className="px-2 py-2">
          <p className="text-sm font-bold text-foreground">{formatShortDate(request.updated_at || request.created_at)}</p>
          <p className="text-[11px] text-muted-foreground">อัปเดตล่าสุด</p>
        </div>
        <div className="px-2 py-2">
          <p className="text-sm font-bold text-primary">{formatCurrency(cardValue) ?? '-'}</p>
          <p className="text-[11px] text-muted-foreground">มูลค่ารวม</p>
        </div>
      </div>

      {/* รายการยา — ยุบไว้ก่อนเพื่อให้การ์ดกระชับใน grid กางดูได้ทีละใบ */}
      {items.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="mt-3 flex items-center justify-between rounded-md px-1 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              <Pill className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              {expanded ? 'ซ่อนรายการยา' : `ดูรายการยา ${items.length} รายการ`}
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
              strokeWidth={2.5}
              aria-hidden="true"
            />
          </button>
          {expanded && (
            <div className="mt-2 space-y-2">
              {items.map((item) => (
                <DrugItemRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ปุ่มการทำงาน — PDF ใบรับคืน/แลกเปลี่ยน อยู่คู่กับปุ่มติดตามสถานะ */}
      <div className="mt-auto flex flex-col gap-2 pt-3">
        {showPdf && request.id && <RequestPdfButton requestId={request.id} onOpen={onOpenPdf} />}
        <a
          href={`/customer/tracking?ref=${request.ref_id}`}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-2.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          ติดตามสถานะคำร้อง
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
  tone: { iconBg: string; iconText: string };
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${tone.iconBg} ${tone.iconText}`}
      >
        <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-lg font-bold leading-tight text-foreground">{value}</p>
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function ExchangeHistoryView({
  fetcher,
  title,
  subtitle,
  icon: HeaderIcon = History,
  showSubmitter = false,
  showPdf = true,
  emptyText = 'ยังไม่มีคำร้องคืนสินค้า',
  emptySubtext = 'คำร้องที่คุณยื่นจะแสดงที่นี่',
  headerExtra,
}: {
  fetcher: () => Promise<HistoryRequestRow[]>;
  title: string;
  subtitle: string;
  icon?: LucideIcon;
  showSubmitter?: boolean;
  /** แสดงปุ่ม "ตรวจสอบ PDF ใบรับคืน/แลกเปลี่ยน" ในแต่ละการ์ด — generatePdfAction เช็ค
   *  customer session + org ownership ภายใน จึงปลอดภัยทั้งหน้าประวัติตัวเองและประวัติรวมหน่วยงาน */
  showPdf?: boolean;
  emptyText?: string;
  emptySubtext?: string;
  /** เนื้อหาเสริมใต้หัวข้อ/คำอธิบาย (เช่น tab กรองประเภทงาน) — วางไว้ก่อนแถบสถิติ */
  headerExtra?: React.ReactNode;
}) {
  const [history, setHistory] = useState<HistoryRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeKey, setActiveKey] = useState<string>(GROUP_ORDER[0].key);
  const [page, setPage] = useState(1);
  const [pdfModalUrl, setPdfModalUrl] = useState<string | null>(null);

  // สลับแท็บสถานะแล้วต้องกลับไปหน้า 1 เสมอ กันเคสค้างอยู่หน้า 3 ของแท็บเดิม
  // แล้วสลับมาแท็บใหม่ที่มีแค่หน้าเดียว (จะเห็นรายการว่างทั้งที่มีข้อมูลจริง)
  useEffect(() => {
    setPage(1);
  }, [activeKey]);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      const data = await fetcher();
      if (cancelled) return;
      setHistory(data);
      setLoading(false);
    }
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [fetcher]);

  const tabs = useMemo(
    () =>
      GROUP_ORDER.map((group) => ({
        ...group,
        items: group.key === 'all' ? history : history.filter((r) => getGroupKey(r) === group.key),
      })),
    [history],
  );

  useEffect(() => {
    if (loading) return;
    const current = tabs.find((t) => t.key === activeKey);
    if (current && current.items.length === 0) {
      const firstNonEmpty = tabs.find((t) => t.items.length > 0);
      if (firstNonEmpty) setActiveKey(firstNonEmpty.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const activeTab = tabs.find((t) => t.key === activeKey) ?? tabs[0];
  const totalPages = Math.max(1, Math.ceil(activeTab.items.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = activeTab.items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const completedCount = tabs.find((t) => t.key === 'completed')?.items.length ?? 0;
  const rejectedCount = tabs.find((t) => t.key === 'rejected')?.items.length ?? 0;
  const inProgressCount = history.length - completedCount - rejectedCount;
  const totalValue = history.reduce(
    (sum, r) =>
      sum +
      (r.drug_items?.reduce(
        (s: number, item: DrugItemRowType) =>
          item.current_status === REJECTED_STATUS ? s : s + Number(item.value_amount || 0),
        0,
      ) ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <HeaderIcon className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="text-xs font-medium text-muted-foreground sm:text-sm">{subtitle}</p>
        </div>
      </div>

      {headerExtra}

      {!loading && history.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <StatCard
            icon={ClipboardList}
            value={history.length}
            label="คำร้องทั้งหมด"
            tone={{ iconBg: 'bg-accent', iconText: 'text-accent-foreground' }}
          />
          <StatCard
            icon={Loader2}
            value={inProgressCount}
            label="กำลังดำเนินการ"
            tone={{ iconBg: 'bg-amber-50', iconText: 'text-amber-600' }}
          />
          <StatCard
            icon={CheckCircle2}
            value={completedCount}
            label="เสร็จสิ้น"
            tone={{ iconBg: 'bg-emerald-50', iconText: 'text-emerald-600' }}
          />
          <StatCard
            icon={XCircle}
            value={rejectedCount}
            label="ถูกปฏิเสธ"
            tone={{ iconBg: 'bg-red-50', iconText: 'text-red-600' }}
          />
          <StatCard
            icon={Wallet}
            value={formatCurrency(totalValue) ?? '0 บาท'}
            label="มูลค่ารวมทั้งหมด"
            tone={{ iconBg: 'bg-accent', iconText: 'text-accent-foreground' }}
          />
        </div>
      )}

      {loading ? (
        <ExchangeCardsSkeleton cards={4} />
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card/60 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
            <Inbox className="h-7 w-7 text-slate-300" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <p className="text-sm font-bold text-muted-foreground">{emptyText}</p>
          <p className="text-xs text-muted-foreground">{emptySubtext}</p>
        </div>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="กรองประวัติตามสถานะ"
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const active = tab.key === activeTab?.key;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveKey(tab.key)}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-card text-slate-600 hover:border-primary/50'
                  }`}
                >
                  <TabIcon className={`h-3.5 w-3.5 ${active ? 'text-primary-foreground' : tab.iconTone}`} strokeWidth={2.5} aria-hidden="true" />
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                      active ? 'bg-white/20 text-primary-foreground' : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {tab.items.length}
                  </span>
                </button>
              );
            })}
          </div>

          {activeTab && activeTab.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-card/60 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                <Inbox className="h-6 w-6 text-slate-300" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <p className="text-sm font-bold text-muted-foreground">ยังไม่มีคำร้องในสถานะนี้</p>
            </div>
          ) : (
            <>
              {/* items-start = การ์ดแต่ละใบสูงตามเนื้อหาตัวเอง ไม่ยืดตามใบข้างๆ ในแถวเดียวกัน
                  (กันเคสกางรายการยาใบซ้ายแล้วใบขวาโตตามเป็นช่องว่าง เหมือนเปิดตาม) */}
              <div className="grid items-start gap-4 md:grid-cols-2">
                {pagedItems.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    showSubmitter={showSubmitter}
                    showPdf={showPdf}
                    onOpenPdf={setPdfModalUrl}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex flex-col items-center gap-2 pt-2 sm:flex-row sm:justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    แสดง {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, activeTab.items.length)} จาก {activeTab.items.length} รายการ
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
                      aria-label="หน้าก่อนหน้า"
                    >
                      <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold transition-colors ${
                          p === currentPage ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
                      aria-label="หน้าถัดไป"
                    >
                      <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {pdfModalUrl && <PdfViewerModal url={pdfModalUrl} onClose={() => setPdfModalUrl(null)} />}
    </div>
  );
}
