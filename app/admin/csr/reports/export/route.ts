import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getCSRDashboardData } from '@/app/actions/csr-actions';
import { getManagerStatusLogs, getManagerOrCsrSession } from '@/app/actions/manager-actions';
import { computeManagerStats } from '@/lib/manager-stats';
import { filterCsrRequests, parseCsrReportFilters } from '@/lib/csr-report-filters';
import { getStatusLabel } from '@/lib/tracking-status';

export const dynamic = 'force-dynamic';

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

function addSectionTitle(sheet: ExcelJS.Worksheet, title: string) {
  const row = sheet.addRow([title]);
  row.font = { bold: true, size: 12 };
}

function addTableHeader(sheet: ExcelJS.Worksheet, cols: string[]) {
  const row = sheet.addRow(cols);
  row.font = { bold: true };
  row.eachCell((cell) => { cell.fill = HEADER_FILL; });
}

export async function GET(request: NextRequest) {
  try {
    await getManagerOrCsrSession();
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' }, { status: 403 });
  }

  const filters = parseCsrReportFilters(request.nextUrl.searchParams);

  const [dashboard, logsResult] = await Promise.all([
    getCSRDashboardData(),
    getManagerStatusLogs(),
  ]);

  const allRequests = dashboard.success ? dashboard.requests ?? [] : [];
  const requests = filterCsrRequests(allRequests, filters);
  const requestIds = new Set(requests.map((r: any) => r.id));
  const statusLogs = (logsResult.success ? logsResult.data ?? [] : []).filter(
    (l: any) => requestIds.has(l.request_id),
  );

  const stats = computeManagerStats(requests, statusLogs);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GPO Xchange Portal';
  workbook.created = new Date();

  // ── Sheet 1: สรุปภาพรวม ──
  const summarySheet = workbook.addWorksheet('สรุปภาพรวม');
  summarySheet.columns = [{ width: 36 }, { width: 22 }];

  const titleRow = summarySheet.addRow(['CSR Report Center']);
  titleRow.font = { bold: true, size: 14 };
  summarySheet.addRow(['สร้างเมื่อ', new Date().toLocaleString('th-TH')]);

  const filterDesc = [
    filters.dateFrom ? `จาก ${filters.dateFrom}` : null,
    filters.dateTo ? `ถึง ${filters.dateTo}` : null,
    filters.status && filters.status !== 'all' ? `สถานะ: ${getStatusLabel(filters.status)}` : null,
    filters.requestType && filters.requestType !== 'all' ? `ประเภท: ${filters.requestType}` : null,
    filters.search ? `ค้นหา: ${filters.search}` : null,
  ].filter(Boolean).join(' | ') || 'ไม่มีตัวกรอง';
  summarySheet.addRow(['ตัวกรองที่ใช้', filterDesc]);
  summarySheet.addRow([]);

  summarySheet.addRow(['ใบงานทั้งหมด', stats.totalRequests]);
  summarySheet.addRow(['มูลค่ารวม (บาท)', stats.totalValue]);
  summarySheet.addRow(['รายการยารวม', stats.totalDrugItems]);
  summarySheet.addRow(['เวลาเฉลี่ยจนเสร็จสิ้น (วัน)', stats.avgTurnaroundDays ?? '-']);
  summarySheet.addRow(['อัตราการปฏิเสธเฉลี่ย (%)', stats.rejectionRateOverall]);
  summarySheet.addRow([]);

  addSectionTitle(summarySheet, 'ลูกค้าที่มีมูลค่ารวมสูงสุด');
  addTableHeader(summarySheet, ['หน่วยงาน', 'มูลค่า (บาท)']);
  stats.topCustomersByValue.forEach((c) => summarySheet.addRow([c.name, c.value]));
  summarySheet.addRow([]);

  addSectionTitle(summarySheet, 'ลูกค้าที่ส่งเรื่องมากที่สุด');
  addTableHeader(summarySheet, ['หน่วยงาน', 'จำนวนใบงาน']);
  stats.topCustomersByCount.forEach((c) => summarySheet.addRow([c.name, c.count]));
  summarySheet.addRow([]);

  addSectionTitle(summarySheet, 'ยาที่ถูกส่งคืนบ่อยที่สุด');
  addTableHeader(summarySheet, ['ชื่อยา', 'จำนวน (หน่วย)']);
  stats.topReturnedDrugs.forEach((d) => summarySheet.addRow([d.name, d.qty]));
  summarySheet.addRow([]);

  addSectionTitle(summarySheet, 'เหตุผลการปฏิเสธยอดนิยม');
  addTableHeader(summarySheet, ['เหตุผล', 'จำนวนครั้ง']);
  stats.topRejectionReasons.forEach((r) => summarySheet.addRow([r.reason, r.count]));
  summarySheet.addRow([]);

  addSectionTitle(summarySheet, 'จำนวนใบงานตามจังหวัด');
  addTableHeader(summarySheet, ['จังหวัด', 'จำนวนใบงาน']);
  stats.provinceStats.byCount.forEach((p) => summarySheet.addRow([p.name, p.count]));

  // ── Sheet 2: รายการใบงาน ──
  const requestsSheet = workbook.addWorksheet('รายการใบงาน');
  requestsSheet.columns = [
    { header: 'Ref ID', key: 'ref_id', width: 18 },
    { header: 'วันที่', key: 'created_at', width: 14 },
    { header: 'หน่วยงาน', key: 'hospital_name', width: 28 },
    { header: 'จังหวัด', key: 'province', width: 14 },
    { header: 'ประเภทคำร้อง', key: 'request_type', width: 18 },
    { header: 'สถานะ', key: 'status_label', width: 16 },
    { header: 'มูลค่า (บาท)', key: 'total_value', width: 16 },
    { header: 'จำนวนรายการยา', key: 'drug_item_count', width: 16 },
  ];
  requestsSheet.getRow(1).font = { bold: true };
  requestsSheet.getRow(1).eachCell((cell) => { cell.fill = HEADER_FILL; });

  requests.forEach((r: any) => {
    requestsSheet.addRow({
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

  // ── Sheet 3: รายการยา ──
  const drugSheet = workbook.addWorksheet('รายการยา');
  drugSheet.columns = [
    { header: 'Ref ID', key: 'ref_id', width: 18 },
    { header: 'ชื่อยา', key: 'drug_name', width: 28 },
    { header: 'จำนวน', key: 'qty', width: 10 },
    { header: 'หน่วย', key: 'unit', width: 10 },
    { header: 'Lot', key: 'lot_number', width: 14 },
    { header: 'Exp', key: 'exp_date', width: 14 },
    { header: 'มูลค่า (บาท)', key: 'value_amount', width: 16 },
    { header: 'สถานะ', key: 'status_label', width: 16 },
  ];
  drugSheet.getRow(1).font = { bold: true };
  drugSheet.getRow(1).eachCell((cell) => { cell.fill = HEADER_FILL; });

  requests.forEach((r: any) => {
    (r.drug_items || []).forEach((item: any) => {
      drugSheet.addRow({
        ref_id: r.ref_id,
        drug_name: item.drug_name,
        qty: item.qty,
        unit: item.unit,
        lot_number: item.lot_number ?? '-',
        exp_date: item.exp_date ? new Date(item.exp_date).toLocaleDateString('th-TH') : '-',
        value_amount: Number(item.value_amount) || 0,
        status_label: getStatusLabel(item.current_status),
      });
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const dateStamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="csr-report-${dateStamp}.xlsx"`,
    },
  });
}
