-- Corrective: migration 20260601010721 redefined registrar_venta via DROP+CREATE, which re-triggered
-- Supabase's default privileges and re-granted EXECUTE to anon. anon is the unauthenticated role and
-- must not reach the money-path RPC (the function guards with auth.uid() and is SECURITY INVOKER, but
-- least privilege + parity with toggle_pase require removing it). Revoke EXECUTE from anon and public.
--
-- Kept as its own migration (rather than only folding the revoke into 20260601010721) because
-- 20260601010721 was already recorded as applied on production before the regression was caught, so a
-- prod push would skip re-running it; this version actually executes the revoke on prod. The
-- 20260601010721 file ALSO carries the anon revoke so a from-scratch build is correct on its own.
revoke execute on function public.registrar_venta(text, text, text, text, integer, text, uuid, integer, date, integer, integer) from anon, public;
