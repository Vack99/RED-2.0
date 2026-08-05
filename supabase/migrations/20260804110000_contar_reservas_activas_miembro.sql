-- contar_reservas_activas_miembro — the MEMBER-facing occupancy seam (owner ruling 2026-08-03).
--
-- THE DEFECT: `contar_reservas_activas` (20260706170000:104-117) counts every reservation row
-- `status in ('reservada', 'asistida')` regardless of `is_walk_in`. `pasar_lista_sesion`
-- (20260710132000/20260728121000) marks a door walk-in by writing exactly such a row —
-- `status = 'asistida', is_walk_in = true`. Both member-facing readers (agenda-miembro.ts'
-- `fetchSesionesMiembro`, clase-miembro.ts' `getClaseDetalleMiembro`) resolve occupancy through
-- that SAME seam a staff walk-in mark inflates it: a coach who walks in three extra people over
-- cupo pushes `activos` past `capacidad` for MEMBERS too, and `derivarEstadoSesion` reads that as
-- LLENO — a member who did not book anything is told the class is full because of headcount they
-- were never offered a seat against.
--
-- RULING (owner, 2026-08-03): staff may exceed cupo — a walk-in mark is never blocked or refused
-- — but a walk-in must never drive a MEMBER's view of a session to LLENO. The operator's own
-- roster/headcount reader (`agenda.ts`, `contar_reservas_activas` unchanged) must keep counting
-- every active reservation: "17/15" is the real number of bodies in the room, and that is truth
-- for her. The member's availability question is different — "is there a spot I could book" —
-- and a walk-in never consumed a BOOKABLE spot; it consumed a physical one the operator already
-- knows about by having marked it herself.
--
-- THE FIX: a sibling function, `is_walk_in = false` the only difference from
-- `contar_reservas_activas` — everything else (DEFINER because a member may read only their own
-- reservation rows under RLS, `is_member_of` gym scoping, no PII in the return shape) is
-- identical. A NEW function name rather than a parameter on the existing one: Postgres resolves
-- `create or replace function` by name+arg-TYPES, so appending a parameter would not replace the
-- existing single-arg overload in place, it would leave both co-existing — messier than one
-- extra, clearly-named, narrowly-scoped function. `agenda.ts` (staff/admin) is NOT touched here
-- and keeps calling `contar_reservas_activas`; only `agenda-miembro.ts` and `clase-miembro.ts`
-- (packages/data) are repointed at this one, in the same commit.
--
-- Pure reader, no write — the rpc-write-coverage guard derives its obligation set from `writes`
-- (INSERT/UPDATE/DELETE in the body), and this function has none, so it must NOT be added to
-- supabase/tests/rpc-coverage.json (the guard's own "no pure reader" check would fail).
--
-- Idempotent (create-or-replace, revoke/grant), forward-only; safe out-of-order on live.
create or replace function public.contar_reservas_activas_miembro(p_session_ids uuid[])
  returns table (session_id uuid, activos int)
  language sql
  stable
  security definer
  set search_path to ''
as $function$
  select r.class_session_id, count(*)::int
  from public.reservation r
  where r.class_session_id = any(p_session_ids)
    and r.status in ('reservada', 'asistida')
    and r.is_walk_in = false
    and public.is_member_of(r.gym_id)
  group by r.class_session_id
$function$;

revoke execute on function public.contar_reservas_activas_miembro(uuid[]) from public, anon;
grant execute on function public.contar_reservas_activas_miembro(uuid[]) to authenticated;
