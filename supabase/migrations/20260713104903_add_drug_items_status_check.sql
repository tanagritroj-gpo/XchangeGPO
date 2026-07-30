
ALTER TABLE public.drug_items
  ADD CONSTRAINT drug_items_current_status_check
  CHECK (current_status = ANY (ARRAY[
    'pending_review'::text, 'approved'::text, 'rejected'::text, 'in_transit'::text,
    'at_warehouse'::text, 'checked_in'::text, 'receiving'::text, 'exchanging'::text,
    'completed'::text, 'out_for_delivery'::text
  ]));
