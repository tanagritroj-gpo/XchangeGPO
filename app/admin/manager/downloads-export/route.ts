import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getCSRDashboardData } from '@/app/actions/csr-actions';
import { getManagerSession, getManagerRequestDetail, getManagerStatusLogsDetailed } from '@/app/actions/manager-actions';
import { filterCsrRequests, parseCsrReportFilters } from '@/lib/csr-report-filters';
import { getStatusLabel } from '@/lib/tracking-status';
import { getRejectionReasonLabel } from '@/lib/rejection-reasons';
import { getErrorMessage } from '@/lib/error-message';
import type { RequestRow, DrugItemRow } from '@/lib/types';

// Download Center ของ Manager Portal — export "audit trail" (status_logs) จริง
// ต่างจาก app/admin/csr/reports/export/route.ts ที่เน้นสรุปสถิติธุรกิจ ไฟล์นี้เน้น
// รายละเอียดการเปลี่ยนสถานะทุกจุดพร้อมผู้ดำเนินการ ให้ manager โหลดเก็บไว้ตรวจสอบย้อนหลังได้
// รองรับ 2 โหมด: mode=range (รวมหลายใบงานตามช่วงวันที่) และ mode=request (ใบงานเดียวแบบละเอียด)
export const dynamic = 'force-dynamic';

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((cell) => { cell.fill = HEADER_FILL; });
}

function describeActor(log: { actor_type: string; staff_name?: string | null; department: string }) {
  if (log.actor_type === 'customer') return 'ลูกค้า';
  if (log.actor_type === 'system') return 'ระบบอัตโนมัติ';
  return log.staff_name ? `${log.staff_name} (${log.department})` : `พนักงานแผนก ${log.department}`;
}

function addAuditTrailSheet(
  workbook: ExcelJS.Workbook,
  logs: Array<{
    request_id: number; status_name: string; log_date: string | null; staff_remark: string | null;
    department: string; actor_type: string; rejection_reason_code: string | null; staff_name?: string | null;
  }>,
  refIdByRequestId: Record<number, string>,
  includeRefColumn: boolean,
) {
  const sheet = workbook.addWorksheet('Audit Trail (Status Logs)');
  const columns: Partial<ExcelJS.Column>[] = [];
  if (includeRefColumn) columns.push({ header: 'Ref ID', key: 'ref_id', width: 18 });
  columns.push(
    { header: 'วันที่/เวลา', key: 'log_date', width: 20 },
    { header: 'สถานะ', key: 'status_label', width: 18 },
    { header: 'ผู้ดำเนินการ', key: 'actor', width: 26 },
    { header: 'หมายเหตุ', key: 'staff_remark', width: 34 },
    { header: 'เหตุผลปฏิเสธ', key: 'rejection_reason', width: 24 },
  );
  sheet.columns = columns;
  styleHeaderRow(sheet.getRow(1));

  logs.forEach((log) => {
    sheet.addRow({
      ref_id: refIdByRequestId[log.request_id] ?? `#${log.request_id}`,
      log_date: log.log_date ? new Date(log.log_date).toLocaleString('th-TH') : '-',
      status_label: getStatusLabel(log.status_name),
      actor: describeActor(log),
      staff_remark: log.staff_remark ?? '-',
      rejection_reason: log.rejection_reason_code ? getRejectionReasonLabel(log.rejection_reason_code) : '-',
    });
  });
}

function addRequestSummarySheet(workbook: ExcelJS.Workbook, requests: RequestRow[]) {
  const sheet = workbook.addWorksheet('รายละเอียดใบงาน');
  sheet.columns = [
    { header: 'Ref ID', key: 'ref_id', width: 18 },
    { header: 'วันที่สร้าง', key: 'created_at', width: 16 },
    { header: 'หน่วยงาน', key: 'hospital_name', width: 28 },
    { header: 'จังหวัด', key: 'province', width: 14 },
    { header: 'ประเภทคำร้อง', key: 'request_type', width: 18 },
    { header: 'สถานะปัจจุบัน', key: 'status_label', width: 16 },
    { header: 'มูลค่ารวม (บาท)', key: 'total_value', width: 16 },
    { header: 'จำนวนรายการยา', key: 'drug_item_count', width: 16 },
  ];
  styleHeaderRow(sheet.getRow(1));

  requests.forEach((r) => {
    sheet.addRow({
      ref_id: r.ref_id,
      created_at: r.created_at ? new Date(r.created_at).toLocaleDateString('th-TH') : '-',
      hospital_name: r.hospital_name ?? '-',
      province: r.province ?? '-',
      request_type: r.request_type ?? '-',
      status_label: getStatusLabel(r.current_status),
      total_value: Number(r.total_value) || 0,
      drug_item_count: r.drug_items?.length ?? 0,
    });
  });
}

