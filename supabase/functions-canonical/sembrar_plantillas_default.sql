declare
  v_uid uuid := (select auth.uid());
  v_gym uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  
  
  
  
  
  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;
  if v_gym is null then raise exception 'No autorizado'; end if;
  if exists (select 1 from public.plantillas where gym_id = v_gym) then return; end if; 
  insert into public.plantillas (nombre, body, gym_id) values
    ('Recordatorio', $body$Hola {nombre} 👋

Aún te quedan {clases} de tu paquete (*{paquete}*), vence el {vence}.

¡Te esperamos en el bootcamp! 💪🔥
— {negocio}$body$, v_gym),
    ('Recibo', $body$Hola {nombre} 👋

¡Gracias por tu compra en {negocio}! Tu paquete *{paquete}* queda activo hasta el {vence}.

Nos vemos en el bootcamp. 💪🔥$body$, v_gym),
    ('Renovación', $body$Hola {nombre}, soy del coach de {negocio}.

Tu paquete {dias} — ¿lo renovamos? 🔥

📦 *Paquetes disponibles:*
{precios}

Avísame cuál te conviene y te lo apartamos. 💪$body$, v_gym),
    ('Última llamada', $body$Hola {nombre} 👋

Te aviso que solo te quedan *{clases}* de tu paquete y vence el {vence}.

Si quieres seguir entrenando con nosotros, renovamos después de la próxima clase. 💪
— {negocio}$body$, v_gym);
end;
