-- revoke_rls_auto_enable_execute
-- Applied to project hjppxawglmukfvsgmcog via Supabase MCP (migration 20260531210445).
--
-- Security hardening: rls_auto_enable() is a SECURITY DEFINER event-trigger
-- helper (it auto-enables RLS on newly created public tables). The trigger
-- system invokes it; no client ever needs to call it over PostgREST. Revoking
-- EXECUTE removes a definer-rights primitive that was reachable unauthenticated
-- via /rest/v1/rpc (Supabase advisors 0028/0029). Idempotent + reversible.
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
