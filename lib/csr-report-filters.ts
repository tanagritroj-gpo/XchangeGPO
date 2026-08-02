import type { RequestRow } from '@/lib/types';

// ตัวกรองรายการใบงานสำหรับ CSR Report Center — ใช้ร่วมกันทั้งหน้าเว็บ (แสดงผล)
// และ export route (สร้างไฟล์ .xlsx) เพื่อให้ข้อมูลที่ export ตรงกับที่กรองบนจอเสมอ
export type CsrReportFilters = {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  requestType?: string;
  search?: string;
};

export function filterCsrRequests(requests: RequestRow[], filters: CsrReportFilters): RequestRow[] {
  const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const dateTo = filters.dateTo ? new Date(filters.dateTo) : null;
  if (dateTo) dateTo.setHours(23, 59, 59, 999);
  const search = filters.search?.trim().toLowerCase();

  return requests.filter((r) => {
    if (dateFrom && new Date(r.created_at || 0) < dateFrom) return false;
    if (dateTo && new Date(r.created_at || 0) > dateTo) return false;
    if (filters.status && filters.status !== 'all' && r.current_status !== filters.status) return false;
    if (filters.requestType && filters.requestType !== 'all' && r.request_type !== filters.requestType) return false;
    if (search) {
      const haystack = `${r.ref_id ?? ''} ${r.hospital_name ?? ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export function parseCsrReportFilters(params: URLSearchParams): CsrReportFilters {
  return {
    dateFrom: params.get('dateFrom') ?? undefined,
    dateTo: params.get('dateTo') ?? undefined,
    status: params.get('status') ?? undefined,
    requestType: params.get('requestType') ?? undefined,
    search: params.get('search') ?? undefined,
  };
}
