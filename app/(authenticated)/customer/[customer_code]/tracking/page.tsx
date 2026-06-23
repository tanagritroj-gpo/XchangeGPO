'use client'

import { useState } from 'react';
import { getTrackingTimeline } from '@/app/actions/tracking-actions';

export default function TrackingPage({ params }: { params: { customer_code: string } }) {
  const [refId, setRefId] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const result = await getTrackingTimeline(refId);

    // เพิ่ม Logic ตรงนี้เท่านั้น: เช็คและเพิ่ม pending_review ถ้ายังไม่มีใน timeline
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

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* ส่วน Search Bar */}
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

      {/* ส่วนแสดงผล */}
      {data?.request && (
        <div className="space-y-8">
          {/* สรุปข้อมูลหลัก */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <h2 className="text-xl font-black">ใบงานเลขที่: {data.request.ref_id}</h2>
            <p className="text-slate-500">สถานะล่าสุด: {data.request.current_status}</p>
          </div>

          {/* Timeline ประวัติ 7 ขั้นตอน */}
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
    </div>
  );
}