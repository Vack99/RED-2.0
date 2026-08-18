-- #273: constrain gym.brand_module_id to the brand registry's module ids.
--
-- A write assigning an unknown module id no longer silently downgrades the tenant
-- to the default skin (the layout's DEFAULT_BRAND fallback) — it fails loudly at
-- the database. The id set is deliberately COUPLED to the code registry
-- (packages/brand/src/registry.ts): adding a brand module already requires a
-- deploy, so that same future migration extends this constraint (drop + re-add
-- with the new id). All live rows verified compliant before this ran (forge/red).
alter table public.gym
  add constraint gym_brand_module_id_check
  check (brand_module_id in ('base', 'forge', 'red'));
