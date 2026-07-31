REVOKE EXECUTE ON FUNCTION public.create_exchange_request(bigint, jsonb, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_exchange_request(bigint, jsonb, jsonb, uuid, text) TO service_role;
