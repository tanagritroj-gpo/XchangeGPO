-- แยกเอกสาร PDF ของแต่ละคำร้องเป็น 2 ฉบับ:
--   'draft'  = ฉบับที่ลูกค้ากรอกมา (เก็บที่ storage path prefix drafts/)
--   'final'  = ฉบับที่ส่งให้ลูกค้าจริง (non-exchange = สร้างตอน submit เลย;
--              exchange customer_portal = สร้างหลัง CSR ตรวจ compliance เสร็จ พร้อมขีดคร่อมรายการที่ไม่ผ่านเกณฑ์)
-- แถวเดิมทั้งหมด = 'final' (เป็นเอกสาร non-exchange หรือใบที่ดำเนินการแล้ว) ตาม default
alter table public.document_attachments
  add column kind text not null default 'final'
  check (kind in ('draft', 'final'));

-- 1 คำร้อง มีได้ฉบับละ 1 (draft, final) — เป็น conflict target ของ upsert
-- ไม่ทำเป็น partial index (NULL request_id ซ้ำได้หลายแถวตามพฤติกรรมปกติของ unique index
-- อยู่แล้ว — เอกสารยืนยันการลงทะเบียนที่ผูกกับ client_id/request_id=null จึงไม่กระทบ)
-- และ supabase-js upsert onConflict:'request_id,kind' ใช้ index นี้ได้ตรง ๆ
create unique index document_attachments_request_kind_uidx
  on public.document_attachments (request_id, kind);
