-- Gate 0.1, issue #256: the client per-tenant aviso de privacidad needs an ANON read of the two
-- legal-identity sources #255 made staff-only: `gym.legal_name` (razón social) and `gym_legal`'s
-- three columns (domicilio, contacto ARCO). Unlike #255's staff-only RPC design, this read is
-- DELIBERATELY a plain anon grant+policy: the aviso is public-by-law content (LFPDPPP art. 15 — a
-- gym's privacy notice must be freely available to its members and prospects), so "an anonymous
-- visitor can read a gym's razón social/domicilio/ARCO contact" is the INTENDED outcome here, not
-- a leak — the opposite of #255's `obtener_identidad_legal` design, which exists specifically
-- because that data gates a STAFF-only admin editor and must not ride the flat
-- `gym_anon_select using (true)` policy.
--
-- ── gym.legal_name: an incremental column grant onto an already-narrowed surface ────────────────
-- 20260713190100 already revoked gym's table-wide anon SELECT grant and re-granted an explicit
-- column list (id/slug/brand_name/…); adding `legal_name` here is a plain incremental grant on
-- top of that — no revoke-then-grant dance needed (unlike `gym_legal` below, whose SELECT grant
-- was never narrowed at all). `gym`'s own SELECT policy (`gym_anon_select … using (true)`) stays
-- untouched and FLAT — legal_name becomes readable across every gym row, unscoped by tenant, the
-- same way brand_name/timezone/about_* already are. That is deliberate, not an oversight: the
-- aviso is public-by-law content, so a flat read of one more already-public-shaped column is the
-- intended surface, not a new isolation boundary to enforce.
grant select (legal_name) on public.gym to anon;

-- ── gym_legal: revoke the ambient default grant, then grant exactly the aviso's columns ─────────
-- `gym_legal` (20260808120000) never had its grants touched by any migration — no revoke, no
-- narrowing — so Supabase's project-wide `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon,
-- authenticated` scaffold (the same landmine 20260808130000's "LIVE-MEASURED TRAP #1" measured
-- live on `gym`) still hands `anon` every command on every column of this table too. RLS
-- default-deny has kept that grant inert (no anon SELECT policy existed on gym_legal until this
-- migration), but the FIRST anon policy on a table changes that: `using (…)` plus the ambient
-- table-wide grant would expose EVERY column, including `updated_at` — not sensitive, but not a
-- column the aviso template interpolates either. Revoke-then-grant-columns closes that (the same
-- `gym` D3 idiom, 20260713190100) to exactly what `AVISO_PRIVACIDAD_INTEGRAL_TEXTO` needs:
-- domicilio, email_arco, area_datos_personales, plus gym_id for the policy predicate + the DAL's
-- own `.eq('gym_id', …)` scope.
revoke select on table public.gym_legal from anon;
grant select (gym_id, domicilio, email_arco, area_datos_personales) on public.gym_legal to anon;

-- Close the INSERT/UPDATE/DELETE arm of the SAME ambient grant while we're here, mirroring
-- 20260808130000's "close the rest of the landmine" move on `gym`. RLS default-deny already
-- blocks every one of these for anon today (gym_legal carries no write policy for anon, only
-- staff), so nothing observable changes — but an inert ambient grant sitting unexamined right next
-- to a table that just gained its first anon policy is exactly the shape that bit `gym` once
-- already. Defense-in-depth, not a behavior change.
revoke insert, update, delete on table public.gym_legal from anon;

-- Request-scoped, NOT flat `using (true)`: the brief's own template pointed at gym_contact's
-- ORIGINAL migration (20260706165900, `using (true)`), but that predicate is stale — #215
-- (20260802140000) rewrote gym_contact's anon policy, along with every other per-gym anon-
-- readable satellite, to `gym_id = gym_en_peticion()` (the request's own `x-gym-id` header) so one
-- anonymous call can never span two gyms. gym_legal holds MORE sensitive per-gym data than
-- gym_contact's marketing copy, so it gets the CURRENT house pattern, not the superseded one — the
-- brief's own "verify — don't assume" hedge, borne out.
drop policy if exists "gym_legal_anon_select" on public.gym_legal;
create policy "gym_legal_anon_select" on public.gym_legal for select to anon
  using (gym_id = (select public.gym_en_peticion()));

-- Expand-only (grant/revoke + one new policy, no existing object altered), idempotent
-- (grant/revoke re-apply cleanly; the policy is drop-if-exists/create), safe out-of-order on the
-- live project.
