'use client';
import { StaffSignUpForm } from "@/components/auth/StaffSignUpForm";

export default function StaffRegisterPage() {
  return (
    <main 
      className="min-h-screen pt-8 pb-10 px-4 md:pt-16 md:pb-20 md:px-12 relative overflow-hidden" 
      style={{ background: 'radial-gradient(circle at 100% 100%, #fff7ed 0%, #f1f8f6 50%, #e0f2f1 100%)' }}
    >
      
      {/* Background Pattern + Orange Accents */}
      <div className="absolute top-0 left-0 w-full h-full opacity-[0.05]" 
           style={{ backgroundImage: 'radial-gradient(#f97316 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
      
      {/* Container หลัก */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-16 z-10 relative">
        
        {/* ฝั่งซ้าย: Branding & Steps */}
        <div className="md:col-span-5 space-y-6 md:space-y-10 pt-0 md:pt-10">
          <div className="space-y-4">
            <div className="w-12 h-1.5 bg-orange-500 rounded-full" />
            <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tighter leading-[1.1]">
              GPO Staff <br/>
              <span className="text-orange-500">Registration</span>
            </h1>
            <p className="text-sm md:text-lg text-slate-600 font-medium">
              ระบบลงทะเบียนสำหรับพนักงาน GPO เพื่อเข้าใช้งานระบบ GPO Xchange Portal
            </p>
          </div>

          <div className="space-y-4 md:space-y-6 pt-2 md:pt-4">
            <h3 className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">ขั้นตอนการลงทะเบียน</h3>
            {[
              { title: "ระบุรหัสพนักงานและชื่อจริง", icon: "🆔", color: "text-teal-600" },
              { title: "เลือกฝ่ายงานที่สังกัดให้ถูกต้อง", icon: "🏢", color: "text-teal-600" },
              { title: "ตั้งค่า Username และรหัสผ่าน", icon: "🔐", color: "text-teal-600" },
              { title: "รออนุมัติสิทธิ์จากผู้จัดการ", icon: "⏳", color: "text-teal-600" }
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="text-xl mt-0.5">{step.icon}</div>
                <p className={`text-sm md:text-base font-semibold leading-snug ${step.color}`}>{step.title}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ฝั่งขวา: ฟอร์ม */}
        <div className="md:col-span-7 w-full relative">
          {/* แสงฟุ้งสีส้มผสมเขียว */}
          <div className="absolute -inset-2 md:-inset-4 bg-gradient-to-tr from-orange-400/20 to-teal-500/20 rounded-[2rem] md:rounded-[2.5rem] blur-xl" />
          
          <div className="relative bg-white/80 backdrop-blur-xl rounded-[2rem] md:rounded-[2.5rem] border border-white/50 shadow-2xl overflow-hidden">
            <StaffSignUpForm />
          </div>
        </div>

      </div>
    </main>
  );
}