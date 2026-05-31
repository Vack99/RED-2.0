# Forge architecture audit — learnings for the harness (2026-05-31)

**What this is.** Before extracting the back-half "architecture → working app" shipping skill,
we audited Forge's *actual output* with `improve-codebase-architecture` run as an adversarial
workflow (8 lenses → per-finding skeptic verify → completeness critic → synthesis; 53 agents,
**41 of 42 findings survived** independent verification). The point: the harness's only job is to
produce good architecture, so the architecture **is** the harness's report card. Each validated
finding below is recorded as a triplet — **what we got wrong**, **why we got it wrong**, **how to
improve the harness** — because the harness improvements are the real deliverable that feeds the
back-half skill (Scope B).

**Verdict:** `structure_quality: good` · `is_best_possible: false`. The spine is genuinely strong
(sector-first map, pure tested domain core, consistent thin RSC→Server-Action shape across all six
sectors, version-controlled RLS, one machine-enforced boundary that held through 8 slices). The
weakness is **one recurring class the gate cannot see: it checks import _direction_, not concept
_duplication_ or contract _honesty_, and the enforced loop verified the easy (pure) half while the
security/correctness-critical half shipped with zero executing tests behind a hand-typed "45/45."**

---

## Cluster 1 — Domain rules re-coined outside the core (the headline failure)

**Validated findings:** forfeit re-implemented inline on the write path (`ventas.ts:118-125`) vs the
read path (`derive.ts:46`/`rules.ts:95-98`); a full urgency engine (`CL_DAYS 3/7/14`, `CL_CLS 1/3/5`,
`clientUrgency`) hard-coded inside the `'use client'` roster (`clientes.tsx:9-39`), divergent from
`derivarEstado`'s `por_vencer`; "running out" thresholds in 3+ disagreeing places; `MetodoPago`
declared 4× under 2 names with a same-identifier collision (`vender.tsx` imports `Metodo` then
redeclares it); clases-remaining label built 3+ ways.

- **What we got wrong:** Core gym rules (forfeit, urgency, payment-method vocabulary) were forked
  into screens and the write path instead of living once in `src/domain`. A future edit to a rule in
  the domain would silently *not* apply to the copies — e.g. a grace-period change to forfeit would
  revive forfeited classes onto a renewal.
- **Why we got it wrong:** The one enforced boundary checks import **direction** (`domain`/`lib`
  ✗→ `components`/`app`). A rule *re-typed as a literal* inside a client screen is not an import, so
  it is structurally invisible to dependency-cruiser. Boundary green + 45 tests green + 8 slices done
  all reported success while core rules quietly forked. The fresh-eyes gates asked "is this elegant?"
  but never "is this concept already implemented elsewhere?"
- **How to improve the harness:** Add a per-slice **concept-duplication gate** that the cruiser
  structurally can't do: (a) grep `_components` for branch logic on domain quantities (diasRest/
  clasesRest threshold comparisons, estado enum literals, sentinels) and **fail** if found without
  importing from `src/domain`; (b) a "single-home" check that reconciles each named domain rule
  against all call sites *and* scans writers for open-coded reimplementations; (c) flag any new
  string-literal union whose members duplicate an existing domain union. This becomes the **headline
  gate** of the back-half skill.

## Cluster 2 — Documented contracts that drifted from the code ("honesty")

**Validated findings:** `revalidateTag('clientes','max')` called in 3 write actions but **no read ever
tags a cache entry** (zero `cacheTag`/`'use cache'` in `src`) — an inert no-op that *reads* as the
cache-coherence guarantee; `getClaims()` awaited then used only as the `user_id` stamp, never to
authorize the row (the "re-auth" the README/ADR sell is a presence-check); CONTEXT.md + `types.ts:7`
point at the **deleted** `src/lib/data/types.ts`; `diasLabel` exported with zero importers.

- **What we got wrong:** Prose (README, ADR, glossary, copy-pasted "protocol" lines) was treated as
  decoration, not as assertions that must stay true. The showcase explicitly promises "a rename
  surfaces drift" — and that promise is now false for cliente/paquete/cobro.
