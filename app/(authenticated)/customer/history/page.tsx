'use client';

import { getCustomerExchangeHistory } from '@/app/actions/history-actions';
import { ExchangeHistoryView } from '@/components/history/ExchangeHistoryView';

export default function HistoryPage() {
  return (
    <ExchangeHistoryView
      fetcher={getCustomerExchangeHistory}
      title="ประวัติการแลกเปลี่ยนสินค้า"
      subtitle="ติดตามคำร้องคืน/แลกเปลี่ยนที่คุณเคยยื่นทั้งหมด"
    />
  );
}
