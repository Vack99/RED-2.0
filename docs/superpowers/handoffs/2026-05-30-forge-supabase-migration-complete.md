# Handoff — Forge Supabase migration COMPLETE (all 8 slices) + sector-map skill shipped

**Date:** 2026-05-30 · **Repo:** `forge-1.0` · **Branch:** `feat/supabase-infra-perfil`
(local-only, no remote) @ `3d270b7` · working tree: only `.mcp.json` + `docs/prompts/` untracked
(keep both local; never commit `.mcp.json`).
**For:** a fresh session that picks up AFTER the operator's in-browser verification — to finish the
branch (merge / remote decision), or to act on the deferred follow-ups below.

This doc references artifacts instead of repeating them — read those, don't re-derive.

---

## Where things stand (1 paragraph)

The mock→Supabase migration is **DONE — all 8 of 8 slices shipped** on `feat/supabase-infra-perfil`.
Forge now runs entirely on real Supabase: auth-gated login, real ventas (stacking + DB folio +
recibo), real asistencia (absolute-date rows + consume/restore), clientes roster + ficha
derived-at-read, stored WhatsApp **plantillas**, a real **dashboard/cuenta** resumen, and the mock
seam is **deleted**. Predecessor cycle (#1–#5) is in the prior handoff
`docs/superpowers/handoffs/2026-05-29-forge-supabase-midcycle.md`. This session shipped **#6, #7, #8**.
The single deferred gate (`no-orphans`) is now **enabled and green**. The branch is **not merged**
and there is **no remote** — that is the next decision, gated on the operator's browser check.

**Supabase:** project `hjppxawglmukfvsgmcog`; MCP wired via `.mcp.json` (untracked). Runtime env in
`.env.local` (gitignored). Auth user `forge-1.0@outlook.com` (uuid
`b63053f1-9202-4789-bc5b-fd4ccd091de0`). **7 RLS tables** (perfil, clientes, paquetes, ventas,
asistencias, plantillas, cobro), **6 migrations** (mirrored in `supabase/migrations/`), all seeded
operator-scoped (perfil×1, paquetes×3, plantillas×4, cobro×1).

---

## What shipped this session (read the commits, don't re-derive)

| Slice | Commit | Issue file |
|---|---|---|
| #6 retención — `plantillas` table + both WA builders converged through `renderPlantilla` (`{negocio}` token) | `4ada644` | `docs/issues/0006-retencion-plantillas.md` |
| #7 dashboard — pure `calcularResumenMes` + `ResumenMes` (8 TDD cases); `cobro` table; inicio + cuenta off real data; `HOY` seed removed | `7aaaa8a` | `docs/issues/0007-dashboard-cuenta-resumen.md` |
| #8 cleanup — deleted `store.ts`/`seed.ts`/legacy `types.ts` + offset-date scaffolding; enabled depcruise `no-orphans` | `48f4de9` | `docs/issues/0008-retire-mock-seam.md` |

Live queue status + the per-slice acceptance-criteria ticks: **`docs/issues/README.md`** (all 8 marked ✅).
Each slice passed **two independent fresh-eyes gate-checkers** (Elegance + Senior Dev) before commit;
verdicts are summarized in each slice's commit body + issue status line.

Branch-tip gates (re-verified): **`pnpm lint`** clean (68 modules, eslint + dependency-cruiser incl.
`no-orphans`) · **`pnpm test`** 45/45 (37 domain + 8 new `calcularResumenMes`) · **`pnpm build`** clean
(all `(app)` routes dynamic ƒ). New tables verified headless (`set local role anon; select count(*)` → 0).

---

## GOAL A — finish the branch (the next action)

The migration code is complete. The remaining work is **integration, gated on the operator**:

1. **Operator in-browser verification (HITL — do this FIRST, with real credentials).** Not yet done.
   Flows: login · sale + stacking (recibo WA renders, brand = FORGE) · attendance mark/undo/back-enter ·
   roster/ficha (derived estado/vence/clases, real HISTORIAL/PAGOS, recordatorio WA) · dashboard +
   cuenta "Resumen del mes". To launch: `! pnpm dev` (or the `run` skill).
2. **After it passes:** decide merge strategy for `feat/supabase-infra-perfil` (→ `main`/`master`?
   note: local default branch is `master`) and whether to add a git remote. Use
   `superpowers:finishing-a-development-branch`. Repo-local git identity is `vack99 <d3bigwlf@gmail.com>`.

---

## Deferred follow-ups (surfaced by the gates this cycle — NOT blockers)

- **Pre-existing advisor WARNs** (NOT introduced by this work; flagged via `get_advisors(security)`):
  - `public.rls_auto_enable()` is `SECURITY DEFINER` callable by `anon` — investigate origin; revoke
    EXECUTE or switch to `SECURITY INVOKER`.
  - Auth **leaked-password protection disabled** — enable in Auth settings (HaveIBeenPwned).
- **`{datos_pago}` token not yet injected into a sent message.** #7 created the `cobro` table + `getCobro`
  DTO and cuenta shows real cobro; `renderPlantilla` already supports `{datos_pago}` generically, but no
  builder passes it yet. Lands naturally with a future retención/plantilla **editor** slice.
- **Dead `format.ts#clasesLabel(number | "∞")`** — a Senior-Dev gate (slice #8) found this exported
  function has zero call sites (screens use inline labels / `derive.ts#clasesRestLabel`). It carries the
  legacy `"∞"` type and survives because `no-orphans` is module-granular. Pre-existing (committed in the
  ventas slice `e26f624`), out of #8's scope — worth a one-line cleanup.
- **Doc drift from #8:** `CONTEXT.md` (term→type→file table) and `src/domain/types.ts:7` still point at
  the now-deleted `src/lib/data/types.ts` as the home of `Cliente`/`Paquete`/`Cobro` and describe
  convergence as pending. An Elegance gate flagged this as slice-induced staleness; a small sweep would
  reconcile them to `src/domain/types.ts`.
- **cuenta sub-editors** (Plantillas / Notificaciones / Datos de cobro / Editar perfil / Editor de
  paquetes) remain "próximamente" stubs showing real data — out of scope for this epic by design.

---

## Operational notes (this cycle — process lessons)

- **Per-slice pattern that worked:** orchestrator (main session) owns Supabase schema via MCP
  (apply_migration → mirror SQL to `supabase/migrations/<version>_<name>.sql` with version from
  `list_migrations` → regen `src/lib/supabase/database.types.ts` → `get_advisors` → headless anon RLS
  check) → ONE implementation subagent owns the code → TWO independent fresh-eyes gate-checkers
  (Elegance + Senior Dev, verbatim prompts from `~/.claude/skills/to-goal/gate-prompts.md`) → commit
  only on YES/YES → update issue status line + `docs/issues/README.md`.
- **Three self-inflicted mistakes, all caught before a clean commit — avoid these:**
  1. **Never write a migration-mirror filename or a commit sha into docs/code before it exists.** The
     MCP assigns the migration `version` (get it from `list_migrations` AFTER apply); the sha exists only
     AFTER `git commit`. Guessing them produced wrong values in #6 (filename), #7 (filename), and #8 (sha,
     fixed in `3d270b7`).
  2. **Don't run your own inline edits on the same files a dispatched subagent is editing** — in #7 this
     created duplicate type declarations in `types.ts` (TS merged them so the build passed; caught via a
     duplicate-identifier grep). Let the subagent own its files end-to-end.
  3. Re-running gates after any fix is mandatory (the protocol re-dispatches BOTH gates, since fixing one
     can regress the other).
- **Gotchas (full list in the 2026-05-29 handoff):** verify Next 16 / `@supabase/ssr` APIs against the
  BUNDLED docs (`node_modules/next/dist/docs`) — `proxy.ts` not `middleware.ts`, `await cookies()`,
  2-arg `revalidateTag(tag,'max')`, `getClaims()` not `getSession()`. `pnpm add <pkgs> --prefer-offline`.
  Chihuahua-local dates ONLY via `src/lib/fecha.ts` (the offset-date `src/lib/date.ts` scaffolding is now
  deleted; `date.ts` keeps only pure helpers). `forgeToast` tones = success|warning|info. Never run
  `husky` with an argument. The enforced boundary: `src/domain` + `src/lib` ✗→ `src/components` + `src/app`.

---

## GOAL B — `sector-map` skill: DONE this session

Extracted to `C:\Users\Aaron\.claude\skills\sector-map\` (`SKILL.md` + `PHASES.md` + `TEMPLATES.md`);
auto-discovered (appears in the skills list). It codifies the 6 content-neutral phases + the confirmed
framework learnings + local-issue-store mode; predecessor to `improve-codebase-architecture`. The
framework is now proven end-to-end (8 real slices, the one boundary never violated). Memory updated:
`forge-sector-first.md`. No further action unless you want to refine the skill after using it once.

Also produced (per the operator's first choice, though slices were ultimately run orchestrated from the
main session): the `/to-goal` sweep orchestrator at **`docs/prompts/goal-forge-supabase-finish.md`**
(local-issue-store mode, sequential K=1, fresh-eyes gates) — kept as a reusable reference for the
local-issue-store `/to-goal` adaptation. It is untracked under `docs/prompts/`.

---

## Suggested skills for the next session

- **`run`** (or `! pnpm dev`) — launch the app for the operator's in-browser verification (Goal A step 1).
- **`verify`** — if confirming specific flows (sale+stack, attendance undo) behave correctly in the app.
- **`superpowers:finishing-a-development-branch`** — once verification passes, to choose merge / remote.
- **`diagnose`** / **`superpowers:systematic-debugging`** — if the browser check surfaces a bug.
- For the deferred follow-ups: plain edits + the per-slice gate discipline above (no new schema needed
  except the advisor-WARN remediation, which is a Supabase Auth-settings + a tiny SQL `revoke`).

**First action in the new session:** confirm the Supabase MCP is live (`list_tables` on
`hjppxawglmukfvsgmcog`) + `.env.local` present, then launch the app for the operator's verification.
Do NOT merge or add a remote until the operator confirms the flows.
