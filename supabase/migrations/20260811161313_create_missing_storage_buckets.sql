-- ปิดช่องว่าง: 3 ใน 4 storage bucket (FM-AJJ0-008-form, return-documents, signatures) ไม่เคย
-- ถูกสร้างผ่าน migration เลย (สร้างผ่าน Dashboard/Management API มาตั้งแต่ต้น) มีแค่
-- registration-documents ที่ถูก track ผ่าน SQL จริง (migration add_registration_document_support)
-- ทำให้ self-host จากศูนย์ขาดขั้นตอนสร้าง bucket 3 ตัวนี้ไปเลย (พบระหว่าง security audit
-- 11 ส.ค. 2569) — บันทึกด้วย public=false ตรงกับสถานะจริงปัจจุบันของทั้ง 4 bucket (ตรวจแล้ว
-- วันนี้ทุก bucket เป็น private หมด แม้ 2 ใน 3 ตัวนี้เคยเป็น public=true มาก่อนช่วงหนึ่งโดยไม่มี
-- migration บันทึกการเปลี่ยนไว้ — ปิดทั้งสองช่องว่างพร้อมกันด้วย migration นี้ตัวเดียว)
-- ใช้ on conflict do nothing กันชนกับ bucket ที่มีอยู่แล้วจริงในโปรเจกต์นี้ ไม่กระทบของเดิมเลย
-- แต่ทำให้ self-host จากศูนย์ได้ bucket ครบทั้ง 4 ตัวพร้อม state ที่ถูกต้อง

insert into storage.buckets (id, name, public)
values
  ('FM-AJJ0-008-form', 'FM-AJJ0-008-form', false),
  ('return-documents', 'return-documents', false),
  ('signatures', 'signatures', false)
on conflict (id) do nothing;
