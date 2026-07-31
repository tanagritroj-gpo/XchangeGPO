-- เพิ่มคอลัมน์ rejection_reason_code ให้ status_logs — แก้ finding 5.9: เดิม
-- "เหตุผลปฏิเสธยอดนิยม" ใน manager-stats.ts group ตาม staff_remark (free text) ตรงๆ
-- ทำให้พนักงานพิมพ์ต่างกันนิดเดียวสถิติกระจายผิด ตอนนี้เพิ่ม enum แยกไว้เฉพาะจัดกลุ่ม
-- ส่วน staff_remark ยังเก็บข้อความอ่านง่ายไว้เหมือนเดิมสำหรับคนอ่าน log ตรงๆ
--
-- nullable เพราะมีผลเฉพาะ log ที่ status_name = 'rejected' เท่านั้น log อื่นๆ ไม่เกี่ยว

alter table public.status_logs
  add column rejection_reason_code text;

alter table public.status_logs
  add constraint status_logs_rejection_reason_code_check
  check (
    rejection_reason_code is null
    or rejection_reason_code in ('damaged', 'incomplete_docs', 'expired_window', 'customer_cancelled', 'other')
  );

comment on column public.status_logs.rejection_reason_code is
  'เหตุผลปฏิเสธแบบมีโครงสร้าง (เลือกจาก dropdown) ใช้ group สถิติ — คู่กับ staff_remark ที่เก็บข้อความอ่านง่าย';
