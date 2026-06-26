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

  const handleSearch = async (targetRef: string) => {
    if (!targetRef || targetRef.trim() === '') {
      alert('กรุณากรอกเลขอ้างอิง (Ref ID) ก่อนกดติดตามงานนะครับ');
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const result = await getTrackingTimeline(targetRef);
      
      if (result.error) {
        setError(result.error);
      } else {
        const hasPending = result.timeline?.some((log: any) => log.status_name === 'pending_review');
        if (result.timeline && !hasPending) {
          result.timeline.unshift({
            status_name: 'pending_review',
            log_date: result.request.created_at,
            staff_remark: 'ได้รับคำร้องเข้าสู่ระบบแล้ว',
            department: 'System'
          });
        }
        setData(result);
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setLoading(false);
    }
  };

  // --- ส่วนที่ปรับเพิ่ม: โหลดข้อมูลอัตโนมัติเมื่อเข้าหน้าด้วย ref ใน URL ---
  useEffect(() => {
    const refFromUrl = searchParams.get('ref');
    if (refFromUrl) {
      setRefId(refFromUrl);
      handleSearch(refFromUrl);
    }
  }, []); 

  return (
    <div className="max-w-3xl mx-auto py-10 px-6">
      <div className="mb-6">
        <a href="/" className="inline-flex items-center text-teal-700 font-bold hover:text-teal-900 transition-all">
          <span className="mr-2">←</span> กลับหน้าหลัก
        </a>
      </div>

      <h1 className="text-2xl font-black text-slate-800 mb-6">ตรวจสอบสถานะคำร้อง</h1>
      
      <form onSubmit={(e) => { e.preventDefault(); handleSearch(refId); }} className="mb-8 flex gap-3">
        <input
          className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-teal-500 outline-none transition-all"
          placeholder="กรอกเลขอ้างอิง (เช่น REF-XXXXX)..."
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
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-black text-slate-800">เลขที่ใบงาน: {data.request.ref_id}</h2>
            <p className="text-sm text-slate-500 font-medium">หน่วยงาน: {data.request.hospital_name}</p>
          </div>

          <div className="relative border-l-2 border-slate-200 ml-3 space-y-8">
            {data.timeline?.map((log: any, index: number) => (
              <div key={index} className="relative pl-8">
                <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-teal-500 shadow-sm" />
                <p className="text-[10px] text-slate-400 font-mono">
                  {new Date(log.log_date).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
                <h4 className="font-black text-teal-800 text-sm">{log.status_name}</h4>
                <p className="text-sm text-slate-600 font-medium">{log.staff_remark}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TrackingPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TrackingContent />
    </Suspense>
  );
}