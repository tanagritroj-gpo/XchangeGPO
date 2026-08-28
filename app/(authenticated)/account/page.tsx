'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserCog, KeyRound, Contact, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  getCustomerSession,
  updateCustomerPassword,
  updateCustomerContactInfo,
  getMyCustomerSessions,
  revokeCustomerSession,
  revokeOtherCustomerSessions,
} from '@/app/actions/auth-actions';
import { DeviceSessionCard } from '@/components/account/DeviceSessionCard';
import { PasswordInput } from '@/components/ui/password-input';
import { PasswordStrengthHint } from '@/components/ui/password-strength-hint';
import { MIN_PASSWORD_LENGTH, assertPasswordAllowed } from '@/lib/password-policy';
import type { CustomerSessionInfo } from '@/lib/types';

// หน้า "บัญชีผู้ใช้" ฝั่งลูกค้า — คู่ขนานกับ app/admin/account/page.tsx ของ staff บางส่วน
// (โครงฟอร์ม, การยืนยันตัวตนด้วยรหัสผ่านปัจจุบัน, audit log) แต่ปรับธีมเป็นของฝั่งลูกค้า
// (teal→emerald gradient, rounded-2xl/3xl, font-black) แทนธีม Option B ของ staff และมีฟอร์มที่
// 2 เพิ่ม (ข้อมูลติดต่อ) ที่ staff ไม่มี — ไม่ต้องมี layout guard แยกเหมือน admin/account/layout.tsx
// เพราะ app/(authenticated)/layout.tsx ครอบทุกหน้าในกลุ่มนี้ด้วย getCustomerSession() +
// <Sidebar>/<BottomNav> อยู่แล้ว ให้ลูกค้าเห็น nav ค้างอยู่ตอนกดเข้าหน้านี้เหมือนหน้าอื่นๆ
//
// ★ ไม่มีฟอร์มแก้อีเมล — ตั้งใจตัดออก (ผู้ใช้ตัดสินใจหลังคุยเรื่อง Sign in with Google: อีเมล
// ผูกกับการ login ผ่าน Google โดยตรง ให้แก้เองได้จะทำให้ Google Sign-In เดิมหลุด/มีช่องโหว่ด้าน
// ความปลอดภัยถ้าจะแก้ให้ทำงานต่อเนื่องได้ — ให้อีเมลเป็นค่าคงที่ แก้ได้เฉพาะผ่าน CSR ง่ายกว่า)
const inputStyle =
  'w-full px-4 py-3 rounded-xl bg-slate-50 text-slate-700 font-bold text-sm border-2 border-slate-100 focus:bg-white focus:border-teal-400 focus:ring-4 focus:ring-teal-50 outline-none transition-all duration-200';

const labelStyle = 'text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1.5';

const submitButtonStyle =
  'inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-teal-600 to-emerald-600 shadow-lg shadow-teal-500/20 transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-60 disabled:pointer-events-none disabled:hover:translate-y-0';

function FieldMessage({ error, success }: { error?: string; success?: string }) {
  if (error) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-bold text-red-500">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
      </p>
    );
  }
  if (success) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {success}
      </p>
    );
  }
  return null;
}

function FormCard({
  icon: Icon,
  title,
  subtitle,
  headerExtra,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: React.ReactNode;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border-2 border-teal-100 bg-white p-5 sm:p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)' }}>
            <Icon className="w-4.5 h-4.5 text-white" strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-slate-800">{title}</h2>
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          </div>
        </div>
        {headerExtra}
      </div>
      {children}
    </div>
  );
}

