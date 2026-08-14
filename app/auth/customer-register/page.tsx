'use client';
import { RegisterForm } from "@/components/auth/RegisterForm";
import { UserPlus, Building2, PenLine, Clock } from "lucide-react";

export default function RegisterPage() {
  return (
    <main
      className="min-h-screen pt-8 pb-10 px-4 md:pt-16 md:pb-20 md:px-12 relative overflow-hidden bg-background"
    >
      
      {/* Background Pattern */}
      <div className="absolute top-0 left-0 w-full h-full opacity-[0.03]" 
           style={{ backgroundImage: 'radial-gradient(#0f5132 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
      
      {/* Container หลัก: ปรับ grid ให้เป็นคอลัมน์เดียวในมือถือ และเพิ่ม gap-8 */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-16 z-10 relative">
        
        {/* ฝั่งซ้าย: Branding & Steps */}
        <div className="md:col-span-5 space-y-6 md:space-y-10 pt-0 md:pt-10">
          <div className="space-y-4">
            <div className="w-12 h-1.5 bg-teal-600 rounded-full" />
            <h1 className="text-3xl md:text-5xl font-extrabold text-foreground tracking-tighter leading-[1.1]">
              GPO Xchange <br/>
              <span className="text-teal-700">Portal</span>
            </h1>
            <p className="text-sm md:text-lg text-slate-600 font-medium">
              ระบบดิจิทัลสำหรับบริหารจัดการการรับคืนสินค้าองค์การเภสัชกรรมอย่างเป็นระบบและโปร่งใส
            </p>
          </div>

          <div className="space-y-4 md:space-y-6 pt-2 md:pt-4">
            <h3 className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest">ขั้นตอนการลงทะเบียน</h3>
            {[
              { title: "ลงทะเบียนขอเข้าใช้ระบบ ครั้งแรกและครั้งเดียว", icon: UserPlus },
              { title: "กรอกข้อมูลหน่วยงานและผู้ประสานงาน", icon: Building2 },
              { title: "ลงลายมือชื่อดิจิทัลและยินยอม PDPA", icon: PenLine },
              { title: "รอเจ้าหน้าที่อนุมัติ 1–2 วันทำการ", icon: Clock }
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-teal-50 text-teal-700">
                  <step.icon className="w-4 h-4" />
                </div>
                <p className="text-sm md:text-base text-slate-700 font-semibold leading-snug mt-1">{step.title}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ฝั่งขวา: ฟอร์ม */}
        <div className="md:col-span-7 w-full relative">
          <div className="absolute -inset-2 md:-inset-4 bg-gradient-to-tr from-teal-500/20 to-blue-500/20 rounded-[2rem] md:rounded-[2.5rem] blur-xl" />
          <div className="relative bg-white/10 backdrop-blur-sm rounded-[2rem] md:rounded-[2.5rem] border border-white/20 shadow-2xl overflow-hidden">
            <RegisterForm />
          </div>
        </div>

      </div>
    </main>
  );
}