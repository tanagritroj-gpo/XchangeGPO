-- ฟังก์ชันลบแถวใน rate_limits ที่หมดอายุแล้ว (window_start เก่าเกิน retention ที่กำหนด)
-- retention = 2 วัน: กว้างกว่า windowSeconds สูงสุดที่ระบบใช้อยู่หลายเท่าตัวเพื่อความปลอดภัย
-- (ถ้าในอนาคตมี rate limit ที่ตั้ง window นานกว่า 2 วันจริง ต้องปรับ interval นี้ตาม)
create or replace function public.cleanup_expired_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from rate_limits
  where window_start < now() - interval '2 days';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ล็อกสิทธิ์แบบเดียวกับ increment_rate_limit: ปิดจาก PUBLIC ทั้งหมดก่อน แล้วค่อยเปิดเฉพาะ service_role
revoke execute on function public.cleanup_expired_rate_limits() from public;
grant execute on function public.cleanup_expired_rate_limits() to service_role;
