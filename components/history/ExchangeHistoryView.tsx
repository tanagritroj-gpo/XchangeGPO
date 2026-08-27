'use client';

import { useEffect, useState } from 'react';
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
  ChevronLeft,
  ChevronRight,
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
    return { badge: 'bg-red-50 text-red-700', border: 'border-l-red-500' };
  }
  if (request.current_status === 'completed') {
    return { badge: 'bg-emerald-50 text-emerald-700', border: 'border-l-emerald-500' };
  }
  return { badge: 'bg-amber-50 text-amber-700', border: 'border-l-amber-500' };
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
const PAGE_SIZE = 10;

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

/** แถวรายการยา 1 ตัว — แยก 2 เลย์เอาต์ชัดเจน:
 *  มือถือ: ซ้อนกันเป็นบรรทัด (ชื่อยา → badge Lot/Exp/จำนวน แบบ wrap ได้ → มูลค่า)
 *  sm ขึ้นไป: grid-cols-12 แนวนอนแบบเดิม
 *  เดิมใช้ grid-cols-12 ตัวเดียวกันทุกขนาดจอ พอมือถือแคบ 5 คอลัมน์ (ชื่อยา/
 *  จำนวน/Lot/Exp/มูลค่า) ถูกบีบจนตัวอักษรชนกัน โดยเฉพาะ Lot ที่มี icon Hash
 *  + font-mono กับ Exp ที่มี icon Calendar ในคอลัมน์แคบเกินไป */
function DrugItemRow({ item }: { item: DrugItemRowType }) {
  const itemRejected = item.current_status === REJECTED_STATUS;
  const rowTone = itemRejected ? 'border-red-100 bg-red-50/60' : 'border-border bg-slate-50';

  return (
    <div className={`rounded-lg border p-3 text-xs ${rowTone}`}>
      {/* ── มือถือ: ซ้อนกัน (ซ่อนบน sm ขึ้นไป) ── */}
      <div className="space-y-2 sm:hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {itemRejected && (
              <XCircle
                className="h-3.5 w-3.5 shrink-0 text-red-500"
                strokeWidth={2.5}
                aria-label="รายการนี้ถูกปฏิเสธ"
              />
            )}
            <span className="truncate font-bold text-slate-700">{item.drug_name}</span>
          </div>
          <span className="shrink-0 font-bold text-teal-600">
            {formatCurrency(item.value_amount) ?? '-'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="font-medium text-slate-600">
            {item.qty} {item.unit}
          </span>
          <span className="flex items-center gap-1 font-mono">
            <Hash className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
            {item.lot_number ?? '-'}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
            {formatExp(item.exp_date)}
          </span>
        </div>
      </div>

      {/* ── sm ขึ้นไป: grid แนวนอนเหมือนเดิม (ซ่อนบนมือถือ) ── */}
      <div className="hidden sm:grid sm:grid-cols-12 sm:items-center sm:gap-2">
        <div className="col-span-4 flex min-w-0 items-center gap-1.5">
          {itemRejected && (
            <XCircle
              className="h-3.5 w-3.5 shrink-0 text-red-500"
              strokeWidth={2.5}
              aria-label="รายการนี้ถูกปฏิเสธ"
            />
          )}
          <span className="truncate font-bold text-slate-700">{item.drug_name}</span>
        </div>
        <div className="col-span-1 font-medium text-slate-600">
          {item.qty} {item.unit}
        </div>
        <div className="col-span-2 flex items-center gap-1 font-mono text-muted-foreground">
          <Hash className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
          {item.lot_number ?? '-'}
        </div>
        <div className="col-span-2 flex items-center gap-1 text-muted-foreground">
          <Calendar className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
          {formatExp(item.exp_date)}
        </div>
        <div className="col-span-3 text-right font-bold text-teal-600">
          {formatCurrency(item.value_amount) ?? '-'}
        </div>
      </div>
    </div>
  );
}

