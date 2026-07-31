'use client';

import { Building2 } from 'lucide-react';
import { getOrgExchangeHistory } from '@/app/actions/history-actions';
import { ExchangeHistoryView } from '@/components/history/ExchangeHistoryView';

export default function OrgHistoryPage() {
  return (
    <ExchangeHistoryView
      fetcher={getOrgExchangeHistory}
      title="ประวัติงานรวมทั้งหน่วยงาน"
      subtitle="รวมคำร้องคืน/แลกเปลี่ยนของทุกคนในหน่วยงานเดียวกัน"
      icon={Building2}
      showSubmitter
      emptyText="ยังไม่มีคำร้องจากหน่วยงานนี้"
      emptySubtext="คำร้องที่เพื่อนร่วมหน่วยงานยื่นจะแสดงที่นี่"
    />
  );
}
