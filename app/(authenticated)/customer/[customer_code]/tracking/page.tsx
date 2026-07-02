'use client'

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getTrackingTimeline } from '@/app/actions/tracking-actions';

function TrackingContent() {
  const searchParams = useSearchParams();
  const [refId, setRefId] = useState(searchParams.get('ref') || '');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performSearch = async (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);

    try {
      // Backend จัดการ Logic ทั้งหมดให้แล้ว ทั้งสิทธิ์การเข้าถึงและ Timeline
      const result = await getTrackingTimeline(id);
      
      if (result.error) {
        setError(result.error);
        setData(null);
      } else {
        setData(result);
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
      <form onSubmit={(e) => { e.preventDefault(); performSearch(refId); }} className="mb-8 flex gap-4">
        <input
          className="flex-1 border rounded-xl p-3 focus:outline-teal-500"
          placeholder="กรอกเลขอ้างอิง (Ref ID)..."
          value={refId}
          onChange={(e) => setRefId(e.target.value.toUpperCase())}
        />
        <button type="submit" disabled={loading} className="bg-teal-700 text-white px-6 rounded-xl font-bold hover:bg-teal-800 transition-all">
          {loading ? 'กำลังค้นหา...' : 'ติดตามงาน'}
        </button>
      </form>

      {error && <p className="text-red-500 font-bold text-center py-4">{error}</p>}

      {data?.request && (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <h2 className="text-xl font-black">ใบงานเลขที่: {data.request.ref_id}</h2>
            <p className="text-slate-500">สถานะล่าสุด: {data.request.current_status}</p>
          </div>

          <div className="relative border-l-2 border-slate-200 ml-3 space-y-8">
            {data.timeline?.map((log: any, index: number) => (
              <div key={index} className="relative pl-8">
                <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-teal-500" />
                <p className="text-xs text-slate-400 font-mono">
                  {new Date(log.log_date).toLocaleString('th-TH')}
                </p>
                <h4 className="font-bold text-teal-900">{log.status_name}</h4>
                <p className="text-sm text-slate-600">{log.staff_remark}</p>
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