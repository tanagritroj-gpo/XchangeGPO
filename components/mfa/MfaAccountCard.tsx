'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2, KeyRound, Check, Copy, AlertCircle } from 'lucide-react';
import { getMyMfaStatus, regenerateRecoveryCodes } from '@/app/actions/auth-staff';
import { MfaEnrollFlow } from '@/components/mfa/MfaEnrollFlow';
import { PasswordInput } from '@/components/ui/password-input';

type Status = {
  enabled: boolean;
  enrolledAt: string | null;
  graceUntil: string | null;
  recoveryLeft: number;
};

const inputStyle =
  'w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors';

export function MfaAccountCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  const [regenOpen, setRegenOpen] = useState(false);
  const [regenPassword, setRegenPassword] = useState('');
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState('');
  const [regenCodes, setRegenCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const refresh = () => {
    getMyMfaStatus().then((res) => {
      if (res.success) {
        setStatus({
          enabled: res.enabled,
          enrolledAt: res.enrolledAt,
          graceUntil: res.graceUntil,
          recoveryLeft: res.recoveryLeft,
        });
      }
      setLoading(false);
    });
  };

  useEffect(refresh, []);

  const submitRegen = async () => {
    setRegenLoading(true);
    setRegenError('');
    const res = await regenerateRecoveryCodes(regenPassword);
    setRegenLoading(false);
    if (res.success && res.recoveryCodes) {
      setRegenCodes(res.recoveryCodes);
      setRegenPassword('');
      refresh();
    } else {
      setRegenError(res.error || 'สร้างรหัสสำรองใหม่ไม่สำเร็จ');
    }
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(regenCodes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="rounded-lg bg-card border border-border p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-md flex items-center justify-center bg-accent text-accent-foreground shrink-0">
          <ShieldCheck className="w-4 h-4" strokeWidth={2.25} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground">การยืนยันตัวตนสองชั้น (MFA)</h2>
          <p className="text-xs text-muted-foreground">
            รหัสจากแอป Authenticator เพิ่มอีกชั้นนอกเหนือจากรหัสผ่าน — องค์กรกำหนดให้เปิดใช้งานทุกบัญชี
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังโหลดสถานะ...
        </div>
      ) : !status ? null : status.enabled ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
            <Check className="w-4 h-4" /> เปิดใช้งานแล้ว
            {status.enrolledAt && (
              <span className="text-xs font-normal text-muted-foreground">
                (ตั้งแต่ {new Date(status.enrolledAt).toLocaleDateString('th-TH', { dateStyle: 'medium' })})
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            รหัสสำรองที่เหลือ: <span className="font-semibold text-foreground">{status.recoveryLeft}</span> ชุด
            {status.recoveryLeft <= 2 && (
              <span className="text-destructive font-semibold"> — เหลือน้อย ควรสร้างชุดใหม่</span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">
            หากต้องการปิด/เปลี่ยนอุปกรณ์ MFA กรุณาติดต่อผู้จัดการเพื่อรีเซ็ต (พนักงานปิดเองไม่ได้)
          </p>

          {regenCodes.length > 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
              <p className="text-xs font-bold text-amber-800">
                รหัสสำรองชุดใหม่ (ชุดเดิมถูกยกเลิกแล้ว) — เก็บให้ปลอดภัย แสดงครั้งเดียว
              </p>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-xs text-amber-900">
                {regenCodes.map((c) => (
                  <span key={c} className="bg-white/60 rounded px-2 py-1">{c}</span>
                ))}
              </div>
              <button onClick={copyCodes} className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 hover:text-amber-900">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'คัดลอกแล้ว' : 'คัดลอกทั้งหมด'}
              </button>
            </div>
          ) : regenOpen ? (
            <div className="space-y-2 max-w-xs">
              {regenError && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {regenError}
                </p>
              )}
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                รหัสผ่านปัจจุบัน (ยืนยันตัวตน)
              </label>
              <PasswordInput
                value={regenPassword}
                onChange={(e) => setRegenPassword(e.target.value)}
                className={inputStyle}
                placeholder="รหัสผ่านปัจจุบัน"
              />
              <div className="flex gap-2">
                <button
                  onClick={submitRegen}
                  disabled={regenLoading || !regenPassword}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md font-bold text-xs text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-60"
                >
                  {regenLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} สร้างรหัสสำรองใหม่
                </button>
                <button
                  onClick={() => { setRegenOpen(false); setRegenError(''); setRegenPassword(''); }}
                  className="px-4 py-2 rounded-md font-bold text-xs text-muted-foreground hover:text-foreground border border-border"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setRegenOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <KeyRound className="w-3.5 h-3.5" /> สร้างรหัสสำรองชุดใหม่
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-600">
            <ShieldAlert className="w-4 h-4" /> ยังไม่ได้เปิดใช้งาน
            {status.graceUntil && (
              <span className="text-xs font-normal text-muted-foreground">
                (ต้องตั้งค่าภายใน {new Date(status.graceUntil).toLocaleDateString('th-TH', { dateStyle: 'medium' })})
              </span>
            )}
          </div>
          <MfaEnrollFlow completeLabel="เสร็จสิ้น" onComplete={() => refresh()} />
        </div>
      )}
    </div>
  );
}
