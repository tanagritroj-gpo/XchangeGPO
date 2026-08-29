'use client';

import { useEffect, useState } from 'react';
import { Loader2, Monitor, ShieldCheck, LogOut, X, AlertCircle } from 'lucide-react';

type SessionRow = {
  sid: string;
  label: string;
  ip: string | null;
  lastSeenAt: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
};
type DeviceRow = {
  id: string;
  label: string;
  ip: string | null;
  lastUsedAt: string;
  expiresAt: string;
};

type LoadResult =
  | { success: true; sessions: SessionRow[]; devices?: DeviceRow[] }
  | { success: false; error: string };
type ActionResult = { success: boolean; error?: string };

function when(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function DeviceSessionCard({
  load,
  revokeSession,
  revokeOthers,
  revokeDevice,
}: {
  load: () => Promise<LoadResult>;
  revokeSession: (sid: string) => Promise<ActionResult>;
  revokeOthers: () => Promise<ActionResult>;
  revokeDevice?: (id: string) => Promise<ActionResult>;
}) {
  const [state, setState] = useState<LoadResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = () => load().then(setState);
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const run = async (key: string, fn: () => Promise<ActionResult>) => {
    setBusy(key);
    setError('');
    const res = await fn();
    setBusy(null);
    if (res.success) refresh();
    else setError(res.error || 'ดำเนินการไม่สำเร็จ');
  };

  const sessions = state?.success ? state.sessions : [];
  const devices = state?.success ? state.devices ?? [] : [];
  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <div className="rounded-lg bg-card border border-border p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-md flex items-center justify-center bg-accent text-accent-foreground shrink-0">
          <Monitor className="w-4 h-4" strokeWidth={2.25} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground">อุปกรณ์และเซสชันที่เข้าสู่ระบบ</h2>
          <p className="text-xs text-muted-foreground">รายการเครื่องที่บัญชีคุณกำลัง login อยู่ — ออกจากเครื่องที่ไม่รู้จักได้ทันที</p>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      )}

      {!state ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังโหลด...
        </div>
      ) : !state.success ? (
        <p className="text-xs text-destructive">{state.error}</p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-md border border-border">
            {sessions.map((s) => (
              <li key={s.sid} className="flex items-center justify-between gap-3 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    {s.label}
                    {s.isCurrent && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                        เครื่องนี้
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {s.ip ?? 'ไม่ทราบ IP'} · ใช้งานล่าสุด {when(s.lastSeenAt)}
                  </p>
                </div>
                {!s.isCurrent && (
                  <button
                    onClick={() => run(`s:${s.sid}`, () => revokeSession(s.sid))}
                    disabled={busy === `s:${s.sid}`}
                    className="flex items-center gap-1 text-xs font-semibold text-destructive hover:bg-destructive/10 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50 shrink-0"
                  >
                    {busy === `s:${s.sid}` ? <Loader2 size={13} className="animate-spin" /> : <X size={13} strokeWidth={2.5} />}
                    ออก
                  </button>
                )}
              </li>
            ))}
          </ul>

          {otherCount > 0 && (
            <button
              onClick={() => run('others', revokeOthers)}
              disabled={busy === 'others'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md font-bold text-xs text-destructive-foreground bg-destructive hover:bg-destructive/90 transition-colors disabled:opacity-60"
            >
              {busy === 'others' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              ออกจากอุปกรณ์อื่นทั้งหมด ({otherCount})
            </button>
          )}

          {revokeDevice && devices.length > 0 && (
            <div className="pt-2 space-y-2">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> อุปกรณ์ที่เชื่อถือ (ข้ามการยืนยันสองชั้น)
              </p>
              <ul className="divide-y divide-border rounded-md border border-border">
                {devices.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{d.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {d.ip ?? 'ไม่ทราบ IP'} · ใช้ล่าสุด {when(d.lastUsedAt)} · หมดอายุ {when(d.expiresAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => run(`d:${d.id}`, () => revokeDevice(d.id))}
                      disabled={busy === `d:${d.id}`}
                      className="flex items-center gap-1 text-xs font-semibold text-destructive hover:bg-destructive/10 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50 shrink-0"
                    >
                      {busy === `d:${d.id}` ? <Loader2 size={13} className="animate-spin" /> : <X size={13} strokeWidth={2.5} />}
                      ยกเลิก
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
