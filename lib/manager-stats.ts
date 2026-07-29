/**
 * ── สถิติของ Manager Insights (extracted) ────────────────────────────
 * ดึง logic คำนวณทั้งหมดออกมาจาก components/ManagerInsights.tsx ให้เป็น
 * pure function ที่รับ requests[]/statusLogs[] แล้วคืนตัวเลขล้วนๆ ไม่ผูก
 * กับ React (ไม่มี useMemo/useState) เพื่อให้เรียกใช้ได้ทั้งจาก:
 * 1. ManagerInsights.tsx (โชว์กราฟ — ยังคง import ไฟล์นี้แทนที่จะคำนวณเอง)
 * 2. app/api/staff-chat/route.ts (สรุปเป็นข้อความให้ Gemini)
 *
 * ⚠️ สำคัญ: ถ้าจะแก้สูตรคำนวณอะไร (เช่น เปลี่ยนวิธีคำนวณ avgTurnaroundDays)
 * ให้แก้ที่ไฟล์นี้ไฟล์เดียว ห้ามไปคำนวณซ้ำในไฟล์อื่นอีก ไม่งั้นตัวเลขที่
 * บอทพูดกับตัวเลขบนกราฟจะเพี้ยนกันได้
 * ──────────────────────────────────────────────────────────────────── */

import { getRejectionReasonLabel } from './rejection-reasons';

export const MONTH_LABELS_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

export type PeriodMode = 'month' | 'year';

export function getPeriodKey(dateStr: string, mode: PeriodMode) {
  const d = new Date(dateStr);
  return mode === 'month'
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    : String(d.getFullYear());
}

export function getPeriods(mode: PeriodMode) {
  if (mode === 'month') {
    const arr = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      arr.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: `${MONTH_LABELS_TH[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}`,
      });
    }
    return arr;
  }
  const nowYear = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => {
    const y = nowYear - 4 + i;
    return { key: String(y), label: String(y + 543) };
  });
}

export function pctChange(curr: number, prev: number) {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return Math.round(((curr - prev) / prev) * 100);
}

const STAGE_ORDER = [
  'pending_review', 'approved', 'in_transit', 'at_warehouse',
  'checked_in', 'receiving', 'exchanging', 'completed',
];
const STAGE_LABEL: Record<string, string> = {
  pending_review: 'รอตรวจสอบ',
  approved: 'อนุมัติ',
  in_transit: 'ขนส่ง',
  at_warehouse: 'ถึงคลัง',
  checked_in: 'ตรวจรับ',
  receiving: 'จัดเก็บ',
  exchanging: 'แลกเปลี่ยน',
  completed: 'เสร็จสิ้น',
};

function normalizeReason(reason: string) {
  if (!reason) return 'ไม่ระบุ';
  if (reason.startsWith('อื่นๆ')) return 'อื่นๆ';
  return reason;
}

/** สถิติภาพรวมทั้งหมด — ใช้ทั้งกับ ManagerInsights.tsx (โชว์กราฟ) และ
 *  staff-chat route (สรุปให้บอท) เพื่อให้ตัวเลขตรงกันเสมอ */
