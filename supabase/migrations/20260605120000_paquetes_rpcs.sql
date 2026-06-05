-- paquetes write seam (ADR-0005): one SECURITY INVOKER RPC. actualizar_paquete is an owner-scoped
-- single-row write of nombre/precio/popular only (RLS is the boundary, ADR-0001); it deliberately
-- omits clases/vigencia (editing those would change future-buyer grants, since crearVenta re-reads
-- them live at sale time) and HARD-NORMALIZES every edited row to the 30-day vigencia invariant
-- (vigencia_tipo='dias', vigencia_dias=30), which also satisfies the paquetes_vigencia_ck CHECK by
-- construction. `set search_path to ''` keeps it injection-safe and clears the
-- function_search_path_mutable advisor.

create or replace function public.actualizar_paquete(p_id uuid, p_nombre text, p_precio int, p_popular boolean)
 returns void
 language plpgsql
 security invoker
 set search_path to ''
as $function$
declare
  v_uid uuid;
begin
  v_uid := (select auth.uid());
  if v_uid is null then raise exception 'No autenticado'; end if;
  update public.paquetes
     set nombre = p_nombre,
         precio = p_precio,
         popular = p_popular,
         vigencia_tipo = 'dias',   -- 30-day policy as an in-DB invariant
         vigencia_dias = 30
   where id = p_id;                -- RLS scopes the row to the owner
  if not found then raise exception 'Paquete no encontrado'; end if;
end;
$function$;

-- Least privilege: CREATE FUNCTION grants EXECUTE to public, and Supabase default privileges
-- also grant it to anon. Revoke both, then grant only to authenticated — matching the
-- registrar_venta hardening (20260601010843) for a business-record (price) write. The auth.uid()
-- guard above already fails closed for anon; revoking is defense-in-depth.
revoke execute on function public.actualizar_paquete(uuid, text, int, boolean) from public;
revoke execute on function public.actualizar_paquete(uuid, text, int, boolean) from anon;
grant  execute on function public.actualizar_paquete(uuid, text, int, boolean) to authenticated;
