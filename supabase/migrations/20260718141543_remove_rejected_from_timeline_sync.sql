-- 1. แก้ trigger function: ตัด 'rejected' ออกจากรายการสถานะที่ sync เข้า timeline_summary
--    เพราะมีส่วนแสดงรายการยาที่ถูกปฏิเสธแยกต่างหากอยู่แล้วในหน้า UI (drug_items.current_status)
--    ไม่ต้องซ้ำซ้อนใน timeline อีก
CREATE OR REPLACE FUNCTION public.sync_timeline()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status_name IN ('approved', 'checked_in', 'at_warehouse', 'in_transit', 'exchanging', 'receiving', 'completed') THEN
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

-- 2. ลบข้อมูล rejected ที่เคย sync เข้า timeline_summary ไปแล้วก่อนหน้านี้ทิ้งทั้งหมด
DELETE FROM public.timeline_summary
WHERE status_name = 'rejected' OR is_reject = true;
