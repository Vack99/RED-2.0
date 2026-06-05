# to-findings v2 Detectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the `to-map`/`to-findings` query-perf pipeline with the four "non-query" disease detectors it explicitly defers to v2 — D4 duplicate-fetch/missing-memoization, D5 waterfall, D6 chattiness, D2+ column-over-fetch — each TDD'd against the existing subagent shakeout harness.

**Architecture:** New `to-findings/pattern-detectors/*.md` files (self-describing: signature / confidence / fix-shape / assertion / does-NOT-cover / edge-cases), fed by new producer signals recorded by `to-map`'s stack-detectors. Detectors carry a **tier** (`hard-fail` | `watch`). Behavior is proven by adding fixtures + RED/GREEN scenario cases to `tests/shakeout.workflow.js` FIRST, then authoring the detector to turn them green.

**Tech Stack:** Markdown skill files; the shakeout suite is a `Workflow({scriptPath})` JS harness driving Opus subagents with JSON-schema'd structured output. All work is in the **`~/.claude/skills`** repo (Vack99/claude-skills) — NOT the Forge repo.

**Repo:** `C:\Users\Aaron\.claude\skills` — branch `feat/datafetch-v2-detectors`. Paths below are relative to that repo root.

---

## File Structure

**Created:**
- `to-findings/pattern-detectors/duplicate-fetch.md` — D4 (hard-fail)
- `to-findings/pattern-detectors/waterfall.md` — D5 (hard-fail)
- `to-findings/pattern-detectors/chattiness.md` — D6 (watch)
- `to-map/tests/fixtures/src/server/dup_uncached.ts` — D4 fire fixture
- `to-map/tests/fixtures/src/server/dup_cached.ts` — D4 control (no fire)
- `to-map/tests/fixtures/src/server/auth_multi.ts` — D4 auth-multiplier fixture
- `to-map/tests/fixtures/src/server/waterfall_indep.ts` — D5 fire fixture
- `to-map/tests/fixtures/src/server/waterfall_dep.ts` — D5 control (refuse)
- `to-map/tests/fixtures/src/server/chatty.ts` — D6 fixture
- `to-map/tests/fixtures/src/server/overfetch_cols.ts` — D2+ fixture

**Modified:**
- `to-map/stack-detectors/supabase-direct.md` — record `cached` + `select-cols` flags
- `to-map/stack-detectors/nextjs-rsc.md` — record `callers` (fan-in) count + await-sequence/`depends-on-prev`
- `to-findings/SKILL.md` — load the 3 new detectors; add the `tier` concept
- `to-findings/findings-handoff-schema.md` — add `D4|D5|D6` + a `tier` field
- `to-findings/pattern-detectors/missing-pagination.md` — add the D2+ column-over-fetch sub-rule
- `to-map/tests/shakeout.workflow.js` — new fixtures' cases + assertions
- `to-map/tests/SCENARIOS.md` — document the new cases + bump the pass count

**Conventions to follow (read before authoring):**
- A detector file's shape: `to-findings/pattern-detectors/missing-pagination.md` is the reference.
- A producer flag's shape: the "Useful note flags" + "Limit-dynamic flag" sections of `to-map/stack-detectors/supabase-direct.md`.
- A shakeout case's shape: any `cases.*` entry in `shakeout.workflow.js` (prompt = detector file + neutral call-site + sandbox-hygiene line; `schema` = one of the top-of-file schema consts; a matching `A(id, pass, detail)` assertion).
- Harness-testing discipline (from prior lessons): **neutral prompts**, **structured-not-prose assertions**, a **sandbox-hygiene line** ("Judge using ONLY the detector(s) and the call-site text above; do not read other repository files"), and a **RED case that feeds the OLD rule inline** to prove the edit matters. A capable subagent can hide a weak RED — always contrast against the old rule.

---

### Task 0: Branch the skills repo and baseline-verify the suite is green

**Files:** none (setup)

- [ ] **Step 1: Branch the skills repo**

Run:
```bash
cd ~/.claude/skills && git checkout -b feat/datafetch-v2-detectors && git status
```
Expected: on `feat/datafetch-v2-detectors`, clean tree.

- [ ] **Step 2: Baseline-run the shakeout suite (must be green before we touch anything)**

Run (via the Workflow tool, not bash):
```
Workflow({ scriptPath: "C:/Users/Aaron/.claude/skills/to-map/tests/shakeout.workflow.js" })
```
Expected: `{ passed: 36, total: 36 }`. If not 36/36, STOP — fix the regression or environment before proceeding; do not build on a red baseline.

- [ ] **Step 3: Commit a no-op marker (optional) / proceed.** No commit needed; baseline is read-only.

---

### Task 1: Producer signal — `cached` flag (feeds D4)

The map must record whether a read call-site's enclosing exported function is wrapped in `React.cache` / bare `cache()` / `unstable_cache`. (D2 already says cache is NOT mitigation for pagination; D4 needs the opposite signal — cache() IS the dedup fix — so the flag must exist on the call-site.)

**Files:**
- Create: `to-map/tests/fixtures/src/server/dup_cached.ts`
- Create: `to-map/tests/fixtures/src/server/dup_uncached.ts`
- Modify: `to-map/stack-detectors/supabase-direct.md`
- Test: `to-map/tests/shakeout.workflow.js`

- [ ] **Step 1: Write the two fixtures**

