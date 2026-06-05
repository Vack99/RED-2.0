# /to-health Gate + Accepted-Debt Ledger Implementation Plan (Part B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A re-runnable `/to-health` gate that runs the v2 `to-map → to-findings` pipeline, reconciles findings against a per-project accepted-debt ledger, and emits a deterministic per-sector **"free to continue?"** (🟢/🔴) verdict.

**Architecture:** A new `to-health` skill in `~/.claude/skills`. The skill ORCHESTRATES (run the pipeline, read the ledger, gather row counts, present the report); a small **pure script `reconcile.mjs`** does the DETERMINISTIC verdict (findings × ledger × counts → states + headline) so the gate never depends on LLM judgment for green/red. The accepted-debt ledger lives in the TARGET project (`docs/health/accepted-debt.md`), seeded for Forge from the 2026-06-02 audit's 8 triaged items.

**Tech Stack:** Markdown skill files; one ESM module `reconcile.mjs` (pure, no I/O) unit-tested with `node:assert` run via `node` (deterministic, no subagents); Supabase MCP `execute_sql` for live row-count trigger checks during the Forge integration run.

**Two locked design decisions (review these):**
1. **Deterministic verdict** — `reconcile.mjs` computes 🟢/🔴, not an LLM. The agent's role is extraction + orchestration only.
2. **WATCH never blocks 🟢** — advisory; surfaced as triage nudges. Green = no NEEDS-WORK (no un-ledgered hard-fail, no crossed trigger). This resolves the spec §4 "CLEAN or ACCEPTED" wording.

**Repos:** ledger → **Forge** (`feat/datafetch-health-gate`); skill + script + tests → **`~/.claude/skills`** (continue on `feat/datafetch-v2-detectors`, or a fresh `feat/to-health` off it — Task 0 decides).

---

## File Structure

**Created — Forge:**
- `docs/health/accepted-debt.md` — the ledger (8 seeded entries + a header explaining the schema)

