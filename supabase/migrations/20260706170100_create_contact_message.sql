-- Contact-form intake, slice #53 (PRD #49 S1 "Contact intake"; ADR-0013 §3; ADR-0005 posture, with the
-- documented DEFINER exception below).
--
-- `contact_message` is a PUBLIC-INTAKE table: a prospect (anon) submits a lead, staff of the gym read it.
-- The abuse posture the data-model doc assigns THIS surface — Cloudflare Turnstile + a per-IP limit — is
-- BINDING, so the write path is a single guarded RPC, NOT a raw anon INSERT policy:
--
--   • There is intentionally NO anon (or member) INSERT policy. A raw INSERT policy would let a bot POST
--     straight to PostgREST, bypassing BOTH the captcha (verified in the server action) AND the per-IP
--     rate limit — defeating the exact posture this table is required to enforce. The ONLY write path is
--     `enviar_mensaje_contacto`, whose EXECUTE is granted to anon.
--   • RLS grants staff of the gym SELECT (read leads) and UPDATE (mark read). No anon/member SELECT — a
--     lead is private operator data. Default-deny covers everything else.
--
-- The RPC is SECURITY DEFINER — a deliberate, documented exception to ADR-0005's SECURITY INVOKER default.
-- INVOKER is impossible here: the per-IP limit must COUNT rows that anon cannot SELECT (staff-only read);
-- an INVOKER function called by anon would count 0 and the limit would never fire. DEFINER runs as the
-- owner (bypassing RLS) so the count sees prior rows and the insert lands. Safety per the DEFINER rules:
-- `SET search_path TO ''`, every name schema-qualified, and the gym is resolved server-side BY SLUG (the
-- public host fact — ADR-0012), never trusting a client-supplied gym id. The captcha is NOT verified here
-- (Postgres cannot call Cloudflare) — the server action verifies Turnstile before calling this RPC; this
-- function owns the rate limit + the insert, atomically.
--
-- Expand-only, idempotent (create-if-not-exists + create-or-replace + drop-policy-if-exists). No existing
-- object touched. `rls_auto_enable` also fires on CREATE TABLE; RLS enabled explicitly too.

create table if not exists public.contact_message (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gym (id) on delete cascade,
  nombre     text not null check (char_length(nombre) between 1 and 80),
  correo     text not null check (char_length(correo) between 3 and 160),
  mensaje    text not null check (char_length(mensaje) between 1 and 2000),
  ip         text,                      -- request IP (x-forwarded-for), for the per-IP rate limit only
  read_at    timestamptz,               -- null = unread; staff mark-read stamps now()
  created_at timestamptz not null default now()
);
alter table public.contact_message enable row level security;

create index if not exists contact_message_gym_id_idx on public.contact_message (gym_id);
-- Serves both the staff per-gym list (gym_id) and the RPC's per-IP window count (gym_id, ip, created_at).
create index if not exists contact_message_ratelimit_idx on public.contact_message (gym_id, ip, created_at);

-- Staff-only read + mark-read. NO anon/member SELECT; NO INSERT policy (writes go through the RPC).
drop policy if exists "contact_message_staff_select" on public.contact_message;
create policy "contact_message_staff_select" on public.contact_message for select to authenticated
  using ((select public.is_staff_of(gym_id)));
drop policy if exists "contact_message_staff_update" on public.contact_message;
create policy "contact_message_staff_update" on public.contact_message for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));

-- ── enviar_mensaje_contacto: the sole write path (rate limit + validate + insert, atomic) ───────────
create or replace function public.enviar_mensaje_contacto(
  p_gym_slug text,
  p_nombre   text,
  p_correo   text,
  p_mensaje  text,
  p_ip       text default null   -- nullable: a request without a resolvable IP skips the per-IP limit
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_gym    uuid;
  v_recent integer;
  c_limit  constant integer  := 5;               -- messages per IP, per gym, per window
  c_window constant interval := interval '1 hour';
begin
  -- Resolve the gym from the public host slug (ADR-0012); an unknown slug is refused.
  select id into v_gym from public.gym where slug = p_gym_slug;
  if v_gym is null then
    raise exception 'Gimnasio no encontrado' using errcode = 'no_data_found';
  end if;

  -- Server-side validation (the action validates too, for UX; this is the authoritative gate).
  if char_length(coalesce(btrim(p_nombre), '')) < 2 or char_length(p_nombre) > 80 then
    raise exception 'Nombre inválido' using errcode = 'check_violation';
  end if;
  if char_length(coalesce(btrim(p_correo), '')) < 3
     or p_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Correo inválido' using errcode = 'check_violation';
  end if;
  if char_length(coalesce(btrim(p_mensaje), '')) < 4 or char_length(p_mensaje) > 2000 then
    raise exception 'Mensaje inválido' using errcode = 'check_violation';
  end if;

  -- Per-IP rate limit — the reason this function is DEFINER (must read past the staff-only read policy).
  if p_ip is not null then
    select count(*) into v_recent
      from public.contact_message
      where gym_id = v_gym and ip = p_ip and created_at > now() - c_window;
    if v_recent >= c_limit then
      raise exception 'Demasiados mensajes, intenta más tarde' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.contact_message (gym_id, nombre, correo, mensaje, ip)
    values (v_gym, btrim(p_nombre), btrim(p_correo), btrim(p_mensaje), p_ip);
end;
$$;

-- Public intake: anon is the ONLY grantee (the marketing page submits over the cookieless anon client).
-- Supabase's default privileges grant EXECUTE to PUBLIC + anon + authenticated on new public functions;
-- revoke all of those and re-grant anon only, so a logged-in role cannot reach this anon-shaped path.
revoke all on function public.enviar_mensaje_contacto(text, text, text, text, text) from public;
revoke all on function public.enviar_mensaje_contacto(text, text, text, text, text) from authenticated;
grant execute on function public.enviar_mensaje_contacto(text, text, text, text, text) to anon;
