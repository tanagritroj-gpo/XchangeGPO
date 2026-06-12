'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerCustomer } from '@/app/actions/auth';
import { SignaturePad } from '@/components/auth/SignaturePad';

const registerSchema = z.object({
  hospital_name: z.string().min(1, "กรุณากรอกชื่อหน่วยงาน"),
  province: z.string().min(1, "กรุณาเลือกจังหวัด"),
  contact_name: z.string().min(1, "กรุณากรอกชื่อผู้ติดต่อ"),
  position: z.string().min(1, "กรุณากรอกตำแหน่ง"),
  phone: z.string().min(9, "เบอร์โทรศัพท์ไม่ถูกต้อง"),
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  pdpa_consent: z.literal(true, {
    errorMap: () => ({ message: "กรุณากดยินยอม PDPA เพื่อดำเนินการต่อ" }),
  }),
});

export function RegisterForm() {
  const [signature, setSignature] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(registerSchema)
  });

  const onSubmit = async (data: any) => {
    if (!signature) { alert("กรุณาลงลายเซ็นต์ให้เรียบร้อย"); return; }
    setLoading(true);
    try {
      const payload = { ...data, signature };
      const result = await registerCustomer(payload);
      if (result.success) alert("ลงทะเบียนสำเร็จ!");
      else alert("เกิดข้อผิดพลาด: " + result.error);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle =
    "w-full px-4 py-3 border-2 border-slate-100 rounded-xl text-sm text-slate-800 font-medium placeholder:text-slate-400 placeholder:font-normal bg-slate-50/70 focus:bg-white focus:border-teal-400 focus:ring-4 focus:ring-teal-50 outline-none transition-all duration-200";
  const labelStyle = "text-xs font-bold text-slate-500 mb-1.5 block tracking-wide";
  const errorStyle = "text-[11px] text-rose-500 mt-1 ml-1 font-semibold flex items-center gap-1";

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #eefcf6 0%, #f0f4f8 40%, #eef6fb 100%)' }}
    >
      {/* Decorative background blobs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, #5eead4, transparent)' }} />
      <div className="absolute -bottom-40 -right-32 w-[28rem] h-[28rem] rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(circle, #38bdf8, transparent)' }} />
      <div className="absolute top-1/3 right-10 w-24 h-24 rounded-full opacity-20 blur-2xl hidden md:block"
        style={{ background: '#0f5132' }} />

      <div className="w-full max-w-lg relative z-10">

        {/* Header */}
        <div className="text-center mb-7">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-4 shadow-xl relative"
            style={{ background: 'linear-gradient(135deg, #0f5132 0%, #1a7a45 60%, #2dd4bf 120%)', boxShadow: '0 12px 30px -8px rgba(15,81,50,0.45)' }}
          >
            <span className="text-4xl drop-shadow-sm">📝</span>
            <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-md text-sm">
              ✨
            </div>
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">ลงทะเบียนใช้งานระบบ</h1>
          <p className="text-xs text-slate-400 mt-1.5 flex items-center justify-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-400" />
            GPO Xchange Portal • สำหรับโรงพยาบาล / หน่วยงาน
          </p>
        </div>

        {/* Form Card */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="relative bg-white/90 backdrop-blur-xl p-7 rounded-[2rem] shadow-2xl shadow-slate-200/60 border border-white space-y-6 overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-2 rounded-t-[2rem]" style={{ background: 'linear-gradient(90deg, #0f5132, #1a7a45, #2dd4bf, #38bdf8)' }} />
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-[0.07]"
            style={{ background: 'radial-gradient(circle, #0f5132, transparent)' }} />

          {/* Section: หน่วยงาน */}
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-sm"
                style={{ background: 'linear-gradient(135deg,#d1fae5,#99f6e4)' }}>🏥</div>
              <h2 className="text-sm font-black text-slate-800">ข้อมูลหน่วยงาน</h2>
            </div>
            <label className={labelStyle}>ชื่อหน่วยงาน / โรงพยาบาล</label>
            <input {...register("hospital_name")} placeholder="เช่น โรงพยาบาลส่งเสริมสุขภาพ..." className={inputStyle} />
            {errors.hospital_name && <p className={errorStyle}>⚠ {errors.hospital_name.message as string}</p>}
            
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label className={labelStyle}>จังหวัด</label>
                <div className="relative">
                  <select {...register("province")} className={`${inputStyle} appearance-none pr-10 cursor-pointer`}>
                    <option value="">เลือกจังหวัด</option>
                    {["สงขลา", "ตรัง", "สตูล", "พัทลุง", "ยะลา", "ปัตตานี", "นราธิวาส"].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
                {errors.province && <p className={errorStyle}>⚠ {errors.province.message as string}</p>}
              </div>
              <div>
                <label className={labelStyle}>ตำแหน่ง</label>
                <input {...register("position")} placeholder="ตำแหน่ง" className={inputStyle} />
                {errors.position && <p className={errorStyle}>⚠ {errors.position.message as string}</p>}
              </div>
            </div>
          </div>

          {/* Section: ผู้ติดต่อ */}
          <div className="pt-5 border-t border-dashed border-slate-200">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-sm"
                style={{ background: 'linear-gradient(135deg,#dbeafe,#bfdbfe)' }}>👤</div>
              <h2 className="text-sm font-black text-slate-800">ข้อมูลผู้ติดต่อ</h2>
            </div>
            <label className={labelStyle}>ชื่อ-นามสกุล ผู้ติดต่อ</label>
            <input {...register("contact_name")} placeholder="ชื่อ-นามสกุล" className={inputStyle} />
            {errors.contact_name && <p className={errorStyle}>⚠ {errors.contact_name.message as string}</p>}
            <div className="mt-4">
              <label className={labelStyle}>อีเมล</label>
              <input {...register("email")} placeholder="example@email.com" className={inputStyle} />
              {errors.email && <p className={errorStyle}>⚠ {errors.email.message as string}</p>}
            </div>
            <div className="mt-4">
              <label className={labelStyle}>เบอร์โทรศัพท์</label>
              <input {...register("phone")} placeholder="0XX-XXX-XXXX" className={inputStyle} />
              {errors.phone && <p className={errorStyle}>⚠ {errors.phone.message as string}</p>}
            </div>
          </div>

          {/* Section: PDPA */}
          <div className="pt-5 border-t border-dashed border-slate-200">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input type="checkbox" {...register("pdpa_consent")} className="mt-1 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
              <span className="text-xs text-slate-600 leading-relaxed">
                <b className="text-slate-800">คำยินยอม PDPA: </b>
                ข้าพเจ้ายินยอมให้ระบบ Xchange Portal ของ{' '}
                <span className="font-bold text-teal-700">องค์การเภสัชกรรม (GPO)</span>{' '}
                จัดเก็บ ประมวลผล และใช้ข้อมูลส่วนบุคคลข้างต้น
                (ชื่อ-นามสกุล, เบอร์โทรศัพท์, อีเมล และลายมือชื่ออิเล็กทรอนิกส์)
                เพื่อวัตถุประสงค์ในการยืนยันตัวตนและการติดต่อประสานงาน
                ตามนโยบายคุ้มครองข้อมูลส่วนบุคคล
              </span>
            </label>
            {errors.pdpa_consent && <p className={errorStyle}>⚠ {errors.pdpa_consent.message as string}</p>}
          </div>

          {/* Section: ลายเซ็นต์ */}
          <div className="pt-5 border-t border-dashed border-slate-200">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-sm"
                style={{ background: 'linear-gradient(135deg,#fef3c7,#fde68a)' }}>✍️</div>
              <h2 className="text-sm font-black text-slate-800">ลายเซ็นต์ผู้มีอำนาจลงนาม</h2>
            </div>
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-2 bg-gradient-to-br from-slate-50 to-white">
              <SignaturePad onSave={(data) => setSignature(data)} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl font-bold text-white text-sm shadow-xl transition-all duration-200 active:scale-[0.98] disabled:opacity-60"
            style={{ background: loading ? '#94a3b8' : 'linear-gradient(135deg, #0f5132 0%, #1a7a45 60%, #16a085 100%)' }}
          >
            {loading ? "กำลังดำเนินการ..." : "✓ ยืนยันการลงทะเบียน"}
          </button>

          <button
            type="button"
            onClick={() => window.location.href = '/'}
            className="w-full py-3.5 rounded-2xl font-bold text-sm text-slate-500 bg-slate-50 border-2 border-slate-100 hover:bg-white hover:border-slate-200 hover:text-slate-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            ← กลับหน้าหลัก
          </button>
        </form>

        <div className="flex items-center justify-center gap-2 mt-5">
          <p className="text-center text-[11px] text-slate-400 font-medium">
            ข้อมูลของท่านได้รับการคุ้มครองตาม PDPA
          </p>
        </div>
      </div>
    </div>
  );
}