-- migration 20260830050623 (ตามที่ apply จริงบน remote) สร้าง index เป็น partial
-- (WHERE request_id IS NOT NULL) ตอนแรก ซึ่ง supabase-js upsert onConflict:'request_id,kind'
-- ใช้ไม่ได้ (ต้องระบุ WHERE ให้ตรง) — ทำใหม่เป็น non-partial
-- (NULL request_id ซ้ำได้หลายแถวตามพฤติกรรมปกติของ unique index อยู่แล้ว เอกสารยืนยันการ
--  ลงทะเบียนที่ผูกกับ client_id/request_id=null จึงไม่กระทบ)
drop index if exists public.document_attachments_request_kind_uidx;
create unique index if not exists document_attachments_request_kind_uidx
  on public.document_attachments (request_id, kind);
