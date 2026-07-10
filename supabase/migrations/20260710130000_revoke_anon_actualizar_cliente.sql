-- Re-revoke anon EXECUTE on actualizar_cliente — fast-follow #82.3.
--
-- 20260708220000 DROPPED the 3-arg actualizar_cliente and CREATEd the 4-arg
-- (uuid, text, text, text default null) form. Its re-grant block revoked EXECUTE only `from public`
-- — not `from public, anon` like the house lockdown idiom — and Supabase's default privileges grant
-- EXECUTE on a freshly CREATEd function to `anon` directly, so anon regained the grant on the new
-- overload. The body's `No autenticado` guard still denies at runtime, but the grant-level contract
-- (ADR-0005/0013 §1) regressed. Restore it: revoke public+anon, keep authenticated.
revoke execute on function public.actualizar_cliente(uuid, text, text, text) from public, anon;
grant  execute on function public.actualizar_cliente(uuid, text, text, text) to authenticated;
