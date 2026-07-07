'use client'

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { trackMyRequestByRefId } from '@/app/actions/tracking-actions';

function TrackingContent() {
  const searchParams = useSearchParams();
  const [refId, setRefId] = useState(searchParams.get('ref') || '');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performSearch = async (id: string) => {
    const cleaned = id.trim();
    if (!cleaned) return;
    
    setLoading(true);
    setError(null);
    setData(null); // ล้างข้อมูลเก่าก่อนเริ่มค้นหาใหม่

    try {
      const result = await trackMyRequestByRefId(cleaned);
      if (!result.success) {
        setError(result.error ?? 'เกิดข้อผิดพลาด');
      } else {
        setData(result.data);
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const refFromUrl = searchParams.get('ref');
    if (refFromUrl) {
      setRefId(refFromUrl);
      performSearch(refFromUrl);
    }
  }, [searchParams]);

  return (
    <>
      <form 
        onSubmit={(e) => { e.preventDefault(); performSearch(refId); }} 
        className="mb-8 flex gap-4"
      >
        <input
          className="flex-1 border-2 border-slate-200 rounded-xl p-3 focus:border-teal-500 outline-none transition-all"
          placeholder="กรอกเลขอ้างอิง (Ref ID)..."
          value={refId}
          onChange={(e) => setRefId(e.target.value.toUpperCase())}
        />
        <button 
          type="submit" 
          disabled={loading || !refId.trim()} 
          className={`px-6 rounded-xl font-bold transition-all ${
            !refId.trim() 
              ? 'bg-slate-300 cursor-not-allowed' 
              : 'bg-teal-700 text-white hover:bg-teal-800'
          }`}
        >
          {loading ? 'กำลังค้นหา...' : 'ติดตามงาน'}
        </button>
      </form>

      {error && <p className="text-red-500 font-bold text-center py-4">{error}</p>}

      {data && (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-xl font-black text-slate-800">ใบงานเลขที่: {data.ref_id}</h2>
            <p className="text-slate-500 mt-1">สถานะล่าสุด: {data.current_status}</p>
          </div>

          <div className="relative border-l-2 border-slate-200 ml-3 space-y-8">
            {data.timeline?.map((log: any, index: number) => (
              <div key={index} className="relative pl-8">
                {/* จุดบ่งบอกสถานะ (สีแดงถ้า reject) */}
                <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full shadow-sm ${log.status_name === 'reject' ? 'bg-red-500' : 'bg-teal-500'}`} />
                
                <p className="text-xs text-slate-400 font-mono">
                  {new Date(log.log_date).toLocaleString('th-TH')}
                </p>
                <h4 className={`font-bold ${log.status_name === 'reject' ? 'text-red-700' : 'text-teal-900'}`}>
                  {log.status_name}
                </h4>
                
                {/* แสดง Remark เฉพาะหน้า Private นี้ */}
                {log.staff_remark && (
                  <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl mt-2 border border-slate-100">
                    {log.staff_remark}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function TrackingPage() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <Suspense fallback={<div className="text-center py-10">กำลังโหลด...</div>}>
        <TrackingContent />
      </Suspense>
    </div>
  );
}