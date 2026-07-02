-- actualizar_paquete RPC-rule test (ADR-0005 contract-honesty item).
--
-- The STACKING / FORFEIT / VIGENCIA math lives in the tested TS domain, but three write-rules live
-- inside the actualizar_paquete RPC because they are inseparable from the atomic edit transaction.
-- This artifact is their committed test home, run against the REAL deployed function:
--   (a) single-favorite — promoting ONE package to popular DEMOTES the others, atomically, before the
--       partial unique index paquetes_one_popular can ever be violated by a legitimate edit.
--   (b) derived nombre — the display name is DERIVED in-DB from clases, mirroring
--       src/domain/rules.ts nombrePaquete (tested-TS spec): clases=3 -> '3 clases', clases=1 -> '1 clase',
--       omitted/NULL -> 'Ilimitado'. Label and grant can never drift.
--   (c) clases write — the editable class grant is actually persisted onto the row.
--
-- Self-asserting: every check RAISEs 'RULE FAIL: ...' on a mismatch, so a clean run returns one 'OK'
-- row and any failure aborts. Wrapped in BEGIN/ROLLBACK — touches no row permanently, re-runnable.
--
-- ISOLATION: the RPC DERIVES & overwrites `nombre` (unique per operator via paquetes_nombre_uq) and
-- enforces one-popular-per-operator (paquetes_one_popular). So seeds that share the operator's
-- namespace WOULD collide with the operator's real catalog (a real popular row; a real 'Ilimitado').
-- We therefore clear the operator's catalog FOR THE DURATION OF THIS ROLLED-BACK TRANSACTION, as the
-- RLS-bypassing connection role (service_role via the Supabase MCP, or the DATABASE_URL owner via
-- psql) — BEFORE switching to `authenticated`. The ROLLBACK restores the real catalog untouched.
--
-- HOW TO RUN (no local Docker here, so not wired into `supabase test db` / pgTAP):
--   - via the Supabase MCP execute_sql (pure SQL — no psql meta-commands), or
--   - psql "$DATABASE_URL" -f supabase/tests/actualizar_paquete_rules.sql
--
-- PORTING TO ANOTHER ENV: nothing is hardcoded. The operator uid is read at runtime from the first
-- perfil row (perfil.user_id is an auth.users id). To point at a specific operator, replace the
-- `set_config('app.op', ...)` source below with that operator's auth uid literal.

begin;

-- ── Resolve the operator at runtime (the only env-dependent value) ───────────
-- perfil.user_id is a real auth.users id; actualizar_paquete keys every write to auth.uid(), and RLS
-- scopes paquetes to it — so the seed, the RPC, and the assertions must all run as this operator.
select set_config(
  'app.op',
  (select user_id::text from public.perfil order by created_at limit 1),
  true
);

-- ── Clean-slate isolation (runs as the RLS-bypassing connection role, BEFORE the role switch) ──
-- Park the operator's real catalog out of the way so the seeds own a collision-free namespace under
-- paquetes_nombre_uq / paquetes_one_popular. Rolled back at the end → the real catalog is untouched.
delete from public.paquetes where user_id = current_setting('app.op', true)::uuid;

-- ── Act as that authenticated operator ───────────────────────────────────────
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('app.op', true), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $$
declare
  v_op       uuid := current_setting('app.op', true)::uuid;
  v_gym      uuid := (select id from public.gym where slug = 'forge');  -- gym_id NOT NULL since slice #20
  v_a        uuid;   -- seeded package A (starts popular)
  v_b        uuid;   -- seeded package B (starts not popular)
  v_c        uuid;   -- seeded package C (starts not popular)
  v_nombre   text;
  v_clases   int;
  v_popular  boolean;
  v_count    int;
begin
  -- ── Seed: three packages owned by the operator, on the now-empty catalog. A starts popular so we
  --    can prove the demote on promoting B. Names are placeholders; the RPC overwrites them on edit.
  insert into public.paquetes (user_id, nombre, clases, vigencia_tipo, vigencia_dias, precio, popular, orden, gym_id)
  values (v_op, 'TEST_A seed', 8,  'dias', 20, 500, true,  90, v_gym)
  returning id into v_a;

  insert into public.paquetes (user_id, nombre, clases, vigencia_tipo, vigencia_dias, precio, popular, orden, gym_id)
  values (v_op, 'TEST_B seed', 12, 'dias', 25, 700, false, 91, v_gym)
  returning id into v_b;

  insert into public.paquetes (user_id, nombre, clases, vigencia_tipo, vigencia_dias, precio, popular, orden, gym_id)
  values (v_op, 'TEST_C seed', 4,  'dias', 15, 300, false, 92, v_gym)
  returning id into v_c;

  -- ════════════════════════════════════════════════════════════════════════
  -- (a) single-favorite — promoting B to popular DEMOTES the others
  -- ════════════════════════════════════════════════════════════════════════
  perform public.actualizar_paquete(v_b, 750, true, 3);

  -- exactly ONE of our three seeds is popular afterwards, and it is B
  select count(*) into v_count from public.paquetes where id in (v_a, v_b, v_c) and popular;
  if v_count <> 1 then raise exception 'RULE FAIL(a): expected exactly 1 popular among seeds, got %', v_count; end if;

  select popular into v_popular from public.paquetes where id = v_b;
  if v_popular is not true then raise exception 'RULE FAIL(a): promoted package B is not popular'; end if;

  select popular into v_popular from public.paquetes where id = v_a;
  if v_popular is not false then raise exception 'RULE FAIL(a): sibling A was not demoted'; end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- (b) derived nombre  +  (c) clases write
  -- ════════════════════════════════════════════════════════════════════════

  -- clases = 3 -> nombre '3 clases', and clases column actually written as 3
  -- (the B edit above already passed p_clases = 3)
  select nombre, clases into v_nombre, v_clases from public.paquetes where id = v_b;
  if v_nombre <> '3 clases' then raise exception 'RULE FAIL(b): clases=3 expected nombre ''3 clases'', got %', v_nombre; end if;
  if v_clases is distinct from 3 then raise exception 'RULE FAIL(c): clases=3 not persisted, got %', v_clases; end if;

  -- clases = 1 -> singular nombre '1 clase', and clases column written as 1
  perform public.actualizar_paquete(v_c, 300, false, 1);
  select nombre, clases into v_nombre, v_clases from public.paquetes where id = v_c;
  if v_nombre <> '1 clase' then raise exception 'RULE FAIL(b): clases=1 expected singular ''1 clase'', got %', v_nombre; end if;
  if v_clases is distinct from 1 then raise exception 'RULE FAIL(c): clases=1 not persisted, got %', v_clases; end if;

  -- clases OMITTED (the RPC's DEFAULT NULL = ilimitado) -> nombre 'Ilimitado', clases column NULL
  perform public.actualizar_paquete(v_a, 900, false);
  select nombre, clases into v_nombre, v_clases from public.paquetes where id = v_a;
  if v_nombre <> 'Ilimitado' then raise exception 'RULE FAIL(b): omitted clases expected ''Ilimitado'', got %', v_nombre; end if;
  if v_clases is not null then raise exception 'RULE FAIL(c): omitted clases expected NULL (ilimitado), got %', v_clases; end if;

  raise notice 'actualizar_paquete rules: (a) single-favorite, (b) derived nombre, (c) clases write all hold';
end $$;

select 'actualizar_paquete rules: OK' as result;
rollback;
