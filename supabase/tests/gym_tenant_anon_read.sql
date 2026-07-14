-- Anon-read / write-denial test for the tenant spine (gym + gym_domain), slice #18.
--
-- These two tables are the ONE pre-auth anon-read surface in Phase 3 (ADR-0013 §3): the proxy
-- resolves host → gym BEFORE any session exists, and hostnames are public DNS facts, so `anon`
-- must SELECT both. Every write, by contrast, must be denied to anon AND to a non-staff
-- authenticated caller — Phase 3 adds NO write policy to either table (rows are seeded by the
-- migration, which runs as the migration role and bypasses RLS). This proves both halves.
--
-- Since 20260713190100 (D3): anon's `gym` read is COLUMN-granted — the brand-seam columns only.
-- The anon block additionally proves the granted list still serves the pre-auth lookup and that
-- `legal_name`/`owner_user_id` raise 42501 for anon. (`authenticated` keeps the table-wide grant.)
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

-- ── 2) As anon: reads allowed, every write denied ─────────────────────────────
set local role anon;

do $$
declare
  n int;
begin
  -- READ: anon sees the seeded rows (>= 2 gyms, >= 5 domains)
  select count(*) into n from public.gym;
  if n < 2 then raise exception 'READ FAIL: anon sees % gym rows (expected >= 2)', n; end if;
  select count(*) into n from public.gym_domain;
  if n < 5 then raise exception 'READ FAIL: anon sees % gym_domain rows (expected >= 5)', n; end if;

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
  select count(*) into n from public.gym_domain;
  if n < 5 then raise exception 'READ FAIL: authenticated non-staff sees % gym_domain rows (expected >= 5)', n; end if;

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
