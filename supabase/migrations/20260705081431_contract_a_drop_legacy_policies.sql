-- Migration A — reversible policy contract (ADR-0013 §5, expand/contract cutover, STAGE A).
--
-- WHAT THIS IS: the "contract" half of the ADR-0013 §5 expand/contract migration, stage A only —
-- the policy contract. It drops the 21 legacy per-`auth.uid()` = user_id owner-scoped policies that
-- the S3/S4 gym-scoped (staff/member) policies have already superseded. The gym-scoped replacements
-- are LIVE and carry the tenant boundary; these 21 are now dead weight (and the source of the
-- multiple_permissive_policies advisor WARNs). This migration touches policies + grants ONLY.
--
-- REVERSIBLE: no column or data is destroyed here. If a live problem surfaces after GATE 1, replay
-- `rollback_a_recreate_legacy_policies.sql` to recreate all 21 verbatim. (Stage B — the column
-- contract — is the irreversible half and is gated separately.)
--
-- MUST SURVIVE (deliberately NOT dropped — they mention auth.uid() but are the NEW member seam,
-- not legacy):
--   * clientes_member_select        (qual: auth_user_id = (select auth.uid()))
--   * gym_membership_self_select
-- The live snake_case gym-scoped policies (cobro_owner_insert/select/update, *_staff_*, *_member_*)
-- also survive — only the space-named / _own legacy set below is dropped.
--
-- Live-catalog verified 2026-07-05: all 21 policy names exist exactly as spelled on their tables
-- (pg_policies); space-named ones quoted.

drop policy "asistencias_insert_own"   on public.asistencias;
drop policy "asistencias_select_own"   on public.asistencias;
drop policy "asistencias_update_own"   on public.asistencias;
drop policy "clientes_insert_own"      on public.clientes;
drop policy "clientes_select_own"      on public.clientes;
drop policy "clientes_update_own"      on public.clientes;
drop policy "cobro owner insert"       on public.cobro;
drop policy "cobro owner select"       on public.cobro;
drop policy "cobro owner update"       on public.cobro;
drop policy "paquetes_insert_own"      on public.paquetes;
drop policy "paquetes_select_own"      on public.paquetes;
drop policy "paquetes_update_own"      on public.paquetes;
drop policy "perfil_insert_own"        on public.perfil;
drop policy "perfil_select_own"        on public.perfil;
drop policy "perfil_update_own"        on public.perfil;
drop policy "plantillas owner delete"  on public.plantillas;
drop policy "plantillas owner insert"  on public.plantillas;
drop policy "plantillas owner select"  on public.plantillas;
drop policy "plantillas owner update"  on public.plantillas;
drop policy "ventas_insert_own"        on public.ventas;
drop policy "ventas_select_own"        on public.ventas;

-- M1 (review item 4) — revoke lingering anon EXECUTE on the four write RPCs + the seed RPC.
-- Signatures below are the LIVE identity arguments (pg_get_function_identity_arguments), verified
-- 2026-07-05. NOTE: the plan drafted actualizar_cliente as a 7-arg signature
-- (uuid, text, text, date, integer, date, text) — that overload does NOT exist on live; the live
-- (and only) signature is (uuid, text, text), so the live one is used here (plan's own "live wins"
-- rule). Verified live: ALL FIVE functions currently HAVE an anon EXECUTE grant, so every revoke
-- below is a real, non-pointless revoke (each is also idempotent-safe).
revoke execute on function public.actualizar_cliente(uuid, text, text) from anon;
revoke execute on function public.actualizar_plantilla(uuid, text, text) from anon;
revoke execute on function public.crear_plantilla(text, text) from anon;
revoke execute on function public.eliminar_plantilla(uuid) from anon;
revoke execute on function public.sembrar_plantillas_default() from anon;
