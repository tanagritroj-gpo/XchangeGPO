import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getCSRDashboardData } from '@/app/actions/csr-actions';
import { getManagerSession, getManagerRequestDetail, getManagerStatusLogsDetailed, getAllOrganizations, getB2BCustomerOrgLinks } from '@/app/actions/manager-actions';
import { filterCsrRequests, parseCsrReportFilters } from '@/lib/csr-report-filters';
import { getStatusLabel } from '@/lib/tracking-status';
import { getRejectionReasonLabel } from '@/lib/rejection-reasons';
import { getErrorMessage } from '@/lib/error-message';
import { logAuditEvent } from '@/lib/audit';
import { STAGE_ORDER, STAGE_LABEL } from '@/lib/manager-stats';
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

// ── เวลาต่อขั้นตอน (SLA) — ใช้ STAGE_ORDER/STAGE_LABEL ชุดเดียวกับที่ ManagerInsights/
// computeManagerStats ใช้คำนวณค่าเฉลี่ยรวม (lib/manager-stats.ts) แต่ตรงนี้แจกแจงเป็นราย
// ใบงานแทนการเฉลี่ยรวม — หา timestamp แรกที่แต่ละใบงานเข้าแต่ละสถานะ แล้ววัดระยะเวลา
// ระหว่างสถานะที่ติดกันตามลำดับ workflow จริง (ตั้งแต่รับคำร้อง/pending_review จนเสร็จสิ้น/completed)
function buildStageTimestamps(logs: Array<{ request_id: number; status_name: string; log_date: string | null }>) {
  const byRequest: Record<number, Record<string, string>> = {};
  logs.forEach((log) => {
    if (!log.status_name || !log.log_date) return;
    if (!byRequest[log.request_id]) byRequest[log.request_id] = {};
    const existing = byRequest[log.request_id][log.status_name];
    if (!existing || new Date(log.log_date) < new Date(existing)) {
      byRequest[log.request_id][log.status_name] = log.log_date;
    }
  });
  return byRequest;
}

