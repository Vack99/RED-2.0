-- registrar_venta captures the member-claim join key (email) — Defect A. Adding p_email changes the arg
-- signature (a new overload), so DROP the exact 11-arg live signature and CREATE the 12-arg version, then
-- re-issue EXECUTE grants (grants do not survive DROP). Body identical to the live Contract-B definition
-- (20260705082018) except the NEW-cliente INSERT now stores clientes.email = p_email. SECURITY INVOKER,
-- search_path='' preserved. p_email is nullable (DEFAULT NULL) so cash-only walk-ins and Forge stay green.
-- Note: PostgREST resolves named-arg calls that omit p_email to this single overload, so old app code calling
-- the 11 named args keeps working once this migration is applied. IMPORTANT: apply this migration to live
-- BEFORE the app deploys — the reverse (new app code forwarding p_email against the still-11-arg live
-- function) fails new-client-with-email sales with PGRST202.
drop function if exists public.registrar_venta(text, text, text, text, integer, text, uuid, integer, date, integer, integer);

create function public.registrar_venta(
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
  p_vigencia_dias integer default null,
  p_email text default null
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
    insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, email)
    values (p_nombre, p_tel, p_clases_restantes, p_vence, p_paquete_nombre, v_gym, p_email)
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

  v_folio := public.next_folio(v_gym);
  insert into public.ventas (cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, gym_id)
  values (v_cliente, v_folio, p_paquete_nombre, p_clases, p_vigencia_tipo, p_vigencia_dias, p_monto, p_metodo, v_gym);

  return query select v_folio, v_cliente;
end;
$function$;

-- EXECUTE lockdown (grants do not survive DROP): revoke the CREATE default + anon, grant authenticated.
revoke execute on function public.registrar_venta(text, text, text, text, integer, text, uuid, integer, date, integer, integer, text) from public, anon;
grant execute on function public.registrar_venta(text, text, text, text, integer, text, uuid, integer, date, integer, integer, text) to authenticated;
