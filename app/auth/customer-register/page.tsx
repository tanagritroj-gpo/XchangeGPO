'use client';
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    // เปลี่ยนจาก flex center เป็น min-h-screen และใส่ padding ด้านบน
    <main className="min-h-screen pt-16 pb-20 px-6 md:px-12 relative overflow-hidden" 
          style={{ background: 'radial-gradient(circle at 100% 100%, #e0f2f1 0%, #f1f8f6 50%, #e0f7fa 100%)' }}>
      
      {/* Background Pattern */}
      <div className="absolute top-0 left-0 w-full h-full opacity-[0.03]" 
           style={{ backgroundImage: 'radial-gradient(#0f5132 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
      
      {/* Container หลัก: ใช้ max-w-6xl และ mx-auto เพื่อให้อยู่ตรงกลางแต่ไม่ต้องดึงทุกอย่างลงมาข้างล่าง */}
      <div className="max-w-6xl mx-auto grid md:grid-cols-12 gap-16 z-10">
        
        {/* ฝั่งซ้าย: Branding & Steps (อยู่ด้านบน ไม่ต้องอยู่กึ่งกลาง) */}
        <div className="md:col-span-5 space-y-10 pt-10">
          <div className="space-y-4">
            <div className="w-12 h-1.5 bg-teal-600 rounded-full" />
            <h1 className="text-5xl font-extrabold text-slate-900 tracking-tighter leading-[1.1]">
              GPO Xchange <br/>
              <span className="text-teal-700">Portal</span>
            </h1>
            <p className="text-lg text-slate-600 font-medium">
              ระบบดิจิทัลสำหรับบริหารจัดการการรับคืนสินค้าองค์การเภสัชกรรมอย่างเป็นระบบและโปร่งใส
            </p>
          </div>

          <div className="space-y-6 pt-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">ขั้นตอนการลงทะเบียน</h3>
            {[
              { title: "ลงทะเบียนขอเข้าใช้ระบบ ครั้งแรกและครั้งเดียว", icon: "1️⃣" },
              { title: "กรอกข้อมูลหน่วยงานและผู้ประสานงาน", icon: "2️⃣" },
              { title: "ลงลายมือชื่อดิจิทัลและยินยอม PDPA", icon: "3️⃣" },
              { title: "รอเจ้าหน้าที่อนุมัติ 1–2 วันทำการ", icon: "4️⃣" }
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="text-xl mt-0.5">{step.icon}</div>
                <p className="text-slate-700 font-semibold leading-snug">{step.title}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ฝั่งขวา: ฟอร์ม (จะอยู่ต่อจากข้อความฝั่งซ้ายและเริ่มจากด้านบน) */}
        <div className="md:col-span-7 w-full relative">
          <div className="absolute -inset-4 bg-gradient-to-tr from-teal-500/20 to-blue-500/20 rounded-[2.5rem] blur-xl" />
          <div className="relative bg-white/10 backdrop-blur-sm rounded-[2.5rem] border border-white/20 shadow-2xl overflow-hidden">
            <RegisterForm />
          </div>
        </div>

      </div>
    </main>
  );
}