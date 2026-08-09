-- Gate 0.1, issue #255: let staff read + write `gym.legal_name` (razón social) — the third field
-- group of the CUENTA legal-identity editor, alongside the `gym_legal` satellite (#253: domicilio +
-- contacto ARCO, already staff-writable). Today staff can do neither: `gym` carries NO write policy
-- at all (default-deny since 20260702150000, its own comment says so explicitly), and `legal_name`
-- is deliberately excluded from both the anon (20260713190100) and authenticated (20260802120000)
-- column grants — the latter's comment measured live that authenticated held `legal_name` (plus
-- owner_user_id/created_at) beyond the intended brand-seam column set and closed it, noting
-- "nothing reads legal_name — deliberately NOT changed [here]". #255 is that read — but see below,
-- it is NOT a plain column grant.
--
-- ── UPDATE: grant + the table's first-ever UPDATE policy, staff-scoped ──────────────────────────
-- COMPOSITION (restating the 20260802120000 idiom, run the other direction): grants and RLS both
-- must pass for a write to land. That migration used the grant to NARROW an open `using (true)`
-- policy without touching it; this one uses the grant to pick WHICH COLUMN moves, and adds `gym`'s
-- first-ever UPDATE policy to pick WHICH ROW: only `legal_name` carries an UPDATE grant, so a staff
-- caller with a passing `is_staff_of(id)` still cannot write `brand_name`, `slug`, `owner_user_id`,
-- or any other column — for lack of column privilege, not for lack of a matching row. This is safe
-- because `gym` carries no OTHER permissive UPDATE policy to OR against: this is the first one.
--
-- LIVE-MEASURED TRAP #1 (found denial-testing this migration on scratch, gyyujeguycxxoaqgdnjp):
-- `information_schema.column_privileges` shows `authenticated` ALREADY holds INSERT/UPDATE/
-- REFERENCES on every `gym` column, including ones no migration ever explicitly granted (e.g.
-- `owner_user_id`) — Supabase's own project scaffold runs a schema-wide `ALTER DEFAULT PRIVILEGES
-- ... GRANT ALL ON TABLES TO anon, authenticated, service_role` at project creation, so every new
-- table starts maximally granted; every migration on this table so far relied on RLS default-deny
-- (no INSERT/UPDATE/DELETE policy existed) to keep that grant inert, never on the grant being
-- narrow. Confirmed: applying only `grant update (legal_name) ...` and adding the policy, WITHOUT
-- the revoke below, let a probe UPDATE of `owner_user_id` through unchanged — the ambient
-- table-wide UPDATE grant, not any explicit one, was doing the opening. `revoke update on table
-- public.gym from authenticated` first closes that ambient grant (the SAME move
-- 20260713190100/20260802120000 made for SELECT); only THEN does re-granting `update (legal_name)`
-- mean what it says. Anyone adding the table's NEXT write policy (INSERT/DELETE) needs the same
-- revoke-first step — RLS default-deny is not a substitute for it once a policy for that command
-- exists.
--
-- ── READ: an RPC, deliberately NOT a column grant ────────────────────────────────────────────────
-- LIVE-MEASURED TRAP #2: `gym`'s ONLY select policy is `gym_anon_select ... to anon, authenticated
-- using (true)` — permissive, unconditional, and (per Postgres RLS) OR-combined with any other
-- permissive policy on the same command. Row-level security cannot make ONE column visible only to
-- staff while `using (true)` already opens every row for SELECT: a `grant select (legal_name) to
-- authenticated`, as this migration originally shipped, DOES pass grants+RLS composition — but
-- composition is exactly the problem. `select legal_name from gym` would then succeed for ANY
-- authenticated identity, staff of that gym or not, because the row filter is `true` regardless.
-- Denial-tested and confirmed: `supabase/tests/gym_tenant_anon_read.sql` (#213's own regression
-- guard) already asserts a membership-less identity gets 42501 on `legal_name` — a plain column
-- grant broke that assertion outright (`gym legal_name staff-write suite` passed; `gym tenant
-- anon-read` failed). AC4 ("staff-only, gym-scoped") and #213 both require the row to matter for
-- this column, and RLS alone cannot express "row-conditional column visibility" against an existing
-- `using (true)` policy — so the read goes through `obtener_identidad_legal`, a SECURITY DEFINER
-- function with its OWN explicit `is_staff_of` gate (the same shape `aceptar_acuerdo` uses for
-- writes past a zero-policy table), never a table grant. It bundles `gym.legal_name` with the
-- `gym_legal` satellite's three columns in one round trip — `gym_legal` needs no such workaround
-- (its own SELECT policy is staff-scoped from birth, no `using (true)` sibling to OR against) but
-- returning all four together saves the CUENTA editor a second query.
--
-- Expand-only (grant/revoke + one new policy + one new function, no existing object altered),
-- idempotent (grant/revoke re-apply cleanly; policy and function are drop/create-or-replace), safe
-- out-of-order on the live project. Every helper call wrapped in the `(select …)` initplan idiom
-- (ADR-0001) where it runs under RLS; the function itself needs no such wrapping (it isn't a policy
-- expression), matching `aceptar_acuerdo`'s own body.

revoke update on table public.gym from authenticated;
grant update (legal_name) on public.gym to authenticated;

-- ── Close the REST of the same ambient-grant landmine while we're here (review round 2, #255) ────
-- TRAP #1 above only measured and closed the `authenticated` UPDATE grant (the command this
-- migration's new policy needed to be safe). The SAME schema-wide `GRANT ALL ON TABLES` scaffold
-- also still leaves `anon` holding every command on `gym` (INSERT/UPDATE/DELETE included — only
-- SELECT was ever narrowed, by 20260713190100), and leaves `authenticated` holding INSERT/DELETE.
-- Neither opens anything TODAY: `gym` carries no INSERT/DELETE policy for either role, and
-- `authenticated`'s only UPDATE policy (just above) is staff-scoped — RLS default-deny still blocks
-- every one of these commands regardless of the grant. But #256 is about to add gym-facing policies
-- for the public aviso URL, and an inert ambient grant sitting unexamined is exactly what TRAP #1
-- already burned once elsewhere on this same table. Revoking now, before any policy exists to
-- compose with it, means the next person who adds one starts from a clean slate instead of having
-- to rediscover this.
revoke insert, update, delete on table public.gym from anon;
revoke insert, delete on table public.gym from authenticated;

drop policy if exists "gym_staff_update" on public.gym;
create policy "gym_staff_update" on public.gym for update to authenticated
  using ((select public.is_staff_of(id))) with check ((select public.is_staff_of(id)));

create or replace function public.obtener_identidad_legal(p_gym_id uuid)
  returns table (razon_social text, domicilio text, email_arco text, area_datos_personales text)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $function$
begin
  if not public.is_staff_of(p_gym_id) then
    raise exception 'No autorizado';
  end if;

  return query
    select g.legal_name, gl.domicilio, gl.email_arco, gl.area_datos_personales
    from public.gym g
    left join public.gym_legal gl on gl.gym_id = g.id
    where g.id = p_gym_id;
end;
$function$;

-- EXECUTE lockdown (ADR-0013 §1): revoke from BOTH public AND anon explicitly (a bare revoke from
-- PUBLIC does not remove anon's separate platform default-privilege grant on Supabase-hosted
-- Postgres — the exact gap 20260715080000 closed after a live probe), grant only to authenticated;
-- the is_staff_of check inside is the real gate.
revoke execute on function public.obtener_identidad_legal(uuid) from public, anon;
grant  execute on function public.obtener_identidad_legal(uuid) to authenticated;