- **Why we got it wrong:** Nothing verifies a documented contract against the code. The cleanup slice
  deleted a file but no step swept docs/comments for references to it (`no-orphans` catches dead
  *files*, not stale *mentions*). Copy-pasted protocol lines were never deletion-tested — if removing
  `revalidateTag` is a runtime no-op, it was decoration.
- **How to improve the harness:** Make "docs follow code" a definition-of-done. Treat every seam-doc
  claim as verifiable: a **glossary-integrity linter** on the same pre-commit hook (every `src/` path
  cited in CONTEXT.md must exist); a **cleanup-slice rule** that a deleted path must have zero
  references in comments + markdown before the slice closes; the **deletion test** applied to every
  copy-pasted protocol line (no-op ⇒ remove or complete it); for invalidation, every writer
  `revalidateTag(X)` must have a matching reader `cacheTag(X)`.

## Cluster 3 — "Tests pass" verified the easy half; the hard half had zero tests

**Validated findings:** all 45 tests are in `src/domain` + `derive.test.ts`; the pre-commit hook runs
**only** `eslint + depcruise` — the tests, `tsc --noEmit` (no script exists), and `next build` run
**nowhere automatically, and there is no CI** (`.github/` absent); RLS policies, the proxy auth-gate,
and every DAL write path have **zero executing tests**; "45/45" was a hand-typed commit claim.

- **What we got wrong:** The most security/correctness-critical layers (tenant isolation via RLS,
  auth redirect, balance mutations) shipped unverified, and the green "45/45" masked it. The phone
  bug reached production precisely because the layer it lived in was both untested and untestable.
- **Why we got it wrong:** The 2-half split ("TDD the pure core") tested the half that's easy to
  test and declared victory. The enforced loop never even *ran* the suite — it gated lint only — so
  coverage scope was never challenged. "Slice done" meant "lint+boundary green at commit."
- **How to improve the harness:** Redefine **slice-done as "typecheck + tests + build green in CI,"**
  never "lint green at commit." Make a CI definition a **required first-class artifact** of the
  vertical-slice template, with a simulated clean-clone run in the fresh-eyes gate. For DB-touching
  slices, the second half of the split must **produce** the security tests: any authorization claim
  in a README/ADR requires ≥1 executing cross-tenant RLS-denial test before close. Refuse to accept a
  slice on a hand-typed "test N/N" claim.

## Cluster 4 — The injectable seam was destroyed in the mock→real migration

**Validated finding:** `createClient()`/`getClaims()` are inlined into every DAL function
(`ventas.ts:75-79`, `asistencia.ts:50-54`, `clientes.ts`, …), so DTO mapping, Zod schemas, and write
orchestration are **untestable by construction**; `no-orphans` would even flag a future test double
as dead code.

- **What we got wrong:** The mock era almost certainly had a swappable client seam; migrating to real
  Supabase inlined the client everywhere and lost it — trading testability for "simpler" code.
- **Why we got it wrong:** No invariant said "keep the seam injectable" through the migration, and
  the testability cost was invisible because the loop never tried to test the DAL.
- **How to improve the harness:** Carry a **"keep the seam injectable"** invariant through the
  mock→real phase (DAL functions accept a client via default-arg defaulting to `createClient()`);
  require a DAL-level test for any slice that maps rows or validates input; ship the `no-orphans`
  config with `__mocks__/**`, `*.test-helper`, fixtures already in the `pathNot` exemption list from
  day one, so testability is never traded away for the no-dead-code rule.

## Cluster 5 — ADR consequence-clauses were prose with no enforcement

**Validated findings:** ADR-0001 "no ORM" → every cross-entity read hand-rolls a JS join (fetch ids →
Map → stitch), including a full client-id-list scan on every ficha load for prev/next neighbors —
N+1-shaped, read-time-inconsistent, untested. ADR-0004 "stored running balance" → balance + ledger
writes are **non-atomic read-modify-write across separate calls** with no transaction/RPC and no
concurrency guard (`asistencia.ts:84` does `+1` with no guard).

