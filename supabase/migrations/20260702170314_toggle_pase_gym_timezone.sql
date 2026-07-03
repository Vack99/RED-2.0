-- toggle_pase now derives its "is p_fecha today" check from the CLIENTE'S GYM
-- timezone (audit finding 1, PRD #17 named exception), never the hardcoded
-- 'America/Chihuahua' literal. Additive CREATE OR REPLACE — same signature,
-- same RETURNS TABLE, only the two-literal hora-stamp case changes to a
-- gym-derived variable. search_path='' kept (ADR-0013 posture); SECURITY
-- INVOKER unchanged (RLS still the hard boundary on the clientes/asistencias
-- reads/writes inside). The gym's timezone is read INSIDE the RPC from the
-- cliente's own gym_id (server-authoritative — never a p_tz client parameter).
create or replace function public.toggle_pase(p_cliente_id uuid, p_fecha date)
 returns table(present boolean, hora text)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_clases int;
  v_gym uuid;
  v_tz text;
  v_active_id uuid;
  v_active_consumio boolean;
  v_consumio boolean;
  v_hora time;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select clases_restantes, gym_id into v_clases, v_gym
    from public.clientes where id = p_cliente_id;   -- RLS-scoped; asistencia inherits the cliente's gym
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  -- Server-authoritative: the gym's own timezone row, never a client-supplied param.
  select timezone into v_tz from public.gym where id = v_gym;

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
    when p_fecha = (now() at time zone v_tz)::date
      then (now() at time zone v_tz)::time
    else null
  end;

  insert into public.asistencias (user_id, cliente_id, fecha, hora, consumio, gym_id)
  values (v_uid, p_cliente_id, p_fecha, v_hora, v_consumio, v_gym);

  if v_consumio then
    update public.clientes set clases_restantes = clases_restantes - 1
     where id = p_cliente_id and clases_restantes > 0;   -- guarded decrement
  end if;

  return query select true, to_char(v_hora, 'HH24:MI');
end;
$function$;
