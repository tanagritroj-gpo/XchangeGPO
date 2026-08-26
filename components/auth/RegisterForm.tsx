'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { getErrorMessage } from '@/lib/error-message';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerCustomer } from '@/app/actions/auth';
import { SignaturePad } from '@/components/auth/SignaturePad';
import { PasswordInput } from '@/components/ui/password-input';
import { SOUTHERN_PROVINCES, ORG_TYPE_OPTIONS } from '@/lib/sale-coverage';
import { UserPlus, Sparkles, Building2, AlertCircle, User, CheckCircle2, PenLine, Check, ArrowLeft } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

// หลังลงทะเบียนสำเร็จ โชว์ modal นี้ค้างไว้สักพักก่อนพากลับหน้าหลัก — กัน
// ลูกค้าค้างอยู่หน้าลงทะเบียนเดิมแล้วงงว่าต้องทำอะไรต่อ (เดิมใช้ alert() เฉยๆ
// ปิดแล้วก็ยังค้างอยู่หน้าเดิม)
const SUCCESS_REDIRECT_DELAY_MS = 2200;

const ORG_TYPE_VALUES = ORG_TYPE_OPTIONS.map((o) => o.value) as [string, ...string[]];

const POSITION_OPTIONS = [
  { value: "เภสัชกร", label: "เภสัชกร" },
  { value: "เจ้าหน้าที่พัสดุ", label: "เจ้าหน้าที่พัสดุ" },
  { value: "เจ้าของกิจการ", label: "เจ้าของกิจการ" },
  { value: "อื่นๆ", label: "อื่นๆ (ระบุ)" },
];
const POSITION_VALUES = POSITION_OPTIONS.map((o) => o.value) as [string, ...string[]];
const POSITION_OTHER_VALUE = "อื่นๆ";

