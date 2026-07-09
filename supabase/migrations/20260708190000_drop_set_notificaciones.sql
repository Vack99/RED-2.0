-- S8 cleanup (#67, parent #64 Cluster D): drop the orphaned member-notifications toggle RPC.
--
-- The client UI's Notificaciones toggle and its DAL seam (packages/data/src/server/notificaciones.ts)
-- are removed in this same slice — this RPC was their sole write surface and is now unreferenced.
-- `clientes.notificaciones_activadas` (added by 20260706200000_clientes_notificaciones_toggle.sql)
-- is KEPT: the column is still read by the perfil summary (packages/data/src/server/agenda-miembro.ts);
-- only the write surface goes. Live signature verified 2026-07-08
-- (pg_get_function_identity_arguments): set_notificaciones(p_enabled boolean).
--
-- Mirrors the revoke/drop hygiene of 20260705081431_contract_a_drop_legacy_policies.sql: the function
-- carries its own EXECUTE grants, so `drop function` alone cleans those up too (no separate revoke
-- needed once the function is gone). Irreversible — DROP FUNCTION has no "if exists" guard removed
-- here on purpose; deliberate, not idempotent-guarded, since this is a one-way contract cut.

drop function public.set_notificaciones(boolean);
