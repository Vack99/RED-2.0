-- Mirror of migration 20260531211105_atomic_write_rpcs.
--
-- These two RPCs were applied to project hjppxawglmukfvsgmcog via the Supabase MCP
-- (apply_migration) in a prior session but never mirrored into the repo — the live-DB drift
-- recorded as finding #7 in docs/superpowers/audits/2026-05-31-forge-architecture-audit-learnings.md.
-- Reconstructed VERBATIM from pg_get_functiondef on the live DB (2026-06-01); production's
-- migration history already lists version 20260531211105, so on a push/merge this file is treated
-- as already-applied (skipped). On a fresh database (e.g. a preview branch) it provisions the RPCs.
-- A follow-up migration (..._registrar_venta_default_null) redefines registrar_venta with DEFAULT
-- NULL params so the generated TS types let the call site omit the nullable (ilimitado / new-client)
-- arguments without `as any`.
--
-- Thin atomic-write seam (ADR-0005): each function performs ONLY the transaction. The stacking +
-- forfeit math stays in the tested TS domain (src/domain). SECURITY INVOKER (the default) so RLS on
-- clientes / ventas / asistencias still scopes every row to the calling operator; `SET search_path
-- TO ''` keeps the functions injection-safe (every object is schema-qualified) and clears the
-- function_search_path_mutable advisor.

create or replace function public.registrar_venta(p_cliente_id uuid, p_nombre text, p_tel text, p_clases_restantes integer, p_vence date, p_paquete_nombre text, p_clases integer, p_vigencia_tipo text, p_vigencia_dias integer, p_monto integer, p_metodo text)
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

create or replace function public.toggle_pase(p_cliente_id uuid, p_fecha date)
 returns table(present boolean, hora text)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_clases int;
  v_active_id uuid;
  v_active_consumio boolean;
  v_consumio boolean;
  v_hora time;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select clases_restantes into v_clases
    from public.clientes where id = p_cliente_id;   -- RLS-scoped
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  select id, consumio into v_active_id, v_active_consumio
    from public.asistencias
   where cliente_id = p_cliente_id and fecha = p_fecha and deleted_at is null
   order by created_at desc
   limit 1;

  if v_active_id is not null then
    -- toggle OFF
    update public.asistencias set deleted_at = now() where id = v_active_id;
    if v_active_consumio and v_clases is not null then
      update public.clientes set clases_restantes = clases_restantes + 1 where id = p_cliente_id;
    end if;
    return query select false, null::text;
    return;
  end if;

  -- toggle ON
  v_consumio := (v_clases is not null and v_clases > 0);
  v_hora := case
    when p_fecha = (now() at time zone 'America/Chihuahua')::date
      then (now() at time zone 'America/Chihuahua')::time
    else null
  end;

  insert into public.asistencias (user_id, cliente_id, fecha, hora, consumio)
  values (v_uid, p_cliente_id, p_fecha, v_hora, v_consumio);

  if v_consumio then
    update public.clientes set clases_restantes = clases_restantes - 1
     where id = p_cliente_id and clases_restantes > 0;   -- guarded decrement
  end if;

  return query select true, to_char(v_hora, 'HH24:MI');
end;
$function$;

-- Restrict EXECUTE to authenticated operators (CREATE FUNCTION grants EXECUTE to public by default).
revoke execute on function public.registrar_venta(uuid, text, text, integer, date, text, integer, text, integer, integer, text) from public;
revoke execute on function public.toggle_pase(uuid, date) from public;
grant execute on function public.registrar_venta(uuid, text, text, integer, date, text, integer, text, integer, integer, text) to authenticated;
grant execute on function public.toggle_pase(uuid, date) to authenticated;
