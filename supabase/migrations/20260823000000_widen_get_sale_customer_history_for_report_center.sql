-- Sale ต้องการต่อยอด "ศูนย์รายงาน (Report Center)" ให้แสดงสถิติแบบเดียวกับที่ทำให้
-- Manager/CSR แล้ว (ManagerInsights.tsx / lib/manager-stats.ts) ซึ่งต้องใช้ r.updated_at
-- (คำนวณเวลาเฉลี่ยจนเสร็จสิ้น) และ r.return_reason (สถิติเหตุผลที่ลูกค้าส่งเรื่องเข้ามา) —
-- เดิม get_sale_customer_history ไม่ select 2 คอลัมน์นี้ (ตอนออกแบบตอนแรกแค่ต้องการโชว์
-- ประวัติใบงานเฉยๆ ไม่ได้ทำสถิติเชิงลึก) เพิ่มเข้าไปโดยไม่แตะ logic การกรอง org_type/province
-- เดิมเลย (เหมือนเดิมทุกประการ) — caller เดิม (Sale hub/history/workflow) ได้ 2 คอลัมน์เพิ่มมา
-- เฉยๆ ไม่กระทบ เพราะ TypeScript ฝั่งนั้น cast เป็น HistorySummaryRow (ไม่สนใจคอลัมน์ส่วนเกิน)
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
      JOIN public.b2b_customers c ON c.id = r.b2b_customer_id
      JOIN public.organizations o ON o.id = c.organization_id
      WHERE o.org_type = ANY(p_org_types) AND o.province = ANY(p_provinces)
      ORDER BY r.created_at DESC
    ) res
  );
END;
$function$;
