-- #250 (epic #203 follow-on) — five tables were anon-readable with no anon reader anywhere.
--
-- Not a regression. `docs/prds/prd-client-app.md:103` specified the anon set as a TABLE
-- ENUMERATION and 20260706160000_phase6_anon_catalog_read granted that list verbatim; the pages
-- that actually shipped read 11 of the 16. #215 (20260802140000) then narrowed all 15 catalog
-- policies to the gym the request names — but narrowing a policy nobody reads through only makes
-- a dead public surface smaller, it does not close it.
--
-- Derived, not declared: replaying supabase/migrations/ yields a 16-table anon-read surface, while
-- the sole consumer of `createAnonClient` (packages/data/src/server/marketing.ts — exhaustive grep;
-- resolve-tenant.ts reads `gym`) touches 11. These five have no anon reader at all:
--
--   room                   no reader of ANY kind — zero `.from("room")` in the repo, no migration
--                          ever inserts a row, `class_session.room_id` is never set. The "Sala" the
--                          UI renders is `class_type.sala`, a text column.
--   schedule_template      no TS reader; only staff/cron SQL (materialize_week_for_gym,
--                          ensure_week_materialized, create_recurring_schedule,
--                          cron_materialize_horizon), all `revoke execute from public, anon`.
--   class_session_coach    agenda.ts, agenda-miembro.ts, clase-miembro.ts — all cookie client.
--   class_type_workblock   clase-miembro.ts, class-type.ts — cookie client.
--   class_type_bring_item  clase-miembro.ts, class-type.ts — cookie client.
--
-- Breaks nothing: every one of the five keeps its `*_member_select` policy for `authenticated`
-- (20260705230121 / 20260706120000, rewritten to the uncorrelated idiom by 20260714080000), so
-- every member and staff read still resolves. Only the `anon` arm goes, and with no anon policy
-- left RLS default-deny is the answer — which is why there are no grants to revoke here: no
-- migration ever issued a per-table anon grant on these five, only Supabase's baseline, and a
-- baseline grant with no policy behind it returns zero rows.
--
-- Not a definer-served-redundant case either: the anon-executable function set is exactly four
-- (enviar_mensaje_contacto, invitacion_info, gym_id_por_host, gym_en_peticion) and none reads
-- these tables.
--
-- Re-adding one of these is a three-line migration — and it must land WITH its reader, which is
-- exactly the rule that was broken here. Written one statement per table for the same reason
-- 20260802140000 was: #214's guard DERIVES the anon-read surface by parsing these files, and
-- dynamic SQL is invisible to it.

drop policy if exists "class_type_workblock_anon_select"  on public.class_type_workblock;
drop policy if exists "class_type_bring_item_anon_select" on public.class_type_bring_item;
drop policy if exists "class_session_coach_anon_select"   on public.class_session_coach;
drop policy if exists "schedule_template_anon_select"     on public.schedule_template;
drop policy if exists "room_anon_select"                  on public.room;
