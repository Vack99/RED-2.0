# R2-E1 — §7 regressions, actually executed

Source: `docs/FIndings/2026-09-02-new-user-cross-examine.md` §7 (17 rows, "One-line changes that
break a guarantee with every test green"). Round-1 **read** these; this pass **ran** them: apply the
literal hunk, `pnpm typecheck` → `pnpm lint` → `pnpm test` (vitest), record pass/fail, revert,
confirm `git status --short` clean before the next row. Baseline (HEAD, before any edit): typecheck
green (3 tasks), lint green (0 errors), vitest green 114 files / 1975 tests.

**Method note — turbo cache had to be forced.** `pnpm typecheck` (`turbo run typecheck
typecheck:root`) caches `@gym/admin:typecheck` / `@gym/client:typecheck` per-package; turbo's default
task (no `dependsOn`) does **not** invalidate an app's cached typecheck when a `packages/data/*` file
it imports changes — confirmed directly: after editing `packages/data/src/server/agenda-miembro.ts`,
`@gym/client:typecheck` replayed the exact same cache hash (`47ef7c9ea2411daf`) as the untouched
baseline. The root tsconfig also **excludes `apps/`** (`tsconfig.json:4`), so `//:typecheck:root`
alone can't cover app-level usage either. Every typecheck run below therefore used `pnpm exec turbo
run typecheck typecheck:root --force` to bypass the stale per-app cache — plain `pnpm typecheck`
would have silently reused old app-typecheck results for any packages/data-only diff (rows 4, 5, 6,
14, 16) and could false-green a real cross-package type error. This is itself a gate-integrity gap
the round-1 doc never surfaced.

**Operational hazard, observed not modelled.** Mid-run, `package.json` was deleted from the working
tree and `pnpm-lock.yaml` modified by something outside this session (a `pnpm install`-shaped event,
"Packages: +3 -347", using a *different* pnpm version than the one active in this shell) while another
sibling agent was concurrently writing files into this exact repo root (`docs/FIndings/new-user-xe/`
picked up `R2-E2-live-checks.md`, `R2-R1-headline-refute.md`, `R2-R2-top-rows-refute.md` mid-session —
not written by me). Recovered with `git checkout -- package.json pnpm-lock.yaml` (both tracked,
unmodified at HEAD). Flagging because several parallel round-2 experiments appear to share this one
working tree rather than isolated worktrees — a real collision risk for any experiment that edits
files, not just this one.

## Results

| # | File | Applied? | typecheck | lint | vitest (passed/failed, first failure) | Verdict |
|---|---|---|---|---|---|---|
| 1 | `apps/client/src/proxy.ts:157` — delete `cookieOptions: SUPABASE_COOKIE_OPTIONS,` | yes | pass | pass (1 warning: unused `SUPABASE_COOKIE_OPTIONS`, exit 0) | 1975/1975 pass | green — claim holds |
| 2 | `apps/client/src/proxy.ts:173` — `if (esSesionMuerta(error) \|\| (!error && !data))` → `if (error \|\| !data)` | yes | pass | pass | 1975/1975 pass | green — claim holds |
| 3 | `git mv apps/client/src/app/auth/confirm apps/client/src/app/confirmar` (via `mv`, not `git mv`) | yes | **FAIL** — `route.ts(13,37): error TS2307: Cannot find module '../../../lib/aviso-legal'` (depth changed from 3-deep to 2-deep under `src/app/`) plus Next's generated `validator.ts` still referencing `../../../src/app/auth/confirm/route.js` | pass | 1975/1975 pass — surprising: vitest/vite resolves the same broken relative import that tsc rejects; root cause not chased further, flagged as unexplained | **caught by typecheck** — contradicts the doc; row 3's "why tests stay green" column only discusses `correo.test.ts`'s hardcoded literal and never mentions `pnpm typecheck`, which the doc's own §15 self-critique admits was never run for any of the 17 rows |
| 4 | `packages/data/src/server/agenda-miembro.ts:139` — wrap `getEsMiembro` in `cache(...)` | yes | pass (forced) | pass | 1975/1975 pass | green — claim holds |
| 5 | `packages/data/src/server/fetch-shield.ts:140` — insert a POST timeout targeted at `auth/v1/token` before the GET/HEAD branch | yes | pass (forced) | pass | 1975/1975 pass | green — claim holds |
| 6 | `packages/data/src/server/agenda-miembro.ts:160` — delete `.eq("gym_id", gymId)` from `fetchSesionesMiembro`'s `class_session` reader | yes | pass (forced) | pass | **1974/1975 — 1 failed**: `agenda-miembro.test.ts > getAgendaSemanaMiembro > #220: excludes a session belonging to a different gym even though it's in-window (explicit filter, not RLS alone)` (`agenda-miembro.test.ts:271`, `expected [...] to not include 'otro-gym'`) | **caught by test** — directly contradicts the doc's claim of "0 [assertions] in `agenda-miembro.test.ts`"; that test exists and fails immediately |
| 7 | `apps/client/src/app/reservar/_components/cerrar-sesion-link.tsx:28` — delete `{ scope: "local" }` from `signOut(...)` | yes | pass | pass | 1975/1975 pass | green — claim holds |
| 8 | `apps/client/src/app/activar/page.tsx:78` — delete `sesionEmail = claims?.claims?.email ?? null;` | yes | pass (forced) | **FAIL** — `72:7 error 'sesionEmail' is never reassigned. Use 'const' instead prefer-const` (exit 1) | 1975/1975 pass (moot — lint gate already red) | **caught by lint** — the doc's row never mentions lint at all; deleting the sole reassignment turns the `let` into a `prefer-const` ESLint *error* (not a warning), which fails the gate |
| 9 | `apps/admin/src/app/(app)/vender/_components/vender.tsx:746` — `{!existing.email && (` → `{true && (` | yes | pass | pass | 1975/1975 pass | green — claim holds |
| 10 | `apps/client/src/app/registro/actions.ts:56` — `` `${origin}/auth/confirm` `` → `` `${origin}/auth/confirm?next=/saldo` `` | yes | pass | pass | 1975/1975 pass | green — claim holds |
| 11 | `apps/client/src/app/auth/confirm/route.ts:117-120` — collapse the 3-clause `next` check to `nextParam && nextParam.startsWith("/") ? nextParam : null` | yes | pass | pass | 1975/1975 pass | green — claim holds |
| 12 | `apps/client/src/proxy.ts:102` — `request.headers.get("host")` → `request.headers.get("x-forwarded-host")` | yes | pass | pass | 1975/1975 pass | green — claim holds |
| 13 | `supabase/functions-canonical/reclamar_o_crear_cliente.sql:50-53,65` — drop `and auth_user_id is null` | not applied | — | — | — | unexecutable locally — denial suite convention-only (no vitest/typecheck surface for canonical SQL bodies) |
| 14 | `packages/data/src/client-senal.ts:209` — drop `{ config: { private: true } }` from `.channel(...)` | yes | pass (forced) | pass | 1975/1975 pass | green — claim holds |
| 15 | `supabase/tests/rpc-coverage.json` — add `"quarantined": "..."` to `aceptar_acuerdo`'s entry, keeping its existing `"suites"` | yes | pass | pass | **1974/1975 — 1 failed**: `rpc-write-coverage.test.ts > every quarantined RPC states a reason and points only at quarantined suites` — `aceptar_acuerdo: quarantined but names aceptar_acuerdo.sql, which is not in QUARANTINE` | **caught by test** — the doc's row cites only `rpc-write-coverage.test.ts:56`'s short-circuit; it misses the file's own last test (~line 85), a few lines below, which cross-checks any `quarantined` entry's suites against the denial runner's `QUARANTINE` list. Literal single-field addition (keeping `suites`) fails immediately |
| 16 | `packages/data/src/server/fetch-shield.ts:73` — `kid: "76da07da-..."` → a mismatched `kid` | yes | pass (forced) | pass | 1975/1975 pass | green — claim holds |
| 17 | `apps/client/src/app/entrar/page.tsx:34-41` — delete the live-session `getClaims()` redirect block entirely | yes | pass | pass (5 warnings: now-unused `redirect`/`resolverMiembroGym`/`createClient`/`modo`/`destinoClases` imports, exit 0) | 1975/1975 pass | green — claim holds (only `test:e2e`'s `session.spec.ts`, outside this gate set, would catch it — consistent with the doc) |

## Return-value summary

12 of 17 rows stay fully green across `typecheck && lint && test` exactly as the doc claims (1, 2, 4,
5, 7, 9, 10, 11, 12, 14, 16, 17). 1 row (13, SQL) is unexecutable locally, per protocol. **4 rows the
doc predicted as green are actually caught**, all misses in round-1's "why the tests stay green"
reasoning specifically because no gate was ever run:

- **Row 3** (rename `auth/confirm`→`confirmar`) — caught by **typecheck** (`tsc` rejects the
  now-wrong-depth relative import in `route.ts` plus Next's stale route-type validator); doc's
  reasoning only addressed `correo.test.ts`'s hardcoded literal and never considered typecheck.
- **Row 6** (delete `.eq("gym_id", gymId)`) — caught by **vitest**: `agenda-miembro.test.ts`'s own
  `#220` test asserts exactly this, contradicting the doc's stated "0 in `agenda-miembro.test.ts`."
- **Row 8** (delete `sesionEmail` assignment) — caught by **lint**: `prefer-const` fires as an error
  once the `let` is never reassigned; the doc never checked lint for this row.
- **Row 15** (add `"quarantined"` to an entry) — caught by **vitest**: the same guard file's last
  test cross-checks quarantined entries' suites against the denial-suite's `QUARANTINE` list, one
  test the doc's citation (line 56) didn't reach.

Also surfaced, unprompted: turbo's per-app typecheck cache doesn't invalidate on `packages/data`
changes (had to force `--force` for every run touching packages/data — rows 4, 5, 6, 14, 16), and a
concurrent-agent collision briefly deleted `package.json` mid-run (recovered via `git checkout`).
