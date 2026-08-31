'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  AlarmClock,
  SlidersHorizontal,
  ScrollText,
  ShieldCheck,
  LogOut,
  Loader2,
  Download,
  Clock,
  AlertTriangle,
  Save,
  CalendarRange,
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
import { SkeletonTopBar, SkeletonSubTabs, SkeletonSimpleRows } from '@/components/skeletons/DashboardSkeleton';
import { AuditLogViewer } from '@/components/audit/AuditLogViewer';
import { getStatusLabel } from '@/lib/tracking-status';
import { filterCsrRequests } from '@/lib/csr-report-filters';
import { useToast } from '@/components/ui/toast';
import type { LucideIcon } from 'lucide-react';
import type { RequestRow, StatusLogRow, SlaQueueRow, SlaRuleRow } from '@/lib/types';

// ── หน้า "SLA & การตรวจสอบระบบ" — รวมสองการ์ดเดิม (SLA Monitoring System + บันทึกการตรวจสอบ
// ระบบ) ไว้ในหน้าเดียว เพราะเป็นร่องรอยการตรวจสอบ (audit trail) ประเภทเดียวกัน — route เดิม
// /admin/manager/sla และ /admin/manager/audit redirect มาที่นี่ทั้งคู่
//
// สลับ 3 ส่วนด้วยแท็บแนวนอนด้านบน (ไม่มี sidebar ซ้าย — ทิศทางเดียวกับที่เพิ่งเอา sidebar
// 4 แท็บออกจากหน้า staff-approvals): ภาพรวม SLA / ตั้งค่ากฎ SLA / บันทึกการตรวจสอบระบบ

type AuditTrailTab = 'dashboard' | 'rules' | 'audit';

