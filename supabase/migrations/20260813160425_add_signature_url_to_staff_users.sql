-- เพิ่มคอลัมน์ signature_url ให้ staff_users — เก็บ path ภายใน bucket "signatures" (ไม่ใช่ public
-- URL) ของลายเซ็นดิจิทัลที่พนักงานวาดตอนลงทะเบียน ใช้ pattern เดียวกับ clients.signature_url
-- ฝั่งลูกค้า นำไปฝังในเอกสารยืนยันการลงทะเบียนของลูกค้าตอน CSR กดอนุมัติ (แทนช่องเซ็นกำกับ
-- ด้วยลายมือจริงบนกระดาษเปล่าๆ เดิม)
alter table public.staff_users add column signature_url text;

comment on column public.staff_users.signature_url is
  'path ของลายเซ็นดิจิทัลพนักงานใน bucket "signatures" (private) — ฝังลงเอกสารยืนยันการลงทะเบียนลูกค้าตอนพนักงานคนนี้กดอนุมัติ';