export default function CustomerAccountPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerSessionInfo | null>(null);

  useEffect(() => {
    getCustomerSession().then(setCustomer);
  }, []);

  // ── ฟอร์ม รหัสผ่าน ──
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
    const pw = assertPasswordAllowed(newPassword, { identifiers: [customer?.email ?? '', customer?.contact_name ?? ''] });
    if (!pw.ok) {
      setPasswordError(pw.error!);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setPasswordLoading(true);
    const res = await updateCustomerPassword(currentPassword, newPassword);
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

  // ── ฟอร์ม ข้อมูลติดต่อ ──
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState('');
  const [contactSuccess, setContactSuccess] = useState('');

  // ★ dep เป็น customer?.id ไม่ใช่ customer ทั้งก้อน — id ไม่เปลี่ยนตราบใดที่ยัง login เป็น
  // ลูกค้าคนเดิม effect นี้จึงรันแค่ครั้งแรกตอน session โหลดเสร็จ ถ้า dep เป็น customer เฉยๆ
  // การ setCustomer(...) ตอนฟอร์มข้อมูลติดต่อสำเร็จ (สร้าง object ใหม่) จะ trigger effect นี้ซ้ำ
  // รีเซ็ต contactName/phone/position ทับข้อมูลที่ผู้ใช้เพิ่งพิมพ์ค้างไว้โดยไม่ได้ตั้งใจ
  useEffect(() => {
    if (!customer) return;
    setContactName(customer.contact_name ?? '');
    setPhone(customer.phone ?? '');
    setPosition(customer.position ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  const submitContactInfo = async (e: FormEvent) => {
    e.preventDefault();
    setContactError('');
    setContactSuccess('');
    setContactLoading(true);
    const res = await updateCustomerContactInfo({ contact_name: contactName, phone, position });
    setContactLoading(false);
    if (res.success) {
      setCustomer((c) => (c ? { ...c, contact_name: contactName, phone, position } : c));
      setContactSuccess('บันทึกข้อมูลติดต่อสำเร็จ');
      // Sidebar แสดงชื่อผู้ติดต่อ/ตัวอักษรแรกของ avatar จาก getCustomerSession() ฝั่ง server
      // เอง (app/(authenticated)/layout.tsx) — ไม่ refresh จะเห็นชื่อเก่าค้างอยู่ใน Sidebar
      // ทั้งที่หน้านี้บันทึกสำเร็จแล้ว
      router.refresh();
    } else {
      setContactError(res.error || 'บันทึกข้อมูลติดต่อไม่สำเร็จ');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 px-1">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shrink-0 shadow-lg shadow-teal-200">
          <UserCog className="w-5 h-5 text-white" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="text-lg font-black text-slate-900">บัญชีผู้ใช้</h1>
          <p className="text-xs text-muted-foreground">แก้ไขรหัสผ่าน / ข้อมูลติดต่อของบัญชีคุณ</p>
        </div>
      </div>

      {/* รหัสผ่าน */}
      <form onSubmit={submitPassword}>
        <FormCard
          icon={KeyRound}
          title="เปลี่ยนรหัสผ่าน"
          subtitle="อุปกรณ์อื่นที่ login ค้างไว้จะถูกออกจากระบบอัตโนมัติหลังเปลี่ยนสำเร็จ"
          headerExtra={
            <Link href="/auth/customer-forgot-password" className="shrink-0 text-xs font-bold text-teal-600 hover:underline whitespace-nowrap">
              ลืมรหัสผ่านปัจจุบัน?
            </Link>
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelStyle}>รหัสผ่านปัจจุบัน</label>
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className={inputStyle}
                placeholder="รหัสผ่านปัจจุบัน"
              />
            </div>
            <div>
              <label className={labelStyle}>รหัสผ่านใหม่</label>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                className={inputStyle}
                placeholder="อย่างน้อย 12 ตัวอักษร"
              />
              <PasswordStrengthHint value={newPassword} identifiers={[customer?.email ?? '', customer?.contact_name ?? '']} />
            </div>
            <div>
              <label className={labelStyle}>ยืนยันรหัสผ่านใหม่</label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className={inputStyle}
                placeholder="พิมพ์อีกครั้ง"
              />
            </div>
          </div>
          <FieldMessage error={passwordError} success={passwordSuccess} />
          <button type="submit" disabled={passwordLoading} className={submitButtonStyle}>
            {passwordLoading && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />} บันทึกรหัสผ่านใหม่
          </button>
        </FormCard>
      </form>

      {/* ข้อมูลติดต่อ */}
      <form onSubmit={submitContactInfo}>
        <FormCard icon={Contact} title="ข้อมูลติดต่อ" subtitle="ชื่อ/เบอร์โทร/ตำแหน่งของคุณ — ไม่ต้องยืนยันรหัสผ่าน">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelStyle}>ชื่อผู้ติดต่อ</label>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
                maxLength={100}
                className={inputStyle}
                placeholder="ชื่อ-นามสกุล"
              />
            </div>
            <div>
              <label className={labelStyle}>เบอร์โทร</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className={inputStyle}
                placeholder="0812345678"
              />
            </div>
            <div>
              <label className={labelStyle}>ตำแหน่ง</label>
              <input
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                required
                maxLength={100}
                className={inputStyle}
                placeholder="ตำแหน่งงาน"
              />
            </div>
          </div>
          <FieldMessage error={contactError} success={contactSuccess} />
          <button type="submit" disabled={contactLoading} className={submitButtonStyle}>
            {contactLoading && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />} บันทึกข้อมูลติดต่อ
          </button>
        </FormCard>
      </form>

      <DeviceSessionCard
        load={getMyCustomerSessions}
        revokeSession={revokeCustomerSession}
        revokeOthers={revokeOtherCustomerSessions}
      />
    </div>
  );
}
