-- Member notifications PREFERENCE flag + its self-scoped toggle, slice #62 (PRD #49 S5 perfil hub;
-- ADR-0013 member-owned/transactional RLS class; ADR-0005 atomic RPC seam).
--
-- The perfil hub's one settings write. A PREFERENCE ONLY (PRD Implementation Decisions, BINDING): an
-- in-app flag with NO delivery channel — this migration ships the column + the toggle and nothing else
-- (no framework, no queue, no cron). A future slice that actually delivers notifications reads this flag;
-- it is inert until then.
--
-- Column: `notificaciones_activadas boolean not null default true` on clientes — a socio is opted IN by
-- default (the mock's toggle renders ON). Distinctly named so it coexists on merge with the sibling
-- stack's own clientes column adds (#59's favorite_class_type_id).
--
-- Write posture — the DEFINER toggle (ADR-0013 §5 / ADR-0005), the SAME posture as reservar_clase /
-- cancelar_reserva: the member holds NO direct UPDATE policy on clientes (staff-only — a member UPDATE
-- policy would grant the WHOLE row, letting a socio rewrite clases_restantes/vence, the entitlement
-- columns ADR-0013 forbids them). So the flip is a privilege THIS function exercises, and only ever:
--   * on the CALLER'S OWN row — WHERE auth_user_id = auth.uid() (server-derived; no parameter redirects it),
--   * touching ONLY notificaciones_activadas — no other column is in the SET list.
-- SECURITY DEFINER, SET search_path TO '', every ref schema-qualified, EXECUTE authenticated-only. The
-- READ path needs no new policy — the socio reads the flag through their existing own-row SELECT
-- (clientes_member_select, auth_user_id = auth.uid()).
--
-- Expand-only (one column add + one create-or-replace function), idempotent, safe on a fresh scratch AND
-- on live. NEVER destructive.

alter table public.clientes
  add column if not exists notificaciones_activadas boolean not null default true;

create or replace function public.set_notificaciones(p_enabled boolean)
  returns boolean
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_result boolean;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if p_enabled is null then
    raise exception 'Preferencia inválida';
  end if;

  -- The caller's OWN cliente row — the auth.uid() self-pin. One login = one gym = one cliente row
  -- (unique (gym_id, auth_user_id) + one membership), so this flips exactly one row and RETURNING INTO is
  -- single-valued. Only notificaciones_activadas is written; the entitlement columns are never in scope.
  update public.clientes
     set notificaciones_activadas = p_enabled
   where auth_user_id = v_uid
   returning notificaciones_activadas into v_result;
  if not found then
    raise exception 'No eres miembro de este gimnasio';
  end if;

  return v_result;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005/0013 §1): revoke public+anon default, grant authenticated only ──
revoke execute on function public.set_notificaciones(boolean) from public, anon;
grant execute on function public.set_notificaciones(boolean) to authenticated;
