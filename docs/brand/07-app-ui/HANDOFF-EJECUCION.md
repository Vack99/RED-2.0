# Handoff — execute the branding pipeline fix (#272–#275)

For a fresh session in charge of EXECUTION. Audit session (2026-08-16) produced spec
[#271](https://github.com/Vack99/RED-2.0/issues/271) + 4 independent tracer tickets, all
`ready-for-agent`. Nothing implemented yet — this session's output was docs + issues only.

## Where you are

- Worktree: `.claude/worktrees/ibookit-app-ui` (branch `ibookit-app-ui`). Work HERE, never
  `cd` to the main checkout. Stash stack is shared across worktrees — never bare
  `git stash`; use WIP commits.
- Branch = local `main` (1aa0f6f) + docs commits (d331639, b912cf2, d5bbc7d). ALL LOCAL,
  nothing pushed. **Pushing requires explicit owner consent — commit freely, never push.**
- Baseline green: lint + depcruise + typecheck + 1652 tests. Pre-commit runs the full gate
  (~80s). Never run `husky` with an argument.
- Source of truth: `AUDITORIA-BRANDING.md` (this dir) — live-DB-verified pipeline map.
  Reskin context (NOT this scope): `HANDOFF.md`, `ANALISIS-ESTRUCTURA.md`.

## The mission

Execute #272–#275, close each issue when its ACs are proven, commit locally. All four are
independent — any order, parallel-safe across agents. Suggested: #272 (biggest) first,
#273 needs scratch-DB setup lead time.

## Per-ticket execution notes (paths verified by the audit)

### #272 — wire `token_overrides`, delete purple fixture, drop dead export
- Swap point: `apps/admin/src/lib/token-overrides.ts` + `apps/client/src/lib/token-overrides.ts`
  (24-26: fixture keyed `brandId === "base"`). File's own doc block (lines 9-13) describes the
  intended swap: read the resolved gym row's `token_overrides` jsonb.
- The merge path is ALREADY REAL — `packages/brand/src/brand-css.ts` + zod validation +
  SSR inject in both `apps/*/src/app/layout.tsx`. Do not touch it. Overrides stay an
  ARGUMENT the app fetches — `@gym/brand` never fetches (`brand ✗→ data` frozen,
  ADR-0011 §6, depcruise-enforced).
- Fetch shape: keyed on the tenant in effect (`x-gym`), TTL-cached like
  `hostCache`/`slugCache` in `packages/data/src/server/resolve-tenant.ts` (60s in-process).
  Verify the anon/server read path for the column actually works (ANALISIS claimed the RLS
  grant exists — verify, don't trust).
- Regression pin: forge + red have `{}` → must hit the empty-overrides fast path
  (`brand-css.ts:20`) and render byte-identical CSS. Write that test.
- Fixture delete supersedes the #35 "leave purple in prod" ruling — deliberate product
  change, do not re-file #35.
- Ride-along: remove dead `./forge/logo` export (`packages/brand/package.json:8`, zero
  importers) + stale comment `packages/brand/src/index.ts:4-5`.

### #273 — CHECK constraint on `gym.brand_module_id`
- `CHECK (brand_module_id IN ('base','forge','red'))` — all 4 live rows are forge/red,
  verified compliant. Note the registry↔constraint coupling where a future module lands.
- Migration file in `supabase/migrations/`, applied to LIVE via MCP `apply_migration`.
  **Supabase MCP is bound to LIVE** — never assume scratch. NEVER `supabase link` or
  `db push` (56/78 filenames unrecognized → would re-apply seeds).
- Denial suite: new `*.sql` in `supabase/tests/` (seed in-txn, RAISE, rollback), register in
  the runner's SUITE or the drift guard fails. Write-coverage guard unaffected (no RPC).
- Scratch run: `SUPABASE_TARGET_REF=<scratch> SUPABASE_ACCESS_TOKEN=<pat> pnpm test:denial`.
  PAT + scratch ref: `docs/db-testing-throwaway-project/data`. **TRAP: the runner never
  applies migrations to scratch — apply the new migration to scratch FIRST.** Runner
  refuses the live ref. PAT-free fallback: local docker path (memory
  `local-docker-denial-path`; traps: CLI reset lacks ambient-grant bootstrap, use
  `docker cp` not PS pipe for UTF-8).
- Scratch-green ≠ live-current: re-verify live state before applying (memory
  `reserva-manual-agenda-spec` trap).

### #274 — client browser surface
- `apps/client/src/app/layout.tsx:12-15` hardcoded `title: "Gym"` → `generateMetadata`
  from `resolveBrand().copy`, mirroring `apps/admin/src/app/layout.tsx:20-23`.
- NEW `apps/client/src/app/icon.tsx` mirroring `apps/admin/src/app/icon.tsx` (brand
  `appIcon`). Client currently serves NO favicon.
- No new brand-contract fields.

### #275 — app-scoped host resolution
- `packages/data/src/server/resolve-tenant.ts:124`: `gym_id_por_host` called with
  `p_hostname` only; RPC already accepts `p_app` (filters when given) — no signature
  change, no migration. Each app's proxy declares its identity.
- Cache note: `hostCache` is keyed by hostname only — safe because each deployment is its
  own process (one app per process), but confirm the app identity is constant per process,
  not per request, before reusing the key.
- Tests in `packages/data` (RPC boundary mocked): matching-app resolves, wrong-app
  doesn't, unscoped row resolves on both. Existing forge/red hosts unchanged on their
  correct apps.

## Rails (non-negotiable)

- Commit locally per ticket; fast-forwarding local `main` fine; **no push without the
  owner explicitly asking for that push**.
- Commit BEFORE dispatching agents (a rejected dispatch once deleted untracked files).
- Agents: foreground, sonnet default, opus if output misses the bar; no fable staffing.
  No wide fan-outs — brief subagents per unit of work.
- Skills for this session per protocol: /caveman /ponytail /keep-it-lean.
- Stop around 200k usage → write the next handoff.
- Scope wall: NO reskin work (base repaint, plum, dock reorg, new routes, Hanken Grotesk,
  TABS derivation, dark scheme, `forge/*` rename). That's the NEXT pass, gated on owner
  rulings in `AUDITORIA-BRANDING.md` §5.

## Definition of done

- #272–#275 closed with ACs checked, full gate green, denial green on scratch for #273.
- Commits local on this branch. Ask the owner about ff + push — don't do it unprompted.
- End with: what shipped, what's left (the reskin pass + §5 rulings), and the standing
  ⚠️ owner-owed reminder: SAT persona-física details (nombre, RFC, régimen, domicilio
  fiscal, correo).