`dup_cached.ts`:
```ts
import { cache } from 'react'
// A shared read, request-memoized: calling it from N components issues ONE query.
export const getOperador = cache(async (supabase: any) => {
  const { data } = await supabase.from('perfil').select('negocio, coach').maybeSingle()
  return data
})
```

`dup_uncached.ts`:
```ts
// The SAME shared read, NOT memoized: each caller issues its own query.
export async function getOperador(supabase: any) {
  const { data } = await supabase.from('perfil').select('negocio, coach').maybeSingle()
  return data
}
```

- [ ] **Step 2: Add a producer case + GREEN/RED assertions to `shakeout.workflow.js`**

Add a schema const near the others (after `LFLAG`):
```js
const CACHED = { type: 'object', required: ['cached', 'reason'],
  properties: { cached: { type: 'boolean' }, reason: { type: 'string' } } }
```

Add two cases to `cases`:
```js
  cached_producer_green: () => agent([
    `You are a /to-map enumeration subagent. Read the Supabase direct stack detector, then decide whether the SELECT call-site's enclosing function is request-memoized and should carry the \`cached\` flag — following the detector EXACTLY.`,
    `Detector: ${SK}/to-map/stack-detectors/supabase-direct.md`,
    `Fixture: ${FIX}/src/server/dup_cached.ts  (the read is wrapped in \`cache(async ...)\` imported from 'react')`,
    `Return {cached (boolean — would you record the \`cached\` flag on this call-site?), reason}.`,
  ].join('\n'), { label: 'cached-producer-GREEN', phase: 'Cases', schema: CACHED }),

  cached_producer_red: () => agent([
    `You are a /to-map enumeration subagent operating under the OLD recording rule below (verbatim):`,
    `OLD rule: the only note flags are \`select-star\`, \`no-limit\`, \`single\`/\`maybeSingle\`, \`count-head\`, \`auth-call\`, \`limit-dynamic\`. There is NO \`cached\` concept — whether a read is wrapped in React.cache is NOT recorded.`,
    `Call-site: \`supabase.from('perfil').select('negocio, coach').maybeSingle()\` inside \`export const getOperador = cache(async (supabase) => ...)\`.`,
    `Apply the rule literally. Return {cached (boolean — under this OLD rule with no \`cached\` concept, would such a flag be recorded?), reason}.`,
  ].join('\n'), { label: 'cached-producer-RED', phase: 'Cases', schema: CACHED }),
```

Add assertions (in the `A(...)` block):
```js
A('cached-producer-GREEN', R.cached_producer_green?.cached === true,
  `cached=${R.cached_producer_green?.cached} (cache()-wrapped read -> flag)`)
A('cached-producer-RED(old=no-flag)', R.cached_producer_red?.cached === false,
  `cached=${R.cached_producer_red?.cached} (old rule has no cached concept -> false)`)
```

- [ ] **Step 3: Run the suite — verify the new GREEN case FAILS (RED)**

Run: `Workflow({ scriptPath: ".../shakeout.workflow.js" })`
Expected: `cached-producer-GREEN` FAILS (the detector has no `cached` rule yet, so the subagent answers `false`). `cached-producer-RED(old=no-flag)` PASSES. Total now 38 cases, 37 pass.

- [ ] **Step 4: Add the `cached` flag rule to `supabase-direct.md`**

In the "Useful note flags to append where applicable" list, add:
```markdown
- `cached` — the call-site's enclosing exported function is wrapped in `React.cache(...)`, a bare `cache()` imported from `react`, or `unstable_cache(...)`. Records that the read is request-memoized (one query per request regardless of caller count). NOTE: this flag is for /to-findings' D4 (duplicate-fetch); it does NOT downgrade a D2 (missing-pagination) finding — cache dedups a fetch but does not bound row-count.
```

- [ ] **Step 5: Run the suite — verify GREEN**

Run the suite. Expected: `cached-producer-GREEN` and `...RED` both PASS. 38/38.

- [ ] **Step 6: Commit**

```bash
cd ~/.claude/skills
git add to-map/stack-detectors/supabase-direct.md to-map/tests/fixtures/src/server/dup_cached.ts to-map/tests/fixtures/src/server/dup_uncached.ts to-map/tests/shakeout.workflow.js
git commit -m "feat(to-map): record cached flag on memoized read call-sites (feeds D4)"
```

---

### Task 2: Producer signal — `callers` fan-in count (feeds D4)

D4's "same shared read reached from ≥2 render paths" needs a caller count. Mirror the render-fanout technique (codebase-wide identifier search), but count distinct server-component call-sites of the exported fn.

**Files:**
- Modify: `to-map/stack-detectors/nextjs-rsc.md`
- Test: `to-map/tests/shakeout.workflow.js`

- [ ] **Step 1: Add a `callers` case + assertion**

Reuse the `dup_uncached.ts` fixture plus an inline description of two server components that both call `getOperador`. Add case:
```js
  callers_producer: () => agent([
    `You are a /to-map enumeration subagent. Read the Next.js RSC stack detector's fan-in rule, then decide the \`callers\` count to record for the shared read fn.`,
    `Detector: ${SK}/to-map/stack-detectors/nextjs-rsc.md`,
    `Context: \`getOperador(supabase)\` (defined in src/server/dup_uncached.ts) is imported and awaited in TWO distinct server components in one render path: src/app/(app)/cuenta/page.tsx AND src/app/(app)/cuenta/_components/header.tsx. Neither is inside a .map.`,
    `Return {callers (the integer count of distinct server-component call-sites of getOperador), reason} — answer as {cached:false, reason} is WRONG; use the count schema.`,
  ].join('\n'), { label: 'callers-producer', phase: 'Cases', schema: { type: 'object', required: ['callers', 'reason'], properties: { callers: { type: 'number' }, reason: { type: 'string' } } } }),
