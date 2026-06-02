-- actualizar_cliente: edit a client's identity (nombre + tel) from the profile.
--
-- Thin write seam (ADR-0005): this RPC performs ONLY the single-row UPDATE of the two identity
-- columns. It deliberately never touches the saldo columns (clases_restantes / vence /
-- paquete_nombre) -- those are owned by registrar_venta and toggle_pase. SECURITY INVOKER (the
-- default) so the clientes_update_own RLS policy still scopes the write to the calling operator;
-- `SET search_path TO ''` keeps it injection-safe and clears the function_search_path_mutable
-- advisor. nombre NOT NULL and the clientes_tel_10_digits_ck CHECK are enforced by the table.
-- Guards mirror registrar_venta: 'No autenticado' when unauthenticated, 'Cliente no encontrado'
-- when the RLS-scoped UPDATE matches no row.

create or replace function public.actualizar_cliente(p_cliente_id uuid, p_nombre text, p_tel text)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  update public.clientes
     set nombre = p_nombre,
         tel    = p_tel
   where id = p_cliente_id;          -- RLS scopes this to the owner

  if not found then
    raise exception 'Cliente no encontrado';
  end if;
end;
$function$;

-- Restrict EXECUTE to authenticated operators (CREATE FUNCTION grants EXECUTE to public by default).
revoke execute on function public.actualizar_cliente(uuid, text, text) from public;
grant  execute on function public.actualizar_cliente(uuid, text, text) to authenticated;
