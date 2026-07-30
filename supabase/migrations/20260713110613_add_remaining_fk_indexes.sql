
CREATE INDEX IF NOT EXISTS idx_access_logs_client_id ON public.access_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_staff_id ON public.access_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_clients_b2b_customer_id ON public.clients(b2b_customer_id);
CREATE INDEX IF NOT EXISTS idx_data_correction_logs_request_id ON public.data_correction_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_data_correction_logs_status_log_id ON public.data_correction_logs(status_log_id);
CREATE INDEX IF NOT EXISTS idx_data_correction_logs_drug_item_id ON public.data_correction_logs(drug_item_id);
CREATE INDEX IF NOT EXISTS idx_data_correction_logs_staff_id ON public.data_correction_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_requests_updated_by ON public.requests(updated_by);
CREATE INDEX IF NOT EXISTS idx_status_logs_drug_item_id ON public.status_logs(drug_item_id);
CREATE INDEX IF NOT EXISTS idx_status_logs_staff_id ON public.status_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_timeline_summary_drug_item_id ON public.timeline_summary(drug_item_id);