function addDrugItemsSheet(workbook: ExcelJS.Workbook, drugItems: DrugItemRow[]) {
  const sheet = workbook.addWorksheet('รายการยา');
  sheet.columns = [
    { header: 'ชื่อยา', key: 'drug_name', width: 28 },
    { header: 'จำนวน', key: 'qty', width: 10 },
    { header: 'หน่วย', key: 'unit', width: 10 },
    { header: 'Lot', key: 'lot_number', width: 14 },
    { header: 'Exp', key: 'exp_date', width: 14 },
    { header: 'มูลค่า (บาท)', key: 'value_amount', width: 16 },
    { header: 'สถานะ', key: 'status_label', width: 16 },
  ];
  styleHeaderRow(sheet.getRow(1));

  drugItems.forEach((item) => {
    sheet.addRow({
      drug_name: item.drug_name,
      qty: item.qty,
      unit: item.unit,
      lot_number: item.lot_number ?? '-',
      exp_date: item.exp_date ? new Date(item.exp_date).toLocaleDateString('th-TH') : '-',
      value_amount: Number(item.value_amount) || 0,
      status_label: getStatusLabel(item.current_status ?? undefined),
    });
  });
}

async function buildRangeWorkbook(request: NextRequest) {
  const filters = parseCsrReportFilters(request.nextUrl.searchParams);

  const dashboard = await getCSRDashboardData();
  const allRequests: RequestRow[] = dashboard.success ? dashboard.requests ?? [] : [];
  const requests = filterCsrRequests(allRequests, filters);
  const requestIds = requests.map((r) => r.id);
  const refIdByRequestId = Object.fromEntries(requests.map((r) => [r.id, r.ref_id]));

  const logsResult = await getManagerStatusLogsDetailed(requestIds);
  const logs = logsResult.success ? logsResult.data ?? [] : [];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GPO Xchange Portal';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('สรุป');
  summarySheet.columns = [{ width: 30 }, { width: 30 }];
  const titleRow = summarySheet.addRow(['Manager Download Center — Audit Trail Export']);
  titleRow.font = { bold: true, size: 13 };
  summarySheet.addRow(['สร้างเมื่อ', new Date().toLocaleString('th-TH')]);
  const filterDesc = [
    filters.dateFrom ? `จาก ${filters.dateFrom}` : null,
    filters.dateTo ? `ถึง ${filters.dateTo}` : null,
  ].filter(Boolean).join(' – ') || 'ทุกช่วงเวลา';
  summarySheet.addRow(['ช่วงเวลาที่เลือก', filterDesc]);
  summarySheet.addRow(['จำนวนใบงาน', requests.length]);
  summarySheet.addRow(['จำนวนรายการ log', logs.length]);

  addRequestSummarySheet(workbook, requests);
  addAuditTrailSheet(workbook, logs, refIdByRequestId, true);

  return { workbook, filenamePart: 'audit-trail' };
}

async function buildSingleRequestWorkbook(requestIdRaw: string | null) {
  const requestId = Number(requestIdRaw);
  if (!requestIdRaw || Number.isNaN(requestId)) {
    throw new Error('ไม่พบเลขที่ใบงานที่ต้องการดาวน์โหลด');
  }

  const detailResult = await getManagerRequestDetail(requestId);
  if (!detailResult.success || !detailResult.data) {
    throw new Error(detailResult.error || 'ไม่พบข้อมูลใบงานนี้');
  }
  const req = detailResult.data as RequestRow;

  const logsResult = await getManagerStatusLogsDetailed([requestId]);
  const logs = logsResult.success ? logsResult.data ?? [] : [];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GPO Xchange Portal';
  workbook.created = new Date();

  const infoSheet = workbook.addWorksheet('รายละเอียดใบงาน');
  infoSheet.columns = [{ width: 22 }, { width: 40 }];
  const rows: [string, string | number][] = [
    ['Ref ID', req.ref_id],
    ['วันที่สร้าง', req.created_at ? new Date(req.created_at).toLocaleString('th-TH') : '-'],
    ['ประเภทคำร้อง', req.request_type ?? '-'],
    ['หน่วยงาน', req.hospital_name ?? '-'],
    ['จังหวัด', req.province ?? '-'],
    ['รหัสลูกค้า', req.customer_code ?? '-'],
    ['ผู้ติดต่อ', req.contact_name ?? '-'],
    ['เบอร์โทร', req.phone ?? '-'],
    ['เหตุผลการคืน', req.return_reason ?? '-'],
    ['สินค้าที่ต้องการแลกเปลี่ยน', req.exchange_product ?? '-'],
    ['วิธีคืนสินค้า', req.delivery_type ?? '-'],
    ['สถานะปัจจุบัน', getStatusLabel(req.current_status)],
    ['มูลค่ารวม (บาท)', Number(req.total_value) || 0],
    ['ช่องทางที่ยื่นคำร้อง', req.submission_channel === 'csr_manual' ? 'CSR กรอกแทน' : 'ลูกค้ายื่นเอง'],
  ];
  rows.forEach((r) => infoSheet.addRow(r));
  infoSheet.getColumn(1).font = { bold: true };

  addDrugItemsSheet(workbook, req.drug_items ?? []);
  addAuditTrailSheet(workbook, logs, { [requestId]: req.ref_id }, false);

  return { workbook, filenamePart: req.ref_id };
}

export async function GET(request: NextRequest) {
  try {
    await getManagerSession();
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 403 });
  }

  const mode = request.nextUrl.searchParams.get('mode');

  try {
    const { workbook, filenamePart } = mode === 'request'
      ? await buildSingleRequestWorkbook(request.nextUrl.searchParams.get('requestId'))
      : await buildRangeWorkbook(request);

    const buffer = await workbook.xlsx.writeBuffer();
    const dateStamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="manager-${filenamePart}-${dateStamp}.xlsx"`,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 400 });
  }
}
