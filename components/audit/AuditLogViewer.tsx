'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Filter, ChevronDown, CheckCircle2, XCircle, ShieldCheck, Eye, Wrench, Server } from 'lucide-react';
import { getAuditEvents, type AuditEventRow, type AuditFilters } from '@/app/actions/audit-actions';

const CATEGORY_META: Record<string, { label: string; Icon: typeof Eye; tone: string }> = {
  auth: { label: 'การยืนยันตัวตน', Icon: ShieldCheck, tone: 'text-blue-600 bg-blue-50' },
  data_access: { label: 'การเข้าถึงข้อมูล', Icon: Eye, tone: 'text-violet-600 bg-violet-50' },
  admin_action: { label: 'การจัดการระบบ', Icon: Wrench, tone: 'text-amber-600 bg-amber-50' },
  system: { label: 'ระบบ', Icon: Server, tone: 'text-slate-600 bg-slate-100' },
};

// ── หมวดย่อยสำหรับจัดกลุ่มรายการในมุมมอง "จัดกลุ่ม" — เรียงตามลำดับนี้ ──
const GROUPS = [
  { key: 'login', label: 'การเข้าสู่ระบบ' },
  { key: 'mfa', label: 'การยืนยันตัวตนสองชั้น (MFA)' },
  { key: 'logout', label: 'การออกจากระบบ' },
  { key: 'password', label: 'รหัสผ่าน' },
  { key: 'session', label: 'เซสชัน & อุปกรณ์ที่เชื่อถือ' },
  { key: 'account', label: 'ความปลอดภัยบัญชี' },
  { key: 'data', label: 'การเข้าถึงข้อมูล' },
  { key: 'admin', label: 'การจัดการระบบ' },
  { key: 'system', label: 'ระบบ' },
] as const;
type GroupKey = (typeof GROUPS)[number]['key'];

// label ภาษาไทยต่อ action — ครอบคลุมทุก action ที่ระบบ emit จริง + เผื่อ action ของ MFA ที่
// อาจเพิ่มภายหลัง (disabled / ใช้รหัสสำรอง / สร้างรหัสสำรองใหม่) ไว้ล่วงหน้า ถ้ายังไม่ emit ก็ไม่โผล่
const ACTION_LABEL: Record<string, string> = {
  'auth.login.success': 'เข้าสู่ระบบสำเร็จ',
  'auth.login.failure': 'เข้าสู่ระบบไม่สำเร็จ',
  'auth.new_location': 'เข้าสู่ระบบจากตำแหน่ง/อุปกรณ์ใหม่',
  'auth.logout': 'ออกจากระบบ',
  'auth.mfa.challenge.success': 'ยืนยัน MFA สำเร็จ',
  'auth.mfa.challenge.failure': 'ยืนยัน MFA ไม่สำเร็จ',
  'auth.mfa.enrolled': 'เปิดใช้งาน MFA',
  'auth.mfa.disabled': 'ปิดใช้งาน MFA',
  'auth.mfa.reset': 'รีเซ็ต MFA (โดยผู้จัดการ)',
  'auth.mfa.recovery_codes.regenerated': 'สร้างรหัสสำรอง MFA ชุดใหม่',
  'auth.mfa.recovery_code.used': 'ใช้รหัสสำรอง MFA เข้าสู่ระบบ',
  'auth.password.changed': 'เปลี่ยนรหัสผ่าน',
  'auth.password.reset': 'ตั้งรหัสผ่านใหม่ (OTP)',
  'auth.session.revoked': 'เพิกถอนเซสชัน',
  'auth.trusted_device.added': 'เพิ่มอุปกรณ์ที่เชื่อถือ',
  'auth.trusted_device.revoked': 'ยกเลิกอุปกรณ์ที่เชื่อถือ',
  'auth.lockout.triggered': 'บัญชีถูกล็อกชั่วคราว (ใส่รหัสผิดหลายครั้ง)',
  'data.request.detail_viewed': 'เปิดดูรายละเอียดใบงาน',
  'data.export.generated': 'ดาวน์โหลด/ส่งออกข้อมูล',
  'admin.staff.registered': 'ลงทะเบียนพนักงานใหม่',
  'admin.staff.approved': 'อนุมัติพนักงาน',
  'system.boot': 'ระบบเริ่มทำงาน',
  'system.retention.purged': 'ลบข้อมูลเก่าตามรอบเก็บรักษา (retention)',
};

// จับ action → หมวดย่อย ด้วย prefix เป็นหลัก เพื่อรองรับ action ใหม่ที่ยังไม่มีใน map ข้างบน
function groupOf(action: string): GroupKey {
  if (action.startsWith('auth.mfa.')) return 'mfa';
  if (action.startsWith('auth.login') || action === 'auth.new_location') return 'login';
  if (action.startsWith('auth.logout')) return 'logout';
  if (action.startsWith('auth.password.')) return 'password';
  if (action.startsWith('auth.session.') || action.startsWith('auth.trusted_device.')) return 'session';
  if (action.startsWith('auth.')) return 'account';
  if (action.startsWith('data.')) return 'data';
  if (action.startsWith('admin.')) return 'admin';
  return 'system';
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'medium' });
}

