'use client';
import { useState } from 'react';
import { updateDrugCompliance, approveDrugItem, rejectDrugItem } from '@/app/actions/csr-actions'; 
import { getStaffSession } from '@/app/actions/auth-staff';

export default function CSRDrugRow({ item, onUpdate }: { item: any; onUpdate: () => void }) {
  const isExchangeRequest = item.request_type === 'รับคืนแลกเปลี่ยน';
  const [productType, setProductType] = useState(item.product_type || '');
  const [status, setStatus] = useState({ pass: item.is_compliant, msg: item.compliance_remark || '' });

  const handleTypeChange = async (pType: string) => {
    setProductType(pType);
    const today = new Date();
    const expDate = new Date(item.exp_date);
    const diffInMonths = (expDate.getFullYear() - today.getFullYear()) * 12 + (expDate.getMonth() - today.getMonth());
    
    let result = { pass: true, msg: 'ผ่านเกณฑ์' };
    if (pType === 'GPO' && expDate < today && Math.abs(diffInMonths) > 6) {
      result = { pass: false, msg: 'GPO หมดอายุเกิน 6 เดือน' };
    } else if (pType === 'OTHER' && diffInMonths < 7) {
      result = { pass: false, msg: 'อายุคงเหลือไม่ถึง 7 เดือน' };
    }
    
    setStatus(result);
    await updateDrugCompliance(item.id, pType, result);
    onUpdate(); 
  };

  const handleItemAction = async (action: 'approve' | 'reject') => {
    const remark = prompt(`ระบุหมายเหตุการ${action === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ'}รายการยา:`);
    if (remark === null) return;

    try {
      const session = await getStaffSession();
      if (!session?.id) return alert("ไม่พบ Session พนักงาน");

      const res = action === 'approve'
        ? await approveDrugItem(item.id, item.request_id, session.id, remark)
        : await rejectDrugItem(item.id, item.request_id, session.id, remark);

      if (res.success) onUpdate();
      else alert('เกิดข้อผิดพลาด: ' + (res as any).error);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  };

  return (
    <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-white rounded-2xl border border-slate-100 shadow-sm items-center hover:border-teal-200 hover:shadow-md transition-all">
      {/* 1. ชื่อยา (3 cols) */}
      <div className="col-span-3">
        <p className="text-sm font-bold text-slate-800 truncate">{item.drug_name}</p>
      </div>
      
      {/* 2. จำนวน (1 col) */}
      <div className="col-span-1 text-slate-600 font-medium text-sm">{item.qty} {item.unit}</div>

      {/* 3. Lot (1 col) */}
      <div className="col-span-1 text-slate-500 font-mono text-center text-sm">{item.lot_number ?? '-'}</div>

      {/* 4. Exp (1 col) */}
      <div className="col-span-1 text-slate-500 text-center text-sm">
        {item.exp_date ? new Date(item.exp_date).toLocaleDateString('th-TH', { month: '2-digit', year: '2-digit' }) : '-'}
      </div>

{/* เงื่อนไขแสดง Dropdown และ Badge เฉพาะ "รับคืนแลกเปลี่ยน" */}
{isExchangeRequest ? (
  <>
    <div className="col-span-2">
      <select 
        className={`w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none transition-all 
          ${item.current_status !== 'pending_review' 
            ? 'opacity-50 cursor-not-allowed bg-slate-100' 
            : 'focus:ring-2 focus:ring-teal-100'}`}
        value={productType} 
        onChange={(e) => handleTypeChange(e.target.value)}
        disabled={item.current_status !== 'pending_review'}
      >
        <option value="">เลือกประเภท...</option>
        <option value="GPO">GPO ผลิตเอง</option>
        <option value="OTHER">สมุนไพร/อื่น ๆ</option>
      </select>
    </div>
    <div className="col-span-1 flex justify-center">
      {status.pass === true ? (
        <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-100">ผ่าน</span>
      ) : status.pass === false ? (
        <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-black border border-red-100">ไม่ผ่าน</span>
      ) : (
        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">รอตรวจ</span>
      )}
    </div>
  </>
) : (
  // ถ้าไม่ใช่ "รับคืนแลกเปลี่ยน" ให้เว้นว่างไว้ 3 คอลัมน์เพื่อให้ปุ่มยืนยันอยู่ขวาสุดเหมือนเดิม
  <div className="col-span-3" />
)}

      {/* 7. ปุ่มยืนยัน (ขยายพื้นที่ให้อยู่ทางขวาเสมอ) */}
      <div className="col-span-3 flex justify-end gap-2">
        {item.current_status === 'pending_review' ? (
          <>
            <button onClick={() => handleItemAction('approve')} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-emerald-700 transition-all">อนุมัติ</button>
            <button onClick={() => handleItemAction('reject')} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-red-600 transition-all">ปฏิเสธ</button>
          </>
        ) : (
          <span className={`text-xs font-bold ${item.current_status === 'rejected' ? 'text-red-500' : 'text-emerald-600'}`}>
            {item.current_status === 'rejected' ? 'ปฏิเสธแล้ว' : 'อนุมัติแล้ว'}
          </span>
        )}
      </div>
    </div>
  );
}