-- plantillas → freeform named templates: CONTRACT step. The `clave` column is now unused (all
-- readers migrated to listarPlantillas/nombre). Its semantic content was backfilled into `nombre`
-- by 20260602130000_plantillas_freeform_expand. Safe to drop. (ADR-0005: created as a migration.)
alter table public.plantillas drop column clave;
