-- วันนัดหมายรับสินค้า (กรณีเลือกวิธีส่งคืน "จัดส่งผ่านผู้แทน") เดิมถูกยัดรวมเข้ากับ
-- agent_info เป็น string เดียวด้วย separator ' | นัดหมาย: ' ฝั่ง Step3Reason.tsx ซึ่งเปราะบาง
-- และดึงกลับมาแสดง/query แยกจาก agent_info (ชื่อ sale) ไม่ได้ตรงๆ — แยกเป็นคอลัมน์ของตัวเอง
-- ให้ query/แสดงผลตรงไปตรงมา (nullable เพราะไม่บังคับกรอก)

alter table public.requests
  add column if not exists agent_appointment_note text;

comment on column public.requests.agent_appointment_note is
  'วันนัดหมายรับสินค้า กรอกเพิ่มเติมตอนเลือกวิธีส่งคืน "จัดส่งผ่านผู้แทน" (แยกจาก agent_info ที่เก็บชื่อ sale/ผู้แทน)';

create or replace function public.create_exchange_request(p_b2b_customer_id bigint, p_request_data jsonb, p_drug_items jsonb, p_created_by_staff_id uuid default null::uuid, p_submission_channel text default 'customer_portal'::text)
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
