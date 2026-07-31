
-- ตัด SELECT policy ที่กว้างเกินไป (ปิดการ list/browse ทั้งบัคเก็ต)
-- bucket ยังเป็น public = true เหมือนเดิม ลิงก์ตรงยังเปิดได้ปกติ ไม่กระทบอีเมลที่ส่งไปแล้ว
DROP POLICY IF EXISTS "Allow public select access" ON storage.objects;

-- ปิด insert/update ที่เปิดกว้างให้ public — แอปใช้ service_role อัปโหลดอยู่แล้ว ไม่จำเป็นต้องเปิด
DROP POLICY IF EXISTS "Allow public insert access" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update access" ON storage.objects;