const registerSchema = z.object({
  hospital_name: z.string().min(1, "กรุณากรอกชื่อหน่วยงาน"),
  org_type: z.enum(ORG_TYPE_VALUES, { message: "กรุณาเลือกประเภทหน่วยงาน" }),
  province: z.string().min(1, "กรุณาเลือกจังหวัด"),
  contact_name: z.string().min(1, "กรุณากรอกชื่อผู้ติดต่อ"),
  position: z.enum(POSITION_VALUES, { message: "กรุณาเลือกตำแหน่ง" }),
  position_other: z.string().optional(),
  phone: z.string().min(9, "เบอร์โทรศัพท์ไม่ถูกต้อง"),
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  // ★ login ลูกค้าใช้ email เป็น username (ไม่มีช่องตั้ง username แยก) คู่กับรหัสผ่านนี้
  password: z.string().min(6, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"),
  pdpa_consent: z.boolean().refine((val) => val === true, {
    message: "กรุณากดยินยอม PDPA เพื่อดำเนินการต่อ",
  }),
}).refine(
  (data) => data.position !== POSITION_OTHER_VALUE || !!data.position_other?.trim(),
  { message: "กรุณาระบุตำแหน่ง", path: ["position_other"] }
);

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  const toast = useToast();
  const [signature, setSignature] = useState<string>("");
  const [isSigned, setIsSigned] = useState(false);
  const [signatureError, setSignatureError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema)
  });

  const selectedPosition = watch("position");

  const onSubmit = async (data: RegisterFormValues) => {
    if (!signature) {
      setSignatureError("กรุณาลงลายเซ็นต์ผู้มีอำนาจก่อนดำเนินการต่อ");
      return;
    }
    setLoading(true);

    try {
      const { position_other, ...rest } = data;
      const resolvedPosition = data.position === POSITION_OTHER_VALUE ? (position_other ?? '').trim() : data.position;
      const payload = { ...rest, position: resolvedPosition, signature_url: signature };
      const result = await registerCustomer(payload);

      if (result.success) {
        setShowSuccessModal(true);
        setTimeout(() => router.push('/'), SUCCESS_REDIRECT_DELAY_MS);
      } else {
        toast.error(result.error || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ');
        setLoading(false);
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
      setLoading(false);
    }
  };

  const inputStyle = "w-full px-4 py-3 border-2 border-slate-100 rounded-xl text-sm text-foreground font-medium placeholder:text-slate-400 placeholder:font-normal bg-slate-50/70 focus:bg-white focus:border-teal-400 focus:ring-4 focus:ring-teal-50 outline-none transition-all duration-200";
  const labelStyle = "text-xs font-bold text-muted-foreground mb-1.5 block tracking-wide";
  const errorStyle = "text-[11px] text-rose-500 mt-1 ml-1 font-semibold flex items-center gap-1";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden bg-background">
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30 blur-3xl" style={{ background: 'radial-gradient(circle, #5eead4, transparent)' }} />
      <div className="absolute -bottom-40 -right-32 w-[28rem] h-[28rem] rounded-full opacity-25 blur-3xl" style={{ background: 'radial-gradient(circle, #38bdf8, transparent)' }} />

      <div className="w-full max-w-lg relative z-10 my-4">
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-4 shadow-xl relative" style={{ background: 'linear-gradient(135deg, #0f5132 0%, #1a7a45 60%, #2dd4bf 120%)', boxShadow: '0 12px 30px -8px rgba(15,81,50,0.45)' }}>
            <UserPlus className="w-9 h-9 text-white drop-shadow-sm" strokeWidth={2.2} />
            <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-md">
              <Sparkles className="w-3.5 h-3.5 text-teal-500" />
            </div>
          </div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">ลงทะเบียนใช้งานระบบ</h1>
          <p className="text-xs text-muted-foreground mt-1.5 flex items-center justify-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-400" />
            GPO Xchange Portal • สำหรับโรงพยาบาล / หน่วยงาน
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="relative bg-white/90 backdrop-blur-xl p-7 rounded-[2rem] shadow-2xl shadow-slate-200/60 border border-white space-y-6 overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 rounded-t-[2rem]" style={{ background: 'linear-gradient(90deg, #0f5132, #1a7a45, #2dd4bf, #38bdf8)' }} />
          
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm" style={{ background: 'linear-gradient(135deg,#d1fae5,#99f6e4)' }}><Building2 className="w-4 h-4 text-teal-700" /></div>
              <h2 className="text-sm font-black text-foreground">ข้อมูลหน่วยงาน</h2>
            </div>
            <label className={labelStyle}>ประเภทหน่วยงาน</label>
            <select {...register("org_type")} className={`${inputStyle} appearance-none pr-10 cursor-pointer`}>
              <option value="">เลือกประเภทหน่วยงาน</option>
              {ORG_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {errors.org_type && <p className={errorStyle}><AlertCircle className="w-3 h-3 shrink-0" />{errors.org_type.message as string}</p>}
            <div className="mt-4">
              <label className={labelStyle}>ชื่อหน่วยงาน / โรงพยาบาล</label>
              <input {...register("hospital_name")} placeholder="เช่น โรงพยาบาลส่งเสริมสุขภาพ..." className={inputStyle} />
              {errors.hospital_name && <p className={errorStyle}><AlertCircle className="w-3 h-3 shrink-0" />{errors.hospital_name.message as string}</p>}
            </div>
            <div className="mt-4">
              <label className={labelStyle}>จังหวัด</label>
              <select {...register("province")} className={`${inputStyle} appearance-none pr-10 cursor-pointer`}>
                <option value="">เลือกจังหวัด</option>
                {SOUTHERN_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {errors.province && <p className={errorStyle}><AlertCircle className="w-3 h-3 shrink-0" />{errors.province.message as string}</p>}
            </div>
          </div>

          <div className="pt-5 border-t border-dashed border-border">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm" style={{ background: 'linear-gradient(135deg,#dbeafe,#bfdbfe)' }}><User className="w-4 h-4 text-blue-700" /></div>
              <h2 className="text-sm font-black text-foreground">ข้อมูลผู้ติดต่อ</h2>
            </div>
            <label className={labelStyle}>ชื่อ-นามสกุล ผู้ติดต่อ</label>
            <input {...register("contact_name")} placeholder="ชื่อ-นามสกุล" className={inputStyle} />
            {errors.contact_name && <p className={errorStyle}><AlertCircle className="w-3 h-3 shrink-0" />{errors.contact_name.message as string}</p>}
            <div className="mt-4">
              <label className={labelStyle}>ตำแหน่ง</label>
              <select {...register("position")} className={`${inputStyle} appearance-none pr-10 cursor-pointer`}>
                <option value="">เลือกตำแหน่ง</option>
                {POSITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errors.position && <p className={errorStyle}><AlertCircle className="w-3 h-3 shrink-0" />{errors.position.message as string}</p>}
            </div>
            {selectedPosition === POSITION_OTHER_VALUE && (
              <div className="mt-4">
                <label className={labelStyle}>ระบุตำแหน่ง</label>
                <input {...register("position_other")} placeholder="ระบุตำแหน่ง" className={inputStyle} />
                {errors.position_other && <p className={errorStyle}><AlertCircle className="w-3 h-3 shrink-0" />{errors.position_other.message as string}</p>}
              </div>
            )}
            <div className="mt-4">
              <label className={labelStyle}>อีเมล (ใช้เป็น Username สำหรับเข้าสู่ระบบ)</label>
              <input {...register("email")} placeholder="example@email.com" className={inputStyle} />
              {errors.email && <p className={errorStyle}><AlertCircle className="w-3 h-3 shrink-0" />{errors.email.message as string}</p>}
            </div>
            <div className="mt-4">
              <label className={labelStyle}>ตั้งรหัสผ่าน</label>
              <PasswordInput {...register("password")} placeholder="อย่างน้อย 6 ตัวอักษร" className={inputStyle} />
              {errors.password && <p className={errorStyle}><AlertCircle className="w-3 h-3 shrink-0" />{errors.password.message as string}</p>}
            </div>
            <div className="mt-4">
              <label className={labelStyle}>เบอร์โทรศัพท์</label>
              <input {...register("phone")} placeholder="0XX-XXX-XXXX" className={inputStyle} />
              {errors.phone && <p className={errorStyle}><AlertCircle className="w-3 h-3 shrink-0" />{errors.phone.message as string}</p>}
            </div>
          </div>

          <div className="pt-5 border-t border-dashed border-border">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input type="checkbox" {...register("pdpa_consent")} className="mt-1 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
              <span className="text-xs text-slate-600 leading-relaxed">
                <b className="text-foreground">คำยินยอม PDPA: </b>
                ข้าพเจ้ายินยอมให้ระบบ Xchange Portal ของ{' '}
                <span className="font-bold text-teal-700">องค์การเภสัชกรรม (GPO)</span>{' '}
                จัดเก็บ ประมวลผล และใช้ข้อมูลส่วนบุคคลข้างต้น
                (ชื่อ-นามสกุล, เบอร์โทรศัพท์, อีเมล และลายมือชื่ออิเล็กทรอนิกส์)
                เพื่อวัตถุประสงค์ในการยืนยันตัวตนและการติดต่อประสานงาน
                ตามนโยบายคุ้มครองข้อมูลส่วนบุคคล
              </span>
            </label>
            {errors.pdpa_consent && <p className={errorStyle}><AlertCircle className="w-3 h-3 shrink-0" />{errors.pdpa_consent.message as string}</p>}
          </div>

          <div className="pt-5 border-t border-dashed border-border">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm" style={{ background: isSigned ? 'linear-gradient(135deg,#d1fae5,#99f6e4)' : 'linear-gradient(135deg,#fef3c7,#fde68a)' }}>{isSigned ? <CheckCircle2 className="w-4 h-4 text-emerald-700" /> : <PenLine className="w-4 h-4 text-amber-700" />}</div>
              <h2 className="text-sm font-black text-foreground">{isSigned ? "ยืนยันลายเซ็นต์สำเร็จ" : "ลายเซ็นต์ผู้มีอำนาจลงนาม"}</h2>
            </div>
            <div className="rounded-2xl border-2 border-dashed border-border p-2 bg-gradient-to-br from-slate-50 to-white">
              <SignaturePad 
                onSave={(data) => {
                  setSignature(data);
                  setIsSigned(true);
                  setSignatureError("");
                }}
                onClear={() => {
                  setSignature("");
                  setIsSigned(false);
                }}
                onEmpty={() => setSignatureError("กรุณาลงลายเซ็นต์ก่อนกดยืนยัน")}
              />
            </div>
            {signatureError && <p className={errorStyle}><AlertCircle className="w-3 h-3 shrink-0" />{signatureError}</p>}
          </div>

          <button type="submit" disabled={loading} className="w-full py-4 rounded-2xl font-bold text-white text-sm shadow-xl transition-all duration-200 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2" style={{ background: loading ? '#94a3b8' : 'linear-gradient(135deg, #0f5132 0%, #1a7a45 60%, #16a085 100%)' }}>
            {loading ? "กำลังดำเนินการ..." : <><Check className="w-4 h-4" /> ยืนยันการลงทะเบียน</>}
          </button>

          <button
type="button"
onClick={() => window.location.href = '/'}
className="w-full py-3.5 rounded-2xl font-bold text-sm text-muted-foreground bg-slate-50 border-2 border-slate-100 hover:bg-white hover:border-border hover:text-slate-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
>
<ArrowLeft className="w-4 h-4" /> กลับหน้าหลัก
</button>
</form>

<div className="flex items-center justify-center gap-2 mt-5">
<p className="text-center text-[11px] text-muted-foreground font-medium">ข้อมูลของท่านได้รับการคุ้มครองตาม PDPA</p>
</div>
</div>

{/* ══ ลงทะเบียนสำเร็จ — ค้าง modal ไว้สักพักก่อนพากลับหน้าหลัก ══ */}
{showSuccessModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
    <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 p-8 text-center">
      <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#d1fae5,#99f6e4)' }}>
        <CheckCircle2 className="w-9 h-9 text-emerald-600" />
      </div>
      <h3 className="text-lg font-black text-foreground mb-2">ลงทะเบียนสำเร็จ</h3>
      <p className="text-sm text-muted-foreground leading-relaxed mb-6">รอดำเนินการใน 1-2 วัน</p>
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground font-medium">
        <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        กำลังนำท่านกลับสู่หน้าหลัก...
      </div>
    </div>
  </div>
)}
</div>
);
}