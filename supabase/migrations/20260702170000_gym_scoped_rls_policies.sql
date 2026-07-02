-- Gym-scoped RLS policy EXPAND, slice #23 (PRD #17 S4; ADR-0013 §3 — the ADD half only).
--
-- Adds the membership-keyed policies ALONGSIDE the surviving per-`auth.uid()` policies on every tenant
-- table — the expand step of the ADR-0013 §5 expand/contract cutover. Permissive policies OR together,
-- so during this phase a row is visible/writable if EITHER the old per-operator predicate OR the new
-- gym-scoped predicate grants it; the lone Forge operator keeps working while gym-scoped access lights
-- up. The terminal per-`auth.uid()` DROP is the HITL cutover (S10), NOT this slice.
--
-- One standard predicate per ADR-0013 §3 / target-data-model §3 class, every helper wrapped in the
-- `(select …)` initplan idiom (ADR-0001/§2 — evaluated once per statement, not per row; gym_id is
-- indexed on every table by #20, and gym_membership's PK covers the helper lookup):
--   • member-owned / transactional  — clientes, ventas, asistencias:
--       staff of the row's gym read/write via is_staff_of(gym_id); PLUS the owning member reads their
--       OWN clientes row via auth_user_id = auth.uid() (the only member read path this phase — member
--       reads of ventas/asistencias and all member writes are Phase 6). ventas stays IMMUTABLE: it has
--       only select/insert today, so only select/insert gym-scoped policies are added (no update/delete).
--   • curated / showcased  — paquetes, perfil, plantillas:
--       authenticated members read via is_member_of(gym_id); staff write via is_staff_of(gym_id).
--   • owner-only secret  — cobro (CLABE):
--       every surface is has_role(gym_id,'owner') — operators and members NEVER read/write bank details.
--
-- Command surfaces MIRROR each table's existing per-`auth.uid()` set exactly (verified against
-- pg_policies) so this migration adds NO new command surface: e.g. ventas gains no update/delete, and
-- delete is added only on plantillas (the one table with a pre-existing delete policy).
--
-- Idempotent (drop-policy-if-exists + create) and strictly CREATE POLICY — no table/RPC/constraint DDL —
-- so it is safe to re-apply, safe out-of-order on the live project, and COMMUTES with sibling slice #24
-- (folio counter + registrar_venta + unique re-keys), which touches disjoint objects. Forge stays green.

-- ── clientes (member-owned): staff read/write + owning-member read ────────────────────────────────
drop policy if exists "clientes_staff_select"  on public.clientes;
create policy "clientes_staff_select"  on public.clientes for select to authenticated
  using ((select public.is_staff_of(gym_id)));
drop policy if exists "clientes_member_select" on public.clientes;
create policy "clientes_member_select" on public.clientes for select to authenticated
  using (auth_user_id = (select auth.uid()));
drop policy if exists "clientes_staff_insert"  on public.clientes;
create policy "clientes_staff_insert"  on public.clientes for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "clientes_staff_update"  on public.clientes;
create policy "clientes_staff_update"  on public.clientes for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));

-- ── ventas (member-owned, IMMUTABLE): staff read + insert only ─────────────────────────────────────
drop policy if exists "ventas_staff_select" on public.ventas;
create policy "ventas_staff_select" on public.ventas for select to authenticated
  using ((select public.is_staff_of(gym_id)));
drop policy if exists "ventas_staff_insert" on public.ventas;
create policy "ventas_staff_insert" on public.ventas for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));

-- ── asistencias (member-owned): staff read/write ──────────────────────────────────────────────────
drop policy if exists "asistencias_staff_select" on public.asistencias;
create policy "asistencias_staff_select" on public.asistencias for select to authenticated
  using ((select public.is_staff_of(gym_id)));
drop policy if exists "asistencias_staff_insert" on public.asistencias;
create policy "asistencias_staff_insert" on public.asistencias for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "asistencias_staff_update" on public.asistencias;
create policy "asistencias_staff_update" on public.asistencias for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));

-- ── paquetes (curated): member read, staff write ──────────────────────────────────────────────────
drop policy if exists "paquetes_member_select" on public.paquetes;
create policy "paquetes_member_select" on public.paquetes for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "paquetes_staff_insert" on public.paquetes;
create policy "paquetes_staff_insert" on public.paquetes for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "paquetes_staff_update" on public.paquetes;
create policy "paquetes_staff_update" on public.paquetes for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));

-- ── perfil (curated): member read, staff write ───────────────────────────────────────────────────
drop policy if exists "perfil_member_select" on public.perfil;
create policy "perfil_member_select" on public.perfil for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "perfil_staff_insert" on public.perfil;
create policy "perfil_staff_insert" on public.perfil for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "perfil_staff_update" on public.perfil;
create policy "perfil_staff_update" on public.perfil for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));

-- ── plantillas (curated): member read, staff write + delete (mirrors its existing delete surface) ──
drop policy if exists "plantillas_member_select" on public.plantillas;
create policy "plantillas_member_select" on public.plantillas for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "plantillas_staff_insert" on public.plantillas;
create policy "plantillas_staff_insert" on public.plantillas for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "plantillas_staff_update" on public.plantillas;
create policy "plantillas_staff_update" on public.plantillas for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));
drop policy if exists "plantillas_staff_delete" on public.plantillas;
create policy "plantillas_staff_delete" on public.plantillas for delete to authenticated
  using ((select public.is_staff_of(gym_id)));

-- ── cobro (owner-only secret / CLABE): every surface is has_role owner ─────────────────────────────
drop policy if exists "cobro_owner_select" on public.cobro;
create policy "cobro_owner_select" on public.cobro for select to authenticated
  using ((select public.has_role(gym_id, 'owner')));
drop policy if exists "cobro_owner_insert" on public.cobro;
create policy "cobro_owner_insert" on public.cobro for insert to authenticated
  with check ((select public.has_role(gym_id, 'owner')));
drop policy if exists "cobro_owner_update" on public.cobro;
create policy "cobro_owner_update" on public.cobro for update to authenticated
  using ((select public.has_role(gym_id, 'owner'))) with check ((select public.has_role(gym_id, 'owner')));