```
Assertion:
```js
A('callers-producer-fanin', R.callers_producer?.callers >= 2,
  `callers=${R.callers_producer?.callers} (shared read called from 2 server components -> >=2)`)
```

- [ ] **Step 2: Run — verify RED** (no fan-in rule yet → model may answer 0/1 or guess). Expected: assertion FAILS or is unreliable. 39 cases.

- [ ] **Step 3: Add the fan-in rule to `nextjs-rsc.md`**

Add a section:
```markdown
## Fan-in (callers) count

For a data-access function exported from the DAL / a server module and awaited inside server components, record `callers: <N>` = the count of DISTINCT server-component call-sites that invoke it within app render paths. Find them with a codebase-wide search for the exported identifier (`getX(`) under `app/` / the server layer, excluding `'use client'` files and test/fixture files. This is the fan-in signal /to-findings' D4 uses to decide whether an UN-memoized shared read is fetched redundantly in one render. (A `cached: YES` fn with high `callers` is fine — it dedups; a `cached: NO` fn with `callers >= 2` reachable in one render is the duplicate-fetch shape.)
```

- [ ] **Step 4: Run — verify GREEN.** Expected `callers-producer-fanin` PASS. 39/39.

- [ ] **Step 5: Commit**
```bash
git add to-map/stack-detectors/nextjs-rsc.md to-map/tests/shakeout.workflow.js
git commit -m "feat(to-map): record callers fan-in count for shared reads (feeds D4)"
```

---

### Task 3: D4 — duplicate-fetch / missing-memoization detector (hard-fail)

**Files:**
- Create: `to-findings/pattern-detectors/duplicate-fetch.md`
- Create: `to-map/tests/fixtures/src/server/auth_multi.ts`
- Modify: `to-findings/SKILL.md` (load D4)
- Test: `to-map/tests/shakeout.workflow.js`

- [ ] **Step 1: Write the auth-multiplier fixture**

`auth_multi.ts`:
```ts
// Each DAL read independently re-reads the operator via getClaims -> N auth reads per render.
export async function getResumen(supabase: any) {
  await supabase.auth.getClaims()
  return supabase.from('ventas').select('monto').gte('fecha', '2026-01-01')
}
export async function getRoster(supabase: any) {
  await supabase.auth.getClaims()
  return supabase.from('clientes').select('id, nombre')
}
```

- [ ] **Step 2: Add D4 cases + assertions (the GREEN, the cache-control, the auth-multiplier, and the OLD-set-silent RED)**

Add a `FINDING`-schema'd block (reuse the existing `FINDING` const):
```js
  d4_dup_green: () => agent([
    `You are a /to-findings D4 (duplicate-fetch / missing-memoization) detector subagent. Read the detector, then decide whether the recorded call-site is a D4 finding and at what confidence.`,
    `Detector: ${SK}/to-findings/pattern-detectors/duplicate-fetch.md`,
    `Map evidence: \`getOperador\` issues \`supabase.from('perfil').select(...)\`, recorded with \`cached: NO\` and \`callers: 2\` (awaited in two distinct server components in one render path). No React.cache wrap.`,
    `Judge using ONLY the detector and the call-site text above; do not read other repository files.`,
    `Return {emitted (boolean), confidence (HIGH|MED|LOW|none), reason (MUST name the fix: wrap in React.cache exported from one module / request-scoped loader)}.`,
  ].join('\n'), { label: 'd4-dup-GREEN', phase: 'Cases', schema: FINDING }),

  d4_cached_control: () => agent([
    `You are a /to-findings D4 (duplicate-fetch) detector subagent. Read the detector, then decide whether the call-site is a D4 finding.`,
    `Detector: ${SK}/to-findings/pattern-detectors/duplicate-fetch.md`,
    `Map evidence: \`getOperador\` issues \`supabase.from('perfil').select(...)\`, recorded with \`cached: YES\` and \`callers: 2\`. It is request-memoized via React.cache.`,
    `Judge using ONLY the detector and the call-site text above; do not read other repository files.`,
    `Return {emitted (boolean), confidence (HIGH|MED|LOW|none), reason}.`,
  ].join('\n'), { label: 'd4-cached-control', phase: 'Cases', schema: FINDING }),

  d4_auth_multi: () => agent([
    `You are a /to-findings D4 (duplicate-fetch) detector subagent. Read the detector, then decide whether the recorded auth reads are a D4 finding.`,
    `Detector: ${SK}/to-findings/pattern-detectors/duplicate-fetch.md`,
    `Map evidence: two DAL read fns reachable in ONE render path each call \`supabase.auth.getClaims()\` (recorded \`auth-call\`), neither memoized -> the operator is re-read once per DAL fn (the "current user fetched N times per load" shape).`,
    `Judge using ONLY the detector and the call-site text above; do not read other repository files.`,
    `Return {emitted (boolean), confidence (HIGH|MED|LOW|none), reason}.`,
  ].join('\n'), { label: 'd4-auth-multi', phase: 'Cases', schema: FINDING }),

  d4_old_silent: () => agent([
    `You are a /to-findings detector subagent operating under the OLD v1 detector set ONLY — D1 (n-plus-one), D2 (missing-pagination), D3 (queries-in-render). There is NO duplicate-fetch / memoization detector.`,
    `D1: ${SK}/to-findings/pattern-detectors/n-plus-one.md`,
    `D2: ${SK}/to-findings/pattern-detectors/missing-pagination.md`,
    `D3: ${SK}/to-findings/pattern-detectors/queries-in-render.md`,
    `Call-site: a memoization-less shared read \`supabase.from('perfil').select('negocio, coach').maybeSingle()\` (cached: NO) reached from 2 server components in one render. It is NOT in a loop, NOT render-fanned-out via .map, HAS .maybeSingle() (single row), and the table is tiny. Evaluate it against D1, D2, AND D3.`,
    `Judge using ONLY the three detectors and the call-site text above; do not read other repository files.`,
    `Return {emitted (does ANY of D1/D2/D3 emit a finding for the DUPLICATE-FETCH problem?), confidence, reason}.`,
  ].join('\n'), { label: 'd4-old-silent', phase: 'Cases', schema: FINDING }),
