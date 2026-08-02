'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, MapPin, Check, X, CheckCheck, Loader2, Search, Clock, FileText, Download, Pencil, FileSpreadsheet } from 'lucide-react';
import { getCSRDashboardData, reviewClient, getCustomerRequestHistory, getStaffRequestDetail, getRegistrationDocumentUrl, updateCustomerOrgType } from '@/app/actions/csr-actions';
import { getStaffSession } from '@/app/actions/auth-staff';
import { ORG_TYPE_OPTIONS } from '@/lib/sale-coverage';
import CustomerPicker from '../form/components/CustomerPicker';
import { RequestHistoryList } from '@/components/history/RequestHistoryList';
import type { LucideIcon } from 'lucide-react';
import type { ClientRow, HistorySummaryRow } from '@/lib/types';

interface Customer {
  id: number;
  hospital_name: string;
  contact_name: string | null;
  position: string | null;
  phone: string | null;
  email: string;
  customer_code: string | null;
  org_type?: string | null;
}

// แก้ไขประเภทหน่วยงานของลูกค้าที่อนุมัติไปแล้ว — จำเป็นสำหรับลูกค้าเก่าที่ org_type
// ยังเป็น NULL (ลงทะเบียนก่อนมีฟีเจอร์นี้) เพื่อให้พนักงาน sale จับคู่ขอบเขตดูแลได้
function OrgTypeEditor({ customer, onSaved }: { customer: Customer; onSaved: (orgType: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(customer.org_type ?? '');
  const [saving, setSaving] = useState(false);

  const currentLabel = ORG_TYPE_OPTIONS.find((o) => o.value === customer.org_type)?.label;

  if (!editing) {
    return (
      <div className="flex items-center gap-2 mt-2">
        {currentLabel ? (
          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg">{currentLabel}</span>
        ) : (
          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg">ยังไม่ได้กำหนดประเภทหน่วยงาน</span>
        )}
        <button
          type="button"
          onClick={() => { setDraft(customer.org_type ?? ''); setEditing(true); }}
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-teal-700 transition-colors"
        >
          <Pencil size={12} strokeWidth={2.5} /> แก้ไขประเภทหน่วยงาน
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <select
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="px-3 py-1.5 rounded-lg border border-border text-xs focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
      >
        <option value="">เลือกประเภทหน่วยงาน</option>
        {ORG_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button
        type="button"
        disabled={!draft || saving}
        onClick={async () => {
          setSaving(true);
          const res = await updateCustomerOrgType(customer.id, draft);
          setSaving(false);
          if (res.success) { onSaved(draft); setEditing(false); }
          else alert(('error' in res && res.error) || 'บันทึกไม่สำเร็จ');
        }}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 transition-colors"
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={3} />} บันทึก
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs font-semibold text-muted-foreground hover:text-slate-700 transition-colors"
      >
        ยกเลิก
      </button>
    </div>
  );
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
  icon: LucideIcon; label: string; count?: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200
        ${active ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-slate-700'}`}
    >
      <Icon size={15} className={active ? 'text-amber-600' : 'text-muted-foreground'} strokeWidth={2.5} />
      {label}
      {typeof count === 'number' && (
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/70 text-muted-foreground'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

export default function CSRCustomersPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'search' | 'export'>('pending');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  // รหัสลูกค้าที่ CSR พิมพ์เอง ก่อนกดอนุมัติ — เก็บแยกตาม client.id เพราะมีหลายแถวพร้อมกัน
  const [customerCodes, setCustomerCodes] = useState<Record<string, string>>({});

  // ประวัติใบงานของลูกค้าที่เลือกในแท็บค้นหา
  const [history, setHistory] = useState<HistorySummaryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [docLoading, setDocLoading] = useState(false);
  // signed URL ของเอกสารที่กำลังแสดงอยู่ในโมดัล — ใช้แทน window.open() เพราะ window.open()
  // ที่เรียกหลัง await (คำขอ signed URL) ไม่นับเป็น user gesture ตรงๆ อีกต่อไป ทำให้ browser
  // (โดยเฉพาะ Safari บนมือถือ และบางเคสบน desktop) บล็อกเป็น popup แทนที่จะเปิดให้
  const [docModalUrl, setDocModalUrl] = useState<string | null>(null);
  // client.id ที่กำลังส่งคำขออนุมัติ/ปฏิเสธอยู่ — กันกดซ้ำระหว่างรอผล (ก่อนหน้านี้ไม่มี
  // guard ทำให้กดรัวจนคำขอซ้อนกันชน unique constraint ฝั่ง server ได้)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

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

  // โหลดประวัติใบงานทุกครั้งที่เลือกลูกค้าใหม่ในแท็บค้นหา
  useEffect(() => {
    if (!selectedCustomer) {
      setHistory([]);
      setHistoryError('');
      return;
    }
    const loadHistory = async () => {
      setHistoryLoading(true);
      setHistoryError('');
      const res = await getCustomerRequestHistory(selectedCustomer.id);
      if (res.success) setHistory(res.data ?? []);
      else setHistoryError(res.error || 'โหลดประวัติใบงานไม่สำเร็จ');
      setHistoryLoading(false);
    };
    loadHistory();
  }, [selectedCustomer]);

  const handleReviewClient = async (id: string, action: 'approved' | 'rejected') => {
    if (processingIds.has(id)) return;
    if (action === 'approved' && !customerCodes[id]?.trim()) {
      alert('กรุณาระบุรหัสลูกค้าก่อนอนุมัติ');
      return;
    }
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      const res = await reviewClient(id, action, customerCodes[id]);
      if (res.success) {
        alert(action === 'approved' ? 'อนุมัติเรียบร้อย' : 'ปฏิเสธเรียบร้อย');
        setCustomerCodes((prev) => {
          const { [id]: _omit, ...rest } = prev;
          return rest;
        });
        fetchData();
      } else {
        alert('Error: ' + (('error' in res && res.error) || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'));
        // รีเฟรชด้วยแม้ล้มเหลว — สถานะจริงใน DB อาจเปลี่ยนไปแล้ว (เช่น ถูกดำเนินการไปแล้ว
        // จากคำขออื่น) ไม่อยากให้ list ค้างข้อมูลเก่าที่ไม่ตรงกับ DB จริง
        fetchData();
      }
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleViewRegistrationDocument = async () => {
    if (!selectedCustomer) return;
    setDocLoading(true);
    const res = await getRegistrationDocumentUrl(selectedCustomer.id);
    setDocLoading(false);
    if (res.success && 'url' in res && res.url) {
      setDocModalUrl(res.url);
    } else {
      alert(('error' in res && res.error) || 'ไม่สามารถเปิดเอกสารได้');
    }
  };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <Loader2 className="w-9 h-9 text-teal-600 animate-spin mx-auto" strokeWidth={2.5} />
        <p className="text-sm text-muted-foreground font-medium">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">

      {/* ══ Top Bar — สไตล์เดียวกับ CSR Dashboard ══ */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={() => router.replace('/admin/csr')}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-all group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-slate-200 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-bold text-foreground leading-tight truncate">การจัดการข้อมูลลูกค้า</h1>
              <p className="text-[10px] md:text-[11px] text-muted-foreground hidden sm:block">GPO Xchange Portal</p>
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
          <SubTabButton
            icon={FileSpreadsheet} label="Export"
            active={tab === 'export'} onClick={() => setTab('export')}
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
                <h2 className="text-sm font-bold text-foreground">ลูกค้าที่รออนุมัติ</h2>
                <p className="text-[11px] text-muted-foreground">{clients.length} รายการรอดำเนินการ</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-border overflow-hidden">
              {clients.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCheck className="w-9 h-9 text-emerald-400 mx-auto mb-2.5" strokeWidth={1.75} />
                  <p className="text-sm text-muted-foreground font-medium">ไม่มีลูกค้าที่รออนุมัติ</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {clients.map((client, idx) => (
                    <div key={client.id}
                      className="flex flex-col gap-3 px-4 md:px-6 py-3.5 md:py-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{client.hospital_name}</p>
                          {client.province && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin size={11} strokeWidth={2.5} />
                              {client.province}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pl-11">
                        <input
                          value={customerCodes[client.id] ?? ''}
                          onChange={(e) => setCustomerCodes((prev) => ({ ...prev, [client.id]: e.target.value }))}
                          placeholder="รหัสลูกค้า (จำเป็นก่อนอนุมัติ)"
                          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border text-xs focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                        />
                        <button
                          onClick={() => handleReviewClient(client.id, 'approved')}
                          disabled={!customerCodes[client.id]?.trim() || processingIds.has(client.id)}
                          title={!customerCodes[client.id]?.trim() ? 'กรุณาระบุรหัสลูกค้าก่อนอนุมัติ' : undefined}
                          className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-sm disabled:hover:translate-y-0"
                        >
                          {processingIds.has(client.id) ? <Loader2 size={14} className="animate-spin" strokeWidth={3} /> : <Check size={14} strokeWidth={3} />} อนุมัติ
                        </button>
                        <button
                          onClick={() => handleReviewClient(client.id, 'rejected')}
                          disabled={processingIds.has(client.id)}
                          className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-sm disabled:hover:translate-y-0"
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

        {/* ── Tab: ค้นหาลูกค้าในระบบ (reuse CustomerPicker จากฟอร์ม staff) + ประวัติใบงาน ── */}
        {tab === 'search' && (
          <div className="space-y-5">
            <section>
              <div className="flex items-center gap-2.5 mb-3 px-1">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <Search size={16} className="text-amber-600" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">ค้นหาลูกค้าในระบบ</h2>
                  <p className="text-[11px] text-muted-foreground">ค้นหาลูกค้าที่อนุมัติแล้วเพื่อดูข้อมูลติดต่อและประวัติใบงาน</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-border p-5 md:p-6">
                <CustomerPicker
                  selected={selectedCustomer}
                  onSelect={setSelectedCustomer}
                  onClear={() => setSelectedCustomer(null)}
                />
                {selectedCustomer && (
                  <OrgTypeEditor
                    customer={selectedCustomer}
                    onSaved={(orgType) => setSelectedCustomer((prev) => prev ? { ...prev, org_type: orgType } : prev)}
                  />
                )}
              </div>
            </section>

            {/* ── ประวัติใบงานของลูกค้าที่เลือก — กดแต่ละแถวเพื่อดูรายละเอียดเต็มแบบหน้า tracking login ── */}
            {selectedCustomer && (
              <section>
                <div className="flex items-center gap-2.5 mb-3 px-1">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-blue-600" strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold text-foreground">ประวัติใบงาน</h2>
                    <p className="text-[11px] text-muted-foreground">{selectedCustomer.hospital_name}</p>
                  </div>
                  <button
                    onClick={handleViewRegistrationDocument}
                    disabled={docLoading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-100 transition-all shrink-0 disabled:opacity-50"
                  >
                    {docLoading ? <Loader2 size={14} className="animate-spin" strokeWidth={2.5} /> : <Download size={14} strokeWidth={2.5} />}
                    เอกสารยืนยันการลงทะเบียน
                  </button>
                </div>

                <RequestHistoryList
                  history={history}
                  loading={historyLoading}
                  error={historyError}
                  emptyText="ลูกค้ารายนี้ยังไม่มีประวัติใบงาน"
                  fetchDetail={(id) => getStaffRequestDetail(id, selectedCustomer.id)}
                />
              </section>
            )}
          </div>
        )}

        {/* ── Tab: Export รายชื่อลูกค้าทั้งหมดเป็น Excel ── */}
        {tab === 'export' && (
          <section>
            <div className="flex items-center gap-2.5 mb-3 px-1">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <FileSpreadsheet size={16} className="text-amber-600" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">Export รายชื่อลูกค้า</h2>
                <p className="text-[11px] text-muted-foreground">ส่งออกรายชื่อลูกค้าที่อนุมัติแล้วทั้งหมด พร้อมข้อมูลเบื้องต้น</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-border p-6 md:p-8 flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center">
                <FileSpreadsheet size={26} className="text-amber-600" strokeWidth={2} />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">รายชื่อลูกค้าทั้งหมด (Excel)</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  ไฟล์ .xlsx ประกอบด้วย รหัสลูกค้า, ชื่อหน่วยงาน, ประเภทหน่วยงาน, จังหวัด, ชื่อผู้ติดต่อ, ตำแหน่ง, เบอร์โทรศัพท์, อีเมล และวันที่ลงทะเบียน ของลูกค้าที่อนุมัติแล้วทุกราย
                </p>
              </div>
              <a
                href="/admin/csr/customers/export"
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-sm hover:shadow-md transition-all"
              >
                <Download size={16} strokeWidth={2.5} />
                ดาวน์โหลด Excel
              </a>
            </div>
          </section>
        )}
      </div>

      {/* ══ โมดัลดูเอกสารยืนยันการลงทะเบียน — แสดงในหน้าเดียวกันแทน window.open() ══
          (window.open() หลัง await ไม่นับเป็น user gesture ต่อเนื่อง ทำให้ browser
          บล็อกเป็น popup ทั้งบน desktop บางเคสและมือถือ Safari แทบทุกเคส) */}
      {docModalUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-6 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setDocModalUrl(null)}
        >
          <div
            className="relative w-full max-w-3xl h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
              <h3 className="text-sm font-bold text-foreground">เอกสารยืนยันการลงทะเบียน</h3>
              <div className="flex items-center gap-2">
                <a
                  href={docModalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-100 transition-all"
                >
                  <Download size={13} strokeWidth={2.5} />
                  เปิดในแท็บใหม่ / ดาวน์โหลด
                </a>
                <button
                  onClick={() => setDocModalUrl(null)}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-slate-100 hover:text-slate-600 transition-all"
                  aria-label="ปิด"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>
            <iframe src={docModalUrl} className="flex-1 w-full" title="เอกสารยืนยันการลงทะเบียน" />
          </div>
        </div>
      )}
    </div>
  );
}