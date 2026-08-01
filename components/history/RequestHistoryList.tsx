'use client';

import { useState, useEffect } from 'react';
import { Check, Loader2, FileText, Inbox, Pill, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  STAGES,
  getStatusLabel,
  getStatusMeta,
  getTimelineDescription,
  getCurrentStageIndex,
  formatCurrency,
  REJECTED_STATUS,
} from '@/lib/tracking-status';

export type RequestDetailResult = { success: boolean; data?: any; error?: string };
export type ListSize = 'default' | 'lg';

// ขนาดตัวอักษร/ไอคอนแยกตามโหมด — 'lg' ใช้กับหน้า sale history ที่ตัวอักษรโดยรวมดูเล็ก
// เกินไปเมื่อเทียบกับหน้าอื่นๆ ในระบบ ส่วน CSR (ค้นหาลูกค้า→ประวัติใบงาน) ยังคงขนาดเดิม
const SIZE_MAP = {
  default: {
    ref: 'text-sm', meta: 'text-xs', badge: 'text-xs', label: 'text-[10px]', labelSm: 'text-[9px]',
    body: 'text-xs', detailGrid: 'text-sm', sectionLabel: 'text-xs', statusName: 'text-sm',
    timestamp: 'text-[10px]', pageText: 'text-xs', empty: 'text-sm', icon: 'w-3.5 h-3.5', iconSm: 'w-3 h-3',
    stageDot: 'w-6 h-6', stageCheck: 'w-3.5 h-3.5', timelineDot: 'w-7 h-7', chevron: 16, pageBtn: 'w-8 h-8',
  },
  lg: {
    ref: 'text-base', meta: 'text-sm', badge: 'text-sm', label: 'text-xs', labelSm: 'text-[10px]',
    body: 'text-sm', detailGrid: 'text-base', sectionLabel: 'text-sm', statusName: 'text-base',
    timestamp: 'text-xs', pageText: 'text-sm', empty: 'text-base', icon: 'w-4 h-4', iconSm: 'w-3.5 h-3.5',
    stageDot: 'w-7 h-7', stageCheck: 'w-4 h-4', timelineDot: 'w-8 h-8', chevron: 18, pageBtn: 'w-9 h-9',
  },
} as const;

