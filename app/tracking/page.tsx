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
    const cleaned = targetRef.trim();
    if (!cleaned) return;
    if (cleaned.length > 50) {
      setError('รหัสอ้างอิงไม่ถูกต้อง');
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const result = await getTrackingTimeline(cleaned);
      if (result.error) {
        setError(result.error);
      } else {
        setData(result);
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อกับฐานข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const refFromUrl = searchParams.get('ref');
    if (refFromUrl) handleSearch(refFromUrl);
  }, []); 

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      {/* ปุ่มกลับหน้าหลัก - ดีไซน์เดิมที่กิตชอบ */}
      <div className="mb-6">
        <a href="/welcome" className="inline-flex items-center gap-1.5 font-bold bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg shadow transition-all">
          ← กลับหน้าหลัก
        </a>
      </div>

      <h1 className="text-2xl font-black text-slate-800 mb-6">ตรวจสอบสถานะคำร้อง</h1>
      
      <form onSubmit={(e) => { e.preventDefault(); handleSearch(refId); }} className="mb-8 flex flex-col md:flex-row gap-3">
<input
    className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-teal-500 outline-none transition-all"
    placeholder="กรอกเลขอ้างอิง (เช่น REF-XXXXX)..."
    value={refId}
    onChange={(e) => setRefId(e.target.value.toUpperCase())}
    maxLength={50}
  />
  <button 
    type="submit" 
    // เพิ่มเงื่อนไข disabled ตรงนี้ครับ: กันทั้งตอนโหลด และกันตอนไม่ได้กรอกข้อมูล
    disabled={loading || !refId.trim()} 
    className={`px-6 rounded-xl font-bold transition-all py-3 md:py-0 ${
      !refId.trim() 
        ? 'bg-slate-300 cursor-not-allowed' 
        : 'bg-teal-700 text-white hover:bg-teal-800'
    }`}
  >
    {loading ? 'กำลังค้นหา...' : 'ติดตามงาน'}
  </button>
      </form>

      {error && <p className="text-red-500 font-bold text-center py-4">{error}</p>}

      {data?.request && (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* ส่วนแสดงหัวข้อใบงาน */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-xl font-black text-slate-800">ใบงานเลขที่: {data.request.ref_id}</h2>
            <p className="text-sm text-slate-500 font-medium mt-1">สถานะล่าสุด: {data.request.current_status}</p>
          </div>

          {/* Timeline - ปรับให้เหมือนโค้ดเก่าที่กิตชอบเป๊ะ */}
          <div className="relative border-l-2 border-slate-200 ml-3 space-y-8">
            {data.timeline?.map((log: any, index: number) => (
              <div key={index} className="relative pl-8">
                <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-teal-500 shadow-sm" />
                <p className="text-xs text-slate-400 font-mono">
                  {new Date(log.log_date).toLocaleString('th-TH')}
                </p>
                <h4 className="font-bold text-teal-900">{log.status_name}</h4>
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
    <Suspense fallback={<div className="text-center py-10">กำลังโหลด...</div>}>
      <TrackingContent />
    </Suspense>
  );
}