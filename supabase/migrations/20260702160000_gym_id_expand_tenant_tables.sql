-- gym_id expand across the 7 tenant tables, slice #20 (PRD #17 S3; ADR-0008/0009/0013).
--
-- Expand-half only (NO policy changes, NO drops): every tenant table gains `gym_id uuid REFERENCES
-- gym`, nullable → backfilled to the live operator's gym → NOT NULL + an index. `clientes` also gains
-- its member-evolution columns (ADR-0009): a PERMANENTLY-nullable `auth_user_id` (never backfilled,
-- never enforced NOT NULL) guarded by a partial unique index (one claim per gym), plus `phone_e164`
-- and the terms/privacy timestamps. The four write RPCs that INSERT tenant rows are redefined to stamp
-- `gym_id` server-side so new rows are born scoped; existing per-`auth.uid()` policies are untouched.
--
-- BACKFILL TARGET — one Forge gym, two staff logins. The live project (hjppxawglmukfvsgmcog) carries
-- two auth users with data: forge-1.0@outlook.com (owner "Coach JC") and nahumtrevizo2@gmail.com
-- (coach "David"). Both perfil rows are negocio=FORGE, ciudad CUU, with the SAME cobro titular (Juan
-- Carlos Mendoza / BBVA) — i.e. one Forge gym operated by two staff, exactly the multi-staff case the
-- tenancy model targets. So ALL existing rows backfill to the `forge` gym (the `slug='forge'` seed
-- from slice #18); there are no other tenants' rows to mis-scope.
--
-- EXPAND-HALF gym derivation in the RPCs: the operator's gym is resolved server-side as the `forge`
-- gym (the backfill target) — independent of gym_membership/owner backfill (sibling slice #19) and
-- never client-supplied (ADR-0008 §isolation, ADR-0009 §server-authoritative). Attendance and ventas
-- derive their gym from the cliente row itself (most precise). Membership-based derivation for gym #2
-- lands with the RLS cutover; today every authenticated writer is Forge staff.
--
-- Fully idempotent (add-column-if-not-exists · where-null backfill · set-not-null re-run harmless ·
-- if-not-exists indexes) and additive, so it is safe on a fresh preview branch AND out-of-order on the
-- live project; Forge stays green (reads unchanged; new writes stamp gym_id). One transaction: columns
-- and RPCs land before SET NOT NULL, so there is no window in which a write could be born unscoped.

-- ── 1. gym_id on every tenant table (nullable first) ──────────────────────────
alter table public.clientes    add column if not exists gym_id uuid references public.gym (id);
alter table public.ventas       add column if not exists gym_id uuid references public.gym (id);
alter table public.asistencias  add column if not exists gym_id uuid references public.gym (id);
alter table public.paquetes     add column if not exists gym_id uuid references public.gym (id);
alter table public.plantillas   add column if not exists gym_id uuid references public.gym (id);
alter table public.perfil       add column if not exists gym_id uuid references public.gym (id);
alter table public.cobro        add column if not exists gym_id uuid references public.gym (id);

-- ── 2. clientes member-evolution columns (ADR-0009) ───────────────────────────
-- auth_user_id is nullable PERMANENTLY — an operator-created cliente who never self-registers keeps it
-- NULL forever; it is set only when a verified-email registrant claims the row. NEVER backfilled,
-- NEVER made NOT NULL. FK to auth.users mirrors gym.owner_user_id (on delete set null).
alter table public.clientes add column if not exists auth_user_id uuid references auth.users (id) on delete set null;
alter table public.clientes add column if not exists phone_e164 text;
alter table public.clientes add column if not exists terms_accepted_at timestamptz;
alter table public.clientes add column if not exists privacy_accepted_at timestamptz;

-- ── 3. Write RPCs stamp gym_id on INSERT (bodies otherwise unchanged; ADR-0005) ──
-- Same signatures → CREATE OR REPLACE preserves the existing EXECUTE grants. `set search_path to ''`
-- retained (injection-safe; clears function_search_path_mutable). Timezone stays America/Chihuahua —
-- tz-parameterization is a later slice (S6), out of scope here.

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
  p_vigencia_dias integer default null
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
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_cliente_id is null then
    -- New cliente born scoped to the operator's gym (expand-half: the Forge backfill target).
    v_gym := (select id from public.gym where slug = 'forge');
    insert into public.clientes (user_id, nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values (v_uid, p_nombre, p_tel, p_clases_restantes, p_vence, p_paquete_nombre, v_gym)
    returning id into v_cliente;
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

  insert into public.ventas (user_id, cliente_id, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, gym_id)
  values (v_uid, v_cliente, p_paquete_nombre, p_clases, p_vigencia_tipo, p_vigencia_dias, p_monto, p_metodo, v_gym)
  returning public.ventas.folio into v_folio;

  return query select v_folio, v_cliente;
end;
$function$;

create or replace function public.toggle_pase(p_cliente_id uuid, p_fecha date)
 returns table(present boolean, hora text)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_clases int;
  v_gym uuid;
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
    when p_fecha = (now() at time zone 'America/Chihuahua')::date
      then (now() at time zone 'America/Chihuahua')::time
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
  insert into public.plantillas (user_id, nombre, body, gym_id)
  values (v_uid, p_nombre, p_body, (select id from public.gym where slug = 'forge'))
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.sembrar_plantillas_default()
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_gym uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from public.plantillas where user_id = v_uid) then return; end if; -- idempotent
  v_gym := (select id from public.gym where slug = 'forge');
  insert into public.plantillas (user_id, nombre, body, gym_id) values
    (v_uid, 'Recordatorio', $body$Hola {nombre} 👋

Aún te quedan {clases} de tu paquete (*{paquete}*), vence el {vence}.

¡Te esperamos en el bootcamp! 💪🔥
— {negocio}$body$, v_gym),
    (v_uid, 'Recibo', $body$Hola {nombre} 👋

¡Gracias por tu compra en {negocio}! Tu paquete *{paquete}* queda activo hasta el {vence}.

Nos vemos en el bootcamp. 💪🔥$body$, v_gym),
    (v_uid, 'Renovación', $body$Hola {nombre}, soy del coach de {negocio}.

Tu paquete vence en {dias} — ¿lo renovamos? 🔥

📦 *Paquetes disponibles:*
{precios}

Avísame cuál te conviene y te lo apartamos. 💪$body$, v_gym),
    (v_uid, 'Última llamada', $body$Hola {nombre} 👋

Te aviso que solo te queda *1 clase* de tu paquete y vence el {vence}.

Si quieres seguir entrenando con nosotros, renovamos después de la próxima clase. 💪
— {negocio}$body$, v_gym);
end;
$function$;

-- ── 4. Backfill every tenant table to the Forge gym (see header) ──────────────
update public.clientes    set gym_id = (select id from public.gym where slug = 'forge') where gym_id is null;
update public.ventas       set gym_id = (select id from public.gym where slug = 'forge') where gym_id is null;
update public.asistencias  set gym_id = (select id from public.gym where slug = 'forge') where gym_id is null;
update public.paquetes     set gym_id = (select id from public.gym where slug = 'forge') where gym_id is null;
update public.plantillas   set gym_id = (select id from public.gym where slug = 'forge') where gym_id is null;
update public.perfil       set gym_id = (select id from public.gym where slug = 'forge') where gym_id is null;
update public.cobro        set gym_id = (select id from public.gym where slug = 'forge') where gym_id is null;

-- ── 5. Enforce NOT NULL now every row is scoped (auth_user_id stays nullable) ──
alter table public.clientes    alter column gym_id set not null;
alter table public.ventas       alter column gym_id set not null;
alter table public.asistencias  alter column gym_id set not null;
alter table public.paquetes     alter column gym_id set not null;
alter table public.plantillas   alter column gym_id set not null;
alter table public.perfil       alter column gym_id set not null;
alter table public.cobro        alter column gym_id set not null;

-- ── 6. Index every gym_id (ADR-0013 §2/§5), + the one-claim-per-gym guard ──────
create index if not exists clientes_gym_id_idx    on public.clientes (gym_id);
create index if not exists ventas_gym_id_idx       on public.ventas (gym_id);
create index if not exists asistencias_gym_id_idx  on public.asistencias (gym_id);
create index if not exists paquetes_gym_id_idx     on public.paquetes (gym_id);
create index if not exists plantillas_gym_id_idx   on public.plantillas (gym_id);
create index if not exists perfil_gym_id_idx       on public.perfil (gym_id);
create index if not exists cobro_gym_id_idx        on public.cobro (gym_id);

-- One auth account may claim at most one cliente per gym (ADR-0009). Partial: unclaimed rows
-- (auth_user_id NULL) are unconstrained, so the CRM keeps minting NULL-auth clientes freely.
create unique index if not exists clientes_auth_user_id_per_gym
  on public.clientes (gym_id, auth_user_id) where auth_user_id is not null;
