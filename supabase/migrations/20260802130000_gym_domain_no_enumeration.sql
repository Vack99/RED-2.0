-- #216 (epic #203) — `gym_domain` is the platform's customer census, and it was fully
-- readable by anyone with the publishable key.
--
-- `gym_domain_anon_select ... to anon, authenticated using (true)` (20260702150000:50-52).
-- Unlike `gym`, it never received a column narrowing: live column_privileges showed anon
-- holding app, created_at, gym_id, hostname, id. ONE anonymous call returned all 14 rows —
-- every customer's admin host, client host, dev host, gym_id and onboarding order.
--
-- CONTEXT.md defended this as "los hostnames son hechos públicos de DNS". That defends
-- resolving ONE host. It does not defend enumerating ALL of them plus their onboarding
-- order, which is a prospect list for a competitor, a target list for credential stuffing
-- against one shared auth.users, and the reconnaissance step that makes a wildcard entry
-- in the Auth redirect allow-list targetable (#206/#217).
--
-- What the pre-auth seam actually needs is one row for one hostname it already knows
-- (`resolve-tenant.ts` and the send-email hook both do exactly that). RLS cannot express
-- "only if you named the row" — a policy sees rows, never the WHERE clause — so the
-- narrow read moves behind a SECURITY DEFINER projection. This is the same shape as
-- `invitacion_info` (20260708200003): a definer function granted to anon that answers one
-- question and cannot be turned into a scan.
--
-- Writes are unchanged and were never the problem: `gym_domain` has NO insert/update/delete
-- policy, so under default-deny only the migration/service role writes it. Combined with
-- Vercel's DNS verification, a hostile operator cannot map a hostname into the platform.

-- ── The one question anon is allowed to ask ───────────────────────────────────
-- STABLE, so PostgREST can call it and the planner can cache it within a statement.
-- `p_app` is optional because the two callers differ: resolveTenant matches a hostname
-- across both apps (a host is unique table-wide anyway), the send-email hook pins
-- app='client'. `limit 1` mirrors the `.maybeSingle()` both callers already used —
-- `hostname` is UNIQUE, so it is belt-and-braces, not a choice between rows.
create or replace function public.gym_id_por_host(p_hostname text, p_app text default null)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.gym_id
  from public.gym_domain d
  where d.hostname = p_hostname
    and (p_app is null or d.app = p_app)
  limit 1
$$;

-- CREATE FUNCTION grants EXECUTE to public by default; revoke before granting narrowly.
revoke execute on function public.gym_id_por_host(text, text) from public;
grant execute on function public.gym_id_por_host(text, text) to anon, authenticated;

-- ── The table itself stops being a public list ────────────────────────────────
-- anon: no policy at all → default-deny. The grant is revoked too, so both layers say no.
-- authenticated: narrowed from `using (true)` to the caller's OWN gyms. That keeps the one
-- in-app table read working (`construirUrlInvitacion` resolves a gym's client host, and it
-- runs under a staff session of that same gym) while removing the census from every member
-- who holds an authenticated JWT — which was the identical exposure, one role over. This is
-- the ADR-0008 amendment's "may only narrow" applied to a read.
drop policy if exists "gym_domain_anon_select" on public.gym_domain;

drop policy if exists "gym_domain_member_select" on public.gym_domain;
create policy "gym_domain_member_select" on public.gym_domain
  for select to authenticated
  using ((select public.is_member_of(gym_id)));

revoke select on table public.gym_domain from anon;
