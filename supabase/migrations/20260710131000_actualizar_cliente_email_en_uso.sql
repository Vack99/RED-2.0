-- Friendly unique-violation on the ficha email editor — fast-follow #82.2.
--
-- The email arm of actualizar_cliente (20260708220000) writes `email = coalesce(p_email, email)`,
-- which can collide with clientes_email_gym_uq when another row in the gym already holds p_email.
-- Un-caught, that surfaced as a raw 23505 and the ficha showed the generic "No se pudo actualizar
-- el cliente". Mirror registrar_venta's C7 guard (20260710121000:148-157): catch unique_violation
-- and RAISE the exact human message the TS write path matches (EMAIL_EN_USO_MSG), so the operator
-- sees the same actionable Spanish as the vender path.
--
-- CREATE OR REPLACE (no signature change) — grants are preserved, so 20260710130000's anon revoke
-- stays intact. Body is byte-for-byte 20260708220000's actualizar_cliente except the UPDATE is now
-- wrapped in a begin/exception block. FOUND is still set by the UPDATE and readable after the block,
-- so the 'Cliente no encontrado' check is unchanged.
create or replace function public.actualizar_cliente(
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

  -- The email backfill can collide with clientes_email_gym_uq (another row in this gym already holds
  -- p_email): surface the human message the TS write path matches (EMAIL_EN_USO_MSG), not a raw 23505.
  -- Mirrors registrar_venta's C7 guard; the whole edit rolls back.
  begin
    update public.clientes
       set nombre = p_nombre,
           tel    = p_tel,
           email  = coalesce(p_email, email)
     where id = p_cliente_id;          -- RLS scopes this to the owner
  exception when unique_violation then
    raise exception 'Este correo ya pertenece a otro registro de este gym';
  end;

  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  email_changed := p_email is not null and p_email is distinct from v_before_email;
  unclaimed     := v_auth_user_id is null;
  return next;
end;
$function$;
