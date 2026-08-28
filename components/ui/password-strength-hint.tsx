'use client';

import { CheckCircle2, AlertCircle } from 'lucide-react';
import { MIN_PASSWORD_LENGTH, assertPasswordAllowed, assessPasswordStrength } from '@/lib/password-policy';

/**
 * แถบบอกเงื่อนไข + ความแข็งแรงของรหัสผ่านใหม่ (client-side ล้วน ไม่เรียก network)
 * ใช้ใต้ช่องกรอกรหัสผ่านทุกจุดที่ "ตั้งรหัสผ่านใหม่" (สมัคร / รีเซ็ต / เปลี่ยน)
 * — การตรวจ HaveIBeenPwned ทำที่ server ตอน submit (ดู lib/password-policy.ts)
 */
export function PasswordStrengthHint({ value, identifiers }: { value: string; identifiers?: string[] }) {
  if (!value) {
    return (
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        อย่างน้อย {MIN_PASSWORD_LENGTH} ตัวอักษร — แนะนำใช้วลีที่จำได้ 3–4 คำ
      </p>
    );
  }

  const check = assertPasswordAllowed(value, identifiers ? { identifiers } : undefined);
  const strength = assessPasswordStrength(value);

  const barColor = ['bg-red-400', 'bg-red-400', 'bg-amber-400', 'bg-emerald-400', 'bg-emerald-500'][strength.score];

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i < strength.score ? barColor : 'bg-slate-200 dark:bg-slate-700'}`}
          />
        ))}
      </div>
      <p className={`flex items-center gap-1 text-xs ${check.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
        {check.ok ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <AlertCircle className="h-3 w-3 shrink-0" />}
        {check.ok ? `ความแข็งแรง: ${strength.label}` : check.error}
      </p>
      {check.ok && strength.hint && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{strength.hint}</p>
      )}
    </div>
  );
}
