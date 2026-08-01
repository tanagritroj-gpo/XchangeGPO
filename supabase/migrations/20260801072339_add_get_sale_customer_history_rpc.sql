-- ประวัติการแลกเปลี่ยนสำหรับพนักงาน sale — รวม requests ของทุก b2b_customers ที่
-- org_type และ province ตรงกับขอบเขตที่ sale คนนั้นดูแล (session ฝั่ง server เป็นคน
-- ขยาย bucket 'private'/'government' เป็น org_type ดิบก่อนส่งมาที่นี่แล้ว — ดู
-- lib/sale-coverage.ts::expandToOrgTypes) เข้าถึงได้เฉพาะ service_role เหมือน
-- get_org_history — RLS ไม่มีผลกับแอปนี้ (ดู harden_rls_policies.sql)
CREATE OR REPLACE FUNCTION public.get_sale_customer_history(p_org_types text[], p_provinces text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_org_types IS NULL OR array_length(p_org_types, 1) IS NULL
     OR p_provinces IS NULL OR array_length(p_provinces, 1) IS NULL THEN
    RETURN '[]'::json;
  END IF;

  RETURN (
    SELECT json_agg(res)
    FROM (
      SELECT
        r.id, r.ref_id, r.created_at, r.current_status, r.request_type,
        c.hospital_name, c.province, c.customer_code,
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
      WHERE c.org_type = ANY(p_org_types) AND c.province = ANY(p_provinces)
      ORDER BY r.created_at DESC
    ) res
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_sale_customer_history(text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sale_customer_history(text[], text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sale_customer_history(text[], text[]) TO service_role;
