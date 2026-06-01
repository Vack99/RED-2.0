-- Redefine registrar_venta so its nullable params (the new-client id + the ilimitado / non-dias
-- values) trail with DEFAULT NULL. The generated TS types then make exactly those keys optional
-- while the six genuinely-required args stay required, so the DAL call site can omit nulls without
-- `as any`. Body + SET search_path TO '' are unchanged from 20260531211105; only the parameter
-- order/defaults change, which requires DROP + CREATE (CREATE OR REPLACE cannot reorder params).
-- toggle_pase is unchanged (its two args are never null). See ADR-0005.

drop function if exists public.registrar_venta(uuid, text, text, integer, date, text, integer, text, integer, integer, text);

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
  p_vigencia_dias integer default null
)
 returns table(folio bigint, cliente_id uuid)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_cliente uuid;
  v_folio bigint;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_cliente_id is null then
    insert into public.clientes (user_id, nombre, tel, clases_restantes, vence, paquete_nombre)
    values (v_uid, p_nombre, p_tel, p_clases_restantes, p_vence, p_paquete_nombre)
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
  end if;

  insert into public.ventas (user_id, cliente_id, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo)
  values (v_uid, v_cliente, p_paquete_nombre, p_clases, p_vigencia_tipo, p_vigencia_dias, p_monto, p_metodo)
  returning public.ventas.folio into v_folio;

  return query select v_folio, v_cliente;
end;
$function$;

-- Lock EXECUTE to authenticated only. The DROP+CREATE re-triggers Supabase's default privileges,
-- which grant EXECUTE to anon + authenticated; revoke anon (and public) so the unauthenticated role
-- cannot reach the money path, matching toggle_pase's grant set (least privilege, ADR-0005).
revoke execute on function public.registrar_venta(text, text, text, text, integer, text, uuid, integer, date, integer, integer) from public, anon;
grant execute on function public.registrar_venta(text, text, text, text, integer, text, uuid, integer, date, integer, integer) to authenticated;
