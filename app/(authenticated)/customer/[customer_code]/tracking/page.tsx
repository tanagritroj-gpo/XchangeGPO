'use client'

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getTrackingTimeline } from '@/app/actions/tracking-actions';

function TrackingContent() {
  const searchParams = useSearchParams();
  const refFromUrl = searchParams.get('ref');

  const [refId, setRefId] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // ฟังก์ชันดึงและคำนวณ Timeline
  const performSearch = async (id: string) => {
    if (!id) return;
    setLoading(true);
    const result = await getTrackingTimeline(id);

    // Logic ของกิต: เช็คและเพิ่ม pending_review
    if (result?.request && result.timeline) {
      const hasPending = result.timeline.some((log: any) => log.status_name === 'pending_review');
      if (!hasPending) {
        result.timeline.unshift({
          status_name: 'pending_review',
          log_date: result.request.created_at,
          staff_remark: 'ได้รับคำร้องเข้าสู่ระบบ'
        });
      }
    }

    setData(result);
    setLoading(false);
  };

  // ดึงค่าจาก URL ทันทีที่โหลดหน้าจอ
  useEffect(() => {
    if (refFromUrl) {
      setRefId(refFromUrl);
      performSearch(refFromUrl);
    }
  }, [refFromUrl]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(refId);
  };

  return (
    <>
      <form onSubmit={handleSearch} className="mb-8 flex gap-4">
        <input
          className="flex-1 border rounded-xl p-3"
          placeholder="กรอกเลขอ้างอิง (Ref ID) เพื่อติดตามสถานะ..."
          value={refId}
          onChange={(e) => setRefId(e.target.value)}
        />
        <button type="submit" className="bg-teal-700 text-white px-6 rounded-xl font-bold">
          {loading ? 'ค้นหา...' : 'ติดตามงาน'}
        </button>
      </form>

      {data?.request && (
        <div className="space-y-8">
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
      <Suspense fallback={<div className="text-center py-10 text-slate-400">กำลังโหลด...</div>}>
        <TrackingContent />
      </Suspense>
    </div>
  );
}