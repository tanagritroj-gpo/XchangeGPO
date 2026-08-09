'use client'

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { pingRequestAttention, getPingStatus } from '@/app/actions/ping-actions';
import { generatePdfAction } from '@/app/actions/generate-pdf-action';
import {
  Search,
  Copy,
  Check,
  Printer,
  RefreshCw,
  Pill,
  FileText,
  AlertCircle,
  PackageSearch,
  Bell,
  BellRing,
  FileDown,
} from 'lucide-react';
import {
  STAGES,
  getStatusLabel,
  getStatusMeta,
  getTimelineDescription,
  getCurrentStageIndex,
  formatCurrency,
  REJECTED_STATUS,
} from '@/lib/tracking-status';
import { Skeleton } from '@/components/ui/skeleton';
import { RequestDetailSkeleton } from '@/components/skeletons/HistoryListSkeleton';
import type { RequestRow, DrugItemRow } from '@/lib/types';

// ══ ส่วนแสดงรายละเอียด tracking แบบ private (ต้อง login) ที่ใช้ร่วมกันระหว่างหน้า
// "ติดตามสถานะคำร้องของฉัน" ของลูกค้า (app/(authenticated)/customer/tracking/page.tsx)
// และหน้า "Track & Trace" ของ Manager (app/admin/manager/tracking/page.tsx) — สอง
// หน้านี้ต่างกันแค่ (1) ฟังก์ชันดึงข้อมูล [ลูกค้า scope ด้วยหน่วยงานตัวเอง / manager
// เห็นได้ทุกใบงาน] และ (2) ปุ่ม "เร่งงาน"+"ดาวน์โหลด PDF" ที่ผูกกับ session ลูกค้าโดยตรง
// (pingRequestAttention/generatePdfAction เช็ค getCustomerSession() ภายใน) จึงใช้ไม่ได้
// กับ manager เลย — ควบคุมด้วย showPingButton/showPdfDownload แทนการ fork ทั้งไฟล์ ==

// รูปแบบข้อมูลที่ทั้ง trackMyRequestByRefId() และ getRequestTrackingForStaff()
// (ทั้งคู่ private, ต้อง login) คืนจริง — request เต็มทุกคอลัมน์ + timeline พร้อม staff_remark
export interface PrivateTrackingDetail extends RequestRow {
  timeline: { status_name: string; log_date: string | null; staff_remark: string | null; drug_item_id: number | null; drug_name: string | null }[];
}

type FetchResult = { success: boolean; error?: string; data?: PrivateTrackingDetail };

function InfoRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value?: string | number | null;
  highlight?: boolean;
}) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={highlight ? 'font-bold text-teal-700' : 'font-medium text-slate-700'}>{value}</p>
    </div>
  );
}

/** ปุ่มกระดิ่งเร่งงาน — 3 สถานะ: กดได้ / cooldown (เพิ่งกดไป) / ซ่อนไปเลยถ้างานจบ
 *  ไอคอนจาก lucide-react เข้าชุดกับทั้งระบบ (Bell = กดได้, BellRing = เพิ่งแจ้งไป)
 *  — เฉพาะฝั่งลูกค้าเท่านั้น (pingRequestAttention เช็ค customer session ภายใน) */
function PingButton({
  requestId,
  pingState,
  onPinged,
}: {
  requestId: number;
  pingState: {
    canPing: boolean;
    onCooldown: boolean;
    cooldownRemainingMinutes: number;
  } | null;
  onPinged: (result: { canPing: boolean; onCooldown: boolean; cooldownRemainingMinutes: number }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!pingState) return null; // ยังโหลดสถานะไม่เสร็จ — ไม่โชว์อะไรเลยกันกระพริบ

  const handlePing = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await pingRequestAttention(requestId);
      if (!result.success) {
        setError(result.error ?? 'เกิดข้อผิดพลาด');
        return;
      }
      // กดสำเร็จ — สลับเป็นสถานะ cooldown ทันทีโดยไม่ต้องรอ fetch ใหม่ (60 นาที = cooldown เต็ม
      // เพิ่งกดไปหมาดๆ ตรงกับ PING_COOLDOWN_MS ใน ping-actions.ts)
      onPinged({ canPing: false, onCooldown: true, cooldownRemainingMinutes: 60 });
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  };

  if (pingState.onCooldown) {
    return (
      <div className="print:hidden">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
          <BellRing className="h-3.5 w-3.5" />
          แจ้งแล้ว
        </span>
        <p className="mt-1 text-[11px] text-muted-foreground">
          แจ้งซ้ำได้ในอีกประมาณ {pingState.cooldownRemainingMinutes} นาที
        </p>
      </div>
    );
  }

  if (!pingState.canPing) return null; // งานจบแล้ว — ไม่มีเหตุผลให้เห็นปุ่มค้างอยู่

  return (
    <div className="print:hidden">
      <button
        onClick={handlePing}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-full border-2 border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-700 transition-all hover:bg-amber-50 disabled:opacity-50"
      >
        <Bell className={`h-3.5 w-3.5 ${loading ? 'animate-pulse' : ''}`} />
        {loading ? 'กำลังแจ้ง...' : 'เร่งงาน'}
      </button>
      {error && <p className="mt-1 text-[11px] font-medium text-red-500">{error}</p>}
    </div>
  );
}

