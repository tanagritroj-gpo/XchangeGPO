'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, MapPin, Check, X, CheckCheck, Loader2, Search, Clock, FileText, Download, Pencil, FileSpreadsheet, LogOut, Sparkles, CalendarClock, RefreshCw, Ban, History, ShieldOff } from 'lucide-react';
import {
  getCSRDashboardData, reviewClient, getCustomerRequestHistory, getStaffRequestDetail,
  getRegistrationDocumentUrl, updateCustomerOrgType, searchOrganizations,
  getCustomersAccessStatus, renewCustomerAccess, cancelCustomerAccess, reactivateCustomerAccess, getCustomerAccessHistory,
} from '@/app/actions/csr-actions';
import { getStaffSession, logoutStaffAction } from '@/app/actions/auth-staff';
import { ORG_TYPE_OPTIONS } from '@/lib/sale-coverage';
import CustomerPicker from '../form/components/CustomerPicker';
import { RequestHistoryList } from '@/components/history/RequestHistoryList';
import { SkeletonTopBar, SkeletonSubTabs, SkeletonSimpleRows } from '@/components/skeletons/DashboardSkeleton';
import type { LucideIcon } from 'lucide-react';
import type { ClientRow, HistorySummaryRow } from '@/lib/types';

interface Customer {
  id: number;
  hospital_name: string;
  contact_name: string | null;
  position: string | null;
  phone: string | null;
  email: string;
  customer_code: string | null;
  org_type?: string | null;
}

interface AccessCustomer {
  id: number;
  contact_name: string | null;
  email: string;
  access_expires_at: string;
  cancelled_at: string | null;
  hospital_name: string | null;
  customer_code: string | null;
}

interface AccessHistoryEntry {
  id: string;
  action: 'approved_initial' | 'renewed' | 'cancelled' | 'reactivated';
  previous_expires_at: string | null;
  new_expires_at: string | null;
  created_at: string;
  staff_name: string | null;
}

const ACCESS_ACTION_LABEL: Record<AccessHistoryEntry['action'], string> = {
  approved_initial: 'อนุมัติครั้งแรก',
  renewed: 'ต่ออายุ',
  cancelled: 'ยกเลิกลูกค้า',
  reactivated: 'เปิดใช้งานอีกครั้ง',
};

const ACCESS_PAGE_SIZE = 10;

function formatThaiDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}

