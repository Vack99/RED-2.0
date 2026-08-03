-- Anon-read / write-denial test for the tenant spine (gym + gym_domain), slice #18.
--
-- These two tables are the ONE pre-auth read surface in Phase 3 (ADR-0013 §3): the proxy
-- resolves host → gym BEFORE any session exists. Since #216 that read is SPLIT — anon SELECTs
-- `gym` (column-narrowed) but reaches `gym_domain` only through `gym_id_por_host`, a SECURITY
-- DEFINER projection that answers one hostname and cannot be turned into a scan. Every write,
-- by contrast, must be denied to anon AND to a non-staff
-- authenticated caller — Phase 3 adds NO write policy to either table (rows are seeded by the
-- migration, which runs as the migration role and bypasses RLS). This proves both halves.
--
-- Since 20260713190100 (D3): anon's `gym` read is COLUMN-granted — the brand-seam columns only.
-- The anon block additionally proves the granted list still serves the pre-auth lookup and that
-- `legal_name`/`owner_user_id` raise 42501 for anon.
--
-- Since 20260802120000 (#213): the SAME narrowing now applies to `authenticated`. That role held
-- the table-wide grant until 2026-08-02 — so a membership-less identity read every gym's
-- `legal_name` and `owner_user_id`, which is 4 owner UUIDs today and N at N customers. The
-- authenticated block below is the assertion #213 asks for: an identity with NO `gym_membership`
-- row reads ZERO owner_user_id values, and the brand-seam columns it genuinely needs still work.
--
-- Written BEFORE the create_gym_tenant_spine migration (TDD, denial-test-first): against a fresh
-- preview branch with neither table present it FAILS (the tables don't exist); after the migration
-- it returns one 'OK' row.
--
-- Self-asserting: every check RAISEs on failure; a clean run returns 'gym tenant anon-read: OK'.
-- Wrapped in BEGIN/ROLLBACK — touches no row. Zero hardcoded prod UUIDs (ADR-0013 §5).
--
-- HOW TO RUN (no local Docker here, so not wired into `supabase test db` / pgTAP):
--   - via the Supabase MCP execute_sql (pure SQL — no psql meta-commands), or
--   - psql "$DATABASE_URL" -f supabase/tests/gym_tenant_anon_read.sql

begin;

-- ── 1) RLS is enabled on both tables (checked as the connecting role) ─────────
do $$
declare
  rls_gym boolean;
  rls_dom boolean;
begin
  select relrowsecurity into rls_gym from pg_class where oid = 'public.gym'::regclass;
  select relrowsecurity into rls_dom from pg_class where oid = 'public.gym_domain'::regclass;
  if not rls_gym then raise exception 'DENIAL FAIL: RLS not enabled on public.gym'; end if;
  if not rls_dom then raise exception 'DENIAL FAIL: RLS not enabled on public.gym_domain'; end if;
end $$;

-- Capture a real hostname BEFORE dropping to anon: since #216 anon cannot read the table,
-- so it can no longer find one for itself — which is the point of the change.
select set_config('test.hostname', (select hostname from public.gym_domain order by hostname limit 1), true);

-- ── 2) As anon: reads allowed, every write denied ─────────────────────────────
set local role anon;

do $$
declare
  n int;
  g uuid;
begin
  -- READ: anon sees the seeded gym rows (>= 2)
  select count(*) into n from public.gym;
  if n < 2 then raise exception 'READ FAIL: anon sees % gym rows (expected >= 2)', n; end if;

  -- gym_domain since #216: anon resolves ONE hostname it already knows, through the
  -- SECURITY DEFINER projection…
  select public.gym_id_por_host(current_setting('test.hostname')) into g;
  if g is null then
    raise exception 'READ FAIL: anon could not resolve a known hostname via gym_id_por_host — the pre-auth seam is broken';
  end if;
  if public.gym_id_por_host('nope.example.invalid') is not null then
    raise exception 'READ FAIL: gym_id_por_host answered for an unmapped hostname';
  end if;

  -- …and CANNOT enumerate the table. Grant revoked AND no policy, so either a 42501 or
  -- an empty result is correct; a row count is not.
  begin
    select count(*) into n from public.gym_domain;
    if n <> 0 then
      raise exception 'DENIAL FAIL: anon enumerated % gym_domain rows — the customer census is still public (#216)', n;
    end if;
  exception when insufficient_privilege then null;  -- 42501 = correct
  end;

  -- COLUMN GRANTS (D3, 20260713190100): anon reads exactly the brand-seam columns the pre-auth
  -- host→brand lookup needs (resolveTenant: id/slug/brand_module_id; marketing: brand_name/
  -- timezone/about_*; branding: token_overrides) — this is the "still works" proof the GRANT
  -- change would otherwise break SILENTLY on an unmapped host…
  perform id, slug, brand_name, timezone, brand_module_id, token_overrides,
          about_story, about_pull_quote, about_tagline
    from public.gym;

  -- …and NOT the owner PII: legal_name / owner_user_id must 42501 for anon.
  begin
    perform legal_name from public.gym;
    raise exception 'DENIAL FAIL: anon read gym.legal_name — the column revoke did not hold';
  exception when insufficient_privilege then null;  -- 42501 = correct
  end;
  begin
    perform owner_user_id from public.gym;
    raise exception 'DENIAL FAIL: anon read gym.owner_user_id — the column revoke did not hold';
  exception when insufficient_privilege then null;
  end;

  -- WRITE: INSERT denied (default-deny, no policy → error)
  n := 1;
  begin
    insert into public.gym (slug, brand_name, timezone, brand_module_id)
      values ('anon-hack', 'Hack', 'UTC', 'x');
    n := 0;  -- reached only if the insert was NOT denied
  exception when others then n := -1;  -- error = denied
  end;
  if n <> -1 then raise exception 'DENIAL FAIL: anon INSERT gym was not denied'; end if;

  n := 1;
  begin
    insert into public.gym_domain (gym_id, hostname, app)
      select id, 'anon-hack.example', 'client' from public.gym limit 1;
    n := 0;
  exception when others then n := -1;
  end;
  if n <> -1 then raise exception 'DENIAL FAIL: anon INSERT gym_domain was not denied'; end if;

  -- WRITE: UPDATE / DELETE change 0 rows (no policy → rows invisible; a privilege error also = 0)
  begin
    update public.gym set brand_name = 'HACKED';
    get diagnostics n = row_count;
  exception when others then n := 0;
  end;
  if n <> 0 then raise exception 'DENIAL FAIL: anon UPDATE gym changed % rows', n; end if;

  begin
    update public.gym_domain set hostname = 'hacked.example';
    get diagnostics n = row_count;
  exception when others then n := 0;
  end;
  if n <> 0 then raise exception 'DENIAL FAIL: anon UPDATE gym_domain changed % rows', n; end if;

  begin
    delete from public.gym;
    get diagnostics n = row_count;
  exception when others then n := 0;
  end;
  if n <> 0 then raise exception 'DENIAL FAIL: anon DELETE gym removed % rows', n; end if;

  begin
    delete from public.gym_domain;
    get diagnostics n = row_count;
  exception when others then n := 0;
  end;
  if n <> 0 then raise exception 'DENIAL FAIL: anon DELETE gym_domain removed % rows', n; end if;
