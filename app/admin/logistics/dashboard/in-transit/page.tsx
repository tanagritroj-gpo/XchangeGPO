'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Truck, Camera, ArrowLeft, LogOut, Loader2 } from 'lucide-react';
import { getLogisticsDashboardData } from '@/app/actions/logistics-actions';
import { logoutStaffAction } from '@/app/actions/auth-staff';
import { LogisticsRequestList } from '../component/LogisticsRequestList';
import { StaffDashboardSkeleton } from '@/components/skeletons/DashboardSkeleton';
import type { RequestRow, DrugItemRow } from '@/lib/types';

// หน้า "รถขนส่งรับคืนสินค้าถึงคลัง" แยกต่างหาก (เดิมเป็น 2 แท็บ "อยู่ระหว่างขนส่ง" +
// "อัปโหลดรูปสินค้ารับคืน" ในหน้า dashboard เดียว ผู้ใช้ขอให้รวมเป็นการ์ดเดียวกัน กดเข้ามาดู
// แทนสลับ tab) — โครงหน้าเหมือน app/admin/sale/history/page.tsx (topbar แบบ bar เดียวไม่ sticky)
export default function LogisticsInTransitPage() {
  const router = useRouter();
  const [requests, setRequests]       = useState<RequestRow[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [expandedReq, setExpandedReq] = useState<number | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  // ส่งรถ ("ส่งรถไปรับคืน") ไม่มีในหน้านี้ (ทำที่หน้า "ส่งรถไปรับคืนสินค้า" เท่านั้น) แต่
  // LogisticsRequestList ต้องการ prop นี้เสมอ — ส่ง no-op เพราะปุ่มจะไม่โผล่อยู่แล้ว (ปุ่มโชว์
  // เฉพาะ req.current_status === 'approved' ซึ่งหน้านี้กรองเฉพาะ in_transit เท่านั้น)
  const noopSendTruck = () => {};

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

  const inTransitRequests = requests.filter(r => r.current_status === 'in_transit');

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
          <div className="w-10 h-10 rounded-md bg-indigo-100 text-indigo-600 shadow-sm shadow-indigo-400/30 flex items-center justify-center shrink-0">
            <Truck size={19} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">รถขนส่งรับคืนสินค้าถึงคลัง</h1>
            <p className="text-xs text-muted-foreground">{inTransitRequests.length} ใบงานกำลังเดินทางกลับคลัง</p>
          </div>
        </div>

        <section className="bg-card rounded-lg border border-border overflow-hidden">
          <LogisticsRequestList
            items={inTransitRequests}
            expandedReq={expandedReq}
            setExpandedReq={setExpandedReq}
            onSendTruck={noopSendTruck}
            handleDrugItemUpdate={handleDrugItemUpdate}
            emptyText="ไม่มีใบงานที่อยู่ระหว่างขนส่ง"
          />

          {/* อัปโหลดรูปสินค้ารับคืน — รวมเข้ามาในการ์ดเดียวกันนี้ตามที่ขอ (เดิมเป็นแท็บแยก) ยังเป็น
              placeholder รอพัฒนาเหมือนเดิม ไม่ได้เปลี่ยน logic */}
          <div className="border-t border-border px-6 md:px-7 py-8 text-center">
            <Camera className="w-9 h-9 text-purple-300 mx-auto mb-3" strokeWidth={1.75} />
            <p className="text-sm font-bold text-foreground">อัปโหลดรูปสินค้ารับคืน</p>
            <p className="text-xs text-muted-foreground mt-1">ฟีเจอร์นี้กำลังอยู่ระหว่างการพัฒนา เร็วๆ นี้</p>
          </div>
        </section>
      </div>
    </div>
  );
}