// แก้ไขประเภทหน่วยงานของลูกค้าที่อนุมัติไปแล้ว — จำเป็นสำหรับลูกค้าเก่าที่ org_type
// ยังเป็น NULL (ลงทะเบียนก่อนมีฟีเจอร์นี้) เพื่อให้พนักงาน sale จับคู่ขอบเขตดูแลได้
function OrgTypeEditor({ customer, onSaved }: { customer: Customer; onSaved: (orgType: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(customer.org_type ?? '');
  const [saving, setSaving] = useState(false);

  const currentLabel = ORG_TYPE_OPTIONS.find((o) => o.value === customer.org_type)?.label;

  if (!editing) {
    return (
      <div className="flex items-center gap-2 mt-2">
        {currentLabel ? (
          <span className="text-xs font-bold text-accent-foreground bg-accent px-2.5 py-1 rounded-lg">{currentLabel}</span>
        ) : (
          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg">ยังไม่ได้กำหนดประเภทหน่วยงาน</span>
        )}
        <button
          type="button"
          onClick={() => { setDraft(customer.org_type ?? ''); setEditing(true); }}
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
        >
          <Pencil size={12} strokeWidth={2.5} /> แก้ไขประเภทหน่วยงาน
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <select
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="px-3 py-1.5 rounded-lg border border-border text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
      >
        <option value="">เลือกประเภทหน่วยงาน</option>
        {ORG_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button
        type="button"
        disabled={!draft || saving}
        onClick={async () => {
          setSaving(true);
          const res = await updateCustomerOrgType(customer.id, draft);
          setSaving(false);
          if (res.success) { onSaved(draft); setEditing(false); }
          else alert(('error' in res && res.error) || 'บันทึกไม่สำเร็จ');
        }}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-40 transition-colors"
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={3} />} บันทึก
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs font-semibold text-muted-foreground hover:text-slate-700 transition-colors"
      >
        ยกเลิก
      </button>
    </div>
  );
}

// StatPill เวอร์ชันย่อ — ใช้แค่ tone เดียว (มัสตาร์ด) เพราะหน้านี้มีแค่ตัวเลขลูกค้าอย่างเดียว
function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 rounded-full border text-[11px] md:text-xs font-semibold bg-accent border-transparent text-accent-foreground">
      <Building2 size={13} strokeWidth={2.5} />
      <span>{value}</span>
      <span className="hidden sm:inline opacity-80">{label}</span>
    </span>
  );
}

// Sub-tab แบบ segmented control — สไตล์เดียวกับที่ใช้ใน CSR Dashboard
function SubTabButton({ icon: Icon, label, count, active, onClick }: {
  icon: LucideIcon; label: string; count?: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 shrink-0 whitespace-nowrap
        ${active ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
    >
      <Icon size={15} className={active ? 'text-primary' : 'text-muted-foreground'} strokeWidth={2.5} />
      {label}
      {typeof count === 'number' && (
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-accent text-accent-foreground' : 'bg-secondary/60 text-muted-foreground'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

interface OrgSuggestion {
  id: number;
  hospital_name: string;
  customer_code: string;
  province: string | null;
  org_type?: string | null;
}

// ── ช่องกรอกรหัสลูกค้า พร้อม autocomplete หน่วยงานที่เคยลงทะเบียนไว้แล้ว ──
// ค้นด้วยชื่อหน่วยงานของ client แถวนี้เองอัตโนมัติตอน mount (ไม่ต้องให้ CSR พิมพ์ค้นหาเอง
// เพราะรู้ชื่อหน่วยงานอยู่แล้วจากการลงทะเบียน) ถ้าเจอหน่วยงานเดิม กดเลือกแล้วรหัสจะกรอกให้
// เลย กันเคส CSR พิมพ์รหัสไม่ตรงกับที่หน่วยงานนี้เคยใช้ (reviewClient เช็ค exact match ซ้ำ
// อีกชั้นฝั่ง server อยู่ดี ตัวนี้แค่ช่วยแนะนำ ลดโอกาสพิมพ์ผิดตั้งแต่ต้นทาง)
function CustomerCodeField({ hospitalName, value, onChange }: {
  hospitalName: string; value: string; onChange: (v: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<OrgSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchOrganizations(hospitalName).then((res) => {
      if (cancelled) return;
      if (res.success) setSuggestions(res.data ?? []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [hospitalName]);

  const showSuggestions = !dismissed && !loading && suggestions.length > 0 && !value.trim();

  return (
    <div className="flex-1 min-w-0 space-y-1.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="รหัสลูกค้า (จำเป็นก่อนอนุมัติ)"
        className="w-full px-3 py-2 rounded-lg border border-border text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
      />
      {showSuggestions && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
            <Sparkles size={11} strokeWidth={2.5} /> พบหน่วยงานนี้ในระบบแล้ว:
          </span>
          {suggestions.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => { onChange(org.customer_code); setDismissed(true); }}
              className="text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-lg hover:bg-emerald-100 transition-colors"
            >
              {org.hospital_name} · {org.customer_code}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            ไม่ใช่หน่วยงานนี้
          </button>
        </div>
      )}
    </div>
  );
}

export default function CSRCustomersPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [tab, setTab] = useState<'pending' | 'search' | 'access' | 'export'>('pending');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  // รหัสลูกค้าที่ CSR พิมพ์เอง ก่อนกดอนุมัติ — เก็บแยกตาม client.id เพราะมีหลายแถวพร้อมกัน
  const [customerCodes, setCustomerCodes] = useState<Record<string, string>>({});

  // ประวัติใบงานของลูกค้าที่เลือกในแท็บค้นหา
  const [history, setHistory] = useState<HistorySummaryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [docLoading, setDocLoading] = useState(false);
  // signed URL ของเอกสารที่กำลังแสดงอยู่ในโมดัล — ใช้แทน window.open() เพราะ window.open()
  // ที่เรียกหลัง await (คำขอ signed URL) ไม่นับเป็น user gesture ตรงๆ อีกต่อไป ทำให้ browser
  // (โดยเฉพาะ Safari บนมือถือ และบางเคสบน desktop) บล็อกเป็น popup แทนที่จะเปิดให้
  const [docModalUrl, setDocModalUrl] = useState<string | null>(null);
  // client.id ที่กำลังส่งคำขออนุมัติ/ปฏิเสธอยู่ — กันกดซ้ำระหว่างรอผล (ก่อนหน้านี้ไม่มี
  // guard ทำให้กดรัวจนคำขอซ้อนกันชน unique constraint ฝั่ง server ได้)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  // ── แท็บ "การต่ออายุเข้าใช้ระบบ" ──
  const [accessCustomers, setAccessCustomers] = useState<AccessCustomer[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessLoaded, setAccessLoaded] = useState(false);
  const [accessProcessingIds, setAccessProcessingIds] = useState<Set<number>>(new Set());
  // แยกลูกค้าที่ถูกยกเลิกออกจากลูกค้าที่ใช้งานอยู่อย่างชัดเจน (เดิมปนอยู่ในลิสต์เดียวกัน
  // เรียงตามวันหมดอายุ — ลูกค้าที่วันหมดอายุใกล้กันมากจะอยู่ติดกัน เสี่ยงกดผิดแถวหลังยกเลิก
  // ไปแล้วรายการนั้นควรหายไปจากมุมมองหลักทันที ไม่ใช่ปนอยู่เรื่อยๆ)
  const [accessFilter, setAccessFilter] = useState<'active' | 'cancelled'>('active');
  const [accessPage, setAccessPage] = useState(1);
  // แถวที่กำลังกางดูประวัติอยู่ — เก็บแคชผลไว้ต่อ id กันโหลดซ้ำถ้าปิดแล้วเปิดใหม่
  const [openHistoryId, setOpenHistoryId] = useState<number | null>(null);
  const [historyById, setHistoryById] = useState<Record<number, AccessHistoryEntry[]>>({});
  const [historyLoadingId, setHistoryLoadingId] = useState<number | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    const data = await getCSRDashboardData();
    if (data.success) setClients(data.clients || []);
    setIsLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const session = await getStaffSession();
      // ★ แก้ redirect เดิมที่ชี้ไป '/login' ซึ่งไม่มี route นี้อยู่จริงในระบบ (404) —
      // หน้า login พนักงานตัวจริงคือหน้าแรก '/' (แท็บ "พนักงาน GPO")
      if (!session?.id) { router.replace('/'); return; }
      await fetchData();
    };
    init();
  }, [router]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutStaffAction();
    router.push('/');
  };

  // โหลดประวัติใบงานทุกครั้งที่เลือกลูกค้าใหม่ในแท็บค้นหา
  useEffect(() => {
    if (!selectedCustomer) {
      setHistory([]);
      setHistoryError('');
      return;
    }
    const loadHistory = async () => {
      setHistoryLoading(true);
      setHistoryError('');
      const res = await getCustomerRequestHistory(selectedCustomer.id);
      if (res.success) setHistory(res.data ?? []);
      else setHistoryError(res.error || 'โหลดประวัติใบงานไม่สำเร็จ');
      setHistoryLoading(false);
    };
    loadHistory();
  }, [selectedCustomer]);

  const handleReviewClient = async (id: string, action: 'approved' | 'rejected') => {
    if (processingIds.has(id)) return;
    if (action === 'approved' && !customerCodes[id]?.trim()) {
      alert('กรุณาระบุรหัสลูกค้าก่อนอนุมัติ');
      return;
    }
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      const res = await reviewClient(id, action, customerCodes[id]);
      if (res.success) {
        alert(action === 'approved' ? 'อนุมัติเรียบร้อย' : 'ปฏิเสธเรียบร้อย');
        setCustomerCodes((prev) => {
          const { [id]: _omit, ...rest } = prev;
          return rest;
        });
        fetchData();
      } else {
        alert('Error: ' + (('error' in res && res.error) || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'));
        // รีเฟรชด้วยแม้ล้มเหลว — สถานะจริงใน DB อาจเปลี่ยนไปแล้ว (เช่น ถูกดำเนินการไปแล้ว
        // จากคำขออื่น) ไม่อยากให้ list ค้างข้อมูลเก่าที่ไม่ตรงกับ DB จริง
        fetchData();
      }
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleViewRegistrationDocument = async () => {
    if (!selectedCustomer) return;
    setDocLoading(true);
    const res = await getRegistrationDocumentUrl(selectedCustomer.id);
    setDocLoading(false);
    if (res.success && 'url' in res && res.url) {
      setDocModalUrl(res.url);
    } else {
      alert(('error' in res && res.error) || 'ไม่สามารถเปิดเอกสารได้');
    }
  };

  // ── แท็บ "การต่ออายุเข้าใช้ระบบ" — โหลดครั้งแรกที่สลับมาแท็บนี้เท่านั้น (ไม่ต้องรอตอนโหลด
  // หน้าแรกเหมือนแท็บ "รออนุมัติ" เพราะไม่ใช่ข้อมูลที่ต้องเห็นทันที) ──
  const fetchAccessData = async () => {
    setAccessLoading(true);
    const res = await getCustomersAccessStatus();
    if (res.success && 'data' in res) setAccessCustomers(res.data ?? []);
    setAccessLoading(false);
    setAccessLoaded(true);
  };

  useEffect(() => {
    if (tab === 'access' && !accessLoaded) fetchAccessData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleRenew = async (id: number) => {
    if (accessProcessingIds.has(id)) return;
    if (!confirm('ยืนยันต่ออายุการใช้งาน 2 ปี นับจากวันนี้?')) return;
    setAccessProcessingIds((prev) => new Set(prev).add(id));
    try {
      const res = await renewCustomerAccess(id);
      if (res.success) { alert('ต่ออายุเรียบร้อย'); fetchAccessData(); }
      else alert('Error: ' + (('error' in res && res.error) || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'));
    } finally {
      setAccessProcessingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleCancelAccess = async (id: number) => {
    if (accessProcessingIds.has(id)) return;
    if (!confirm('ยืนยันยกเลิกสิทธิ์การเข้าใช้งานของลูกค้ารายนี้? ลูกค้าจะไม่สามารถเข้าสู่ระบบได้ทันที')) return;
    setAccessProcessingIds((prev) => new Set(prev).add(id));
    try {
      const res = await cancelCustomerAccess(id);
      if (res.success) { alert('ยกเลิกสิทธิ์เรียบร้อย'); fetchAccessData(); }
      else alert('Error: ' + (('error' in res && res.error) || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'));
    } finally {
      setAccessProcessingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleReactivate = async (id: number) => {
    if (accessProcessingIds.has(id)) return;
    if (!confirm('ยืนยันเปิดใช้งานลูกค้ารายนี้อีกครั้ง?')) return;
    setAccessProcessingIds((prev) => new Set(prev).add(id));
    try {
      const res = await reactivateCustomerAccess(id);
      if (res.success) { alert('เปิดใช้งานเรียบร้อย'); fetchAccessData(); }
      else alert('Error: ' + (('error' in res && res.error) || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'));
    } finally {
      setAccessProcessingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleToggleHistory = async (id: number) => {
    if (openHistoryId === id) { setOpenHistoryId(null); return; }
    setOpenHistoryId(id);
    if (historyById[id]) return; // แคชไว้แล้ว ไม่ต้องโหลดซ้ำ
    setHistoryLoadingId(id);
    const res = await getCustomerAccessHistory(id);
    if (res.success && 'data' in res) setHistoryById((prev) => ({ ...prev, [id]: res.data ?? [] }));
    setHistoryLoadingId(null);
  };

  if (isLoading) return (
    <div className="min-h-screen bg-background">
      <SkeletonTopBar />
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-4">
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
              onClick={() => router.replace('/admin/csr')}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary px-3 py-2 rounded-md transition-colors group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-border shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-bold text-foreground leading-tight truncate">การจัดการข้อมูลลูกค้า</h1>
              <p className="text-[11px] text-muted-foreground hidden sm:block">GPO Xchange Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {tab === 'pending' && <StatPill value={clients.length} label="ราย" />}
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

      {/* ══ Content ══ */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-10">

        {/* ── Sub-tab: รออนุมัติ / ค้นหาลูกค้าในระบบ ── */}
        <div className="flex items-center gap-1 p-1 mb-4 rounded-md bg-secondary border border-border overflow-x-auto max-w-full">
          <SubTabButton
            icon={Clock} label="รออนุมัติ" count={clients.length}
            active={tab === 'pending'} onClick={() => setTab('pending')}
          />
          <SubTabButton
            icon={CalendarClock} label="การต่ออายุเข้าใช้ระบบ"
            active={tab === 'access'} onClick={() => setTab('access')}
          />
          <SubTabButton
            icon={Search} label="ค้นหาลูกค้าในระบบ"
            active={tab === 'search'} onClick={() => setTab('search')}
          />
          <SubTabButton
            icon={FileSpreadsheet} label="Export"
            active={tab === 'export'} onClick={() => setTab('export')}
          />
        </div>

        {/* ── Tab: ลูกค้าที่รออนุมัติ (ของเดิม) ── */}
        {tab === 'pending' && (
          <section>
            <div className="flex items-center gap-2.5 mb-3 px-1">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                <Building2 size={16} className="text-accent-foreground" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">ลูกค้าที่รออนุมัติ</h2>
                <p className="text-[11px] text-muted-foreground">{clients.length} รายการรอดำเนินการ</p>
              </div>
            </div>

            <div className="bg-card rounded-lg border border-border overflow-hidden">
              {clients.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCheck className="w-9 h-9 text-emerald-400 mx-auto mb-2.5" strokeWidth={1.75} />
                  <p className="text-sm text-muted-foreground font-medium">ไม่มีลูกค้าที่รออนุมัติ</p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {clients.map((client, idx) => (
                    <div key={client.id}
                      className="flex flex-col gap-3 px-4 md:px-6 py-3.5 md:py-4 hover:bg-secondary/60 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{client.hospital_name}</p>
                          {client.province && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin size={11} strokeWidth={2.5} />
                              {client.province}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-2 pl-11">
                        <CustomerCodeField
                          hospitalName={client.hospital_name}
                          value={customerCodes[client.id] ?? ''}
                          onChange={(v) => setCustomerCodes((prev) => ({ ...prev, [client.id]: v }))}
                        />
                        <button
                          onClick={() => handleReviewClient(client.id, 'approved')}
                          disabled={!customerCodes[client.id]?.trim() || processingIds.has(client.id)}
                          title={!customerCodes[client.id]?.trim() ? 'กรุณาระบุรหัสลูกค้าก่อนอนุมัติ' : undefined}
                          className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-md text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {processingIds.has(client.id) ? <Loader2 size={14} className="animate-spin" strokeWidth={3} /> : <Check size={14} strokeWidth={3} />} อนุมัติ
                        </button>
                        <button
                          onClick={() => handleReviewClient(client.id, 'rejected')}
                          disabled={processingIds.has(client.id)}
                          className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-md text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:scale-95 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <X size={14} strokeWidth={3} /> ปฏิเสธ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Tab: ค้นหาลูกค้าในระบบ (reuse CustomerPicker จากฟอร์ม staff) + ประวัติใบงาน ── */}
        {tab === 'search' && (
          <div className="space-y-5">
            <section>
              <div className="flex items-center gap-2.5 mb-3 px-1">
                <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                  <Search size={16} className="text-accent-foreground" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">ค้นหาลูกค้าในระบบ</h2>
                  <p className="text-[11px] text-muted-foreground">ค้นหาลูกค้าที่อนุมัติแล้วเพื่อดูข้อมูลติดต่อและประวัติใบงาน</p>
                </div>
              </div>

              <div className="bg-card rounded-lg border border-border p-5 md:p-6">
                <CustomerPicker
                  selected={selectedCustomer}
                  onSelect={setSelectedCustomer}
                  onClear={() => setSelectedCustomer(null)}
                />
                {selectedCustomer && (
                  <OrgTypeEditor
                    customer={selectedCustomer}
                    onSaved={(orgType) => setSelectedCustomer((prev) => prev ? { ...prev, org_type: orgType } : prev)}
                  />
                )}
              </div>
            </section>

            {/* ── ประวัติใบงานของลูกค้าที่เลือก — กดแต่ละแถวเพื่อดูรายละเอียดเต็มแบบหน้า tracking login ── */}
            {selectedCustomer && (
              <section>
                <div className="flex items-center gap-2.5 mb-3 px-1">
                  <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-accent-foreground" strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold text-foreground">ประวัติใบงาน</h2>
                    <p className="text-[11px] text-muted-foreground">{selectedCustomer.hospital_name}</p>
                  </div>
                  <button
                    onClick={handleViewRegistrationDocument}
                    disabled={docLoading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold text-accent-foreground bg-accent hover:bg-primary/10 border border-border transition-all shrink-0 disabled:opacity-50"
                  >
                    {docLoading ? <Loader2 size={14} className="animate-spin" strokeWidth={2.5} /> : <Download size={14} strokeWidth={2.5} />}
                    เอกสารยืนยันการลงทะเบียน
                  </button>
                </div>

                <RequestHistoryList
                  history={history}
                  loading={historyLoading}
                  error={historyError}
                  emptyText="ลูกค้ารายนี้ยังไม่มีประวัติใบงาน"
                  fetchDetail={(id) => getStaffRequestDetail(id, selectedCustomer.id)}
                />
              </section>
            )}
          </div>
        )}

        {/* ── Tab: การต่ออายุเข้าใช้ระบบ — อายุการใช้งานบัญชี 2 ปีนับจากวันอนุมัติ ── */}
        {tab === 'access' && (
          <section>
            <div className="flex items-center gap-2.5 mb-3 px-1">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                <CalendarClock size={16} className="text-accent-foreground" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">การต่ออายุเข้าใช้ระบบ</h2>
                <p className="text-[11px] text-muted-foreground">อายุการใช้งานบัญชี 2 ปี นับจากวันที่อนุมัติ — เรียงจากใกล้หมดอายุที่สุดก่อน</p>
              </div>
            </div>

            {(() => {
              const activeList = accessCustomers.filter((c) => !c.cancelled_at);
              const cancelledList = accessCustomers.filter((c) => !!c.cancelled_at);
              const currentList = accessFilter === 'active' ? activeList : cancelledList;
              const totalPages = Math.max(1, Math.ceil(currentList.length / ACCESS_PAGE_SIZE));
              const pageSafe = Math.min(accessPage, totalPages);
              const paginatedList = currentList.slice((pageSafe - 1) * ACCESS_PAGE_SIZE, pageSafe * ACCESS_PAGE_SIZE);

              const switchFilter = (f: 'active' | 'cancelled') => {
                setAccessFilter(f);
                setAccessPage(1);
              };

              return (
                <>
                  {/* ── ตัวกรองใช้งานอยู่ / ถูกยกเลิก — แยกให้ชัดเจน ไม่ปนกันเหมือนเดิม ── */}
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => switchFilter('active')}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-bold transition-colors ${
                        accessFilter === 'active' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground border border-border hover:bg-secondary'
                      }`}
                    >
                      ใช้งานอยู่
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${accessFilter === 'active' ? 'bg-primary-foreground/20' : 'bg-accent text-accent-foreground'}`}>{activeList.length}</span>
                    </button>
                    <button
                      onClick={() => switchFilter('cancelled')}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-bold transition-colors ${
                        accessFilter === 'cancelled' ? 'bg-foreground text-background' : 'bg-card text-muted-foreground border border-border hover:bg-secondary'
                      }`}
                    >
                      <Ban size={12} strokeWidth={2.5} /> ถูกยกเลิก
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${accessFilter === 'cancelled' ? 'bg-background/20' : 'bg-secondary text-muted-foreground'}`}>{cancelledList.length}</span>
                    </button>
                  </div>

                  <div className="bg-card rounded-lg border border-border overflow-hidden">
                    {accessLoading ? (
                      <div className="py-12 text-center">
                        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin mx-auto" />
                      </div>
                    ) : currentList.length === 0 ? (
                      <div className="py-12 text-center">
                        <CalendarClock className="w-9 h-9 text-slate-300 mx-auto mb-2.5" strokeWidth={1.75} />
                        <p className="text-sm text-muted-foreground font-medium">
                          {accessFilter === 'active' ? 'ยังไม่มีลูกค้าที่ใช้งานอยู่ในระบบ' : 'ยังไม่มีลูกค้าที่ถูกยกเลิก'}
                        </p>
                      </div>
                    ) : (
                <div className="divide-y divide-border/60">
                  {paginatedList.map((c) => {
                    const isCancelled = !!c.cancelled_at;
                    const isExpired = !isCancelled && new Date(c.access_expires_at) < new Date();
                    const isProcessing = accessProcessingIds.has(c.id);
                    const badge = isCancelled
                      ? { label: 'ถูกยกเลิก', className: 'bg-slate-200 text-slate-600' }
                      : isExpired
                        ? { label: 'หมดอายุ', className: 'bg-red-100 text-red-700' }
                        : { label: 'ปกติ', className: 'bg-emerald-100 text-emerald-700' };
                    const historyRows = historyById[c.id];

                    return (
                      <div
                        key={c.id}
                        className={`px-4 md:px-6 py-3.5 md:py-4 transition-colors ${
                          isProcessing ? 'opacity-50 pointer-events-none' : 'hover:bg-secondary/60'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-foreground">{c.hospital_name ?? '-'}</p>
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badge.className}`}>{badge.label}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{c.contact_name ?? '-'} · {c.customer_code ?? 'ไม่มีรหัสลูกค้า'}</p>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <Clock size={11} strokeWidth={2.5} />
                              {isCancelled ? `ยกเลิกเมื่อ ${formatThaiDate(c.cancelled_at!)}` : `หมดอายุ ${formatThaiDate(c.access_expires_at)}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleToggleHistory(c.id)}
                              className="flex items-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                            >
                              <History size={13} strokeWidth={2.5} /> ประวัติ
                            </button>
                            {isCancelled ? (
                              <button
                                onClick={() => handleReactivate(c.id)}
                                disabled={isProcessing}
                                className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-md text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-40"
                              >
                                {isProcessing ? <Loader2 size={14} className="animate-spin" strokeWidth={3} /> : <RefreshCw size={14} strokeWidth={3} />} เปิดใช้งาน
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleRenew(c.id)}
                                  disabled={isProcessing}
                                  className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-md text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-40"
                                >
                                  {isProcessing ? <Loader2 size={14} className="animate-spin" strokeWidth={3} /> : <RefreshCw size={14} strokeWidth={3} />} ต่ออายุ
                                </button>
                                <button
                                  onClick={() => handleCancelAccess(c.id)}
                                  disabled={isProcessing}
                                  className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-md text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 transition-all disabled:opacity-40"
                                >
                                  <Ban size={14} strokeWidth={2.5} /> ยกเลิกลูกค้า
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {openHistoryId === c.id && (
                          <div className="mt-3 ml-1 pl-3 border-l-2 border-border">
                            {historyLoadingId === c.id ? (
                              <p className="text-xs text-muted-foreground py-2">กำลังโหลดประวัติ...</p>
                            ) : !historyRows || historyRows.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2 flex items-center gap-1.5">
                                <ShieldOff size={12} strokeWidth={2.5} /> ยังไม่มีประวัติ
                              </p>
                            ) : (
                              <div className="space-y-1.5 py-1.5">
                                {historyRows.map((h) => (
                                  <p key={h.id} className="text-xs text-muted-foreground">
                                    <span className="font-semibold text-foreground">{ACCESS_ACTION_LABEL[h.action]}</span>
                                    {' โดย '}{h.staff_name ?? 'ไม่ทราบชื่อ'}
                                    {' · '}{formatThaiDate(h.created_at)}
                                    {h.new_expires_at && ` · หมดอายุใหม่ ${formatThaiDate(h.new_expires_at)}`}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                    )}

                    {/* ── Pagination — หน้าละ 10 รายการ ── */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-t border-border/60">
                        <button
                          onClick={() => setAccessPage((p) => Math.max(1, p - 1))}
                          disabled={pageSafe <= 1}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-all disabled:opacity-30 disabled:pointer-events-none"
                        >
                          ← ก่อนหน้า
                        </button>
                        <span className="text-xs font-semibold text-muted-foreground">หน้า {pageSafe} จาก {totalPages}</span>
                        <button
                          onClick={() => setAccessPage((p) => Math.min(totalPages, p + 1))}
                          disabled={pageSafe >= totalPages}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-all disabled:opacity-30 disabled:pointer-events-none"
                        >
                          ถัดไป →
                        </button>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </section>
        )}

        {/* ── Tab: Export รายชื่อลูกค้าทั้งหมดเป็น Excel ── */}
        {tab === 'export' && (
          <section>
            <div className="flex items-center gap-2.5 mb-3 px-1">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                <FileSpreadsheet size={16} className="text-accent-foreground" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">Export รายชื่อลูกค้า</h2>
                <p className="text-[11px] text-muted-foreground">ส่งออกรายชื่อลูกค้าที่อนุมัติแล้วทั้งหมด พร้อมข้อมูลเบื้องต้น</p>
              </div>
            </div>

            <div className="bg-card rounded-lg border border-border p-6 md:p-8 flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-lg bg-accent flex items-center justify-center">
                <FileSpreadsheet size={26} className="text-accent-foreground" strokeWidth={2} />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">รายชื่อลูกค้าทั้งหมด (Excel)</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  ไฟล์ .xlsx ประกอบด้วย รหัสลูกค้า, ชื่อหน่วยงาน, ประเภทหน่วยงาน, จังหวัด, ชื่อผู้ติดต่อ, ตำแหน่ง, เบอร์โทรศัพท์, อีเมล และวันที่ลงทะเบียน ของลูกค้าที่อนุมัติแล้วทุกราย
                </p>
              </div>
              <a
                href="/admin/csr/customers/export"
                className="flex items-center gap-2 px-5 py-3 rounded-md text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors"
              >
                <Download size={16} strokeWidth={2.5} />
                ดาวน์โหลด Excel
              </a>
            </div>
          </section>
        )}
      </div>

      {/* ══ โมดัลดูเอกสารยืนยันการลงทะเบียน — แสดงในหน้าเดียวกันแทน window.open() ══
          (window.open() หลัง await ไม่นับเป็น user gesture ต่อเนื่อง ทำให้ browser
          บล็อกเป็น popup ทั้งบน desktop บางเคสและมือถือ Safari แทบทุกเคส) */}
      {docModalUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-6 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setDocModalUrl(null)}
        >
          <div
            className="relative w-full max-w-3xl h-[85vh] bg-card rounded-lg shadow-lg overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
              <h3 className="text-sm font-bold text-foreground">เอกสารยืนยันการลงทะเบียน</h3>
              <div className="flex items-center gap-2">
                <a
                  href={docModalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-accent-foreground bg-accent hover:bg-primary/10 border border-border transition-all"
                >
                  <Download size={13} strokeWidth={2.5} />
                  เปิดในแท็บใหม่ / ดาวน์โหลด
                </a>
                <button
                  onClick={() => setDocModalUrl(null)}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-slate-100 hover:text-slate-600 transition-all"
                  aria-label="ปิด"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>
            <iframe src={docModalUrl} className="flex-1 w-full" title="เอกสารยืนยันการลงทะเบียน" />
          </div>
        </div>
      )}
    </div>
  );
}