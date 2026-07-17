'use client'

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getTrackingTimeline } from '@/app/actions/tracking-actions';
import {
  ArrowLeft,
  Search,
  Copy,
  Check,
  Printer,
  RefreshCw,
  Pill,
} from 'lucide-react';
import {
  STAGES,
  getStatusLabel,
  getStatusMeta,
  getTimelineDescription,
  getCurrentStageIndex,
  REJECTED_STATUS,
} from '@/lib/tracking-status';

function TrackingContent() {
  const searchParams = useSearchParams();
  const [refId, setRefId] = useState(searchParams.get('ref') || '');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const handleCopy = async () => {
    if (!data?.request?.ref_id) return;
    try {
      await navigator.clipboard.writeText(data.request.ref_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard อาจถูกบล็อกใน browser บางตัว — ไม่ต้อง error แค่เงียบไว้
    }
  };

  const handleRefresh = () => {
    if (refId.trim()) handleSearch(refId);
  };

  const currentStageIndex = data?.request
    ? getCurrentStageIndex(data.request.current_status)
    : -1;
  const isRejected = data?.request?.current_status === REJECTED_STATUS;

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 print:py-0 print:px-0">
      {/* ปุ่มกลับหน้าหลัก */}
      <div className="mb-6 print:hidden">
        <a
          href="/welcome"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700 px-2.5 py-1.5 -ml-2.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          กลับหน้าหลัก
        </a>
      </div>

      <h1 className="text-2xl font-black text-slate-800 mb-1">ตรวจสอบสถานะคำร้อง</h1>
      <p className="text-sm text-slate-500 font-medium mb-6 print:hidden">
        กรอกเลขอ้างอิงที่ได้รับทางอีเมลเพื่อดูสถานะล่าสุด หากต้องการข้อมูลในรายละเอียดโปรด{' '}
        <a href="/auth/login" className="text-teal-700 font-semibold hover:underline">
          เข้าสู่ระบบ
        </a>
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSearch(refId);
        }}
        className="mb-8 flex flex-col md:flex-row gap-3 print:hidden"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-slate-200 focus:border-teal-500 outline-none transition-all"
            placeholder="กรอกเลขอ้างอิง (เช่น REF-XXXXX)..."
            value={refId}
            onChange={(e) => setRefId(e.target.value.toUpperCase())}
            maxLength={50}
          />
        </div>
        <button
          type="submit"
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

      {loading && !data && (
        <div className="space-y-4 animate-pulse">
          <div className="h-20 bg-slate-100 rounded-2xl" />
          <div className="h-16 bg-slate-100 rounded-2xl" />
          <div className="h-16 bg-slate-100 rounded-2xl" />
        </div>
      )}

      {data?.request && (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* ส่วนแสดงหัวข้อใบงาน */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs text-slate-400 font-medium mb-1">ใบงานเลขที่</p>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-slate-800">{data.request.ref_id}</h2>
                  <button
                    onClick={handleCopy}
                    aria-label="คัดลอกเลขอ้างอิง"
                    className="text-slate-400 hover:text-teal-600 transition-colors print:hidden"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <span
                className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                  isRejected
                    ? 'bg-red-50 text-red-700'
                    : data.request.current_status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {getStatusLabel(data.request.current_status)}
              </span>
            </div>

            {/* Stepper สรุปภาพรวม — โชว์เฉพาะตอนจับคู่ status ได้ */}
            {currentStageIndex >= 0 && (
              <div className="flex items-center mt-6">
                {STAGES.map((stage, i) => (
                  <div key={stage.key} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center flex-1">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          i < currentStageIndex
                            ? 'bg-emerald-500'
                            : i === currentStageIndex
                            ? 'bg-amber-500'
                            : 'bg-slate-200'
                        }`}
                      >
                        {i < currentStageIndex && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <p
                        className={`text-[11px] mt-1.5 text-center ${
                          i <= currentStageIndex ? 'text-slate-700 font-semibold' : 'text-slate-400'
                        }`}
                      >
                        {stage.label}
                      </p>
                    </div>
                    {i < STAGES.length - 1 && (
                      <div
                        className={`h-0.5 flex-1 -mt-5 ${
                          i < currentStageIndex ? 'bg-emerald-500' : 'bg-slate-200'
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* รายการยา — โชว์เสมอทุกสถานะ ไม่จำกัดเฉพาะตอนถูกปฏิเสธ ไฮไลต์เป็นรายชิ้นแทนถ้าโดน reject */}
          {data.drug_items?.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Pill className="w-4 h-4 text-slate-400" />
                <p className="text-sm font-bold text-slate-500">รายการยา</p>
              </div>
              <div className="space-y-3">
                {data.drug_items.map((item: any, index: number) => {
                  const itemRejected = item.current_status === REJECTED_STATUS;
                  return (
                    <div
                      key={index}
                      className={`rounded-xl p-3.5 border flex items-start justify-between gap-3 flex-wrap ${
                        itemRejected ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-800 text-sm">{item.drug_name}</p>
                          {itemRejected && (
                            <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                              ถูกปฏิเสธ
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {item.lot_number && <>Lot. {item.lot_number}</>}
                          {item.lot_number && item.exp_date && ' · '}
                          {item.exp_date && (
                            <>หมดอายุ {new Date(item.exp_date).toLocaleDateString('th-TH')}</>
                          )}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                        {item.qty} {item.unit}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Timeline พร้อมไอคอนตามสถานะ */}
          <div>
            <p className="text-sm font-bold text-slate-500 mb-3">ประวัติการดำเนินการ</p>
            <div className="relative border-l-2 border-slate-200 ml-3 space-y-8">
              {data.timeline?.map((log: any, index: number) => {
                const meta = getStatusMeta(log.status_name);
                const Icon = meta.icon;
                return (
                  <div key={index} className="relative pl-8">
                    <div
                      className={`absolute -left-[17px] top-0 w-8 h-8 rounded-full ${meta.bg} flex items-center justify-center shadow-sm`}
                    >
                      <Icon className={`w-4 h-4 ${meta.fg}`} />
                    </div>
                    <p className="text-xs text-slate-400 font-mono">
                      {new Date(log.log_date).toLocaleString('th-TH')}
                    </p>
                    <h4 className="font-bold text-teal-900">{log.status_name}</h4>
                    {getTimelineDescription(log.status_name) && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {getTimelineDescription(log.status_name)}
                      </p>
                    )}
                    {log.drug_name && (
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        <Pill className="w-3 h-3" />
                        {log.drug_name}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action bar */}
          <div className="flex gap-3 print:hidden">
            <button
              onClick={() => window.print()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-all"
            >
              <Printer className="w-4 h-4" />
              พิมพ์
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              รีเฟรช
            </button>
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