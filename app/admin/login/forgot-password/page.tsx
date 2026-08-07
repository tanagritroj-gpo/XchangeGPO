'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { requestStaffPasswordReset, resetStaffPassword } from '@/app/actions/auth-staff';

// ── 2 ขั้นตอน: (1) กรอก username เพื่อขอ OTP (2) กรอก OTP + ตั้งรหัสผ่านใหม่ —
// ขั้น 1 ตอบสำเร็จเสมอไม่ว่าจะเจอ username จริงไหม กัน enumeration (ดู
// requestStaffPasswordReset ใน auth-staff.ts) จึงพาไปขั้น 2 ต่อได้เลยทุกครั้ง
//
// Layout คุมโทนเดียวกับหน้าลงทะเบียนพนักงาน (app/auth/staff-register/page.tsx) — ฝั่งซ้าย
// แบรนด์ดิ้ง+รายการขั้นตอน ฝั่งขวาการ์ดฟอร์ม ใช้สีน้ำเงินแทนส้ม (ส้ม = "สมัครใหม่" ในหน้า
// register, น้ำเงิน = โทนของแท็บ "พนักงาน GPO" ให้สื่อว่าเป็น flow ของพนักงานที่มีบัญชีอยู่แล้ว)
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [username, setUsername] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const res = await requestStaffPasswordReset(username);
    setIsLoading(false);
    if (res.success) {
      setStep(2);
    } else {
      setError(res.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setIsLoading(true);
    const res = await resetStaffPassword(username, otp, newPassword);
    setIsLoading(false);
    if (res.success) {
      setStep(3);
    } else {
      setError(res.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    }
  };

  const inputStyle = "w-full px-5 py-3.5 rounded-xl border border-slate-300 bg-white text-foreground placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all";

  const stepTitle = step === 1 ? 'กรอก Username' : step === 2 ? 'ยืนยัน OTP' : 'สำเร็จแล้ว';

  return (
    <main className="min-h-screen pt-8 pb-10 px-4 md:pt-16 md:pb-20 md:px-12 relative overflow-hidden bg-background">
      {/* พื้นผิวจุดจางๆ สีน้ำเงิน */}
      <div
        className="absolute top-0 left-0 w-full h-full opacity-[0.05]"
        style={{ backgroundImage: 'radial-gradient(#2563eb 1px, transparent 1px)', backgroundSize: '30px 30px' }}
      />

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-16 z-10 relative">

        {/* ฝั่งซ้าย: Branding & Steps */}
        <div className="md:col-span-5 space-y-6 md:space-y-10 pt-0 md:pt-10">
          <div className="space-y-4">
            <div className="w-12 h-1.5 bg-blue-600 rounded-full" />
            <h1 className="text-3xl md:text-5xl font-extrabold text-foreground tracking-tighter leading-[1.1]">
              GPO Staff <br />
              <span className="text-blue-600">Password Recovery</span>
            </h1>
            <p className="text-sm md:text-lg text-slate-600 font-medium">
              ระบบตั้งรหัสผ่านใหม่สำหรับพนักงาน GPO ยืนยันตัวตนผ่านรหัส OTP ที่ส่งไปยังอีเมลที่ผูกไว้กับบัญชี
            </p>
          </div>

          <div className="space-y-4 md:space-y-6 pt-2 md:pt-4">
            <h3 className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest">ขั้นตอนการกู้คืนรหัสผ่าน</h3>
            {[
              { title: "กรอก Username ของบัญชีพนักงาน", icon: "🪪" },
              { title: "รับรหัส OTP 6 หลักทางอีเมล (อายุ 5 นาที)", icon: "📧" },
              { title: "ตั้งรหัสผ่านใหม่", icon: "🔑" },
              { title: "เข้าสู่ระบบด้วยรหัสผ่านใหม่ได้ทันที", icon: "✅" },
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="text-xl mt-0.5">{s.icon}</div>
                <p className="text-sm md:text-base font-semibold leading-snug text-blue-700">{s.title}</p>
              </div>
            ))}
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-blue-700 transition-colors"
          >
            🏠 กลับหน้าหลัก
          </Link>
        </div>

        {/* ฝั่งขวา: ฟอร์ม */}
        <div className="md:col-span-7 w-full relative">
          {/* แสงฟุ้งสีน้ำเงินผสมเขียว */}
          <div className="absolute -inset-2 md:-inset-4 bg-gradient-to-tr from-blue-400/20 to-teal-500/20 rounded-[2rem] md:rounded-[2.5rem] blur-xl" />

          <div className="relative bg-white/80 backdrop-blur-xl rounded-[2rem] md:rounded-[2.5rem] border border-white/50 shadow-2xl overflow-hidden">
            <div className="w-full flex flex-col p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-800 flex items-center justify-center text-xl shadow-lg shadow-blue-800/20 shrink-0">
                  🔐
                </div>
                <div>
                  <h2 className="text-xl font-black text-foreground leading-tight">{stepTitle}</h2>
                  {step !== 3 && (
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">ขั้นตอนที่ {step} จาก 2</p>
                  )}
                </div>
              </div>

              {step === 1 && (
                <>
                  <p className="text-sm text-muted-foreground mb-6">
                    กรอก Username ของท่าน ระบบจะส่งรหัส OTP ไปยังอีเมลที่ผูกไว้กับบัญชีนี้
                  </p>
                  <form onSubmit={handleRequestOtp} className="space-y-4">
                    {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
                    <input
                      type="text"
                      placeholder="🪪  Username"
                      className={inputStyle}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3.5 rounded-xl font-bold text-white text-sm bg-blue-800 shadow-md shadow-blue-800/20 hover:bg-blue-900 transition disabled:opacity-50"
                    >
                      {isLoading ? '⏳ กำลังส่งรหัส...' : 'ส่งรหัส OTP →'}
                    </button>
                  </form>
                </>
              )}

              {step === 2 && (
                <>
                  <p className="text-sm text-muted-foreground mb-6">
                    หากมีอีเมลผูกไว้กับบัญชีนี้ ท่านจะได้รับรหัส OTP 6 หลัก (อายุ 5 นาที) กรอกพร้อมตั้งรหัสผ่านใหม่ด้านล่าง
                  </p>
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0 0 0 0 0 0"
                      className={`${inputStyle} text-center tracking-[0.5em] text-lg border-2 border-blue-300 bg-blue-50/50`}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      required
                    />
                    <input
                      type="password"
                      placeholder="🔑  รหัสผ่านใหม่"
                      className={inputStyle}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                    <input
                      type="password"
                      placeholder="🔑  ยืนยันรหัสผ่านใหม่"
                      className={inputStyle}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3.5 rounded-xl font-bold text-white text-sm bg-blue-800 shadow-md shadow-blue-800/20 hover:bg-blue-900 transition disabled:opacity-50"
                    >
                      {isLoading ? '⏳ กำลังตั้งรหัสผ่านใหม่...' : 'ตั้งรหัสผ่านใหม่'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setStep(1); setError(''); }}
                      className="w-full text-xs font-semibold text-muted-foreground hover:text-blue-700 transition-colors"
                    >
                      ← ขอรหัส OTP ใหม่
                    </button>
                  </form>
                </>
              )}

              {step === 3 && (
                <div>
                  <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center text-3xl mb-4">
                    ✅
                  </div>
                  <p className="text-sm text-muted-foreground mb-6">
                    ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่
                    (บัญชีนี้จะถูกออกจากระบบทุกอุปกรณ์ที่เคยล็อกอินค้างไว้)
                  </p>
                  <button
                    onClick={() => router.push('/admin/login')}
                    className="w-full py-3.5 rounded-xl font-bold text-white text-sm bg-blue-800 shadow-md shadow-blue-800/20 hover:bg-blue-900 transition"
                  >
                    กลับไปเข้าสู่ระบบ
                  </button>
                </div>
              )}

              {step !== 3 && (
                <div className="mt-6 pt-5 border-t border-dashed border-border text-center">
                  <button
                    type="button"
                    onClick={() => router.push('/admin/login')}
                    className="text-xs font-semibold text-muted-foreground hover:text-blue-700 transition-colors"
                  >
                    ← กลับไปเข้าสู่ระบบ
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Footer เหมือนหน้าลงทะเบียนพนักงาน */}
      <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-slate-200 text-center relative z-10">
        <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-widest font-bold">
          องค์การเภสัชกรรม สาขาภาคใต้
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">
          © 2026 Government Pharmaceutical Organization. All rights reserved.
        </p>
      </div>
    </main>
  );
}
