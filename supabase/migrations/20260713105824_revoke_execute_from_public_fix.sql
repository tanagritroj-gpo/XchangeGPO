
-- REVOKE ครั้งก่อนไม่มีผลเพราะสิทธิ์จริงมาจาก PUBLIC ไม่ใช่ anon/authenticated โดยตรง
-- ต้อง revoke จาก PUBLIC แล้ว grant คืนเฉพาะ service_role (ที่แอปใช้จริงจาก server action)
REVOKE EXECUTE ON FUNCTION public.get_request_data(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_exchange_request(bigint, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_history(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_request(text, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.insert_status_log(bigint, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.insert_document_attachment(bigint, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_request_data_for_pdf(bigint, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_latest_doc_number() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_request_data(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_exchange_request(bigint, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_history(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_request(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.insert_status_log(bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.insert_document_attachment(bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_request_data_for_pdf(bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_latest_doc_number() TO service_role;
