-- Invite email auto-send, slice S2 (issue #68; ADR-0015 · design 2026-07-08 §4). The staff-side of the
-- invite rail: two thin RPCs the data layer drives to send (and record) the invite email.
--
-- `preparar_invitacion(p_cliente_id)` — lazily ENSURES the row carries a single-use claim_code (generates
-- one when NULL) and returns the send payload {codigo, email, nombre (member), gym_slug, gym_nombre, gym_id}.
-- The DAL builds the claim URL + sends via Resend; a SUCCESSFUL send is then recorded with the sibling
-- `marcar_invitacion_enviada(p_cliente_id)`. They are SEPARATE calls on purpose: the send is best-effort and
-- happens BETWEEN them (a sale NEVER fails because mail failed), so the stamp must be conditional on transport
-- success — it cannot be folded into preparar_invitacion's single pre-send call (a p_marcar arg would stamp
-- before we know the send succeeded, violating "stamp only on success"). So: prepare → send → stamp.
--
-- POSTURE (mirrors reclamar_por_codigo / the staff helpers): SECURITY DEFINER + `search_path=''` (every ref
-- schema-qualified) so the code can be ensured/read regardless of the claim_code column's RLS, with the
-- authority being an EXPLICIT `is_staff_of(gym)` gate — the caller must be owner/operator of the ROW's gym.
-- EXECUTE revoked from public/anon, granted only to authenticated (a staff session, gated again by is_staff_of).
--
-- Code shape (ADR-0015): 8 chars from A-Z/2-9 (34-symbol alphabet), crypto-random via pgcrypto
-- (extensions.gen_random_bytes — schema-qualified for the empty search_path), globally unique by the partial
-- index `clientes_claim_code_key`, which is the uniqueness AUTHORITY: catch unique_violation + retry rather
-- than pre-check (collision odds ≈ 1 in 34^8 ≈ 1.8e12). These ~10 generator lines are DUPLICATED from
-- 20260708200001 (registrar_venta) rather than extracted to a shared helper: extracting would either require
-- editing registrar_venta's migration (forbidden — it is applied) or leave a single-caller helper here
-- (registrar_venta keeping its own inline copy), which is not real sharing. Idempotent create-or-replace.
create or replace function public.preparar_invitacion(p_cliente_id uuid)
  returns table (codigo text, email text, nombre text, gym_slug text, gym_nombre text, gym_id uuid)
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_gym    uuid;
  v_email  text;
  v_nombre text;
  v_code   text;
  v_bytes  bytea;
  i        int;
  v_alpha  constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';  -- 34 symbols (A-Z, 2-9)
begin
  if (select auth.uid()) is null then
    raise exception 'No autenticado';
  end if;

  -- Resolve the row's gym + current invite facts. DEFINER bypasses RLS, so the staff gate below — not the
  -- read — is the authority.
  select c.gym_id, c.email, c.nombre, c.claim_code
    into v_gym, v_email, v_nombre, v_code
    from public.clientes c where c.id = p_cliente_id;
  if v_gym is null then
    raise exception 'Cliente no encontrado';
  end if;

  if not public.is_staff_of(v_gym) then
    raise exception 'No autorizado';
  end if;

  -- Lazily ensure a single-use code. Retry only on the (astronomically rare) claim_code collision; the
  -- partial unique index, not this SELECT, guarantees global uniqueness.
  if v_code is null then
    loop
      v_code := '';
      v_bytes := extensions.gen_random_bytes(8);
      for i in 0..7 loop
        v_code := v_code || substr(v_alpha, (get_byte(v_bytes, i) % 34) + 1, 1);
      end loop;
      begin
        update public.clientes set claim_code = v_code where id = p_cliente_id;
        exit;
      exception when unique_violation then
        -- claim_code already exists → regenerate and retry
      end;
    end loop;
  end if;

  return query
    select v_code, v_email, v_nombre, g.slug, g.brand_name, v_gym
      from public.gym g where g.id = v_gym;
end;
$function$;

-- Record a SUCCESSFUL send. Called by the DAL only after the transport confirmed delivery — same DEFINER +
-- explicit staff gate posture; the stamp drives the derived "invitación enviada {fecha}" state (design §3).
create or replace function public.marcar_invitacion_enviada(p_cliente_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_gym uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'No autenticado';
  end if;

  select gym_id into v_gym from public.clientes where id = p_cliente_id;
  if v_gym is null then
    raise exception 'Cliente no encontrado';
  end if;

  if not public.is_staff_of(v_gym) then
    raise exception 'No autorizado';
  end if;

  update public.clientes set invitacion_enviada_at = now() where id = p_cliente_id;
end;
$function$;

-- EXECUTE lockdown (ADR-0013 §1): a definer primitive is never client-callable beyond its intended caller.
revoke execute on function public.preparar_invitacion(uuid)       from public, anon;
grant  execute on function public.preparar_invitacion(uuid)       to authenticated;
revoke execute on function public.marcar_invitacion_enviada(uuid) from public, anon;
grant  execute on function public.marcar_invitacion_enviada(uuid) to authenticated;
