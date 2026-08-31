'use client'

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LogOut, UserCog, AtSign, KeyRound, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  getStaffSession,
  logoutStaffAction,
  updateStaffUsername,
  updateStaffEmail,
  updateStaffPassword,
} from '@/app/actions/auth-staff';
import { PasswordInput } from '@/components/ui/password-input';
import { PasswordStrengthHint } from '@/components/ui/password-strength-hint';
import { MfaAccountCard } from '@/components/mfa/MfaAccountCard';
import { DeviceSessionCard } from '@/components/account/DeviceSessionCard';
import {
  getMyStaffSessionsAndDevices,
  revokeStaffSession,
  revokeOtherStaffSessions,
  revokeStaffTrustedDevice,
} from '@/app/actions/auth-staff';
import { MIN_PASSWORD_LENGTH, assertPasswordAllowed } from '@/lib/password-policy';
import type { StaffSessionInfo } from '@/lib/types';

// หน้ากลาง "จัดการบัญชี" ใช้ร่วมกันทุกแผนก (ไม่ผูกกับ zone ไหนโดยเฉพาะ) — เข้าถึงได้จากการ์ด
// "บัญชีผู้ใช้" ในแต่ละ hub — โครง topbar ตาม pattern "หน้าย่อยไม่ใช่ hub" ของ Sale/Manager
// (bar เดียว back+logout ไม่ sticky) · ความกว้างเนื้อหา max-w-6xl เท่ากับหน้า /admin/* อื่น ๆ
// (topbar ก็ max-w-6xl อยู่แล้ว) — ฟอร์มสั้น ๆ วางเป็น grid 2 คอลัมน์บนจอใหญ่กันหน้าโล่ง
const DEPT_HOME: Record<string, string> = {
  manager: '/admin/manager',
  csr: '/admin/csr',
  log: '/admin/logistics/dashboard',
  wh: '/admin/wh/dashboard',
  sale: '/admin/sale',
};

const inputStyle =
  'w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors';

function FieldMessage({ error, success }: { error?: string; success?: string }) {
  if (error) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
      </p>
    );
  }
  if (success) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {success}
      </p>
    );
  }
  return null;
}