```
Assertions:
```js
A('D4-duplicate-GREEN', R.d4_dup_green?.emitted === true && /HIGH|MED/i.test(R.d4_dup_green?.confidence || '') && /cache|memo|loader/i.test(R.d4_dup_green?.reason || ''),
  `emitted=${R.d4_dup_green?.emitted} confidence=${R.d4_dup_green?.confidence}`)
A('D4-cached-control(no-fire)', R.d4_cached_control?.emitted === false,
  `emitted=${R.d4_cached_control?.emitted} (cache()-wrapped shared read is the FIX -> no D4)`)
A('D4-auth-multiplier', R.d4_auth_multi?.emitted === true,
  `emitted=${R.d4_auth_multi?.emitted} (un-memoized auth read per DAL fn -> D4)`)
A('D4-old-set-silent-RED', R.d4_old_silent?.emitted === false,
  `emitted=${R.d4_old_silent?.emitted} (v1 D1/D2/D3 are blind to duplicate-fetch -> the gap this closes)`)
```

- [ ] **Step 3: Run — verify RED.** Expected: `D4-duplicate-GREEN`, `D4-cached-control`, `D4-auth-multiplier` FAIL (detector file absent → subagent can't read it). `D4-old-set-silent-RED` PASSES (proves the gap). 43 cases.

- [ ] **Step 4: Author `duplicate-fetch.md`** following the `missing-pagination.md` shape. Required content:

```markdown
# D4 — Duplicate fetch / missing memoization

Tier: hard-fail.

The same data is fetched more than once within a single request/render because a shared read is not request-memoized. The canonical "current user / admin fetched 3-5x per page" shape.

## Pattern signature
A call-site recorded with `cached: NO` AND `callers: >=2` reachable within one render path (the same fetcher issues its query once per caller); OR `supabase.auth.getClaims()`/`getUser()` (`auth-call`) invoked from ≥2 DAL functions reachable in one render with no shared memoization.

## Confidence rules
- HIGH — `cached: NO`, `callers >= 2` in one render path, identical predicate/args; OR the auth-read-per-DAL-fn multiplier across ≥2 reads on one page.
- MED — an un-memoized expensive read reused across DIFFERENT requests where `React.cache` (request-scoped) would not help but `unstable_cache`/data-cache would (note the cross-request nature).
- LOW / review-required — `callers` ambiguous, or the duplicate is cheap and single-row.

## Fix-shape directives (prose, NOT code)
- Wrap the shared fetcher in `React.cache(...)` exported from ONE module; all callers import that one memoized fn (dedups to a single query per request).
- Lift to a request-scoped loader/context: fetch once at the route boundary, pass down as props.
- For auth: read the operator once at the boundary (or a `cache()`-wrapped `getOperador`) instead of re-reading in each DAL fn.

## Query-count assertion template
- "Render of `<route>` MUST issue ≤1 query for `<shared entity>` regardless of how many components consume it."

## What this detector does NOT cover
- Cross-request caching strategy (TTL/invalidation) — that is a data-cache concern, not request-scoped dedup.
- A `cached: YES` read with high `callers` — that is the CORRECT pattern; do NOT flag.
- Duplicate WRITES — out of scope.

