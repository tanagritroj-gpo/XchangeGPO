
-- document_attachments: insert/read ตรงจาก REST โดยไม่ auth ไม่จำเป็นแล้ว
-- (แอปใช้ service_role ผ่าน insert_document_attachment RPC / server action ซึ่งไม่ผ่าน RLS อยู่แล้ว)
DROP POLICY IF EXISTS "Allow public insert access" ON public.document_attachments;
DROP POLICY IF EXISTS "Allow public read access" ON public.document_attachments;

-- otp_logs: จัดการผ่าน service_role/RPC เท่านั้น ไม่ควรมีใครอ่าน/เขียน/ลบตรงได้
DROP POLICY IF EXISTS "อนุญาตการจัดการ OTP" ON public.otp_logs;
