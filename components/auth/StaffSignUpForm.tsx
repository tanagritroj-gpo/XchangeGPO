'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { registerStaff } from '@/app/actions/auth-staff';
import { SOUTHERN_PROVINCES, SALE_CUSTOMER_TYPE_OPTIONS } from '@/lib/sale-coverage';

export function StaffSignUpForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const department = watch('department');
  const isSale = department === 'sale';

  const onSubmit = async (data: any) => {
    if (isSale) {
      const types = Array.isArray(data.sale_customer_types) ? data.sale_customer_types : data.sale_customer_types ? [data.sale_customer_types] : [];
      const provinces = Array.isArray(data.sale_provinces) ? data.sale_provinces : data.sale_provinces ? [data.sale_provinces] : [];
      if (types.length === 0) { alert('กรุณาเลือกประเภทลูกค้าที่ดูแลอย่างน้อย 1 รายการ'); return; }
      if (provinces.length === 0) { alert('กรุณาเลือกจังหวัดที่ดูแลอย่างน้อย 1 จังหวัด'); return; }
    }
    setLoading(true);
    const result = await registerStaff(data);
    
    if (result.success) {
      setShowModal(true); // เปลี่ยนเป็นการแสดง Modal แทน
    } else {
      alert("เกิดข้อผิดพลาด: " + result.error);
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
          <input {...register("password", { required: "กรุณากำหนดรหัสผ่าน" })} type="password" className={inputStyle} placeholder="••••••••" />
          {errors.password && <p className={errorStyle}>{errors.password.message as string}</p>}
        </div>

        {/* ชื่อ-นามสกุล */}
        <div>
          <label className={labelStyle}>ชื่อ-นามสกุล</label>
          <input {...register("full_name", { required: "กรุณากรอกชื่อ-นามสกุล" })} className={inputStyle} placeholder="ระบุชื่อ-นามสกุลจริง" />
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
          className="w-full py-3 text-sm font-semibold text-muted-foreground hover:text-teal-700 transition-colors"
        >
          ← กลับหน้าหลัก
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
            <div className="text-4xl mb-4">✅</div>
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