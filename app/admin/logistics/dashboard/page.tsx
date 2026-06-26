'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getLogisticsDashboardData, updateLogisticsStatus, updateItemStatus, rejectItemStatus, confirmLogisticsBatch } from '@/app/actions/logistics-actions';
import { getStaffSession } from '@/app/actions/auth-staff';

// ── Status Config (โทนสีเดียวกับ CSR) ──────────────────────────
const LOGISTICS_STATUS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  approved:     { label: 'อนุมัติรับคืนสินค้า',    color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',    dot: 'bg-blue-500' },
  in_transit: { label: 'อยู่ระหว่างขนส่ง', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', dot: 'bg-indigo-500' },
  at_warehouse: { label: 'ถึงคลังแล้ว', color: 'text-teal-700', bg: 'bg-teal-50 border-teal-200', dot: 'bg-teal-500' },
  rejected: { label: 'ถูกปฏิเสธ', color: 'text-red-700', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = LOGISTICS_STATUS[status] ?? { label: status, color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function DrugItemRow({
  item,
  reqStatus,
  onUpdate
}: {
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
      if (!session?.id) throw new Error("ไม่พบ Session");

      let res;
      if (action === 'at_warehouse') {
        res = await updateItemStatus(item.id, session.id, 'at_warehouse', remark || '');
      } else {
        res = await rejectItemStatus(item.id, session.id, remark || '');
      }

      if (res.success) {
        // ✅ อัปเดต state ทันทีเพื่อให้ UI สลับสถานะหรือซ่อนปุ่ม (ไม่ต้องรอ refresh)
        onUpdate(item.id, action);
      } else {
        alert('บันทึกไม่สำเร็จ: ' + (res as any).error);
      }
    } catch (err) {
      console.error("Error:", err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-2 text-xs px-3 py-2.5 bg-white rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all items-center">
      <div className="col-span-4 font-semibold text-slate-800 truncate">{item.drug_name}</div>
      <div className="col-span-2 text-slate-500 font-medium">{item.qty} {item.unit}</div>
      <div className="col-span-2 text-slate-400 font-mono truncate">{item.lot_number ?? '—'}</div>
      <div className="col-span-2 text-slate-400">
        {item.exp_date ? new Date(item.exp_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
      </div>

      <div className="col-span-2 text-right flex justify-end gap-1.5">
        {isProcessing ? (
          <div className="flex items-center gap-1.5 text-slate-500">
            <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[9px] font-bold">กำลังบันทึก...</span>
          </div>
        ) : (
          <>
            {/* แสดงปุ่มเฉพาะเมื่อสถานะปัจจุบันยังไม่ถูกจัดการ */}
            {reqStatus === 'in_transit' &&
             item.current_status !== 'at_warehouse' &&
             item.current_status !== 'rejected' && (
              <>
                <button
                  onClick={() => handleAction('at_warehouse')}
                  className="px-2 py-1 bg-teal-600 text-white rounded-lg text-[9px] font-bold hover:bg-teal-700 transition-all"
                >ตรวจรับ</button>
                <button
                  onClick={() => handleAction('rejected')}
                  className="px-2 py-1 bg-red-500 text-white rounded-lg text-[9px] font-bold hover:bg-red-600 transition-all"
                >ปฏิเสธ</button>
              </>
            )}

            {/* แสดงผลสถานะหลังจากจัดการแล้ว */}
            {item.current_status === 'at_warehouse' && (
              <span className="text-[10px] text-teal-600 font-bold">ถึงคลังแล้ว</span>
            )}
            {item.current_status === 'rejected' && (
              <span className="text-[10px] text-red-500 font-bold">ปฏิเสธแล้ว</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────
export default function LogisticsDashboard() {
  const router = useRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedReq, setExpandedReq] = useState<number | null>(null);
  // ✅ ประกาับ state นี้ที่หายไป — ทำให้ handleConfirmBatch ใช้งานได้จริง ไม่ crash
  const [pendingActions, setPendingActions] = useState<Record<number, { status: 'at_warehouse' | 'rejected'; remark: string }>>({});
  // ✅ เพิ่ม state สำหรับ spinner ตอนกด "เริ่มขนส่ง" ระดับใบงาน
  const [processingReqId, setProcessingReqId] = useState<number | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    const data = await getLogisticsDashboardData();
    if (data.success) setRequests(data.requests || []);
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ✅ แก้: ใช้ optimistic update แทนการ fetchData() ทั้งก้อน
  // เดิมต้องรอ network round-trip รอบที่ 2 ทำให้รู้สึกหน่วง/เหมือนต้อง refresh
  const handleAction = async (id: number, nextStatus: 'in_transit' | 'at_warehouse') => {
    const remark = prompt('ระบุหมายเหตุการขนส่ง:');
    if (remark === null) return;

    setProcessingReqId(id);
    try {
      const session = await getStaffSession();
      if (!session?.id) { alert("กรุณาล็อกอินใหม่"); return; }

      const res = await updateLogisticsStatus(id, session.id, nextStatus, remark || '');

      if (res.success) {
        // อัปเดต state ทันที: เปลี่ยนทั้งสถานะใบงานและทุก drug_items ในใบงานนั้น
        // (สอดคล้องกับสิ่งที่ updateLogisticsStatus ทำฝั่ง backend จริง)
        if (nextStatus === 'at_warehouse') {
          // ✅ ถ้าจบงาน (ถึงคลังแล้ว) ตัดออกจาก dashboard ทันที เพราะส่งต่องานแล้ว
          setRequests(prev => prev.filter(req => req.id !== id));
        } else {
          setRequests(prev =>
            prev.map(req =>
              req.id !== id
                ? req
                : {
                    ...req,
                    current_status: nextStatus,
                    drug_items: req.drug_items.map((it: any) => ({ ...it, current_status: nextStatus })),
                  }
            )
          );
        }
      } else {
        alert('Error: ' + res.error);
      }
    } finally {
      setProcessingReqId(null);
    }
  };

  // ✅ อัปเดต status ของ drug_item ตัวเดียวใน state ทันที โดยไม่ refetch ทั้งก้อน
  // ถ้าทำให้ใบงานจบงาน (at_warehouse หรือ rejected) ให้ตัดใบงานนั้นออกจาก dashboard เลย
  const handleDrugItemUpdate = (requestId: number, itemId: number, newStatus: 'at_warehouse' | 'rejected') => {
    setRequests(prev => {
      let shouldRemove = false;

      const updated = prev.map(req => {
        if (req.id !== requestId) return req;

        // 1. อัปเดตสถานะของยาชิ้นนั้นในรายการ
        const updatedItems = req.drug_items.map((it: any) =>
          it.id === itemId ? { ...it, current_status: newStatus } : it
        );

        // 2. คำนวณสถานะใบงานใหม่ทันที (เหมือนที่ Backend ทำ)
        const hasAccepted = updatedItems.some((i: any) => i.current_status === 'at_warehouse');
        const isAllProcessed = updatedItems.every((i: any) => ['at_warehouse', 'rejected'].includes(i.current_status));

        const newRequestStatus = isAllProcessed
          ? (hasAccepted ? 'at_warehouse' : 'rejected')
          : req.current_status; // ถ้ายังไม่จบ ให้คงสถานะเดิมไว้

        // ✅ ถ้าใบงานจบงานแล้ว (ทุกชิ้นถูกจัดการครบ) มาร์กให้ตัดออกจาก dashboard
        if (isAllProcessed) shouldRemove = true;

        return {
          ...req,
          drug_items: updatedItems,
          current_status: newRequestStatus
        };
      });

      // ตัดใบงานที่จบงานแล้วออกจาก state เลย เพราะส่งต่องานไปแล้ว ไม่ต้องค้างอยู่หน้านี้
      return shouldRemove ? updated.filter(req => req.id !== requestId) : updated;
    });
  };

  const handleConfirmBatch = async (requestId: number) => {
    const session = await getStaffSession();
    if (!session?.id) return;

    const actions = Object.entries(pendingActions).map(([itemId, val]) => ({
      itemId: Number(itemId),
      status: val.status,
      remark: val.remark
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
          const hasAccepted = updatedItems.some((i: any) => i.current_status === 'at_warehouse');

          // ✅ ถ้าทุกชิ้นจัดการครบแล้ว มาร์กให้ตัดใบงานนี้ออกจาก dashboard
          if (allProcessed) shouldRemove = true;

          return {
            ...req,
            drug_items: updatedItems,
            current_status: allProcessed ? (hasAccepted ? 'at_warehouse' : 'rejected') : req.current_status
          };
        });

        // ตัดใบงานที่จบงานแล้วออกเลย เพราะส่งต่องานไปแล้ว
        return shouldRemove ? updated.filter(req => req.id !== requestId) : updated;
      });

      setPendingActions({});
      alert('บันทึกเรียบร้อย');
    }
  };

  // ── Loading ──
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
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.replace('/')} className="text-sm font-bold text-slate-500 hover:text-slate-800 bg-slate-50 px-3 py-2 rounded-xl">← ย้อนกลับ</button>
            <div>
              <h1 className="text-base font-black text-slate-800">GPO StaffCommand Center</h1>
              <p className="text-[11px] text-slate-400">GPO Xchange Portal • Logistics Dashboard</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <section className="bg-white rounded-3xl shadow-md border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100" style={{ background: 'linear-gradient(90deg, #eef2ff, #ffffff)' }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-sm" style={{ background: 'linear-gradient(135deg,#c7d2fe,#6366f1)' }}>🚚</div>
              <div>
                <h2 className="text-sm font-black text-slate-800">จัดการงานขนส่ง</h2>
                <p className="text-xs text-slate-400">{requests.length} รายการ</p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-50">
            {requests.map((req) => {
              const isExpanded = expandedReq === req.id;
              const isReqProcessing = processingReqId === req.id;
              return (
                <div key={req.id} className="hover:bg-slate-50/40 transition-colors">
                  <div className="grid grid-cols-12 gap-4 px-7 py-4 items-center">
                    <div className="col-span-3"><p className="text-sm font-black text-slate-800 font-mono">{req.ref_id}</p></div>
                    <div className="col-span-3"><StatusBadge status={req.current_status} /></div>
                    <div className="col-span-4">
                      <button onClick={() => setExpandedReq(isExpanded ? null : req.id)} className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold hover:text-indigo-700">
                        {req.drug_items?.length ?? 0} รายการสินค้า ▾
                      </button>
                    </div>
                    <div className="col-span-2 text-right">
                      {isReqProcessing ? (
                        <div className="flex items-center justify-end gap-1.5 text-slate-500">
                          <div className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                          <span className="text-[10px] font-bold">กำลังบันทึก...</span>
                        </div>
                      ) : req.current_status === 'approved' && (
                        <button onClick={() => handleAction(req.id, 'in_transit')} className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm bg-blue-600 hover:bg-blue-700 transition-all w-full">ส่งรถไปรับคืน</button>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-7 pb-4 bg-slate-50/20">
                      <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide px-3 mb-1.5">
                        <div className="col-span-4">ชื่อยา</div>
                        <div className="col-span-2">จำนวน</div>
                        <div className="col-span-2">LOT</div>
                        <div className="col-span-2">หมดอายุ</div>
                        <div className="col-span-2 text-right">Action</div>
                      </div>
                      {req.drug_items.map((item: any) => (
                        <DrugItemRow
                          key={item.id}
                          item={item}
                          reqStatus={req.current_status}
                          onUpdate={(itemId, newStatus) => handleDrugItemUpdate(req.id, itemId, newStatus)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}