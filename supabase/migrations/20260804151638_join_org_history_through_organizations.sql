-- Phase 2: get_org_history เดิมกรองด้วย c.customer_code (มิเรอร์อยู่บน b2b_customers) —
-- เปลี่ยนให้กรองผ่าน organizations.customer_code ตรงๆ (เจ้าของข้อมูลระดับหน่วยงานตัวจริง
-- ตั้งแต่ Phase 1 — ดู 20260804150815_add_organizations_table.sql) แทน
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
        CASE WHEN r.submission_channel = 'csr_manual' THEN r.contact_name ELSE c.contact_name END AS submitted_by,
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
      WHERE o.customer_code = p_customer_code
      ORDER BY r.created_at DESC
    ) res
  );
END;
$function$;
