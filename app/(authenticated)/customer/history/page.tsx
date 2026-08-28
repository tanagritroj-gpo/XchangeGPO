'use client';

import { useEffect, useState } from 'react';
import { getCustomerExchangeHistory } from '@/app/actions/history-actions';
import { ExchangeHistoryView } from '@/components/history/ExchangeHistoryView';
import type { RequestRow } from '@/lib/types';

// tab กรองตามประเภทใบงาน (request_type) — ดีไซน์เดียวกับหน้า "ประวัติงานรวมทั้งหน่วยงาน"
// (app/(authenticated)/customer/org-history/page.tsx) ทุกประการ — งานประเภทอื่น (เช่น
// "รับคืน CCR") ยังเห็นได้ผ่านแท็บ "ทั้งหมด" ตามปกติ
const REQUEST_TYPE_TABS = [
  { key: 'all', label: 'ทั้งหมด', requestType: null as string | null },
  { key: 'debt', label: 'งานรับคืนลดหนี้', requestType: 'รับคืนลดหนี้' },
  { key: 'exchange', label: 'งานรับคืนแลกเปลี่ยน', requestType: 'รับคืนแลกเปลี่ยน' },
] as const;

export default function HistoryPage() {
  // ดึงข้อมูลครั้งเดียวตอนโหลดหน้า แล้วกรองด้วย request_type ฝั่ง client ตอนสลับ tab
  // (ไม่ยิง request ใหม่ทุกครั้งที่สลับ เพราะเป็นข้อมูลชุดเดียวกัน แค่กรองต่าง)
  const [rawHistory, setRawHistory] = useState<RequestRow[]>([]);
  const [activeTab, setActiveTab] = useState<(typeof REQUEST_TYPE_TABS)[number]['key']>('all');

  useEffect(() => {
    let cancelled = false;
    getCustomerExchangeHistory().then((data) => {
      if (!cancelled) setRawHistory(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeDef = REQUEST_TYPE_TABS.find((t) => t.key === activeTab)!;
  const filtered = activeDef.requestType
    ? rawHistory.filter((r) => r.request_type === activeDef.requestType)
    : rawHistory;

  return (
    <ExchangeHistoryView
      key={activeTab}
      fetcher={async () => filtered}
      title="ประวัติการยื่นคำร้อง"
      subtitle="ติดตามงานรับคืนสินค้า/รับคืนแลกเปลี่ยนที่คุณเคยยื่นทั้งหมด"
      headerExtra={
        <div role="tablist" aria-label="กรองตามประเภทงาน" className="flex flex-wrap gap-2">
          {REQUEST_TYPE_TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-slate-600 hover:border-primary/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      }
    />
  );
}
