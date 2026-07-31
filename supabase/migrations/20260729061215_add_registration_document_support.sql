-- Migration: add_registration_document_support
-- วันที่: 2026-07-29
-- สถานะ: ร่างสำหรับรีวิว — ยังไม่ได้ apply เข้า project จริง (qgztveswduffskucqppt)
--
-- บริบท: ฟีเจอร์ใหม่ — สร้างเอกสารยืนยันการลงทะเบียนเป็น PDF อัตโนมัติ ตอน CSR
-- อนุมัติลูกค้าใหม่ (reviewClient action='approved') แล้วเก็บไว้ให้ดู/ดาวน์โหลดย้อนหลังได้
--
-- 1) ตาราง document_attachments มีอยู่แล้ว (ใช้เก็บ path ของ PDF แบบฟอร์มรับคืน ผูกกับ
--    request_id) คอลัมน์ request_id/ref_id เป็น nullable อยู่แล้ว แสดงว่าตารางนี้ถูก
--    ออกแบบให้ยืดหยุ่นรองรับเอกสารมากกว่าประเภทเดียว — เพิ่ม client_id (nullable, FK ไป
--    clients) แทนการสร้างตารางใหม่ซ้ำซ้อน เอกสารยืนยันการลงทะเบียนจะ insert แถวที่มี
--    client_id แต่ request_id/ref_id เป็น null
-- 2) สร้าง storage bucket ใหม่ "registration-documents" (private เหมือน signatures,
--    return-documents, FM-AJJ0-008-form ที่มีอยู่แล้วทั้งหมด) — เข้าถึงได้เฉพาะ
--    service_role (bypass RLS) หรือผ่าน signed URL ที่ server สร้างให้เท่านั้น ไม่ต้อง
--    เพิ่ม storage.objects policy เพราะ 3 bucket เดิมก็ไม่มี policy เช่นกัน (ปิดสนิท
--    ด้วย public=false อย่างเดียวก็พอ)

alter table public.document_attachments
  add column client_id uuid references public.clients(id);

comment on column public.document_attachments.client_id is 'ผูกกับเอกสารยืนยันการลงทะเบียน (client_documents flow) — request_id/ref_id จะเป็น null ในแถวประเภทนี้';

insert into storage.buckets (id, name, public)
values ('registration-documents', 'registration-documents', false)
on conflict (id) do nothing;
