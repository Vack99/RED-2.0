# Handoff — Forge Supabase migration (slices 1–5 shipped) + skill extraction unblocked

**Date:** 2026-05-29 · **Repo:** `forge-1.0` · **Branch:** `feat/supabase-infra-perfil`
(local-only, no remote) @ `0b99c0b` · working tree: only `.mcp.json` untracked (keep local).
**For:** a fresh session finishing the migration (#6–#8) and/or starting Goal B.

This doc references artifacts instead of repeating them — read those, don't re-derive.

---

## Where things stand (1 paragraph)

The mock→Supabase migration is **mid-flight, 5 of 8 slices shipped** on `feat/supabase-infra-perfil`.
The app now runs on **real Supabase**: auth-gated single-operator login, real **ventas**
(stacking + DB folio + recibo), real **asistencia** (absolute-date rows + consume/restore),
and **clientes** roster + ficha **derived-at-read**. Each slice was committed with gates green
(`pnpm lint` incl. dependency-cruiser · `pnpm test` · `pnpm build`). Verified **headless**: RLS
isolation (anon sees nothing), folio uniqueness, and **36 unit tests** (28 domain + 8 for the new
pure `derive.ts`). The full UI flows (login, a stacking sale, mark/undo attendance, roster/ficha)
are the **operator's in-browser check** — they need real credentials.

**Supabase:** project `hjppxawglmukfvsgmcog`; MCP wired via `.mcp.json` (untracked).
Runtime env in `.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
Auth user `forge-1.0@outlook.com` (uuid `b63053f1-9202-4789-bc5b-fd4ccd091de0`); `perfil` + `paquetes`
seeded for that operator.

Read these (don't duplicate):
- Migration PRD: `docs/prds/prd-supabase-migration.md`
- **Issue queue + live status: `docs/issues/README.md`** + `0001..0008` (status lines mark #1–#5 ✅)
- ADRs: `docs/adr/0001-0004` (**0004** = stored-running-balance saldo, new this cycle)
- Schema mirror: `supabase/migrations/*.sql` (4 migrations: perfil, ventas_core, asistencias, clientes_email_birthday)
- Domain core: `src/domain/rules.ts` + `rules.test.ts`; pure DTO derivation: `src/lib/data/derive.ts` + `derive.test.ts`
- Memory: `forge-pnpm-add-prefer-offline`, `forge-sector-first`, `forge-stack`, `forge-project`

---

## GOAL A — finish the migration (#6, #7, #8)

Remaining AFK queue (all unblocked; details in `docs/issues/`):

- **#6 retención** (`0006-retencion-plantillas.md`) — **small**. A `plantillas` table + RLS; route the
  **recibo** confirmation (built in `src/lib/data/ventas.ts`) and the **ficha** recordatorio (built in
  `src/lib/data/clientes.ts`) through **stored** plantilla rows instead of the current inline body
  constants. `renderPlantilla` + the `waText` pattern + `waLink` (+52, in `src/lib/format.ts`) already
  exist — this mostly swaps inline bodies for DB-stored templates. Reconcile spec §7's `{paquete}` note
  (the code already supports it; it's a doc fix). Blocked by #3 + #5 (both done).
- **#7 dashboard** (`0007-dashboard-cuenta-resumen.md`) — **medium**. Add the NEW pure domain rule
  **`calcularResumenMes`** (+ unit tests — the **second TDD target**, mirror `derive.test.ts`/`rules.test.ts`)
  aggregating ventas + asistencias; wire **inicio** (asistencias hoy/ayer, vigentes, ingresos, sparkline,
  today's recientes) and **cuenta** "Resumen del mes" off real data; add a `cobro` table for `{datos_pago}`.
  `inicio.tsx` + `cuenta.tsx` still read `HOY` from `seed.ts` — this replaces it. Sub-editors stay
  "próximamente". Blocked by #3 + #4 (both done).
- **#8 cleanup** (`0008-retire-mock-seam.md`) — **medium**. Delete `src/lib/data/store.ts` + `seed.ts` +
  the **offset-date** parts of `src/lib/date.ts` (`DEMO_TODAY`, `dateFromOffset`, `offsetFromToday`) — but
  KEEP the pure helpers still used (`addDays`, `startOfDay`, `isoDay`, `sameDay`, `fmtFull`, `fmtShort`,
  `DOW`, `MON`). Converge legacy `src/lib/data/types.ts` onto `src/domain/types` (the `MetodoPago` dup);
  final `"Forge Bootcamp"` grep-sweep; enable dependency-cruiser **`no-orphans`** (currently deferred —
  should be clean: the browser `client.ts` is used by the login form, `server.ts`/`database.types` are
  used widely). Blocked by #3–#7. Do this LAST, after #6 + #7 stop importing `HOY`/`store`.

---

## Operational gotchas (learned this cycle — don't relearn)

- **`pnpm add` 404s on `@next/swc`** on this vendored Next 16 → use **`pnpm add <pkgs> --prefer-offline`**
  (cached metadata; a failed add leaves `package.json`/lockfile untouched). [[forge-pnpm-add-prefer-offline]]
- **Verify framework APIs against the BUNDLED docs** (`node_modules/next/dist/docs`) + installed package
  types, never training data. Catches this cycle: `proxy.ts` not `middleware.ts` (`export function proxy`);
  `await cookies()` (async); **`setAll(cookiesToSet, headers)` is 2-arg** in `@supabase/ssr` 0.10 — the
  `headers` carry cache-control and MUST be set on the response; **`updateTag(tag)` is SINGLE-arg and needs
  `cacheComponents`** (NOT enabled) → use **`revalidateTag('clientes','max')`** (2-arg; single-arg is
  deprecated); `getClaims()` exists in `auth-js` 2.106 and is the authz call (never `getSession()`).
- **Chihuahua-local dates:** the domain reads a Date's LOCAL components, so always hand it a Date whose
  local Y/M/D equals the Chihuahua calendar date. Helpers in **`src/lib/fecha.ts`**
  (`hoyChihuahua`/`parseDay`/`toIsoDay`/`hoyIsoChihuahua`/`horaChihuahua`/`fechaChihuahua`). Never feed a raw
  UTC Date to the domain.
- **RLS pattern:** every table gets `enable row level security` + 3 owner policies
  `to authenticated ... ((select auth.uid()) = user_id)`. Verify headless:
  `begin; set local role anon; select count(*) ...; rollback;` (anon → 0). `service_role`/`postgres`
  BYPASS RLS — you must `SET ROLE` to test it.
- **Schema workflow:** apply via MCP `apply_migration`, THEN mirror the exact SQL to
  `supabase/migrations/<version>_<name>.sql` (get `<version>` from `list_migrations`). Seed
  operator-scoped data (perfil/paquetes) via `execute_sql` — it references the auth uid, so it is NOT a
  repo migration. Run `get_advisors(security)` after DDL.
- **Caching:** reads are dynamic (cookies) so `revalidateTag` is a forward-looking no-op until the DAL
  adopts `'use cache'` + `cacheTag('clientes')` (a future perf pass).
- **Don't commit `.mcp.json`** — the auto-classifier blocks it as a possible secret; it's only the
  `project_ref` URL. Keep it local/untracked.
- **Git:** repo-local identity `vack99 <d3bigwlf@gmail.com>`; no remote; the whole cycle lives on
  `feat/supabase-infra-perfil`. LF→CRLF warnings are benign (Windows). The Husky pre-commit hook runs
  `pnpm lint` on every commit.
- **`forgeToast` tones:** `success | warning | info` (no `error` — use `warning`).

## Open / deferred

- **Pre-existing advisor WARNs** (NOT introduced by this work, surfaced via `get_advisors`):
  `public.rls_auto_enable()` is `SECURITY DEFINER` callable by `anon` (investigate origin; revoke EXECUTE
  or switch to SECURITY INVOKER); Auth **leaked-password protection disabled** (enable in Auth settings).
  Flag to the operator.
- **Browser verification pending** for #2–#5 (login; sale + stacking; attendance + undo + back-entry;
  roster/ficha) — operator-side with real credentials.

---

## GOAL B — extract the `sector-map` skill (NOW UNBLOCKED)

The prior handoff's gate was: extract the SECTOR-FIRST framework into a reusable skill **only after Forge
proves it end-to-end.** **That bar is now met** — 5 real slices shipped cleanly through the sectored
architecture and the ONE enforced boundary never produced a violation. Goal B is ready to start (after, or
in parallel with, #6–#8).

- **Design:** spec **Appendix A** (`docs/superpowers/specs/2026-05-29-forge-sector-architecture-design.md`).
  Working name **`sector-map`**; the predecessor to `/improve-codebase-architecture`; trigger = "a cloned
  claude.ai/design mock → navigable, auditable, sectored architecture **before** implementation."
- **Build with** `write-a-skill`; compose with `grill-with-docs` (ADRs/glossary), `to-prd`/`to-issues`/`to-goal`
  (backlog → shipping), and `improve-codebase-architecture` (once real code exists).
- **Framework learnings now CONFIRMED by the implementation cycle** (not just theory — bake these in):
  - The 6 content-neutral phases held: **Archaeology → Glossary (`CONTEXT.md`) → Lock ADRs → Sector map
    (`ARCHITECTURE.md`) → Skeleton-move + ONE enforced boundary → Migration backlog (`MIGRATION.md`)**.
    Every slice landed cleanly because the seam + boundary were defined first.
  - **The pure domain core as deliverable-one paid off enormously:** `stackPaquete`/`consumirClase`/`forfeit`/
    `derivarEstado`/`calcVigenciaEnd`/`renderPlantilla` were wired into 4 slices with **zero reimplementation**;
    the pure row→DTO `derive.ts` is independently unit-tested. Make "extract + TDD the domain rules" phase-one
    of any clone→real skill.
  - **The single dependency-cruiser boundary + pre-commit hook is the anti-rot core** — it bit every commit and
    held across 5 slices. The deferred `no-orphans` rule is the planned tightening (#8).
  - **The to-prd → to-issues → to-goal pipeline ran on LOCAL markdown** (`docs/prds/` + `docs/issues/`) with no
    GitHub tracker. The skill should support a **local-issue-store mode** — the `gh`-based orchestrator is one
    backend, not the only one. (This session built that adaptation by hand.)
  - **"Verify framework APIs against bundled docs before writing code"** (AGENTS.md) was load-bearing on a
    pinned/vendored framework — a clone→real skill should make this an explicit archaeology step, plus run
    `eslint .` early (the prior cycle's catch).
  - Each slice = schema → `server-only` DAL (DTOs + domain calls) → thin Server Action (re-auth + Zod +
    `revalidateTag`) → screen wiring. This vertical-slice shape is the reusable execution template.

---

## Suggested skills for the next session

- `to-goal` (or `executing-plans` / `subagent-driven-development`) — run #6–#8, or generate the orchestrator
  prompt (note the local-issue-store adaptation).
- `test-driven-development` — for `calcularResumenMes` (#7), like `derive.test.ts` / `rules.test.ts`.
- `verification-before-completion` / `requesting-code-review` — before claiming the branch done.
- `finishing-a-development-branch` — once #8 lands + browser verification passes (merge
  `feat/supabase-infra-perfil`; decide whether to add a remote).
- For Goal B: `write-a-skill` (+ `grill-with-docs`, `improve-codebase-architecture`).

**First action in the new session:** confirm the Supabase MCP is live + read `docs/issues/README.md`;
then run **#6 (retención)** or generate the `to-goal` orchestrator prompt for #6–#8. Goal B (`sector-map`
skill) starts once #6–#8 ship, or in parallel via a separate session.
