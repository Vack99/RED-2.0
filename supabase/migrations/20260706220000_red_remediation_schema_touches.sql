-- Small schema touches for the RED client design-fidelity remediation (Slice 9,
-- docs/planning/2026-07-06-red-client-design-remediation.md §6/§4). Three additive,
-- all-nullable columns feeding three screens; no new table, per that doc's
-- keep-it-lean instruction to prefer existing homes over new structure. A fourth
-- candidate (the confirmada "Estudio" address row) needed NO column: `gym_contact`
-- (20260706170000_create_gym_contact) already carries `address_line`/`address_note`.
--
-- Expand-only (add-column-if-not-exists only, no existing object altered otherwise),
-- idempotent, safe on a fresh scratch AND out-of-order on the live project. Reads
-- are NOT wired into any screen by this migration — that lands just-in-time with
-- each screen's Slice 7/8 restyle; this file only clears the schema/type path.

-- ── paquetes.nota — the Precios page's per-plan note (§4 "Precios" row) ────────────
-- Free-text, display-only; orthogonal to the money/grant columns (clases/popular/
-- precio) the S38 tripwire (20260706143800) protects — this is a marketing scalar
-- exactly like that migration's code/name/subtitle/badge/cadence, so it gets the
-- same no-constraint treatment.
alter table public.paquetes add column if not exists nota text;

-- ── class_type_workblock.value — the Clase-detalle "Qué trabajamos" 2nd column ─────
-- (§4 "Clase detalle" row). `label` already holds the segment name ("Calentamiento");
-- `value` is its paired display value ("10 min", "AMRAP 12"). Nullable: a workblock
-- with no value still renders as a single-column label (today's shape), so existing
-- rows keep working unchanged.
alter table public.class_type_workblock add column if not exists value text;

-- ── gym.about_story / about_pull_quote / about_tagline — Nosotros "la fragua" copy ─
-- (§4 "Nosotros" row). One row per gym already (the tenant spine, 20260702150000), so
-- this is a 1:1 satellite of content, not a list — columns on `gym` fit; a new table
-- would be unearned structure for three scalars. All nullable: a gym that hasn't
-- authored its story renders the page's existing fallback (operator stats/roster).
alter table public.gym add column if not exists about_story text;
alter table public.gym add column if not exists about_pull_quote text;
alter table public.gym add column if not exists about_tagline text;
