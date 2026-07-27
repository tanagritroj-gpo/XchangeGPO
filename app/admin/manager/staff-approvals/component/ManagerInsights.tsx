'use client';
import { useState, useMemo } from 'react';
import {
  BarChart3, TrendingUp, Wallet, Package, Clock, AlertOctagon, Users, ClipboardList,
  Layers, MapPin, FileText, XCircle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

// ── Helper: จัดกลุ่มข้อมูลรายเดือน/รายปี ──
const MONTH_LABELS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function getPeriodKey(dateStr: string, mode: 'month' | 'year') {
  const d = new Date(dateStr);
  return mode === 'month' ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : String(d.getFullYear());
}

function getPeriods(mode: 'month' | 'year') {
  if (mode === 'month') {
    const arr = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      arr.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: `${MONTH_LABELS_TH[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}`,
      });
    }
    return arr;
  }
  const nowYear = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => {
    const y = nowYear - 4 + i;
    return { key: String(y), label: String(y + 543) };
  });
}

function pctChange(curr: number, prev: number) {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return Math.round(((curr - prev) / prev) * 100);
}

// สีของแต่ละประเภทคำร้อง — ตรงกับ TYPES ใน Step1Info.tsx
const REQUEST_TYPE_COLORS: Record<string, string> = {
  'รับคืนลดหนี้':     '#10b981',
  'รับคืน CCR':       '#ef4444',
  'รับคืนแลกเปลี่ยน': '#3b82f6',
};
const DEFAULT_TYPE_COLOR = '#94a3b8';

// สีสำหรับกราฟ stacked ทั่วไป (เหตุผล, จังหวัด ฯลฯ)
const PALETTE = ['#14b8a6', '#3b82f6', '#f59e0b', '#8b5cf6', '#f43f5e', '#10b981', '#94a3b8', '#0ea5e9'];

// ลำดับสถานะของ workflow (ใช้เรียงกราฟ "เวลาเฉลี่ยแต่ละขั้นตอน" ให้ตรงลำดับจริง)
const STAGE_ORDER = ['pending_review', 'approved', 'in_transit', 'at_warehouse', 'checked_in', 'receiving', 'exchanging', 'completed'];
const STAGE_LABEL: Record<string, string> = {
  pending_review: 'รอตรวจสอบ',
  approved: 'อนุมัติ',
  in_transit: 'ขนส่ง',
  at_warehouse: 'ถึงคลัง',
  checked_in: 'ตรวจรับ',
  receiving: 'จัดเก็บ',
  exchanging: 'แลกเปลี่ยน',
  completed: 'เสร็จสิ้น',
};

