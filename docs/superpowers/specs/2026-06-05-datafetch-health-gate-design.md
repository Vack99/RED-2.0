# Data-Fetch Health Gate — design — 2026-06-05

A re-runnable health gate that detects all seven request/data-fetching "diseases,"
remembers consciously-accepted debt, and emits a single per-sector
**"free to continue?"** verdict for Forge (and any Next.js + Supabase project).

Status: **approved** (brainstorming complete; this doc drives `/writing-plans`).

---

## 1. Why

The user wants one signal — *"is the project in a clean, healthy state, free to
continue?"* — across seven data-fetching anti-patterns:

1. Request amplification / fan-out
2. Chattiness
3. Over-fetching
4. Request waterfalls
5. Redundant / duplicate fetching (missing memoization) — the "admin user fetched 3-5×" disease
6. N+1
7. Read amplification

Two prior research + validation passes established the ground truth this design builds on:

- **Industry research** (4-agent sweep): top teams layer four defenses — detect →
  gate (CI/PR) → design-away → institutionalize. The single biggest lever is that
  5 of the 7 diseases are *visual shapes in one request trace*; #3 (over-fetch) and
  #7 (read-amp) need their own lenses (payload bytes; aggregate-across-traffic).
- **Validation audit of Forge** (sector-by-sector, adversarially verified): Forge's
  data layer is **healthy by design** — `createClient` + every read DAL fn are
  `React.cache()`-wrapped, pages use `Promise.all` for independent reads, lists use
  `.in(ids)` batching, reads rely on RLS (no per-fn `getClaims`). **The "admin 3-5×"
  hypothesis is refuted in Forge.** The one real HIGH (`getMarcadas` full-table read)
  was already fixed (`d958423`); 8 items remain as **consciously-accepted debt**
  (the "over-read-to-aggregate-in-JS" family), each with a documented push-to-DB trigger.

### The methodology lesson that defines this design

The validation pass's binary "all-CLEAN" verdict **silently swallowed the 8
accepted-debt items** — it conflated *"no problem"* with *"consciously-accepted debt
with a scale-trigger."* A naive pass/fail gate destroys institutional memory. The
gate MUST be **three-state-aware** and must **reconcile against an accepted-debt
ledger**, re-checking each item's trigger every run.

### Why one gate, not 3 or 7 harnesses (empirically settled)

- The diseases do not separate cleanly — every sector map assessed all 7 lenses from
  *one read-trace per sector*. Splitting into N harnesses re-reads the same ~14 DAL
  files N times for findings that co-locate.
- Zero *new* confirmed findings across all 7 patterns ⇒ no pattern has the volume to
  justify a dedicated harness.
- The user asked for **one green light** ("free to continue"); N harnesses produce N
  reports to reconcile — the opposite.

### Coverage gap in the existing tooling (verified, not assumed)