## Edge cases
- `cached: YES` -> never a D4 finding (cache() is the fix here; contrast D2 where cache is not mitigation for row-count).
- A single caller (`callers: 1`) -> not a duplicate; no finding.
- Two callers that pass DIFFERENT args (different predicate) -> not the same fetch; that is an N+1/normal read, not D4.
```

- [ ] **Step 5: Register D4 in `to-findings/SKILL.md`**

In step 2 ("Load pattern detectors"), change "Always load all three v1 detectors" to load the v2 set, adding:
```markdown
- `pattern-detectors/duplicate-fetch.md` (D4) — hard-fail
```
And in step 3's verbatim instruction, after "evaluate every recorded call-site against the three pattern detectors," update to "against all pattern detectors (D1–D6)" and add a sentence: "Each detector declares a `tier` (hard-fail | watch); carry the firing detector's tier onto the finding."

- [ ] **Step 6: Run — verify GREEN.** Expected all four D4 assertions PASS. 43/43.

- [ ] **Step 7: Commit**
```bash
git add to-findings/pattern-detectors/duplicate-fetch.md to-findings/SKILL.md to-map/tests/fixtures/src/server/auth_multi.ts to-map/tests/shakeout.workflow.js
git commit -m "feat(to-findings): D4 duplicate-fetch / missing-memoization detector (hard-fail)"
```

---

### Task 4: Producer signal — await-sequence + `depends-on-prev` (feeds D5)

**Files:**
- Modify: `to-map/stack-detectors/nextjs-rsc.md`
- Create: `to-map/tests/fixtures/src/server/waterfall_indep.ts`
- Create: `to-map/tests/fixtures/src/server/waterfall_dep.ts`
- Test: `to-map/tests/shakeout.workflow.js`

- [ ] **Step 1: Write the fixtures**

`waterfall_indep.ts`:
```ts
// Two INDEPENDENT reads serialized — B does not use A. A Promise.all candidate.
export async function loadDash(supabase: any) {
  const ventas = await supabase.from('ventas').select('monto')
  const clientes = await supabase.from('clientes').select('id, nombre')
  return { ventas, clientes }
}
```

`waterfall_dep.ts`:
```ts
// B depends on A (uses cliente.id) — a JUSTIFIED sequential await, NOT a finding.
export async function loadFicha(supabase: any, id: string) {
  const { data: cliente } = await supabase.from('clientes').select('id').eq('id', id).maybeSingle()
  if (!cliente) return null
  const ventas = await supabase.from('ventas').select('monto').eq('cliente_id', cliente.id)
  return { cliente, ventas }
}
```

- [ ] **Step 2: Add producer cases + assertions**

```js
const DEPSEQ = { type: 'object', required: ['independentSerialized', 'reason'],
  properties: { independentSerialized: { type: 'boolean' }, reason: { type: 'string' } } }
```
```js
  waterfall_producer_indep: () => agent([
    `You are a /to-map enumeration subagent. Read the Next.js RSC stack detector's await-sequence rule, then decide whether the two awaited reads are INDEPENDENT and serialized.`,
    `Detector: ${SK}/to-map/stack-detectors/nextjs-rsc.md`,
    `Fixture: ${FIX}/src/server/waterfall_indep.ts`,
    `Return {independentSerialized (boolean — are there >=2 independent awaited reads run sequentially, where a later await does NOT reference an earlier await's result?), reason}.`,
  ].join('\n'), { label: 'waterfall-producer-indep', phase: 'Cases', schema: DEPSEQ }),

  waterfall_producer_dep: () => agent([
    `You are a /to-map enumeration subagent. Read the Next.js RSC stack detector's await-sequence rule, then decide whether the awaited reads are independent.`,
    `Detector: ${SK}/to-map/stack-detectors/nextjs-rsc.md`,
    `Fixture: ${FIX}/src/server/waterfall_dep.ts  (the second read uses \`cliente.id\` from the first)`,
    `Return {independentSerialized (boolean), reason}.`,
  ].join('\n'), { label: 'waterfall-producer-dep', phase: 'Cases', schema: DEPSEQ }),
```
```js
A('D5-producer-independent', R.waterfall_producer_indep?.independentSerialized === true,
  `independentSerialized=${R.waterfall_producer_indep?.independentSerialized} (two unrelated awaits -> YES)`)
A('D5-producer-dependent(no-flag)', R.waterfall_producer_dep?.independentSerialized === false,
  `independentSerialized=${R.waterfall_producer_dep?.independentSerialized} (B uses A.id -> dependent -> NO)`)
```

- [ ] **Step 3: Run — verify RED** (no await-sequence rule yet). 45 cases; the two new fail/unreliable.

- [ ] **Step 4: Add the await-sequence rule to `nextjs-rsc.md`**

```markdown
## Await-sequence / waterfall signal