/** badge ดาวน์โหลด PDF ใบรับคืน — เรียก generatePdfAction สดทุกครั้ง (signed URL อายุ 5 นาที
 *  เหมือนกัน ไม่ cache ไว้) แล้วเปิดเป็น modal เดียวกับตอนสร้างแบบฟอร์มเสร็จใหม่ๆ
 *  (ดู ReviewSuccessCard.tsx) — เฉพาะฝั่งลูกค้าเท่านั้น (generatePdfAction เช็ค
 *  customer session + org ownership ภายใน) */
function PdfDownloadBadge({ requestId, onOpen }: { requestId: number; onOpen: (url: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generatePdfAction(requestId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onOpen(result.url);
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="print:hidden">
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-full border-2 border-teal-200 px-3 py-1.5 text-xs font-bold text-teal-700 transition-all hover:bg-teal-50 disabled:opacity-50"
      >
        <FileDown className={`h-3.5 w-3.5 ${loading ? 'animate-pulse' : ''}`} />
        {loading ? 'กำลังเตรียม...' : 'ดาวน์โหลด PDF'}
      </button>
      {error && <p className="mt-1 text-[11px] font-medium text-red-500">{error}</p>}
    </div>
  );
}

export interface TrackingDetailViewProps {
  /** ดึงรายละเอียดคำร้อง — trackMyRequestByRefId (ลูกค้า, scope หน่วยงานตัวเอง) หรือ
   *  getRequestTrackingForStaff (manager/CSR, เห็นได้ทุกใบงาน) */
  fetchFn: (refId: string) => Promise<FetchResult>;
  heading: string;
  subheading: string;
  /** เฉพาะฝั่งลูกค้าเท่านั้น เพราะ pingRequestAttention ผูกกับ customer session ภายใน
   *  (ไม่มีความหมายสำหรับ manager ที่ดูแทนลูกค้า ไม่ได้เป็นเจ้าของคำร้อง) */
  showPingButton?: boolean;
  /** เฉพาะฝั่งลูกค้าเท่านั้น เพราะ generatePdfAction เช็ค customer session + org
   *  ownership ภายใน — manager ใช้ปุ่มนี้ไม่ได้ (ยังไม่มี action เวอร์ชัน manager) */
  showPdfDownload?: boolean;
}

function TrackingContent({
  fetchFn,
  heading,
  subheading,
  showPingButton = true,
  showPdfDownload = true,
}: TrackingDetailViewProps) {
  const searchParams = useSearchParams();
  const [refId, setRefId] = useState(searchParams.get('ref') || '');
  const [data, setData] = useState<PrivateTrackingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [pingState, setPingState] = useState<{
    canPing: boolean;
    onCooldown: boolean;
    cooldownRemainingMinutes: number;
  } | null>(null);
  const [pdfModalUrl, setPdfModalUrl] = useState<string | null>(null);

  const performSearch = async (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    setPingState(null);
    setHasSearched(true);

    try {
      const result = await fetchFn(id);

      if (!result.success || !result.data) {
        setError(result.error ?? 'เกิดข้อผิดพลาด');
      } else {
        setData(result.data);
        // เรียกเช็คสถานะกระดิ่งทันทีที่ค้นหาสำเร็จ (เฉพาะฝั่งลูกค้า) ไม่ต้องรอกดอะไรเพิ่ม
        if (showPingButton && result.data.id) {
          const status = await getPingStatus(result.data.id);
          if (status.success) {
            setPingState({
              canPing: status.canPing ?? false,
              onCooldown: status.onCooldown ?? false,
              cooldownRemainingMinutes: status.cooldownRemainingMinutes ?? 0,
            });
          }
        }
      }
    } catch {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleCopy = async () => {
    if (!data?.ref_id) return;
    try {
      await navigator.clipboard.writeText(data.ref_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard อาจถูกบล็อกใน browser บางตัว — ไม่ต้อง error แค่เงียบไว้
    }
  };

  const handleRefresh = () => {
    if (refId.trim()) performSearch(refId);
  };

  const currentStageIndex = data ? getCurrentStageIndex(data.current_status) : -1;
  const isRejected = data?.current_status === REJECTED_STATUS;

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 print:py-0 print:px-0">
      {/* หัวข้อ — icon badge เข้าชุดกับหน้าประวัติการแลกเปลี่ยน */}
      <div className="flex items-center gap-3.5 mb-1 print:hidden">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-teal-700 text-white shadow-lg shadow-teal-200">
          <Search className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">{heading}</h1>
          <p className="text-sm font-medium text-muted-foreground">{subheading}</p>
        </div>
      </div>
      {/* หัวข้อสำหรับตอนพิมพ์ — ไม่มี icon/คำอธิบายรอง เอาแค่ข้อความ */}
      <h1 className="hidden print:block text-2xl font-black text-foreground mb-4">{heading}</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          performSearch(refId);
        }}
        className="mt-8 mb-8 flex flex-col md:flex-row gap-3 print:hidden"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-border bg-white text-foreground focus:border-teal-500 focus:ring-4 focus:ring-teal-50 outline-none transition-all"
            placeholder="กรอกเลขอ้างอิง (Ref ID)..."
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
              ? 'bg-slate-200 text-muted-foreground cursor-not-allowed'
              : 'bg-teal-700 text-white shadow-md shadow-teal-200 hover:bg-teal-800 active:scale-[0.98]'
          }`}
        >
          {loading ? 'กำลังค้นหา...' : 'ติดตามงาน'}
        </button>
      </form>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 print:hidden">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-500" strokeWidth={2} aria-hidden="true" />
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </div>
      )}

      {loading && !data && (
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <div className="px-4 md:px-6 py-5 flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32 rounded" />
              <Skeleton className="h-3 w-24 rounded" />
            </div>
            <Skeleton className="h-7 w-20 rounded-full shrink-0" />
          </div>
          <RequestDetailSkeleton />
        </div>
      )}

      {/* Empty state — ก่อนค้นหาครั้งแรก ไม่ปล่อยพื้นที่ว่างเปล่าไว้เฉยๆ */}
      {!hasSearched && !loading && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-white/60 py-16 text-center print:hidden">
          <PackageSearch className="h-9 w-9 text-slate-300" strokeWidth={1.5} aria-hidden="true" />
          <p className="text-sm font-bold text-muted-foreground">กรอกเลขอ้างอิงด้านบนเพื่อติดตามสถานะ</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            เลขอ้างอิง (Ref ID) จะได้รับทางอีเมลทันทีหลังยื่นคำร้องคืนสินค้าสำเร็จ
          </p>
        </div>
      )}

      {data && (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* ส่วนแสดงหัวข้อใบงาน + stepper */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-border print:shadow-none print:border-slate-300">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">ใบงานเลขที่</p>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-foreground font-mono tracking-wide">{data.ref_id}</h2>
                  <button
                    onClick={handleCopy}
                    aria-label="คัดลอกเลขอ้างอิง"
                    className="text-muted-foreground hover:text-teal-600 transition-colors print:hidden"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                  {showPdfDownload && data.id && <PdfDownloadBadge requestId={data.id} onOpen={setPdfModalUrl} />}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span
                  className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                    isRejected
                      ? 'bg-red-50 text-red-700'
                      : data.current_status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {getStatusLabel(data.current_status)}
                </span>
                {showPingButton && data.id && (
                  <PingButton requestId={data.id} pingState={pingState} onPinged={setPingState} />
                )}
              </div>
            </div>

            {currentStageIndex >= 0 && (
              <div className="flex items-center mt-6">
                {STAGES.map((stage, i) => (
                  <div key={stage.key} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center flex-1">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-white ${
                          i < currentStageIndex
                            ? 'bg-emerald-500'
                            : i === currentStageIndex
                            ? 'bg-amber-500'
                            : 'bg-slate-200'
                        }`}
                      >
                        {i < currentStageIndex && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                      </div>
                      <p
                        className={`text-[11px] mt-1.5 text-center ${
                          i <= currentStageIndex ? 'text-slate-700 font-semibold' : 'text-muted-foreground'
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

          {/* รายละเอียดคำร้อง — เห็นได้เฉพาะฝั่ง login เข้ามาเท่านั้น */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-border print:shadow-none print:border-slate-300">
            <p className="text-sm font-bold text-muted-foreground mb-4">รายละเอียดคำร้อง</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <InfoRow label="โรงพยาบาล / ร้านยา" value={data.hospital_name} />
              <InfoRow label="ผู้ติดต่อ" value={data.contact_name} />
              <InfoRow label="เบอร์โทร" value={data.phone} />
              <InfoRow
                label="วันที่ยื่นคำร้อง"
                value={data.request_date && new Date(data.request_date).toLocaleDateString('th-TH')}
              />
              <InfoRow label="เหตุผลการคืน" value={data.return_reason} />
              <InfoRow label="วิธีคืนสินค้า" value={data.delivery_type} />
              <InfoRow label="มูลค่ารวม" value={formatCurrency(data.total_value)} highlight />
            </div>
          </div>

          {/* รายการยา พร้อมมูลค่าต่อรายการ (private only) */}
          {(data.drug_items?.length ?? 0) > 0 && (
            <div className="bg-white border border-border rounded-2xl p-5 shadow-sm print:shadow-none print:border-slate-300">
              <div className="flex items-center gap-2 mb-4">
                <Pill className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-bold text-muted-foreground">รายการยา</p>
              </div>
              <div className="space-y-3">
                {(data.drug_items ?? []).map((item: DrugItemRow, index: number) => {
                  const itemRejected = item.current_status === REJECTED_STATUS;
                  return (
                    <div
                      key={index}
                      className={`rounded-xl p-3.5 border flex items-start justify-between gap-3 flex-wrap ${
                        itemRejected ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-border'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-foreground text-sm">{item.drug_name}</p>
                          {itemRejected && (
                            <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                              ถูกปฏิเสธ
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.lot_number && <>Lot. {item.lot_number}</>}
                          {item.lot_number && item.exp_date && ' · '}
                          {item.exp_date && (
                            <>หมดอายุ {new Date(item.exp_date).toLocaleDateString('th-TH')}</>
                          )}
                        </p>
                        {item.value_amount != null && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            มูลค่า {formatCurrency(item.value_amount)}
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        {item.qty} {item.unit}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Timeline พร้อมหมายเหตุจากเจ้าหน้าที่ — private only, public ตัด staff_remark ออกไปแล้ว */}
          <div>
            <p className="text-sm font-bold text-muted-foreground mb-3">ประวัติการดำเนินการ</p>
            <div className="relative border-l-2 border-border ml-3 space-y-8">
              {data.timeline?.map((log, index: number) => {
                const meta = getStatusMeta(log.status_name);
                const Icon = meta.icon;
                return (
                  <div key={index} className="relative pl-8">
                    <div
                      className={`absolute -left-[17px] top-0 w-8 h-8 rounded-full ring-4 ring-white ${meta.bg} flex items-center justify-center`}
                    >
                      <Icon className={`w-4 h-4 ${meta.fg}`} />
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                      {new Date(log.log_date || 0).toLocaleString('th-TH')}
                    </p>
                    <h4 className="font-bold text-teal-900">{log.status_name}</h4>
                    {getTimelineDescription(log.status_name) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {getTimelineDescription(log.status_name)}
                      </p>
                    )}
                    {log.drug_name && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Pill className="w-3 h-3" />
                        {log.drug_name}
                      </p>
                    )}
                    {log.staff_remark && (
                      <p className="text-sm text-slate-600 mt-2 bg-slate-50 border border-border rounded-lg px-3 py-2 flex items-start gap-1.5">
                        <FileText className="w-3.5 h-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                        {log.staff_remark}
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
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-border font-bold text-slate-600 hover:bg-slate-50 transition-all"
            >
              <Printer className="w-4 h-4" />
              พิมพ์
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-border font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              รีเฟรช
            </button>
          </div>
        </div>
      )}

      {/* ══ โมดัลดูใบรับคืน — pattern เดียวกับตอนสร้างแบบฟอร์มเสร็จใหม่ๆ
          (ดู ReviewSuccessCard.tsx) ให้ดูใบรับคืนเดิมย้อนหลังได้จากหน้านี้ด้วย ══ */}
      {pdfModalUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-6 bg-slate-900/60 backdrop-blur-sm print:hidden"
          onClick={() => setPdfModalUrl(null)}
        >
          <div
            className="relative w-full max-w-3xl h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
              <h3 className="text-base font-bold text-foreground">ใบรับคืนสินค้า</h3>
              <div className="flex items-center gap-2">
                <a
                  href={pdfModalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-100 transition-all"
                >
                  📥 เปิดในแท็บใหม่ / ดาวน์โหลด
                </a>
                <button
                  onClick={() => setPdfModalUrl(null)}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-slate-100 hover:text-slate-600 transition-all"
                  aria-label="ปิด"
                >
                  ✕
                </button>
              </div>
            </div>
            <iframe src={pdfModalUrl} className="flex-1 w-full" title="ใบรับคืนสินค้า" />
          </div>
        </div>
      )}
    </div>
  );
}

export function TrackingDetailView(props: TrackingDetailViewProps) {
  return (
    <Suspense fallback={<div className="text-center py-10">กำลังโหลด...</div>}>
      <TrackingContent {...props} />
    </Suspense>
  );
}
