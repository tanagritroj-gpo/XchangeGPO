import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getRejectionReasonLabel } from '@/lib/rejection-reasons';
import type { RequestRow, StatusLogRow } from '@/lib/types';

type RejectionLogRow = Pick<StatusLogRow, 'rejection_reason_code' | 'log_date'>;
type PeriodStatsRow = Pick<RequestRow, 'current_status' | 'total_value' | 'created_at'>;
type CustomerStatsRow = Pick<RequestRow, 'id' | 'hospital_name' | 'current_status' | 'total_value' | 'created_at'>;

/**
 * ── "Tools" ที่ให้ Gemini เรียกได้จาก /api/staff-chat ─────────────────────
 * เดิม staff-chat มีแค่สรุปคงที่ (summarizeManagerStatsForChatbot) ฉีดเข้า
 * prompt ครั้งเดียวต่อข้อความ — ถามอะไรนอกเหนือจากที่สรุปไว้ (เดือน/ปีอื่นที่
 * ไม่ใช่ปัจจุบัน, ลูกค้ารายหนึ่งเจาะจง) บอทตอบไม่ได้ ฟังก์ชันในไฟล์นี้ให้บอท
 * query ข้อมูลสดได้ตามคำถามจริงแทน โดยไม่เปิด SQL ดิบให้โมเดลเห็นเลย —
 * โมเดลเห็นแค่ชื่อฟังก์ชัน + พารามิเตอร์ที่กำหนดไว้ตายตัวเท่านั้น (ดู TOOLS
 * ใน app/api/staff-chat/route.ts) การ query จริงทำในนี้ทั้งหมด
 *
 * แยกเป็นไฟล์ต่างหากจาก route.ts เพื่อให้ unit test ได้ด้วย fakeSupabase
 * เหมือน action files อื่นๆ ในโปรเจกต์ ไม่ต้อง mock NextRequest/Gemini
 */

function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 1); // วันที่ 1 ของเดือนถัดไป
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

export async function getRejectionBreakdown(year?: number, month?: number) {
  let query = supabaseAdmin
    .from('status_logs')
    .select('rejection_reason_code, log_date')
    .eq('status_name', 'rejected');

  if (year && month) {
    const { start, end } = monthRange(year, month);
    query = query.gte('log_date', start).lt('log_date', end);
  } else if (year) {
    query = query.gte('log_date', `${year}-01-01`).lt('log_date', `${year + 1}-01-01`);
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  const rows = data ?? [];
  const counts: Record<string, number> = {};
  rows.forEach((row: RejectionLogRow) => {
    const code = row.rejection_reason_code ?? 'unspecified';
    counts[code] = (counts[code] ?? 0) + 1;
  });

  const breakdown = Object.entries(counts)
    .map(([code, count]) => ({
      code,
      label: code === 'unspecified' ? 'ไม่ระบุ (ข้อมูลเก่าก่อนมีระบบเหตุผลปฏิเสธแบบมีโครงสร้าง)' : getRejectionReasonLabel(code),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return { totalRejected: rows.length, breakdown };
}

export async function getPeriodStats(year: number, month: number) {
  if (!year || !month || month < 1 || month > 12) {
    return { error: 'ต้องระบุปีและเดือน (1-12) ที่ถูกต้อง' };
  }
  const { start, end } = monthRange(year, month);

  const { data, error } = await supabaseAdmin
    .from('requests')
    .select('current_status, total_value, created_at')
    .gte('created_at', start)
    .lt('created_at', end);

  if (error) return { error: error.message };

  const rows: PeriodStatsRow[] = data ?? [];
  const totalValue = rows.reduce((s: number, r) => s + (Number(r.total_value) || 0), 0);
  const rejectedCount = rows.filter((r) => r.current_status === 'rejected').length;
  const rejectionRatePercent = rows.length ? Math.round((rejectedCount / rows.length) * 100) : 0;

  return {
    year,
    month,
    totalRequests: rows.length,
    totalValue,
    rejectedCount,
    rejectionRatePercent,
  };
}

export async function getCustomerStats(hospitalNameQuery: string) {
  const trimmed = (hospitalNameQuery ?? '').trim();
  if (!trimmed) return { error: 'ต้องระบุชื่อโรงพยาบาล/หน่วยงาน' };

  // escape wildcard กัน ilike injection — pattern เดียวกับ searchB2BCustomers ใน staff-form-actions.ts
  const escaped = trimmed.replace(/[%_]/g, (m) => `\\${m}`);

  const { data, error } = await supabaseAdmin
    .from('requests')
    .select('id, hospital_name, current_status, total_value, created_at')
    .ilike('hospital_name', `%${escaped}%`)
    .limit(200);

  if (error) return { error: error.message };

  const rows: CustomerStatsRow[] = data ?? [];
  if (rows.length === 0) {
    return { found: false, message: `ไม่พบคำร้องที่ตรงกับชื่อ "${trimmed}"` };
  }

  const totalValue = rows.reduce((s: number, r) => s + (Number(r.total_value) || 0), 0);
  const rejectedCount = rows.filter((r) => r.current_status === 'rejected').length;
  const completedCount = rows.filter((r) => r.current_status === 'completed').length;

  const matchedHospitalNames = [...new Set(rows.map((r) => r.hospital_name))].slice(0, 5);

  return {
    found: true,
    matchedHospitalNames,
    totalRequests: rows.length,
    totalValue,
    rejectedCount,
    completedCount,
  };
}

export async function executeStaffChatTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'get_rejection_breakdown':
      return getRejectionBreakdown(args.year as number | undefined, args.month as number | undefined);
    case 'get_period_stats':
      return getPeriodStats(args.year as number, args.month as number);
    case 'get_customer_stats':
      return getCustomerStats(args.hospital_name as string);
    default:
      return { error: `ไม่รู้จักฟังก์ชัน: ${name}` };
  }
}
