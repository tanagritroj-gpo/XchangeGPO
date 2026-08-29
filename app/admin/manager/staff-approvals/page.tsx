'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users, Check, Loader2, ShieldCheck, LogOut } from 'lucide-react';
import { getPendingStaff, approveStaff, logoutStaffAction } from '@/app/actions/auth-staff';
import { SkeletonTopBar, SkeletonSimpleRows } from '@/components/skeletons/DashboardSkeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ManagerMfaList } from '@/components/mfa/ManagerMfaList';
import type { PendingStaffRow } from '@/lib/types';

// ── "จัดการสิทธิ์พนักงาน" — เดิมเป็น 1 ใน 4 แท็บของหน้า staff-approvals ที่สลับด้วยแถบข้าง
// ตอนนี้แยกเป็นหน้าเดี่ยวพร้อม chrome มาตรฐาน (top bar + ปุ่มย้อนกลับไปหน้า hub) เหมือน
// หน้า Track & Trace / Audit log — ไม่มีปุ่มสลับข้ามส่วนอีก กดย้อนกลับไป hub แล้วเลือกการ์ดอื่น
// อีก 3 ส่วนที่เหลือย้ายไป /admin/manager/requests, /insights, /reports ตามลำดับ
export default function ManagerStaffApprovalsPage() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [pendingStaff, setPendingStaff] = useState<PendingStaffRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // id พนักงานที่กำลังกดอนุมัติอยู่ — กันปุ่มค้างไม่มี feedback ระหว่างรอ server action
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    const staffResult = await getPendingStaff();
    if (staffResult.success) {
      setPendingStaff(staffResult.data || []);
    } else {
      console.error('Error fetching staff:', staffResult.error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApprove = async (id: string) => {
    const confirmed = await confirm('ยืนยันการอนุมัติพนักงานท่านนี้?');
    if (!confirmed) return;

    setApprovingId(id);
    try {
      const res = await approveStaff(id);
      if (res.success) {
        toast.success('อนุมัติเรียบร้อยแล้ว');
        fetchData();
      } else {
        toast.error(('error' in res && res.error) || 'ไม่ทราบสาเหตุ');
      }
    } finally {
      setApprovingId(null);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutStaffAction();
    router.push('/');
  };

  if (isLoading) return (
    <div className="min-h-screen bg-background">
      <SkeletonTopBar />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <SkeletonSimpleRows rows={4} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">

      {/* ══ Top Bar ══ */}
      <div className="relative z-30 sticky top-0 bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={() => router.replace('/admin/manager')}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary px-3 py-2 rounded-md transition-colors group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-border shrink-0" />
            <div className="min-w-0 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary shrink-0" strokeWidth={2.5} />
              <div className="min-w-0">
                <h1 className="text-sm md:text-base font-bold text-foreground leading-tight truncate">จัดการสิทธิ์พนักงาน</h1>
                <p className="text-[11px] text-muted-foreground hidden sm:block">GPO Xchange Portal</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <span className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 rounded-full border bg-accent border-transparent text-accent-foreground text-[11px] md:text-xs font-semibold shrink-0">
              <ShieldCheck size={13} strokeWidth={2.5} />
              <span>Manager</span>
            </span>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary border border-border px-3 py-2 rounded-md transition-colors disabled:opacity-60 disabled:pointer-events-none"
            >
              {isLoggingOut ? <Loader2 size={15} className="animate-spin" strokeWidth={2.5} /> : <LogOut size={15} strokeWidth={2.5} />}
              <span className="hidden sm:inline">ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <section>
          <div className="flex items-center gap-2.5 mb-3 px-1">
            <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shrink-0">
              <Users size={16} className="text-accent-foreground" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">จัดการสิทธิ์พนักงาน</h2>
              <p className="text-[11px] text-muted-foreground">{pendingStaff.length} รายการรออนุมัติ</p>
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border overflow-hidden">
            {pendingStaff.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="w-9 h-9 text-muted-foreground/40 mx-auto mb-2.5" strokeWidth={1.75} />
                <p className="text-sm text-muted-foreground font-medium">ไม่มีรายการรออนุมัติ</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pendingStaff.map((staff) => (
                  <div key={staff.id}
                    className="flex items-center justify-between px-4 md:px-6 py-3.5 md:py-4 hover:bg-secondary/50 transition-colors gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{staff.full_name}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{staff.employee_id}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase bg-secondary px-2.5 py-1 rounded-full">
                        {staff.department}
                      </span>
                      <button
                        onClick={() => handleApprove(staff.id)}
                        disabled={approvingId === staff.id}
                        className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-md text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                      >
                        {approvingId === staff.id
                          ? <Loader2 size={14} className="animate-spin" strokeWidth={2.5} />
                          : <Check size={14} strokeWidth={3} />}
                        อนุมัติ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ManagerMfaList />
        </section>
      </div>
    </div>
  );
}
