# Issue 8 — Retire the mock seam + tighten the boundary

> **Source:** docs/prds/prd-supabase-migration.md · **Type:** AFK · **Labels:** `ready-for-agent`

## What to build

Remove the scaffolding now that every sector reads real data. Delete the `localStorage`
store, `seed.ts`, and the offset-date model (`DEMO_TODAY` / `VIG_END` / `PaseGrid` /
`offsetFromToday`); converge the legacy `lib/data` types onto the domain types
(`MetodoPago`, `Clases`, `Vigencia`); sweep any remaining `"Forge Bootcamp"` literals;
enable the deferred dependency-cruiser `no-orphans` rule now that the domain core is
wired in; and confirm the whole suite is green.

## Acceptance criteria

- [ ] `localStorage` store, `seed.ts`, and the offset-date scaffolding (`DEMO_TODAY`, `VIG_END`, `PaseGrid`, `offsetFromToday`/`dateFromOffset`) deleted; no screen imports them.
- [ ] Legacy `lib/data` types converged onto `src/domain/types` (no duplicate `MetodoPago`; legacy `"∞"` / vigencia-string sentinels gone).
- [ ] Zero `"Forge Bootcamp"` literals remain anywhere (app, metadata, footer, templates, seed).
- [ ] dependency-cruiser `no-orphans` rule enabled and green.
- [ ] `pnpm lint` (incl. both depcruise rules) + `pnpm test` + `pnpm build` all green.

## Blocked by

#3 — ventas off mock.
#4 — asistencia off mock.
#5 — clientes off mock.
#6 — retención off mock.
#7 — dashboard/cuenta off mock.
