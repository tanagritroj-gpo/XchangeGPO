-- ★ ย้าย "รูปใบส่งของ" จากระดับรายการยา (drug_items) ไปเป็นระดับคำร้อง (requests) — ตามที่
-- คุยกันว่าดีไซน์เดิม (1 รูปต่อ 1 รายการยา) ไม่ตรงกับความเป็นจริง เพราะใบส่งของคือเอกสาร
-- 1 ใบต่อ 1 การจัดส่ง ไม่ใช่ 1 ใบต่อยา 1 รายการ — แนบครั้งเดียวรองรับหลายรูป (หน้า-หลัง/
-- หลายแผ่น) ต่อคำร้องแทน

alter table public.requests
  add column delivery_note_photo_paths text[];

comment on column public.requests.delivery_note_photo_paths is
  'Path ภายใน bucket return-documents ของรูปถ่ายใบส่งของที่ลูกค้าแนบมา (nullable/array — ไม่บังคับแนบ, สูงสุดตามที่ UI กำหนด)';

-- ย้ายข้อมูลทดสอบที่มีอยู่แล้ว (ก่อนย้ายดีไซน์) ขึ้นมาระดับคำร้อง ไม่ให้หายไปเฉยๆ
update public.requests r
set delivery_note_photo_paths = sub.paths
from (
  select request_id, array_agg(delivery_note_photo_path order by id) as paths
  from public.drug_items
  where delivery_note_photo_path is not null
  group by request_id
) sub
where sub.request_id = r.id;

alter table public.drug_items
  drop column delivery_note_photo_path;

-- อัปเดต create_exchange_request: รับ p_delivery_note_photo_paths (array, optional — default
-- null ไม่กระทบผู้เรียกเดิมที่ไม่ส่งพารามิเตอร์นี้ เช่น createStaffReturnRequest ฝั่ง CSR)
-- บันทึกลง requests แทนการวน insert ต่อรายการยาแบบเดิม
create or replace function public.create_exchange_request(
  p_b2b_customer_id bigint,
  p_request_data jsonb,
  p_drug_items jsonb,
  p_created_by_staff_id uuid default null::uuid,
  p_submission_channel text default 'customer_portal'::text,
  p_delivery_note_photo_paths text[] default null
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
    created_by_staff_id, submission_channel, delivery_note_photo_paths
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
    p_created_by_staff_id, p_submission_channel, p_delivery_note_photo_paths
  ) returning id, public.requests.ref_id into v_request_id, v_ref_id;

  if p_drug_items is not null then
    for v_item in select * from jsonb_array_elements(p_drug_items)
    loop
      insert into public.drug_items (
        request_id, drug_name, qty, unit, lot_number, exp_date, unit_price, value_amount, invoice_number
      ) values (
        v_request_id, v_item->>'drug_name', (v_item->>'qty')::integer, v_item->>'unit',
        v_item->>'lot_number', (v_item->>'exp_date')::date, (v_item->>'unit_price')::numeric,
        (v_item->>'value_amount')::numeric, v_item->>'invoice_number'
      );
    end loop;
  end if;

  return query select v_request_id, v_ref_id;
end;
$function$;
