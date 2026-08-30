-- ใบงานที่ CSR กรอกแทนลูกค้า (submission_channel='csr_manual') ตอนนี้เก็บ b2b_customer_id = NULL
-- (เลือกแค่ระดับ organization ไม่ผูก contact รายคน — ดู createStaffReturnRequest) ทำให้ INNER JOIN
-- ผ่าน b2b_customers ใน get_org_history / get_sale_customer_history ตัดใบงานพวกนี้ทิ้งทั้งหมด
-- แก้: LEFT JOIN + จับคู่ organization ผ่าน requests.customer_code สำหรับแถวที่ b2b_customer_id เป็น NULL
-- (ครอบคลุมทุก request_type — RPC ไม่ได้กรองตามประเภท ตัวหน้าเว็บกรองเองฝั่ง client)

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
      LEFT JOIN public.b2b_customers c ON c.id = r.b2b_customer_id
      LEFT JOIN public.organizations o ON o.id = c.organization_id
      WHERE o.customer_code = p_customer_code
         OR (r.b2b_customer_id IS NULL AND r.customer_code = p_customer_code)
      ORDER BY r.created_at DESC
    ) res
  );
END;
$function$;

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
        r.id, r.ref_id, r.created_at, r.updated_at, r.current_status, r.request_type,
        r.total_value, r.return_reason,
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
      LEFT JOIN public.b2b_customers c ON c.id = r.b2b_customer_id
      JOIN public.organizations o
        ON o.id = c.organization_id
        OR (r.b2b_customer_id IS NULL AND o.customer_code = r.customer_code)
      WHERE o.org_type = ANY(p_org_types) AND o.province = ANY(p_provinces)
      ORDER BY r.created_at DESC
    ) res
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_org_history(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_sale_customer_history(text[], text[]) FROM anon, authenticated;
