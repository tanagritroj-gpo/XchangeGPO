'use client';
import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { loginStaffAction } from '@/app/actions/auth-staff';

export default function HomePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'customer' | 'staff'>('customer');
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [isOtpStep, setIsOtpStep] = useState(false); // State คุมขั้นตอน OTP

  // --- เพิ่ม State สำหรับเก็บข้อมูล ---
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [empId, setEmpId] = useState('');
  const [password, setPassword] = useState('');

  const isCustomer = activeTab === 'customer';

  const handleLogin = async () => {
    // --- Logic ลูกค้า ---
    if (isCustomer) {
      if (!isOtpStep) {
        if (email && email.includes('@')) {
          setIsOtpStep(true);
        } else {
          alert("กรุณากรอกอีเมลให้ถูกต้อง");
        }
      } else {
        setLoadingLogin(true);
        // จำลองการตรวจสอบ OTP
        setTimeout(() => {
          setLoadingLogin(false);
          setIsOtpStep(false);
          alert("ยืนยัน OTP เรียบร้อย");
        }, 1500);
      }
      return;
    }

    // --- Logic พนักงาน ---
    setLoadingLogin(true);
    try {
      const result = await loginStaffAction({ username: empId, password });
      if (result.success) {
        router.push(result.role === 'manager' ? '/admin/manager/staff-approvals' : '/dashboard/staff');
      } else {
        alert(result.error || "เข้าสู่ระบบไม่สำเร็จ");
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setLoadingLogin(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f0f4f8' }}>

      {/* ===== SECTION 2+3 : GRAPHIC + AUTH ===== */}
      <div className="flex flex-col md:flex-row flex-1 w-full px-4 md:px-16 py-8 gap-4">

        {/* ── LEFT: GPO Graphic (เต็มกรอบ) ── */}
        <div className="relative w-full aspect-[4/3] rounded-[2rem] overflow-hidden">
          <Image
            src="/gpo-xchange-graphic2.png"
            alt="GPO Xchange Graphic"
            fill
            sizes="(max-width: 768px) 100vw, 50vw" 
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 z-10">
            <div className="absolute -top-10 -left-10 w-48 h-48 rounded-full opacity-30" style={{ background: 'radial-gradient(circle, #38b27a, transparent)' }} />
            <div className="absolute -bottom-10 -right-10 w-56 h-56 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #2d8cf0, transparent)' }} />
          </div>
        </div>

        {/* ── RIGHT: Glassmorphism Auth Panel ── */}
        <div
          className="md:w-1/2 relative flex flex-col justify-center px-6 py-8 rounded-[2rem] overflow-hidden border border-white/20 shadow-2xl"
          style={{ background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.95), rgba(6, 78, 59, 0.95))' }}
        >
          <div className="absolute inset-0 bg-white/5 backdrop-blur-[2px]" />

          <div className="relative mb-8 text-center space-y-2">
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight drop-shadow-md">
              GPO XCHANGE PORTAL
            </h1>
            <p className="text-teal-100/80 font-medium tracking-wider text-xs uppercase">องค์การเภสัชกรรม • สาขาภาคใต้</p>
          </div>

          <div className="relative flex gap-3 mb-6">
            <a href="/tracking" className="flex-1 group bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-3.5 text-center hover:bg-white/20 transition-all">
              <div className="text-2xl mb-1.5">🔍</div>
              <p className="text-white text-xs font-bold">ตรวจสอบสถานะ</p>
            </a>
            <a href="/manual" className="flex-1 group bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-3.5 text-center hover:bg-white/20 transition-all">
              <div className="text-2xl mb-1.5">📖</div>
              <p className="text-white text-xs font-bold">คู่มือการใช้งาน</p>
            </a>
          </div>

          <div className="relative bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl overflow-hidden border border-white/50">
            <div className="grid grid-cols-2 bg-white/50 border-b border-slate-200">
              {(['customer', 'staff'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setIsOtpStep(false); }}
                  className={`py-3.5 text-sm font-bold transition-all border-b-2 ${
                    activeTab === tab 
                      ? (tab === 'customer' ? 'text-teal-700 border-teal-500 bg-white' : 'text-blue-700 border-blue-500 bg-white') 
                      : 'text-slate-400 border-transparent hover:text-slate-600'
                  }`}
                >
                  <span className="block text-base mb-0.5">{tab === 'customer' ? '🏠' : '👨‍⚕️'}</span>
                  {tab === 'customer' ? 'ลูกค้า' : 'พนักงาน GPO'}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <div className={`w-1 h-4 rounded-full ${isCustomer ? 'bg-teal-500' : 'bg-blue-500'}`} /> 
                  {isCustomer && isOtpStep ? 'ยืนยันรหัส OTP (ลูกค้า)' : 'เข้าสู่ระบบ'}
                </h2>
                
                {isCustomer ? (
                  !isOtpStep ? (
                    <input 
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-400" 
                      placeholder="📧  อีเมล" 
                    />
                  ) : (
                    <input 
                      value={otp} 
                      onChange={(e) => setOtp(e.target.value)}
                      maxLength={6} 
                      className="w-full px-4 py-3 text-center tracking-[0.5em] text-lg rounded-xl border-2 border-teal-400 bg-teal-50 focus:outline-none" 
                      placeholder="0 0 0 0 0 0" 
                    />
                  )
                ) : (
                  <>
                    <input 
                      value={empId} 
                      onChange={(e) => setEmpId(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400" 
                      placeholder="🪪  รหัสพนักงาน" 
                    />
                    <input 
                      type="password" 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400" 
                      placeholder="🔑  รหัสผ่าน" 
                    />
                  </>
                )}

                <button onClick={handleLogin} disabled={loadingLogin} className={`w-full py-3 rounded-xl font-bold text-white text-sm shadow-md transition-all ${isCustomer ? 'bg-teal-700' : 'bg-blue-800'}`}>
                  {loadingLogin ? '⏳ กำลังดำเนินการ...' : (isCustomer && isOtpStep ? 'ยืนยันรหัสเข้าสู่ระบบ' : 'เข้าสู่ระบบ →')}
                </button>
                {isCustomer && isOtpStep && (
                  <button onClick={() => setIsOtpStep(false)} className="w-full text-xs text-slate-400 hover:text-slate-600 underline">ยกเลิก</button>
                )}
              </div>

              <div className="pt-6 border-t border-dashed border-slate-200">
                <h2 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-orange-400" /> ลงทะเบียนใช้งานครั้งแรก
                </h2>
                <button
                  onClick={() => window.location.href = isCustomer ? '/auth/customer-register' : '/auth/staff-register'}
                  className="w-full py-3 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-orange-400 to-orange-500 hover:from-orange-500 hover:to-orange-600 shadow-md transition-all active:scale-[0.98]"
                >
                  {isCustomer ? '✨ ลงทะเบียนลูกค้า' : '✨ ลงทะเบียนพนักงาน'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="w-full py-5 px-6 text-center text-slate-500 text-xs">
        © 2026 องค์การเภสัชกรรม • สาขาภาคใต้ &nbsp;|&nbsp; 🔒 PDPA Compliant &nbsp;|&nbsp; v2.0
      </footer>
    </div>
  );
}