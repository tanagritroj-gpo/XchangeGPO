'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { registerStaff } from '@/app/actions/auth-staff';
import { SOUTHERN_PROVINCES, SALE_CUSTOMER_TYPE_OPTIONS } from '@/lib/sale-coverage';
import { PasswordInput } from '@/components/ui/password-input';
import { PasswordStrengthHint } from '@/components/ui/password-strength-hint';
import { assertPasswordAllowed } from '@/lib/password-policy';
import { SignaturePad } from '@/components/auth/SignaturePad';
import { CheckCircle2, PenLine, ArrowLeft } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface StaffSignUpFormValues {
  employee_id: string;
  username: string;
  password: string;
  full_name: string;
  department: string;
  sale_customer_types?: string | string[];
  sale_provinces?: string | string[];
  // ★ ทุกแผนกต้องกรอก — ใช้ทั้งสำหรับ "ลืมรหัสผ่าน" (ส่ง OTP) และแจ้งเตือน sale
  // เมื่อลูกค้าในเขตที่ดูแลส่งใบงานเข้ามา
  email: string;
}

export function StaffSignUpForm() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [signature, setSignature] = useState('');
  const [isSigned, setIsSigned] = useState(false);
  const [signatureError, setSignatureError] = useState('');
  const { register, handleSubmit, watch, formState: { errors } } = useForm<StaffSignUpFormValues>();
  const department = watch('department');
  const isSale = department === 'sale';

  const onSubmit = async (data: StaffSignUpFormValues) => {
    if (isSale) {
      const types = Array.isArray(data.sale_customer_types) ? data.sale_customer_types : data.sale_customer_types ? [data.sale_customer_types] : [];
      const provinces = Array.isArray(data.sale_provinces) ? data.sale_provinces : data.sale_provinces ? [data.sale_provinces] : [];
      if (types.length === 0) { toast.error('กรุณาเลือกประเภทลูกค้าที่ดูแลอย่างน้อย 1 รายการ'); return; }
      if (provinces.length === 0) { toast.error('กรุณาเลือกจังหวัดที่ดูแลอย่างน้อย 1 จังหวัด'); return; }
    }
    if (!signature) {
      setSignatureError('กรุณาลงลายเซ็นก่อนดำเนินการต่อ');
      return;
    }
    setLoading(true);
    const result = await registerStaff({ ...data, signature_url: signature });

    if (result.success) {
      setShowModal(true); // เปลี่ยนเป็นการแสดง Modal แทน
    } else {
      toast.error(result.error || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ');
    }
    setLoading(false);
  };

  const inputStyle = "w-full px-5 py-3.5 rounded-xl border border-slate-300 bg-white text-foreground placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100 outline-none transition-all";
  const labelStyle = "text-xs font-bold text-muted-foreground mb-1.5 block tracking-wide";
  const errorStyle = "text-xs text-red-500 font-medium mt-1";

  return (
    <div className="w-full flex flex-col p-6 md:p-8">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <h2 className="text-2xl font-black text-foreground mb-6">ลงทะเบียนพนักงาน</h2>

        {/* รหัสพนักงาน */}
        <div>
          <label className={labelStyle}>รหัสพนักงาน</label>
          <input {...register("employee_id", { required: "กรุณากรอกรหัสพนักงาน" })} className={inputStyle} placeholder="รหัสพนักงาน" />
          {errors.employee_id && <p className={errorStyle}>{errors.employee_id.message as string}</p>}
        </div>

        {/* USERNAME */}
        <div>
          <label className={labelStyle}>USERNAME</label>
          <input {...register("username", { required: "กรุณากำหนด Username" })} className={inputStyle} placeholder="ชื่อผู้ใช้งาน" />
          {errors.username && <p className={errorStyle}>{errors.username.message as string}</p>}
        </div>

        {/* PASSWORD */}
        <div>
          <label className={labelStyle}>PASSWORD</label>
          <PasswordInput
            {...register("password", {
              required: "กรุณากำหนดรหัสผ่าน",
              validate: (v: string) => assertPasswordAllowed(v).ok || assertPasswordAllowed(v).error,
            })}
            className={inputStyle}
            placeholder="อย่างน้อย 12 ตัวอักษร"
          />
          <PasswordStrengthHint
            value={watch("password") ?? ''}
            identifiers={[watch("email") ?? '', watch("username") ?? '', watch("employee_id") ?? '', watch("full_name") ?? '']}
          />
          {errors.password && <p className={errorStyle}>{errors.password.message as string}</p>}
        </div>

        {/* ชื่อ-นามสกุล */}
        <div>
          <label className={labelStyle}>ชื่อ-นามสกุล</label>
          <input {...register("full_name", { required: "กรุณากรอกชื่อ-นามสกุล" })} className={inputStyle} placeholder="ระบุชื่อ-นามสกุลจริง" />
          {errors.full_name && <p className={errorStyle}>{errors.full_name.message as string}</p>}
        </div>

        {/* อีเมล — ทุกแผนกต้องกรอก ใช้ทั้งส่ง OTP ตอน "ลืมรหัสผ่าน" และแจ้งเตือน sale */}
        <div>
          <label className={labelStyle}>อีเมล</label>
          <input
            type="email"
            {...register('email', {
              required: 'กรุณากรอกอีเมล',
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'รูปแบบอีเมลไม่ถูกต้อง' },
            })}
            className={inputStyle}
            placeholder="name@example.com"
          />
          {errors.email && <p className={errorStyle}>{errors.email.message as string}</p>}
        </div>

        {/* ฝ่ายงาน */}
        <div>
          <label className={labelStyle}>ฝ่ายงาน</label>
          <select {...register("department", { required: "กรุณาเลือกฝ่ายงาน" })} className={`${inputStyle} appearance-none cursor-pointer`}>
            <option value="">เลือกฝ่ายงาน...</option>
            <option value="csr">Customer Service (CSR)</option>
            <option value="log">Logistics (LOG)</option>
            <option value="wh">Warehouse (WH)</option>
            <option value="manager">Manager (Admin)</option>
            <option value="sale">Sale (พนักงานขาย)</option>
          </select>
          {errors.department && <p className={errorStyle}>{errors.department.message as string}</p>}
        </div>

        {/* ขอบเขตดูแลของ sale — เลือกได้มากกว่า 1 ทั้ง 2 กลุ่ม บังคับตรวจใน onSubmit
            แทนที่จะใช้ react-hook-form required เพราะเป็น checkbox กลุ่มไม่ใช่ field เดี่ยว */}
        {isSale && (
          <div className="space-y-4 p-4 rounded-xl bg-teal-50/60 border border-teal-100">
            <div>
              <label className={labelStyle}>ประเภทลูกค้าที่ดูแล</label>
              <div className="space-y-2">
                {SALE_CUSTOMER_TYPE_OPTIONS.map((o) => (
                  <label key={o.value} className="flex items-start gap-2.5 cursor-pointer">
                    <input type="checkbox" value={o.value} {...register('sale_customer_types')} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                    <span className="text-sm text-foreground">
                      {o.label}
                      <span className="block text-[11px] text-muted-foreground font-normal">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={labelStyle}>จังหวัดที่ดูแล</label>
              <div className="grid grid-cols-2 gap-2">
                {SOUTHERN_PROVINCES.map((p) => (
                  <label key={p} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" value={p} {...register('sale_provinces')} className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                    <span className="text-sm text-foreground">{p}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ลายเซ็นดิจิทัล — ใช้ยืนยันตัวตนพนักงาน และฝังในเอกสารยืนยันการลงทะเบียนของลูกค้า
            ตอนพนักงานคนนี้กดอนุมัติ (component เดียวกับที่ลูกค้าใช้ตอนลงทะเบียน) — ต้องมี
            isSigned สลับ label/ไอคอนเหมือนหน้าลงทะเบียนลูกค้า ไม่งั้นกดยืนยันแล้วไม่มีอะไร
            เปลี่ยนแปลงให้เห็นเลย ผู้ใช้จะเข้าใจผิดว่าปุ่มไม่ทำงาน (ทั้งที่ setSignature
            สำเร็จจริง) */}
        <div>
          <label className={`${labelStyle} flex items-center gap-1.5`}>
            {isSigned ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <PenLine className="w-3.5 h-3.5 text-amber-600" />}
            {isSigned ? 'ยืนยันลายเซ็นต์สำเร็จ' : 'ลายเซ็นต์'}
          </label>
          <SignaturePad
            onSave={(data) => {
              setSignature(data);
              setIsSigned(true);
              setSignatureError('');
            }}
            onClear={() => {
              setSignature('');
              setIsSigned(false);
            }}
            onEmpty={() => setSignatureError('กรุณาลงลายเซ็นก่อนกดยืนยัน')}
          />
          {signatureError && <p className={errorStyle}>{signatureError}</p>}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 mt-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 shadow-lg shadow-teal-500/20 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? 'กำลังบันทึกข้อมูล...' : 'ลงทะเบียนเข้าใช้งาน'}
        </button>

        {/* ปุ่มกลับหน้าหลัก */}
        <button
          type="button"
          onClick={() => router.push('/')}
          className="w-full py-3 text-sm font-semibold text-muted-foreground hover:text-teal-700 transition-colors flex items-center justify-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> กลับหน้าหลัก
        </button>
      </form>

      {/* Footer */}
      <div className="mt-8 pt-6 border-t border-slate-200 text-center">
        <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-widest font-bold">
          องค์การเภสัชกรรม สาขาภาคใต้
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">
          © 2026 Government Pharmaceutical Organization. All rights reserved.
        </p>
      </div>

      {/* Modal แจ้งเตือน */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100">
            <div className="flex items-center justify-center mb-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-600" />
            </div>
            <h3 className="text-xl font-black text-foreground mb-2">ลงทะเบียนเรียบร้อยแล้ว</h3>
            <p className="text-slate-600 mb-6 text-sm">กรุณารอการอนุมัติสิทธิ์จากผู้จัดการสาขาภาคใต้ หลังจากได้รับการอนุมัติ ท่านจึงจะสามารถเข้าใช้งานระบบได้</p>
            <button 
              onClick={() => router.push('/')}
              className="w-full py-3 bg-teal-700 text-white rounded-xl font-bold hover:bg-teal-800 transition-all"
            >
              รับทราบและกลับหน้าหลัก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}