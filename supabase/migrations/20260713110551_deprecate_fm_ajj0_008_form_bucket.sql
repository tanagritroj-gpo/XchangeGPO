
-- bucket นี้เลิกใช้แล้วตามที่ยืนยัน — ปิดการเข้าถึงสาธารณะทันที (ไม่ลบไฟล์จริง)
UPDATE storage.buckets SET public = false WHERE name = 'FM-AJJ0-008-form';

DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
