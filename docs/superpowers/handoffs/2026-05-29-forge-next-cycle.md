# Handoff — Forge next cycle (Supabase migration) + framework-skill capture

**Date:** 2026-05-29 · **Repo:** `forge-1.0` on `master` @ `d4ead81` · working tree clean.
**For:** a fresh agent session continuing Forge after the "structural pass + domain core" cycle.

This doc references existing artifacts instead of repeating them — read those, don't re-derive.

---

## Where things stand (1 paragraph)

The claude.ai/design **mock** has been turned into a real-app architecture (the "SECTOR-FIRST" pass): route-colocated sectors, a **pure, 28-test `src/domain` core**, ONE enforced dependency boundary (`.dependency-cruiser.cjs`) gated by a Husky pre-commit hook, and the map docs. All merged to `master`. **Behavior still runs entirely on mock data + localStorage — no Supabase yet.** Gates verified green at merge: `pnpm test` 28/28 · `pnpm lint` clean (boundary enforced) · `pnpm build` compiles.

Read these (do not duplicate):
- Design spec: `docs/superpowers/specs/2026-05-29-forge-sector-architecture-design.md` (esp. **§7** domain semantics, **§11** Next 16 + Supabase API notes, **Appendix A** the future skill)
- Structural plan (done): `docs/superpowers/plans/2026-05-29-forge-structural-pass-and-domain-core.md`
- **The migration backlog (your entry point): `docs/MIGRATION.md`**
- Map + decisions: `ARCHITECTURE.md`, `CONTEXT.md`, `docs/adr/0001-0003`, `src/lib/data/README.md`
- Tested rules: `src/domain/rules.ts` + `src/domain/rules.test.ts`
- Memory: `forge-project`, `forge-stack`, `forge-sector-first` (in the project memory dir)

---

## GOAL A (immediate) — make Forge functional on Supabase

Driven by **`docs/MIGRATION.md`**. Pipeline: **`/to-prd` (from MIGRATION.md) → `/to-issues` → `/to-goal`**.

- **Supabase MCP** is being configured by the user — confirm it's live in the new session before scoping data work.
- **Order:** the domain core is already done + tested, so it's not a slice — the **first tracer bullet is the `ventas` slice** (schema → `server-only` DAL → Server Action calling `stackPaquete` + mutating the cliente → wire the screen), then `asistencia` (`consumirClase` + absolute-date rows), then `clientes` (derive `estado/vence/diasRest/asistEsteMes` at read), then `retencion`, then `cuenta`.
- **Stack specifics are already settled** in the spec §11 + ADR-0001 — key ones: `@supabase/ssr` with a cookie adapter implementing **only `getAll`/`setAll`**; authorize with `getClaims()` (never `getSession()`); reads in Server Components via a `server-only` DAL returning DTOs; writes via thin Server Actions that re-auth + Zod-validate + delegate + `updateTag('clientes','max')`; RLS on every table keyed to `(select auth.uid())`; session refresh in **`proxy.ts`** (Next 16 renamed `middleware.ts` → `proxy.ts`); env `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Per `docs/MIGRATION.md` prereqs: install `@supabase/ssr` + `@supabase/supabase-js`, create `src/lib/supabase/{client,server}.ts`, design the schema with RLS, add a single-operator login.

## GOAL B (deferred) — extract the repeatable `sector-map` skill

The user wants the SECTOR-FIRST framework generalized into a reusable skill (the **predecessor to `/improve-codebase-architecture`**: "clone-from-claude-design mock → navigable sectored architecture before implementation"). **Decision: do this only AFTER Forge proves the framework end-to-end** (i.e., after Goal A ships at least one real slice). Design is in spec **Appendix A**. Build it with `write-a-skill`; compose with `grill-with-docs` (ADRs/glossary), `to-prd`/`to-issues`/`to-goal` (backlog → shipping), and `improve-codebase-architecture` (once real code exists).

**Framework-extraction learnings from running it on Forge (capture these — they live only in the prior session):**
- The framework is 6 content-neutral phases: Archaeology → Glossary (`CONTEXT.md`) → Lock ADRs → Sector map (`ARCHITECTURE.md`) → Skeleton-move + ONE enforced boundary → Migration backlog (`MIGRATION.md`). Artifacts are stack-neutral; only the sector taxonomy + the one seam shape change per project.
- **The lint gate earned its keep immediately:** `eslint .` surfaced **3 pre-existing react-hooks errors hidden in the cloned mock** that Next 16's `build` never lints. A clone→real skill should run `eslint .` early as part of archaeology.
- **The single dependency-cruiser boundary + pre-commit hook is the anti-rot core.** Verify it actually *bites* (a deliberate violation must fail lint AND block a commit) — don't trust that the rule isn't a no-op.
- **The pure domain core is the ideal first deliverable** — it needs zero backend, is fully unit-testable, and everything else wires into it. Make "extract + TDD the domain rules" phase one of implementation.
- **Two-stage subagent review (spec-compliance then code-quality) caught real gaps** the implementer missed (a missing `{paquete}` token, several untested boundaries, the hidden eslint errors). Worth keeping in the skill's recommended execution.
- Doc-creation tasks consolidate well (one implementer, multiple commits); per-line *justified* `eslint-disable` is the right call for legitimate react-hooks false-positives (hydration/animation mount flags).

---

## Operational gotchas (don't relearn the hard way)

- **pnpm only** — never `npm install`. pnpm 11 blocks native build scripts; approvals live in `pnpm-workspace.yaml` `allowBuilds:` (currently `sharp`, `unrs-resolver`, `esbuild`).
- **Never run `husky --version`** (or `husky` with any arg) — v9 treats the arg as the hooks path and corrupts git `core.hooksPath`. `pnpm install` (the `prepare` script) sets it to `.husky/_`.
- **Don't reintroduce `middleware.ts`** — Next 16 = `proxy.ts`.
- **Git identity:** commits so far are under the machine's *global* git identity, which is a **different account than the email in memory**. Confirm with the user which identity should own Forge commits before continuing (consider a repo-local `git config user.email/user.name`).
- No git remote is configured (local-only). Add one if/when a PR workflow is wanted.

## Open minors (deferred to this cycle — non-blocking, from the final review)

- Spec §7 token list omits `{paquete}` though the code/template use it (intentional extension; reconcile the doc).
- `MetodoPago` is duplicated (`src/domain/types.ts` vs legacy `src/lib/data/types.ts`) — converge at migration.
- `cliente-detalle.tsx` exports `ClienteDetalle` (no `Screen` suffix) — cosmetic naming drift vs siblings.
- `vender.tsx` (~543 lines) is a decomposition candidate when its sector is rebuilt.

---

## Suggested skills for the next session

- **`brainstorming`** — if any Supabase scoping/design choices are open before planning.
- **`to-prd`** → **`to-issues`** → **`to-goal`** — the migration pipeline, starting from `docs/MIGRATION.md`.
- **`test-driven-development`** — for the DAL + any new domain rules.
- **`subagent-driven-development`** (or `executing-plans`) — to execute the migration plan task-by-task with review gates (worked well this cycle).
- **`using-git-worktrees`** + **`finishing-a-development-branch`** — isolate and complete each slice (the user preferred an in-place feature branch over a worktree last time, due to pnpm reinstall cost).
- **`verification-before-completion`** / **`requesting-code-review`** — before claiming a slice done.
- Later, for Goal B: **`write-a-skill`** (+ `grill-with-docs`, `improve-codebase-architecture`).

**First action in the new session:** confirm the Supabase MCP is connected, then run `/to-prd` against `docs/MIGRATION.md`.
