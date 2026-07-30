
CREATE OR REPLACE FUNCTION public.check_document_attachment_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.request_id IS NULL AND NEW.ref_id IS NULL THEN
    RAISE EXCEPTION 'document_attachments: request_id and ref_id cannot both be null';
  END IF;

  IF NEW.request_id IS NOT NULL AND NEW.ref_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.requests
      WHERE id = NEW.request_id AND ref_id = NEW.ref_id
    ) THEN
      RAISE EXCEPTION 'document_attachments: request_id (%) and ref_id (%) must refer to the same request', NEW.request_id, NEW.ref_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_attachments_consistency ON public.document_attachments;

CREATE TRIGGER trg_document_attachments_consistency
  BEFORE INSERT OR UPDATE ON public.document_attachments
  FOR EACH ROW EXECUTE FUNCTION public.check_document_attachment_consistency();
