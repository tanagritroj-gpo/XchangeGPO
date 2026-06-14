'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { registerStaff } from '@/app/actions/auth-staff';

export function StaffSignUpForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data: any) => {
    setLoading(true);
    const result = await registerStaff(data);
    
    if (result.success) {
      alert("ลงทะเบียนสำเร็จ! กรุณารอการอนุมัติจากผู้จัดการ");
      router.push('/auth/staff-login');
    } else {
      alert("เกิดข้อผิดพลาด: " + result.error);
    }
    setLoading(false);
  };

  const inputStyle = "w-full px-5 py-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100 outline-none transition-all";
  const labelStyle = "text-xs font-bold text-slate-500 mb-1.5 block tracking-wide";
  const errorStyle = "text-xs text-red-500 font-medium mt-1";

  return (
    <div className="w-full flex flex-col p-6 md:p-8">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <h2 className="text-2xl font-black text-slate-800 mb-6">ลงทะเบียนพนักงาน</h2>

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
          <input {...register("password", { required: "กรุณากำหนดรหัสผ่าน" })} type="password" className={inputStyle} placeholder="••••••••" />
          {errors.password && <p className={errorStyle}>{errors.password.message as string}</p>}
        </div>

        {/* ชื่อ-นามสกุล */}
        <div>
          <label className={labelStyle}>ชื่อ-นามสกุล</label>
          <input {...register("full_name", { required: "กรุณากรอกชื่อ-นามสกุล" })} className={inputStyle} placeholder="ระบุชื่อ-นามสกุลจริง (ไม่ต้องมีคำนำหน้า)" />
          {errors.full_name && <p className={errorStyle}>{errors.full_name.message as string}</p>}
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
          </select>
          {errors.department && <p className={errorStyle}>{errors.department.message as string}</p>}
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
          onClick={() => window.location.href = '/'}
          className="w-full py-3 text-sm font-semibold text-slate-500 hover:text-teal-700 transition-colors"
        >
          ← กลับหน้าหลัก
        </button>
      </form>

      {/* Footer ตาม Pattern */}
      <div className="mt-8 pt-6 border-t border-slate-200 text-center">
        <p className="text-[10px] md:text-xs text-slate-400 uppercase tracking-widest font-bold">
          องค์การเภสัชกรรม สาขาภาคใต้
        </p>
        <p className="text-[10px] text-slate-400 mt-1">
          © 2026 Government Pharmaceutical Organization. All rights reserved.
        </p>
      </div>
    </div>
  );
}