In a server component or DAL function body, record a `waterfall-indep: YES` signal when ≥2 data-access calls are each `await`ed on consecutive statements AND a later await's arguments do NOT reference any binding produced by an earlier await in the same function (the reads are independent and could run in `Promise.all`). Record `waterfall-indep: NO` when a later await consumes an earlier await's result (a genuine data dependency — correct sequencing, e.g. fetch-by-id then fetch-children, or an early-return guard). This feeds /to-findings' D5 (waterfall). Reads already grouped in a single `Promise.all([...])` are concurrent — record `waterfall-indep: NO`.
```

- [ ] **Step 5: Run — verify GREEN.** 45/45.

- [ ] **Step 6: Commit**
```bash
git add to-map/stack-detectors/nextjs-rsc.md to-map/tests/fixtures/src/server/waterfall_indep.ts to-map/tests/fixtures/src/server/waterfall_dep.ts to-map/tests/shakeout.workflow.js
git commit -m "feat(to-map): record waterfall-indep await-sequence signal (feeds D5)"
```

---

### Task 5: D5 — waterfall detector (hard-fail, latency lens)

**Files:**
- Create: `to-findings/pattern-detectors/waterfall.md`
- Modify: `to-findings/SKILL.md` (load D5)
- Test: `to-map/tests/shakeout.workflow.js`

- [ ] **Step 1: Add D5 cases + assertions (GREEN fire, dependent-refuse control, OLD-silent RED)**

```js
  d5_waterfall_green: () => agent([
    `You are a /to-findings D5 (waterfall) detector subagent. Read the detector, then decide whether the recorded call-sites are a D5 finding.`,
    `Detector: ${SK}/to-findings/pattern-detectors/waterfall.md`,
    `Map evidence: src/server/waterfall_indep.ts — two awaited reads (ventas, then clientes) recorded \`waterfall-indep: YES\` (the second does not use the first; both on a server data path).`,
    `Judge using ONLY the detector and the call-site text above; do not read other repository files.`,
    `Return {emitted (boolean), confidence (HIGH|MED|LOW|none), reason (MUST name the fix: Promise.all the independent reads / preload)}.`,
  ].join('\n'), { label: 'd5-waterfall-GREEN', phase: 'Cases', schema: FINDING }),

  d5_dep_control: () => agent([
    `You are a /to-findings D5 (waterfall) detector subagent. Read the detector, then decide whether the call-sites are a D5 finding.`,
    `Detector: ${SK}/to-findings/pattern-detectors/waterfall.md`,
    `Map evidence: src/server/waterfall_dep.ts — a read by id, then a dependent read using \`cliente.id\`, recorded \`waterfall-indep: NO\` (genuine dependency / early-return guard).`,
    `Judge using ONLY the detector and the call-site text above; do not read other repository files.`,
    `Return {emitted (boolean), confidence, reason}.`,
  ].join('\n'), { label: 'd5-dep-control', phase: 'Cases', schema: FINDING }),

  d5_old_silent: () => agent([
    `You are a /to-findings detector subagent operating under the OLD v1 detector set ONLY — D1, D2, D3. NONE of them audit latency / sequential-independent awaits (D1 explicitly: "Sequential awaits that are NOT iterating over a fetched array ... Out of scope"; D3 explicitly: "Render waterfalls ... v1 does not build a latency detector").`,
    `D1: ${SK}/to-findings/pattern-detectors/n-plus-one.md`,
    `D3: ${SK}/to-findings/pattern-detectors/queries-in-render.md`,
    `Call-site: two INDEPENDENT awaited reads serialized (ventas then clientes; neither in a loop, neither render-fanned-out). Evaluate against D1 and D3.`,
    `Judge using ONLY the detectors and the text above; do not read other repository files.`,
    `Return {emitted (does D1 or D3 emit for the WATERFALL/serialization problem?), confidence, reason}.`,
  ].join('\n'), { label: 'd5-old-silent', phase: 'Cases', schema: FINDING }),
```
```js
A('D5-waterfall-GREEN', R.d5_waterfall_green?.emitted === true && /promise\.all|parallel|preload/i.test(R.d5_waterfall_green?.reason || ''),
  `emitted=${R.d5_waterfall_green?.emitted} reason=${(R.d5_waterfall_green?.reason||'').slice(0,100)}`)
A('D5-dependent-control(no-fire)', R.d5_dep_control?.emitted === false,
  `emitted=${R.d5_dep_control?.emitted} (dependent await is justified -> no D5)`)
A('D5-old-set-silent-RED', R.d5_old_silent?.emitted === false,
  `emitted=${R.d5_old_silent?.emitted} (v1 audits cost not latency -> blind to waterfalls)`)
```

- [ ] **Step 2: Run — verify RED.** GREEN+control fail (detector absent); OLD-silent passes. 48 cases.

- [ ] **Step 3: Author `waterfall.md`** following the detector shape. Required content:

```markdown
# D5 — Request waterfall (independent serialized awaits)

Tier: hard-fail. This is a LATENCY detector (v1 intentionally shipped none) — it audits round-trip serialization, not query cost.

## Pattern signature
A function/server-component body with `waterfall-indep: YES`: ≥2 data-access calls each `await`ed on consecutive statements where later awaits do not consume earlier results — they could run concurrently in `Promise.all`.

## Confidence rules
- HIGH — ≥2 independent awaited reads serialized in a hot path (`page.tsx`/route on a critical flow).
- MED — independent serialized awaits on a cold/secondary path.
- LOW / review — only two cheap reads, or independence is ambiguous.

## Fix-shape directives (prose, NOT code)
- Parallelize: initiate the independent fetches without awaiting, then `await Promise.all([...])`. Use `Promise.allSettled` if some are optional.
- Preload pattern: kick off the fetch (`void getX()`) before unrelated async work so it overlaps.
- For genuinely dependent fetches, do NOT parallelize — use `<Suspense>` streaming to hide the unavoidable wait instead.

## Assertion template
- "Independent reads on `<route>` MUST be issued concurrently (one parallel group), not serialized."

## What this detector does NOT cover
- Dependent awaits (`waterfall-indep: NO`) — correct sequencing; never a finding.
- Query COST (rows/fan-out) — that is D1/D2/D3.
- Client-component fetch ordering — out of scope (server data paths only).

