'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Filter, ChevronDown, CheckCircle2, XCircle, ShieldCheck, Eye, Wrench, Server } from 'lucide-react';
import { getAuditEvents, type AuditEventRow, type AuditFilters } from '@/app/actions/audit-actions';

const CATEGORY_META: Record<string, { label: string; Icon: typeof Eye; tone: string }> = {
  auth: { label: 'การยืนยันตัวตน', Icon: ShieldCheck, tone: 'text-blue-600 bg-blue-50' },
  data_access: { label: 'การเข้าถึงข้อมูล', Icon: Eye, tone: 'text-violet-600 bg-violet-50' },
  admin_action: { label: 'การจัดการระบบ', Icon: Wrench, tone: 'text-amber-600 bg-amber-50' },
  system: { label: 'ระบบ', Icon: Server, tone: 'text-slate-600 bg-slate-100' },
};

const ACTION_LABEL: Record<string, string> = {
  'auth.login.success': 'เข้าสู่ระบบสำเร็จ',
  'auth.login.failure': 'เข้าสู่ระบบไม่สำเร็จ',
  'auth.logout': 'ออกจากระบบ',
  'auth.mfa.challenge.success': 'ยืนยัน MFA สำเร็จ',
  'auth.mfa.challenge.failure': 'ยืนยัน MFA ไม่สำเร็จ',
  'auth.mfa.enrolled': 'เปิดใช้งาน MFA',
  'auth.mfa.reset': 'รีเซ็ต MFA (โดยผู้จัดการ)',
  'auth.lockout.triggered': 'บัญชีถูกล็อกชั่วคราว',
  'auth.password.changed': 'เปลี่ยนรหัสผ่าน',
  'auth.password.reset': 'ตั้งรหัสผ่านใหม่ (OTP)',
  'auth.session.revoked': 'เพิกถอนเซสชัน',
  'auth.trusted_device.added': 'เพิ่มอุปกรณ์ที่เชื่อถือ',
  'auth.trusted_device.revoked': 'ยกเลิกอุปกรณ์ที่เชื่อถือ',
  'auth.new_location': 'เข้าสู่ระบบจากตำแหน่งใหม่',
  'admin.staff.registered': 'ลงทะเบียนพนักงานใหม่',
  'admin.staff.approved': 'อนุมัติพนักงาน',
  'system.retention.purged': 'ลบข้อมูลตามรอบ retention',
};

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

  const selectStyle =
    'rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-4">
      {/* filter bar */}
      <div className="rounded-lg border border-border bg-card p-3 flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground mr-1">
          <Filter className="w-3.5 h-3.5" /> ตัวกรอง
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectStyle} aria-label="หมวด">
          <option value="">ทุกหมวด</option>
          <option value="auth">การยืนยันตัวตน</option>
          <option value="data_access">การเข้าถึงข้อมูล</option>
          <option value="admin_action">การจัดการระบบ</option>
          <option value="system">ระบบ</option>
        </select>
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={selectStyle} aria-label="ผลลัพธ์">
          <option value="">ทุกผลลัพธ์</option>
          <option value="success">สำเร็จ</option>
          <option value="failure">ล้มเหลว</option>
        </select>
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="action (เช่น auth.login.failure)"
          className={`${selectStyle} min-w-[13rem] flex-1`}
        />
        <label className="text-[11px] text-muted-foreground flex flex-col gap-0.5">
          ตั้งแต่
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={selectStyle} />
        </label>
        <label className="text-[11px] text-muted-foreground flex flex-col gap-0.5">
          ถึง
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className={selectStyle} />
        </label>
        <button
          onClick={runSearch}
          disabled={loading}
          className="px-4 py-1.5 rounded-md text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-60"
        >
          ค้นหา
        </button>
      </div>

      {error && <p className="text-xs font-semibold text-destructive">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด...
        </div>
      ) : events.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">ไม่พบเหตุการณ์ที่ตรงกับตัวกรอง</div>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
          {events.map((e) => {
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
          })}
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
