'use client'

import { useEffect, useState, use } from 'react';
import { getCustomerExchangeHistory } from '@/app/actions/history-actions';

// ── Helper Logic ──
const hasRejectedItem = (items: any[]) => items?.some(item => item.current_status === 'rejected');

const getBorderColor = (status: string, items: any[]) => {
  if (hasRejectedItem(items)) return 'border-l-rose-500';
  if (status === 'completed') return 'border-l-emerald-500';
  if (['in_transit', 'at_warehouse', 'exchanging'].includes(status)) return 'border-l-amber-500';
  return 'border-l-slate-300';
};

export default function HistoryPage({ params }: { params: Promise<{ customer_code: string }> }) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { customer_code } = use(params); 

  useEffect(() => {
    async function loadHistory() {
      if (!customer_code) return;
      const data = await getCustomerExchangeHistory(customer_code); 
      setHistory(data);
      setLoading(false);
    }
    loadHistory();
  }, [customer_code]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-800">ประวัติการแลกเปลี่ยนสินค้า</h1>
        <div className="text-sm font-medium text-slate-400">{history.length} รายการ</div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">กำลังโหลดประวัติ...</div>
      ) : (
        <div className="space-y-4">
          {history.map((request) => (
            <div 
              key={request.id} 
              className={`bg-white rounded-2xl shadow-sm border border-slate-100 border-l-[6px] p-6 transition-all hover:shadow-md ${getBorderColor(request.current_status, request.drug_items)}`}
            >
{/* Header: แสดง Badge Request Type เฉพาะเมื่อมีค่า */}
<div className="flex justify-between items-start mb-4">
  <div>
    <div className="flex items-center gap-2 mb-1">
      <h3 className="text-lg font-black text-slate-800">{request.ref_id}</h3>
      
      {/* แก้ไขตรงนี้ครับ */}
      {request.request_type && (
        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-teal-50 text-teal-700 border border-teal-100 uppercase">
          {request.request_type}
        </span>
      )}
    </div>
    <p className="text-xs text-slate-400 font-medium">
      {new Date(request.created_at).toLocaleDateString('th-TH', { dateStyle: 'long' })}
    </p>
  </div>
  <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 uppercase">
    {request.current_status}
  </span>
</div>

{/* Items List: แสดงรายละเอียดครบถ้วน */}
<div className="space-y-2 mb-5">
  {/* หัวตารางย่อย */}
  <div className="grid grid-cols-12 gap-2 px-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
    <div className="col-span-4">ชื่อยา</div>
    <div className="col-span-1">จำนวน</div>
    <div className="col-span-2">Lot</div>
    <div className="col-span-2">Exp</div>
    <div className="col-span-3 text-right">มูลค่า</div>
  </div>

  {request.drug_items?.map((item: any) => (
    <div key={item.id} className="grid grid-cols-12 gap-2 text-xs bg-slate-50 p-3 rounded-xl items-center border border-slate-100">
      {/* ชื่อยา */}
      <div className="col-span-4 font-bold text-slate-700 truncate">{item.drug_name}</div>
      
      {/* จำนวน */}
      <div className="col-span-1 text-slate-600 font-medium">{item.qty} {item.unit}</div>
      
      {/* Lot No. */}
      <div className="col-span-2 text-slate-500 font-mono text-[10px]">{item.lot_number ?? '-'}</div>
      
      {/* วันหมดอายุ */}
      <div className="col-span-2 text-slate-500 text-[10px]">
        {item.exp_date ? new Date(item.exp_date).toLocaleDateString('th-TH', { month: '2-digit', year: '2-digit' }) : '-'}
      </div>
      
      {/* มูลค่า */}
      <div className="col-span-3 text-right font-bold text-teal-600">
        ฿{Number(item.value_amount || 0).toLocaleString()}
      </div>
    </div>
  ))}
</div>

              {/* Footer */}
              <a 
                href={`/customer/${customer_code}/tracking?ref=${request.ref_id}`}
                className="block w-full py-2.5 text-center text-xs font-bold text-teal-700 bg-teal-50 rounded-xl hover:bg-teal-100 transition-colors"
              >
                ดูประวัติ Timeline ทั้งหมด
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}