`to-map`/`to-findings` (the user's 36/36 query-perf audit pipeline) is a rigorous
**query-COST** auditor but has explicit scope holes — confirmed by reading every
detector's "does NOT cover" section:

| # | Disease | v1 coverage |
|---|---------|-------------|
| 6 | N+1 | ✅ D1 `n-plus-one` |
| 1 | Fan-out | ✅ D3 `queries-in-render` (server-side render-fanout) |
| 7 | Read-amplification | ✅ D2 `missing-pagination` (in-app flavor) |
| 3 | Over-fetching | ⚠️ row-level only (D2); **column-level NOT covered** |
| 5 | Duplicate / no-memoization | ❌ **GAP** — D1: "intra-request duplicate queries — deferred to v2" |
| 4 | Waterfalls | ❌ **GAP** — D1 & D3: "out of scope" / "v1 does not build a latency detector" |
| 2 | Chattiness | ❌ **GAP** — no detector |

Using v1 as the gate as-is would declare Forge GREEN while **blind to 3 of 7
diseases** — the false-green trap. The gaps are exactly the "non-query / request-shape"
set, and `to-findings`'s own author already earmarked them **"v2."**

---

## 2. Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Harness count | **One gate** | Diseases co-locate; user wants one verdict |
| Close the gaps by | **Extend `to-findings` to v2 + thin gate skill** | Reuses 36/36 machinery + fresh-context verify gate; completes the author's own roadmap; no extra code-scan pass |
| Coverage weighting | **Tiered** — hard-fail the common breakers, watch the rest | Reconciles "find all diseases" with "focus on the most common" |
| Memory | **Accepted-debt ledger with scale-triggers** | Fixes the amnesia bug the validation pass exposed |
| Grouping | **By sector** (Forge's sectors *are* the sections); per-area for generic projects | Matches the sector-first architecture |

### Tier assignment

- **Hard-fail (gate goes 🔴 RED):** #1 fan-out (D3), #4 waterfall (D5), #5 duplicate (D4),
  #6 N+1 (D1). **Plus** D2's *un-scoped-unbounded-growable* subclass (silent-truncation /
  correctness — the class the prior HIGH belonged to).
- **Watch (surfaced as accepted-debt with trigger; never RED on its own):** #3 over-fetch
  (D2 volume/cost + D2+ column), #7 read-amp (D2 cost-only), #2 chattiness (D6).

Tiering is **per-finding**, not purely per-detector — D2 spans a spectrum from
correctness (hard-fail) to cost-only (watch), mirroring the user's 2026-06-02 triage.

---

## 3. Design — Part A: complete `to-findings` v2

Three new detector files (in the existing detector shape: pattern signature /
confidence rules / fix-shape directives / assertion template / "does NOT cover" /
edge-cases), plus the producer signals `to-map` must record to feed them. Repo:
**`~/.claude/skills`** (Vack99/claude-skills).

### D4 — duplicate-fetch / missing memoization (#5) — hard-fail

- **Signature:** the same data-access call-site (same table + same effective predicate/args)
  reachable from ≥2 paths within one request/render where the fetcher is NOT wrapped in a
  request-scoped memo (`React.cache` / `unstable_cache`); OR an auth read
  (`supabase.auth.getClaims/getUser`) invoked from multiple DAL functions on one render path.
- **New `to-map` signal:** `cached: YES|NO` per read fn; reached-by multiplicity
  (how many distinct render paths reach the fetcher). `auth-call` is already recorded.
- **Confidence:** HIGH = identical call-site reachable from ≥2 components in one render,
  no `cache()` wrap, or the auth-read-per-DAL-fn multiplier. MED = un-memoized cross-request
  repeat of an expensive read (`cache()` doesn't span requests, e.g. `getResumenMes` used by
  both `inicio` and `cuenta`). LOW/review = ambiguous.
- **Fix-shape:** wrap the shared fetcher in `React.cache`, exported from one module; lift to
  a request-scoped loader/context.
- **Forge is the negative control:** clean *because* it already uses `cache()`. D4 MUST fire
  **zero** on Forge. Fixture pair: with-cache → no fire; without-cache → fire.

### D5 — render/await waterfall (#4) — hard-fail (latency lens)

- **Signature:** ≥2 **independent** awaited data-access calls serialized
  (`await A; await B` where B does not consume A's result) instead of `Promise.all`; OR a
  nested server component doing fetch-on-render that depends on a parent fetch (genuine
  dependency → `<Suspense>`, not a finding).
- **New `to-map` signal:** sequential-await sequences + `depends-on-prev: YES|NO`
  (does B's args reference A's result?).
- **Confidence:** HIGH = two independent awaited DAL calls serialized on a page/hot route.
  MED = independent serialized awaits on a cold path. **Justified data-dependent waterfalls
  MUST be refused** (Forge's ficha early-404 guard; the conditional head-count).
- **Fix-shape:** `Promise.all` the independent set; preload pattern; `<Suspense>` for genuine
  dependencies.
- **Assertion shifts** from query-count to "independent reads on `<route>` MUST be parallelized."
- **Forge control:** uses `Promise.all` already → D5 fires zero on audited sectors; the ficha
  guard is correctly refused. Fixture pair: independent-serial → fire; dependent-serial → refuse.

### D6 — chattiness (#2) — watch

- **Signature:** ≥N (default 3) small independent same-target reads in one render that could be
  one batched query/join. Distinct from D5 (serialization) — D6 is about *count* of round-trips
  even when parallel.
- **Watch-tier only** (noisy): low confidence by default → `review-required` / accepted-debt
  with a scale-trigger; never a RED.

### D2+ — column-level over-fetch (#3 narrow) — watch (extend D2)

- **Signature:** `select(cols)` where some selected columns are demonstrably unused by the
  consumer (requires consumer-usage analysis; keep MED/review).
- **Watch-tier.** (The validation pass found `getRosterResumen` over-selects 3 unused columns —
  real but pennies.)

### Producer + test work

- `to-map` records the new signals: `cached`, reached-by multiplicity, await sequences +
  `depends-on-prev`, per-render same-target read count, selected-vs-used columns.
- **TDD per the skill's own rule:** add fixtures + scenario cases FIRST (watch them go RED),
  then make GREEN. Suite grows 36 → ~50+. Re-run via `to-map/tests/shakeout.workflow.js`.
- Honor the harness-skill-testing lessons: a capable subagent can obscure RED — contrast against
  the old-rule-inline, assert on structured output not prose, keep prompts neutral.

---

## 4. Design — Part B: the thin gate skill `/to-health`

A new skill in **`~/.claude/skills`**. It does **not** re-scan code — it *reconciles*.

1. **Run** `/to-map → /to-findings` (now v2), or consume an existing `findings-*.md`.
   Still two code-scans total, as today.
2. **Load the accepted-debt ledger** — `docs/health/accepted-debt.md` (in the **target
   project**, i.e. Forge). Seeded from the 2026-06-02 audit's 8 triaged-MED items. Each entry:
   `id, disease, file:line, scale-trigger, date, rationale`. Example trigger:
   *"`getRosterResumen` aggregate-in-JS — push to a DB count RPC if `clientes` > 800 rows."*
3. **Reconcile** each finding → one of four states:
   - matches ledger, trigger **not** crossed → **ACCEPTED** (green, but listed)
   - matches ledger, trigger **crossed** → **NEEDS-WORK** (debt came due)
   - new, hard-fail tier (or D2 correctness subclass) → **NEEDS-WORK** (RED)
   - new, watch tier → **WATCH** (prompt: triage into ledger or fix)
4. **Verdict, per sector:** CLEAN / ACCEPTED / WATCH / NEEDS-WORK, then the headline —
   - 🟢 **"Free to continue"** iff every sector is CLEAN or ACCEPTED (no un-ledgered hard-fail,
     no crossed trigger).
   - 🔴 **"Not yet"** otherwise — names the blocking sectors + diseases.
5. **Trigger re-check every run** — row counts via a count query / `pg_stat_statements` / the
   map's growth signals. Accepted-debt that grew past its trigger auto-flips to RED. **This is
   the fix for the amnesia bug.**

Output: a `health-<project>-<date>.md` doc + a terminal summary. Re-runnable: fix → re-run →
until 🟢.

---

## 5. How it satisfies the asks

| Ask | How |
|-----|-----|
| "Keep running until *free to continue*" | Re-runnable 🟢/🔴 headline |
| "*Which sections* are healthy" | Per-sector 4-state |
| "Find **all** diseases" | All 7 (4 hard-fail, 3 watch) |
| "Focus on the **most common**" | RED reserved for #1/#4/#5/#6 |
| "**Output quality**" | Reuses fresh-context verify gate + 36/36 suite; ACCEPTED state preserves memory |
| "Don't over-engineer / no extra passes" | 2 code-scans as today; gate is verdict-only; v2 detectors ride the existing pass |

---

## 6. Build sequence

1. Seed `docs/health/accepted-debt.md` (Forge) from the 2026-06-02 audit — 8 items + triggers.
2. `to-map` producer signals (+ fixtures, RED-first).
3. D4 detector (+ with/without-cache fixture pair).
4. D5 detector (+ independent-serial / dependent-justified fixture pair).
5. D6 + D2+ detectors (watch-tier) (+ fixtures).
6. Re-run shakeout suite → green (~50+ cases).
7. `/to-health` gate skill: pipeline runner + ledger reconcile + 4-state verdict + trigger
   re-check (+ gate tests).
8. **Integration run on Forge** → expect 🟢 with the 8 items as ACCEPTED (not a false "all-clean").
   Validate the output *reads right* before calling it done (validate-before-codify).
9. Elegance + Senior-Dev gates.

---

## 7. Repos touched

- **Forge** (this repo): this spec; `docs/health/accepted-debt.md`; the integration test target.
- **`~/.claude/skills`** (Vack99/claude-skills): `to-map` producer changes; `to-findings` v2
  detectors (D4/D5/D6/D2+); new `/to-health` skill; new fixtures + scenarios.

Each repo gets its own branch + commits.

---

## 8. Success criteria

- `/to-health` run on Forge prints 🟢 **"free to continue"** with the 8 known items listed as
  **ACCEPTED** (not hidden, not RED), and CLEAN for everything else.
- Introducing a synthetic duplicate-fetch (un-memoized shared read) or an independent serial
  waterfall flips the relevant sector to 🔴 **NEEDS-WORK**.
- Growing a ledgered item past its trigger flips it from ACCEPTED → 🔴 NEEDS-WORK on re-run.
- Extended shakeout suite is green; new detectors have RED/GREEN fixture pairs.
- No extra code-scan pass vs. today's `to-map → to-findings`.
