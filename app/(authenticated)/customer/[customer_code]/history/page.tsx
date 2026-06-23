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
  
  // แกะค่า params ที่เป็น Promise ออกมา
const { customer_code } = use(params); 

// ลองใส่ log ตรงนี้ดูครับ
useEffect(() => {
  async function loadHistory() {
    if (!customer_code) return;
    // ส่งค่า ID นี้ไปที่ Action
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
              {/* Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-800">#{request.ref_id}</h3>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    {new Date(request.created_at).toLocaleDateString('th-TH', { dateStyle: 'long' })}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 uppercase">
                  {request.current_status}
                </span>
              </div>

              {/* Items List */}
              <div className="space-y-2 mb-5">
                {request.drug_items?.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-center text-sm bg-slate-50 p-3 rounded-lg">
                    <span className="font-medium text-slate-600">{item.drug_name}</span>
                    <span className={`text-[10px] font-bold uppercase ${item.current_status === 'rejected' ? 'text-rose-600' : 'text-slate-500'}`}>
                      {item.current_status}
                    </span>
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