// แท็บแบบ segmented control — มือถือแบ่ง 3 ช่องเท่ากันเต็มความกว้าง (label สั้น), เดสก์ท็อป
// กว้างตามเนื้อหา (label เต็ม) — pattern เดียวกับ sub-tab ในหน้ารายงานผู้บริหาร
function TabButton({ icon: Icon, label, shortLabel, count, danger, active, onClick }: {
  icon: LucideIcon; label: string; shortLabel: string; count?: number; danger?: boolean; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors
        ${active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
    >
      <Icon size={14} className={active ? 'text-primary' : 'text-muted-foreground'} strokeWidth={2.5} />
      <span className="sm:hidden">{shortLabel}</span>
      <span className="hidden sm:inline whitespace-nowrap">{label}</span>
      {count !== undefined && (
        <span className={`text-[10px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full tabular-nums ${
          danger ? 'bg-red-50 text-red-700' : active ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

const DEPARTMENT_LABEL: Record<SlaQueueRow['department'], string> = {
  csr: 'CSR',
  logistics: 'Logistics',
  warehouse: 'Warehouse',
};

// ลำดับการแสดงกลุ่มแผนกในแท็บ "ภาพรวม SLA" — CSR → Logistics → Warehouse (ตามลำดับ workflow)
const DEPARTMENT_ORDER = ['csr', 'logistics', 'warehouse'] as const;

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  const datePart = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  // hour12: false ระบุตรงๆ กันพฤติกรรม default ของ locale ไม่แน่นอนตามเครื่อง/เบราว์เซอร์
  const timePart = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${datePart} · ${timePart} น.`;
}

export default function ManagerAuditTrailPage() {
  const router = useRouter();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<AuditTrailTab>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [slaQueue, setSlaQueue] = useState<SlaQueueRow[]>([]);
  const [rules, setRules] = useState<SlaRuleRow[]>([]);
  const [ruleEdits, setRuleEdits] = useState<Record<string, { slaDays: number; warningDays: number }>>({});
  const [savingStatus, setSavingStatus] = useState<string | null>(null);

  // ใช้กับ Audit Trail Report (ประวัติเปลี่ยนสถานะ status_logs) ในแท็บ "บันทึกการตรวจสอบระบบ"
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
        toast.success('บันทึกกฎ SLA เรียบร้อยแล้ว');
        fetchData();
      } else {
        toast.error(res.error || 'ไม่ทราบสาเหตุ');
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
    <div className="min-h-screen bg-background">
      <SkeletonTopBar />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">
        <SkeletonSubTabs count={3} />
        <SkeletonSimpleRows rows={4} />
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
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary px-3 py-2 rounded-md transition-colors group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-border shrink-0" />
            <div className="min-w-0 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary shrink-0 hidden sm:block" strokeWidth={2.5} />
              <div className="min-w-0">
                <h1 className="text-sm md:text-base font-bold text-foreground leading-tight truncate">
                  <span className="sm:hidden">SLA &amp; ตรวจสอบระบบ</span>
                  <span className="hidden sm:inline">SLA &amp; การตรวจสอบระบบ</span>
                </h1>
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

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">

        {/* ══ แท็บ segmented control ══ */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-secondary sm:inline-flex">
          <TabButton
            icon={AlarmClock} label="ภาพรวม SLA" shortLabel="SLA" count={slaQueue.length} danger={overdueCount > 0}
            active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')}
          />
          <TabButton
            icon={SlidersHorizontal} label="ตั้งค่ากฎ SLA" shortLabel="กฎ SLA" count={rules.length}
            active={activeTab === 'rules'} onClick={() => setActiveTab('rules')}
          />
          <TabButton
            icon={ScrollText} label="บันทึกการตรวจสอบระบบ" shortLabel="บันทึก"
            active={activeTab === 'audit'} onClick={() => setActiveTab('audit')}
          />
        </div>

        {/* ── แท็บ: ภาพรวม SLA แบบ real-time — จัดกลุ่มตามแผนกเจ้าของงาน ── */}
        {activeTab === 'dashboard' && (
          <section className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <div className="bg-card rounded-lg border border-border p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-red-50 flex items-center justify-center shrink-0">
                  <AlertTriangle size={16} className="text-red-600" strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-xl font-bold text-red-600 tabular-nums leading-none">{overdueCount}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">เกินกำหนดแล้ว</p>
                </div>
              </div>
              <div className="bg-card rounded-lg border border-border p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-amber-50 flex items-center justify-center shrink-0">
                  <Clock size={16} className="text-amber-600" strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-xl font-bold text-amber-600 tabular-nums leading-none">{warningCount}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">ใกล้ครบกำหนด</p>
                </div>
              </div>
            </div>

            {slaQueue.length === 0 ? (
              <div className="bg-card rounded-lg border border-border py-12 text-center">
                <AlarmClock className="w-9 h-9 text-muted-foreground/40 mx-auto mb-2.5" strokeWidth={1.75} />
                <p className="text-sm text-muted-foreground font-medium">ไม่มีใบงานใกล้ครบ/เกินกำหนด SLA ในขณะนี้</p>
              </div>
            ) : (
              DEPARTMENT_ORDER.filter((dept) => queueByDepartment[dept]?.length).map((dept) => {
                const rows = queueByDepartment[dept];
                return (
                <div key={dept} className="bg-card rounded-lg border border-border overflow-hidden">
                  <div className="px-4 md:px-6 py-3 border-b border-border bg-secondary">
                    <p className="text-sm font-bold text-foreground">{DEPARTMENT_LABEL[dept]}</p>
                    <p className="text-[11px] text-muted-foreground">{rows.length} ใบงาน</p>
                  </div>
                  <div className="divide-y divide-border">
                    {rows.map((r) => (
                      <div key={r.id} className="px-4 md:px-6 py-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-foreground font-mono truncate">{r.ref_id}</p>
                          <span
                            className={`shrink-0 flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${
                              r.isOverdue ? 'text-red-700 bg-red-50' : 'text-amber-700 bg-amber-50'
                            }`}
                          >
                            <AlertTriangle className="w-3 h-3" strokeWidth={2.5} />
                            {r.isOverdue ? 'เกินกำหนด' : 'ใกล้ครบกำหนด'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {getStatusLabel(r.current_status)} · {r.hospital_name ?? '-'}
                        </p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          ครบกำหนด {formatDateTime(r.status_due_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                );
              })
            )}
          </section>
        )}

        {/* ── แท็บ: ตั้งค่ากฎ SLA ต่อ status_name — manager แก้เองได้ ไม่ต้อง deploy โค้ดใหม่ ── */}
        {activeTab === 'rules' && (
          <section className="space-y-4">
            <div className="flex items-center gap-2.5 px-1">
              <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shrink-0">
                <SlidersHorizontal size={16} className="text-accent-foreground" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">ตั้งค่ากฎ SLA</h2>
                <p className="text-[11px] text-muted-foreground">
                  กำหนดจำนวนวันทำการ (เว้นเสาร์-อาทิตย์) ที่อนุญาตต่อสถานะ และจำนวนวันเตือนล่วงหน้าก่อนครบกำหนด
                </p>
              </div>
            </div>

            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="divide-y divide-border">
                {rules.map((rule) => {
                  const edit = ruleEdits[rule.status_name] ?? { slaDays: rule.sla_days, warningDays: rule.warning_days };
                  const isSaving = savingStatus === rule.status_name;
                  return (
                    <div key={rule.status_name} className="px-4 md:px-6 py-3.5">
                      <div className="flex items-center justify-between gap-3 mb-2.5">
                        <p className="text-sm font-semibold text-foreground min-w-0 truncate">{getStatusLabel(rule.status_name)}</p>
                        <button
                          onClick={() => handleSaveRule(rule.status_name)}
                          disabled={isSaving}
                          className="flex items-center gap-1.5 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-md transition-colors disabled:opacity-60 disabled:pointer-events-none shrink-0"
                        >
                          {isSaving ? <Loader2 size={13} className="animate-spin" strokeWidth={2.5} /> : <Save size={13} strokeWidth={2.5} />}
                          บันทึก
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 max-w-xs">
                        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                          SLA (วันทำการ)
                          <input
                            type="number" min={1} value={edit.slaDays}
                            onChange={(e) => setRuleEdits((prev) => ({ ...prev, [rule.status_name]: { ...edit, slaDays: Number(e.target.value) } }))}
                            className="w-full text-sm border border-border rounded-md px-2 py-1.5 tabular-nums"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                          เตือนล่วงหน้า (วัน)
                          <input
                            type="number" min={0} value={edit.warningDays}
                            onChange={(e) => setRuleEdits((prev) => ({ ...prev, [rule.status_name]: { ...edit, warningDays: Number(e.target.value) } }))}
                            className="w-full text-sm border border-border rounded-md px-2 py-1.5 tabular-nums"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── แท็บ: บันทึกการตรวจสอบระบบ — รวม 2 อย่าง:
             (1) Audit Trail Report — เลือกช่วงวันที่ → ดาวน์โหลดประวัติเปลี่ยนสถานะ (status_logs) เป็น Excel
             (2) AuditLogViewer — log เหตุการณ์ระบบ append-only (เข้าสู่ระบบ/เข้าถึงข้อมูล/จัดการระบบ) ISO 27001 A.8.16 ── */}
        {activeTab === 'audit' && (
          <section className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 px-1">
                <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shrink-0">
                  <CalendarRange size={16} className="text-accent-foreground" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">รายงาน Audit Trail (ประวัติเปลี่ยนสถานะ)</h2>
                  <p className="text-[11px] text-muted-foreground">
                    ประวัติการเปลี่ยนสถานะ (status_logs) ทุกจุด พร้อมผู้ดำเนินการ หมายเหตุ และเวลาที่ใช้ในแต่ละขั้นตอน (SLA) ตั้งแต่รับคำร้องจนเสร็จสิ้น ของใบงานทั้งหมดในช่วงที่เลือก
                  </p>
                </div>
              </div>

              <div className="bg-card rounded-lg border border-border p-5 space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  เลือกช่วงวันที่ที่ต้องการ — ไม่เลือกวันที่ = ทุกช่วงเวลา
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase">จากวันที่</label>
                    <input
                      type="date" value={downloadDateFrom}
                      onChange={(e) => setDownloadDateFrom(e.target.value)}
                      className="w-full text-sm border border-border rounded-md px-2.5 py-1.5"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase">ถึงวันที่</label>
                    <input
                      type="date" value={downloadDateTo}
                      onChange={(e) => setDownloadDateTo(e.target.value)}
                      className="w-full text-sm border border-border rounded-md px-2.5 py-1.5"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-accent border border-transparent rounded-md px-4 py-3.5">
                  <p className="text-xs text-accent-foreground font-semibold">
                    พบ {rangePreviewRequests.length} ใบงาน · {rangePreviewLogCount} รายการ log ในช่วงที่เลือก
                  </p>
                  <a
                    href={`/admin/manager/downloads-export?mode=range${downloadDateFrom ? `&dateFrom=${downloadDateFrom}` : ''}${downloadDateTo ? `&dateTo=${downloadDateTo}` : ''}`}
                    className="flex items-center gap-1.5 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 px-3.5 py-2.5 rounded-md transition-colors shrink-0"
                  >
                    <Download size={14} strokeWidth={2.5} /> ดาวน์โหลด Excel
                  </a>
                </div>
              </div>
            </div>

            {/* ── บันทึกเหตุการณ์ระบบ (audit_events) — AuditLogViewer จัดการ fetch/filter/แบ่งหน้าเอง ── */}
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 px-1">
                <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shrink-0">
                  <ScrollText size={16} className="text-accent-foreground" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">บันทึกเหตุการณ์ระบบ</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Audit log แบบ append-only เก็บ 24 เดือน — เข้าสู่ระบบ / เข้าถึงข้อมูล / จัดการระบบ (ISO 27001 A.8.16)
                  </p>
                </div>
              </div>
              <AuditLogViewer />
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
