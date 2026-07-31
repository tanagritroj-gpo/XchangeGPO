
-- เติม search_path ให้ครบทุกฟังก์ชันที่ยังไม่มี (กัน search_path hijacking)
ALTER FUNCTION public.create_exchange_request(bigint, jsonb, jsonb) SET search_path = public;
ALTER FUNCTION public.get_customer_history(bigint) SET search_path = public;
ALTER FUNCTION public.get_my_request(text, bigint) SET search_path = public;
ALTER FUNCTION public.insert_document_attachment(bigint, text, text) SET search_path = public;
ALTER FUNCTION public.insert_status_log(bigint, text) SET search_path = public;
ALTER FUNCTION public.get_latest_doc_number() SET search_path = public;
ALTER FUNCTION public.get_public_status(text) SET search_path = public;
ALTER FUNCTION public.get_request_data(bigint) SET search_path = public;
ALTER FUNCTION public.sync_timeline() SET search_path = public;

-- get_request_timeline: ยังต้องเปิดให้ anon เรียกได้ (ใช้ทำ public tracking ไม่ล็อกอิน)
-- แต่ต้องไม่คืน staff_remark เมื่อเรียกแบบ public (p_customer_id IS NULL) ให้ตรงตามที่เอกสาร security ระบุไว้
CREATE OR REPLACE FUNCTION public.get_request_timeline(p_ref_id text, p_customer_id bigint DEFAULT NULL::bigint)
RETURNS TABLE(status_name text, log_date timestamp with time zone, staff_remark text, department text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    s.status_name,
    s.log_date,
    CASE WHEN p_customer_id IS NULL THEN NULL ELSE s.staff_remark END AS staff_remark,
    s.department
  FROM public.status_logs s
  JOIN public.requests r ON s.request_id = r.id
  WHERE r.ref_id = p_ref_id
    AND (p_customer_id IS NULL OR r.b2b_customer_id = p_customer_id)
  ORDER BY s.log_date ASC;
END;
$function$;
