-- RECOVERED 2026-08-27 from prod supabase_migrations.schema_migrations after the registrar_venta overload outage — the file was never committed to this repo.
-- Applied to prod 2026-08-25 from the mobile lane as version 20260825151556 (crear_plantilla_gym_target); body verified byte-identical to the applied statements (whitespace-normalized md5).

-- crear_plantilla grows an EXPLICIT gym target — the multi-gym operator's template landed on the
-- wrong gym. Routed finding from the mobile lane (apps/mobile/src/data/mensajes.ts, mobile HANDOFF).
--
-- ── The defect ─────────────────────────────────────────────────────────────────────────────────────
-- The body stamps `gym_id` from `public.staff_gym()`, whose whole definition is
--
--     select gym_id from public.gym_membership
--      where user_id = (select auth.uid()) and role in ('owner','operator')
--      order by gym_id limit 1
--
-- — the LOWEST gym_id the caller staffs. That `limit 1` was correct while one-membership-per-login was
-- the platform invariant (20260702233000 says so in as many words). It is no longer: #219 shipped the
-- two-membership actor, and #212 made the ADMIN app host-aware — `getOperatorGym` resolves the gym the
-- HOST names and falls back to the first only when the host names none. So a two-gym operator writing a
-- template while working gym B silently files it under gym A, and then cannot see it from B (RLS scopes
-- the list to the gym in effect). Nothing raises; the row is simply in the wrong tenant.
--
-- This is the same class of bug as [[multigym-rpc-roulette]] — an RPC picking a membership row with no
-- gym filter — seen on a write path instead of a read.
--
-- ── The fix: an OPTIONAL target, verified, never trusted ────────────────────────────────────────────
-- `p_gym_id uuid default null`:
--
--   • provided → the caller must be staff of THAT gym (`public.is_staff_of`, the same owner|operator
--     predicate `staff_gym()` itself filters on). Not staff → `raise exception 'No autorizado'`, and the
--     RAISE aborts before the cap read and before the INSERT, so an unauthorized target writes NOTHING.
--     The argument is a SCOPE SELECTOR, not a boundary: `crear_plantilla` stays SECURITY INVOKER, so
--     `plantillas`' RLS insert policy remains the hard tenant boundary underneath (ADR-0001/ADR-0005) —
--     the check exists so the caller gets a clean refusal instead of an RLS violation, and so the DAL's
--     host-resolved gym can be honoured at all.
--   • omitted → `staff_gym()`, byte-for-byte the legacy stamping. Every existing 2-arg call site keeps
--     working unchanged: PostgREST resolves a `{p_nombre, p_body}` payload against the defaulted 3-arg
--     signature. apps/mobile deliberately still calls that arm (routed back to the mobile lane); the
--     two suites that fire the 2-arg form (contract_a_denials, rls_cross_tenant_denial) are untouched.
--
-- DROP-then-CREATE rather than `create or replace`: a default-bearing 3-arg overload sitting beside the
-- live 2-arg function would make `crear_plantilla('x','y')` ambiguous. One signature, one function —
-- the `editar_venta` precedent (20260815120000).
--
-- The gym is now resolved ONCE into `v_gym` and used by both the cap read and the INSERT (the old body
-- called `staff_gym()` twice). `staff_gym()` is `stable`, so on the null arm that is a no-op, and it
-- makes the cap read and the write provably agree on one gym on both arms. Everything else — the
-- `v_uid` presence guard, the per-gym cap of 4 and its exact message, `set search_path to ''`,
-- SECURITY INVOKER — is unchanged from 20260705082018.
--
-- Idempotent and additive on live: drop-if-exists + create, then the same least-privilege
-- revoke/grant pair the function has carried since 20260602130100, restated for the new signature
-- (CREATE FUNCTION grants EXECUTE to public by default, and the 2-arg grants die with the 2-arg
-- function). Written-row coverage: supabase/tests/plantillas_rules.sql V7/V8/V9.

drop function if exists public.crear_plantilla(text, text);

create or replace function public.crear_plantilla(p_nombre text, p_body text, p_gym_id uuid default null)
 returns uuid
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_gym uuid;
  v_id  uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;

  if (select count(*) from public.plantillas where gym_id = v_gym) >= 4 then
    raise exception 'Máximo 4 plantillas';
  end if;
  insert into public.plantillas (nombre, body, gym_id)
  values (p_nombre, p_body, v_gym)
  returning id into v_id;
  return v_id;
end;
$function$;

-- Least privilege, restated for the new signature (the 2-arg grants died with the 2-arg function):
-- CREATE FUNCTION grants EXECUTE to public by default; revoke from public + anon, grant to authenticated.
revoke execute on function public.crear_plantilla(text, text, uuid) from public, anon;
grant  execute on function public.crear_plantilla(text, text, uuid) to authenticated;
