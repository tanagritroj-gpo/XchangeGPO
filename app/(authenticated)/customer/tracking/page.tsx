'use client'

import { trackMyRequestByRefId } from '@/app/actions/tracking-actions'
import { TrackingDetailView } from '@/components/tracking/TrackingDetailView'

export default function CustomerTrackingPage() {
  return (
    <TrackingDetailView
      fetchFn={trackMyRequestByRefId}
      heading="ติดตามสถานะคำร้องของฉัน"
      subheading="ดูรายละเอียดคำร้องคืนสินค้าของคุณแบบเต็มรูปแบบ รวมมูลค่าและหมายเหตุจากเจ้าหน้าที่"
      showPingButton
      showPdfDownload
    />
  );
}
