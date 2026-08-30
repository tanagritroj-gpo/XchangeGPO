-- ─────────────────────────────────────────────────────────────────────────────
-- 1. requests: เพิ่ม agent_appointment_date (วันนัดรับสินค้าจากผู้แทน — ช่อง
--    "วันที่ส่งมอบ" บนฟอร์ม FM-AJJ0-008) แยกคอลัมน์ของตัวเองเป็น date จริง
--    ต่างจาก agent_appointment_note ที่เป็น free text (หมายเหตุ/ช่วงเวลา) — เก็บ note ไว้
--
--    transaction_date / exchange_product: NULL 100% ทุกแถว (32/32) ไม่มี function/view/
--    trigger ไหนอ้างถึง (สแกน pg_proc/pg_views/pg_trigger ก่อน apply) — คอลัมน์ตัวเก่า
--    ก่อน exchange_product แตกเป็น _type/_list/_other และก่อนเลิกใช้ transaction_date
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.requests add column if not exists agent_appointment_date date;
alter table public.requests drop column if exists transaction_date;
alter table public.requests drop column if exists exchange_product;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ร้อย agent_appointment_date ผ่าน RPC insert จุดเดียว (ทั้ง customer + CSR path
--    เรียกตัวนี้) — signature เดิม 6 args ไม่เปลี่ยน CREATE OR REPLACE แทนที่ในที่เดิม
--    ACL คงเดิม แต่ re-assert revoke/grant ท้ายไฟล์ตาม pattern ทุก migration ก่อนหน้า
--    (20260816123247 ฯลฯ)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.create_exchange_request(
  p_b2b_customer_id bigint,
  p_request_data jsonb,
  p_drug_items jsonb,
  p_created_by_staff_id uuid default null::uuid,
  p_submission_channel text default 'customer_portal'::text,
  p_delivery_note_photo_paths text[] default null::text[]
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
    addr_street, addr_sub, addr_district, addr_province, agent_info,
    agent_appointment_note, agent_appointment_date,
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
    nullif(p_request_data->>'agent_appointment_date', '')::date,
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

revoke execute on function public.create_exchange_request(
  bigint, jsonb, jsonb, uuid, text, text[]
) from public, anon, authenticated;

grant execute on function public.create_exchange_request(
  bigint, jsonb, jsonb, uuid, text, text[]
) to service_role;
