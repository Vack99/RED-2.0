-- #213 (epic #203) — close the `authenticated` column grant on `gym`.
--
-- `20260713190100_gym_anon_column_grants.sql` diagnosed this exactly right —
--   "the table-wide anon SELECT grant handed out every column, including
--    `legal_name` and `owner_user_id`, to anyone holding the publishable key"
-- — and then revoked from `anon` and STOPPED ONE ROLE SHORT. Live
-- `information_schema.column_privileges` on 2026-08-02:
--
--   anon           9 brand-seam columns
--   authenticated  those PLUS created_at, legal_name, owner_user_id
--
-- Every gym member holds the publishable key *and* an `authenticated` JWT, and the
-- only policy on `gym` is `gym_anon_select ... to anon, authenticated using (true)`.
-- Proven live with a fabricated `sub` holding no `gym_membership` row: all 4 gyms
-- came back, with each owner's `auth.users` UUID and one `legal_name`.
--
-- That measurement falsified `docs/Context/2026-07-27-auth-structure-scale-audit.md`
-- ("`auth.uid()` alone grants zero rows anywhere" — struck there, with this as the
-- receipt). The tell is in the same bullet: it audited the 25 SCOPED select policies
-- and never counted the unscoped one.
--
-- The fix is the same shape as the anon one and for the same reason: grants compose
-- with RLS (both must pass), so narrowing the grant needs no policy change and no
-- new predicate. The list is IDENTICAL to anon's, because it is the same seam —
-- verified against every authenticated `gym` read in the repo:
--
--   getOperatorGym            timezone, slug, brand_name
--   resolverMiembroGym        id, slug, timezone, brand_name   (embedded FK join)
--   clase-miembro's twin      id, slug, timezone               (embedded FK join)
--   marketing.ts              id, brand_name, timezone, about_*  (anon client, but
--                                                                 signed-in visitors
--                                                                 hit the same page)
--   resolveTenant             id, slug, brand_module_id
--   brand seam (next)         token_overrides
--
-- Nothing anywhere reads `legal_name` or `owner_user_id` — a repo-wide grep returns
-- only this migration family and the suite. `created_at` (the gym's onboarding order)
-- is read nowhere either. `service_role` is untouched: it holds its own grants and is
-- how the send-email hook and the migration role read whatever they need.
--
-- Deliberately NOT changed: `gym_anon_select` stays `using (true)`. The pre-auth
-- host->brand lookup runs before any session exists and genuinely needs it
-- (ADR-0012/ADR-0013 §3). The exposure was the GRANT, not the policy.

revoke select on table public.gym from authenticated;
grant select (id, slug, brand_name, timezone, brand_module_id, token_overrides,
              about_story, about_pull_quote, about_tagline)
  on public.gym to authenticated;
