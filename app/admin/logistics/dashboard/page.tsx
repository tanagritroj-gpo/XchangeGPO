'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getLogisticsDashboardData, updateLogisticsStatus, updateItemStatus, rejectItemStatus, confirmLogisticsBatch } from '@/app/actions/logistics-actions';
import { getStaffSession } from '@/app/actions/auth-staff';

const LOGISTICS_STATUS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  approved:     { label: 'อนุมัติรับคืนสินค้า',  color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     dot: 'bg-blue-500'   },
  in_transit:   { label: 'อยู่ระหว่างขนส่ง',     color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', dot: 'bg-indigo-500' },
  at_warehouse: { label: 'ถึงคลังแล้ว',          color: 'text-teal-700',   bg: 'bg-teal-50 border-teal-200',     dot: 'bg-teal-500'   },
  rejected:     { label: 'ถูกปฏิเสธ',            color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       dot: 'bg-red-500'    },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = LOGISTICS_STATUS[status] ?? { label: status, color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function DrugItemRow({ item, reqStatus, onUpdate }: {
  item: any;
  reqStatus: string;
  onUpdate: (itemId: number, newStatus: 'at_warehouse' | 'rejected') => void;
}) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAction = async (action: 'at_warehouse' | 'rejected') => {
    const remark = prompt(`ระบุหมายเหตุการ${action === 'at_warehouse' ? 'ตรวจรับ' : 'ปฏิเสธ'}:`);
    if (remark === null) return;
    setIsProcessing(true);
    try {
      const session = await getStaffSession();
      if (!session?.id) throw new Error('ไม่พบ Session');
      const res = action === 'at_warehouse'
        ? await updateItemStatus(item.id, session.id, 'at_warehouse', remark || '')
        : await rejectItemStatus(item.id, session.id, remark || '');
      if (res.success) { onUpdate(item.id, action); }
      else alert('บันทึกไม่สำเร็จ: ' + (res as any).error);
    } catch (err) { console.error('Error:', err); alert('เกิดข้อผิดพลาดในการเชื่อมต่อ'); }
    finally { setIsProcessing(false); }
  };

return (
    // ปรับ grid ให้รองรับทั้งสองขนาด
    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 text-xs px-3 py-3 bg-white rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all items-center">
      {/* ชื่อยา (4 ส่วนบน Desktop) */}
      <div className="col-span-1 md:col-span-4 font-semibold text-slate-800 truncate">
        {item.drug_name}
      </div>
      
      {/* ข้อมูลยาอื่นๆ */}
      <div className="col-span-1 md:col-span-2 text-slate-500 font-medium">
        <span className="md:hidden text-[10px] text-slate-400">จำนวน: </span>
        {item.qty} {item.unit}
      </div>
      
      <div className="col-span-1 md:col-span-2 text-slate-400 font-mono truncate">
        <span className="md:hidden text-[10px] text-slate-400">LOT: </span>
        {item.lot_number ?? '—'}
      </div>
      
{/* Action Buttons */}
      <div className="col-span-1 md:col-span-2 flex justify-end gap-1.5 mt-2 md:mt-0">
        {isProcessing ? (
          <div className="flex items-center gap-1.5 text-slate-500">
            <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-[9px] font-bold">กำลังบันทึก...</span>
          </div>
        ) : (
          <>
            {reqStatus === 'in_transit' &&
             item.current_status !== 'at_warehouse' &&
             item.current_status !== 'rejected' && (
              <>
                <button onClick={() => handleAction('at_warehouse')}
                  className="px-2.5 py-1.5 bg-teal-600 text-white rounded-lg text-[10px] font-bold hover:bg-teal-700 transition-all">ตรวจรับ</button>
                <button onClick={() => handleAction('rejected')}
                  className="px-2.5 py-1.5 bg-red-500 text-white rounded-lg text-[10px] font-bold hover:bg-red-600 transition-all">ปฏิเสธ</button>
              </>
            )}
            {item.current_status === 'at_warehouse' && <span className="text-[10px] text-teal-600 font-bold">ถึงคลังแล้ว</span>}
            {item.current_status === 'rejected'     && <span className="text-[10px] text-red-500 font-bold">ปฏิเสธแล้ว</span>}
          </>
        )}
      </div>
    </div>
  );
}

export default function LogisticsDashboard() {
  const router = useRouter();
  const [requests, setRequests]               = useState<any[]>([]);
  const [isLoading, setIsLoading]             = useState(true);
  const [expandedReq, setExpandedReq]         = useState<number | null>(null);
  const [pendingActions, setPendingActions]   = useState<Record<number, { status: 'at_warehouse' | 'rejected'; remark: string }>>({});
  const [processingReqId, setProcessingReqId] = useState<number | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    const data = await getLogisticsDashboardData();
    if (data.success) setRequests(data.requests || []);
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleAction = async (id: number, nextStatus: 'in_transit' | 'at_warehouse') => {
    const remark = prompt('ระบุหมายเหตุการขนส่ง:');
    if (remark === null) return;
    setProcessingReqId(id);
    try {
      const session = await getStaffSession();
      if (!session?.id) { alert('กรุณาล็อกอินใหม่'); return; }
      const res = await updateLogisticsStatus(id, session.id, nextStatus, remark || '');
      if (res.success) {
        if (nextStatus === 'at_warehouse') {
          setRequests(prev => prev.filter(req => req.id !== id));
        } else {
          setRequests(prev => prev.map(req =>
            req.id !== id ? req : {
              ...req,
              current_status: nextStatus,
              drug_items: req.drug_items.map((it: any) => ({ ...it, current_status: nextStatus })),
            }
          ));
        }
      } else { alert('Error: ' + res.error); }
    } finally { setProcessingReqId(null); }
  };

  const handleDrugItemUpdate = (requestId: number, itemId: number, newStatus: 'at_warehouse' | 'rejected') => {
    setRequests(prev => {
      let shouldRemove = false;
      const updated = prev.map(req => {
        if (req.id !== requestId) return req;
        const updatedItems = req.drug_items.map((it: any) =>
          it.id === itemId ? { ...it, current_status: newStatus } : it
        );
        const hasAccepted    = updatedItems.some((i: any) => i.current_status === 'at_warehouse');
        const isAllProcessed = updatedItems.every((i: any) => ['at_warehouse', 'rejected'].includes(i.current_status));
        if (isAllProcessed) shouldRemove = true;
        return { ...req, drug_items: updatedItems, current_status: isAllProcessed ? (hasAccepted ? 'at_warehouse' : 'rejected') : req.current_status };
      });
      return shouldRemove ? updated.filter(req => req.id !== requestId) : updated;
    });
  };

  const handleConfirmBatch = async (requestId: number) => {
    const session = await getStaffSession();
    if (!session?.id) return;
    const actions = Object.entries(pendingActions).map(([itemId, val]) => ({
      itemId: Number(itemId), status: val.status, remark: val.remark
    }));
    const res = await confirmLogisticsBatch(requestId, session.id, actions);
    if (res.success) {
      setRequests(prevRequests => {
        let shouldRemove = false;
        const updated = prevRequests.map(req => {
          if (req.id !== requestId) return req;
          const updatedItems = req.drug_items.map((item: any) => {
            const action = actions.find(a => a.itemId === item.id);
            return action ? { ...item, current_status: action.status } : item;
          });
          const allProcessed = updatedItems.every((i: any) => ['at_warehouse', 'rejected'].includes(i.current_status));
          const hasAccepted  = updatedItems.some((i: any) => i.current_status === 'at_warehouse');
          if (allProcessed) shouldRemove = true;
          return { ...req, drug_items: updatedItems, current_status: allProcessed ? (hasAccepted ? 'at_warehouse' : 'rejected') : req.current_status };
        });
        return shouldRemove ? updated.filter(req => req.id !== requestId) : updated;
      });
      setPendingActions({});
      alert('บันทึกเรียบร้อย');
    }
  };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f0f4f8' }}>
      <div className="text-center space-y-3">
        <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-slate-500 font-medium">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #f0f7f4 0%, #f0f4f8 60%)' }}>

      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button onClick={() => router.replace('/')}
              className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 px-3 py-2 rounded-xl transition-all group shrink-0">
              <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-slate-200 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-black text-slate-800 leading-tight truncate">GPO StaffCommand Center</h1>
              <p className="text-[10px] md:text-[11px] text-slate-400 hidden sm:block">GPO Xchange Portal • Logistics Dashboard</p>
            </div>
          </div>
          <span className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] md:text-xs font-bold shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
            <span>{requests.length}</span>
            <span className="hidden sm:inline">ใบงาน</span>
          </span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-8">
        <section className="bg-white rounded-2xl md:rounded-3xl shadow-md border border-slate-100 overflow-hidden">

          {/* Section header */}
          <div className="flex items-center gap-3 px-4 md:px-7 py-4 md:py-5 border-b border-slate-100"
            style={{ background: 'linear-gradient(90deg, #eef2ff, #ffffff)' }}>
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center text-base md:text-lg shadow-sm shrink-0"
              style={{ background: 'linear-gradient(135deg,#c7d2fe,#6366f1)' }}>🚚</div>
            <div>
              <h2 className="text-sm font-black text-slate-800">จัดการงานขนส่ง</h2>
              <p className="text-xs text-slate-400">{requests.length} รายการ</p>
            </div>
          </div>

          {/* Table header — desktop only */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-7 py-3 bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            <div className="col-span-3">Ref ID</div>
            <div className="col-span-3">สถานะ</div>
            <div className="col-span-4">รายการสินค้า</div>
            <div className="col-span-2 text-right">Action</div>
          </div>

          {requests.length === 0 ? (
            <div className="py-10 md:py-14 text-center">
              <div className="text-3xl md:text-4xl mb-3">📭</div>
              <p className="text-sm text-slate-400 font-medium">ไม่มีงานขนส่งในระบบ</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {requests.map((req) => {
                const isExpanded      = expandedReq === req.id;
                const isReqProcessing = processingReqId === req.id;
                const drugCount       = req.drug_items?.length ?? 0;
                return (
                  <div key={req.id} className="hover:bg-slate-50/40 transition-colors">

                    {/* Desktop row */}
                    <div className="hidden md:grid grid-cols-12 gap-4 px-7 py-4 items-center">
                      <div className="col-span-3">
                        <p className="text-sm font-black text-slate-800 font-mono">{req.ref_id}</p>
                        {req.hospital_name && <p className="text-xs text-slate-400 mt-0.5 truncate">{req.hospital_name}</p>}
                      </div>
                      <div className="col-span-3"><StatusBadge status={req.current_status} /></div>
                      <div className="col-span-4">
                        <button onClick={() => setExpandedReq(isExpanded ? null : req.id)}
                          className="flex items-center gap-2 text-xs text-slate-500 hover:text-indigo-700 font-semibold transition-colors group">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 font-black text-[10px] group-hover:bg-indigo-100">
                            {drugCount}
                          </span>
                          รายการสินค้า
                          <span className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                        </button>
                      </div>
                      <div className="col-span-2 flex flex-col items-end gap-2">
                        {isReqProcessing ? (
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                            <span className="text-[10px] font-bold">กำลังบันทึก...</span>
                          </div>
                        ) : req.current_status === 'approved' && (
                          <button onClick={() => handleAction(req.id, 'in_transit')}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all w-full bg-blue-600 hover:bg-blue-700">
                            ส่งรถไปรับคืน
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Mobile card */}
                    <div className="md:hidden px-4 py-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-800 font-mono">{req.ref_id}</p>
                          {req.hospital_name && <p className="text-xs text-slate-400 mt-0.5 truncate">{req.hospital_name}</p>}
                        </div>
                        <StatusBadge status={req.current_status} />
                      </div>
                      <button onClick={() => setExpandedReq(isExpanded ? null : req.id)}
                        className="flex items-center gap-2 text-xs text-slate-500 font-semibold w-full py-2 px-3 bg-slate-50 rounded-xl hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 font-black text-[10px]">{drugCount}</span>
                        รายการสินค้า
                        <span className={`ml-auto transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                      </button>
                      <div className="flex gap-2">
                        {isReqProcessing ? (
                          <div className="flex-1 flex items-center justify-center gap-2 py-2.5 text-slate-500">
                            <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs font-bold">กำลังบันทึก...</span>
                          </div>
                        ) : req.current_status === 'approved' && (
                          <button onClick={() => handleAction(req.id, 'in_transit')}
                            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 active:scale-95 transition-all">
                            ส่งรถไปรับคืน
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Drug items expanded */}
                    {isExpanded && drugCount > 0 && (
                      <div className="px-4 md:px-7 pb-4">
                        <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide px-3 mb-1.5">
                          <div className="col-span-4">ชื่อยา</div>
                          <div className="col-span-2">จำนวน</div>
                          <div className="col-span-2">LOT</div>
                          <div className="col-span-2">หมดอายุ</div>
                          <div className="col-span-2 text-right">Action</div>
                        </div>
                        <div className="space-y-1.5">
                          {req.drug_items.map((item: any) => (
                            <DrugItemRow
                              key={item.id}
                              item={item}
                              reqStatus={req.current_status}
                              onUpdate={(itemId, newStatus) => handleDrugItemUpdate(req.id, itemId, newStatus)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}