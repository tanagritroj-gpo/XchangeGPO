-- Phase 2: get_sale_customer_history เดิมกรอง/เลือก org_type, province, hospital_name,
-- customer_code จาก c (b2b_customers, มิเรอร์อยู่) — เปลี่ยนให้ join ผ่าน organizations
-- (เจ้าของข้อมูลระดับหน่วยงานตัวจริง ตั้งแต่ Phase 1) แทน
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
        r.id, r.ref_id, r.created_at, r.current_status, r.request_type, r.total_value,
        o.hospital_name, o.province, o.customer_code,
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
      JOIN public.organizations o ON o.id = c.organization_id
      WHERE o.org_type = ANY(p_org_types) AND o.province = ANY(p_provinces)
      ORDER BY r.created_at DESC
    ) res
  );
END;
$function$;
