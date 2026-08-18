-- gym.brand_module_id CHECK — registry-coupled module ids (#273; migration
-- 20260817120000_constrain_gym_brand_module_id.sql).
--
-- Proves the constraint's both arms, not just that the DDL parsed:
--   1) a bogus module id is REJECTED (23514 check_violation) on INSERT;
--   2) a bogus module id is REJECTED on UPDATE of a compliant row;
--   3) every registry id ('base', 'forge', 'red' — packages/brand/src/registry.ts)
--      is ACCEPTED. The id list here is the same deliberate registry↔constraint
--      coupling the migration documents: a future brand module's migration extends
--      the CHECK and adds its id to vector (3).
--
-- Zero hardcoded prod UUIDs (ADR-0013 §5): rows minted with gen_random_uuid().
-- Transaction-local (BEGIN/ROLLBACK) so a scratch project is REUSABLE. No role
-- switches: a CHECK constraint binds regardless of RLS — this suite tests the
-- SCHEMA, not an RPC.
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF
-- override) — wired into SUITE — or ad hoc via MCP execute_sql against scratch.

begin;

do $$
declare
  v_gym uuid := gen_random_uuid();
  v_id  text;
begin
  -- ── (1) bogus id rejected on INSERT ────────────────────────────────────────────
  begin
    insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
      values (gen_random_uuid(), 'brand-check-bogus', 'Brand Check Bogus',
              'America/Mexico_City', 'no-such-brand');
    raise exception '(1) FAIL: INSERT with a bogus brand_module_id was accepted';
  exception when check_violation then null;   -- expected 23514
  end;

  -- ── (2) bogus id rejected on UPDATE of a compliant row ─────────────────────────
  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (v_gym, 'brand-check-suite', 'Brand Check Suite',
            'America/Mexico_City', 'base');
  begin
    update public.gym set brand_module_id = 'no-such-brand' where id = v_gym;
    raise exception '(2) FAIL: UPDATE to a bogus brand_module_id was accepted';
  exception when check_violation then null;   -- expected 23514
  end;

  -- ── (3) every registry id accepted ─────────────────────────────────────────────
  foreach v_id in array array['base', 'forge', 'red'] loop
    update public.gym set brand_module_id = v_id where id = v_gym;
  end loop;
end $$;

select 'gym brand_module_id check suite: OK' as result;
rollback;
