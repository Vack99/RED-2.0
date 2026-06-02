# Handoff — Respaldo Export, Phase 1 implementation

**Date:** 2026-06-02 · **Author session:** grill-with-docs → to-prd → handoff (design only; no feature code written) · **Feature:** `respaldo` (operator's weekly Excel export of the gym record)

---

## TL;DR

The **respaldo** export feature was fully grilled and speced this session. All design
decisions are locked and captured in three docs (below). **Phase 1 (on-demand download) is
ready to implement.** Phase 2 (automated weekly email) is designed and deferred. **No feature
code was written.** Your first job is to *secure three uncommitted doc files* (see ⚠️ below),
then implement Phase 1 TDD-first.

**The durable spec — read these first (do not re-litigate the decisions):**
- `docs/adr/0006-respaldo-operational-export.md` — the load-bearing decision (report ≠ DR backup) + the generation architecture + phasing.
- `docs/prds/prd-respaldo-export.md` — full PRD: problem, solution, user stories, module/test decisions, out-of-scope.
- `CONTEXT.md` — the **respaldo** glossary row + flagged-tension disambiguation (this edit is *uncommitted* — see ⚠️).

---

## ⚠️ FIRST THING: secure the uncommitted work (live git collision)

This repo is being worked by **3 concurrent sessions sharing ONE checkout** at
`C:\Users\Aaron\Documents\Repos\forge-1.0`. During this session the working tree's branch
**changed underneath us** — we started on `arch/third-deepening-pass`, and another session
(running the DB-architecture-audit skill) **deleted that branch and switched the checkout to
`main`** (now at `7b52e01`). The respaldo work rode along and is currently **uncommitted on
`main`**, in a tree another session is actively committing to.

**Current uncommitted state (verified 2026-06-02, on `main`):**
- `M CONTEXT.md` — diff vs `main` is **clean, respaldo-only** (the `vigentes` row is already committed on `main`, so it is NOT part of this diff). Full diff embedded below for recovery.
- `?? docs/adr/0006-respaldo-operational-export.md` — new, 79 lines, intact.
- `?? docs/prds/prd-respaldo-export.md` — new, 98 lines, intact.
- `?? docs/superpowers/handoffs/2026-06-02-forge-respaldo-phase1-implementation.md` — this file.

**Risk:** another session's `git add -A && commit`, `git checkout -- CONTEXT.md`, `git stash`,
or `git clean -fd` could absorb or destroy this work. **Commit it onto its own branch ASAP.**

### Recommended detangle — isolate WITHOUT disturbing the other session

Because the `CONTEXT.md` diff is clean vs `main`, this is now simple. Base the feature branch
on **`main`** (current default; already contains everything the diff sits on top of). Do NOT
switch the primary checkout's branch or `git stash` in it — that would disrupt the other
session. Instead create a separate worktree from `main` and copy the work in:

```bash
# From the primary checkout (currently on main). Do NOT change its branch.
# 1. Create an isolated worktree on a new feature branch based on main.
#    A private `origin` remote now EXISTS (github.com/Vack99/forge-1.0, default branch main),
#    so the EnterWorktree harness tool now works too (its default baseRef='fresh' branches from
#    origin/main). Either approach is fine; the git-CLI form below bases explicitly and uses a
#    sibling dir to avoid any .gitignore concern. RE-VERIFY `git remote -v` first — this repo's
#    state is volatile (the remote appeared mid-session via another session).
git worktree add -b feat/respaldo-export ../forge-respaldo origin/main   # or: main

# 2. Copy the two NEW doc files into the worktree (they are untracked — copy, don't move,
#    so the primary tree is unchanged for the other session):
cp docs/adr/0006-respaldo-operational-export.md ../forge-respaldo/docs/adr/
cp docs/prds/prd-respaldo-export.md             ../forge-respaldo/docs/prds/
cp docs/superpowers/handoffs/2026-06-02-forge-respaldo-phase1-implementation.md ../forge-respaldo/docs/superpowers/handoffs/

# 3. Re-apply the CONTEXT.md respaldo edit in the worktree. The diff vs main is clean, so the
#    patch below applies cleanly. From ../forge-respaldo, either hand-edit per the diff or:
#      git apply <the embedded patch saved to a file>

# 4. In the worktree: verify the boundary + tests are green, then commit.
cd ../forge-respaldo
pnpm install            # worktree needs its own node_modules
pnpm lint && pnpm test  # lint runs dependency-cruiser (the enforced boundary) + the suite
git add CONTEXT.md docs/adr/0006-* docs/prds/prd-respaldo-export.md docs/superpowers/handoffs/2026-06-02-*
git commit -m "docs(respaldo): glossary term + ADR-0006 + PRD for the Excel export feature"

# 5. The primary checkout still has the now-duplicated uncommitted changes on main. Once the
#    commit above is confirmed, revert them there so the other session has a clean tree:
#      cd <primary>; git checkout -- CONTEXT.md; rm docs/adr/0006-* docs/prds/prd-respaldo-export.md
#    (Coordinate with the other session before touching the shared tree.)
```

If the worktree dance feels risky while another session is active, the minimal safe alternative
is to just commit onto a feature branch in the primary tree the instant the other session is
idle. Either way: **get these files committed before writing any feature code.**

### Recovery patch — the entire `CONTEXT.md` edit (in case it is lost)

```diff
@@ -23,5 +23,6 @@ type and a file, so a rename surfaces drift. Distilled from the client brief
 | **cobro** | Payment/bank details for transfers (titular, banco, CLABE). | `CobroDTO` — `src/lib/data/cobro.ts` |
 | **perfil** | The single operator's profile + brand (`negocio` = "FORGE", coach, ciudad). | `PerfilDTO` — `src/lib/data/perfil.ts` |
 | **por pagar** / **pendiente** | An optional unpaid sale. | `MetodoPago` `"pendiente"` — `src/domain/types.ts` |
+| **respaldo** | The operator's weekly **operational export** of the gym's record — a formatted, multi-sheet Excel (Clientes / Ventas / Asistencias + a Paquetes reference). A curated report the operator keeps, **not** a DB disaster-recovery backup (Supabase PITR owns that); excludes config + secrets (cobro/CLABE, perfil, plantillas). | `docs/adr/0006-respaldo-operational-export.md`; planned: `src/lib/data/respaldo.ts` (gather) + `src/lib/export/` (build, ExcelJS) + `src/app/(app)/cuenta/respaldo/route.ts` (deliver) |
 
-**Flagged tension:** the brief marks phone *optional* (Q4), but WhatsApp retention is the app's reason to exist, so phone is treated as *required* in practice. Email and birthday are optional stored fields (brief Q4). Brand name is **"FORGE"** (Q10) — not "Forge Bootcamp" (a mock string to be removed).
+**Flagged tension:** the brief marks phone *optional* (Q4), but WhatsApp retention is the app's reason to exist, so phone is treated as *required* in practice. Email and birthday are optional stored fields (brief Q4). Brand name is **"FORGE"** (Q10) — not "Forge Bootcamp" (a mock string to be removed). **respaldo** is an overloaded word resolved here: it means the operator-facing *operational export* (a curated report), **never** a database disaster-recovery backup — Supabase PITR owns DR, and the file deliberately omits the `cobro` bank details (CLABE) so it is safe to email (ADR-0006).
```

---

## Worktree / concurrency situation

- **3 sessions, 1 worktree.** Only the primary checkout exists (`git worktree list` shows one). The other two sessions are NOT worktree-isolated — at least one is operating in the *same* primary checkout (that's how the branch switched under us).
- **Senior approach (recommend to Aaron):** one worktree + branch per session. This session's work should live in `feat/respaldo-export` (steps above). The DB-audit session and the third session should each get their own worktree too, or the branch-stomping will continue.
- **Tooling note (UPDATED 2026-06-02):** a private `origin` remote now exists (`github.com/Vack99/forge-1.0`, default branch `main`), so the `EnterWorktree` harness tool works (its default `baseRef: fresh` branches from `origin/main`) — it is the skill-preferred path. The `git worktree add … origin/main` form in the detangle steps is the explicit-base alternative. **Re-verify `git remote -v` and `git branch` before any git op** — this remote appeared *during* the previous session; the state is volatile.

---

## Phase 1 implementation plan (the build)

**Spec is the PRD + ADR-0006.** Concrete file paths are in ADR-0006. Build order, TDD-first
(this repo has a strong test culture — 93 tests; honor it):

1. **Install ExcelJS** — `pnpm add --prefer-offline exceljs` (bare `pnpm add` can 404 on this repo's vendored Next; the `--prefer-offline` flag is the known workaround). Add to `src/lib`, **never** `src/domain` — the dependency-cruiser boundary (`pnpm lint`, also the pre-commit hook) fails the build if `src/domain` or `src/lib` imports `src/components`/`src/app`, and keeping a spreadsheet lib out of the pure domain core is the point.

2. **`src/lib/export/rows.ts` — the deep module, TDD it FIRST.** Pure: `RespaldoData → { clientes, ventas, asistencias, paquetes }` of formatted, Spanish-headed rows. This is where ALL formatting + derived columns live and where the tests pay off. Write `rows.test.ts` red-first:
   - correct Spanish headers per sheet;
   - `monto` formatted as pesos (reuse `pesos` from `src/lib/format.ts`);
   - dates in Chihuahua local time (reuse `src/lib/fecha` / `src/lib/date`);
   - `clases` shown as `"Ilimitado"` / `"N clases"` (not raw null/number);
   - derived `estado` / `urgencia` present as Spanish text columns — **reuse the ADR-0002 read-side derivations** (`src/domain` / `src/lib/data/derive.ts`), do NOT re-derive;
   - soft-deleted asistencias (`deleted_at != null`) absent;
   - empty-state → header-only rows (no crash on a gym with zero ventas/asistencias).

3. **`src/lib/data/respaldo.ts` — the gather seam, TDD it.** `getRespaldoData(client?: SupabaseServer) → Promise<RespaldoData>`, RLS-scoped. Queries the four entities; **ventas + asistencias = FULL history** (not month-scoped like `getClienteFicha`). Test via the **injectable `client?` pattern** already used in `src/lib/data/ventas.test.ts` and `roster-nav.test.ts` — feed a fake client, assert query scope (full history, not windowed), the `RespaldoData` shape, and that only the operator's rows are requested. (Reuse existing `cache`d readers where they fit; note the existing roster/ficha readers month-scope attendance, so respaldo needs its own full-history queries.)

4. **`src/lib/export/workbook.ts` — thin ExcelJS assembly (no unit test needed; logic lives in `rows.ts`).** `buildRespaldoWorkbook(rows) → Promise<Buffer>`, four worksheets.

5. **`src/app/(app)/cuenta/respaldo/route.ts` — delivery (manual/integration, not unit).** A **Route Handler** (NOT a server action — actions can't stream a binary download). Auth-check the operator (RLS is the hard boundary, ADR-0001) → gather → build → return the buffer with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename="forge-respaldo-<YYYY-MM-DD>.xlsx"`.

6. **cuenta UI** — a "Descargar respaldo" control in `src/app/(app)/cuenta/_components/cuenta.tsx` that hits the route.

7. **Verify** — `pnpm lint && pnpm test` green; manually download the file and open it (use the `/run` or `/verify` skill) to confirm four readable Spanish sheets. Then `superpowers:finishing-a-development-branch`.

**Tests in scope (confirmed with Aaron):** `rows.ts` (hard) + `respaldo.ts` gather (injected client). Route handler + UI = manual. Prior art: `src/domain/rules.test.ts`, `src/lib/data/derive.test.ts`, `ventas.test.ts`, `roster-nav.test.ts`. Vitest.

---

## Phase 2 — deferred design (do NOT build in Phase 1)

Automated weekly email of the same workbook, opt-in. **Designed, not built** — it has nowhere
to fire until there's a deploy target, and Phase 1's 3-piece split exists precisely so Phase 2
reuses gather + build verbatim. Full intended stack is in **ADR-0006 → "Phasing"** and the PRD
"Out of Scope" section: scheduler (Vercel Cron, or Supabase `pg_cron` + `pg_net`) → a
secret-guarded Route Handler reusing gather+build → email via Resend (Supabase only sends *auth*
mail) → recipient = operator's `auth.users.email` → opt-in `respaldo_semanal` toggle on
`perfil`. **Not** a Deno edge function (can't reuse the Node ExcelJS builder). Aaron flagged
Phase 2 as crucial — write a dedicated Phase 2 handoff once Phase 1 lands and a deploy target exists.

---

## Locked decisions — do not reopen (rationale in ADR-0006)

- `respaldo` = **operational export, NOT a DR backup** (Supabase PITR owns DR). This is the keystone.
- **Scope = 4 sheets:** Clientes (incl. contact + standing + derived estado/urgencia, so it doubles as the re-contact/re-registration list), Ventas (full ledger), Asistencias (full log, `deleted_at` excluded), Paquetes (read-only reference).
- **Hard exclusions:** `cobro` (CLABE/bank — secret, and the Phase 2 file is emailed), `perfil`, `plantillas`.
- **Full snapshot, no delta.** Each file is self-contained.
- **ExcelJS** over SheetJS. Lives in `src/lib` only.
- **3-piece split:** `rows.ts` (pure) → `workbook.ts` (ExcelJS) → DAL gather → Route Handler. Splitting `rows` from `workbook` mirrors the house `derive.ts`-from-`clientes.ts` pattern and keeps formatting testable without ExcelJS.

---

## Suggested skills for the next session

- `superpowers:using-git-worktrees` — to isolate before building (mind the no-remote `EnterWorktree` gotcha above; use `git worktree add` with an explicit base).
- `superpowers:test-driven-development` / `tdd` — red-green on `rows.ts` then `respaldo.ts`.
- `superpowers:verification-before-completion` — evidence (lint+test output, opened file) before claiming done.
- `/run` or `verify` — actually download + open the `.xlsx` to confirm four readable Spanish sheets.
- `superpowers:requesting-code-review` then `superpowers:finishing-a-development-branch` — to wrap and integrate `feat/respaldo-export`.

---

## Repo-specific gotchas

- **Tracker:** a private GitHub `origin` (`Vack99/forge-1.0`) now exists as of 2026-06-02, so GitHub Issues are *technically* available — but the established house convention is the **local PRD markdown** (`docs/prds/`, see `prd-supabase-migration.md`), which `/to-issues` and `/to-goal` consume directly. Keep the PRD as the source of record unless Aaron asks to move to Issues. The PUBLIC showcase repo (`vack99/forge`) is still a separate pending step — keep brand-facing, no secrets in tree.
- **Husky v9 pre-commit runs `pnpm lint`** (dependency-cruiser boundary). Never run `husky` with an argument — it corrupts `core.hooksPath`. `pnpm install` (the `prepare` script) sets it correctly.
- **`pnpm add` can 404** on this vendored Next — use `--prefer-offline`.
- **es-MX throughout** — all headers, labels, UI strings in Spanish.
- **Chihuahua timezone** — `src/lib/fecha` is the wall-clock + Postgres `date` bridge; `src/lib/date` is the pure local-component calendar. Use these, don't hand-roll dates.
- **The branch landscape is volatile** while other sessions run — re-check `git branch` / `git status` before any git op, and prefer your own worktree.