export default function AccountSettingsPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffSessionInfo | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    getStaffSession().then(setStaff);
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutStaffAction();
    router.push('/');
  };

  // ── ฟอร์ม Username ──
  const [newUsername, setNewUsername] = useState('');
  const [usernamePassword, setUsernamePassword] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [usernameSuccess, setUsernameSuccess] = useState('');

  const submitUsername = async (e: FormEvent) => {
    e.preventDefault();
    setUsernameError('');
    setUsernameSuccess('');
    setUsernameLoading(true);
    const res = await updateStaffUsername(usernamePassword, newUsername);
    setUsernameLoading(false);
    if (res.success) {
      setStaff((s) => (s ? { ...s, username: newUsername.trim() } : s));
      setUsernameSuccess('เปลี่ยน Username สำเร็จ');
      setNewUsername('');
      setUsernamePassword('');
    } else {
      setUsernameError(res.error || 'เปลี่ยน Username ไม่สำเร็จ');
    }
  };

  // ── ฟอร์ม อีเมล ──
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');
    setEmailLoading(true);
    const res = await updateStaffEmail(emailPassword, newEmail);
    setEmailLoading(false);
    if (res.success) {
      setStaff((s) => (s ? { ...s, email: newEmail.trim() } : s));
      setEmailSuccess('เปลี่ยนอีเมลสำเร็จ');
      setNewEmail('');
      setEmailPassword('');
    } else {
      setEmailError(res.error || 'เปลี่ยนอีเมลไม่สำเร็จ');
    }
  };

  // ── ฟอร์ม รหัสผ่าน (รู้รหัสเดิม) ──
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    const pw = assertPasswordAllowed(newPassword, { identifiers: [staff?.username ?? '', staff?.email ?? ''] });
    if (!pw.ok) {
      setPasswordError(pw.error!);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setPasswordLoading(true);
    const res = await updateStaffPassword(currentPassword, newPassword);
    setPasswordLoading(false);
    if (res.success) {
      setPasswordSuccess('เปลี่ยนรหัสผ่านสำเร็จ — อุปกรณ์อื่นที่ login ค้างไว้ถูกออกจากระบบอัตโนมัติ');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPasswordError(res.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
    }
  };

  const backHref = staff ? DEPT_HOME[staff.department] || '/' : '/';

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto w-full px-4 md:px-6 pt-6">
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-card border border-border">
          <Link href={backHref} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" /> ย้อนกลับ
          </Link>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary border border-border px-4 py-2.5 rounded-md transition-colors disabled:opacity-60 disabled:pointer-events-none"
          >
            {isLoggingOut ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
            ออกจากระบบ
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full px-4 md:px-6 py-6 md:py-10 space-y-6">
        <div className="flex items-center gap-3 px-1">
          <div className="w-10 h-10 rounded-md bg-accent text-accent-foreground shadow-sm shadow-accent/40 flex items-center justify-center shrink-0">
            <UserCog size={19} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">จัดการบัญชี</h1>
            <p className="text-xs text-muted-foreground">แก้ไข Username / อีเมล / รหัสผ่านของบัญชีคุณ</p>
          </div>
        </div>

        {/* ฟอร์มสั้น (Username/อีเมล) วางคู่กันบนจอใหญ่ · ฟอร์มรหัสผ่าน + MFA + อุปกรณ์ เต็มความกว้าง */}
        <div className="grid gap-6 lg:grid-cols-2 items-start">
        {/* Username */}
        <form onSubmit={submitUsername} className="rounded-lg bg-card border border-border p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md flex items-center justify-center bg-accent text-accent-foreground shrink-0">
              <UserCog className="w-4 h-4" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground">เปลี่ยน Username</h2>
              <p className="text-xs text-muted-foreground">
                ปัจจุบัน: <span className="font-mono font-semibold text-foreground">@{staff?.username ?? '—'}</span>
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Username ใหม่</label>
              <input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                required
                minLength={3}
                maxLength={50}
                className={inputStyle}
                placeholder="username ใหม่"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">รหัสผ่านปัจจุบัน (ยืนยันตัวตน)</label>
              <PasswordInput
                value={usernamePassword}
                onChange={(e) => setUsernamePassword(e.target.value)}
                required
                className={inputStyle}
                placeholder="รหัสผ่านปัจจุบัน"
              />
            </div>
          </div>
          <FieldMessage error={usernameError} success={usernameSuccess} />
          <button
            type="submit"
            disabled={usernameLoading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-bold text-sm text-primary-foreground bg-primary hover:bg-primary/90 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {usernameLoading && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />} บันทึก Username ใหม่
          </button>
        </form>

        {/* อีเมล */}
        <form onSubmit={submitEmail} className="rounded-lg bg-card border border-border p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md flex items-center justify-center bg-accent text-accent-foreground shrink-0">
              <AtSign className="w-4 h-4" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground">เปลี่ยนอีเมล</h2>
              <p className="text-xs text-muted-foreground truncate">
                ปัจจุบัน: <span className="font-semibold text-foreground">{staff?.email ?? '—'}</span> — ใช้รับ OTP ตอน &quot;ลืมรหัสผ่าน&quot; ด้วย
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">อีเมลใหม่</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                className={inputStyle}
                placeholder="name@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">รหัสผ่านปัจจุบัน (ยืนยันตัวตน)</label>
              <PasswordInput
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                required
                className={inputStyle}
                placeholder="รหัสผ่านปัจจุบัน"
              />
            </div>
          </div>
          <FieldMessage error={emailError} success={emailSuccess} />
          <button
            type="submit"
            disabled={emailLoading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-bold text-sm text-primary-foreground bg-primary hover:bg-primary/90 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {emailLoading && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />} บันทึกอีเมลใหม่
          </button>
        </form>

        {/* รหัสผ่าน */}
        <form onSubmit={submitPassword} className="rounded-lg bg-card border border-border p-6 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-md flex items-center justify-center bg-accent text-accent-foreground shrink-0">
                <KeyRound className="w-4 h-4" strokeWidth={2.25} />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-foreground">เปลี่ยนรหัสผ่าน</h2>
                <p className="text-xs text-muted-foreground">อุปกรณ์อื่นที่ login ค้างไว้จะถูกออกจากระบบอัตโนมัติหลังเปลี่ยนสำเร็จ</p>
              </div>
            </div>
            <Link href="/auth/staff-forgot-password" className="shrink-0 text-xs font-semibold text-primary hover:underline whitespace-nowrap">
              ลืมรหัสผ่านปัจจุบัน?
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">รหัสผ่านปัจจุบัน</label>
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className={inputStyle}
                placeholder="รหัสผ่านปัจจุบัน"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">รหัสผ่านใหม่</label>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                className={inputStyle}
                placeholder="อย่างน้อย 12 ตัวอักษร"
              />
              <PasswordStrengthHint value={newPassword} identifiers={[staff?.username ?? '', staff?.email ?? '']} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ยืนยันรหัสผ่านใหม่</label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                className={inputStyle}
                placeholder="พิมพ์อีกครั้ง"
              />
            </div>
          </div>
          <FieldMessage error={passwordError} success={passwordSuccess} />
          <button
            type="submit"
            disabled={passwordLoading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-bold text-sm text-primary-foreground bg-primary hover:bg-primary/90 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {passwordLoading && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />} บันทึกรหัสผ่านใหม่
          </button>
        </form>

        {/* MFA */}
        <div className="lg:col-span-2">
          <MfaAccountCard />
        </div>

        {/* อุปกรณ์และเซสชัน */}
        <div className="lg:col-span-2">
          <DeviceSessionCard
            load={getMyStaffSessionsAndDevices}
            revokeSession={revokeStaffSession}
            revokeOthers={revokeOtherStaffSessions}
            revokeDevice={revokeStaffTrustedDevice}
          />
        </div>
        </div>
      </div>
    </div>
  );
}
