-- ปิด advisor INFO "unindexed foreign keys" ที่เหลือ 12 ตัว (ตามผลตรวจ get_advisors(performance)
-- วันที่ 2569-08-11) — รูปแบบชื่อ idx_<table>_<column> เหมือน index ชุดก่อนหน้าที่มีอยู่แล้ว
-- (migration add_fk_performance_indexes) ใช้ IF NOT EXISTS กันชนกับของเดิม

CREATE INDEX IF NOT EXISTS idx_b2b_customers_organization_id
  ON public.b2b_customers (organization_id);

CREATE INDEX IF NOT EXISTS idx_document_attachments_client_id
  ON public.document_attachments (client_id);

CREATE INDEX IF NOT EXISTS idx_notification_log_client_id
  ON public.notification_log (client_id);

CREATE INDEX IF NOT EXISTS idx_notification_log_customer_id
  ON public.notification_log (customer_id);

CREATE INDEX IF NOT EXISTS idx_notification_log_request_id_fk
  ON public.notification_log (request_id);

CREATE INDEX IF NOT EXISTS idx_notification_log_read_by_csr_by
  ON public.notification_log (read_by_csr_by);

CREATE INDEX IF NOT EXISTS idx_notification_log_read_by_log_by
  ON public.notification_log (read_by_log_by);

CREATE INDEX IF NOT EXISTS idx_notification_log_read_by_manager_by
  ON public.notification_log (read_by_manager_by);

CREATE INDEX IF NOT EXISTS idx_notification_log_read_by_sale_by
  ON public.notification_log (read_by_sale_by);

CREATE INDEX IF NOT EXISTS idx_notification_log_read_by_wh_by
  ON public.notification_log (read_by_wh_by);

CREATE INDEX IF NOT EXISTS idx_requests_created_by_staff_id
  ON public.requests (created_by_staff_id);

CREATE INDEX IF NOT EXISTS idx_sla_rules_updated_by
  ON public.sla_rules (updated_by);
