'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Loader2, ShieldCheck, Copy, Check, AlertCircle } from 'lucide-react';
import { startMfaEnrollment, confirmMfaEnrollment } from '@/app/actions/auth-staff';

type Step = 'intro' | 'scan' | 'done';

// ขั้นตอนเปิดใช้งาน MFA ใช้ร่วมกันระหว่างหน้าบังคับ (/mfa-setup) และการ์ดในหน้าจัดการบัญชี
export function MfaEnrollFlow({
  onComplete,
  completeLabel = 'เสร็จสิ้น',
}: {
  onComplete?: (info: { role: string | null; department: string } | null) => void;
  completeLabel?: string;
}) {
  const [step, setStep] = useState<Step>('intro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [qr, setQr] = useState<{ qrDataUrl: string; manualKey: string } | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [dest, setDest] = useState<{ role: string | null; department: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const begin = async () => {
    setLoading(true);
    setError('');
    const res = await startMfaEnrollment();
    setLoading(false);
    if (res.success && res.qrDataUrl && res.manualKey) {
      setQr({ qrDataUrl: res.qrDataUrl, manualKey: res.manualKey });
      setStep('scan');
    } else {
      setError(res.error || 'เริ่มการตั้งค่าไม่สำเร็จ');
    }
  };

  const confirm = async () => {
    setLoading(true);
    setError('');
    const res = await confirmMfaEnrollment(code);
    setLoading(false);
    if (res.success && res.recoveryCodes) {
      setRecoveryCodes(res.recoveryCodes);
      setDest(res.department ? { role: res.role ?? null, department: res.department } : null);
      setStep('done');
    } else {
      setError(res.error || 'ยืนยันรหัสไม่สำเร็จ');
    }
  };

  const copyRecovery = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard ไม่พร้อมใช้งาน — ผู้ใช้จดเองได้ */
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      )}

      {step === 'intro' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            ใช้แอป Authenticator (Google Authenticator, Microsoft Authenticator, Authy ฯลฯ)
            สแกน QR เพื่อเชื่อมบัญชี จากนั้นกรอกรหัส 6 หลักเพื่อยืนยัน
          </p>
          <button
            onClick={begin}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-bold text-sm text-primary-foreground bg-primary hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            เริ่มตั้งค่า MFA
          </button>
        </div>
      )}

      {step === 'scan' && qr && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <Image
              src={qr.qrDataUrl}
              alt="MFA QR code"
              width={200}
              height={200}
              unoptimized
              className="rounded-lg border border-border bg-white p-2 shrink-0"
            />
            <div className="space-y-2 min-w-0">
              <p className="text-xs text-muted-foreground">
                สแกนไม่ได้? กรอกรหัสนี้ในแอปด้วยตนเอง (ประเภท: Time-based):
              </p>
              <code className="block text-xs font-mono bg-secondary rounded-md px-2.5 py-2 break-all">
                {qr.manualKey}
              </code>
            </div>
          </div>
          <div className="space-y-1.5 max-w-xs">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              รหัส 6 หลักจากแอป
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !loading) confirm(); }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <button
            onClick={confirm}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-bold text-sm text-primary-foreground bg-primary hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            ยืนยันและเปิดใช้งาน
          </button>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-600">
            <Check className="w-4 h-4" /> เปิดใช้งาน MFA เรียบร้อยแล้ว
          </div>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
            <p className="text-xs font-bold text-amber-800">
              รหัสสำรอง 10 ชุด — เก็บไว้ในที่ปลอดภัย ใช้ได้เมื่อไม่มีโทรศัพท์ (แสดงครั้งเดียวเท่านั้น)
            </p>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-xs text-amber-900">
              {recoveryCodes.map((c) => (
                <span key={c} className="bg-white/60 rounded px-2 py-1">{c}</span>
              ))}
            </div>
            <button
              onClick={copyRecovery}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 hover:text-amber-900"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'คัดลอกแล้ว' : 'คัดลอกทั้งหมด'}
            </button>
          </div>
          <button
            onClick={() => onComplete?.(dest)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-bold text-sm text-primary-foreground bg-primary hover:bg-primary/90 transition-colors"
          >
            {completeLabel}
          </button>
        </div>
      )}
    </div>
  );
}