// ── UI Sub-components ──
function StatCard({ icon: Icon, label, value, sub, accentBg, accentColor }: {
  icon: any; label: string; value: string; sub?: string; accentBg: string; accentColor: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 flex items-center gap-3.5">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${accentBg}`}>
        <Icon size={20} className={accentColor} strokeWidth={2.5} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-400 truncate">{label}</p>
        <p className="text-lg md:text-xl font-bold text-slate-800 truncate">{value}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ComparisonCard({ icon: Icon, label, periodLabel, current, previous, formatValue, accentBg, accentColor }: {
  icon: any; label: string; periodLabel: string; current: number; previous: number;
  formatValue: (n: number) => string; accentBg: string; accentColor: string;
}) {
  const change = pctChange(current, previous);
  const isUp = change >= 0;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accentBg}`}>
          <Icon size={16} className={accentColor} strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-500 truncate">{label}</p>
          <p className="text-[10px] text-slate-400">{periodLabel}</p>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="text-lg md:text-xl font-bold text-slate-800 truncate">{formatValue(current)}</p>
        <span className={`flex items-center gap-0.5 text-[11px] font-bold px-2 py-1 rounded-full shrink-0 ${isUp ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
          {isUp ? <ArrowUpRight size={12} strokeWidth={3} /> : <ArrowDownRight size={12} strokeWidth={3} />}
          {Math.abs(change)}%
        </span>
      </div>
      <p className="text-[10px] text-slate-400 mt-1">เทียบก่อนหน้า: {formatValue(previous)}</p>
    </div>
  );
}

function ChartCard({ icon: Icon, title, subtitle, accentBg, accentColor, rightSlot, children }: {
  icon: any; title: string; subtitle: string; accentBg: string; accentColor: string; rightSlot?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-6">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${accentBg}`}>
            <Icon size={16} className={accentColor} strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">{title}</h3>
            <p className="text-[11px] text-slate-400">{subtitle}</p>
          </div>
        </div>
        {rightSlot}
      </div>
      {children}
    </div>
  );
}

function PeriodToggle({ mode, onChange }: { mode: 'month' | 'year'; onChange: (m: 'month' | 'year') => void }) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100">
      <button
        onClick={() => onChange('month')}
        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${mode === 'month' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
      >
        รายเดือน
      </button>
      <button
        onClick={() => onChange('year')}
        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${mode === 'year' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
      >
        รายปี
      </button>
    </div>
  );
}

// ── Main Component ──
export default function ManagerInsights({ requests, statusLogs }: { requests: any[]; statusLogs: any[] }) {
  const [drugPeriodMode, setDrugPeriodMode] = useState<'month' | 'year'>('month');
  const [valuePeriodMode, setValuePeriodMode] = useState<'month' | 'year'>('month');
  const [reasonPeriodMode, setReasonPeriodMode] = useState<'month' | 'year'>('month');

  // ══ Stat Cards (เดิม) ══
  const totalValue = useMemo(() => requests.reduce((s, r) => s + (Number(r.total_value) || 0), 0), [requests]);
  const totalDrugItems = useMemo(() => requests.reduce((s, r) => s + (r.drug_items?.length ?? 0), 0), [requests]);
  const avgTurnaroundDays = useMemo(() => {
    const done = requests.filter(r => r.current_status === 'completed' && r.updated_at && r.created_at);
    if (done.length === 0) return null;
    const total = done.reduce((s, r) => s + (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 86400000, 0);
    return Math.round(total / done.length);
  }, [requests]);
  const rejectionRateOverall = useMemo(() => {
    if (requests.length === 0) return 0;
    const rejected = requests.filter(r => r.current_status === 'rejected').length;
    return Math.round((rejected / requests.length) * 100);
  }, [requests]);

  // ══ ใหม่ #5: เทียบเดือนนี้ vs เดือนก่อน / ปีนี้ vs ปีก่อน ══
  const periodComparison = useMemo(() => {
    const now = new Date();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const inMonth = (dateStr: string, y: number, m: number) => {
      const d = new Date(dateStr);
      return d.getFullYear() === y && d.getMonth() === m;
    };
    const inYear = (dateStr: string, y: number) => new Date(dateStr).getFullYear() === y;

    const thisMonthReqs = requests.filter(r => r.created_at && inMonth(r.created_at, now.getFullYear(), now.getMonth()));
    const lastMonthReqs = requests.filter(r => r.created_at && inMonth(r.created_at, lastMonthDate.getFullYear(), lastMonthDate.getMonth()));
    const thisYearReqs = requests.filter(r => r.created_at && inYear(r.created_at, now.getFullYear()));
    const lastYearReqs = requests.filter(r => r.created_at && inYear(r.created_at, now.getFullYear() - 1));

    const sumValue = (arr: any[]) => arr.reduce((s, r) => s + (Number(r.total_value) || 0), 0);

    return {
      monthLabel: `${MONTH_LABELS_TH[now.getMonth()]} ${String(now.getFullYear() + 543).slice(2)}`,
      yearLabel: String(now.getFullYear() + 543),
      thisMonthCount: thisMonthReqs.length,
      lastMonthCount: lastMonthReqs.length,
      thisMonthValue: sumValue(thisMonthReqs),
      lastMonthValue: sumValue(lastMonthReqs),
      thisYearCount: thisYearReqs.length,
      lastYearCount: lastYearReqs.length,
      thisYearValue: sumValue(thisYearReqs),
      lastYearValue: sumValue(lastYearReqs),
    };
  }, [requests]);

  // 1) รายการยาที่ส่งคืน ต่อเดือน/ปี (เดิม)
  const drugItemsTrend = useMemo(() => {
    const periods = getPeriods(drugPeriodMode);
    return periods.map(p => ({
      period: p.label,
      count: requests
        .filter(r => r.created_at && getPeriodKey(r.created_at, drugPeriodMode) === p.key)
        .reduce((s, r) => s + (r.drug_items?.length ?? 0), 0),
    }));
  }, [requests, drugPeriodMode]);

  // ══ ใหม่ #1: เวลาเฉลี่ยแต่ละขั้นตอน (จาก status_logs) ══
  const stageDurations = useMemo(() => {
    // จัดกลุ่ม: request_id -> status_name -> วันที่แรกสุดที่ถึงสถานะนั้น
    const byRequest: Record<string, Record<string, string>> = {};
    statusLogs.forEach((log: any) => {
      if (!log.request_id || !log.status_name || !log.log_date) return;
      const key = String(log.request_id);
      if (!byRequest[key]) byRequest[key] = {};
      const existing = byRequest[key][log.status_name];
      if (!existing || new Date(log.log_date) < new Date(existing)) {
        byRequest[key][log.status_name] = log.log_date;
      }
    });

    const durationsByStage: Record<string, number[]> = {};

    Object.values(byRequest).forEach(statusMap => {
      const entries = STAGE_ORDER
        .filter(s => statusMap[s])
        .map(s => ({ status: s, date: new Date(statusMap[s]) }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

      for (let i = 0; i < entries.length - 1; i++) {
        const stageKey = `${STAGE_LABEL[entries[i].status]} → ${STAGE_LABEL[entries[i + 1].status]}`;
        const days = (entries[i + 1].date.getTime() - entries[i].date.getTime()) / 86400000;
        if (!durationsByStage[stageKey]) durationsByStage[stageKey] = [];
        durationsByStage[stageKey].push(days);
      }
    });

    return Object.entries(durationsByStage)
      .map(([stage, days]) => ({
        stage,
        avgDays: Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10,
        count: days.length,
      }))
      .filter(x => x.count > 0);
  }, [statusLogs]);

  // 2 & 3) สถิติลูกค้า: จำนวนใบงาน / มูลค่ารวม (เดิม)
  const topCustomersByCount = useMemo(() => {
    const map: Record<string, number> = {};
    requests.forEach(r => {
      const name = r.hospital_name || 'ไม่ระบุ';
      map[name] = (map[name] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [requests]);

  const topCustomersByValue = useMemo(() => {
    const map: Record<string, number> = {};
    requests.forEach(r => {
      const name = r.hospital_name || 'ไม่ระบุ';
      map[name] = (map[name] || 0) + (Number(r.total_value) || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [requests]);

  // 4) มูลค่าสะสมแยกตาม request_type รายเดือน/ปี (เดิม)
  const requestTypes = useMemo(
    () => Array.from(new Set(requests.map(r => r.request_type).filter(Boolean))) as string[],
    [requests]
  );
  const valueByTypeTrend = useMemo(() => {
    const periods = getPeriods(valuePeriodMode);
    return periods.map(p => {
      const row: Record<string, any> = { period: p.label };
      requestTypes.forEach(type => {
        row[type] = requests
          .filter(r => r.created_at && getPeriodKey(r.created_at, valuePeriodMode) === p.key && r.request_type === type)
          .reduce((s, r) => s + (Number(r.total_value) || 0), 0);
      });
      return row;
    });
  }, [requests, valuePeriodMode, requestTypes]);

  // ══ ใหม่ #3: มูลค่า/จำนวนใบงานแยกตามจังหวัด ══
  const provinceStats = useMemo(() => {
    const countMap: Record<string, number> = {};
    const valueMap: Record<string, number> = {};
    requests.forEach(r => {
      const province = r.province || r.addr_province || 'ไม่ระบุ';
      countMap[province] = (countMap[province] || 0) + 1;
      valueMap[province] = (valueMap[province] || 0) + (Number(r.total_value) || 0);
    });
    const byCount = Object.entries(countMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    const byValue = Object.entries(valueMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
    return { byCount, byValue };
  }, [requests]);

  // ══ ใหม่ #2: สถิติเหตุผลที่ลูกค้าส่งเรื่องเข้ามา รายเดือน/ปี ══
  const normalizeReason = (reason: string) => {
    if (!reason) return 'ไม่ระบุ';
    if (reason.startsWith('อื่นๆ')) return 'อื่นๆ';
    return reason;
  };
  const reasonCategories = useMemo(
    () => Array.from(new Set(requests.map(r => normalizeReason(r.return_reason)))) as string[],
    [requests]
  );
  const reasonTrend = useMemo(() => {
    const periods = getPeriods(reasonPeriodMode);
    return periods.map(p => {
      const row: Record<string, any> = { period: p.label };
      reasonCategories.forEach(reason => {
        row[reason] = requests.filter(r =>
          r.created_at &&
          getPeriodKey(r.created_at, reasonPeriodMode) === p.key &&
          normalizeReason(r.return_reason) === reason
        ).length;
      });
      return row;
    });
  }, [requests, reasonPeriodMode, reasonCategories]);

  // Bonus: ยาที่ถูกส่งคืนบ่อยที่สุด (เดิม)
  const topReturnedDrugs = useMemo(() => {
    const map: Record<string, number> = {};
    requests.forEach(r => (r.drug_items || []).forEach((i: any) => {
      map[i.drug_name] = (map[i.drug_name] || 0) + (Number(i.qty) || 1);
    }));
    return Object.entries(map).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 6);
  }, [requests]);

  // Bonus: อัตราการปฏิเสธรายเดือน (เดิม)
  const rejectionTrend = useMemo(() => {
    const periods = getPeriods(drugPeriodMode);
    return periods.map(p => {
      const monthReqs = requests.filter(r => r.created_at && getPeriodKey(r.created_at, drugPeriodMode) === p.key);
      const total = monthReqs.length;
      const rejected = monthReqs.filter(r => r.current_status === 'rejected').length;
      return { period: p.label, rate: total ? Math.round((rejected / total) * 100) : 0 };
    });
  }, [requests, drugPeriodMode]);

  // ══ ใหม่ #4: เหตุผลการปฏิเสธยอดนิยม (จาก status_logs ที่ status_name = 'rejected') ══
  const topRejectionReasons = useMemo(() => {
    const map: Record<string, number> = {};
    statusLogs
      .filter((log: any) => log.status_name === 'rejected' && log.staff_remark && log.staff_remark.trim())
      .forEach((log: any) => {
        const remark = log.staff_remark.trim();
        map[remark] = (map[remark] || 0) + 1;
      });
    return Object.entries(map)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [statusLogs]);

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2.5 px-1">
        <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
          <BarChart3 size={16} className="text-purple-600" strokeWidth={2.5} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800">ภาพรวม & สถิติ</h2>
          <p className="text-[11px] text-slate-400">แนวโน้มและข้อมูลเชิงลึกสำหรับผู้บริหาร</p>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={ClipboardList} label="ใบงานทั้งหมด" value={requests.length.toLocaleString('th-TH')} accentBg="bg-blue-100" accentColor="text-blue-600" />
        <StatCard icon={Wallet} label="มูลค่ารวมทั้งหมด" value={`฿${totalValue.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`} accentBg="bg-emerald-100" accentColor="text-emerald-600" />
        <StatCard icon={Package} label="รายการยารวม" value={totalDrugItems.toLocaleString('th-TH')} sub="ทุกใบงาน" accentBg="bg-teal-100" accentColor="text-teal-600" />
        <StatCard
          icon={Clock} label="เวลาเฉลี่ยจนเสร็จสิ้น"
          value={avgTurnaroundDays !== null ? `${avgTurnaroundDays} วัน` : '—'}
          sub={avgTurnaroundDays === null ? 'ยังไม่มีใบงานเสร็จสิ้น' : undefined}
          accentBg="bg-amber-100" accentColor="text-amber-600"
        />
      </div>

      {/* ── ใหม่ #5: เทียบช่วงเวลา (MoM / YoY) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <ComparisonCard
          icon={ClipboardList} label="ใบงานเดือนนี้" periodLabel={`เทียบเดือนก่อน (${periodComparison.monthLabel})`}
          current={periodComparison.thisMonthCount} previous={periodComparison.lastMonthCount}
          formatValue={(n) => n.toLocaleString('th-TH')}
          accentBg="bg-blue-100" accentColor="text-blue-600"
        />
        <ComparisonCard
          icon={Wallet} label="มูลค่าเดือนนี้" periodLabel={`เทียบเดือนก่อน (${periodComparison.monthLabel})`}
          current={periodComparison.thisMonthValue} previous={periodComparison.lastMonthValue}
          formatValue={(n) => `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`}
          accentBg="bg-emerald-100" accentColor="text-emerald-600"
        />
        <ComparisonCard
          icon={ClipboardList} label="ใบงานปีนี้" periodLabel={`เทียบปีก่อน (${periodComparison.yearLabel})`}
          current={periodComparison.thisYearCount} previous={periodComparison.lastYearCount}
          formatValue={(n) => n.toLocaleString('th-TH')}
          accentBg="bg-indigo-100" accentColor="text-indigo-600"
        />
        <ComparisonCard
          icon={Wallet} label="มูลค่าปีนี้" periodLabel={`เทียบปีก่อน (${periodComparison.yearLabel})`}
          current={periodComparison.thisYearValue} previous={periodComparison.lastYearValue}
          formatValue={(n) => `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`}
          accentBg="bg-purple-100" accentColor="text-purple-600"
        />
      </div>

      {/* ── 1) รายการยาที่ส่งคืน ต่อเดือน/ปี ── */}
      <ChartCard
        icon={TrendingUp} title="รายการยาที่ส่งคืน" subtitle="แนวโน้มจำนวนรายการยาที่ส่งคืนตามช่วงเวลา"
        accentBg="bg-teal-100" accentColor="text-teal-600"
        rightSlot={<PeriodToggle mode={drugPeriodMode} onChange={setDrugPeriodMode} />}
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={drugItemsTrend} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v: any) => [`${v} รายการ`, 'จำนวน']} />
            <Bar dataKey="count" fill="#14b8a6" radius={[6, 6, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── ใหม่ #1: เวลาเฉลี่ยแต่ละขั้นตอน ── */}
      <ChartCard
        icon={Layers} title="เวลาเฉลี่ยแต่ละขั้นตอน" subtitle="จำนวนวันเฉลี่ยที่ใช้ในแต่ละช่วงของ workflow (จากข้อมูลจริง)"
        accentBg="bg-cyan-100" accentColor="text-cyan-600"
      >
        {stageDurations.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">ยังไม่มีข้อมูลเพียงพอสำหรับคำนวณ</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, stageDurations.length * 42)}>
            <BarChart data={stageDurations} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit=" วัน" />
              <YAxis type="category" dataKey="stage" width={150} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v: any, _n: any, p: any) => [`${v} วัน (${p.payload.count} ใบงาน)`, 'เฉลี่ย']} />
              <Bar dataKey="avgDays" fill="#06b6d4" radius={[0, 6, 6, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ── 2 & 3) สถิติลูกค้า: จำนวนใบงาน / มูลค่ารวม ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard icon={Users} title="ลูกค้าที่ส่งเรื่องมากที่สุด" subtitle="Top 8 เรียงตามจำนวนใบงาน" accentBg="bg-blue-100" accentColor="text-blue-600">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topCustomersByCount} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false}
                tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 16) + '…' : v} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v: any) => [`${v} ใบงาน`, '']} />
              <Bar dataKey="count" fill="#3b82f6" radius={[0, 6, 6, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard icon={Wallet} title="ลูกค้าที่มีมูลค่ารวมสูงสุด" subtitle="Top 8 เรียงตามมูลค่า (บาท)" accentBg="bg-emerald-100" accentColor="text-emerald-600">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topCustomersByValue} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false}
                tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 16) + '…' : v} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v: any) => [`฿${Number(v).toLocaleString('th-TH')}`, '']} />
              <Bar dataKey="value" fill="#10b981" radius={[0, 6, 6, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── 4) มูลค่าสะสมแยกตาม request_type รายเดือน/ปี ── */}
      <ChartCard
        icon={Wallet} title="มูลค่าตามประเภทคำร้อง" subtitle="มูลค่ารวมแยกตามประเภท ต่อช่วงเวลา"
        accentBg="bg-indigo-100" accentColor="text-indigo-600"
        rightSlot={<PeriodToggle mode={valuePeriodMode} onChange={setValuePeriodMode} />}
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={valueByTypeTrend} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v: any) => [`฿${Number(v).toLocaleString('th-TH')}`, '']} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {requestTypes.map((type) => (
              <Bar key={type} dataKey={type} stackId="value" fill={REQUEST_TYPE_COLORS[type] ?? DEFAULT_TYPE_COLOR}
                radius={requestTypes.indexOf(type) === requestTypes.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]} maxBarSize={36} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── ใหม่ #3: มูลค่า/จำนวนใบงานแยกตามจังหวัด ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard icon={MapPin} title="จำนวนใบงานตามจังหวัด" subtitle="Top 10 จังหวัดตามจำนวนใบงาน" accentBg="bg-rose-100" accentColor="text-rose-600">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={provinceStats.byCount} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v: any) => [`${v} ใบงาน`, '']} />
              <Bar dataKey="count" fill="#f43f5e" radius={[0, 6, 6, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard icon={MapPin} title="มูลค่าตามจังหวัด" subtitle="Top 10 จังหวัดตามมูลค่ารวม (บาท)" accentBg="bg-orange-100" accentColor="text-orange-600">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={provinceStats.byValue} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v: any) => [`฿${Number(v).toLocaleString('th-TH')}`, '']} />
              <Bar dataKey="value" fill="#f97316" radius={[0, 6, 6, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── ใหม่ #2: สถิติเหตุผลที่ลูกค้าส่งเรื่องเข้ามา รายเดือน/ปี ── */}
      <ChartCard
        icon={FileText} title="เหตุผลที่ลูกค้าส่งเรื่องเข้ามา" subtitle="จำนวนใบงานแยกตามเหตุผลที่ลูกค้าระบุ ต่อช่วงเวลา"
        accentBg="bg-violet-100" accentColor="text-violet-600"
        rightSlot={<PeriodToggle mode={reasonPeriodMode} onChange={setReasonPeriodMode} />}
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={reasonTrend} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v: any) => [`${v} ใบงาน`, '']} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {reasonCategories.map((reason, idx) => (
              <Bar key={reason} dataKey={reason} stackId="reason" fill={PALETTE[idx % PALETTE.length]}
                radius={idx === reasonCategories.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]} maxBarSize={36} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Bonus + ใหม่ #4: ยาที่ถูกส่งคืนบ่อยที่สุด / อัตราปฏิเสธ / เหตุผลปฏิเสธยอดนิยม ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard icon={Package} title="ยาที่ถูกส่งคืนบ่อยที่สุด" subtitle="Top 6 ตามจำนวนหน่วยที่ส่งคืน" accentBg="bg-rose-100" accentColor="text-rose-600">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topReturnedDrugs} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false}
                tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 16) + '…' : v} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v: any) => [`${v} หน่วย`, '']} />
              <Bar dataKey="qty" fill="#f43f5e" radius={[0, 6, 6, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard icon={AlertOctagon} title="อัตราการปฏิเสธ" subtitle={`เฉลี่ย ${rejectionRateOverall}% ของใบงานทั้งหมด`} accentBg="bg-orange-100" accentColor="text-orange-600">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={rejectionTrend} margin={{ top: 4, right: 16, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v: any) => [`${v}%`, 'อัตราปฏิเสธ']} />
              <Line type="monotone" dataKey="rate" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3, fill: '#f97316' }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── ใหม่ #4: เหตุผลการปฏิเสธยอดนิยม ── */}
      <ChartCard icon={XCircle} title="เหตุผลการปฏิเสธยอดนิยม" subtitle="Top 8 หมายเหตุที่พนักงานระบุตอนปฏิเสธ" accentBg="bg-red-100" accentColor="text-red-600">
        {topRejectionReasons.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">ยังไม่มีข้อมูลการปฏิเสธที่มีหมายเหตุ</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, topRejectionReasons.length * 40)}>
            <BarChart data={topRejectionReasons} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="reason" width={200} tick={{ fontSize: 10.5, fill: '#475569' }} axisLine={false} tickLine={false}
                tickFormatter={(v: string) => v.length > 28 ? v.slice(0, 28) + '…' : v} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v: any) => [`${v} ครั้ง`, '']} />
              <Bar dataKey="count" fill="#ef4444" radius={[0, 6, 6, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </section>
  );
}