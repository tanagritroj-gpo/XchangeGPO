'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCSRDashboardData, reviewClient, approveRequest, rejectRequest, startExchangeProcess, completeRequest, approveDrugItem, rejectDrugItem } from '@/app/actions/csr-actions';
import { getStaffSession } from '@/app/actions/auth-staff';
import CSRDrugRow from './component/CSRDrugRow';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending_review:   { label: 'รอตรวจสอบ',       color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     dot: 'bg-amber-400'   },
  approved:         { label: 'อนุมัติแล้ว',      color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  receiving:        { label: 'กำลังรับสินค้า',   color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       dot: 'bg-blue-500'    },
  exchanging:       { label: 'กำลังแลกเปลี่ยน', color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200',   dot: 'bg-purple-500'  },
  completed:        { label: 'เสร็จสิ้น',        color: 'text-slate-600',   bg: 'bg-slate-100 border-slate-200',    dot: 'bg-slate-400'   },
  out_for_delivery: { label: 'กำลังส่งคืน',      color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200',   dot: 'bg-indigo-500'  },
  at_warehouse:     { label: 'ถึงคลังสินค้า',    color: 'text-rose-700',    bg: 'bg-rose-50 border-rose-200',       dot: 'bg-rose-500'    },
  checked_in:       { label: 'ตรวจรับแล้ว',      color: 'text-teal-700',    bg: 'bg-teal-50 border-teal-200',       dot: 'bg-teal-500'    },
  rejected:         { label: 'ถูกปฏิเสธ',        color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         dot: 'bg-red-500'     },
  in_transit:       { label: 'อยู่ระหว่างขนส่ง', color: 'text-cyan-700',    bg: 'bg-cyan-50 border-cyan-200',       dot: 'bg-cyan-500'    },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export default function CSRDashboard() {
  const router = useRouter();
  const [clients, setClients]       = useState<any[]>([]);
  const [requests, setRequests]     = useState<any[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [expandedReq, setExpandedReq] = useState<number | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    const data = await getCSRDashboardData();
    if (data.success) { setClients(data.clients || []); setRequests(data.requests || []); }
    setIsLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const session = await getStaffSession();
      if (!session?.id) { router.replace('/login'); return; }
      await fetchData();
    };
    init();
  }, []);

  const handleReviewClient = async (id: string, action: 'approved' | 'rejected') => {
    const res = await reviewClient(id, action);
    if (res.success) { alert(action === 'approved' ? 'อนุมัติเรียบร้อย' : 'ปฏิเสธเรียบร้อย'); fetchData(); }
    else alert('Error: ' + res.error);
  };

  const handleUpdateStatus = async (id: number, newStatus: string) => {
    const remark = prompt('ระบุหมายเหตุ:');
    if (remark === null) return;
    try {
      const session = await getStaffSession();
      if (!session?.id) { alert('ไม่พบ Session พนักงาน กรุณาล็อกอินใหม่'); return; }
      let res;
      if (newStatus === 'approved')   res = await approveRequest(id, session.id, remark || '');
      else if (newStatus === 'rejected')  res = await rejectRequest(id, session.id, remark || '');
      else if (newStatus === 'exchanging') res = await startExchangeProcess(id, session.id, remark || '');
      else if (newStatus === 'completed')  res = await completeRequest(id, session.id, remark || '');
      else { alert('สถานะไม่รู้จัก'); return; }
      if (res.success) { alert('อัปเดตสถานะเรียบร้อย'); fetchData(); }
      else alert('Error: ' + ((res as any).error || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'));
    } catch (err) { alert('เกิดข้อผิดพลาดในการเชื่อมต่อ'); console.error(err); }
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
            <button
              onClick={() => router.replace('/')}
              className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 px-3 py-2 rounded-xl transition-all group shrink-0"
            >
              <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-slate-200 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-black text-slate-800 leading-tight truncate">GPO StaffCommand Center</h1>
              <p className="text-[10px] md:text-[11px] text-slate-400 hidden sm:block">GPO Xchange Portal • CSR Dashboard</p>
            </div>
          </div>
          {/* Stats pills — mobile แสดงแบบย่อ */}
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            <span className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 rounded-full bg-orange-50 border border-orange-100 text-orange-700 text-[10px] md:text-xs font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse shrink-0" />
              <span>{clients.length}</span>
              <span className="hidden sm:inline">ราย</span>
            </span>
            <span className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-[10px] md:text-xs font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
              <span>{requests.length}</span>
              <span className="hidden sm:inline">ใบงาน</span>
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-8 space-y-4 md:space-y-8">

        {/* ══ SECTION 1: อนุมัติลูกค้า ══ */}
        <section className="bg-white rounded-2xl md:rounded-3xl shadow-md border border-slate-100 overflow-hidden">
          <div className="flex items-center gap-3 px-4 md:px-7 py-4 md:py-5 border-b border-slate-100"
            style={{ background: 'linear-gradient(90deg, #fff7ed, #ffffff)' }}>
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center text-base md:text-lg shadow-sm shrink-0"
              style={{ background: 'linear-gradient(135deg,#fed7aa,#fb923c)' }}>🏥</div>
            <div>
              <h2 className="text-sm font-black text-slate-800">ลูกค้าที่รออนุมัติ</h2>
              <p className="text-xs text-slate-400">{clients.length} รายการ</p>
            </div>
          </div>

          {clients.length === 0 ? (
            <div className="py-10 md:py-14 text-center">
              <div className="text-3xl md:text-4xl mb-3">✅</div>
              <p className="text-sm text-slate-400 font-medium">ไม่มีลูกค้าที่รออนุมัติ</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {clients.map((client, idx) => (
                <div key={client.id}
                  className="flex items-center justify-between px-4 md:px-7 py-3 md:py-4 hover:bg-slate-50/50 transition-colors group gap-3">
                  <div className="flex items-center gap-2 md:gap-3 min-w-0">
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center text-sm font-black text-slate-400 shrink-0">
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 group-hover:text-teal-700 transition-colors truncate">{client.hospital_name}</p>
                      {client.province && <p className="text-xs text-slate-400">{client.province}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleReviewClient(client.id, 'approved')}
                      className="px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-xs font-bold text-white shadow-md shadow-emerald-100 hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all"
                      style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>✓ อนุมัติ</button>
                    <button onClick={() => handleReviewClient(client.id, 'rejected')}
                      className="px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-xs font-bold text-white shadow-md shadow-red-100 hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all"
                      style={{ background: 'linear-gradient(135deg,#dc2626,#f87171)' }}>✕ ปฏิเสธ</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ══ SECTION 2: Workflow ══ */}
        <section className="bg-white rounded-2xl md:rounded-3xl shadow-md border border-slate-100 overflow-hidden">
          <div className="flex items-center gap-3 px-4 md:px-7 py-4 md:py-5 border-b border-slate-100"
            style={{ background: 'linear-gradient(90deg,#eff6ff,#ffffff)' }}>
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center text-base md:text-lg shadow-sm shrink-0"
              style={{ background: 'linear-gradient(135deg,#bfdbfe,#3b82f6)' }}>📋</div>
            <div>
              <h2 className="text-sm font-black text-slate-800">จัดการใบงาน (Workflow)</h2>
              <p className="text-xs text-slate-400">{requests.length} รายการ</p>
            </div>
          </div>

          {/* Table header — desktop only */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-7 py-3 bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            <div className="col-span-3">Ref ID</div>
            <div className="col-span-2">สถานะ</div>
            <div className="col-span-5">รายการสินค้า</div>
            <div className="col-span-2 text-right">Action</div>
          </div>

          {requests.length === 0 ? (
            <div className="py-10 md:py-14 text-center">
              <div className="text-3xl md:text-4xl mb-3">📭</div>
              <p className="text-sm text-slate-400 font-medium">ไม่มีใบงานในระบบ</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {requests.map((req) => {
                const isExpanded = expandedReq === req.id;
                const drugCount  = req.drug_items?.length ?? 0;
                return (
                  <div key={req.id} className="hover:bg-slate-50/40 transition-colors">

                    {/* Desktop: grid row / Mobile: card */}
                    <div className="hidden md:grid grid-cols-12 gap-4 px-7 py-4 items-center">
                      <div className="col-span-3">
                        <p className="text-sm font-black text-slate-800 font-mono">{req.ref_id}</p>
                        {req.hospital_name && <p className="text-xs text-slate-400 mt-0.5 truncate">{req.hospital_name}</p>}
                      </div>
                      <div className="col-span-2"><StatusBadge status={req.current_status} /></div>
                      <div className="col-span-5">
                        <button onClick={() => setExpandedReq(isExpanded ? null : req.id)}
                          className="flex items-center gap-2 text-xs text-slate-500 hover:text-teal-700 font-semibold transition-colors group">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-50 text-teal-600 font-black text-[10px] group-hover:bg-teal-100">{drugCount}</span>
                          รายการสินค้า
                          <span className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                        </button>
                      </div>
                      <div className="col-span-2 flex flex-col items-end gap-2">
                        {req.current_status === 'pending_review' && (
                          <>
                            <button onClick={() => handleUpdateStatus(req.id, 'approved')}
                              className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all w-full"
                              style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)' }}>Approve</button>
                            <button onClick={() => handleUpdateStatus(req.id, 'rejected')}
                              className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all w-full"
                              style={{ background: 'linear-gradient(135deg,#ef4444,#f87171)' }}>Reject ใบงาน</button>
                          </>
                        )}
                        {req.current_status === 'receiving' && (
                          <button onClick={() => handleUpdateStatus(req.id, 'exchanging')}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all w-full"
                            style={{ background: 'linear-gradient(135deg,#ea580c,#f97316)' }}>Start Exchange</button>
                        )}
                        {req.current_status === 'exchanging' && (
                          <button onClick={() => handleUpdateStatus(req.id, 'completed')}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all w-full"
                            style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>Complete</button>
                        )}
                      </div>
                    </div>

                    {/* Mobile: card layout */}
                    <div className="md:hidden px-4 py-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-800 font-mono">{req.ref_id}</p>
                          {req.hospital_name && <p className="text-xs text-slate-400 mt-0.5 truncate">{req.hospital_name}</p>}
                        </div>
                        <StatusBadge status={req.current_status} />
                      </div>

                      <button onClick={() => setExpandedReq(isExpanded ? null : req.id)}
                        className="flex items-center gap-2 text-xs text-slate-500 font-semibold w-full py-2 px-3 bg-slate-50 rounded-xl hover:bg-teal-50 hover:text-teal-700 transition-colors">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-50 text-teal-600 font-black text-[10px]">{drugCount}</span>
                        รายการสินค้า
                        <span className={`ml-auto transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                      </button>

                      <div className="flex gap-2">
                        {req.current_status === 'pending_review' && (
                          <>
                            <button onClick={() => handleUpdateStatus(req.id, 'approved')}
                              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white active:scale-95 transition-all"
                              style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)' }}>Approve</button>
                            <button onClick={() => handleUpdateStatus(req.id, 'rejected')}
                              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white active:scale-95 transition-all"
                              style={{ background: 'linear-gradient(135deg,#ef4444,#f87171)' }}>Reject</button>
                          </>
                        )}
                        {req.current_status === 'receiving' && (
                          <button onClick={() => handleUpdateStatus(req.id, 'exchanging')}
                            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white active:scale-95 transition-all"
                            style={{ background: 'linear-gradient(135deg,#ea580c,#f97316)' }}>Start Exchange</button>
                        )}
                        {req.current_status === 'exchanging' && (
                          <button onClick={() => handleUpdateStatus(req.id, 'completed')}
                            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white active:scale-95 transition-all"
                            style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>Complete</button>
                        )}
                      </div>
                    </div>

                    {/* Drug items expanded */}
                    {isExpanded && drugCount > 0 && (
                      <div className="px-4 md:px-7 pb-4">
                        {/* Column labels — desktop only */}
                        <div className="hidden md:grid grid-cols-12 gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide px-3 mb-1.5">
                          <div className="col-span-3">ชื่อยา</div>
                          <div className="col-span-1">จำนวน</div>
                          <div className="col-span-1 text-center">Lot</div>
                          <div className="col-span-1 text-center">Exp</div>
                          <div className="col-span-2">ประเภท</div>
                          <div className="col-span-1 text-center">เกณฑ์</div>
                          <div className="col-span-3 text-right">Actions</div>
                        </div>
                        <div className="space-y-2 md:space-y-1.5">
                          {req.drug_items.map((item: any) => (
                            <CSRDrugRow
                              key={item.id}
                              item={{ ...item, request_type: req.request_type }}
                              onUpdate={fetchData}
                            />
                          ))}
                        </div>
                        {req.drug_items.some((i: any) => i.value_amount) && (
                          <div className="mt-3 flex justify-end">
                            <div className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-2 text-xs">
                              <span className="text-slate-500">มูลค่ารวม: </span>
                              <span className="font-black text-teal-700">
                                ฿{req.drug_items.reduce((s: number, i: any) => s + (Number(i.value_amount) || 0), 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        )}
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