export function AuditLogViewer() {
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const [category, setCategory] = useState('');
  const [outcome, setOutcome] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // แผงตัวกรอง — ยุบไว้บนมือถือ (กดเปิด), แสดงเสมอบนจอ >= sm
  const [filtersOpen, setFiltersOpen] = useState(false);
  // มุมมองรายการ: จัดกลุ่มตามหมวดย่อย (ค่าเริ่มต้น) หรือเรียงตามเวลาล้วน
  const [grouped, setGrouped] = useState(true);

  const buildFilters = useCallback(
    (extra?: Partial<AuditFilters>): AuditFilters => ({
      category: (category || undefined) as AuditFilters['category'],
      outcome: (outcome || undefined) as AuditFilters['outcome'],
      action: action.trim() || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
      ...extra,
    }),
    [category, outcome, action, from, to],
  );

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError('');
    setExpanded(null);
    const res = await getAuditEvents(buildFilters({ cursor: null }));
    setLoading(false);
    if (res.success) {
      setEvents(res.events);
      setCursor(res.nextCursor);
    } else {
      setError(res.error);
    }
  }, [buildFilters]);

  useEffect(() => {
    runSearch();
    // initial load only — subsequent searches are triggered by the ค้นหา button
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    const res = await getAuditEvents(buildFilters({ cursor }));
    setLoadingMore(false);
    if (res.success) {
      setEvents((prev) => [...prev, ...res.events]);
      setCursor(res.nextCursor);
    } else {
      setError(res.error);
    }
  };

  // ทุก field ในแถบตัวกรองใช้สไตล์เดียวกัน — บังคับ h-10 (สูงเท่ากันทุกช่องไม่ว่าจะเป็น
  // select / input / datetime ที่ UA render ความสูงไม่เท่ากันโดยดีฟอลต์) + text-xs
  // *ไม่ใช้ leading-none* เพราะ line-height 1 ตัดสระล่าง/วรรณยุกต์ของไทย ("ทุ" ใน "ทุกหมวด")
  // — ความสูงกล่องคุมด้วย h-10 อยู่แล้วไม่ต้องพึ่ง line-height + w-full เต็มความกว้าง wrapper (sm:w-40)
  const fieldStyle =
    'h-10 w-full min-w-0 rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';
  const labelStyle = 'text-[11px] font-bold text-muted-foreground uppercase';

  // จัดกลุ่ม event ที่โหลดมาแล้วตามหมวดย่อย (คงลำดับเวลาเดิมภายในแต่ละกลุ่ม) — เว้นกลุ่มว่างไว้
  const groupedEvents = useMemo(
    () => GROUPS
      .map((g) => ({ ...g, items: events.filter((e) => groupOf(e.action) === g.key) }))
      .filter((g) => g.items.length > 0),
    [events],
  );

  const renderRow = (e: AuditEventRow) => {
    const cat = CATEGORY_META[e.category] ?? CATEGORY_META.system;
    const open = expanded === e.id;
    return (
      <div key={e.id}>
        <button
          onClick={() => setExpanded(open ? null : e.id)}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-secondary/50 transition-colors"
        >
          <span className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${cat.tone}`}>
            <cat.Icon className="w-3.5 h-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-sm font-semibold text-foreground">
              {ACTION_LABEL[e.action] ?? e.action}
            </span>
            <span className="block text-[11px] text-muted-foreground truncate">
              {e.actor_label ?? e.actor_type ?? '—'}
              {e.target_type && ` → ${e.target_type}:${e.target_id}`}
              {e.ip && ` · ${e.ip}`}
            </span>
            {/* เวลาบนมือถือ — จอ sm ขึ้นไปโชว์คอลัมน์เวลาแยกด้านขวาแทน */}
            <span className="block text-[11px] text-muted-foreground tabular-nums truncate sm:hidden">
              {fmt(e.occurred_at)}
            </span>
          </span>
          {e.outcome === 'failure' ? (
            <XCircle className="w-4 h-4 text-destructive shrink-0" />
          ) : e.outcome === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : null}
          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 hidden sm:block">
            {fmt(e.occurred_at)}
          </span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="px-3.5 pb-3 pt-1 bg-secondary/30 text-[11px] font-mono text-muted-foreground space-y-1">
            <div>เวลา: {fmt(e.occurred_at)}</div>
            <div>action: <span className="text-foreground">{e.action}</span></div>
            <div>ผู้กระทำ: {e.actor_type ?? '—'} {e.actor_label ? `(${e.actor_label})` : ''} {e.actor_staff_id ?? ''}{e.actor_customer_id ?? ''}</div>
            {e.target_type && <div>เป้าหมาย: {e.target_type}:{e.target_id}</div>}
            {e.user_agent && <div className="break-all">user-agent: {e.user_agent}</div>}
            {Object.keys(e.detail ?? {}).length > 0 && (
              <pre className="whitespace-pre-wrap break-all text-foreground bg-background rounded p-2 mt-1">
                {JSON.stringify(e.detail, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    // ความกว้าง/padding ปล่อยให้ container ของหน้าที่เรียกเป็นคนคุม (หน้า
    // /admin/manager/audit-trail ครอบด้วย max-w-7xl mx-auto px-4 md:px-6 อยู่แล้ว)
    <div className="space-y-4">
      {/* filter bar — มือถือ: ปุ่ม "ตัวกรอง" กดเปิด/ปิด / จอ sm ขึ้นไป: แสดงเสมอเป็น grid */}
      <div className="rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className="sm:hidden w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold text-muted-foreground"
          aria-expanded={filtersOpen}
        >
          <span className="flex items-center gap-1.5"><Filter className="w-3.5 h-3.5" /> ตัวกรอง</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
        </button>

        <div className={`${filtersOpen ? 'block' : 'hidden'} sm:block p-3 sm:p-4`}>
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-muted-foreground mb-3">
            <Filter className="w-3.5 h-3.5" /> ตัวกรอง
          </div>
          {/* มือถือ: 2 คอลัมน์ / จอ sm ขึ้นไป: แถวเดียว flex-wrap — ทุกช่องกว้าง 10rem + สูง h-9
              เท่ากันหมด (min-w-0 ที่ wrapper กัน select ที่ option ยาวดันความกว้างเกิน) */}
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div className="flex flex-col gap-1 min-w-0 sm:w-40">
              <label className={labelStyle}>หมวด</label>
              <div className="relative">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${fieldStyle} appearance-none cursor-pointer pr-8`}>
                  <option value="">ทุกหมวด</option>
                  <option value="auth">การยืนยันตัวตน</option>
                  <option value="data_access">การเข้าถึงข้อมูล</option>
                  <option value="admin_action">การจัดการระบบ</option>
                  <option value="system">ระบบ</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </div>
            <div className="flex flex-col gap-1 min-w-0 sm:w-40">
              <label className={labelStyle}>ผลลัพธ์</label>
              <div className="relative">
                <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={`${fieldStyle} appearance-none cursor-pointer pr-8`}>
                  <option value="">ทุกผลลัพธ์</option>
                  <option value="success">สำเร็จ</option>
                  <option value="failure">ล้มเหลว</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </div>
            <div className="flex flex-col gap-1 min-w-0 col-span-2 sm:w-40">
              <label className={labelStyle}>Action</label>
              <input
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="เช่น auth.login.failure"
                className={fieldStyle}
              />
            </div>
            <div className="flex flex-col gap-1 min-w-0 sm:w-40">
              <label className={labelStyle}>ตั้งแต่</label>
              <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldStyle} />
            </div>
            <div className="flex flex-col gap-1 min-w-0 sm:w-40">
              <label className={labelStyle}>ถึง</label>
              <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className={fieldStyle} />
            </div>
            <button
              onClick={runSearch}
              disabled={loading}
              className="h-10 col-span-2 w-full sm:w-auto px-4 rounded-md text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-60"
            >
              ค้นหา
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-xs font-semibold text-destructive">{error}</p>}

      {/* แถบสลับมุมมอง — จัดกลุ่มตามหมวดย่อย / เรียงตามเวลาล้วน */}
      {!loading && events.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">{events.length} รายการที่โหลดมา</p>
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-secondary text-xs font-semibold">
            <button
              onClick={() => setGrouped(true)}
              className={`px-2.5 py-1 rounded ${grouped ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              จัดกลุ่ม
            </button>
            <button
              onClick={() => setGrouped(false)}
              className={`px-2.5 py-1 rounded ${!grouped ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              ตามเวลา
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด...
        </div>
      ) : events.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">ไม่พบเหตุการณ์ที่ตรงกับตัวกรอง</div>
      ) : grouped ? (
        <div className="space-y-4">
          {groupedEvents.map((g) => (
            <div key={g.key}>
              <div className="flex items-center gap-2 px-1 mb-1.5">
                <h3 className="text-xs font-bold text-foreground">{g.label}</h3>
                <span className="text-[11px] font-bold text-muted-foreground bg-secondary rounded-full px-1.5 py-0.5 tabular-nums">
                  {g.items.length}
                </span>
              </div>
              <div className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
                {g.items.map(renderRow)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
          {events.map(renderRow)}
        </div>
      )}

      {cursor && !loading && (
        <div className="text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-5 py-2 rounded-md text-xs font-bold text-muted-foreground border border-border hover:bg-secondary disabled:opacity-60"
          >
            {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : 'โหลดเพิ่ม'}
          </button>
        </div>
      )}
    </div>
  );
}
