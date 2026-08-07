'use client';
import { Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import { Building2, User, Search, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginWithGoogle } from '@/app/actions/auth-google';
import { loginStaffAction } from '@/app/actions/auth-staff';
import { sendOTP, verifyOTP } from '@/app/actions/auth-actions';

const GOOGLE_LOGIN_ERRORS: Record<string, string> = {
  'auth-failed': 'เชื่อมต่อกับ Google ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
  'google-not-registered':
    'ไม่พบบัญชีลูกค้าที่ผูกกับอีเมล Google นี้ กรุณาเข้าสู่ระบบด้วย OTP หรือลงทะเบียนก่อน',
};

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageContent />
    </Suspense>
  );
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get('error');
    if (error && GOOGLE_LOGIN_ERRORS[error]) {
      alert(GOOGLE_LOGIN_ERRORS[error]);
      router.replace('/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [activeTab, setActiveTab] = useState<'customer' | 'staff'>('customer');
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [isOtpStep, setIsOtpStep] = useState(false);

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [empId, setEmpId] = useState('');
  const [password, setPassword] = useState('');

  const isCustomer = activeTab === 'customer';

  const coverImages = [
    { src: '/gpo-xchange-graphic2.png', alt: 'GPO Xchange Graphic' },
    { src: '/coverpage3.png', alt: 'GPO Xchange Portal Cover' },
  ];
  const [coverIndex, setCoverIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCoverIndex((prev) => (prev + 1) % coverImages.length);
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToPrevCover = () => {
    setCoverIndex((prev) => (prev - 1 + coverImages.length) % coverImages.length);
  };
  const goToNextCover = () => {
    setCoverIndex((prev) => (prev + 1) % coverImages.length);
  };

  const handleGoogleLogin = async () => {
    setLoadingLogin(true);
    try {
      const res = await loginWithGoogle();
      if (res.success) {
        window.location.href = res.url;
      } else {
        alert(res.error);
        setLoadingLogin(false);
      }
    } catch (err) {
      alert('เชื่อมต่อ Google ไม่สำเร็จ กรุณาลองใหม่');
      setLoadingLogin(false);
    }
  };

  const handleLogin = async () => {
    setLoadingLogin(true);
    try {
      if (isCustomer) {
        if (!isOtpStep) {
          const res = await sendOTP(email);
          if (res.success) {
            setIsOtpStep(true);
            alert("ส่งรหัสยืนยันไปยังอีเมลของท่านแล้วครับ");
          } else {
            alert(res.error || "เกิดข้อผิดพลาดในการส่ง OTP");
          }
        } else {
          const res = await verifyOTP(email, otp);
          if (res.success) {
            alert("ยืนยันตัวตนสำเร็จ!");
            router.push('/welcome');
          } else {
            alert("รหัส OTP ไม่ถูกต้องหรือหมดอายุ");
          }
        }
        return;
      }

      const result = await loginStaffAction({ username: empId, password });
      if (result.success) {
        const deptRoutes: Record<string, string> = {
          'manager': '/admin/manager',
          'csr': '/admin/csr',
          'log': '/admin/logistics/dashboard',
          'wh': '/admin/wh/dashboard',
          'sale': '/admin/sale'
        };

        const destination = deptRoutes[result.department] || '/dashboard';
        router.push(destination);
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
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex flex-col md:flex-row flex-1 w-full px-4 md:px-16 py-8 gap-4">

        {/* ── LEFT: GPO Graphic ── */}
        <div className="group relative w-full aspect-[3/2] rounded-[2rem] overflow-hidden bg-white">
          {coverImages.map((img, idx) => (
            <Image
              key={img.src}
              src={img.src}
              sizes="(max-width: 768px) 100vw, 50vw"
              alt={img.alt}
              fill
              className={`object-contain transition-opacity duration-700 ${idx === coverIndex ? 'opacity-100' : 'opacity-0'}`}
              priority={idx === 0}
            />
          ))}
          <div className="absolute inset-0 z-10 pointer-events-none">
            <div className="absolute -top-10 -left-10 w-48 h-48 rounded-full opacity-30" style={{ background: 'radial-gradient(circle, #38b27a, transparent)' }} />
            <div className="absolute -bottom-10 -right-10 w-56 h-56 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #2d8cf0, transparent)' }} />
          </div>

          {/* Arrow controls */}
          <button
            type="button"
            onClick={goToPrevCover}
            aria-label="Previous cover image"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-9 h-9 rounded-full bg-black/30 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/50"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={goToNextCover}
            aria-label="Next cover image"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-9 h-9 rounded-full bg-black/30 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/50"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Dots */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
            {coverImages.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCoverIndex(idx)}
                aria-label={`Go to cover image ${idx + 1}`}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${idx === coverIndex ? 'bg-white' : 'bg-white/40'}`}
              />
            ))}
          </div>
        </div>

        {/* ── RIGHT: Auth Panel ── */}
        <div
          className="md:w-1/2 relative flex flex-col justify-center px-6 py-8 rounded-[2rem] overflow-hidden border border-white/20 shadow-2xl"
          style={{ background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.95), rgba(6, 78, 59, 0.95))' }}
        >
          <div className="absolute inset-0 bg-white/5 backdrop-blur-[2px]" />

          <div className="relative mb-8 text-center space-y-2">
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight drop-shadow-md">
              GPO XCHANGE PORTAL
            </h1>
            <p className="text-teal-100/80 font-medium tracking-wider text-xs uppercase">ระบบรับคืนและแลกเปลี่ยนสินค้า องค์การเภสัชกรรม </p>
          </div>

          <div className="relative flex gap-3 mb-6">
            <a href="/tracking" className="flex-1 group bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-3.5 text-center hover:bg-white/20 transition-all flex flex-col items-center">
              <Search size={24} className="text-white mb-1.5" />
              <p className="text-white text-xs font-bold">ตรวจสอบสถานะ</p>
            </a>
            <a href="/guide" className="flex-1 group bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-3.5 text-center hover:bg-white/20 transition-all flex flex-col items-center">
              <BookOpen size={24} className="text-white mb-1.5" />
              <p className="text-white text-xs font-bold">คู่มือการใช้งาน</p>
            </a>
          </div>

          <div className="relative bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl overflow-hidden border border-white/50">
            <div className="grid grid-cols-2 bg-white/50 border-b border-border">
              {(['customer', 'staff'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setIsOtpStep(false); }}
                  className={`py-3.5 text-sm font-bold transition-all border-b-2 flex flex-col items-center justify-center ${
                    activeTab === tab
                      ? (tab === 'customer' ? 'text-teal-700 border-teal-500 bg-white' : 'text-blue-700 border-blue-500 bg-white')
                      : 'text-muted-foreground border-transparent hover:text-foreground'
                  }`}
                >
                  <span className="block mb-0.5">
                    {tab === 'customer' ? <Building2 size={20} /> : <User size={20} />}
                  </span>
                  {tab === 'customer' ? 'ลูกค้า' : 'พนักงาน GPO'}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-6">
              {/* ทั้ง 3 สถานะ (ลูกค้า-กรอกอีเมล / ลูกค้า-ยืนยัน OTP / พนักงาน) mount พร้อมกันเสมอ
                  ซ้อนกันในเซลล์ grid เดียว (col-start-1 row-start-1) — grid จะปรับความสูงตาม
                  เนื้อหาที่ "สูงที่สุด" อัตโนมัติ ไม่ต้องเดา/ตั้งค่า min-height เป็นตัวเลขตายตัว
                  (แบบเดิมทำให้เผื่อพื้นที่เกินจริงจนเห็นเป็นช่องว่าง) ตัวที่ไม่ active ใช้ invisible
                  (ไม่ใช่ hidden) เพื่อให้ยังกินพื้นที่แต่กดไม่ได้/มองไม่เห็น */}
              <div className="grid">
                <div className={`col-start-1 row-start-1 space-y-4 ${isCustomer && !isOtpStep ? '' : 'invisible pointer-events-none'}`} aria-hidden={!(isCustomer && !isOtpStep)}>
                  <h2 className="text-sm font-black text-foreground flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-teal-500" />
                    เข้าสู่ระบบ
                  </h2>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border text-sm focus:outline-none focus:border-teal-400"
                    placeholder="📧  อีเมล"
                    tabIndex={isCustomer && !isOtpStep ? undefined : -1}
                  />
                  <button onClick={handleLogin} disabled={loadingLogin} className="w-full py-3 rounded-xl font-bold text-white text-sm bg-teal-700 shadow-md transition">
                    {loadingLogin ? '⏳ กำลังดำเนินการ...' : 'เข้าสู่ระบบ →'}
                  </button>
                  <div className="space-y-3">
                    <div className="relative flex items-center">
                      <div className="flex-grow border-t border-border"></div>
                      <span className="flex-shrink mx-4 text-muted-foreground text-[10px] uppercase">หรือ</span>
                      <div className="flex-grow border-t border-border"></div>
                    </div>
                    <button
                      onClick={handleGoogleLogin}
                      disabled={loadingLogin}
                      className="mx-auto flex items-center justify-center transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {/* ★ ใช้ width/height ตรงๆ แทน fill — fill ต้องพึ่งกล่องแม่
                          คำนวณขนาดถูกต้องก่อนเสมอ ถ้า CSS โหลดช้า/พังจะกลายเป็นล่องหน
                          ไปเลย (กล่องสูง 0) ส่วน width/height ทำให้ตัว <img> มีขนาด
                          จริงในตัวเองเสมอ ไม่ขึ้นกับ CSS ของกล่องแม่เลย */}
                      <Image
                        src="/web_light_rd_SI@2x.png"
                        alt="Sign in with Google"
                        width={116}
                        height={26}
                        className="h-[32px] w-auto"
                      />
                    </button>
                  </div>
                </div>

                <div className={`col-start-1 row-start-1 space-y-4 ${isCustomer && isOtpStep ? '' : 'invisible pointer-events-none'}`} aria-hidden={!(isCustomer && isOtpStep)}>
                  <h2 className="text-sm font-black text-foreground flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-teal-500" />
                    ยืนยันรหัส OTP (ลูกค้า)
                  </h2>
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                    maxLength={6}
                    className="w-full px-4 py-3 text-center tracking-[0.5em] text-lg rounded-xl border-2 border-teal-400 bg-teal-50 focus:outline-none"
                    placeholder="0 0 0 0 0 0"
                    tabIndex={isCustomer && isOtpStep ? undefined : -1}
                  />
                  <button onClick={handleLogin} disabled={loadingLogin} className="w-full py-3 rounded-xl font-bold text-white text-sm bg-teal-700 shadow-md transition">
                    ยืนยันรหัสเข้าสู่ระบบ
                  </button>
                  <button onClick={() => setIsOtpStep(false)} className="w-full text-xs text-muted-foreground hover:text-foreground underline">ยกเลิก</button>
                </div>

                <div className={`col-start-1 row-start-1 space-y-4 ${!isCustomer ? '' : 'invisible pointer-events-none'}`} aria-hidden={isCustomer}>
                  <h2 className="text-sm font-black text-foreground flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-blue-500" />
                    เข้าสู่ระบบ
                  </h2>
                  <input
                    value={empId}
                    onChange={(e) => setEmpId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border text-sm focus:outline-none focus:border-blue-400"
                    placeholder="🪪  รหัสพนักงาน"
                    tabIndex={!isCustomer ? undefined : -1}
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border text-sm focus:outline-none focus:border-blue-400"
                    placeholder="🔑  รหัสผ่าน"
                    tabIndex={!isCustomer ? undefined : -1}
                  />
                  <button onClick={handleLogin} disabled={loadingLogin} className="w-full py-3 rounded-xl font-bold text-white text-sm bg-blue-800 shadow-md transition">
                    {loadingLogin ? '⏳ กำลังดำเนินการ...' : 'เข้าสู่ระบบ →'}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/admin/login/forgot-password')}
                    className="w-full py-2.5 rounded-xl font-bold text-blue-800 text-xs border border-blue-200 bg-blue-50 hover:bg-blue-100 transition"
                  >
                    ลืมรหัสผ่าน?
                  </button>
                </div>
              </div>

              <div className="pt-6 border-t border-dashed border-border">
                <h2 className="text-sm font-black text-foreground mb-3 flex items-center gap-2">
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

      <footer className="w-full py-5 px-6 text-center text-muted-foreground text-xs">
        © 2026 องค์การเภสัชกรรม • สาขาภาคใต้ &nbsp;|&nbsp; 🔒 PDPA Compliant &nbsp;|&nbsp; v2.0
      </footer>
    </div>
  );
}