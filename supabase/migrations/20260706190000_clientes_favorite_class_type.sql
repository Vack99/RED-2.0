-- Member favorite class type, slice #59 (PRD #49 S3 "Member profile fields" — the goal's NAMED single-column
-- exception; ADR-0005 atomic self-scoped seam; ADR-0013 member-owned write posture).
--
-- The member row gains ONE nullable reference — favorite_class_type_id — the heart on the clase-detail page
-- toggles, and a "Tu favorita" tag renders wherever the mock shows it (Reservar cards, the summary sheet,
-- mis reservas, Confirmada). Two objects, expand-only, idempotent (add-column-if-not-exists +
-- create-or-replace), safe on a fresh scratch AND out-of-order on live:
--   * clientes.favorite_class_type_id — nullable FK → class_type(id) ON DELETE SET NULL (a removed class
--                                       type clears the favorite, never orphans it). Indexed (ADR-0013 §2).
--   * toggle_favorito_tipo            — the ONE member write path. SECURITY DEFINER, self-scoped by
--                                       auth.uid() (the reservar_clase / reclamar_o_crear precedent):
--                                       members hold NO direct UPDATE policy on clientes (entitlement +
--                                       identity columns are staff-write; contract_b left members
--                                       select-only on their own row), so this definer body is the only
--                                       path that moves the column — and it moves ONLY the caller's own
--                                       row, by exactly the toggle. On/off: setting the id already stored
--                                       clears it to NULL; a different id replaces (one favorite, never
--                                       two). Tenant-pinned: the class type must belong to the caller's own
--                                       gym, so a cross-gym id is refused (never a client-supplied gym).

-- ── the nullable single-column reference ────────────────────────────────────────
alter table public.clientes
  add column if not exists favorite_class_type_id uuid references public.class_type (id) on delete set null;
create index if not exists clientes_favorite_class_type_id_idx
  on public.clientes (favorite_class_type_id);

-- ── toggle_favorito_tipo — the atomic self-scoped toggle (ADR-0005 seam; member-write posture) ──
create or replace function public.toggle_favorito_tipo(p_class_type_id uuid)
  returns table (favorito uuid)
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_uid     uuid := (select auth.uid());
  v_member  uuid;
  v_gym     uuid;
  v_current uuid;
  v_ct_gym  uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- The caller's OWN cliente + current favorite — the auth.uid() self-pin (identity is never a parameter).
  select c.id, c.gym_id, c.favorite_class_type_id into v_member, v_gym, v_current
    from public.clientes c where c.auth_user_id = v_uid limit 1;
  if not found then
    raise exception 'No eres miembro de este gimnasio';
  end if;

  -- Tenant pin: the class type must belong to the caller's gym (server-derived, never client-supplied).
  select ct.gym_id into v_ct_gym from public.class_type ct where ct.id = p_class_type_id;
  if not found or v_ct_gym <> v_gym then
    raise exception 'Tipo de clase no encontrado';
  end if;

  -- On/off toggle: same id clears; a different (or unset) id sets. Table-qualified WHERE — the RETURNS
  -- TABLE OUT param is named `favorito` so the column write is unambiguous.
  if v_current is not distinct from p_class_type_id then
    update public.clientes set favorite_class_type_id = null where clientes.id = v_member;
    favorito := null;
  else
    update public.clientes set favorite_class_type_id = p_class_type_id where clientes.id = v_member;
    favorito := p_class_type_id;
  end if;
  return next;
end;
$function$;

-- ── EXECUTE lockdown (ADR-0005/0013 §1): revoke public+anon default, grant authenticated only ──
revoke execute on function public.toggle_favorito_tipo(uuid) from public, anon;
grant execute on function public.toggle_favorito_tipo(uuid) to authenticated;