- **What we got wrong:** When an ADR *removes* an abstraction (no-ORM) or *asserts* a stored
  invariant (running balance), the responsibility didn't vanish — it smeared across call sites as
  hand-rolled joins and unsafe mutations.
- **Why we got it wrong:** ADR "consequences" sections were written as prose and never turned into
  checks. No slice asked "where did the responsibility this ADR removed actually land?"
- **How to improve the harness:** Turn **ADR consequence-clauses into per-slice gates.** For any
  "no-X" decision, the fresh-eyes step must locate the responsibility X used to own and require it
  land in **one named seam** (a join helper or SQL embed), not be re-derived per slice. For any slice
  whose writer mutates a stored running balance or writes 2+ tables, the template **defaults to an
  RPC/transaction stub** (atomic is the path of least resistance) and the gate must answer "is
  balance+ledger one transaction?" and "is the update concurrency-safe?" + a partial-failure
  rollback test, or record a written waiver.

## Cluster 6 — App Router's most important boundaries were prose, not sectors

**Validated findings:** `src/lib` fuses pure client-safe helpers (`date`/`fecha`/`format`/`utils`)
with the server-only DAL + Supabase server client behind one tier, so the rule **cannot express the
single most important App Router invariant** — a client component must never import `@/lib/data/*` or
`supabase/server` (today that rests entirely on the `server-only` package throwing at build, not on
the graph; all current client→DAL edges are type-only, which is why this was downgraded to medium).
Formatters/thresholds re-grew per screen because nothing enforced reuse. The `date.ts`/`fecha.ts`
split is by *language* not *responsibility* (`isoDay` === `toIsoDay`, byte-identical); `fecha.ts` is
absent from ARCHITECTURE.md.

- **What we got wrong:** The server/client fault line and the server-only DAL split — the boundaries
  that matter most in App Router — were only described in prose, never made first-class sectors with
  a rule; small helpers fragmented.
- **Why we got it wrong:** `sector-map` produced a generic domain-vs-UI boundary and stopped; it
  carries no stack-specific rule set. "One boundary, not many" was taken literally where a *second*
  cheap rule was warranted.
- **How to improve the harness:** Give `sector-map` a **stack-aware default rule set**: for Next App
  Router, always ship the server-only DAL vs pure-lib split as distinct sectors with a forbidden
  client→DAL/`supabase/server` rule. Add a **formatter-home/helper-home gate** (grep for an existing
  same-shape helper before emitting a user-facing string or adding a date helper; reject new inline/
  JSX string-building). Treat any user-facing numeric threshold driving a label/sort as **domain
  vocabulary** that must be named in CONTEXT.md and homed in `src/domain` before screens are built.
  Wire `ts-prune`/`knip` + a small duplication scanner into the lint gate (catches dead *exports* and
  re-coined synonyms `no-orphans` misses). Route **input validation** through one pure validator
  (domain/lib + test) that the UI form *and* the Zod schema *and* a DB CHECK all call — closing the
  8-vs-10-vs-none phone gap.

## Cluster 7 — The repo follows the live DB instead of being its source of truth

**Validated findings:** `database.types.ts` is a frozen generated snapshot with no freshness gate
against the committed migrations or live DB; the live `SECURITY DEFINER public.rls_auto_enable()`
(EXECUTE-able by anon/authenticated over PostgREST) appears in **no committed migration and no
REVOKE**; auth leaked-password protection is off.

- **What we got wrong:** A backend provisioned via the Supabase MCP made the repo a *follower* of the
  live DB — generated types and security-relevant DB surface (a definer function) live outside the
  migrations, so a fresh clone can't reproduce the real schema and a type-snapshot can silently
  desync.
- **Why we got it wrong:** The migration phase mirrored DDL we *applied* but had no invariant that
  the committed migrations are the *canonical provisioner*, and no per-slice audit of definer
  functions / EXECUTE grants.
