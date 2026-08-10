'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  AlarmClock,
  SlidersHorizontal,
  CalendarRange,
  ShieldCheck,
  LogOut,
  Loader2,
  Download,
  Clock,
  AlertTriangle,
  Save,
} from 'lucide-react';
import { logoutStaffAction } from '@/app/actions/auth-staff';
import { getCSRDashboardData } from '@/app/actions/csr-actions';
import { getManagerStatusLogs } from '@/app/actions/manager-actions';
import {
  getSlaQueueForManager,
  getSlaRules,
  updateSlaRule,
  markManagerSlaBadgeAsRead,
} from '@/app/actions/sla-actions';
import { SkeletonTopBar, SkeletonSidebarTabs, SkeletonSimpleRows } from '@/components/skeletons/DashboardSkeleton';
import { getStatusLabel } from '@/lib/tracking-status';
import { filterCsrRequests } from '@/lib/csr-report-filters';
import type { LucideIcon } from 'lucide-react';
import type { RequestRow, StatusLogRow, SlaQueueRow, SlaRuleRow } from '@/lib/types';

// ── โทนสี sidebar — ตรงกับ pattern ของ staff-approvals/page.tsx (TAB_ACCENTS) เพิ่มโทนแดง
// ที่นั่นยังไม่มีเพราะ "urgency" ยังไม่เคยเป็นหัวข้อของหน้าไหนมาก่อน SLA Monitoring นี้ ──
const TAB_ACCENTS = {
  red: { bg: 'bg-red-100', text: 'text-red-600', shadow: 'shadow-[0_10px_24px_-10px_rgba(220,38,38,0.4)]', bar: 'from-red-400 to-red-600', barGlow: 'shadow-[0_0_8px_rgba(248,113,113,0.7)]' },
  violet: { bg: 'bg-violet-100', text: 'text-violet-600', shadow: 'shadow-[0_10px_24px_-10px_rgba(124,58,237,0.4)]', bar: 'from-violet-400 to-violet-600', barGlow: 'shadow-[0_0_8px_rgba(139,92,246,0.7)]' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-600', shadow: 'shadow-[0_10px_24px_-10px_rgba(13,148,136,0.4)]', bar: 'from-teal-400 to-teal-600', barGlow: 'shadow-[0_0_8px_rgba(45,212,191,0.7)]' },
} as const;

function TabButton({ icon: Icon, label, count, active, onClick, accent }: {
  icon: LucideIcon; label: string; count?: number; active: boolean; onClick: () => void;
  accent: keyof typeof TAB_ACCENTS;
}) {
  const a = TAB_ACCENTS[accent];
  return (
    <button
      onClick={onClick}
      className={`relative overflow-hidden flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 shrink-0 md:w-full text-left border
        ${active
          ? `bg-white ${a.shadow} border-border text-foreground`
          : 'bg-transparent border-transparent text-muted-foreground hover:bg-white/70 hover:text-slate-700'}`}
    >
      {active && (
        <span className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-gradient-to-b ${a.bar} ${a.barGlow}`} />
      )}
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ring-1 ${active ? `${a.bg} ring-white/60 shadow-sm` : 'bg-slate-100 ring-transparent'}`}>
        <Icon size={15} className={active ? a.text : 'text-muted-foreground'} strokeWidth={2.5} />
      </span>
      <span className="whitespace-nowrap md:whitespace-normal md:flex-1">{label}</span>
      {count !== undefined && (
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 tabular-nums ${active ? `${a.bg} ${a.text}` : 'bg-slate-100 text-muted-foreground'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

type SlaTab = 'dashboard' | 'rules' | 'audit';

const DEPARTMENT_LABEL: Record<SlaQueueRow['department'], string> = {
  csr: 'CSR',
  logistics: 'โลจิสติกส์',
  warehouse: 'คลังสินค้า',
};

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  const datePart = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  const timePart = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} · ${timePart} น.`;
}

export default function SlaMonitoringPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SlaTab>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [slaQueue, setSlaQueue] = useState<SlaQueueRow[]>([]);
  const [rules, setRules] = useState<SlaRuleRow[]>([]);
  const [ruleEdits, setRuleEdits] = useState<Record<string, { slaDays: number; warningDays: number }>>({});
  const [savingStatus, setSavingStatus] = useState<string | null>(null);

  // ใช้ร่วมกับ Audit Trail Report (ย้ายมาจาก Download Center — staff-approvals/page.tsx เดิม)
  const [allRequests, setAllRequests] = useState<RequestRow[]>([]);
  const [statusLogs, setStatusLogs] = useState<StatusLogRow[]>([]);
  const [downloadDateFrom, setDownloadDateFrom] = useState('');
  const [downloadDateTo, setDownloadDateTo] = useState('');

  const fetchData = async () => {
    setIsLoading(true);
    const [queueResult, rulesResult, dashboardResult, statusLogsResult] = await Promise.all([
      getSlaQueueForManager(),
      getSlaRules(),
      getCSRDashboardData(),
      getManagerStatusLogs(),
    ]);

    if (queueResult.success) setSlaQueue(queueResult.data ?? []);
    if (rulesResult.success) {
      const data = rulesResult.data ?? [];
      setRules(data);
      setRuleEdits(Object.fromEntries(data.map((r) => [r.status_name, { slaDays: r.sla_days, warningDays: r.warning_days }])));
    }
    if (dashboardResult.success) setAllRequests(dashboardResult.requests || []);
    if (statusLogsResult.success) setStatusLogs(statusLogsResult.data || []);

    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
    markManagerSlaBadgeAsRead();
  }, []);

  const handleSaveRule = async (statusName: string) => {
    const edit = ruleEdits[statusName];
    if (!edit) return;
    setSavingStatus(statusName);
    try {
      const res = await updateSlaRule(statusName, edit);
      if (res.success) {
        alert('บันทึกกฎ SLA เรียบร้อยแล้ว');
        fetchData();
      } else {
        alert('เกิดข้อผิดพลาด: ' + (res.error || 'ไม่ทราบสาเหตุ'));
      }
    } finally {
      setSavingStatus(null);
    }
  };

  const handleBack = () => router.replace('/admin/manager');
  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutStaffAction();
    router.push('/');
  };

  const overdueCount = slaQueue.filter((r) => r.isOverdue).length;
  const warningCount = slaQueue.length - overdueCount;
  const queueByDepartment = slaQueue.reduce<Record<string, SlaQueueRow[]>>((acc, r) => {
    (acc[r.department] ??= []).push(r);
    return acc;
  }, {});

  const rangePreviewRequests = filterCsrRequests(allRequests, { dateFrom: downloadDateFrom, dateTo: downloadDateTo });
  const rangePreviewRequestIds = new Set(rangePreviewRequests.map((r) => r.id));
  const rangePreviewLogCount = statusLogs.filter((l) => rangePreviewRequestIds.has(l.request_id)).length;

  if (isLoading) return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF6E8] via-[#F8F2DF] to-[#F1E7C8]">
      <SkeletonTopBar />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          <SkeletonSidebarTabs count={3} />
          <div className="flex-1 min-w-0"><SkeletonSimpleRows rows={4} /></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#FBF6E8] via-[#F8F2DF] to-[#F1E7C8] overflow-hidden">
      <div className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute -top-16 -right-14 w-56 h-56 md:-top-20 md:-right-20 md:w-[380px] md:h-[380px] rounded-full bg-[radial-gradient(circle,_#EAD94C_0%,_transparent_72%)] opacity-40 blur-2xl" />
        <div className="absolute top-[42%] -left-14 w-48 h-48 md:top-[45%] md:-left-28 md:w-[340px] md:h-[340px] rounded-full bg-[radial-gradient(circle,_#E1592A_0%,_transparent_72%)] opacity-[0.14] blur-3xl" />
      </div>

      <div className="relative z-30 sticky top-0 bg-white/70 backdrop-blur-xl border-b border-white/50">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm font-semibold text-[#6B6698] hover:text-[#241F5E] bg-white/60 hover:bg-white/90 px-3 py-2 rounded-xl transition-all group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-[#EADFAF] shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-bold text-[#241F5E] leading-tight truncate">SLA Monitoring System</h1>
              <p className="text-[10px] md:text-[11px] text-[#6B6698] hidden sm:block">GPO Xchange Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <span className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 rounded-full border bg-[#ECEAF6] border-[#D8D5E8] text-[#2E2B7A] text-[11px] md:text-xs font-semibold shrink-0">
              <ShieldCheck size={13} strokeWidth={2.5} />
              <span>Manager</span>
            </span>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-1.5 text-xs font-bold text-[#6B6698] hover:text-[#2E2B7A] bg-white/70 hover:bg-[#ECEAF6] border border-white/60 hover:border-[#D8D5E8] px-3 py-2 rounded-xl transition-colors disabled:opacity-60 disabled:pointer-events-none"
            >
              {isLoggingOut ? <Loader2 size={15} className="animate-spin" strokeWidth={2.5} /> : <LogOut size={15} strokeWidth={2.5} />}
              <span className="hidden sm:inline">ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">

          <aside className="md:w-60 shrink-0">
            <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible -mx-1 px-1 md:mx-0 md:px-0 pb-1 md:pb-0">
              <TabButton
                icon={AlarmClock} label="ภาพรวม SLA" count={slaQueue.length}
                active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')}
                accent="red"
              />
              <TabButton
                icon={SlidersHorizontal} label="ตั้งค่ากฎ SLA" count={rules.length}
                active={activeTab === 'rules'} onClick={() => setActiveTab('rules')}
                accent="violet"
              />
              <TabButton
                icon={CalendarRange} label="Audit Trail Report"
                active={activeTab === 'audit'} onClick={() => setActiveTab('audit')}
                accent="teal"
              />
            </nav>
          </aside>

          <div className="flex-1 min-w-0">

            {/* ── แท็บ: ภาพรวม SLA แบบ real-time — จัดกลุ่มตามแผนกเจ้าของงาน ── */}
            {activeTab === 'dashboard' && (
              <section className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  <div className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                      <AlertTriangle size={16} className="text-red-600" strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-xl font-black text-red-600 tabular-nums leading-none">{overdueCount}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">เกินกำหนดแล้ว</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                      <Clock size={16} className="text-amber-600" strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-xl font-black text-amber-600 tabular-nums leading-none">{warningCount}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">ใกล้ครบกำหนด</p>
                    </div>
                  </div>
                </div>

                {slaQueue.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-border py-12 text-center">
                    <AlarmClock className="w-9 h-9 text-slate-300 mx-auto mb-2.5" strokeWidth={1.75} />
                    <p className="text-sm text-muted-foreground font-medium">ไม่มีใบงานใกล้ครบ/เกินกำหนด SLA ในขณะนี้</p>
                  </div>
                ) : (
                  (Object.entries(queueByDepartment) as [SlaQueueRow['department'], SlaQueueRow[]][]).map(([dept, rows]) => (
                    <div key={dept} className="bg-white rounded-2xl border border-border overflow-hidden">
                      <div className="px-4 md:px-6 py-3 border-b border-border bg-slate-50">
                        <p className="text-sm font-bold text-foreground">{DEPARTMENT_LABEL[dept]}</p>
                        <p className="text-[11px] text-muted-foreground">{rows.length} ใบงาน</p>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {rows.map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-3 px-4 md:px-6 py-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-foreground font-mono">{r.ref_id}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {getStatusLabel(r.current_status)} · {r.hospital_name ?? '-'} · ครบกำหนด {formatDateTime(r.status_due_at)}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${
                                r.isOverdue ? 'text-red-700 bg-red-50' : 'text-amber-700 bg-amber-50'
                              }`}
                            >
                              <AlertTriangle className="w-3 h-3" strokeWidth={2.5} />
                              {r.isOverdue ? 'เกินกำหนด' : 'ใกล้ครบกำหนด'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </section>
            )}

            {/* ── แท็บ: ตั้งค่ากฎ SLA ต่อ status_name — manager แก้เองได้ ไม่ต้อง deploy โค้ดใหม่ ── */}
            {activeTab === 'rules' && (
              <section className="space-y-4">
                <div className="flex items-center gap-2.5 px-1">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                    <SlidersHorizontal size={16} className="text-violet-600" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">ตั้งค่ากฎ SLA</h2>
                    <p className="text-[11px] text-muted-foreground">
                      กำหนดจำนวนวันทำการ (เว้นเสาร์-อาทิตย์) ที่อนุญาตต่อสถานะ และจำนวนวันเตือนล่วงหน้าก่อนครบกำหนด
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-border overflow-hidden">
                  <div className="divide-y divide-slate-100">
                    {rules.map((rule) => {
                      const edit = ruleEdits[rule.status_name] ?? { slaDays: rule.sla_days, warningDays: rule.warning_days };
                      const isSaving = savingStatus === rule.status_name;
                      return (
                        <div key={rule.status_name} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 md:px-6 py-3.5">
                          <p className="text-sm font-semibold text-foreground sm:w-40 shrink-0">{getStatusLabel(rule.status_name)}</p>
                          <div className="flex items-center gap-2">
                            <label className="text-[11px] text-muted-foreground">SLA (วันทำการ)</label>
                            <input
                              type="number" min={1} value={edit.slaDays}
                              onChange={(e) => setRuleEdits((prev) => ({ ...prev, [rule.status_name]: { ...edit, slaDays: Number(e.target.value) } }))}
                              className="w-16 text-sm border border-border rounded-lg px-2 py-1.5 tabular-nums"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-[11px] text-muted-foreground">เตือนล่วงหน้า (วัน)</label>
                            <input
                              type="number" min={0} value={edit.warningDays}
                              onChange={(e) => setRuleEdits((prev) => ({ ...prev, [rule.status_name]: { ...edit, warningDays: Number(e.target.value) } }))}
                              className="w-16 text-sm border border-border rounded-lg px-2 py-1.5 tabular-nums"
                            />
                          </div>
                          <button
                            onClick={() => handleSaveRule(rule.status_name)}
                            disabled={isSaving}
                            className="flex items-center gap-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 px-3.5 py-2 rounded-xl transition-colors disabled:opacity-60 disabled:pointer-events-none sm:ml-auto"
                          >
                            {isSaving ? <Loader2 size={13} className="animate-spin" strokeWidth={2.5} /> : <Save size={13} strokeWidth={2.5} />}
                            บันทึก
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* ── แท็บ: Audit Trail Report — ย้ายมาจาก Download Center เดิม (staff-approvals/page.tsx) ── */}
            {activeTab === 'audit' && (
              <section className="space-y-4">
                <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    เลือกช่วงวันที่ที่ต้องการสำหรับ Audit Trail Report ด้านล่าง — ไม่เลือกวันที่ = ทุกช่วงเวลา
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase">จากวันที่</label>
                      <input
                        type="date" value={downloadDateFrom}
                        onChange={(e) => setDownloadDateFrom(e.target.value)}
                        className="w-full text-sm border border-border rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase">ถึงวันที่</label>
                      <input
                        type="date" value={downloadDateTo}
                        onChange={(e) => setDownloadDateTo(e.target.value)}
                        className="w-full text-sm border border-border rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
                      <CalendarRange size={16} className="text-teal-600" strokeWidth={2.5} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Audit Trail Report</h3>
                      <p className="text-[11px] text-muted-foreground">ประวัติการเปลี่ยนสถานะ (status_logs) ทุกจุด พร้อมผู้ดำเนินการและหมายเหตุ รวมถึงเวลาที่ใช้ในแต่ละขั้นตอน (SLA) ตั้งแต่รับคำร้องจนเสร็จสิ้น ของใบงานทั้งหมดในช่วงที่เลือก</p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-teal-50 border border-teal-100 rounded-xl px-4 py-3.5">
                    <p className="text-xs text-teal-800 font-semibold">
                      พบ {rangePreviewRequests.length} ใบงาน · {rangePreviewLogCount} รายการ log ในช่วงที่เลือก
                    </p>
                    <a
                      href={`/admin/manager/downloads-export?mode=range${downloadDateFrom ? `&dateFrom=${downloadDateFrom}` : ''}${downloadDateTo ? `&dateTo=${downloadDateTo}` : ''}`}
                      className="flex items-center gap-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 px-3.5 py-2.5 rounded-xl transition-colors shrink-0"
                    >
                      <Download size={14} strokeWidth={2.5} /> ดาวน์โหลด Excel
                    </a>
                  </div>
                </div>
              </section>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
