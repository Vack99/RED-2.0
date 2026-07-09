-- actualizar_cliente gains an optional email arm — slice S3 (issue #71; ADR-0015 · design 2026-07-08 §3/§4).
-- The backfill half of the invite rail: an operator can now add/correct a member's email from the ficha,
-- which is how the ~31 legacy emailless rows become invitable with zero DB surgery.
--
-- SIGNATURE: p_email is nullable, DEFAULT NULL = "leave the stored email unchanged" (mirrors registrar_venta's
-- p_email posture). There is no explicit "clear the email" arm this slice (not asked for; the DAL never sends
-- an empty string — it coerces blank input to "omit the key" at the zod edge, so '' never reaches this RPC).
-- Adding an arg changes the signature, so — like the registrar_venta precedent (20260707031000) — DROP the
-- exact 3-arg live signature and CREATE the 4-arg version, then re-issue grants (grants do not survive DROP).
--
-- RETURN CHANGE: was `void`, now `table(email_changed boolean, unclaimed boolean)`. The DAL needs to know,
-- from THIS single round trip, whether to fire the auto-invite (design §3: "saving a new/changed email on an
-- unclaimed row triggers the auto-invite") — so the RPC itself reads the pre-write email/auth_user_id and
-- reports the two facts the caller needs, instead of a separate pre-read query. `email_changed` is true only
-- when p_email was actually supplied AND differs from what was stored; `unclaimed` mirrors auth_user_id IS
-- NULL at read time. Every other existing caller only `perform`s the RPC and discards the result, so widening
-- the return is not a breaking Contract-A/B change (the shape gate is a new-and-optional read, not a rename).
--
-- CLAIMED-ROW GUARD (defense in depth): email is contact info owned by the login for a CLAIMED row
-- (auth_user_id IS NOT NULL) — the verified email always wins on claim (ADR-0015 D5) and the DAL edge hides
-- the email field for claimed rows, but the RPC also refuses an email CHANGE against a claimed row server-side
-- (matches the "SQL-level guard on auth_user_id IS NOT NULL rows rejecting email change" requirement). A
-- claimed row's nombre/tel stay editable exactly as before (p_email omitted -> no guard, no-op on email).
drop function if exists public.actualizar_cliente(uuid, text, text);

create function public.actualizar_cliente(
  p_cliente_id uuid,
  p_nombre     text,
  p_tel        text,
  p_email      text default null
)
 returns table(email_changed boolean, unclaimed boolean)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid         uuid := (select auth.uid());
  v_before_email text;
  v_auth_user_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- RLS-scoped read (clientes_staff_select): same authority the UPDATE below relies on, so this SELECT
  -- sees nothing an unauthorized caller couldn't already see. A caller with no visibility gets NULLs here
  -- and 0 rows on the UPDATE below -> 'Cliente no encontrado', same as before this migration.
  select c.email, c.auth_user_id into v_before_email, v_auth_user_id
    from public.clientes c where c.id = p_cliente_id;

  if p_email is not null and v_auth_user_id is not null then
    raise exception 'No se puede editar el correo de una cuenta activa';
  end if;

  update public.clientes
     set nombre = p_nombre,
         tel    = p_tel,
         email  = coalesce(p_email, email)
   where id = p_cliente_id;          -- RLS scopes this to the owner

  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  email_changed := p_email is not null and p_email is distinct from v_before_email;
  unclaimed     := v_auth_user_id is null;
  return next;
end;
$function$;

-- Restrict EXECUTE to authenticated operators (CREATE FUNCTION grants EXECUTE to public by default;
-- grants do not survive the DROP above).
revoke execute on function public.actualizar_cliente(uuid, text, text, text) from public;
grant  execute on function public.actualizar_cliente(uuid, text, text, text) to authenticated;

-- preparar_invitacion gains the SAME claimed-row guard (issue #71 AC: "claimed rows offer no invite
-- action"). Without this, REENVIAR called against an already-claimed row would lazily mint a FRESH
-- claim_code on it; opening that link would let `reclamar_por_codigo` re-stamp auth_user_id and OVERWRITE
-- the row's verified email — a real account-hijack path, not just a UI nicety. The UI never renders REENVIAR
-- for `cuenta_activa` (S3), but the RPC is the enforcement boundary, not the button. Signature and every
-- other line are UNCHANGED from 20260708210000 (idempotent create-or-replace) — grants are untouched by a
-- same-signature replace, so no re-grant is needed here.
create or replace function public.preparar_invitacion(p_cliente_id uuid)
  returns table (codigo text, email text, nombre text, gym_slug text, gym_nombre text, gym_id uuid)
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_gym    uuid;
  v_email  text;
  v_nombre text;
  v_code   text;
  v_auth   uuid;
  v_bytes  bytea;
  i        int;
  v_alpha  constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';  -- 34 symbols (A-Z, 2-9)
begin
  if (select auth.uid()) is null then
    raise exception 'No autenticado';
  end if;

  select c.gym_id, c.email, c.nombre, c.claim_code, c.auth_user_id
    into v_gym, v_email, v_nombre, v_code, v_auth
    from public.clientes c where c.id = p_cliente_id;
  if v_gym is null then
    raise exception 'Cliente no encontrado';
  end if;

  if not public.is_staff_of(v_gym) then
    raise exception 'No autorizado';
  end if;

  if v_auth is not null then
    raise exception 'La cuenta ya está activa';
  end if;

  if v_code is null then
    loop
      v_code := '';
      v_bytes := extensions.gen_random_bytes(8);
      for i in 0..7 loop
        v_code := v_code || substr(v_alpha, (get_byte(v_bytes, i) % 34) + 1, 1);
      end loop;
      begin
        update public.clientes set claim_code = v_code where id = p_cliente_id;
        exit;
      exception when unique_violation then
        -- claim_code already exists → regenerate and retry
      end;
    end loop;
  end if;

  return query
    select v_code, v_email, v_nombre, g.slug, g.brand_name, v_gym
      from public.gym g where g.id = v_gym;
end;
$function$;
