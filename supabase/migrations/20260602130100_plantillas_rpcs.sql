-- plantillas write seam (ADR-0005): four SECURITY INVOKER RPCs. crear enforces the cap-of-4
-- atomically (count-then-insert); actualizar/eliminar are owner-scoped single-row writes (RLS is the
-- boundary); sembrar seeds the canonical default set, idempotently. `set search_path to ''` keeps
-- them injection-safe and clears the function_search_path_mutable advisor. Single-operator usage makes
-- the count-then-insert race a non-issue (a partial unique index cannot express "≤ 4").

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
  insert into public.plantillas (user_id, nombre, body)
  values (v_uid, p_nombre, p_body)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.actualizar_plantilla(p_id uuid, p_nombre text, p_body text)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  update public.plantillas set nombre = p_nombre, body = p_body where id = p_id; -- RLS scopes to owner
  if not found then raise exception 'Plantilla no encontrada'; end if;
end;
$function$;

create or replace function public.eliminar_plantilla(p_id uuid)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  delete from public.plantillas where id = p_id; -- RLS scopes to owner
  if not found then raise exception 'Plantilla no encontrada'; end if;
end;
$function$;

create or replace function public.sembrar_plantillas_default()
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from public.plantillas where user_id = v_uid) then return; end if; -- idempotent
  insert into public.plantillas (user_id, nombre, body) values
    (v_uid, 'Recordatorio', $body$Hola {nombre} 👋

Aún te quedan {clases} de tu paquete (*{paquete}*), vence el {vence}.

¡Te esperamos en el bootcamp! 💪🔥
— {negocio}$body$),
    (v_uid, 'Recibo', $body$Hola {nombre} 👋

¡Gracias por tu compra en {negocio}! Tu paquete *{paquete}* queda activo hasta el {vence}.

Nos vemos en el bootcamp. 💪🔥$body$),
    (v_uid, 'Renovación', $body$Hola {nombre}, soy del coach de {negocio}.

Tu paquete vence en {dias} — ¿lo renovamos? 🔥

📦 *Paquetes disponibles:*
{precios}

Avísame cuál te conviene y te lo apartamos. 💪$body$),
    (v_uid, 'Última llamada', $body$Hola {nombre} 👋

Te aviso que solo te queda *1 clase* de tu paquete y vence el {vence}.

Si quieres seguir entrenando con nosotros, renovamos después de la próxima clase. 💪
— {negocio}$body$);
end;
$function$;

-- Least privilege: CREATE FUNCTION grants EXECUTE to public by default; revoke, then grant to authenticated.
revoke execute on function public.crear_plantilla(text, text)              from public;
revoke execute on function public.actualizar_plantilla(uuid, text, text)   from public;
revoke execute on function public.eliminar_plantilla(uuid)                 from public;
revoke execute on function public.sembrar_plantillas_default()             from public;
grant  execute on function public.crear_plantilla(text, text)              to authenticated;
grant  execute on function public.actualizar_plantilla(uuid, text, text)   to authenticated;
grant  execute on function public.eliminar_plantilla(uuid)                 to authenticated;
grant  execute on function public.sembrar_plantillas_default()             to authenticated;
