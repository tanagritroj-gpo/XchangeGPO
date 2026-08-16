import 'server-only';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';

// สถานะ terminal — ไม่มี SLA clock (ดู 06-sla-monitoring-design.md หัวข้อ 4)
export const TERMINAL_STATUSES = ['rejected', 'completed'] as const;

// ย้ายไป lib/status-department.ts แล้ว (เป็นแค่ data mapping ไม่มี side effect ต่างจากไฟล์นี้ที่
// import 'server-only' — client component ต้อง import ตรงจากที่นั่นแทน ไม่งั้นจะลากไฟล์นี้ทั้งไฟล์
// เข้า client bundle ไปด้วย) — export ต่อที่นี่เพื่อไม่ให้ import เดิมของ sla-actions.ts พัง
export { STATUS_OWNER_DEPARTMENT, SCOPE_TO_DEPARTMENT, DEPARTMENT_TO_SCOPE } from '@/lib/status-department';

function isWeekend(d: Date) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function addBusinessDays(start: Date, days: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d)) added++;
  }
  return d;
}

/**
 * เรียกแทนการ `.from('requests').update({ current_status, updated_at })` แบบ inline เดิม
 * ที่ทุก call site ในการเปลี่ยนสถานะใบงานเคยทำ (csr/logistics/wh-actions.ts รวม 16 จุด) —
 * คำนวณ status_entered_at/status_due_at/status_warn_at ใหม่จาก sla_rules ของสถานะใหม่
 * (เว้นวันทำการแบบเสาร์-อาทิตย์เท่านั้น ไม่รวมวันหยุดราชการ) และ reset ทั้ง 3 flag การแจ้งเตือน
 * เสมอทุกครั้งที่สถานะเปลี่ยน (sla_warned_at, sla_breach_manager_notified_at,
 * sla_breach_last_staff_notified_date) — ถ้าสถานะใหม่เป็น terminal (rejected/completed) หรือ
 * ไม่มีแถวใน sla_rules ของสถานะนั้น (เช่นยังไม่ seed) จะปล่อย due/warn เป็น null เงียบๆ
 * ไม่ throw ไม่บล็อก flow เดิม — ใบงานนั้นแค่หลุดออกจากการติดตาม SLA เท่านั้น
 */
export async function updateRequestCurrentStatus(
  requestId: number,
  newStatus: string
): Promise<{ error: string | null }> {
  const now = new Date();
  let slaFields: {
    status_entered_at: string;
    status_due_at: string | null;
    status_warn_at: string | null;
  } = {
    status_entered_at: now.toISOString(),
    status_due_at: null,
    status_warn_at: null,
  };

  if (!TERMINAL_STATUSES.includes(newStatus as (typeof TERMINAL_STATUSES)[number])) {
    const { data: rule } = await supabaseAdmin
      .from('sla_rules')
      .select('sla_days, warning_days')
      .eq('status_name', newStatus)
      .maybeSingle();

    if (rule) {
      const dueAt = addBusinessDays(now, rule.sla_days);
      const warnAt = addBusinessDays(now, Math.max(rule.sla_days - rule.warning_days, 0));
      slaFields = {
        status_entered_at: now.toISOString(),
        status_due_at: dueAt.toISOString(),
        status_warn_at: warnAt.toISOString(),
      };
    }
  }

  const { error } = await supabaseAdmin
    .from('requests')
    .update({
      current_status: newStatus,
      updated_at: now.toISOString(),
      ...slaFields,
      sla_warned_at: null,
      sla_breach_manager_notified_at: null,
      sla_breach_last_staff_notified_date: null,
    })
    .eq('id', requestId);

  return { error: error?.message ?? null };
}
