-- favorite-class-type rules (slice #59; PRD #49 S3 "Member profile fields" — the goal's NAMED single-column
-- exception; ADR-0005 atomic self-scoped seam; ADR-0013 member-owned write posture).
--
-- The member row gains ONE nullable column, favorite_class_type_id, moved ONLY through the self-scoped
-- SECURITY DEFINER toggle_favorito_tipo — because a member holds NO direct UPDATE policy on clientes (the
-- entitlement/identity columns are staff-write; contract_b left members select-only on their own row). The
-- heart on the clase-detail page is the one write path. Run against the REAL deployed function on a scratch
-- project in a rolled-back transaction:
--   * set        — toggling an unset favorite writes the class-type id; RPC returns it.
--   * clear      — toggling the SAME id again clears it back to NULL (the on/off heart).
--   * switch     — toggling a DIFFERENT id replaces (never a second favorite; one column, one value).
--   * persist    — after a set, a plain re-SELECT of the row still reads the id (survives the session).
--   * tenant pin — toggling a class-type of ANOTHER gym raises; the caller's favorite is untouched.
--   * member has NO direct write — a member's direct UPDATE of the column changes 0 rows (no update policy).
--   * anon denied — anon cannot EXECUTE the toggle (default grant revoked).
--
-- Self-asserting: every check RAISEs on a mismatch; a clean run returns one 'OK' row. BEGIN/ROLLBACK, so it
-- touches no row permanently. Zero hardcoded prod UUIDs (gyms/users/clientes/class_types seeded local).
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override) — wired into SUITE.

begin;

-- ── Seed (runs as the migration/service role — RLS bypassed) ─────────────────────
do $$
declare
  v_gym  uuid;
  v_gym2 uuid;
  v_cta  uuid;   -- class type A (member's gym)
  v_ctb  uuid;   -- class type B (member's gym)
  v_ctx  uuid;   -- class type in the OTHER gym (tenant-pin target)
  m_self uuid := gen_random_uuid();
  c_self uuid;
begin
  select id into v_gym from public.gym where slug = 'forge';
  if v_gym is null then raise exception 'SEED FAIL: expected the forge gym'; end if;

  -- a transaction-local second gym for the cross-tenant class type
  insert into public.gym (slug, brand_name, timezone, brand_module_id)
    values ('fav-gym2', 'Fav Gym 2', 'America/Mexico_City', 'base') returning id into v_gym2;

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', m_self, 'authenticated', 'authenticated', 'fav-self@test.local');
  insert into public.gym_membership (user_id, gym_id, role) values (m_self, v_gym, 'member');

  insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, auth_user_id)
    values ('Fav Self', '0000000010', 8, current_date + 20, '8 clases', v_gym, m_self) returning id into c_self;

  insert into public.class_type (gym_id, name) values (v_gym,  'Fav Fuerza')    returning id into v_cta;
  insert into public.class_type (gym_id, name) values (v_gym,  'Fav Metcon')    returning id into v_ctb;
  insert into public.class_type (gym_id, name) values (v_gym2, 'Otro Gym Tipo') returning id into v_ctx;

  perform set_config('t.gym',   v_gym::text,  true);
  perform set_config('t.cta',   v_cta::text,  true);
  perform set_config('t.ctb',   v_ctb::text,  true);
  perform set_config('t.ctx',   v_ctx::text,  true);
  perform set_config('t.m_self', m_self::text, true);
  perform set_config('t.c_self', c_self::text, true);
end $$;

-- ════════════════════════════════════════════════════════════════════════════════
-- set → clear → switch → persist, plus tenant pin + no-direct-write, as the member
-- ════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_self', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  cta  uuid := current_setting('t.cta', true)::uuid;
  ctb  uuid := current_setting('t.ctb', true)::uuid;
  ctx  uuid := current_setting('t.ctx', true)::uuid;
  c_self uuid := current_setting('t.c_self', true)::uuid;
  v_ret uuid; v_stored uuid; raised boolean; v_rows int;
begin
  -- set: toggle an unset favorite → writes cta, RPC returns cta
  select favorito into v_ret from public.toggle_favorito_tipo(cta);
  if v_ret is distinct from cta then raise exception 'RULE FAIL(set): RPC returned % (expected cta)', v_ret; end if;
  select favorite_class_type_id into v_stored from public.clientes where id = c_self;
  if v_stored is distinct from cta then raise exception 'RULE FAIL(set): stored % (expected cta)', v_stored; end if;

  -- persist: a plain re-SELECT still reads cta (proves the column survives — "across sessions")
  select favorite_class_type_id into v_stored from public.clientes where id = c_self;
  if v_stored is distinct from cta then raise exception 'RULE FAIL(persist): re-read % (expected cta)', v_stored; end if;

  -- switch: toggling a DIFFERENT id replaces (single favorite, never two)
  select favorito into v_ret from public.toggle_favorito_tipo(ctb);
  if v_ret is distinct from ctb then raise exception 'RULE FAIL(switch): RPC returned % (expected ctb)', v_ret; end if;
  select favorite_class_type_id into v_stored from public.clientes where id = c_self;
  if v_stored is distinct from ctb then raise exception 'RULE FAIL(switch): stored % (expected ctb)', v_stored; end if;

  -- clear: toggling the SAME id (ctb) again clears to NULL (the on/off heart)
  select favorito into v_ret from public.toggle_favorito_tipo(ctb);
  if v_ret is not null then raise exception 'RULE FAIL(clear): RPC returned % (expected NULL)', v_ret; end if;
  select favorite_class_type_id into v_stored from public.clientes where id = c_self;
  if v_stored is not null then raise exception 'RULE FAIL(clear): stored % (expected NULL)', v_stored; end if;

  -- tenant pin: toggling a class type of ANOTHER gym raises; favorite stays NULL
  raised := false;
  begin perform public.toggle_favorito_tipo(ctx); exception when others then raised := true; end;
  if not raised then raise exception 'RULE FAIL(tenant): toggling a cross-gym class type did not raise'; end if;
  select favorite_class_type_id into v_stored from public.clientes where id = c_self;
  if v_stored is not null then raise exception 'RULE FAIL(tenant): favorite moved to % on rejected cross-gym toggle', v_stored; end if;

  -- member holds NO direct write: a direct UPDATE of the column filters to 0 rows (no member update policy)
  update public.clientes set favorite_class_type_id = cta where id = c_self;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'RULE FAIL(nowrite): direct member UPDATE changed % row(s) (expected 0)', v_rows; end if;
end $$;
reset role;

-- ════════════════════════════════════════════════════════════════════════════════
-- anon cannot EXECUTE the toggle (default public/anon grant revoked)
-- ════════════════════════════════════════════════════════════════════════════════
set local role anon;
do $$
declare cta uuid := current_setting('t.cta', true)::uuid; raised boolean := false;
begin
  begin perform public.toggle_favorito_tipo(cta); exception when others then raised := true; end;
  if not raised then raise exception 'RULE FAIL(anon): anon executed toggle_favorito_tipo'; end if;
end $$;
reset role;

select 'favorito rules: OK' as result;
rollback;