- **How to improve the harness:** Add a **migration-phase invariant** — committed migrations must
  reproduce the live schema on a fresh `db reset`; any generated type snapshot gets a
  regenerate-and-diff CI gate. Add a mandatory per-DB-slice **"definer & grant audit"**: enumerate
  all `SECURITY DEFINER` functions and all EXECUTE grants to anon/authenticated and **fail** unless
  each is allow-listed in a committed migration; treat `get_advisors(security)` "definer reachable by
  anon" as **blocking**, run it in the final hardening slice, every WARN resolved or waived as a
  tracked artifact.

---

## What the harness GOT RIGHT (codify these verbatim in the skill)

- Sector-first layout that screams the domain + a real readable `ARCHITECTURE.md` "Where do I add X?"
  map — the most reusable output of the whole harness.
- The locked exemplar shape reproduced **without drift** across all six sectors: every `page.tsx` is
  an async RSC that server-resolves Chihuahua-local "today" (never trusts a client clock) and reads
  the DAL via `Promise.all`; `'use client'` only on `_components` leaves; every `actions.ts` a thin
  `'use server'` delegate with no business logic.
- A pure, side-effect-free, unit-tested domain core that is the genuine single home for stacking /
  vigencia / estado / consume / forfeit / resumen / template-render — ADR-0002 "derived-not-stored"
  is real.
- One machine-enforced boundary on a Husky pre-commit hook that held through an 8-slice mock→real
  migration. The discipline of "one cheap enforced invariant" is correct — it just needs companions.
- Exemplary version-controlled RLS (owner-scoped policies on every table, no `service_role` import,
  `getClaims`/`getUser` over `getSession`, append-only `ventas`). Correctly *written*; the only gap
  is it's never *exercised* by a test.
- ADRs capture the load-bearing decisions and CONTEXT.md establishes a real ubiquitous language — the
  intent is exactly right even where rows have since drifted.
- Timezone discipline centralized: all "today" flows through `hoyChihuahua` resolved server-side.

## Recommended changes to Forge BEFORE extracting the skill (audit's shortlist)

1. **Make the cache story honest** (HIGH, small) — delete the 3 inert `revalidateTag` calls + note
   pages are intentionally dynamic, OR make caching real with `'use cache'`+`cacheTag`.
2. **Add CI + a `typecheck` script** (HIGH, small) — GH Actions on PRs to main:
   `install --frozen-lockfile && lint && tsc --noEmit && test && build`; append `vitest run` to
   pre-commit. The single most visible "production-ready" signal and the best advertisement for the
   harness.
3. **Unify "running out" + forfeit into the domain** (HIGH) — move the urgency engine into
   `rules.ts` as a tested `nivelUrgencia` consumed by roster/DAL/ficha; route write-path forfeit
   through the same named rule as the read path. The canonical "rule forked into the view / inline on
   the write path" exhibits the harness must be seen to prevent.
4. **Reconcile docs with code** (MEDIUM, small) — fix CONTEXT.md's 3 stale type paths, rewrite
   `domain/types.ts:7-8`, banner/retire `MIGRATION.md`, add the glossary-path pre-commit guard.
5. **Prove RLS + harden the DB** (MEDIUM) — commit the `REVOKE` for `rls_auto_enable()`, enable
   leaked-password protection, add ~5 cross-tenant RLS-denial tests + a pure tested `decideRedirect`
   for `proxy.ts`.
6. **Make balance writes atomic** (MEDIUM) — wrap `crearVenta`/`togglePase` in Postgres RPCs so
   ADR-0004's invariant is transactional and the decrement is concurrency-safe; or amend the ADR to
   state the accepted single-operator trade-off explicitly.
7. *Optional polish:* consolidate formatters (`clasesLabel`/`metodoLabel`/`diasLabel`), collapse
   `isoDay`/`toIsoDay`, add `fecha.ts` to ARCHITECTURE.md, add the client→DAL forbidden rule, add
   `ts-prune`/`knip` to the lint gate.