function RequestCard({ request, showSubmitter }: { request: HistoryRequestRow; showSubmitter?: boolean }) {
  const tone = getCardTone(request);

  return (
    <div
      className={`rounded-2xl border border-border border-l-4 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${tone.border}`}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-black text-foreground">{request.ref_id}</h3>
            {request.request_type && (
              <span className="rounded-md border border-teal-100 bg-teal-50 px-2 py-0.5 text-[9px] font-bold uppercase text-teal-700">
                {request.request_type}
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-muted-foreground">
            {new Date(request.created_at || 0).toLocaleDateString('th-TH', { dateStyle: 'long' })}
          </p>
          {showSubmitter && request.submitted_by && (
            <p className="mt-1 flex items-center gap-1 text-xs font-bold text-slate-500">
              <UserRound className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
              ยื่นโดย: {request.submitted_by}
            </p>
          )}
        </div>

        <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${tone.badge}`}>
          {getStatusLabel(request.current_status)}
        </span>
      </div>

      <div className="mb-5 space-y-2">
        {/* หัวคอลัมน์โชว์เฉพาะ sm ขึ้นไป เพราะมือถือใช้ label แบบ inline ในแต่ละแถวแทน */}
        <div className="hidden sm:grid sm:grid-cols-12 sm:gap-2 sm:px-3 sm:pb-1 sm:text-[9px] sm:font-bold sm:uppercase sm:tracking-widest sm:text-muted-foreground">
          <div className="col-span-4">ชื่อยา</div>
          <div className="col-span-1">จำนวน</div>
          <div className="col-span-2">Lot</div>
          <div className="col-span-2">Exp</div>
          <div className="col-span-3 text-right">มูลค่า</div>
        </div>

        <div className="space-y-2">
          {request.drug_items?.map((item: DrugItemRowType) => (
            <DrugItemRow key={item.id} item={item} />
          ))}
        </div>
      </div>

      <a
        href={`/customer/tracking?ref=${request.ref_id}`}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal-50 py-2.5 text-xs font-bold text-teal-700 transition-all hover:bg-teal-100 hover:-translate-y-0.5"
      >
        ติดตามสถานะคำร้อง
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
      </a>
    </div>
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
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3.5 shadow-sm transition-shadow hover:shadow-md">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.iconBg} ${tone.iconText}`}
      >
        <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-lg font-black leading-tight text-foreground">{value}</p>
        <p className="truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
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
  emptyText = 'ยังไม่มีคำร้องคืนสินค้า',
  emptySubtext = 'คำร้องที่คุณยื่นจะแสดงที่นี่',
  headerExtra,
}: {
  fetcher: () => Promise<HistoryRequestRow[]>;
  title: string;
  subtitle: string;
  icon?: LucideIcon;
  showSubmitter?: boolean;
  emptyText?: string;
  emptySubtext?: string;
  /** เนื้อหาเสริมใต้หัวข้อ/คำอธิบาย (เช่น tab กรองประเภทงาน) — วางไว้ก่อนแถบสถิติ */
  headerExtra?: React.ReactNode;
}) {
  const [history, setHistory] = useState<HistoryRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeKey, setActiveKey] = useState<string>(GROUP_ORDER[0].key);
  const [page, setPage] = useState(1);

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

  const tabs = GROUP_ORDER.map((group) => ({
    ...group,
    items: group.key === 'all' ? history : history.filter((r) => getGroupKey(r) === group.key),
  }));

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
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-200">
          <HeaderIcon className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
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
            tone={{ iconBg: 'bg-teal-50', iconText: 'text-teal-600' }}
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
            tone={{ iconBg: 'bg-slate-100', iconText: 'text-slate-600' }}
          />
        </div>
      )}

      {loading ? (
        <ExchangeCardsSkeleton cards={3} />
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-teal-100 bg-teal-50/30 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
            <Inbox className="h-7 w-7 text-teal-300" strokeWidth={1.5} aria-hidden="true" />
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
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold transition-all ${
                    active
                      ? 'bg-teal-600 text-white shadow-sm shadow-teal-200'
                      : 'border border-teal-100 bg-white text-teal-700 hover:bg-teal-50'
                  }`}
                >
                  <TabIcon className={`h-3.5 w-3.5 ${active ? 'text-white' : tab.iconTone}`} strokeWidth={2} aria-hidden="true" />
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-muted-foreground'
                    }`}
                  >
                    {tab.items.length}
                  </span>
                </button>
              );
            })}
          </div>

          {activeTab && activeTab.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-teal-100 bg-teal-50/30 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
                <Inbox className="h-6 w-6 text-teal-300" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <p className="text-sm font-bold text-muted-foreground">ยังไม่มีคำร้องในสถานะนี้</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {pagedItems.map((request) => (
                  <RequestCard key={request.id} request={request} showSubmitter={showSubmitter} />
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
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
                      aria-label="หน้าก่อนหน้า"
                    >
                      <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                          p === currentPage ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-slate-100'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
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
    </div>
  );
}
