
CREATE INDEX IF NOT EXISTS idx_requests_b2b_customer_id ON public.requests(b2b_customer_id);
CREATE INDEX IF NOT EXISTS idx_requests_current_status ON public.requests(current_status);
CREATE INDEX IF NOT EXISTS idx_drug_items_request_id ON public.drug_items(request_id);
CREATE INDEX IF NOT EXISTS idx_status_logs_request_id ON public.status_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_sessions_customer_id ON public.sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_sessions_staff_id ON public.sessions(staff_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON public.sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_access_logs_request_id ON public.access_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_document_attachments_request_id ON public.document_attachments(request_id);
CREATE INDEX IF NOT EXISTS idx_document_attachments_ref_id ON public.document_attachments(ref_id);
