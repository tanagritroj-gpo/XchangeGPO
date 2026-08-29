-- ใบงานที่ CSR กรอกแทนลูกค้า (submission_channel = 'csr_manual') ไม่ต้องแสดงในหน้า
-- "ประวัติการยื่นคำร้อง" ส่วนตัวของลูกค้าอีกต่อไป — ให้ไปแสดงเฉพาะใน
-- "ประวัติงานรวมทั้งหน่วยงาน" (get_org_history) พอ ซึ่งไม่ได้กรองออกแล้วโชว์เป็น
-- "พนักงาน CSR สาขาภาคใต้" อยู่แล้ว
CREATE OR REPLACE FUNCTION public.get_customer_history(p_customer_id bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
    SELECT json_agg(res)
    FROM (
      SELECT
        r.id, r.ref_id, r.created_at, r.current_status, r.request_type,
        (
          SELECT json_agg(d)
          FROM (
            SELECT id, drug_name, current_status, qty, unit, lot_number, exp_date, value_amount
            FROM public.drug_items
            WHERE request_id = r.id
          ) d
        ) AS drug_items
      FROM public.requests r
      WHERE r.b2b_customer_id = p_customer_id
        AND r.submission_channel != 'csr_manual'
      ORDER BY r.created_at DESC
    ) res
  );
END;
$function$;
