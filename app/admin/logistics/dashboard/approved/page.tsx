'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PackageCheck, Truck, ArrowLeft, LogOut, Loader2, Check } from 'lucide-react';
import { getLogisticsDashboardData, updateLogisticsStatus } from '@/app/actions/logistics-actions';
import { logoutStaffAction } from '@/app/actions/auth-staff';
import ReasonSelectFields from '@/components/ReasonSelectFields';
import { resolveQuickNote } from '@/lib/quick-note';
import { LogisticsRequestList } from '../component/LogisticsRequestList';
import { StaffDashboardSkeleton } from '@/components/skeletons/DashboardSkeleton';
import type { RequestRow, DrugItemRow } from '@/lib/types';

// หน้า "ส่งรถไปรับคืนสินค้า" แยกต่างหาก (เดิมเป็นแท็บ "อนุมัติรับคืนสินค้า" ในหน้า dashboard
// เดียว ผู้ใช้ขอให้แยกเป็นการ์ดกดเข้ามาดูแทน ตาม pattern เดียวกับ "ประวัติใบงาน" ของ Sale) —
// โครงหน้าเหมือน app/admin/sale/history/page.tsx (topbar แบบ bar เดียวไม่ sticky)
const TRANSIT_NOTES = [
  { code: 'dispatched', label: 'ส่งรถออกไปรับคืนแล้ว' },
  { code: 'scheduled', label: 'นัดหมายรับคืนกับหน่วยงานแล้ว' },
  { code: 'other', label: 'อื่นๆ' },
] as const;

export default function LogisticsApprovedPage() {
  const router = useRouter();
  const [requests, setRequests]       = useState<RequestRow[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [expandedReq, setExpandedReq] = useState<number | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [transitModal, setTransitModal]     = useState<{ requestId: number; refId: string } | null>(null);
  const [transitCode, setTransitCode]       = useState('');
  const [transitDetail, setTransitDetail]   = useState('');
  const [isSubmittingTransit, setIsSubmittingTransit] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      const data = await getLogisticsDashboardData();
      if (data.success) setRequests(data.requests || []);
      setIsLoading(false);
    }
    fetchData();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutStaffAction();
    router.push('/');
  };

  const openTransitModal = (req: RequestRow) => {
    setTransitCode('');
    setTransitDetail('');
    setTransitModal({ requestId: req.id, refId: req.ref_id });
  };

  const submitTransitModal = async () => {
    if (!transitModal) return;
    setIsSubmittingTransit(true);
    try {
      const remark = resolveQuickNote(TRANSIT_NOTES, transitCode, transitDetail);
      const res = await updateLogisticsStatus(transitModal.requestId, 'in_transit', remark);
      if (res.success) {
        setRequests(prev => prev.map(req =>
          req.id !== transitModal.requestId ? req : {
            ...req,
            current_status: 'in_transit',
            drug_items: (req.drug_items ?? []).map((it: DrugItemRow) => ({ ...it, current_status: 'in_transit' })),
          }
        ));
        setTransitModal(null);
      } else {
        alert('Error: ' + res.error);
      }
    } finally {
      setIsSubmittingTransit(false);
    }
  };

  const handleDrugItemUpdate = (requestId: number, itemId: number, newStatus: 'at_warehouse' | 'rejected') => {
    setRequests(prev => {
      let shouldRemove = false;
      const updated = prev.map(req => {
        if (req.id !== requestId) return req;
        const updatedItems = (req.drug_items ?? []).map((it: DrugItemRow) =>
          it.id === itemId ? { ...it, current_status: newStatus } : it
        );
        const hasAccepted    = updatedItems.some((i: DrugItemRow) => i.current_status === 'at_warehouse');
        const isAllProcessed = updatedItems.every((i: DrugItemRow) => ['at_warehouse', 'rejected'].includes(i.current_status ?? ''));
        if (isAllProcessed) shouldRemove = true;
        return { ...req, drug_items: updatedItems, current_status: isAllProcessed ? (hasAccepted ? 'at_warehouse' : 'rejected') : req.current_status };
      });
      return shouldRemove ? updated.filter(req => req.id !== requestId) : updated;
    });
  };

  if (isLoading) return <StaffDashboardSkeleton rows={4} bgClassName="bg-background" />;

  const approvedRequests = requests.filter(r => r.current_status === 'approved');

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto w-full px-4 md:px-6 pt-6">
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-card border border-border">
          <Link href="/admin/logistics/dashboard" className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" /> ย้อนกลับ
          </Link>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary border border-border px-4 py-2.5 rounded-md transition-colors disabled:opacity-60 disabled:pointer-events-none"
          >
            {isLoggingOut ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
            ออกจากระบบ
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full px-4 md:px-6 py-6 md:py-10">
        <div className="flex items-center gap-3 mb-5 px-1">
          <div className="w-10 h-10 rounded-md bg-blue-100 text-blue-600 shadow-sm shadow-blue-400/30 flex items-center justify-center shrink-0">
            <PackageCheck size={19} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">ส่งรถไปรับคืนสินค้า</h1>
            <p className="text-xs text-muted-foreground">{approvedRequests.length} ใบงานรอส่งรถไปรับคืน</p>
          </div>
        </div>

        <section className="bg-card rounded-lg border border-border overflow-hidden">
          <LogisticsRequestList
            items={approvedRequests}
            expandedReq={expandedReq}
            setExpandedReq={setExpandedReq}
            onSendTruck={openTransitModal}
            handleDrugItemUpdate={handleDrugItemUpdate}
            emptyText="ไม่มีใบงานที่รออนุมัติรับคืนสินค้า"
          />
        </section>
      </div>

      {/* ══ Confirm Modal: ส่งรถไปรับคืน พร้อมหมายเหตุ — มาตรฐานเดียวกับ LOGDrugrow.tsx / CSR dashboard ══ */}
      {transitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-card rounded-lg shadow-lg overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div className="h-1.5 bg-blue-600" />

            <div className="p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-blue-100">
                  <Truck size={22} className="text-blue-600" strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-foreground">ยืนยันส่งรถไปรับคืน</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">Ref: {transitModal.refId}</p>
                </div>
              </div>

              <ReasonSelectFields
                label="หมายเหตุการขนส่ง"
                options={TRANSIT_NOTES}
                code={transitCode}
                detail={transitDetail}
                onCodeChange={setTransitCode}
                onDetailChange={setTransitDetail}
              />

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setTransitModal(null); setTransitCode(''); setTransitDetail(''); }}
                  disabled={isSubmittingTransit}
                  className="py-3.5 rounded-md font-bold text-sm text-muted-foreground bg-secondary border border-border hover:bg-muted transition-colors active:scale-[0.98] disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={submitTransitModal}
                  disabled={isSubmittingTransit || !transitCode || (transitCode === 'other' && !transitDetail.trim())}
                  className="py-3.5 rounded-md font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmittingTransit
                    ? <><Loader2 size={15} className="animate-spin" strokeWidth={2.5} /> กำลังบันทึก...</>
                    : <><Check size={15} strokeWidth={3} /> ยืนยัน</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
