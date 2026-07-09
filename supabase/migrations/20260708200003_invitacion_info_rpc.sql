-- Invite-token claim rail S1 (issue #65; ADR-0015 · design 2026-07-08 §4). The pre-signup identity lookup:
-- `/registro?codigo=…` calls this BEFORE any auth to render "Invitación de {gym} para {nombre}" (cross-tenant
-- shield #3 — an invite always proves its identity before a form). Returns ONLY the {gym nombre, gym slug,
-- cliente nombre} projection for a valid unclaimed code — deliberately NOT claim_code, email, balance, or
-- any other column: holding the code reveals a first name + gym, an accepted bearer-token disclosure
-- (ADR-0015 consequence), and nothing more.
--
-- SECURITY DEFINER + `search_path=''`: the caller is anon (pre-signup), so it cannot read `clientes` under
-- RLS; definer executes the narrow projection with RLS bypassed. Granted to anon AND authenticated (the
-- page is reachable both logged-out and logged-in). An unknown/dead/cleared code returns zero rows → the
-- caller degrades to a plain signup with no banner. Idempotent create-or-replace.
create or replace function public.invitacion_info(p_codigo text)
  returns table (gym_nombre text, gym_slug text, cliente_nombre text)
  language sql
  stable
  security definer
  set search_path = ''
as $function$
  select g.brand_name, g.slug, c.nombre
    from public.clientes c
    join public.gym g on g.id = c.gym_id
   where c.claim_code = p_codigo;
$function$;

-- EXECUTE: revoke the public default, then grant the two roles that reach the pre-signup page.
revoke execute on function public.invitacion_info(text) from public;
grant execute on function public.invitacion_info(text) to anon, authenticated;