// ── การ์ดรายละเอียดใบงานแบบเต็ม — สไตล์เดียวกับหน้า tracking ที่ต้อง login ของลูกค้า ──
// (ref_id + badge สถานะ + stepper + รายการยา + timeline พร้อมหมายเหตุ staff)
// fetchDetail แยกออกมาเป็น prop เพราะผู้เรียกแต่ละที่ตรวจสิทธิ์ต่างกัน — CSR ยืนยันด้วย
// customerId ที่รู้ล่วงหน้า ส่วน sale ต้อง join เช็ค org_type/province ของเจ้าของใบงานแทน
function RequestDetailPanel({ requestId, fetchDetail, size }: { requestId: number; fetchDetail: (requestId: number) => Promise<RequestDetailResult>; size: ListSize }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const T = SIZE_MAP[size];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      const res = await fetchDetail(requestId);
      if (cancelled) return;
      if (res.success) setData(res.data);
      else setError(res.error || 'โหลดรายละเอียดไม่สำเร็จ');
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  if (loading) {
    return (
      <div className="py-8 text-center">
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin mx-auto mb-2" strokeWidth={2.5} />
        <p className={`${T.body} text-muted-foreground font-medium`}>กำลังโหลดรายละเอียด...</p>
      </div>
    );
  }
  if (error || !data) {
    return <p className={`py-8 text-center ${T.empty} text-rose-500 font-medium`}>{error}</p>;
  }

  const currentStageIndex = getCurrentStageIndex(data.current_status);

  return (
    <div className="px-4 md:px-6 py-5 bg-slate-50 border-t border-slate-100 space-y-5">

      {/* Stepper สรุปภาพรวม — ซ่อนถ้า rejected */}
      {currentStageIndex >= 0 && (
        <div className="flex items-center bg-white rounded-2xl border border-border p-4">
          {STAGES.map((stage, i) => (
            <div key={stage.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center flex-1">
                <div className={`${T.stageDot} rounded-full flex items-center justify-center ${
                  i < currentStageIndex ? 'bg-emerald-500' : i === currentStageIndex ? 'bg-amber-500' : 'bg-slate-200'
                }`}>
                  {i < currentStageIndex && <Check className={`${T.stageCheck} text-white`} />}
                </div>
                <p className={`${T.label} mt-1.5 text-center ${i <= currentStageIndex ? 'text-slate-700 font-semibold' : 'text-muted-foreground'}`}>
                  {stage.label}
                </p>
              </div>
              {i < STAGES.length - 1 && (
                <div className={`h-0.5 flex-1 -mt-5 ${i < currentStageIndex ? 'bg-emerald-500' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* รายละเอียดคำร้อง */}
      <div className={`bg-white rounded-2xl border border-border p-4 grid grid-cols-2 sm:grid-cols-3 gap-4 ${T.detailGrid}`}>
        <div>
          <p className={`${T.label} text-muted-foreground mb-0.5`}>เหตุผลการคืน</p>
          <p className="font-medium text-slate-700">{data.return_reason || '-'}</p>
        </div>
        <div>
          <p className={`${T.label} text-muted-foreground mb-0.5`}>วิธีคืนสินค้า</p>
          <p className="font-medium text-slate-700">{data.delivery_type || '-'}</p>
        </div>
        <div>
          <p className={`${T.label} text-muted-foreground mb-0.5`}>มูลค่ารวม</p>
          <p className="font-bold text-teal-700">{formatCurrency(data.total_value) || '-'}</p>
        </div>
      </div>

      {/* รายการยา */}
      {data.drug_items?.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className={`${T.sectionLabel} font-bold text-muted-foreground mb-3 flex items-center gap-1.5`}>
            <Pill className={T.icon} /> รายการยา
          </p>
          <div className="space-y-2">
            {data.drug_items.map((item: any, i: number) => {
              const itemRejected = item.current_status === REJECTED_STATUS;
              return (
                <div key={i} className={`rounded-xl p-3 border flex items-center justify-between gap-3 ${
                  itemRejected ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'
                }`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-bold text-foreground ${T.body} truncate`}>{item.drug_name}</p>
                      {itemRejected && (
                        <span className={`${T.labelSm} font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded shrink-0`}>ถูกปฏิเสธ</span>
                      )}
                    </div>
                    <p className={`${T.label} text-muted-foreground mt-0.5`}>
                      {item.lot_number && <>ล็อต {item.lot_number}</>}
                      {item.lot_number && item.exp_date && ' · '}
                      {item.exp_date && <>หมดอายุ {new Date(item.exp_date).toLocaleDateString('th-TH')}</>}
                    </p>
                  </div>
                  <span className={`${T.body} font-semibold text-muted-foreground whitespace-nowrap shrink-0`}>{item.qty} {item.unit}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline พร้อมหมายเหตุ staff */}
      <div>
        <p className={`${T.sectionLabel} font-bold text-muted-foreground mb-3 px-1`}>ประวัติการดำเนินการ</p>
        <div className="relative border-l-2 border-border ml-3 space-y-6">
          {data.timeline?.map((log: any, i: number) => {
            const meta = getStatusMeta(log.status_name);
            const Icon = meta.icon;
            return (
              <div key={i} className="relative pl-7">
                <div className={`absolute -left-[15px] top-0 ${T.timelineDot} rounded-full ${meta.bg} flex items-center justify-center shadow-sm`}>
                  <Icon className={`${T.icon} ${meta.fg}`} />
                </div>
                <p className={`${T.timestamp} text-muted-foreground font-mono`}>
                  {new Date(log.log_date).toLocaleString('th-TH')}
                </p>
                <h4 className={`font-bold text-teal-900 ${T.statusName}`}>{log.status_name}</h4>
                {getTimelineDescription(log.status_name) && (
                  <p className={`${T.body} text-muted-foreground mt-0.5`}>{getTimelineDescription(log.status_name)}</p>
                )}
                {log.drug_name && (
                  <p className={`${T.body} text-muted-foreground mt-0.5 flex items-center gap-1`}>
                    <Pill className={T.iconSm} /> {log.drug_name}
                  </p>
                )}
                {log.staff_remark && (
                  <p className={`${T.body} text-slate-600 mt-1.5 bg-white border border-border rounded-lg px-2.5 py-1.5 flex items-start gap-1.5`}>
                    <FileText className={`${T.iconSm} mt-0.5 text-muted-foreground shrink-0`} />
                    {log.staff_remark}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 10;

// รายการใบงานแบบพับ/ขยาย — ใช้รูปแบบเดียวกับ "ประวัติใบงาน" ในหน้าค้นหาลูกค้าของ CSR
// showOrgBadge สำหรับบริบทที่รายการครอบคลุมหลายหน่วยงานพร้อมกัน (เช่น sale ที่ดูแล
// ทั้งเขต) แสดงชื่อหน่วยงาน/จังหวัดกำกับต่อแถว — CSR ไม่ต้องใช้เพราะรู้จักลูกค้าอยู่แล้ว
// size='lg' ขยายตัวอักษร/ไอคอนขึ้นหนึ่งขั้นทั้งชุด (ใช้กับหน้า sale history ที่ตัวอักษร
// โดยรวมดูเล็กกว่าหน้าอื่น) — ค่าเริ่มต้น 'default' คงหน้าตาเดิมของ CSR ไว้ไม่ให้กระทบ
export function RequestHistoryList({
  history,
  loading = false,
  error = '',
  emptyText = 'ยังไม่มีประวัติใบงาน',
  fetchDetail,
  showOrgBadge = false,
  size = 'default',
}: {
  history: any[];
  loading?: boolean;
  error?: string;
  emptyText?: string;
  fetchDetail: (requestId: number) => Promise<RequestDetailResult>;
  showOrgBadge?: boolean;
  size?: ListSize;
}) {
  const [expandedRequestId, setExpandedRequestId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const T = SIZE_MAP[size];

  // รีเซ็ตกลับหน้า 1 ทุกครั้งที่ข้อมูลชุดใหม่โหลดเข้ามา (เช่น เปลี่ยนลูกค้าที่เลือกฝั่ง CSR)
  useEffect(() => {
    setPage(1);
  }, [history]);

  const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedHistory = history.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      {loading ? (
        <div className="py-10 text-center">
          <Loader2 className="w-7 h-7 text-teal-600 animate-spin mx-auto mb-2" strokeWidth={2.5} />
          <p className={`${T.body} text-muted-foreground font-medium`}>กำลังโหลดประวัติใบงาน...</p>
        </div>
      ) : error ? (
        <div className="py-10 text-center px-4">
          <p className={`${T.empty} text-rose-500 font-medium`}>{error}</p>
        </div>
      ) : history.length === 0 ? (
        <div className="py-10 text-center">
          <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" strokeWidth={1.75} />
          <p className={`${T.empty} text-muted-foreground font-medium`}>{emptyText}</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-100">
            {pagedHistory.map((req) => {
              const isExpanded = expandedRequestId === req.id;
              return (
                <div
                  key={req.id}
                  className={`group relative transition-colors ${isExpanded ? 'bg-teal-50/70' : 'hover:bg-teal-50/50'}`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 w-[3px] transition-opacity duration-150 ${
                      isExpanded ? 'bg-teal-600 opacity-100' : 'bg-teal-400 opacity-0 group-hover:opacity-100'
                    }`}
                  />
                  <button
                    onClick={() => setExpandedRequestId(isExpanded ? null : req.id)}
                    className="w-full flex items-center justify-between px-4 md:px-6 py-3.5 gap-3 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className={`${T.ref} font-bold text-foreground font-mono`}>{req.ref_id}</p>
                      <p className={`${T.meta} text-muted-foreground mt-0.5`}>
                        {req.request_type} · {new Date(req.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                      {showOrgBadge && req.hospital_name && (
                        <p className={`${T.meta} font-semibold text-indigo-600 mt-0.5 truncate`}>
                          {req.hospital_name}{req.province ? ` · ${req.province}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {req.total_value != null && (
                        <span className={`${T.meta} font-semibold text-muted-foreground hidden sm:inline`}>
                          {formatCurrency(req.total_value)}
                        </span>
                      )}
                      <span
                        className={`${T.badge} font-bold px-2.5 py-1 rounded-full ${
                          req.current_status === REJECTED_STATUS
                            ? 'bg-red-50 text-red-700'
                            : req.current_status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {getStatusLabel(req.current_status)}
                      </span>
                      <ChevronDown size={T.chevron} strokeWidth={2.5} className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {isExpanded && (
                    <RequestDetailPanel requestId={req.id} fetchDetail={fetchDetail} size={size} />
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 md:px-6 py-3.5 border-t border-border bg-slate-50">
              <p className={`${T.pageText} text-muted-foreground`}>
                แสดง {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, history.length)} จาก {history.length} รายการ
              </p>
              <div className="flex items-center gap-1 overflow-x-auto">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className={`flex items-center justify-center ${T.pageBtn} rounded-lg text-muted-foreground hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0`}
                  aria-label="หน้าก่อนหน้า"
                >
                  <ChevronLeft size={T.chevron} strokeWidth={2.5} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`flex items-center justify-center ${T.pageBtn} rounded-lg ${T.pageText} font-bold transition-colors shrink-0 ${
                      p === currentPage ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className={`flex items-center justify-center ${T.pageBtn} rounded-lg text-muted-foreground hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0`}
                  aria-label="หน้าถัดไป"
                >
                  <ChevronRight size={T.chevron} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
