-- "Reservas en línea" switch — #331 (spec #326). ONE write RPC, ADR-0005: in a single
-- transaction it flips `gym.booking_enabled` and, when turning OFF, cancels every future
-- (`starts_at > now()`) still-`reservada` reservation of that gym through the SAME state
-- transition the member/operator cancel path already produces.
--
-- SECURITY INVOKER (the ADR-0005 default), unlike registrar_venta/cancelar_reserva. Nothing
-- here needs a definer bypass: `is_staff_of`/`staff_gym` are readable to any authenticated
-- caller, `reservation` and `clientes` already carry full staff UPDATE policies
-- (20260702173309), and the one write RLS could not previously express — `gym.booking_enabled`
-- — is opened below by the SAME grant-then-policy idiom `gym_staff_update`
-- (20260808130000, `legal_name`) already established: the policy is command-scoped, not
-- column-scoped, so a new column grant is all `booking_enabled` needs.
grant update (booking_enabled) on public.gym to authenticated;

-- REUSE, not a second write path: the per-row cancellation is `cancelar_reserva` itself,
-- called once per (session, member) exactly the way `retire_recurring_schedule` loops
-- `cancel_class_session` per session (20260806100100). This is deliberate — it is the ONLY
-- way to guarantee "the exact state the member cancel path produces" without hand-copying
-- that function's writes (status/cancelled_at/consumio-gated refund) into a second body that
-- could drift from it. `cancelar_reserva`'s staff arm (`p_cliente_id` given) re-checks
-- `is_staff_of(v_gym)` per row — already true here — and its own gym is derived from the
-- SESSION, not from a parameter, so scoping to `v_gym` at the SELECT below is what keeps
-- another gym's rows out, not anything inside the reused function.
--
-- Only `status = 'reservada'` reservations are ever future+active: `asistida` is stamped at
-- check-in (never before `starts_at`) and `no_show` is unwritten in v1 (comment,
-- 20260706170000) — so this is the same filter `cancel_class_session`'s own release CTE uses,
-- not a narrower one.
create or replace function public.cambiar_modo_reservas(p_habilitar boolean, p_gym_id uuid default null)
  returns int
  language plpgsql
  set search_path to ''
as $function$
declare
  v_gym    uuid;
  v_actual boolean;
  v_n      int := 0;
  r        record;
begin
  -- Same multi-gym resolution every other staff RPC uses (registrar_venta, editar_venta,
  -- cancel_class_session, retire_recurring_schedule): a caller-supplied gym is honored only
  -- if the caller staffs it; omitted, it falls back to the caller's first staffed gym.
  if p_gym_id is null then
    v_gym := public.staff_gym();
  elsif public.is_staff_of(p_gym_id) then
    v_gym := p_gym_id;
  else
    raise exception 'No autorizado';
  end if;
  if v_gym is null then raise exception 'No autorizado'; end if;

  select booking_enabled into v_actual from public.gym where id = v_gym;
  if not found then raise exception 'Gimnasio no encontrado'; end if;

  -- Idempotent on the TARGET state: a second call asking for the state already in effect
  -- writes nothing (not the gym row, not a single reservation) and reports 0 cancelled.
  if v_actual = p_habilitar then
    return 0;
  end if;

  update public.gym set booking_enabled = p_habilitar where id = v_gym;

  -- Turning ON seeds nothing (spec #326: "Lista→Cupo seeds NOTHING") — the agenda simply
  -- becomes reachable, empty, at its existing "Sin clases · toca +" state.
  if p_habilitar then
    return 0;
  end if;

  -- Turning OFF: every future, still-held reservation of THIS gym, oldest class first —
  -- same order retire_recurring_schedule uses for its own cancel loop.
  for r in
    select res.class_session_id, res.member_id
      from public.reservation res
      join public.class_session cs on cs.id = res.class_session_id
     where res.gym_id = v_gym
       and res.status = 'reservada'
       and cs.starts_at > now()
     order by cs.starts_at, res.member_id
  loop
    perform public.cancelar_reserva(r.class_session_id, r.member_id);
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;

revoke execute on function public.cambiar_modo_reservas(boolean, uuid) from public, anon;
grant  execute on function public.cambiar_modo_reservas(boolean, uuid) to authenticated;
