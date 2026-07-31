-- ประวัติงานรวมทั้งหน่วยงาน: รวม requests ของทุก b2b_customers ที่มี customer_code
-- เดียวกัน (พนักงานหลายคนในหน่วยงานเดียวกัน) เข้าถึงได้เฉพาะ service_role
-- เหมือน get_customer_history — RLS ไม่มีผลกับแอปนี้ (ดู harden_rls_policies.sql)
-- guard NULL/empty customer_code กัน request ที่ยังไม่ได้กรอกค่าถูกจับกลุ่มรวมกันโดยไม่ตั้งใจ
CREATE OR REPLACE FUNCTION public.get_org_history(p_customer_code text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_customer_code IS NULL OR btrim(p_customer_code) = '' THEN
    RETURN '[]'::json;
  END IF;

  RETURN (
    SELECT json_agg(res)
    FROM (
      SELECT
        r.id, r.ref_id, r.created_at, r.current_status, r.request_type,
        c.contact_name AS submitted_by,
        (
          SELECT json_agg(d)
          FROM (
            SELECT id, drug_name, current_status, qty, unit, lot_number, exp_date, value_amount
            FROM public.drug_items
            WHERE request_id = r.id
          ) d
        ) AS drug_items
      FROM public.requests r
      JOIN public.b2b_customers c ON c.id = r.b2b_customer_id
      WHERE c.customer_code = p_customer_code
      ORDER BY r.created_at DESC
    ) res
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_org_history(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_history(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_history(text) TO service_role;