## Edge cases
- A deliberate early-return guard (`await getById; if (!found) return`) THEN a Promise.all — the guard await is justified (`waterfall-indep: NO`); do not flag.
- Reads already in one `Promise.all` — concurrent; not a finding.
```

- [ ] **Step 4: Register D5 in `to-findings/SKILL.md`** (add `- pattern-detectors/waterfall.md (D5) — hard-fail` to the load list).

- [ ] **Step 5: Run — verify GREEN.** 48/48.

- [ ] **Step 6: Commit**
```bash
git add to-findings/pattern-detectors/waterfall.md to-findings/SKILL.md to-map/tests/shakeout.workflow.js
git commit -m "feat(to-findings): D5 waterfall detector (hard-fail latency lens)"
```

---

### Task 6: D6 — chattiness detector (watch tier)

**Files:**
- Create: `to-findings/pattern-detectors/chattiness.md`
- Create: `to-map/tests/fixtures/src/server/chatty.ts`
- Modify: `to-findings/SKILL.md` (load D6)
- Test: `to-map/tests/shakeout.workflow.js`

- [ ] **Step 1: Fixture `chatty.ts`**
```ts
// Four small independent single-row reads in one render that could be one query/join.
export async function loadHeader(supabase: any) {
  const a = await supabase.from('perfil').select('negocio').maybeSingle()
  const b = await supabase.from('cobro').select('precio').maybeSingle()
  const c = await supabase.from('paquetes').select('nombre').limit(5)
  const d = await supabase.from('plantillas').select('nombre').limit(5)
  return { a, b, c, d }
}
```

- [ ] **Step 2: Add D6 case + assertion (watch-tier → emits but routes to review-required / watch, never hard-fail)**
```js
  d6_chatty: () => agent([
    `You are a /to-findings D6 (chattiness) detector subagent. Read the detector, then decide whether the recorded reads are a D6 finding and its tier.`,
    `Detector: ${SK}/to-findings/pattern-detectors/chattiness.md`,
    `Map evidence: src/server/chatty.ts issues FOUR small independent reads (perfil, cobro, paquetes, plantillas) in one render — none in a loop; they are already parallelizable but are many small round-trips.`,
    `Judge using ONLY the detector and the call-site text above; do not read other repository files.`,
    `Return {emitted (boolean), confidence (HIGH|MED|LOW|none), reason (MUST state tier=watch and the batch/BFF/compound-read fix)}.`,
  ].join('\n'), { label: 'd6-chatty', phase: 'Cases', schema: FINDING }),
```
```js
A('D6-chattiness-watch', R.d6_chatty?.emitted === true && /watch/i.test(R.d6_chatty?.reason || '') && /batch|join|bff|compound|aggregat/i.test(R.d6_chatty?.reason || ''),
  `emitted=${R.d6_chatty?.emitted} reason=${(R.d6_chatty?.reason||'').slice(0,120)}`)
```

- [ ] **Step 3: Run — verify RED** (detector absent). 49 cases.

- [ ] **Step 4: Author `chattiness.md`** (tier: watch). Signature: ≥N (default 3) independent same-render reads that could be one batched/compound query. Confidence default LOW/MED → `review-required`. Fix-shapes: batch/compound read, BFF aggregation, GraphQL-style single round-trip; NOTE the HTTP/2 caveat (many small cacheable reads can be fine — do not hard-fail). "Does NOT cover": reads already justified as distinct concerns; loops (that's D1). Must state `tier: watch` so the gate never REDs on it alone.

- [ ] **Step 5: Run — verify GREEN.** 49/49.

- [ ] **Step 6: Commit**
```bash
git add to-findings/pattern-detectors/chattiness.md to-findings/SKILL.md to-map/tests/fixtures/src/server/chatty.ts to-map/tests/shakeout.workflow.js
git commit -m "feat(to-findings): D6 chattiness detector (watch tier)"
```

---

### Task 7: D2+ — column-level over-fetch sub-rule (watch tier)

**Files:**
- Modify: `to-map/stack-detectors/supabase-direct.md` (record `select-cols`)
- Modify: `to-findings/pattern-detectors/missing-pagination.md` (add the column sub-rule)
- Create: `to-map/tests/fixtures/src/server/overfetch_cols.ts`
- Test: `to-map/tests/shakeout.workflow.js`

- [ ] **Step 1: Fixture `overfetch_cols.ts`**
```ts
// Selects 5 columns; the consumer only reads 2 (id, nombre).
export async function getPicker(supabase: any) {
  const { data } = await supabase.from('clientes').select('id, nombre, tel, ciudad, notas').limit(50)
  return (data ?? []).map((c: any) => ({ id: c.id, label: c.nombre }))
}
```

- [ ] **Step 2: Add `select-cols` flag to `supabase-direct.md`** ("Useful note flags": `- \`select-cols: a,b,c\` — the explicit column list passed to .select(), when not '*'; lets /to-findings compare selected vs consumed columns.").

- [ ] **Step 3: Add the column-over-fetch sub-rule to `missing-pagination.md`** under a new heading "## Column-level over-fetch (D2+, tier: watch)": when `select-cols` lists columns the consumer demonstrably never reads (the mapped/returned shape uses a strict subset), emit a watch-tier finding: "narrow the select to the columns actually used." Confidence MED/review (requires consumer-usage confirmation). Never hard-fail.

- [ ] **Step 4: Add case + assertion**
```js
  d2plus_cols: () => agent([
    `You are a /to-findings D2 detector subagent. Read the detector (incl. the column-level over-fetch sub-rule), then decide whether the call-site is a column-over-fetch (D2+) finding.`,
    `Detector: ${SK}/to-findings/pattern-detectors/missing-pagination.md`,
    `Map evidence: src/server/overfetch_cols.ts — \`supabase.from('clientes').select('id, nombre, tel, ciudad, notas')\` recorded \`select-cols: id,nombre,tel,ciudad,notas\`; the consumer maps each row to only \`{id, nombre}\` (tel, ciudad, notas are never read).`,
    `Judge using ONLY the detector and the call-site text above; do not read other repository files.`,
    `Return {emitted (boolean), confidence (HIGH|MED|LOW|none), reason (MUST state tier=watch and "narrow the select")}.`,
  ].join('\n'), { label: 'd2plus-cols', phase: 'Cases', schema: FINDING }),
```
```js
A('D2+-column-overfetch-watch', R.d2plus_cols?.emitted === true && /watch/i.test(R.d2plus_cols?.reason || '') && /narrow|column|select/i.test(R.d2plus_cols?.reason || ''),
  `emitted=${R.d2plus_cols?.emitted} reason=${(R.d2plus_cols?.reason||'').slice(0,120)}`)
