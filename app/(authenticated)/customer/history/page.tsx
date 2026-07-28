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
  type LucideIcon,
} from 'lucide-react';
import { getCustomerExchangeHistory } from '@/app/actions/history-actions';
import {
  STAGES,
  REJECTED_STATUS,
  getStatusLabel,
  getStatusMeta,
  getCurrentStageIndex,
  formatCurrency,
} from '@/lib/tracking-status';

const hasRejectedItem = (items: any[]) =>
  items?.some((item) => item.current_status === REJECTED_STATUS);

/** badge/ขอบสีของการ์ด — อิงจาก "สถานะจริงของทั้งใบงาน" (request.current_status)
 *  เท่านั้น ไม่ผูกกับสถานะของรายการย่อยข้างในอีกต่อไป — ถ้าใบงานยังไม่ถูก
 *  ยกเลิกทั้งใบ (แค่บางรายการถูกปฏิเสธ) การ์ดจะยังโชว์สถานะจริงตามปกติ */
function getCardTone(request: any) {
  if (request.current_status === REJECTED_STATUS) {
    return { badge: 'bg-red-50 text-red-700', border: 'border-l-red-500' };
  }
  if (request.current_status === 'completed') {
    return { badge: 'bg-emerald-50 text-emerald-700', border: 'border-l-emerald-500' };
  }
  return { badge: 'bg-amber-50 text-amber-700', border: 'border-l-amber-500' };
}

type Group = { key: string; label: string; icon: LucideIcon; iconTone: string };

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

const GROUP_ORDER: Group[] = [REJECTED_GROUP, ...STAGE_GROUPS];

function getGroupKey(request: any): string {
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
function DrugItemRow({ item }: { item: any }) {
  const itemRejected = item.current_status === REJECTED_STATUS;
  const rowTone = itemRejected ? 'border-red-100 bg-red-50/60' : 'border-slate-100 bg-slate-50';

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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
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
        <div className="col-span-2 flex items-center gap-1 font-mono text-slate-500">
          <Hash className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
          {item.lot_number ?? '-'}
        </div>
        <div className="col-span-2 flex items-center gap-1 text-slate-500">
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

function RequestCard({ request }: { request: any }) {
  const tone = getCardTone(request);

  return (
    <div
      className={`rounded-2xl border border-slate-100 border-l-4 bg-white p-6 shadow-sm transition-shadow hover:shadow-md ${tone.border}`}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-black text-slate-800">{request.ref_id}</h3>
            {request.request_type && (
              <span className="rounded-md border border-teal-100 bg-teal-50 px-2 py-0.5 text-[9px] font-bold uppercase text-teal-700">
                {request.request_type}
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-slate-400">
            {new Date(request.created_at).toLocaleDateString('th-TH', { dateStyle: 'long' })}
          </p>
        </div>

        <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${tone.badge}`}>
          {getStatusLabel(request.current_status)}
        </span>
      </div>

      <div className="mb-5 space-y-2">
        {/* หัวคอลัมน์โชว์เฉพาะ sm ขึ้นไป เพราะมือถือใช้ label แบบ inline ในแต่ละแถวแทน */}
        <div className="hidden sm:grid sm:grid-cols-12 sm:gap-2 sm:px-3 sm:pb-1 sm:text-[9px] sm:font-bold sm:uppercase sm:tracking-widest sm:text-slate-400">
          <div className="col-span-4">ชื่อยา</div>
          <div className="col-span-1">จำนวน</div>
          <div className="col-span-2">Lot</div>
          <div className="col-span-2">Exp</div>
          <div className="col-span-3 text-right">มูลค่า</div>
        </div>

        <div className="space-y-2">
          {request.drug_items?.map((item: any) => (
            <DrugItemRow key={item.id} item={item} />
          ))}
        </div>
      </div>

      <a
        href={`/customer/tracking?ref=${request.ref_id}`}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal-50 py-2.5 text-xs font-bold text-teal-700 transition-colors hover:bg-teal-100"
      >
        ดูประวัติ Timeline ทั้งหมด
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
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.iconBg} ${tone.iconText}`}
      >
        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-black leading-tight text-slate-800">{value}</p>
        <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeKey, setActiveKey] = useState<string>(GROUP_ORDER[0].key);

  useEffect(() => {
    async function loadHistory() {
      const data = await getCustomerExchangeHistory();
      setHistory(data);
      setLoading(false);
    }
    loadHistory();
  }, []);

  const tabs = GROUP_ORDER.map((group) => ({
    ...group,
    items: history.filter((r) => getGroupKey(r) === group.key),
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

  const completedCount = tabs.find((t) => t.key === 'completed')?.items.length ?? 0;
  const rejectedCount = tabs.find((t) => t.key === 'rejected')?.items.length ?? 0;
  const inProgressCount = history.length - completedCount - rejectedCount;
  const totalValue = history.reduce(
    (sum, r) =>
      sum +
      (r.drug_items?.reduce(
        (s: number, item: any) =>
          item.current_status === REJECTED_STATUS ? s : s + Number(item.value_amount || 0),
        0,
      ) ?? 0),
    0,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-teal-700 text-white shadow-lg shadow-teal-200">
          <History className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800 sm:text-3xl">
            ประวัติการแลกเปลี่ยนสินค้า
          </h1>
          <p className="text-xs font-medium text-slate-400 sm:text-sm">
            ติดตามคำร้องคืน/แลกเปลี่ยนที่คุณเคยยื่นทั้งหมด
          </p>
        </div>
      </div>

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
        <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2} aria-hidden="true" />
          กำลังโหลดประวัติ...
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 py-20 text-center">
          <Inbox className="h-8 w-8 text-slate-300" strokeWidth={1.5} aria-hidden="true" />
          <p className="text-sm font-bold text-slate-500">ยังไม่มีคำร้องคืนสินค้า</p>
          <p className="text-xs text-slate-400">คำร้องที่คุณยื่นจะแสดงที่นี่</p>
        </div>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="กรองประวัติตามสถานะ"
            className="-mx-6 flex gap-1 overflow-x-auto border-b border-slate-200 px-6"
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
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-xs font-bold transition-colors ${
                    active
                      ? `border-teal-600 ${tab.iconTone}`
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <TabIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      active
                        ? 'bg-teal-50 text-teal-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {tab.items.length}
                  </span>
                </button>
              );
            })}
          </div>

          {activeTab && activeTab.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 py-16 text-center">
              <Inbox className="h-7 w-7 text-slate-300" strokeWidth={1.5} aria-hidden="true" />
              <p className="text-sm font-bold text-slate-500">ยังไม่มีคำร้องในสถานะนี้</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeTab?.items.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}