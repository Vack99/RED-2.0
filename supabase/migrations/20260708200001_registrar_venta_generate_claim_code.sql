-- Invite-token claim rail S1 (issue #65; ADR-0015). The staff sale mints the invite code inline: the
-- NEW-cliente path now generates `clientes.claim_code` atomically with the INSERT, so every staff-created
-- member row carries a single-use claim token from birth (design §3). SIGNATURE UNCHANGED (the same 12 args
-- as 20260707031000), so `create or replace` keeps the overload and its grants — the revoke/grant below is
-- belt-and-suspenders (mirrors the reclamar prior art). SECURITY INVOKER + `search_path=''` preserved:
-- the sale still runs under the operator's RLS, and the code is minted regardless of p_email so a cash
-- walk-in without email is NEVER gated (a code with no email is harmless — unreadable by members/anon,
-- re-usable when staff later backfills the email). Body otherwise identical to 20260707031000.
--
-- Code shape (ADR-0015): 8 chars from A-Z/2-9 (34-symbol alphabet), crypto-random via pgcrypto
-- (extensions.gen_random_bytes — schema-qualified for the empty search_path). Globally unique is enforced
-- by the partial unique index `clientes_claim_code_key`, which is the uniqueness AUTHORITY: an INVOKER
-- function's plain SELECT can't see another gym's code under RLS, so we catch the unique_violation and
-- retry rather than pre-checking (collision odds ≈ 1 in 34^8 ≈ 1.8e12). Idempotent + additive.
create or replace function public.registrar_venta(
  p_nombre text,
  p_tel text,
  p_paquete_nombre text,
  p_vigencia_tipo text,
  p_monto integer,
  p_metodo text,
  p_cliente_id uuid default null,
  p_clases_restantes integer default null,
  p_vence date default null,
  p_clases integer default null,
  p_vigencia_dias integer default null,
  p_email text default null
)
 returns table(folio bigint, cliente_id uuid)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_cliente uuid;
  v_gym uuid;
  v_folio bigint;
  v_code text;
  v_bytes bytea;
  i int;
  v_alpha constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';  -- 34 symbols (A-Z, 2-9)
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_cliente_id is null then
    v_gym := public.staff_gym();
    -- Mint the member row + a fresh single-use invite code atomically. Retry only on a claim_code
    -- collision (the sole unique constraint reachable here — auth_user_id is NULL so its partial index
    -- is inert); the partial unique index, not this SELECT-blind INVOKER function, guarantees uniqueness.
    loop
      v_code := '';
      v_bytes := extensions.gen_random_bytes(8);
      for i in 0..7 loop
        v_code := v_code || substr(v_alpha, (get_byte(v_bytes, i) % 34) + 1, 1);
      end loop;
      begin
        insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, email, claim_code)
        values (p_nombre, p_tel, p_clases_restantes, p_vence, p_paquete_nombre, v_gym, p_email, v_code)
        returning id into v_cliente;
        exit;
      exception when unique_violation then
        -- claim_code already exists → regenerate and retry
      end;
    end loop;
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
    select gym_id into v_gym from public.clientes where id = p_cliente_id;  -- venta inherits the cliente's gym
  end if;

  v_folio := public.next_folio(v_gym);
  insert into public.ventas (cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, gym_id)
  values (v_cliente, v_folio, p_paquete_nombre, p_clases, p_vigencia_tipo, p_vigencia_dias, p_monto, p_metodo, v_gym);

  return query select v_folio, v_cliente;
end;
$function$;

-- EXECUTE lockdown (grants survive `create or replace`, re-issued for belt-and-suspenders): revoke the
-- public/anon defaults, grant authenticated (a staff session — the RLS on clientes/ventas gates the write).
revoke execute on function public.registrar_venta(text, text, text, text, integer, text, uuid, integer, date, integer, integer, text) from public, anon;
grant execute on function public.registrar_venta(text, text, text, text, integer, text, uuid, integer, date, integer, integer, text) to authenticated;
