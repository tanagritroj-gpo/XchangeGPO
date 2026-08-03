'use client';

import { getCustomerExchangeHistory } from '@/app/actions/history-actions';
import { ExchangeHistoryView } from '@/components/history/ExchangeHistoryView';

export default function HistoryPage() {
  return (
    <ExchangeHistoryView
      fetcher={getCustomerExchangeHistory}
      title="ประวัติการยื่นคำร้อง"
      subtitle="ติดตามงานรับคืนสินค้า/รับคืนแลกเปลี่ยนที่คุณเคยยื่นทั้งหมด"
    />
  );
}
