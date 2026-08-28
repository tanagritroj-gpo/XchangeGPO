-- staff-form-actions.ts (createStaffReturnRequest) เปลี่ยนไปเก็บชื่อพนักงาน CSR ที่กรอก
-- แทนลูกค้าไว้ใน requests.contact_name แล้ว (แทนที่จะเก็บชื่อผู้ติดต่อฝั่งลูกค้าซ้ำ เพราะ
-- ข้อมูลนั้นมีอยู่แล้วที่ b2b_customers ผูกผ่าน b2b_customer_id) — ปรับ get_org_history ให้
-- แสดงชื่อพนักงานจริงจาก r.contact_name แทนป้ายข้อความทั่วไป "พนักงาน CSR สาขาภาคใต้"
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
      WHERE c.customer_code = p_customer_code
      ORDER BY r.created_at DESC
    ) res
  );
END;
$function$;