end $$;

reset role;

-- ── 3) As a non-staff authenticated caller: reads allowed, every write denied ──
-- No gym_membership exists for this sub (S1 adds memberships); Phase 3 grants authenticated
-- no write policy on either table, so writes are denied exactly as for anon.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $$
declare
  n int;
begin
  select count(*) into n from public.gym;
  if n < 2 then raise exception 'READ FAIL: authenticated non-staff sees % gym rows (expected >= 2)', n; end if;

  -- gym_domain since #216: narrowed from `using (true)` to the caller's OWN gyms. This
  -- actor holds no gym_membership row, so it sees NOTHING — the census was the identical
  -- exposure one role over, and every member holds an authenticated JWT.
  select count(*) into n from public.gym_domain;
  if n <> 0 then
    raise exception 'DENIAL FAIL: authenticated non-member sees % gym_domain rows — expected 0 (#216)', n;
  end if;

  -- COLUMN GRANTS for `authenticated` (#213, 20260802120000). This block's caller is the exact
  -- actor the live probe used: a `sub` with NO gym_membership row anywhere. Before #213 it read
  -- every gym's owner UUID and legal name; the policy (`using (true)`) is unchanged, so ONLY the
  -- grant stands between this identity and that data — which is why it is asserted here.

  -- The brand-seam columns an authenticated session genuinely needs still resolve. This is the
  -- "still works" half: without it, a too-aggressive revoke breaks getOperatorGym /
  -- resolverMiembroGym / the marketing pages SILENTLY, and only in production.
  perform id, slug, brand_name, timezone, brand_module_id, token_overrides,
          about_story, about_pull_quote, about_tagline
    from public.gym;

  -- ZERO owner_user_id values reach a membership-less identity — #213's acceptance, verbatim.
  begin
    perform owner_user_id from public.gym;
    raise exception 'DENIAL FAIL: authenticated non-staff read gym.owner_user_id — #213 did not hold';
  exception when insufficient_privilege then null;  -- 42501 = correct
  end;
  begin
    perform legal_name from public.gym;
    raise exception 'DENIAL FAIL: authenticated non-staff read gym.legal_name — #213 did not hold';
  exception when insufficient_privilege then null;
  end;
  -- created_at is the gym's onboarding order — the same census signal gym_domain leaked (#216).
  begin
    perform created_at from public.gym;
    raise exception 'DENIAL FAIL: authenticated non-staff read gym.created_at — #213 did not hold';
  exception when insufficient_privilege then null;
  end;

  n := 1;
  begin
    insert into public.gym (slug, brand_name, timezone, brand_module_id)
      values ('auth-hack', 'Hack', 'UTC', 'x');
    n := 0;
  exception when others then n := -1;
  end;
  if n <> -1 then raise exception 'DENIAL FAIL: authenticated non-staff INSERT gym was not denied'; end if;

  begin
    update public.gym set brand_name = 'HACKED';
    get diagnostics n = row_count;
  exception when others then n := 0;
  end;
  if n <> 0 then raise exception 'DENIAL FAIL: authenticated non-staff UPDATE gym changed % rows', n; end if;

  begin
    delete from public.gym_domain;
    get diagnostics n = row_count;
  exception when others then n := 0;
  end;
  if n <> 0 then raise exception 'DENIAL FAIL: authenticated non-staff DELETE gym_domain removed % rows', n; end if;

  raise notice 'gym tenant anon-read: reads allowed, all anon/non-staff writes denied';
end $$;

reset role;

select 'gym tenant anon-read: OK' as result;
rollback;
