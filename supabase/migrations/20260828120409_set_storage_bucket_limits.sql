-- ตั้ง file_size_limit + allowed_mime_types ระดับ bucket — ปิดช่องโหว่ P1-5 (security audit 28 ส.ค. 2569)
-- เดิมทั้ง 4 bucket เป็น null/null = ไม่จำกัดอะไรเลย พึ่งโค้ดแอปเช็คอย่างเดียว
--
-- หลักการ:
--  - "ชนิดไฟล์" = security boundary → จำกัดแคบตรงกับที่โค้ดสร้างจริง (ไม่ใช้ image/* เพราะจะเปิดรับ
--    image/svg+xml ที่ฝัง script ได้)
--  - "ขนาด" = แค่เกราะกันความผิดปกติ/โค้ด bug → ตั้งเผื่อหลวม (5–100+ เท่าของไฟล์ใหญ่สุดที่มีจริง)
--    ไฟล์จริงใหญ่สุดในระบบ ณ 28 ส.ค.: signatures 10KB, return-documents 580KB, registration 86KB
--  - โค้ดแอปยังเช็คของตัวเองเข้มกว่านี้ (รูป ≤2MB, magic-byte) — bucket limit เป็นชั้นสำรอง
--
-- ★ ไม่กระทบการอ่าน/ดาวน์โหลด/signed URL/ไฟล์เดิม — บังคับเฉพาะตอน upload เท่านั้น
-- ★ rollback: UPDATE storage.buckets SET file_size_limit=null, allowed_mime_types=null WHERE id IN
--   ('signatures','return-documents','registration-documents','FM-AJJ0-008-form');
-- ★ self-host: ถ้า bucket ยังไม่ถูกสร้างตอน migration นี้รัน จะ affect 0 rows (ไม่ error) —
--   ให้ตั้งค่าพวกนี้ตอนสร้าง bucket ใหม่ตาม 04-self-hosting-101.md §5 แทน

update storage.buckets
set file_size_limit = 5242880,  -- 5 MB
    allowed_mime_types = array['image/png', 'image/jpeg']
where id = 'signatures';

update storage.buckets
set file_size_limit = 10485760,  -- 10 MB
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
where id = 'return-documents';

update storage.buckets
set file_size_limit = 10485760,  -- 10 MB
    allowed_mime_types = array['application/pdf']
where id = 'registration-documents';

update storage.buckets
set file_size_limit = 10485760,  -- 10 MB (deprecated bucket — ไม่มี write, ตั้งไว้ให้ครบ + bounded)
    allowed_mime_types = array['application/pdf']
where id = 'FM-AJJ0-008-form';
