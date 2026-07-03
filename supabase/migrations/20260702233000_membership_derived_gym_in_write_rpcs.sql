-- C1 fix — membership-derived gym in the three staff write RPCs (post-Phase-3 pre-cutover review).
--
-- registrar_venta (NEW-cliente path), crear_plantilla, and sembrar_plantillas_default derived the gym as
-- `(select id from public.gym where slug = 'forge')` — a single-gym shortcut. Live now has two data-bearing
-- gyms, so a NON-forge operator's NEW-cliente registration mis-stamps the cliente + venta INTO forge and
-- draws forge's folio; post-cutover (legacy per-auth.uid policies dropped) the same shortcut becomes a
-- lockout for every non-forge gym. Fix: derive the caller's gym from gym_membership (ADR-0013), never a slug.
--
-- One new helper `public.staff_gym()` resolves the caller's gym from public.gym_membership, restricted to
-- staff roles (owner|operator) — exactly the is_staff_of set — because all three call sites are staff write
-- paths. House posture is ADR-0013 §1, byte-identical to is_member_of/is_staff_of/has_role: language sql,
-- stable, security definer, search_path='', EXECUTE revoked from public+anon and granted to authenticated.
-- security definer is REQUIRED (not incidental): gym_membership carries RLS, so an invoker-rights read would
-- recurse into its own policies; definer reads membership with RLS bypassed. auth.uid() is wrapped in the
-- ADR-0001 initplan sub-select and every object is schema-qualified for search_path=''. `limit 1` mirrors the
-- getOperatorGym DAL reader: one-membership-per-login is the current platform invariant, one row expected.
--
-- Idempotent: create-or-replace throughout. The three RPC bodies are byte-identical to their live/tree
-- definitions except the single gym-derivation expression; each stays SECURITY INVOKER + search_path=''
-- (ADR-0005) — only the helper it now calls is SECURITY DEFINER. Additive on live (create function + create
-- or replace function); the new helper adds one accepted 0029 definer-in-search-path advisor WARN, the same
-- class already accepted for the three existing helpers.

-- ── The staff-gym helper (ADR-0013 §1 posture; resolves caller -> gym via gym_membership) ─────
create or replace function public.staff_gym()
  returns uuid language sql stable security definer set search_path = ''
  as $$
    select gym_id from public.gym_membership
    where user_id = (select auth.uid())
      and role in ('owner', 'operator')
    limit 1;
  $$;

-- EXECUTE lockdown (ADR-0013 §1; mirrors the three existing helpers): revoke the `public` default + `anon`,
-- grant only `authenticated`.
revoke execute on function public.staff_gym() from public, anon;
grant execute on function public.staff_gym() to authenticated;

-- ── registrar_venta: NEW-cliente path derives gym from membership, not the forge slug ─────────
-- Same signature → CREATE OR REPLACE preserves the existing EXECUTE grants. Body byte-identical to the
-- S5 (per-gym folio) version except v_gym in the NEW-cliente branch; the EXISTING-cliente branch keeps
-- inheriting the cliente's gym (unchanged), and the folio is still drawn from that gym's counter.
create or replace function public.registrar_venta(
  p_nombre text,
  p_tel text,
  p_paquete_nombre text,
  p_vigencia_tipo text,
  p_monto integer,
  p_metodo text,
  p_cliente_id uuid default null,
  p_clases_restantes integer default null,
  p_vence date default null,
  p_clases integer default null,
  p_vigencia_dias integer default null
)
 returns table(folio bigint, cliente_id uuid)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_cliente uuid;
  v_gym uuid;
  v_folio bigint;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_cliente_id is null then
    v_gym := public.staff_gym();
    insert into public.clientes (user_id, nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values (v_uid, p_nombre, p_tel, p_clases_restantes, p_vence, p_paquete_nombre, v_gym)
    returning id into v_cliente;
  else
    update public.clientes
       set clases_restantes = p_clases_restantes,
           vence = p_vence,
           paquete_nombre = p_paquete_nombre
     where id = p_cliente_id;          -- RLS scopes this to the owner
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
    v_cliente := p_cliente_id;
    select gym_id into v_gym from public.clientes where id = p_cliente_id;  -- venta inherits the cliente's gym
  end if;

  -- Per-gym folio, drawn + incremented atomically inside this transaction (row-locked; see next_folio).
  v_folio := public.next_folio(v_gym);
  insert into public.ventas (user_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, gym_id)
  values (v_uid, v_cliente, v_folio, p_paquete_nombre, p_clases, p_vigencia_tipo, p_vigencia_dias, p_monto, p_metodo, v_gym);

  return query select v_folio, v_cliente;
end;
$function$;

-- ── crear_plantilla: gym derived from membership, not the forge slug ──────────────────────────
create or replace function public.crear_plantilla(p_nombre text, p_body text)
 returns uuid
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if (select count(*) from public.plantillas where user_id = v_uid) >= 4 then
    raise exception 'Máximo 4 plantillas';
  end if;
  insert into public.plantillas (user_id, nombre, body, gym_id)
  values (v_uid, p_nombre, p_body, public.staff_gym())
  returning id into v_id;
  return v_id;
end;
$function$;

-- ── sembrar_plantillas_default: gym derived from membership, not the forge slug ────────────────
create or replace function public.sembrar_plantillas_default()
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_gym uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from public.plantillas where user_id = v_uid) then return; end if; -- idempotent
  v_gym := public.staff_gym();
  insert into public.plantillas (user_id, nombre, body, gym_id) values
    (v_uid, 'Recordatorio', $body$Hola {nombre} 👋

Aún te quedan {clases} de tu paquete (*{paquete}*), vence el {vence}.

¡Te esperamos en el bootcamp! 💪🔥
— {negocio}$body$, v_gym),
    (v_uid, 'Recibo', $body$Hola {nombre} 👋

¡Gracias por tu compra en {negocio}! Tu paquete *{paquete}* queda activo hasta el {vence}.

Nos vemos en el bootcamp. 💪🔥$body$, v_gym),
    (v_uid, 'Renovación', $body$Hola {nombre}, soy del coach de {negocio}.

Tu paquete vence en {dias} — ¿lo renovamos? 🔥

📦 *Paquetes disponibles:*
{precios}

Avísame cuál te conviene y te lo apartamos. 💪$body$, v_gym),
    (v_uid, 'Última llamada', $body$Hola {nombre} 👋

Te aviso que solo te queda *1 clase* de tu paquete y vence el {vence}.

Si quieres seguir entrenando con nosotros, renovamos después de la próxima clase. 💪
— {negocio}$body$, v_gym);
end;
$function$;
