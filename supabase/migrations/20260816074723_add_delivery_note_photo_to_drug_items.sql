-- รูปถ่ายใบส่งของที่ลูกค้าแนบมาแทน/คู่กับการพิมพ์เลขใบส่งของเอง (เลือกอย่างใดอย่างหนึ่งหรือ
-- ทั้งคู่ก็ได้ ไม่บังคับ) — ใช้เฉพาะฝั่งฟอร์มลูกค้ากรอกเองเท่านั้น (Step2Items.tsx ที่ CSR กรอก
-- แทนลูกค้าไม่เปิดใช้ตัวเลือกนี้ ตามที่ตกลงกันไว้) เก็บ path ภายใน bucket return-documents
-- เหมือน signature_url ไม่ใช่ base64/public URL
alter table public.drug_items
  add column delivery_note_photo_path text;

comment on column public.drug_items.delivery_note_photo_path is
  'Path ภายใน bucket return-documents ของรูปถ่ายใบส่งของที่ลูกค้าแนบมา (nullable — ไม่บังคับแนบ)';

-- อัปเดต create_exchange_request ให้รับ+บันทึก delivery_note_photo_path จาก p_drug_items ด้วย
-- (โครงสร้างเดิมทั้งหมดคงไว้ทุกจุด แค่เพิ่มคอลัมน์ใหม่เข้า insert)
create or replace function public.create_exchange_request(
  p_b2b_customer_id bigint,
  p_request_data jsonb,
  p_drug_items jsonb,
  p_created_by_staff_id uuid default null::uuid,
  p_submission_channel text default 'customer_portal'::text
)
returns table(request_id bigint, ref_id text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_request_id bigint;
  v_ref_id text;
  v_doc_number text;
  v_item jsonb;
begin
  v_doc_number := public.generate_doc_number();

  insert into public.requests (
    ref_id, doc_number, request_type, hospital_name, contact_name, phone, province,
    customer_email, customer_code, b2b_customer_id, return_reason, delivery_type,
    addr_street, addr_sub, addr_district, addr_province, agent_info, agent_appointment_note,
    exchange_product_type, exchange_product_list, exchange_product_other,
    signature_url, signer_name, signer_position, total_value, request_date,
    created_by_staff_id, submission_channel
  ) values (
    p_request_data->>'ref_id', v_doc_number, p_request_data->>'request_type',
    p_request_data->>'hospital_name', p_request_data->>'contact_name', p_request_data->>'phone',
    p_request_data->>'province',
    p_request_data->>'customer_email', p_request_data->>'customer_code', p_b2b_customer_id, p_request_data->>'return_reason',
    p_request_data->>'delivery_type', p_request_data->>'addr_street', p_request_data->>'addr_sub',
    p_request_data->>'addr_district', p_request_data->>'addr_province', p_request_data->>'agent_info',
    p_request_data->>'agent_appointment_note',
    p_request_data->>'exchange_product_type', p_request_data->>'exchange_product_list',
    p_request_data->>'exchange_product_other', p_request_data->>'signature_url',
    p_request_data->>'signer_name', p_request_data->>'signer_position',
    (p_request_data->>'total_value')::numeric, (p_request_data->>'request_date')::timestamp with time zone,
    p_created_by_staff_id, p_submission_channel
  ) returning id, public.requests.ref_id into v_request_id, v_ref_id;

  if p_drug_items is not null then
    for v_item in select * from jsonb_array_elements(p_drug_items)
    loop
      insert into public.drug_items (
        request_id, drug_name, qty, unit, lot_number, exp_date, unit_price, value_amount,
        invoice_number, delivery_note_photo_path
      ) values (
        v_request_id, v_item->>'drug_name', (v_item->>'qty')::integer, v_item->>'unit',
        v_item->>'lot_number', (v_item->>'exp_date')::date, (v_item->>'unit_price')::numeric,
        (v_item->>'value_amount')::numeric, v_item->>'invoice_number',
        v_item->>'delivery_note_photo_path'
      );
    end loop;
  end if;

  return query select v_request_id, v_ref_id;
end;
$function$;
