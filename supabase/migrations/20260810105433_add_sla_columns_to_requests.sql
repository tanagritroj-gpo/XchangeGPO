-- SLA Monitoring: คอลัมน์ denormalized บน requests — คำนวณครั้งเดียวตอนสถานะเปลี่ยน
-- โดย lib/sla.ts (updateRequestCurrentStatus) เพื่อให้ cron job เทียบ timestamp ตรงๆ
-- ไม่ต้องคำนวณวันทำการซ้ำทุกรอบ — ดู 06-sla-monitoring-design.md หัวข้อ 9.1-9.2
alter table public.requests
  add column status_entered_at                  timestamptz,
  add column status_due_at                       timestamptz,
  add column status_warn_at                      timestamptz,
  add column sla_warned_at                       timestamptz,
  add column sla_breach_manager_notified_at      timestamptz,
  add column sla_breach_last_staff_notified_date date;

comment on column public.requests.status_due_at is
  'เดดไลน์ของ current_status ปัจจุบัน — null เมื่อสถานะเป็น terminal (rejected/completed) หรือไม่มีแถวใน sla_rules ของสถานะนั้น';
comment on column public.requests.status_warn_at is
  'จุดเริ่มเตือน "ใกล้ครบกำหนด" = status_entered_at + (sla_days - warning_days) วันทำการ — คำนวณพร้อมกับ status_due_at เสมอ';
comment on column public.requests.sla_warned_at is
  'เวลาที่ส่งแจ้งเตือนใกล้ครบกำหนดไปแล้ว (ครั้งเดียวต่อสถานะ) — reset เป็น null ทุกครั้งที่ current_status เปลี่ยน';
comment on column public.requests.sla_breach_manager_notified_at is
  'เวลาที่แจ้งเตือน manager เรื่องเกินกำหนดไปแล้ว (ครั้งเดียวตลอดที่ค้างในสถานะนี้) — reset เป็น null ทุกครั้งที่ current_status เปลี่ยน';
comment on column public.requests.sla_breach_last_staff_notified_date is
  'วันที่ล่าสุดที่แจ้งเตือนแผนกเจ้าของงานเรื่องเกินกำหนด — กันแจ้งซ้ำในวันเดียวกัน, reset เป็น null ทุกครั้งที่ current_status เปลี่ยน';

-- partial index — cron scan เฉพาะใบงานที่ยัง active เท่านั้น (status_due_at ไม่ null)
create index idx_requests_sla_active_due
  on public.requests (status_due_at)
  where status_due_at is not null;
