
-- ปิดช่องทางเรียกตรงผ่าน REST /rpc/... โดยไม่ผ่านแอป (แอปใช้ service_role จาก server action อยู่แล้ว ไม่กระทบ)
REVOKE EXECUTE ON FUNCTION public.get_request_data(bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_exchange_request(bigint, jsonb, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_customer_history(bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_request(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.insert_status_log(bigint, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.insert_document_attachment(bigint, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_request_data_for_pdf(bigint, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_latest_doc_number() FROM anon, authenticated;
