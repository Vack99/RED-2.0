-- Gate 0.1 DB spine, issue #253: click-wrap acceptance evidence + per-gym legal identity.
--
-- Two new tables + one RPC. This is the foundation #254 (admin blocking click-wrap gate) and #255
-- (admin CUENTA legal-identity editor + aviso preview) build on top of — DB-only, no TS/UI here.
--
-- `acuerdo_aceptacion` is the evidence table: one append-only row per (gym, documento, version)
-- proving the gym's OWNER accepted a given version of a legal document (today: the Anexo de
-- Tratamiento de Datos). Evidence captured mirrors the Anexo draft's own acceptance clause
-- (docs/legal/gate0-borradores/anexo-tratamiento-datos.md, cláusula 16.3): the accepting user, the
-- timestamp, the origin IP, the document's version, and its SHA-256 fingerprint — plus the gym and
-- the user-agent. The hash is computed INSIDE the RPC from the document text the caller passes
-- (pgcrypto's `extensions.digest` — already installed on this project, the same extension that backs
-- `extensions.hmac` in 20260713190000/20260722120000), never accepted as a caller-supplied value, so
-- the stored hash provably matches the stored inputs. RLS: staff of the gym READ their own gym's
-- rows; there is deliberately NO insert/update/delete POLICY at all (ADR-0013 §4's "no direct client
-- writes" taken further — not even staff write directly). The ONLY write path is `aceptar_acuerdo`,
-- SECURITY DEFINER with an explicit `has_role(gym,'owner')` gate inside — an INVOKER function could
-- never write past a table carrying zero write policies (ADR-0005's default posture doesn't reach a
-- table this locked down; same documented-exception shape as `enviar_mensaje_contacto`, 20260706170100).
--
-- POSTURE (review fix round 1): evidence must OUTLIVE the user it was captured from — the whole
-- point of this Gate is proving what was agreed to, and that proof cannot depend on the accepting
-- account still existing (deleting a user, including via the erasure right this Gate exists to
-- serve, must never raise an FK violation). So `accepted_by` is nullable with `on delete set null`
-- (the one FK in this migration that does NOT cascade — a deleted user's evidence rows survive,
-- unlinked, rather than vanishing or blocking the deletion), and the accepting identity is
-- SNAPSHOTTED at acceptance time into `accepted_by_email` (not null, filled by the RPC from
-- `auth.users` — never a caller-supplied value), so the evidence stays legible even after the
-- account is gone. `gym_id` still cascades: if the GYM itself is deleted, its evidence has no
-- remaining subject and cascades away with it — only the per-user link is erasure-safe.
--
-- `gym_legal` is a 1:1 satellite of `gym` (gym_id is the PK), replaying `gym_contact`'s STAFF policy
-- classes (20260706165900) byte-for-byte — insert/update/delete via `is_staff_of(gym_id)` — but with
-- a staff-only SELECT in place of gym_contact's anon+member reads: gym_contact is public marketing
-- copy, this is private ARCO/legal data, so no anon, no member. Holds domicilio + the ARCO contact
-- channel the aviso templates (docs/legal/gate0-borradores/*) interpolate as `{{domicilio}}` /
-- `{{email_arco}}` / `{{area_datos_personales}}`. `{{razon_social}}` reuses `gym.legal_name`
-- (already nullable, unused since its creation) — no new razón-social column.
--
-- Expand-only (two brand-new tables, no existing object touched), fully idempotent
-- (create-if-not-exists + drop-policy-if-exists + create-or-replace), safe out-of-order on the live
-- project. gym_id needs no standalone index (ADR-0013 §2/§5): the leading column of the
-- `(gym_id, documento, version)` unique constraint already serves every gym_id-scoped lookup as a
-- leftmost prefix. Every helper call wrapped in the `(select …)` initplan idiom (ADR-0001).

-- ── acuerdo_aceptacion: append-only click-wrap evidence ──────────────────────────────────────────
create table if not exists public.acuerdo_aceptacion (
  id                uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references public.gym (id) on delete cascade,
  documento         text not null check (char_length(documento) between 1 and 100),
  version           text not null check (char_length(version) between 1 and 50),
  contenido_hash    text not null check (contenido_hash ~ '^[0-9a-f]{64}$'),  -- sha256, hex-encoded
  accepted_by       uuid references auth.users (id) on delete set null,  -- nullable: evidence outlives the user
  accepted_by_email text not null check (char_length(accepted_by_email) between 3 and 160),  -- identity snapshot
  ip                text check (ip is null or char_length(ip) between 1 and 100),
  user_agent        text check (user_agent is null or char_length(user_agent) <= 500),
  accepted_at       timestamptz not null default now(),
  constraint acuerdo_aceptacion_gym_documento_version_uq unique (gym_id, documento, version)
);
alter table public.acuerdo_aceptacion enable row level security;

-- Staff-only read; NO write policy of any kind (insert/update/delete) — `aceptar_acuerdo` (SECURITY
-- DEFINER, below) is the sole write path, so default-deny covers every direct client write.
drop policy if exists "acuerdo_aceptacion_staff_select" on public.acuerdo_aceptacion;
create policy "acuerdo_aceptacion_staff_select" on public.acuerdo_aceptacion for select to authenticated
  using ((select public.is_staff_of(gym_id)));

-- ── gym_legal: 1:1 legal-identity satellite (domicilio + contacto ARCO) ──────────────────────────
create table if not exists public.gym_legal (
  gym_id                uuid primary key references public.gym (id) on delete cascade,
  domicilio             text check (domicilio is null or char_length(domicilio) between 1 and 300),
  email_arco            text check (email_arco is null or char_length(email_arco) between 3 and 160),
  area_datos_personales text check (area_datos_personales is null or char_length(area_datos_personales) between 1 and 200),
  updated_at            timestamptz not null default now()
);
alter table public.gym_legal enable row level security;

drop policy if exists "gym_legal_staff_select" on public.gym_legal;
create policy "gym_legal_staff_select" on public.gym_legal for select to authenticated
  using ((select public.is_staff_of(gym_id)));
drop policy if exists "gym_legal_staff_insert" on public.gym_legal;
create policy "gym_legal_staff_insert" on public.gym_legal for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "gym_legal_staff_update" on public.gym_legal;
create policy "gym_legal_staff_update" on public.gym_legal for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));
drop policy if exists "gym_legal_staff_delete" on public.gym_legal;
create policy "gym_legal_staff_delete" on public.gym_legal for delete to authenticated
  using ((select public.is_staff_of(gym_id)));

-- ── aceptar_acuerdo: the sole write path onto acuerdo_aceptacion, OWNER-gated ────────────────────
-- SECURITY DEFINER is required, not incidental (documented exception to ADR-0005, mirroring
-- enviar_mensaje_contacto's rationale): the table carries no write policy at all, so an INVOKER
-- function could never insert past RLS. The authority is the explicit `has_role(p_gym_id, 'owner')`
-- check below — one role tighter than preparar_invitacion's `is_staff_of` gate (20260708210000),
-- because acceptance of the data-processing terms is an owner-only act (binding decision, issue
-- #253). Re-accepting an already-accepted (gym, documento, version) is NOT an error — it is
-- idempotent by design: the unique constraint + ON CONFLICT DO NOTHING absorb it, and a concurrent
-- double-submit is closed by re-reading after a lost race rather than raising. `contenido_hash` in
-- the return lets the caller detect drift — a re-accept whose freshly-hashed content differs from
-- the STORED hash means the document text changed without a version bump; appended at the END of
-- `returns table` (not inserted before `ya_existia`) so a later signature grow-only stays a
-- CREATE OR REPLACE, never a DROP FUNCTION (Postgres allows appending OUT columns, never reordering).
create or replace function public.aceptar_acuerdo(
  p_gym_id     uuid,
  p_documento  text,
  p_version    text,
  p_contenido  text,
  p_ip         text default null,
  p_user_agent text default null
)
  returns table (id uuid, ya_existia boolean, contenido_hash text)
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_email  text;
  v_hash   text;  -- hash of the content THIS call passed
  v_id     uuid;
  v_stored text;  -- the hash actually persisted for (gym, documento, version) — what gets returned
  v_existed boolean := false;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if not public.has_role(p_gym_id, 'owner') then
    raise exception 'No autorizado';
  end if;

  if p_documento is null or char_length(p_documento) = 0 then
    raise exception 'Documento requerido';
  end if;
  if p_version is null or char_length(p_version) = 0 then
    raise exception 'Versión requerida';
  end if;
  if p_contenido is null or char_length(p_contenido) = 0 then
    raise exception 'Contenido requerido';
  end if;

  -- The accepting identity is snapshotted HERE, from the verified source (auth.users), never a
  -- caller-supplied value — so it stays legible even after the account is later deleted.
  select u.email into v_email from auth.users u where u.id = v_uid;
  if v_email is null then
    raise exception 'Cuenta sin correo asociado';
  end if;

  -- Computed HERE, from the content the caller passed — never a caller-supplied hash. Schema-
  -- qualified for search_path=''; pgcrypto lives in the `extensions` schema on this project.
  v_hash := encode(extensions.digest(p_contenido, 'sha256'), 'hex');

  select aa.id, aa.contenido_hash into v_id, v_stored from public.acuerdo_aceptacion aa
    where aa.gym_id = p_gym_id and aa.documento = p_documento and aa.version = p_version;

  if v_id is not null then
    v_existed := true;
  else
    insert into public.acuerdo_aceptacion
      (gym_id, documento, version, contenido_hash, accepted_by, accepted_by_email, ip, user_agent)
      values (p_gym_id, p_documento, p_version, v_hash, v_uid, v_email, p_ip, p_user_agent)
      on conflict (gym_id, documento, version) do nothing
      returning acuerdo_aceptacion.id, acuerdo_aceptacion.contenido_hash into v_id, v_stored;

    if v_id is null then
      -- Lost a concurrent race between the SELECT and the INSERT: the row now exists, read it back.
      v_existed := true;
      select aa.id, aa.contenido_hash into v_id, v_stored from public.acuerdo_aceptacion aa
        where aa.gym_id = p_gym_id and aa.documento = p_documento and aa.version = p_version;
    end if;
  end if;

  id := v_id;
  ya_existia := v_existed;
  contenido_hash := v_stored;
  return next;
end;
$function$;

-- EXECUTE lockdown (ADR-0013 §1): revoke from BOTH public AND anon explicitly — a bare revoke from
-- PUBLIC does not remove anon's separate platform default-privilege grant on Supabase-hosted
-- Postgres (the exact gap 20260715080000 closed after a live probe). Grant only to authenticated;
-- the has_role check inside is the real gate.
revoke execute on function public.aceptar_acuerdo(uuid, text, text, text, text, text) from public, anon;
grant  execute on function public.aceptar_acuerdo(uuid, text, text, text, text, text) to authenticated;