```

- [ ] **Step 5: Run — RED then (after Steps 2-3 authored) GREEN.** Sequence: write fixture + case + assertion (Step 1,4) → run → `D2+-column-overfetch-watch` FAILS (sub-rule absent) → author Steps 2,3 → run → PASS. 50/50.

- [ ] **Step 6: Commit**
```bash
git add to-map/stack-detectors/supabase-direct.md to-findings/pattern-detectors/missing-pagination.md to-map/tests/fixtures/src/server/overfetch_cols.ts to-map/tests/shakeout.workflow.js
git commit -m "feat(to-findings): D2+ column-level over-fetch sub-rule (watch tier)"
```

---

### Task 8: Wire tiers into the handoff schema + docs

**Files:**
- Modify: `to-findings/findings-handoff-schema.md`
- Modify: `to-map/tests/SCENARIOS.md`

- [ ] **Step 1: Add `D4|D5|D6` + a `tier` field to the finding block in `findings-handoff-schema.md`**

Change the `detector:` line to `detector: <D1 | D2 | D3 | D4 | D5 | D6>` and add a line right after it:
```markdown
- tier: <hard-fail | watch>   <!-- carried from the firing detector; the gate REDs only on hard-fail (or the D2 un-scoped correctness subclass) -->
```
Add a one-line note in "Schema rules": "Every finding carries the firing detector's `tier`. `watch`-tier findings are advisory (candidates for the accepted-debt ledger), never a build-blocker on their own."

- [ ] **Step 2: Update `SCENARIOS.md`** — add the new fixtures to the fixtures table (dup_cached, dup_uncached, auth_multi, waterfall_indep, waterfall_dep, chatty, overfetch_cols), add the new cases to the cases table (the D4/D5/D6/D2+ GREEN/RED/control rows + the two producer signals), bump the headline to the new total, and under "Known coverage gaps" note that D6 chattiness independence and D2+ consumer-usage are heuristic (watch-tier).

- [ ] **Step 3: Commit**
```bash
git add to-findings/findings-handoff-schema.md to-map/tests/SCENARIOS.md
git commit -m "docs(to-findings): add D4/D5/D6 + tier to handoff schema and scenarios"
```

---

### Task 9: Full green run + tag

**Files:** none (verification)

- [ ] **Step 1: Run the complete suite**

Run: `Workflow({ scriptPath: "C:/Users/Aaron/.claude/skills/to-map/tests/shakeout.workflow.js" })`
Expected: all assertions pass (≈50/50). Any `pass:false` names the case + the structured output that failed — fix the detector/producer (NOT the assertion, unless the assertion is itself buggy — a red is usually a test bug) and re-run.

- [ ] **Step 2: Update the "Last run" line** in both `SCENARIOS.md` and the top comment of `shakeout.workflow.js` to the new pass count + date. Commit:
```bash
git add to-map/tests/SCENARIOS.md to-map/tests/shakeout.workflow.js
git commit -m "test: v2 detector suite green (NN/NN)"
```

- [ ] **Step 3: Hand back.** Report the final pass count and the new detector inventory. Part A is done; Part B (the `/to-health` gate + accepted-debt ledger) gets its own plan, now that the v2 findings these produce are real and testable.

---

## Self-Review

**1. Spec coverage** (against `2026-06-05-datafetch-health-gate-design.md` §3):
- D4 duplicate/memoization → Tasks 1,2,3 ✓ (cached flag, callers fan-in, detector, auth-multiplier + cache-control + old-silent)
- D5 waterfall → Tasks 4,5 ✓ (await-sequence signal, detector, dependent-refuse control + old-silent)
- D6 chattiness (watch) → Task 6 ✓
- D2+ column over-fetch (watch) → Task 7 ✓
- Tiering wired → Tasks 3,5 (SKILL carries tier), 8 (schema `tier` field) ✓
- TDD fixture-first, RED-before-GREEN → every detector task ✓
- "Forge is the negative control" intuition encoded → D4 cache-control + D5 dependent-control fixtures mirror Forge's real patterns ✓
- NOT in this plan (correctly — Part B): the `/to-health` gate, the accepted-debt ledger, the integration run on Forge. Flagged in Task 9 Step 3.

**2. Placeholder scan:** fixtures, scenario cases, assertions, and detector rule-cores are all given verbatim. Detector files specify their full required section content (signature/confidence/fix-shape/exclusions/edge-cases) — authored by mirroring `missing-pagination.md`'s shape, which the plan names explicitly. No "TBD"/"similar to"/"add error handling".

**3. Type/name consistency:** producer flags (`cached`, `callers`, `waterfall-indep`, `select-cols`) are named identically in the producer task that creates them and the detector task that consumes them. Detector IDs (D4/D5/D6) consistent across SKILL load-list, handoff schema, and assertions. Schema consts (`FINDING`, `CACHED`, `DEPSEQ`) match their case `schema:` and assertion field reads.

**Assumption to verify at execution:** the shakeout harness drives detectors against *described* map evidence (call-site text in the prompt), so producer-flag tasks (1,2,4,7) and consumer-detector tasks (3,5,6,7) are tested independently — consistent with how B1/B2/A1 already split producer vs consumer cases. No end-to-end map→findings integration case is added here (matches the existing suite's design); end-to-end validation is the Forge integration run in Part B.
