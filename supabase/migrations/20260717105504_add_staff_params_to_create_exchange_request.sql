CREATE OR REPLACE FUNCTION public.create_exchange_request(
  p_b2b_customer_id bigint,
  p_request_data jsonb,
  p_drug_items jsonb,
  p_created_by_staff_id uuid DEFAULT NULL,
  p_submission_channel text DEFAULT 'customer_portal'
)
RETURNS TABLE(request_id bigint, ref_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request_id bigint;
  v_ref_id text;
  v_item jsonb;
BEGIN
  INSERT INTO public.requests (
    ref_id, doc_number, request_type, hospital_name, contact_name, phone,
    customer_email, b2b_customer_id, return_reason, delivery_type,
    addr_street, addr_sub, addr_district, addr_province, agent_info,
    exchange_product_type, exchange_product_list, exchange_product_other,
    signature_url, signer_name, signer_position, total_value, request_date,
    created_by_staff_id, submission_channel
  ) VALUES (
    p_request_data->>'ref_id', p_request_data->>'doc_number', p_request_data->>'request_type',
    p_request_data->>'hospital_name', p_request_data->>'contact_name', p_request_data->>'phone',
    p_request_data->>'customer_email', p_b2b_customer_id, p_request_data->>'return_reason',
    p_request_data->>'delivery_type', p_request_data->>'addr_street', p_request_data->>'addr_sub',
    p_request_data->>'addr_district', p_request_data->>'addr_province', p_request_data->>'agent_info',
    p_request_data->>'exchange_product_type', p_request_data->>'exchange_product_list',
    p_request_data->>'exchange_product_other', p_request_data->>'signature_url',
    p_request_data->>'signer_name', p_request_data->>'signer_position',
    (p_request_data->>'total_value')::numeric, (p_request_data->>'request_date')::timestamp with time zone,
    p_created_by_staff_id, p_submission_channel
  ) RETURNING id, public.requests.ref_id INTO v_request_id, v_ref_id;

  IF p_drug_items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_drug_items)
    LOOP
      INSERT INTO public.drug_items (
        request_id, drug_name, qty, unit, lot_number, exp_date, value_amount, invoice_number
      ) VALUES (
        v_request_id, v_item->>'drug_name', (v_item->>'qty')::integer, v_item->>'unit',
        v_item->>'lot_number', (v_item->>'exp_date')::date, (v_item->>'value_amount')::numeric,
        v_item->>'invoice_number'
      );
    END LOOP;
  END IF;

  RETURN QUERY SELECT v_request_id, v_ref_id;
END;
$function$;
