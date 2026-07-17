'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, MapPin, Check, X, CheckCheck, Loader2, Search, Clock } from 'lucide-react';
import { getCSRDashboardData, reviewClient } from '@/app/actions/csr-actions';
import { getStaffSession } from '@/app/actions/auth-staff';
import CustomerPicker from '../form/components/CustomerPicker';

interface Customer {
  id: number;
  hospital_name: string;
  contact_name: string | null;
  position: string | null;
  phone: string | null;
  email: string;
  customer_code: string | null;
}

// StatPill เวอร์ชันย่อ — ใช้แค่ tone เดียว (amber) เพราะหน้านี้มีแค่ตัวเลขลูกค้าอย่างเดียว
function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 rounded-full border text-[11px] md:text-xs font-semibold bg-amber-50 border-amber-100 text-amber-700">
      <Building2 size={13} strokeWidth={2.5} />
      <span>{value}</span>
      <span className="hidden sm:inline opacity-80">{label}</span>
    </span>
  );
}

// Sub-tab แบบ segmented control — สไตล์เดียวกับที่ใช้ใน CSR Dashboard
function SubTabButton({ icon: Icon, label, count, active, onClick }: {
  icon: any; label: string; count?: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200
        ${active ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
    >
      <Icon size={15} className={active ? 'text-amber-600' : 'text-slate-400'} strokeWidth={2.5} />
      {label}
      {typeof count === 'number' && (
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/70 text-slate-500'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

export default function CSRCustomersPage() {
  const router = useRouter();
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'search'>('pending');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    const data = await getCSRDashboardData();
    if (data.success) setClients(data.clients || []);
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
    else alert('Error: ' + ((res as any).error || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'));
  };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3">
        <Loader2 className="w-9 h-9 text-teal-600 animate-spin mx-auto" strokeWidth={2.5} />
        <p className="text-sm text-slate-500 font-medium">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ══ Top Bar — สไตล์เดียวกับ CSR Dashboard ══ */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={() => router.replace('/admin/csr')}
              className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-all group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-slate-200 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-bold text-slate-900 leading-tight truncate">การจัดการข้อมูลลูกค้า</h1>
              <p className="text-[10px] md:text-[11px] text-slate-400 hidden sm:block">GPO Xchange Portal</p>
            </div>
          </div>
          {tab === 'pending' && <StatPill value={clients.length} label="ราย" />}
        </div>
      </div>

      {/* ══ Content ══ */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-10">

        {/* ── Sub-tab: รออนุมัติ / ค้นหาลูกค้าในระบบ ── */}
        <div className="inline-flex items-center gap-1 p-1 mb-4 rounded-xl bg-slate-100">
          <SubTabButton
            icon={Clock} label="รออนุมัติ" count={clients.length}
            active={tab === 'pending'} onClick={() => setTab('pending')}
          />
          <SubTabButton
            icon={Search} label="ค้นหาลูกค้าในระบบ"
            active={tab === 'search'} onClick={() => setTab('search')}
          />
        </div>

        {/* ── Tab: ลูกค้าที่รออนุมัติ (ของเดิม) ── */}
        {tab === 'pending' && (
          <section>
            <div className="flex items-center gap-2.5 mb-3 px-1">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <Building2 size={16} className="text-amber-600" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">ลูกค้าที่รออนุมัติ</h2>
                <p className="text-[11px] text-slate-400">{clients.length} รายการรอดำเนินการ</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {clients.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCheck className="w-9 h-9 text-emerald-400 mx-auto mb-2.5" strokeWidth={1.75} />
                  <p className="text-sm text-slate-400 font-medium">ไม่มีลูกค้าที่รออนุมัติ</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {clients.map((client, idx) => (
                    <div key={client.id}
                      className="flex items-center justify-between px-4 md:px-6 py-3.5 md:py-4 hover:bg-slate-50 transition-colors gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{client.hospital_name}</p>
                          {client.province && (
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <MapPin size={11} strokeWidth={2.5} />
                              {client.province}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleReviewClient(client.id, 'approved')}
                          className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all"
                        >
                          <Check size={14} strokeWidth={3} /> อนุมัติ
                        </button>
                        <button
                          onClick={() => handleReviewClient(client.id, 'rejected')}
                          className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all"
                        >
                          <X size={14} strokeWidth={3} /> ปฏิเสธ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Tab: ค้นหาลูกค้าในระบบ (ใหม่ — reuse CustomerPicker จากฟอร์ม staff) ── */}
        {tab === 'search' && (
          <section>
            <div className="flex items-center gap-2.5 mb-3 px-1">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <Search size={16} className="text-amber-600" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">ค้นหาลูกค้าในระบบ</h2>
                <p className="text-[11px] text-slate-400">ค้นหาลูกค้าที่อนุมัติแล้วเพื่อดูข้อมูลติดต่อ</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6">
              <CustomerPicker
                selected={selectedCustomer}
                onSelect={setSelectedCustomer}
                onClear={() => setSelectedCustomer(null)}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}