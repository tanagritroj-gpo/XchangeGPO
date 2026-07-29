-- Migration: allow_client_id_document_attachments
-- วันที่: 2026-07-29
-- สถานะ: ร่างสำหรับรีวิว — ยังไม่ได้ apply เข้า project จริง (qgztveswduffskucqppt)
--
-- บั๊ก: trigger check_document_attachment_consistency() (มีอยู่ก่อนฟีเจอร์เอกสารยืนยัน
-- การลงทะเบียน) บังคับว่า request_id กับ ref_id ต้องไม่เป็น null พร้อมกันทั้งคู่ — เขียนไว้
-- ตอนที่ document_attachments ยังผูกกับ "แบบฟอร์มรับคืน" อย่างเดียว ไม่รู้จัก client_id
-- ที่เพิ่งเพิ่มเข้ามา (migration 20260729010000) เลย ผลคือ insert แถวเอกสารยืนยันการ
-- ลงทะเบียนทุกครั้ง (client_id ตั้งไว้ แต่ request_id/ref_id เป็น null ทั้งคู่ตามดีไซน์)
-- ชน trigger นี้แล้วพังทุกครั้ง ไม่ใช่บางครั้ง — เพิ่งเจอเพราะโค้ด reviewClient() ฝั่ง
-- แอปดักจับ error นี้ไว้เป็น non-blocking side-effect (ไม่ทำให้การอนุมัติ fail) ทำให้ PDF
-- อัปโหลดขึ้น bucket สำเร็จทุกครั้ง แต่ไม่เคยมีแถวใน document_attachments เชื่อมไว้เลย
--
-- แก้โดยเพิ่ม client_id เป็นอีกทางเลือกที่ยอมรับได้ (แถวประเภทนี้ไม่ต้องมี request_id/
-- ref_id) โดยไม่กระทบ logic เดิมที่ตรวจ request_id+ref_id ต้องอ้างถึง request เดียวกัน

create or replace function public.check_document_attachment_consistency()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.request_id is null and new.ref_id is null and new.client_id is null then
    raise exception 'document_attachments: request_id, ref_id, and client_id cannot all be null';
  end if;

  if new.request_id is not null and new.ref_id is not null then
    if not exists (
      select 1 from public.requests
      where id = new.request_id and ref_id = new.ref_id
    ) then
      raise exception 'document_attachments: request_id (%) and ref_id (%) must refer to the same request', new.request_id, new.ref_id;
    end if;
  end if;

  return new;
end;
$function$;
