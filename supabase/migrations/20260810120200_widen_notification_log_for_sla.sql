-- SLA Monitoring: ขยาย notification_log ให้รองรับ type ใหม่ sla_warning/sla_breach
-- และเพิ่มคอลัมน์ department สำหรับ scope การแจ้งเตือนแบบจำกัดเฉพาะแผนกเจ้าของงาน
-- (ต่างจาก ping/new_request/new_client เดิมที่ csr/manager/log/wh เห็นเหมือนกันหมด — ดู
-- 06-sla-monitoring-design.md หัวข้อ 5-6 และ app/actions/notification-actions.ts)
alter table public.notification_log
  drop constraint notification_log_type_check;

alter table public.notification_log
  add constraint notification_log_type_check
  check (type = any (array['ping', 'new_request', 'new_client', 'sla_warning', 'sla_breach']));

alter table public.notification_log
  add column department text
  check (department is null or department in ('csr', 'logistics', 'warehouse'));

comment on column public.notification_log.department is
  'ใช้เฉพาะ type=sla_warning/sla_breach: แผนกเจ้าของใบงาน ณ ตอนแจ้งเตือน (csr/logistics/warehouse — คำเต็ม ไม่ใช่ scope key csr/log/wh ของ staff_users.department). NULL คือ sentinel เฉพาะแถว sla_breach ที่ยิงให้ manager (แยกจากแถวที่ยิงให้แผนกเจ้าของงานซึ่ง department จะ set เสมอ). NULL สำหรับ type อื่นทั้งหมด (ping/new_request/new_client) เสมอ';

-- ใช้โดย app/actions/sla-actions.ts (bell badge ต่อ scope + badge ของ manager)
create index idx_notification_log_sla_type_department
  on public.notification_log (type, department, created_at desc)
  where type in ('sla_warning', 'sla_breach');
