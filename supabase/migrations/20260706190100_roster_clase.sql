-- Clase cupo-roster read, slice #59 (PRD #49 S3 "cupo roster"; ADR-0010 §3 derived occupancy;
-- ADR-0013 member-owned reservation RLS).
--
-- The clase-detail page shows the seats taken as attendee avatars, but a member holds a SELECT policy on
-- their OWN reservation rows only — other attendees' rows are invisible under plain RLS. roster_clase is
-- the NARROW privileged read that makes the roster truthful without over-exposing, the exact sibling of
-- contar_reservas_activas (same file, slice #57):
--   * SECURITY DEFINER because a member cannot SELECT other members' reservation rows, yet the mock's
--     roster needs the real attendee set. Definer bypasses reservation RLS.
--   * Returns ONLY display initials — the display-minimum the avatar needs — computed IN the function from
--     nombre (first + second word initials, upper). No full name, email, phone, or balance ever crosses
--     the boundary: the minimum surface (initials only) is the whole return shape.
--   * Scoped by is_member_of(r.gym_id) — keyed on the reservation's OWN gym_id (mirrors
--     contar_reservas_activas) — so a caller reads rosters ONLY for sessions of gyms they belong to; a
--     non-member / anon reads nothing.
--   * ACTIVE set only (reservada|asistida) — the same "occupies a spot" definition as the occupancy count,
--     so the avatar count and the seat pips agree; cancelada|no_show are excluded.
--   * Ordered by created_at so the roster is stable across renders.
--
-- Expand-only (one function), idempotent (create-or-replace), safe on a fresh scratch AND live.

create or replace function public.roster_clase(p_session_id uuid)
  returns table (iniciales text)
  language sql
  stable
  security definer
  set search_path to ''
as $function$
  select upper(
    left(split_part(c.nombre, ' ', 1), 1)
    || coalesce(left(nullif(split_part(c.nombre, ' ', 2), ''), 1), '')
  )
  from public.reservation r
  join public.clientes c on c.id = r.member_id
  where r.class_session_id = p_session_id
    and r.status in ('reservada', 'asistida')
    and public.is_member_of(r.gym_id)
  order by r.created_at
$function$;

-- ── EXECUTE lockdown (ADR-0005/0013 §1): revoke public+anon default, grant authenticated only ──
revoke execute on function public.roster_clase(uuid) from public, anon;
grant execute on function public.roster_clase(uuid) to authenticated;