function addStageDurationSheet(
  workbook: ExcelJS.Workbook,
  requests: RequestRow[],
  logs: Array<{ request_id: number; status_name: string; log_date: string | null }>,
) {
  const stageTimestamps = buildStageTimestamps(logs);
  const sheet = workbook.addWorksheet('เวลาต่อขั้นตอน (SLA)');

  const stagePairs = STAGE_ORDER.slice(0, -1).map((stage, i) => ({
    from: stage,
    to: STAGE_ORDER[i + 1],
    key: `stage_${i}`,
  }));

  sheet.columns = [
    { header: 'Ref ID', key: 'ref_id', width: 18 },
    { header: 'หน่วยงาน', key: 'hospital_name', width: 26 },
    { header: 'สถานะปัจจุบัน', key: 'status_label', width: 16 },
    ...stagePairs.map((p) => ({
      header: `${STAGE_LABEL[p.from]} → ${STAGE_LABEL[p.to]} (ชม.)`,
      key: p.key,
      width: 22,
    })),
    { header: 'รวมเวลาทั้งหมด: รับคำร้อง → เสร็จสิ้น (วัน)', key: 'totalDays', width: 32 },
  ];
  styleHeaderRow(sheet.getRow(1));

  requests.forEach((r) => {
    const stamps = stageTimestamps[r.id] ?? {};
    const row: Record<string, string | number> = {
      ref_id: r.ref_id,
      hospital_name: r.hospital_name ?? '-',
      status_label: getStatusLabel(r.current_status),
    };

    stagePairs.forEach((p) => {
      const from = stamps[p.from];
      const to = stamps[p.to];
      row[p.key] = from && to
        ? Math.round(((new Date(to).getTime() - new Date(from).getTime()) / 3600000) * 10) / 10
        : '-';
    });

    const firstStamp = STAGE_ORDER.map((s) => stamps[s]).find(Boolean);
    const completedStamp = stamps['completed'];
    row.totalDays = firstStamp && completedStamp
      ? Math.round(((new Date(completedStamp).getTime() - new Date(firstStamp).getTime()) / 86400000) * 10) / 10
      : 'ยังไม่เสร็จสิ้น';

    sheet.addRow(row);
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
  addStageDurationSheet(workbook, requests, logs);
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

// ── รายงานพอร์ตลูกค้า/หน่วยงาน — รายชื่อหน่วยงานที่ลงทะเบียนทั้งหมด (master list จาก
// organizations) พร้อมยอดใบงาน/มูลค่ารวมสะสมทั้งหมด (ไม่มีตัวกรองวันที่ ตั้งใจให้เป็นภาพรวม
// สะสมของพอร์ตทั้งหมด ไม่ใช่รายงานตามช่วงเวลาแบบ audit trail — และไม่รวม logic แยก
// dormant/active ตามที่ผู้ใช้ระบุไว้ตอนวางแผน)
//
// ⚠️ join ผ่าน requests.b2b_customer_id -> b2b_customers.organization_id เท่านั้น — ห้าม
// join ตรงด้วย requests.customer_code เพราะคอลัมน์นั้นไม่เคยถูกเซ็ตค่าเลยในข้อมูลจริง (ทั้ง
// customer_portal และ csr_manual) ลอง join ด้วย customer_code ตรงๆ มาก่อนแล้วได้ 0 ทุกแถว ──
async function buildCustomerPortfolioWorkbook() {
  const [orgsResult, dashboard, b2bLinksResult] = await Promise.all([
    getAllOrganizations(),
    getCSRDashboardData(),
    getB2BCustomerOrgLinks(),
  ]);

  const organizations = orgsResult.success ? orgsResult.data ?? [] : [];
  const allRequests: RequestRow[] = dashboard.success ? dashboard.requests ?? [] : [];
  const b2bLinks = b2bLinksResult.success ? b2bLinksResult.data ?? [] : [];

  const orgIdByB2bCustomerId = new Map<number, number>();
  b2bLinks.forEach((l) => {
    if (l.organization_id != null) orgIdByB2bCustomerId.set(l.id, l.organization_id);
  });

  type CustomerAgg = { totalRequests: number; totalValue: number; lastRequestAt: string | null };
  const byOrgId = new Map<number, CustomerAgg>();
  allRequests.forEach((r) => {
    if (r.b2b_customer_id == null) return;
    const orgId = orgIdByB2bCustomerId.get(r.b2b_customer_id);
    if (orgId == null) return;
    if (!byOrgId.has(orgId)) byOrgId.set(orgId, { totalRequests: 0, totalValue: 0, lastRequestAt: null });
    const agg = byOrgId.get(orgId)!;
    agg.totalRequests += 1;
    agg.totalValue += Number(r.total_value) || 0;
    if (r.created_at && (!agg.lastRequestAt || r.created_at > agg.lastRequestAt)) agg.lastRequestAt = r.created_at;
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GPO Xchange Portal';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('สรุป');
  summarySheet.columns = [{ width: 30 }, { width: 30 }];
  const titleRow = summarySheet.addRow(['Manager Download Center — พอร์ตลูกค้า/หน่วยงาน']);
  titleRow.font = { bold: true, size: 13 };
  summarySheet.addRow(['สร้างเมื่อ', new Date().toLocaleString('th-TH')]);
  summarySheet.addRow(['จำนวนหน่วยงานที่ลงทะเบียน', organizations.length]);

  const sheet = workbook.addWorksheet('พอร์ตลูกค้า');
  sheet.columns = [
    { header: 'รหัสลูกค้า', key: 'customer_code', width: 16 },
    { header: 'ชื่อหน่วยงาน', key: 'hospital_name', width: 30 },
    { header: 'จังหวัด', key: 'province', width: 14 },
    { header: 'ประเภทหน่วยงาน', key: 'org_type', width: 18 },
    { header: 'จำนวนใบงานทั้งหมด', key: 'totalRequests', width: 18 },
    { header: 'มูลค่ารวม (บาท)', key: 'totalValue', width: 16 },
    { header: 'ทำรายการล่าสุด', key: 'lastRequestAt', width: 18 },
  ];
  styleHeaderRow(sheet.getRow(1));

  organizations
    .map((org) => ({ org, agg: byOrgId.get(org.id) ?? { totalRequests: 0, totalValue: 0, lastRequestAt: null } }))
    .sort((a, b) => b.agg.totalValue - a.agg.totalValue)
    .forEach(({ org, agg }) => {
      sheet.addRow({
        customer_code: org.customer_code,
        hospital_name: org.hospital_name,
        province: org.province ?? '-',
        org_type: org.org_type ?? '-',
        totalRequests: agg.totalRequests,
        totalValue: agg.totalValue,
        lastRequestAt: agg.lastRequestAt ? new Date(agg.lastRequestAt).toLocaleDateString('th-TH') : '-',
      });
    });

  return { workbook, filenamePart: 'customer-portfolio' };
}

export async function GET(request: NextRequest) {
  let session;
  try {
    session = await getManagerSession();
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 403 });
  }

  const mode = request.nextUrl.searchParams.get('mode');

  try {
    const { workbook, filenamePart } = mode === 'request'
      ? await buildSingleRequestWorkbook(request.nextUrl.searchParams.get('requestId'))
      : mode === 'customer-portfolio'
      ? await buildCustomerPortfolioWorkbook()
      : await buildRangeWorkbook(request);

    const buffer = await workbook.xlsx.writeBuffer();
    const dateStamp = new Date().toISOString().slice(0, 10);

    void logAuditEvent({
      category: 'data_access', action: 'data.export.generated', outcome: 'success',
      actor: { type: 'staff', id: session.id, label: session.username },
      target: { type: 'export', id: mode ?? 'range' },
      detail: {
        export_type: `manager-${mode ?? 'range'}`, format: 'xlsx',
        request_id: mode === 'request' ? request.nextUrl.searchParams.get('requestId') : undefined,
      },
    });

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
