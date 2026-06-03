-- plantillas → freeform named templates: EXPAND step (expand/contract / parallel-change).
-- Non-destructive: add `nombre` (backfilled from clave), relax the fixed-key constraints, add the
-- missing DELETE policy + length guards. `clave` is kept NULLABLE so the existing getPlantillas/
-- getPlantilla readers keep compiling+running until their callers migrate; it is dropped in the
-- later contract migration (20260602140000) once nothing reads it. (ADR-0005: created as a migration.)

alter table public.plantillas add column nombre text;

update public.plantillas set nombre = case clave
  when 'recibo'       then 'Recibo'
  when 'recordatorio' then 'Recordatorio'
  when 'renovar'      then 'Renovación'
  when 'ultima'       then 'Última llamada'
  else initcap(clave)
end where nombre is null;

alter table public.plantillas alter column nombre set not null;

-- Relax the fixed-key model: names are free; clave is no longer required or unique.
-- (Constraint name confirmed via pg_constraint: plantillas_user_id_clave_key.)
alter table public.plantillas drop constraint plantillas_user_id_clave_key;
alter table public.plantillas alter column clave drop not null;

-- Defense-in-depth length guards (alongside the zod schema).
alter table public.plantillas
  add constraint plantillas_nombre_len_ck check (char_length(nombre) between 1 and 40),
  add constraint plantillas_body_len_ck   check (char_length(body)   between 1 and 1000);

-- The original migration shipped select/insert/update policies but NO delete policy; add it.
create policy "plantillas owner delete" on public.plantillas
  for delete to authenticated using ((select auth.uid()) = user_id);
