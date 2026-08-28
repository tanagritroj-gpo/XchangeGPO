'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, Loader2, RotateCcw } from 'lucide-react';
import { getStaffMfaStatusList, resetStaffMfa } from '@/app/actions/auth-staff';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';

type Row = {
  id: string;
  employee_id: string;
  full_name: string | null;
  username: string;
  department: string;
  role: string | null;
  email: string | null;
  mfa_enabled: boolean;
  mfa_enrolled_at: string | null;
  mfa_grace_until: string | null;
};

function statusOf(r: Row): { label: string; tone: string; Icon: typeof ShieldCheck } {
  if (r.mfa_enabled) {
    const when = r.mfa_enrolled_at
      ? new Date(r.mfa_enrolled_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })
      : '';
    return { label: `เปิดใช้แล้ว${when ? ` · ${when}` : ''}`, tone: 'text-emerald-600', Icon: ShieldCheck };
  }
  if (r.mfa_grace_until && new Date(r.mfa_grace_until).getTime() > Date.now()) {
    const days = Math.max(0, Math.ceil((new Date(r.mfa_grace_until).getTime() - Date.now()) / 86400_000));
    return { label: `อยู่ในช่วงผ่อนผัน · เหลือ ${days} วัน`, tone: 'text-amber-600', Icon: ShieldAlert };
  }
  return { label: 'เกินกำหนด — ยังไม่ตั้งค่า', tone: 'text-destructive', Icon: ShieldX };
}

export function ManagerMfaList() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const load = () => {
    getStaffMfaStatusList().then((res) => {
      if (res.success) setRows(res.data as Row[]);
      else setRows([]);
    });
  };
  useEffect(load, []);

  const handleReset = async (r: Row) => {
    const ok = await confirm({
      title: 'รีเซ็ต MFA ของพนักงาน',
      message: `${r.full_name ?? r.username} จะถูกออกจากระบบทุกอุปกรณ์ทันที และต้องตั้งค่า MFA ใหม่ภายใน 3 วัน ดำเนินการต่อ?`,
      confirmLabel: 'รีเซ็ต MFA',
      variant: 'destructive',
    });
    if (!ok) return;
    setResettingId(r.id);
    try {
      const res = await resetStaffMfa(r.id);
      if (res.success) {
        toast.success('รีเซ็ต MFA เรียบร้อยแล้ว');
        load();
      } else {
        toast.error(res.error || 'รีเซ็ตไม่สำเร็จ');
      }
    } finally {
      setResettingId(null);
    }
  };

  return (
    <section className="mt-6">
      <div className="flex items-center gap-2.5 mb-3 px-1">
        <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shrink-0">
          <ShieldCheck size={16} className="text-accent-foreground" strokeWidth={2.5} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground">การยืนยันตัวตนสองชั้น (MFA) ของพนักงาน</h2>
          <p className="text-[11px] text-muted-foreground">
            รีเซ็ตได้เมื่อพนักงานเปลี่ย/ทำโทรศัพท์หาย — จะบังคับตั้งค่าใหม่ตอนเข้าระบบครั้งถัดไป
          </p>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {rows === null ? (
          <div className="py-10 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">ไม่มีพนักงาน</div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => {
              const st = statusOf(r);
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {r.full_name ?? r.username}
                      <span className="ml-2 text-[11px] font-bold text-muted-foreground uppercase bg-secondary px-2 py-0.5 rounded-full">
                        {r.department}
                      </span>
                    </p>
                    <p className={`text-xs font-medium mt-0.5 flex items-center gap-1.5 ${st.tone}`}>
                      <st.Icon className="w-3.5 h-3.5 shrink-0" /> {st.label}
                    </p>
                  </div>
                  <button
                    onClick={() => handleReset(r)}
                    disabled={resettingId === r.id || !r.mfa_enabled}
                    title={r.mfa_enabled ? undefined : 'พนักงานยังไม่ได้เปิดใช้งาน MFA'}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold text-destructive bg-destructive/10 hover:bg-destructive/20 active:scale-95 transition-colors disabled:opacity-40 disabled:pointer-events-none shrink-0"
                  >
                    {resettingId === r.id
                      ? <Loader2 size={13} className="animate-spin" strokeWidth={2.5} />
                      : <RotateCcw size={13} strokeWidth={2.5} />}
                    รีเซ็ต MFA
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
