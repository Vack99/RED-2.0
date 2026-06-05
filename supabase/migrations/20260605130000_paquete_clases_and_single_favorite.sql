-- paquetes editor v2: editable clases + derived nombre + single-favorite invariant (ADR-0005).
-- (a) SINGLE FAVORITE — at most one popular package per operator, enforced in-DB by a partial
--     unique index; the RPC demotes siblings before promoting so the index can't be violated by a
--     legitimate edit. (b) CLASES RANGE GUARD — defense-in-depth CHECK (the app validates 1..30 too).
-- (c) RPC v2 — clases is now editable and the display nombre is DERIVED from it in-DB
--     ("{n} clases" / "1 clase" / "Ilimitado"), so the label and the grant can never drift, and every
--     consumer (vender, recibo, fmtPrecios, respaldo) auto-flows. crearVenta still re-reads clases LIVE
--     at sale time and snapshots it onto the immutable ventas row, so existing clients are untouched.
--     `clases` is a trailing DEFAULT NULL param (the ilimitado case), mirroring registrar_venta so the
--     generated TS keeps it optional without `as any`. The signature changes, so DROP + CREATE.
--     `set search_path to ''` keeps it injection-safe and clears the function_search_path_mutable advisor.

-- (a) single-favorite invariant
create unique index if not exists paquetes_one_popular on public.paquetes (user_id) where popular;

-- (b) clases range guard (defense-in-depth; app validates 1-30 too)
alter table public.paquetes add constraint paquetes_clases_ck check (clases is null or (clases between 1 and 30));

-- (c) RPC v2 — signature changes, so DROP the old + CREATE new
drop function if exists public.actualizar_paquete(uuid, text, int, boolean);
create function public.actualizar_paquete(p_id uuid, p_precio int, p_popular boolean, p_clases int default null)
  returns void language plpgsql security invoker set search_path to '' as $function$
declare v_uid uuid; v_nombre text;
begin
  v_uid := (select auth.uid()); if v_uid is null then raise exception 'No autenticado'; end if;
  -- mirrors src/domain/rules.ts nombrePaquete (tested-TS spec, ADR-0005)
  v_nombre := case when p_clases is null then 'Ilimitado' when p_clases = 1 then '1 clase' else p_clases::text || ' clases' end;
  if p_popular then
    update public.paquetes set popular = false where popular and id <> p_id;  -- demote siblings (RLS owner-scoped)
  end if;
  update public.paquetes set nombre = v_nombre, clases = p_clases, precio = p_precio, popular = p_popular,
         vigencia_tipo = 'dias', vigencia_dias = 30 where id = p_id;
  if not found then raise exception 'Paquete no encontrado'; end if;
end; $function$;

-- Least privilege (matches the prior actualizar_paquete + registrar_venta hardening): the DROP+CREATE
-- re-triggers Supabase's default grants to public + anon; revoke both, grant only to authenticated. The
-- auth.uid() guard already fails closed for anon; revoking is defense-in-depth.
revoke execute on function public.actualizar_paquete(uuid, int, boolean, int) from public;
revoke execute on function public.actualizar_paquete(uuid, int, boolean, int) from anon;
grant  execute on function public.actualizar_paquete(uuid, int, boolean, int) to authenticated;