**Created — `~/.claude/skills`:**
- `to-health/SKILL.md` — the gate orchestration
- `to-health/reconcile.mjs` — pure deterministic reconciliation (the verdict)
- `to-health/health-handoff-schema.md` — the `health-*.md` report contract + the structured-input shape `reconcile.mjs` expects
- `to-health/accepted-debt-schema.md` — the ledger entry contract (so any project's ledger is parseable)
- `to-health/tests/reconcile.test.mjs` — deterministic unit tests for `reconcile.mjs`
- `to-health/tests/SCENARIOS.md` — case catalogue + how to run

**Reference to follow:** `~/.claude/skills/to-findings/SKILL.md` (skill prose style + the fresh-context discipline), `to-findings/findings-handoff-schema.md` (the findings doc `reconcile` consumes — note the `tier:` field added in Part A).

---

### Task 0: Branch decision + baseline

**Files:** none

- [ ] **Step 1: Decide the skills branch.** Part A is on `feat/datafetch-v2-detectors` (skills repo). Continue Part B on the SAME branch (the gate consumes the v2 detectors — one cohesive feature). Confirm: `git -C "C:/Users/Aaron/.claude/skills" branch --show-current` → `feat/datafetch-v2-detectors`. If a clean separation is wanted, `git -C "C:/Users/Aaron/.claude/skills" checkout -b feat/to-health` first. Default: stay on `feat/datafetch-v2-detectors`.
- [ ] **Step 2: Confirm Forge branch** is `feat/datafetch-health-gate`: `git -C "C:/Users/Aaron/Documents/Repos/forge-1.0" branch --show-current`.

---

### Task 1: Seed the accepted-debt ledger (Forge) + its schema

**Files:**
- Create: `~/.claude/skills/to-health/accepted-debt-schema.md`
- Create: `C:/Users/Aaron/Documents/Repos/forge-1.0/docs/health/accepted-debt.md`

- [ ] **Step 1: Write the ledger schema** `accepted-debt-schema.md`:
```markdown
# Accepted-debt ledger schema

`docs/health/accepted-debt.md` in the target project. Each entry is a consciously-accepted
finding the health gate treats as ACCEPTED (🟢) **until its trigger is crossed**, then NEEDS-WORK.

## Entry shape (one `### L-<NNN>` block each)
- `disease:` one of the detector families — `n+1 | fan-out | over-fetch | waterfall | duplicate-fetch | read-amplification | chattiness`
- `detector:` `D1|D2|D2+|D3|D4|D5|D6`
- `location:` `<relative file path>` (+ optional `:line` / fn name — matching is by FILE + disease, line is informational since lines drift)
- `accepted:` ISO date
- `rationale:` one line — why it's acceptable now
- `trigger:` EITHER a machine-checkable row-count trigger `table:<name> op:<> | >= | <> threshold:<int>` OR `manual:<one-line description>` (e.g. a latency SLO the static gate can't measure)

A finding that matches an entry (same file + disease) and whose trigger is NOT crossed → ACCEPTED.
Trigger crossed → NEEDS-WORK. Trigger `manual:` or count unavailable → ACCEPTED but listed under
"unverified triggers" for the operator to check.
```

- [ ] **Step 2: Seed Forge's ledger** from `docs/superpowers/audits/2026-06-02-forge-query-perf-findings.md` (the 8 triaged-MED items; F-001 was FIXED so it is NOT in the ledger). Write `docs/health/accepted-debt.md`:
```markdown
# Accepted data-fetch debt — forge-1.0

Schema: `~/.claude/skills/to-health/accepted-debt-schema.md`. Seeded 2026-06-05 from the
2026-06-02 query-perf audit (the 1 HIGH was fixed in d958423 and is intentionally absent here).
The health gate treats each as 🟢 ACCEPTED until its trigger is crossed.

### L-001 — getClientesLite over-reads (client-picker)
- disease: read-amplification
- detector: D2
- location: src/lib/data/clientes.ts (getClientesLite)
- accepted: 2026-06-02
- rationale: full roster, naturally small for one gym
- trigger: table:clientes op:> threshold:2000

### L-002 — getClientesParaPase over-reads (pase-de-lista)
- disease: read-amplification
- detector: D2
- location: src/lib/data/clientes.ts (getClientesParaPase)
- accepted: 2026-06-02
- rationale: full roster, small
- trigger: table:clientes op:> threshold:2000

### L-003 — getClientesRoster directory leg over-reads
- disease: read-amplification
- detector: D2
- location: src/lib/data/clientes.ts (getClientesRoster)
- accepted: 2026-06-02
- rationale: full roster
- trigger: table:clientes op:> threshold:2000

### L-004 — getRosterResumen aggregates whole roster in JS
- disease: read-amplification
- detector: D2
- location: src/lib/data/clientes.ts (getRosterResumen)
- accepted: 2026-06-02
- rationale: pulls every client row to compute 2 scalar counts; cheap at gym scale. Push-to-DB candidate (count RPC/view).
- trigger: table:clientes op:> threshold:800

### L-005 — getClienteFicha per-client purchases unbounded
- disease: read-amplification
- detector: D2
- location: src/lib/data/clientes.ts (getClienteFicha — ventas leg)
- accepted: 2026-06-02
- rationale: bounded per client (.eq(cliente_id))
- trigger: manual:a single client exceeds ~1000 lifetime purchases

### L-006 — getClienteFicha per-client attendance window
- disease: read-amplification
- detector: D2
- location: src/lib/data/clientes.ts (getClienteFicha — asistencias leg)
- accepted: 2026-06-02
- rationale: per-client 30-day window
- trigger: manual:a single client exceeds ~1000 attendances in 30d

### L-007 — getResumenMes SUM(monto) over rows
- disease: read-amplification
- detector: D2
- location: src/lib/data/resumen.ts (getResumenMes — ventas leg)
- accepted: 2026-06-02
- rationale: 2-month window aggregated in JS; push-to-DB candidate (SUM in SQL)
- trigger: table:ventas op:> threshold:5000

### L-008 — getResumenMes attendance count over rows
- disease: read-amplification
- detector: D2
- location: src/lib/data/resumen.ts (getResumenMes — asistencias leg)
- accepted: 2026-06-02
- rationale: 2-month window counted in JS; push-to-DB candidate
- trigger: table:asistencias op:> threshold:20000
```

- [ ] **Step 3: Commit** (two repos):
```bash
git -C "C:/Users/Aaron/.claude/skills" add to-health/accepted-debt-schema.md && git -C "C:/Users/Aaron/.claude/skills" commit -m "feat(to-health): accepted-debt ledger schema"
git -C "C:/Users/Aaron/Documents/Repos/forge-1.0" add docs/health/accepted-debt.md && git -C "C:/Users/Aaron/Documents/Repos/forge-1.0" commit -m "docs(health): seed accepted-debt ledger from 2026-06-02 audit (8 items)"
```

---

### Task 2: The deterministic reconciliation core (`reconcile.mjs`) — TDD

**Files:**
- Create: `~/.claude/skills/to-health/tests/reconcile.test.mjs`
- Create: `~/.claude/skills/to-health/reconcile.mjs`

- [ ] **Step 1: Write the failing tests** `to-health/tests/reconcile.test.mjs`:
```js
import assert from 'node:assert/strict'
import { reconcile } from '../reconcile.mjs'

let n = 0, pass = 0
const t = (name, fn) => { n++; try { fn(); pass++; console.log(`ok  - ${name}`) } catch (e) { console.log(`NOT ok - ${name}\n   ${e.message}`) } }

// 1. Unmatched HARD-FAIL finding -> NEEDS-WORK, verdict RED
t('unmatched hard-fail -> NEEDS-WORK + RED', () => {
  const r = reconcile({ findings: [{ id: 'f1', detector: 'D4', tier: 'hard-fail', sector: 'cuenta', file: 'a.ts' }], ledger: [], counts: {} })
  assert.equal(r.sectors.cuenta, 'NEEDS-WORK')
  assert.equal(r.verdict, 'RED')
  assert.equal(r.needsWork.length, 1)
})

// 2. Matched finding, trigger NOT crossed -> ACCEPTED, verdict GREEN
t('matched + trigger ok -> ACCEPTED + GREEN', () => {
  const r = reconcile({
    findings: [{ id: 'f1', detector: 'D2', tier: 'watch', sector: 'inicio', file: 'src/lib/data/clientes.ts' }],
    ledger: [{ id: 'L-004', disease: 'read-amplification', detector: 'D2', file: 'src/lib/data/clientes.ts', trigger: { table: 'clientes', op: '>', threshold: 800 } }],
    counts: { clientes: 120 },
  })
  assert.equal(r.sectors.inicio, 'ACCEPTED')
  assert.equal(r.verdict, 'GREEN')
})

// 3. Matched finding, trigger CROSSED -> NEEDS-WORK, verdict RED
t('matched + trigger crossed -> NEEDS-WORK + RED', () => {
  const r = reconcile({
    findings: [{ id: 'f1', detector: 'D2', tier: 'watch', sector: 'inicio', file: 'src/lib/data/clientes.ts' }],
    ledger: [{ id: 'L-004', disease: 'read-amplification', detector: 'D2', file: 'src/lib/data/clientes.ts', trigger: { table: 'clientes', op: '>', threshold: 800 } }],
    counts: { clientes: 1500 },
  })
  assert.equal(r.sectors.inicio, 'NEEDS-WORK')
  assert.equal(r.verdict, 'RED')
})

// 4. Unmatched WATCH finding -> WATCH, but verdict still GREEN (watch never blocks)
t('unmatched watch -> WATCH + GREEN (no block)', () => {
  const r = reconcile({ findings: [{ id: 'f1', detector: 'D6', tier: 'watch', sector: 'vender', file: 'b.ts' }], ledger: [], counts: {} })
  assert.equal(r.sectors.vender, 'WATCH')
  assert.equal(r.verdict, 'GREEN')
  assert.equal(r.watch.length, 1)
})

// 5. No findings at all -> all CLEAN, GREEN
t('no findings -> GREEN', () => {
  const r = reconcile({ findings: [], ledger: [], counts: {} })
  assert.equal(r.verdict, 'GREEN')
  assert.deepEqual(r.needsWork, [])
})

// 6. Matched finding, manual trigger -> ACCEPTED + listed unverified, GREEN
t('matched + manual trigger -> ACCEPTED + unverified + GREEN', () => {
  const r = reconcile({
    findings: [{ id: 'f1', detector: 'D2', tier: 'watch', sector: 'clientes', file: 'src/lib/data/clientes.ts' }],
    ledger: [{ id: 'L-005', disease: 'read-amplification', detector: 'D2', file: 'src/lib/data/clientes.ts', trigger: { manual: 'a client exceeds 1000 purchases' } }],
    counts: {},
  })
  assert.equal(r.sectors.clientes, 'ACCEPTED')
  assert.equal(r.verdict, 'GREEN')
  assert.equal(r.unverifiedTriggers.length, 1)
})

// 7. Matched finding, count missing for a numeric trigger -> ACCEPTED but unverified, GREEN
t('matched + count missing -> ACCEPTED + unverified + GREEN', () => {
  const r = reconcile({
    findings: [{ id: 'f1', detector: 'D2', tier: 'watch', sector: 'inicio', file: 'src/lib/data/resumen.ts' }],
    ledger: [{ id: 'L-007', disease: 'read-amplification', detector: 'D2', file: 'src/lib/data/resumen.ts', trigger: { table: 'ventas', op: '>', threshold: 5000 } }],
    counts: {},
  })
  assert.equal(r.sectors.inicio, 'ACCEPTED')
  assert.equal(r.unverifiedTriggers.length, 1)
  assert.equal(r.verdict, 'GREEN')
})

// 8. Worst-state aggregation: a sector with one ACCEPTED + one unmatched hard-fail -> NEEDS-WORK
t('sector worst-state aggregation', () => {
  const r = reconcile({
    findings: [
      { id: 'f1', detector: 'D2', tier: 'watch', sector: 'clientes', file: 'src/lib/data/clientes.ts' },
      { id: 'f2', detector: 'D4', tier: 'hard-fail', sector: 'clientes', file: 'src/lib/data/other.ts' },
    ],
    ledger: [{ id: 'L-004', disease: 'read-amplification', detector: 'D2', file: 'src/lib/data/clientes.ts', trigger: { table: 'clientes', op: '>', threshold: 800 } }],
    counts: { clientes: 100 },
  })
  assert.equal(r.sectors.clientes, 'NEEDS-WORK')
  assert.equal(r.verdict, 'RED')
})

console.log(`\n${pass}/${n} passed`)
process.exit(pass === n ? 0 : 1)
```

- [ ] **Step 2: Run — verify it FAILS** (module missing):
Run: `node "C:/Users/Aaron/.claude/skills/to-health/tests/reconcile.test.mjs"`
Expected: error `Cannot find module '../reconcile.mjs'` (or all NOT ok), non-zero exit.

- [ ] **Step 3: Implement `to-health/reconcile.mjs`**:
```js
// Pure, deterministic health-gate reconciliation. No I/O. See health-handoff-schema.md.
// Input: { findings:[{id,detector,tier,sector,file,line?}], ledger:[{id,disease,detector,file,trigger}], counts:{table:int} }
// trigger: { table, op:'>'|'>='|'<>', threshold } | { manual:string }
// Output: { sectors:{[sector]:STATE}, verdict:'GREEN'|'RED', needsWork:[], watch:[], accepted:[], unverifiedTriggers:[] }
const RANK = { CLEAN: 0, ACCEPTED: 1, WATCH: 2, 'NEEDS-WORK': 3 }
const fileMatch = (a = '', b = '') => { const norm = (s) => s.replace(/\\/g, '/').toLowerCase(); a = norm(a); b = norm(b); return a === b || a.endsWith('/' + b) || b.endsWith('/' + a) || a.endsWith(b) || b.endsWith(a) }
const evalTrigger = (trig, counts) => {
  if (!trig || trig.manual) return 'unverified'
  const v = counts[trig.table]
  if (v == null) return 'unverified'
  if (trig.op === '>') return v > trig.threshold ? 'crossed' : 'ok'
  if (trig.op === '>=') return v >= trig.threshold ? 'crossed' : 'ok'
  if (trig.op === '<>' || trig.op === '!=') return v !== trig.threshold ? 'crossed' : 'ok'
  return 'unverified'
}
export function reconcile({ findings = [], ledger = [], counts = {} } = {}) {
  const sectors = {}, needsWork = [], watch = [], accepted = [], unverifiedTriggers = []
  const bump = (sector, state) => { if (!(sector in sectors) || RANK[state] > RANK[sectors[sector]]) sectors[sector] = state }
  for (const f of findings) {
    const entry = ledger.find((l) => fileMatch(l.file, f.file) && (l.detector === f.detector || l.disease === f.disease))
    let state
    if (entry) {
      const tr = evalTrigger(entry.trigger, counts)
      if (tr === 'crossed') { state = 'NEEDS-WORK'; needsWork.push({ ...f, ledger: entry.id, reason: 'accepted-debt trigger crossed' }) }
      else { state = 'ACCEPTED'; accepted.push({ ...f, ledger: entry.id }); if (tr === 'unverified') unverifiedTriggers.push({ ...f, ledger: entry.id, trigger: entry.trigger }) }
    } else if (f.tier === 'hard-fail') { state = 'NEEDS-WORK'; needsWork.push({ ...f, reason: 'un-ledgered hard-fail finding' }) }
    else { state = 'WATCH'; watch.push({ ...f, reason: 'new watch finding — triage into ledger or fix' }) }
    bump(f.sector || '(unknown)', state)
  }
  const verdict = needsWork.length > 0 ? 'RED' : 'GREEN'
  return { sectors, verdict, needsWork, watch, accepted, unverifiedTriggers }
}
```

- [ ] **Step 4: Run — verify it PASSES**:
Run: `node "C:/Users/Aaron/.claude/skills/to-health/tests/reconcile.test.mjs"`
Expected: `8/8 passed`, exit 0.

- [ ] **Step 5: Commit**:
```bash
git -C "C:/Users/Aaron/.claude/skills" add to-health/reconcile.mjs to-health/tests/reconcile.test.mjs
git -C "C:/Users/Aaron/.claude/skills" commit -m "feat(to-health): deterministic reconcile core (findings x ledger x counts -> verdict)"
```

---

### Task 3: The health-handoff schema + the `/to-health` SKILL

**Files:**
- Create: `~/.claude/skills/to-health/health-handoff-schema.md`
- Create: `~/.claude/skills/to-health/SKILL.md`

- [ ] **Step 1: Write `health-handoff-schema.md`** — documents (a) the structured input the agent must assemble for `reconcile.mjs`, and (b) the `health-<project>-<ISO-date>.md` report:
```markdown
# Health handoff schema

## Structured input to reconcile.mjs (the agent assembles this)
- `findings`: from the to-findings doc — `[{ id, detector, tier, sector, file, line }]`. `sector` = the map AREA the finding's file belongs to. `tier` carried from the finding's `tier:` field.
- `ledger`: parsed from `docs/health/accepted-debt.md` per accepted-debt-schema — `[{ id, disease, detector, file, trigger }]` where `trigger` is `{table,op,threshold}` or `{manual}`.
- `counts`: `{ <table>: <int> }` for every numeric-trigger table — from a live `select count(*)` (Supabase MCP execute_sql) when available, else omit (→ unverified).

## Report: `health-<project-slug>-<ISO-date>.md`
- Header: project, date, source findings/map paths, ledger path.
- **Verdict line** (verbatim from reconcile): `🟢 FREE TO CONTINUE` or `🔴 NOT YET — blocked by: <sectors>`.
- Per-sector table: sector | state (CLEAN/ACCEPTED/WATCH/NEEDS-WORK) | finding ids.
- NEEDS-WORK section: each blocker, why (un-ledgered hard-fail OR crossed trigger + the count), the fix-shape from to-findings.
- WATCH section: advisory items — "triage into ledger (accept) or fix"; never blocks.
- Unverified triggers: ledger items whose trigger is manual/uncounted — operator should confirm.
- Accepted section: ledger items matched + within trigger (the institutional memory, shown not hidden).
```

- [ ] **Step 2: Write `to-health/SKILL.md`**:
```markdown
---
name: to-health
description: Re-runnable data-fetch health gate. Runs to-map -> to-findings (v2), reconciles findings against the project's accepted-debt ledger, and emits a deterministic per-sector "free to continue?" verdict. Use to check if a Next.js+Supabase project is in a clean/healthy data-fetching state, before shipping, or to re-check after fixes. Detection + verdict only — never edits code.
---

# To Health

A gate, not an auditor: it composes the existing detectors and decides 🟢/🔴.

## Process

### 1. Get findings
If handed a `findings-*.md` path, use it. Otherwise run `/to-map` then `/to-findings` on the project (see those skills) and use the resulting findings doc. The findings carry `tier:` (hard-fail|watch) per detector.

### 2. Load the ledger
Read `docs/health/accepted-debt.md` in the target project (schema: `accepted-debt-schema.md`). If absent, treat the ledger as empty and note it (every accepted item will then surface as WATCH/NEEDS-WORK — tell the user to seed a ledger).

### 3. Assemble the structured input (per `health-handoff-schema.md`)
- `findings[]`: for each finding, read its `detector`, `tier`, `file`, `line`, and the map AREA/sector its file belongs to.
- `ledger[]`: parse each `### L-NNN` entry to `{id, disease, detector, file, trigger}`.
- `counts{}`: for every numeric `trigger: table:<t> ...`, get `select count(*) from <t>` via the project's DB (Supabase MCP `execute_sql`) if available; otherwise omit that table (it becomes an unverified trigger).

### 4. Run the deterministic verdict
Run `node <skill-dir>/reconcile.mjs` is NOT how it's invoked — instead import/evaluate it: the agent MUST compute the verdict via `reconcile.mjs` (the pure function), NOT by its own judgment. Practically: write the assembled input to a temp `.json`, run a one-line node command that imports `reconcile`, passes the input, and prints the result JSON; use that output verbatim. (Determinism is the whole point — do not hand-judge green/red.)

### 5. Emit the report
Write `health-<project>-<ISO-date>.md` per the schema and print the verdict line + per-sector table to the user. If 🔴, name the blocking sectors + diseases and the fix-shapes. If 🟢, list the ACCEPTED items (institutional memory) and any WATCH/unverified items as nudges.

## Constraints
- Verdict is computed by `reconcile.mjs`, never by LLM judgment.
- Detection + verdict only. NO code edits.
- WATCH never blocks 🟢. Green = no NEEDS-WORK.
- A re-run after fixes (or after a trigger is crossed) must reflect the new state — the gate is stateless except for the ledger.

## See also
- `reconcile.mjs` — the deterministic core. `tests/reconcile.test.mjs` — its unit tests.
- `accepted-debt-schema.md` — ledger contract. `health-handoff-schema.md` — input + report contract.
- `../to-findings/SKILL.md` — produces the findings (with `tier`). `../to-map/SKILL.md` — produces the map (sectors/areas).
```

- [ ] **Step 3: Commit**:
```bash
git -C "C:/Users/Aaron/.claude/skills" add to-health/health-handoff-schema.md to-health/SKILL.md
git -C "C:/Users/Aaron/.claude/skills" commit -m "feat(to-health): gate skill + health-handoff schema"
```

---

### Task 4: Scenario test — the gate produces the right verdict end of pipeline

**Files:**
- Create: `~/.claude/skills/to-health/tests/SCENARIOS.md`
- Modify: `~/.claude/skills/to-health/tests/reconcile.test.mjs` (add a "Forge-shaped" integration case)

- [ ] **Step 1: Add a Forge-shaped case to `reconcile.test.mjs`** — the 8 ledger items + a clean roster count → all ACCEPTED, 🟢; then bump `clientes` past L-004's 800 → that sector NEEDS-WORK, 🔴. Append before the final `console.log`:
```js
const forgeLedger = [
  { id: 'L-004', disease: 'read-amplification', detector: 'D2', file: 'src/lib/data/clientes.ts', trigger: { table: 'clientes', op: '>', threshold: 800 } },
  { id: 'L-007', disease: 'read-amplification', detector: 'D2', file: 'src/lib/data/resumen.ts', trigger: { table: 'ventas', op: '>', threshold: 5000 } },
]
const forgeFindings = [
  { id: 'f1', detector: 'D2', tier: 'watch', sector: 'inicio', file: 'src/lib/data/clientes.ts' },
  { id: 'f2', detector: 'D2', tier: 'watch', sector: 'inicio', file: 'src/lib/data/resumen.ts' },
]
t('forge-shaped: within triggers -> all ACCEPTED + GREEN', () => {
  const r = reconcile({ findings: forgeFindings, ledger: forgeLedger, counts: { clientes: 120, ventas: 300 } })
  assert.equal(r.verdict, 'GREEN'); assert.equal(r.accepted.length, 2); assert.equal(r.needsWork.length, 0)
})
t('forge-shaped: roster grows past L-004 -> NEEDS-WORK + RED', () => {
  const r = reconcile({ findings: forgeFindings, ledger: forgeLedger, counts: { clientes: 900, ventas: 300 } })
  assert.equal(r.verdict, 'RED'); assert.equal(r.needsWork[0].ledger, 'L-004')
})
```

- [ ] **Step 2: Run — verify 10/10**:
Run: `node "C:/Users/Aaron/.claude/skills/to-health/tests/reconcile.test.mjs"`
Expected: `10/10 passed`, exit 0.

- [ ] **Step 3: Write `tests/SCENARIOS.md`** — catalogue the 10 reconcile cases + "run with `node to-health/tests/reconcile.test.mjs`" + note that the gate's verdict is deterministic (unit-tested), while the upstream detection is covered by `../to-map/tests/shakeout.workflow.js`.

- [ ] **Step 4: Commit**:
```bash
git -C "C:/Users/Aaron/.claude/skills" add to-health/tests/reconcile.test.mjs to-health/tests/SCENARIOS.md
git -C "C:/Users/Aaron/.claude/skills" commit -m "test(to-health): forge-shaped reconcile cases + scenario catalogue (10/10)"
```

---

### Task 5: Forge integration run (the validate-before-codify moment)

This is the real end-to-end: run the actual pipeline on Forge and confirm the gate prints 🟢 with the 8 items ACCEPTED. It ALSO validates Part A's v2 detectors fire correctly on real code (closing the isolation-test gap).

**Files:** none (produces a `health-forge-1.0-2026-06-05.md` artifact; do NOT commit the artifact unless useful)

- [ ] **Step 1: Run the gate on Forge.** From the Forge repo, execute the `/to-health` process (Task 3): run `/to-map` → `/to-findings` over `src/lib/data` + `src/app/(app)` (the 6 sectors), parse the ledger, get counts via Supabase MCP `execute_sql` (`select count(*) from clientes`, `ventas`, `asistencias`), run `reconcile.mjs`.
- [ ] **Step 2: Assert the verdict.** Expected: 🟢 FREE TO CONTINUE; the 8 ledger items matched + ACCEPTED (counts well under thresholds for a young gym); ZERO un-ledgered hard-fail findings (no real D4/D5/N+1/fan-out — Forge is cache()+Promise.all clean). If a NEW hard-fail surfaces, that is a real finding — STOP and report it (the gate is doing its job), don't force green.
- [ ] **Step 3: Eyeball the report** — does the 🟢 line, the per-sector table, and the ACCEPTED list (institutional memory) read correctly and usefully? This is the validate-the-OUTPUT-before-codifying check. If the output is confusing, fix the SKILL/schema presentation, not the verdict logic.
- [ ] **Step 4: Record the outcome** — note the verdict + counts in the run report; if useful, commit the `health-*.md` under `docs/health/` in Forge.

---

### Task 6: The two end-gates (Elegance + Senior-Dev) — spec §9

**Files:** none

- [ ] **Step 1: Elegance Check.** Is every Part-B change the most elegant approach? (Deterministic verdict in a tiny pure module; ledger is plain markdown the operator can read/edit; the skill only orchestrates; no foreign machinery; WATCH-doesn't-block keeps the gate usable.) If anything fails, restructure and re-ask until 100% yes.
- [ ] **Step 2: Senior Dev Approval.** Would a senior dev approve? (Green/red is deterministic + unit-tested, not LLM judgment; the gate re-checks triggers each run so accepted-debt can't silently rot; the integration run proved the real pipeline; honest unverified-trigger reporting; clean commits.) If not, restructure and re-ask until 100% yes.
- [ ] **Step 3: Report Part B complete** with the verdict from the Forge run and both gate results.

---

## Self-Review

**1. Spec coverage** (against `2026-06-05-datafetch-health-gate-design.md` §4):
- Run to-map→to-findings or consume findings → Task 3 Step 1 ✓
- Load accepted-debt ledger → Task 1 (seed) + Task 3 Step 2 ✓
- Reconcile → 4 states (CLEAN/ACCEPTED/WATCH/NEEDS-WORK) → Task 2 `reconcile.mjs` ✓
- Per-sector verdict + 🟢/🔴 headline → Task 2 (verdict) + Task 3 Step 5 (report) ✓
- Trigger re-check every run → Task 2 `evalTrigger` + Task 3 Step 3 (counts) ✓
- Seeded from 2026-06-02's 8 items → Task 1 Step 2 ✓
- Forge integration → 🟢 with 8 ACCEPTED → Task 5 ✓
- Two end-gates → Task 6 ✓
- Design decisions (deterministic verdict; watch-doesn't-block) → header + resolved in `reconcile.mjs` ✓

**2. Placeholder scan:** `reconcile.mjs`, its tests, the ledger entries, and both schemas are given in full. The SKILL.md is complete prose. Task 5 (integration) is inherently a "run it and observe" task — its assertions (🟢, 8 ACCEPTED, zero new hard-fail) are concrete pass conditions, not placeholders.

**3. Type/name consistency:** `reconcile({findings, ledger, counts})` and its output keys (`sectors`, `verdict`, `needsWork`, `watch`, `accepted`, `unverifiedTriggers`) are identical across `reconcile.mjs`, the tests, the SKILL, and `health-handoff-schema.md`. Trigger shape `{table,op,threshold}|{manual}` is consistent across the ledger schema, the seeded ledger, `evalTrigger`, and the tests. `tier` values (`hard-fail|watch`) match Part A's handoff schema.

**Open design decisions for the user (Task 0 of review):**
- (a) Deterministic `reconcile.mjs` verdict vs LLM-judged verdict — plan chose deterministic.
- (b) WATCH does not block 🟢 — plan chose advisory.
- (c) Numeric triggers use live `count(*)` via Supabase MCP; manual/latency triggers are reported unverified (no false precision) — confirm this is the right pragmatic line for a single-gym gate.
