'use client';

import { useEffect, useState } from 'react';
import { Eye, ChevronDown, Truck, Warehouse, Users, RefreshCw, X } from 'lucide-react';
import { getSaleCustomerHistory } from '@/app/actions/sale-actions';
import { STATUS_OWNER_DEPARTMENT } from '@/lib/status-department';
import { STATUS_LABELS, getStatusMeta } from '@/lib/tracking-status';
import { Skeleton } from '@/components/ui/skeleton';
import type { LucideIcon } from 'lucide-react';
import type { DrugItemRow } from '@/lib/types';

// โครงกระดานตอนโหลด — เลียนแบบรูปทรงจริง (บล็อกสถานะ + การ์ดย่อยข้างใน) แทน spinner กลาง
// จอเฉยๆ ให้เห็นโครงคร่าวๆ ก่อนข้อมูลจริงมา (pattern เดียวกับ SkeletonStatCards ใน
// components/skeletons/DashboardSkeleton.tsx แต่ปรับทรงให้ตรงกับบอร์ดนี้โดยเฉพาะ)
function SkeletonWorkflowBoard() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-secondary/50 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2 mb-3 px-0.5">
            <Skeleton className="w-6 h-6 rounded-md shrink-0" />
            <Skeleton className="h-3 w-28 rounded" />
            <Skeleton className="ml-auto h-4 w-6 rounded-full" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((__, j) => (
              <Skeleton key={j} className="h-[72px] rounded-md" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ทุกสถานะจริงของ requests.current_status จัดกลุ่มเรียงตามลำดับ pipeline จริง — ★ ต่างจาก
// "Active Workflow" ของ CSR (app/admin/csr/dashboard/page.tsx, MONITOR_STAGE_ORDER) ที่โชว์
// แค่ 5 สถานะที่ log/wh อัปเดต เพราะ CSR มีแท็บ "CSR Workflow" แยกไว้จัดการสถานะของตัวเองอยู่
// แล้ว — Sale ไม่มี tab แยกแบบนั้น (ไม่ได้กดอัปเดตสถานะไหนเลย แค่มอนิเตอร์ทั้ง pipeline) จึงโชว์
// ทุกสถานะในบอร์ดเดียว ตามที่ตกลงกันไว้ — แต่ละ entry เป็น "กลุ่ม" ของสถานะ (ปกติมี 1 สถานะ)
// ★ exchanging กับ credit_note รวมเป็นช่องเดียวโดยตั้งใจ (ตามที่ผู้ใช้ขอ) เพราะทั้งคู่คือผลลัพธ์
// ทางเลือกของ action เดียวกัน (startExchangeProcess ใน csr-actions.ts เลือกสถานะใดสถานะหนึ่งตาม
// request_type) เป็นสาระเดียวกันคือ "กำลังดำเนินการ" ขั้นตอนนี้ ไม่ใช่คนละขั้นตอนจริงๆ
// ★ out_for_delivery ย้ายมาไว้หลัง completed โดยตั้งใจ (ตามที่ผู้ใช้ขอ) — ไม่ตรงกับลำดับ
// pipeline จริงทุกกระเบียดนิ้วแล้ว แต่เป็นลำดับการแสดงผลที่ผู้ใช้ต้องการ
type StageGroup = { key: string; statuses: string[]; label: string; icon: LucideIcon; bg: string; fg: string };

const EXCHANGING_OR_CREDIT_NOTE: StageGroup = {
  key: 'exchanging_credit_note',
  statuses: ['exchanging', 'credit_note'],
  label: 'กำลังแลกเปลี่ยน/ลดหนี้',
  icon: RefreshCw,
  bg: 'bg-amber-50',
  fg: 'text-amber-600',
};

function singleStatusGroup(status: string): StageGroup {
  const meta = getStatusMeta(status);
  return { key: status, statuses: [status], label: STATUS_LABELS[status] ?? status, icon: meta.icon, bg: meta.bg, fg: meta.fg };
}

const WORKFLOW_STAGE_GROUPS: StageGroup[] = [
  singleStatusGroup('pending_review'),
  singleStatusGroup('approved'),
  singleStatusGroup('in_transit'),
  singleStatusGroup('at_warehouse'),
  singleStatusGroup('checked_in'),
  singleStatusGroup('receiving'),
  EXCHANGING_OR_CREDIT_NOTE,
  singleStatusGroup('completed'),
  singleStatusGroup('out_for_delivery'),
  singleStatusGroup('rejected'),
];

// ป้ายแผนกเจ้าของงาน ณ สถานะนั้นๆ — ใช้ STATUS_OWNER_DEPARTMENT (lib/status-department.ts) เป็น source of
// truth เดียว (ไม่ประกาศ map สถานะ->แผนกซ้ำเหมือน MONITOR_STAGE_ROLE ฝั่ง CSR) สถานะ terminal
// (completed/rejected) ไม่มีแผนกเจ้าของแล้วจึงไม่มี key ใน STATUS_OWNER_DEPARTMENT — ไม่โชว์ป้าย
const DEPARTMENT_TAG: Record<'csr' | 'logistics' | 'warehouse', { label: string; icon: LucideIcon; color: string; bg: string }> = {
  csr:       { label: 'CSR',         icon: Users,     color: 'text-amber-700',  bg: 'bg-amber-50' },
  logistics: { label: 'โลจิสติกส์', icon: Truck,     color: 'text-blue-700',   bg: 'bg-blue-50' },
  warehouse: { label: 'คลังสินค้า', icon: Warehouse, color: 'text-purple-700', bg: 'bg-purple-50' },
};

// รูปย่อของ requests ที่ get_sale_customer_history() RPC (เรียกผ่าน getSaleCustomerHistory())
// คืนมาจริง — เฉพาะฟิลด์ที่บอร์ดนี้ใช้แสดงผล ไม่ใช้ RequestRow/HistorySummaryRow ตรงๆ เพราะ
// drug_items ที่ RPC ฝังมาเป็นแค่ subset ของคอลัมน์จริงใน DrugItemRow เท่านั้น
type SaleWorkflowDrugItem = Pick<DrugItemRow, 'id' | 'drug_name' | 'qty' | 'unit' | 'lot_number' | 'value_amount' | 'current_status'>;
type SaleWorkflowRequest = {
  id: number;
  ref_id: string;
  hospital_name: string | null;
  current_status: string;
  drug_items: SaleWorkflowDrugItem[] | null;
};

// item ที่ถูกปฏิเสธในขั้นตอนใดก็ตาม (CSR ตรวจ compliance ไม่ผ่าน / คลังปฏิเสธตอนตรวจรับ)
const isSaleItemRejected = (i: SaleWorkflowDrugItem) => i.current_status === 'rejected';

// การ์ดใบงาน 1 ใบในกระดาน — read-only ล้วนๆ (sale ไม่มีปุ่ม action ใดๆ แค่มอนิเตอร์)
function WorkflowCard({ req, isExpanded, onToggle }: { req: SaleWorkflowRequest; isExpanded: boolean; onToggle: () => void }) {
  const drugItems = req.drug_items ?? [];
  const drugCount = drugItems.length;
  const rejectedCount = drugItems.filter(isSaleItemRejected).length;
  // มูลค่าที่แสดง = หักรายการที่ถูกปฏิเสธออกแล้ว
  const netValue = drugItems.filter((i) => !isSaleItemRejected(i)).reduce((s, i) => s + (Number(i.value_amount) || 0), 0);
  const dept = STATUS_OWNER_DEPARTMENT[req.current_status];
  const tag = dept ? DEPARTMENT_TAG[dept] : null;
  const TagIcon = tag?.icon;

  return (
    <div className="bg-card rounded-md border border-border hover:border-primary/30 hover:shadow-sm transition-all duration-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-foreground font-mono truncate">{req.ref_id}</p>
        {tag && TagIcon && (
          <span className={`flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-bold ${tag.bg} ${tag.color}`}>
            <TagIcon className="w-2.5 h-2.5" strokeWidth={2.5} />
            {tag.label}
          </span>
        )}
      </div>
      {req.hospital_name && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{req.hospital_name}</p>}

      <button
        onClick={onToggle}
        className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground font-semibold transition-colors"
      >
        <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-accent text-accent-foreground font-bold text-[11px] leading-none">{drugCount}</span>
        รายการสินค้า
        {rejectedCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-red-600 font-bold">
            <X size={11} strokeWidth={3} />{rejectedCount}
          </span>
        )}
        <ChevronDown size={12} strokeWidth={2.5} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && drugCount > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-border pt-2">
          {drugItems.map((item) => {
            const rejected = isSaleItemRejected(item);
            return (
              <div key={item.id} className={`text-[11px] rounded-md px-2 py-1.5 ${rejected ? 'bg-red-50' : 'bg-secondary/60'}`}>
                <p className={`font-bold truncate ${rejected ? 'text-red-600' : 'text-foreground'}`}>
                  {item.drug_name}
                  {rejected && <span className="ml-1 font-black">✗</span>}
                </p>
                <p className={`mt-0.5 ${rejected ? 'text-red-400 line-through' : 'text-muted-foreground'}`}>
                  {item.qty} {item.unit}{item.lot_number ? ` · Lot ${item.lot_number}` : ''}
                </p>
              </div>
            );
          })}
          {netValue > 0 && (
            <p className="text-right text-[11px] font-bold text-primary pt-0.5">
              {rejectedCount > 0 && <span className="text-muted-foreground font-normal">มูลค่าสุทธิ </span>}
              {netValue.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── การ์ด "Active Workflow" หน้า Sale Hub — ต่างจากของ CSR 2 จุด: (1) โชว์ทุกสถานะจริง ไม่ใช่
// แค่ subset เพราะ sale ไม่มี tab ของตัวเองแยกสถานะ actionable ออกไป (2) ดึงข้อมูลเองในตัวผ่าน
// getSaleCustomerHistory() ที่ scope ตามขอบเขต org_type/province ของ session staff อยู่แล้ว
// (ดู getSaleCoverage ใน app/actions/sale-actions.ts) ไม่ต้องรับ items เป็น prop จาก parent
// เหมือน MonitorBoard ฝั่ง CSR — ฝังลงหน้า hub ได้ตรงๆ เป็น self-contained card ──
// จำนวนการ์ดเริ่มต้นต่อช่องสถานะ — ช่อง "เสร็จสิ้น" สะสมใบงานเยอะที่สุดเพราะเป็น terminal
// status ที่ไม่เคยถูกล้าง กด "แสดงเพิ่มเติม" ทีละ PAGE_SIZE แทนโหลด/เรนเดอร์ทั้งหมดทีเดียว
const PAGE_SIZE = 9;

export default function SaleActiveWorkflow() {
  const [requests, setRequests] = useState<SaleWorkflowRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // ★ Set — แต่ละการ์ดกาง/พับอิสระ เปิดพร้อมกันได้หลายใบ (ไม่ใช่ accordion ตัวเดียว)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});

  const toggleExpanded = (id: number) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const showMore = (key: string) => {
    setVisibleCounts((prev) => ({ ...prev, [key]: (prev[key] ?? PAGE_SIZE) + PAGE_SIZE }));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getSaleCustomerHistory();
      if (cancelled) return;
      setRequests(data ?? []);
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="bg-card rounded-lg border border-border p-5 md:p-6">
      <div className="flex items-center gap-2.5 mb-4 px-1">
        <div className="w-9 h-9 rounded-md bg-accent text-accent-foreground shadow-sm shadow-accent/40 flex items-center justify-center shrink-0">
          <Eye size={16} strokeWidth={2.5} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground">Active Workflow</h2>
          <p className="text-xs text-muted-foreground">
            {isLoading ? 'กำลังโหลดข้อมูล...' : `${requests.length} ใบงานในพื้นที่ดูแลของคุณ — จัดกลุ่มตามสถานะจริง`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <SkeletonWorkflowBoard />
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">ยังไม่มีคำร้องจากลูกค้าในพื้นที่ดูแลของคุณ</p>
      ) : (
        <div className="space-y-3">
          {WORKFLOW_STAGE_GROUPS.map((group) => {
            const StageIcon = group.icon;
            const colItems = requests.filter((r) => group.statuses.includes(r.current_status));
            const visibleCount = visibleCounts[group.key] ?? PAGE_SIZE;
            const visibleItems = colItems.slice(0, visibleCount);
            const remaining = colItems.length - visibleItems.length;
            return (
              <div key={group.key} className="bg-secondary/50 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-3 px-0.5">
                  <span className={`flex items-center justify-center w-6 h-6 rounded-md shrink-0 ${group.bg}`}>
                    <StageIcon className={`w-3.5 h-3.5 ${group.fg}`} strokeWidth={2.5} />
                  </span>
                  <span className={`text-xs font-bold ${group.fg}`}>{group.label}</span>
                  <span className="ml-auto text-[11px] font-bold text-muted-foreground bg-card px-1.5 py-0.5 rounded-full border border-border">
                    {colItems.length}
                  </span>
                </div>
                {colItems.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-6">ไม่มีใบงาน</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 items-start">
                      {visibleItems.map((req) => (
                        <WorkflowCard
                          key={req.id}
                          req={req}
                          isExpanded={expandedIds.has(req.id)}
                          onToggle={() => toggleExpanded(req.id)}
                        />
                      ))}
                    </div>
                    {remaining > 0 && (
                      <button
                        onClick={() => showMore(group.key)}
                        className="mt-2 w-full text-center text-[11px] font-bold text-primary hover:text-primary/80 py-2 rounded-md hover:bg-card transition-colors"
                      >
                        แสดงเพิ่มเติม (เหลืออีก {remaining} รายการ)
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
