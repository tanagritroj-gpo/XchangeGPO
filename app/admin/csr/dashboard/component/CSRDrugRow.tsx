'use client';
import { useState, useEffect } from 'react';
import { updateDrugCompliance, approveDrugItem, rejectDrugItem } from '@/app/actions/csr-actions';
import { getStaffSession } from '@/app/actions/auth-staff';

export default function CSRDrugRow({ item, onUpdate }: { item: any; onUpdate: () => void }) {
  const isExchangeRequest = item.request_type === 'รับคืนแลกเปลี่ยน';
  const [productType, setProductType] = useState(item.product_type || '');
  const [status, setStatus] = useState({ pass: item.is_compliant, msg: item.compliance_remark || '' });
  const [localStatus, setLocalStatus] = useState(item.current_status);

  useEffect(() => { setLocalStatus(item.current_status); }, [item.current_status]);

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
  };

  const handleItemAction = async (action: 'approve' | 'reject') => {
    const remark = prompt(`ระบุหมายเหตุการ${action === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ'}รายการยา:`);
    if (remark === null) return;
    try {
      const session = await getStaffSession();
      if (!session?.id) return alert('ไม่พบ Session พนักงาน');
      const res = action === 'approve'
        ? await approveDrugItem(item.id, item.request_id, session.id, remark)
        : await rejectDrugItem(item.id, item.request_id, session.id, remark);
      if (res.success) {
        setLocalStatus(action === 'approve' ? 'approved' : 'rejected');
      } else {
        alert('เกิดข้อผิดพลาด: ' + (res as any).error);
      }
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  };

  return (
    // Mobile: stack แนวตั้ง / Desktop: grid แนวนอน
    <div className="flex flex-col md:grid md:grid-cols-12 md:gap-3 gap-3 px-4 py-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-teal-200 hover:shadow-md transition-all">

      {/* ชื่อยา */}
      <div className="md:col-span-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5 md:hidden">ชื่อยา</p>
        <p className="text-sm font-bold text-slate-800">{item.drug_name}</p>
      </div>

      {/* จำนวน + Lot + Exp — mobile: row / desktop: แยก col */}
      <div className="flex gap-4 md:contents">
        <div className="md:col-span-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5 md:hidden">จำนวน</p>
          <p className="text-sm font-medium text-slate-600">{item.qty} {item.unit}</p>
        </div>
        <div className="md:col-span-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5 md:hidden">Lot</p>
          <p className="text-sm font-mono text-slate-500">{item.lot_number ?? '-'}</p>
        </div>
        <div className="md:col-span-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5 md:hidden">Exp</p>
          <p className="text-sm text-slate-500">
            {item.exp_date ? new Date(item.exp_date).toLocaleDateString('th-TH', { month: '2-digit', year: '2-digit' }) : '-'}
          </p>
        </div>
      </div>

      {/* ประเภท + เกณฑ์ (เฉพาะแลกเปลี่ยน) */}
{isExchangeRequest ? (
  <>
    <div className="md:col-span-2">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 md:hidden">ประเภท</p>
      {/* เปลี่ยนจาก <select> เป็น button group */}
<div className={`flex rounded-xl border border-slate-200 overflow-hidden text-[11px] font-bold transition-all
  ${localStatus !== 'pending_review' ? 'opacity-50 pointer-events-none' : ''}`}>
  <button
    type="button"
    onClick={() => handleTypeChange('GPO')}
    className={`flex-1 py-2 px-2 text-center transition-all border-r border-slate-200
      ${productType === 'GPO'
        ? 'bg-teal-600 text-white border-r-teal-600'
        : 'bg-white text-slate-400 hover:bg-teal-50 hover:text-teal-700'}`}
  >
    GPO
  </button>
  <button
    type="button"
    onClick={() => handleTypeChange('OTHER')}
    className={`flex-1 py-2 px-2 text-center transition-all
      ${productType === 'OTHER'
        ? 'bg-orange-500 text-white'
        : 'bg-white text-slate-400 hover:bg-orange-50 hover:text-orange-600'}`}
  >
    สมุนไพร/ผู้ผลิตอื่น
  </button>
</div>
    </div>

    <div className="md:col-span-1 flex md:justify-center items-start md:items-center">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5 md:hidden mr-2 mt-1">เกณฑ์</p>
      {status.pass === true  ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-100">ผ่าน</span> :
       status.pass === false ? <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-black border border-red-100">ไม่ผ่าน</span> :
       <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">รอตรวจ</span>}
    </div>
  </>
) : (
  <div className="hidden md:block md:col-span-3" />
)}

      {/* Actions */}
      <div className="md:col-span-3 flex justify-end gap-2 pt-1 md:pt-0 border-t border-slate-100 md:border-0">
        {localStatus === 'pending_review' ? (
          <>
            <button onClick={() => handleItemAction('approve')}
              className="flex-1 md:flex-none px-3 py-2 md:py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-emerald-700 transition-all">
              อนุมัติ
            </button>
            <button onClick={() => handleItemAction('reject')}
              className="flex-1 md:flex-none px-3 py-2 md:py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-red-600 transition-all">
              ปฏิเสธ
            </button>
          </>
        ) : (
          <span className={`text-xs font-bold ${localStatus === 'rejected' ? 'text-red-500' : 'text-emerald-600'}`}>
            {localStatus === 'rejected' ? 'ปฏิเสธแล้ว' : 'อนุมัติแล้ว'}
          </span>
        )}
      </div>
    </div>
  );
}