# Issue 8 — Retire the mock seam + tighten the boundary

> **Source:** docs/prds/prd-supabase-migration.md · **Type:** AFK · **Labels:** `ready-for-agent`
>
> **Status:** ✅ Done @75a9c44 — gates green; both fresh-eyes gates YES (Elegance + Senior Dev).
> store.ts/seed.ts/legacy-types.ts deleted; offset-date scaffolding removed (pure helpers kept);
> `no-orphans` enabled + green (68 modules). The migration is complete — pending operator
> in-browser verification before merge.

## What to build

Remove the scaffolding now that every sector reads real data. Delete the `localStorage`
store, `seed.ts`, and the offset-date model (`DEMO_TODAY` / `VIG_END` / `PaseGrid` /
`offsetFromToday`); converge the legacy `lib/data` types onto the domain types
(`MetodoPago`, `Clases`, `Vigencia`); sweep any remaining `"Forge Bootcamp"` literals;
enable the deferred dependency-cruiser `no-orphans` rule now that the domain core is
wired in; and confirm the whole suite is green.

## Acceptance criteria

- [x] `localStorage` store, `seed.ts`, and the offset-date scaffolding (`DEMO_TODAY`, `PaseGrid`, `offsetFromToday`/`dateFromOffset`) deleted; no screen imports them. (`VIG_END` was already gone in an earlier slice.)
- [x] Legacy `lib/data` types converged onto `src/domain/types` (no duplicate `MetodoPago`; legacy `"∞"`/`ClasesRest` + vigencia-string sentinels gone — they left with `lib/data/types.ts`).
- [x] Zero `"Forge Bootcamp"` **literals** remain anywhere (only an explanatory `//` comment in `ventas.ts` referencing the absence).
- [x] dependency-cruiser `no-orphans` rule enabled and green (68 modules; entry points excluded via `pathNot`).
- [x] `pnpm lint` (incl. all depcruise rules) + `pnpm test` (45/45) + `pnpm build` all green.

## Blocked by

#3 — ventas off mock.
#4 — asistencia off mock.
#5 — clientes off mock.
#6 — retención off mock.
#7 — dashboard/cuenta off mock.
