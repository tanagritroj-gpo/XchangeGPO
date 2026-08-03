-- อนุญาตสถานะใหม่ 'credit_note' คู่ขนานกับ 'exchanging' — ใช้เมื่อ request_type ของใบงานไม่ใช่
-- "รับคืนแลกเปลี่ยน" (เช่น "รับคืนลดหนี้", "รับคืน CCR") ตอน CSR กดเริ่มกระบวนการหลังอนุมัติ
-- แทนที่จะใช้สถานะ "exchanging" (แลกเปลี่ยน) ที่ไม่ตรงความหมายกับใบงานประเภทลดหนี้

ALTER TABLE public.requests DROP CONSTRAINT requests_current_status_check;
ALTER TABLE public.requests
  ADD CONSTRAINT requests_current_status_check
  CHECK (current_status = ANY (ARRAY[
    'pending_review'::text, 'approved'::text, 'rejected'::text, 'in_transit'::text,
    'at_warehouse'::text, 'checked_in'::text, 'receiving'::text, 'exchanging'::text,
    'credit_note'::text, 'completed'::text, 'out_for_delivery'::text
  ]));

ALTER TABLE public.drug_items DROP CONSTRAINT drug_items_current_status_check;
ALTER TABLE public.drug_items
  ADD CONSTRAINT drug_items_current_status_check
  CHECK (current_status = ANY (ARRAY[
    'pending_review'::text, 'approved'::text, 'rejected'::text, 'in_transit'::text,
    'at_warehouse'::text, 'checked_in'::text, 'receiving'::text, 'exchanging'::text,
    'credit_note'::text, 'completed'::text, 'out_for_delivery'::text
  ]));

-- sync_timeline(): เพิ่ม 'credit_note' เข้ารายการสถานะที่ sync เข้า timeline_summary
-- (เดิมมีแค่ 'exchanging' ทำให้ช่วงลดหนี้หายไปจาก timeline ที่ลูกค้า/staff เห็น)
CREATE OR REPLACE FUNCTION public.sync_timeline()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status_name IN ('approved', 'checked_in', 'at_warehouse', 'in_transit', 'exchanging', 'credit_note', 'receiving', 'completed') THEN
    DELETE FROM public.timeline_summary
    WHERE request_id = NEW.request_id
      AND department = NEW.department
      AND status_name = NEW.status_name;

    INSERT INTO public.timeline_summary (request_id, status_name, log_date, staff_remark, department, is_reject, drug_item_id)
    VALUES (NEW.request_id, NEW.status_name, NEW.log_date, NEW.staff_remark, NEW.department, false, NULL);
  END IF;
  RETURN NEW;
END;
$function$;