export function computeManagerStats(requests: any[], statusLogs: any[]) {
  const totalValue = requests.reduce((s, r) => s + (Number(r.total_value) || 0), 0);
  const totalDrugItems = requests.reduce((s, r) => s + (r.drug_items?.length ?? 0), 0);

  const doneRequests = requests.filter(
    (r) => r.current_status === 'completed' && r.updated_at && r.created_at,
  );
  const avgTurnaroundDays =
    doneRequests.length === 0
      ? null
      : Math.round(
          doneRequests.reduce(
            (s, r) => s + (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 86400000,
            0,
          ) / doneRequests.length,
        );

  const rejectionRateOverall =
    requests.length === 0
      ? 0
      : Math.round((requests.filter((r) => r.current_status === 'rejected').length / requests.length) * 100);

  // เทียบเดือนนี้ vs เดือนก่อน / ปีนี้ vs ปีก่อน
  const now = new Date();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const inMonth = (dateStr: string, y: number, m: number) => {
    const d = new Date(dateStr);
    return d.getFullYear() === y && d.getMonth() === m;
  };
  const inYear = (dateStr: string, y: number) => new Date(dateStr).getFullYear() === y;
  const sumValue = (arr: any[]) => arr.reduce((s, r) => s + (Number(r.total_value) || 0), 0);

  const thisMonthReqs = requests.filter((r) => r.created_at && inMonth(r.created_at, now.getFullYear(), now.getMonth()));
  const lastMonthReqs = requests.filter((r) => r.created_at && inMonth(r.created_at, lastMonthDate.getFullYear(), lastMonthDate.getMonth()));
  const thisYearReqs = requests.filter((r) => r.created_at && inYear(r.created_at, now.getFullYear()));
  const lastYearReqs = requests.filter((r) => r.created_at && inYear(r.created_at, now.getFullYear() - 1));

  const periodComparison = {
    monthLabel: `${MONTH_LABELS_TH[now.getMonth()]} ${String(now.getFullYear() + 543).slice(2)}`,
    yearLabel: String(now.getFullYear() + 543),
    thisMonthCount: thisMonthReqs.length,
    lastMonthCount: lastMonthReqs.length,
    thisMonthValue: sumValue(thisMonthReqs),
    lastMonthValue: sumValue(lastMonthReqs),
    thisYearCount: thisYearReqs.length,
    lastYearCount: lastYearReqs.length,
    thisYearValue: sumValue(thisYearReqs),
    lastYearValue: sumValue(lastYearReqs),
  };

  // เวลาเฉลี่ยแต่ละขั้นตอน (จาก status_logs)
  const byRequest: Record<string, Record<string, string>> = {};
  statusLogs.forEach((log: any) => {
    if (!log.request_id || !log.status_name || !log.log_date) return;
    const key = String(log.request_id);
    if (!byRequest[key]) byRequest[key] = {};
    const existing = byRequest[key][log.status_name];
    if (!existing || new Date(log.log_date) < new Date(existing)) {
      byRequest[key][log.status_name] = log.log_date;
    }
  });
  const durationsByStage: Record<string, number[]> = {};
  Object.values(byRequest).forEach((statusMap) => {
    const entries = STAGE_ORDER.filter((s) => statusMap[s])
      .map((s) => ({ status: s, date: new Date(statusMap[s]) }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    for (let i = 0; i < entries.length - 1; i++) {
      const stageKey = `${STAGE_LABEL[entries[i].status]} → ${STAGE_LABEL[entries[i + 1].status]}`;
      const days = (entries[i + 1].date.getTime() - entries[i].date.getTime()) / 86400000;
      if (!durationsByStage[stageKey]) durationsByStage[stageKey] = [];
      durationsByStage[stageKey].push(days);
    }
  });
  const stageDurations = Object.entries(durationsByStage)
    .map(([stage, days]) => ({
      stage,
      avgDays: Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10,
      count: days.length,
    }))
    .filter((x) => x.count > 0);

  // ลูกค้า
  const countMap: Record<string, number> = {};
  const valueMap: Record<string, number> = {};
  requests.forEach((r) => {
    const name = r.hospital_name || 'ไม่ระบุ';
    countMap[name] = (countMap[name] || 0) + 1;
    valueMap[name] = (valueMap[name] || 0) + (Number(r.total_value) || 0);
  });
  const topCustomersByCount = Object.entries(countMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const topCustomersByValue = Object.entries(valueMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // จังหวัด
  const provCountMap: Record<string, number> = {};
  const provValueMap: Record<string, number> = {};
  requests.forEach((r) => {
    const province = r.province || r.addr_province || 'ไม่ระบุ';
    provCountMap[province] = (provCountMap[province] || 0) + 1;
    provValueMap[province] = (provValueMap[province] || 0) + (Number(r.total_value) || 0);
  });
  const provinceStats = {
    byCount: Object.entries(provCountMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    byValue: Object.entries(provValueMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10),
  };

  // ยาที่ถูกส่งคืนบ่อยที่สุด
  const drugMap: Record<string, number> = {};
  requests.forEach((r) => (r.drug_items || []).forEach((i: any) => {
    drugMap[i.drug_name] = (drugMap[i.drug_name] || 0) + (Number(i.qty) || 1);
  }));
  const topReturnedDrugs = Object.entries(drugMap)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 6);

  // เหตุผลการปฏิเสธยอดนิยม — group ตาม rejection_reason_code (dropdown ที่เลือกไว้)
  // ไม่ใช่ staff_remark (free text) อีกต่อไป กัน "ยกเลิก" กับ "ปฏิเสธรายการ: ยกเลิก"
  // นับแยกกันทั้งที่ความหมายเดียวกัน — log เก่าก่อนมี column นี้ไม่มี code จะรวมเป็น "ไม่ระบุ"
  const rejectionReasonMap: Record<string, number> = {};
  statusLogs
    .filter((log: any) => log.status_name === 'rejected')
    .forEach((log: any) => {
      const reason = log.rejection_reason_code
        ? getRejectionReasonLabel(log.rejection_reason_code)
        : 'ไม่ระบุ (ข้อมูลเก่า)';
      rejectionReasonMap[reason] = (rejectionReasonMap[reason] || 0) + 1;
    });
  const topRejectionReasons = Object.entries(rejectionReasonMap)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // เหตุผลที่ลูกค้าส่งเรื่องเข้ามา (เดือนปัจจุบันเท่านั้น เพื่อไม่ให้ context ยาวเกิน)
  const reasonCountMap: Record<string, number> = {};
  thisMonthReqs.forEach((r) => {
    const reason = normalizeReason(r.return_reason);
    reasonCountMap[reason] = (reasonCountMap[reason] || 0) + 1;
  });
  const reasonsThisMonth = Object.entries(reasonCountMap)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalValue,
    totalDrugItems,
    avgTurnaroundDays,
    rejectionRateOverall,
    periodComparison,
    stageDurations,
    topCustomersByCount,
    topCustomersByValue,
    provinceStats,
    topReturnedDrugs,
    topRejectionReasons,
    reasonsThisMonth,
    totalRequests: requests.length,
  };
}

/** สรุปสถิติเป็นข้อความอ่านง่าย ใช้ฉีดเข้า system prompt ของบอท —
 *  ตั้งใจสรุปเฉพาะ top-line + top 5-8 ของแต่ละหมวด ไม่ใส่ trend รายเดือน
 *  ย้อนหลัง 12 เดือนแบบเต็ม (กิน token เยอะเกินจำเป็นสำหรับคำถามทั่วไป) */
export function summarizeManagerStatsForChatbot(requests: any[], statusLogs: any[]): string {
  const s = computeManagerStats(requests, statusLogs);
  const fmtBaht = (n: number) => `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;

  const lines: string[] = [];
  lines.push(`ใบงานทั้งหมด: ${s.totalRequests.toLocaleString('th-TH')} ใบ`);
  lines.push(`มูลค่ารวมทั้งหมด: ${fmtBaht(s.totalValue)}`);
  lines.push(`รายการยารวม: ${s.totalDrugItems.toLocaleString('th-TH')} รายการ`);
  lines.push(`เวลาเฉลี่ยจนเสร็จสิ้น: ${s.avgTurnaroundDays !== null ? `${s.avgTurnaroundDays} วัน` : 'ยังไม่มีใบงานเสร็จสิ้น'}`);
  lines.push(`อัตราการปฏิเสธเฉลี่ยรวม: ${s.rejectionRateOverall}%`);
  lines.push('');
  lines.push(`เดือนนี้ (${s.periodComparison.monthLabel}): ${s.periodComparison.thisMonthCount} ใบงาน (เดือนก่อน ${s.periodComparison.lastMonthCount}), มูลค่า ${fmtBaht(s.periodComparison.thisMonthValue)} (เดือนก่อน ${fmtBaht(s.periodComparison.lastMonthValue)})`);
  lines.push(`ปีนี้ (${s.periodComparison.yearLabel}): ${s.periodComparison.thisYearCount} ใบงาน (ปีก่อน ${s.periodComparison.lastYearCount}), มูลค่า ${fmtBaht(s.periodComparison.thisYearValue)} (ปีก่อน ${fmtBaht(s.periodComparison.lastYearValue)})`);
  lines.push('');

  if (s.topCustomersByValue.length > 0) {
    lines.push('ลูกค้าที่มีมูลค่ารวมสูงสุด (top 8):');
    s.topCustomersByValue.forEach((c, i) => lines.push(`${i + 1}. ${c.name} — ${fmtBaht(c.value)}`));
    lines.push('');
  }
  if (s.topCustomersByCount.length > 0) {
    lines.push('ลูกค้าที่ส่งเรื่องมากที่สุด (top 8):');
    s.topCustomersByCount.forEach((c, i) => lines.push(`${i + 1}. ${c.name} — ${c.count} ใบงาน`));
    lines.push('');
  }
  if (s.provinceStats.byCount.length > 0) {
    lines.push('จำนวนใบงานตามจังหวัด (top 10):');
    s.provinceStats.byCount.forEach((p) => lines.push(`- ${p.name}: ${p.count} ใบงาน`));
    lines.push('');
  }
  if (s.topReturnedDrugs.length > 0) {
    lines.push('ยาที่ถูกส่งคืนบ่อยที่สุด (top 6):');
    s.topReturnedDrugs.forEach((d, i) => lines.push(`${i + 1}. ${d.name} — ${d.qty} หน่วย`));
    lines.push('');
  }
  if (s.topRejectionReasons.length > 0) {
    lines.push('เหตุผลการปฏิเสธยอดนิยม (top 8):');
    s.topRejectionReasons.forEach((r, i) => lines.push(`${i + 1}. "${r.reason}" — ${r.count} ครั้ง`));
    lines.push('');
  }
  if (s.stageDurations.length > 0) {
    lines.push('เวลาเฉลี่ยแต่ละขั้นตอนของ workflow:');
    s.stageDurations.forEach((d) => lines.push(`- ${d.stage}: ${d.avgDays} วัน (จาก ${d.count} ใบงาน)`));
    lines.push('');
  }
  if (s.reasonsThisMonth.length > 0) {
    lines.push(`เหตุผลที่ลูกค้าส่งเรื่องเข้ามาเดือนนี้ (${s.periodComparison.monthLabel}):`);
    s.reasonsThisMonth.forEach((r) => lines.push(`- ${r.reason}: ${r.count} ใบงาน`));
  }

  return lines.join('\n');
}