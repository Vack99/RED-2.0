-- Anon catalog read (decision (b) discharged) — slice #50 (PRD #49 S1; PRD #36 decision (b); ADR-0013 §3).
--
-- The conscious, recorded decision "the showcased catalog is PUBLIC": the client app's marketing pages
-- read the curated catalog + gym content anonymously, so anon gains SELECT on exactly the tables PRD #49
-- names — coach, class_type (+workblock/bring_item children), class_session (+coach join),
-- schedule_template, the package catalog's marketing surface (paquetes) + plan_feature, gym content
-- (about_value/facility/stat/faq), and room. This follows the Phase-3 gym/gym_domain anon precedent
-- (20260702150000) byte-for-byte in posture: a public fact readable without a session.
--
-- SCOPE, deliberately bounded (the acceptance criterion "no other anon widening exists"):
--   • ADDS anon SELECT to the 14 decision-(b) tables ONLY. The pre-existing authenticated is_member_of
--     read policies are UNTOUCHED and keep coexisting (permissive OR) — a logged-in member still reads
--     their own gym's catalog gym-scoped; anon reads it flat.
--   • `to anon` ONLY, never `to anon, authenticated`: widening authenticated to `using (true)` would let
--     a logged-in member of gym A read gym B's catalog. Members stay gym-scoped via is_member_of; the
--     marketing pages read over a cookieless ANON client, so the anon grant is the whole public surface.
--   • Per-gym scoping stays a QUERY concern (the marketing DAL filters `.eq('gym_id', …)`) — anon's
--     `using (true)` is flat across gyms by design (hostnames are public; the page picks its gym).
--   • schedule_template_coach is NOT granted (PRD names "class sessions +coach join", not the template's
--     coach join); no member-owned table (clientes/ventas/asistencias/cobro/perfil/plantillas/
--     gym_membership) is touched. No anon WRITE anywhere.
--
-- No table-level GRANT is needed: anon already holds SELECT privilege on these tables (Supabase default;
-- the pre-migration denial suites proved anon could QUERY them and got 0 rows via RLS, not a privilege
-- error) — this migration only adds the missing RLS policy that flips those 0s to visible.
--
-- Idempotent (drop-policy-if-exists + create), strictly CREATE POLICY (no table/constraint/RPC DDL), so
-- it is safe to re-apply and safe out-of-order on the live project. The rls_auto_enable trigger stays on.

drop policy if exists "coach_anon_select" on public.coach;
create policy "coach_anon_select" on public.coach for select to anon using (true);

drop policy if exists "class_type_anon_select" on public.class_type;
create policy "class_type_anon_select" on public.class_type for select to anon using (true);

drop policy if exists "class_type_workblock_anon_select" on public.class_type_workblock;
create policy "class_type_workblock_anon_select" on public.class_type_workblock for select to anon using (true);

drop policy if exists "class_type_bring_item_anon_select" on public.class_type_bring_item;
create policy "class_type_bring_item_anon_select" on public.class_type_bring_item for select to anon using (true);

drop policy if exists "class_session_anon_select" on public.class_session;
create policy "class_session_anon_select" on public.class_session for select to anon using (true);

drop policy if exists "class_session_coach_anon_select" on public.class_session_coach;
create policy "class_session_coach_anon_select" on public.class_session_coach for select to anon using (true);

drop policy if exists "schedule_template_anon_select" on public.schedule_template;
create policy "schedule_template_anon_select" on public.schedule_template for select to anon using (true);

drop policy if exists "paquetes_anon_select" on public.paquetes;
create policy "paquetes_anon_select" on public.paquetes for select to anon using (true);

drop policy if exists "plan_feature_anon_select" on public.plan_feature;
create policy "plan_feature_anon_select" on public.plan_feature for select to anon using (true);

drop policy if exists "about_value_anon_select" on public.about_value;
create policy "about_value_anon_select" on public.about_value for select to anon using (true);

drop policy if exists "facility_anon_select" on public.facility;
create policy "facility_anon_select" on public.facility for select to anon using (true);

drop policy if exists "stat_anon_select" on public.stat;
create policy "stat_anon_select" on public.stat for select to anon using (true);

drop policy if exists "faq_anon_select" on public.faq;
create policy "faq_anon_select" on public.faq for select to anon using (true);

drop policy if exists "room_anon_select" on public.room;
create policy "room_anon_select" on public.room for select to anon using (true);
