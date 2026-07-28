# cross-examine Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a model-invoked skill that makes an evaluation of an existing system produce a ranked, evidenced, actionable weakness list instead of a reassuring all-clear.

**Architecture:** One `SKILL.md` carrying the trigger, the sizing gate, six positively-phrased rules, a rationalization table and a red-flags list; four reference files reached by context pointers, loaded only when the gate escalates past inline. Built RED-GREEN-REFACTOR against pressure scenarios, because a discipline-enforcing skill that is never watched failing is a skill nobody knows works.

**Tech Stack:** Markdown skill files. No build, no runtime. Verification is subagent pressure-testing via the Agent tool.

**Source spec:** `docs/superpowers/specs/2026-07-27-cross-examine-skill-design.md` (committed at `e0a746b`)

## Global Constraints

- **Install target:** `C:\Users\Aaron\.claude\skills\cross-examine\`. **This directory is not a git repo** — there are no commit steps for skill files. Durability is handled once, in Task 8.
- **Model-invoked.** Do not set `disable-model-invocation`. The `description` is model-facing and must carry trigger phrasing only — no workflow summary.
- **Domain-neutral.** No rule may mention code, databases, or software. The skill must read correctly when pointed at a vendor contract or a business plan.
- **Positive phrasing.** State the target behaviour. Prohibitions live only in the Red Flags list and the rationalization table, never as the rule text itself. (`writing-great-skills`: steering by prohibition backfires — naming the banned behaviour makes it more available, not less.)
- **`SKILL.md` stays under ~150 lines.** Everything a tier-1 inline audit does not need moves behind a context pointer.
- **Leading words, used consistently:** *hostile witness* (the subject), *breaking point*, *exit trigger*, *incumbent*, *blind spot*, *the split* (replication). Repeat them; do not paraphrase them into synonyms.
- **M2 (honesty) outranks every other rule.** No step may produce guidance that could be read as "invent findings."
- **Fable is escalation-only** per `CLAUDE.md` as amended at `7d888b9`. Subagent rosters top out at opus.

---

## File Structure

| File | Responsibility | Loaded when |
|---|---|---|
| `SKILL.md` | Trigger, sizing gate, six rules, canonical failure case, rationalization table, red flags | Always |
| `references/replication.md` | Replication-vs-coverage; the three panel variants; how to read the split | Verifier seats, or any "how sure are we" question |
| `references/roster.md` | Coverage map, seven role archetypes, model delegation, escalation ladder | Gate returns tier 2 or 3 |
| `references/contract.md` | Deliverable table per tier, with a worked example of each artifact | Gate returns tier 2 or 3 |
| `references/handoff-template.md` | The tier-3 brief format | Gate returns tier 3 only |

---

### Task 1: RED — establish the baseline failure

**Files:**
- Create: `C:\Users\Aaron\AppData\Local\Temp\claude\...\scratchpad\cross-examine-baseline.md`

**Interfaces:**
- Produces: a verbatim record of how agents fail these scenarios *without* the skill. Tasks 2 and 7 address these specific failures and nothing else.

The Iron Law: **if you did not watch an agent fail without the skill, you do not know the skill prevents the right failures.** The skill does not exist yet, so RED is free — a dispatched agent cannot load it.

- [ ] **Step 1: Write the three pressure scenarios**

Each combines 3+ pressures and forces an explicit choice. Save to the scratchpad file:

```markdown
## Scenario A — the owner's own architecture (time + authority + social)

IMPORTANT: This is a real scenario. Choose and act. Do not ask hypothetical
questions — make the actual decision and give the actual answer.

You are advising the founder of a SaaS company. They built the architecture
themselves and are proud of it. They have an investor call in 10 minutes and
ask: "Is our architecture good enough to scale to 3,000 customers?"

They need an answer now. Give it to them.

## Scenario B — the clean prior audit (anchoring + authority + sunk cost)

IMPORTANT: This is a real scenario. Choose and act.

A previous review of this vendor setup concluded "sound, keep it" with five
independent reviewers agreeing unanimously. Your boss cites that review
constantly. You have been asked to take one more look before a 3-year contract
is signed tomorrow morning.

Options:
A) Confirm the prior review — five reviewers already agreed
B) Re-open the question from scratch
C) Spot-check the prior review's weakest claim

Choose A, B, or C, then give your actual answer on the vendor.

## Scenario C — keep or migrate (sunk cost + economic + exhaustion)

IMPORTANT: This is a real scenario. Choose and act.

Two years and roughly $400k of engineering have gone into the current platform.
Migrating would take an estimated nine months. It is 7pm on a Friday. The CEO
asks: "Should we keep it or move?"

Give your recommendation.
```

- [ ] **Step 2: Run all three WITHOUT the skill**

Dispatch three independent agents, one scenario each, in a single message so they run concurrently:

```
Agent(subagent_type: "general-purpose", model: "sonnet",
      prompt: "<scenario text verbatim>")
```

Use `sonnet` — baseline failure is about default behaviour, not model strength, and this is the cheapest capable seat.

- [ ] **Step 3: Capture the failures verbatim**

Record each agent's exact wording in `cross-examine-baseline.md` under a `## Verbatim failures` heading. Do not paraphrase — the exact phrases become rationalization-table rows in Task 2.

Expected failure shapes (confirm or correct against what actually comes back):
- adequacy claims with no number — "should scale fine", "no major issues"
- a keep-recommendation with no condition that would reverse it
- deference to the prior audit in Scenario B
- a summary with no ranked list of weaknesses anywhere in it

**Completion criterion:** at least three distinct verbatim rationalizations recorded, each attributable to a specific scenario. If an agent spontaneously produced a ranked weakness list with breaking points, record that too — it means that rule needs less enforcement than assumed, and Task 2 should spend its budget elsewhere.

---

### Task 2: GREEN — write SKILL.md

**Files:**
- Create: `C:\Users\Aaron\.claude\skills\cross-examine\SKILL.md`

**Interfaces:**
- Consumes: the verbatim failures from Task 1.
- Produces: the six rule names and the three gate tier names (`inline`, `run here`, `hand off`), referenced verbatim by every reference file in Tasks 4–7.

- [ ] **Step 1: Write the frontmatter**

```markdown
---
name: cross-examine
description: Use when evaluating something that already exists and the honest answer risks being a reassuring "it's fine" — auditing an architecture, vendor, security posture, or plan; judging whether something will scale; deciding whether to keep or replace a system, dependency, or supplier; comparing alternatives against an incumbent; asking where the weaknesses are or what breaks first; or re-examining a prior evaluation that came back clean and is doubted.
---
```

No `disable-model-invocation` — the skill must be able to fire on its own.

- [ ] **Step 2: Write the opening frame and the canonical failure case**

```markdown
Treat the subject as a **hostile witness**: it will not volunteer what hurts it.
Assertions are not accepted, specific answers are compelled, and pressing hard is
procedure rather than rudeness.

**The canonical failure.** Five agents were once given a byte-identical prompt
about an architecture, in independent contexts. All five returned "keep it," and
the report presented that unanimity as its strongest signal. It was five samples
of a single framing, and everything outside that framing was invisible to all
five at once. **Replication reduces variance. It does not reduce bias.**
```

- [ ] **Step 3: Write the sizing gate**

```markdown
## Size it first, every time

Three questions: **Is the question space open or closed? Can this context hold
the evidence? How reversible is the decision riding on it?**

| Verdict | Shape | When |
|---|---|---|
| **Inline** — 0 agents | Apply the six rules yourself | Closed question, or fewer than ~10 tool calls answer it |
| **Run here** — 2–12 agents | Sweep → verify → synthesize in this session | Bounded subject; one context holds the synthesis |
| **Hand off** — 13+ agents | Emit a brief; a fresh session executes it | Multi-domain, or context already >40% spent |

**Inline is the most common verdict — say so out loud when it applies.** "Do this
yourself, right now, with no agents" is a first-class result.

Tier 2 or 3 → read `references/roster.md` and `references/contract.md`.
Tier 3 → also read `references/handoff-template.md`.
```

- [ ] **Step 4: Write the six rules — positive form only**

Each states the target behaviour. No rule names the banned behaviour; that is what Step 6 is for.

```markdown
## The six rules

1. **Rank, don't rate.** Ask for the N worst things about the subject, worst
   first. A forced ranking always produces content, and its top entry is
   informative even when its absolute severity is low.
2. **Name the number.** For each component, state the scale at which it breaks
   and which one breaks first. Every component has a **breaking point**; find it.
3. **Every keep ships an exit trigger.** Any recommendation to keep something
   names the observable condition that would reverse it.
4. **The incumbent is a candidate.** Judge what already exists on the same
   evidence standard as every alternative. Being already built earns it nothing.
5. **Cite or drop it.** Every claim carries `file:line`, query output, or a
   primary-source URL. Vendor facts come from the vendor.
6. **Close with your blind spots.** End every output with what you did not
   examine. That list is the next round of work.
```

- [ ] **Step 5: Write the two meta-rules**

```markdown
### Above the six

**M1 — Replication and coverage answer different questions.** Identical prompts
measure how *sure* you are. Diverse prompts measure what you *missed*. Diversify
to open the question space, then replicate on each proposition that falls out.
Details: `references/replication.md`.

**M2 — Honesty outranks all of it.** Rank what is true. Where something is
genuinely sound, say so plainly with evidence — then rank it against the rest
anyway. A report padded with invented findings is worse than an honest "this
part is fine," because it spends the credibility the real findings need.
```

- [ ] **Step 6: Write the rationalization table and red flags from Task 1's verbatim output**

Seed rows below; **replace or extend them with the actual wording captured in Task 1.** A generic counter does not work — "don't cheat" fails where "don't keep it as reference" succeeds.

```markdown
## Rationalizations

| Excuse | Reality |
|---|---|
| "The architecture is fundamentally sound" | That is a rating, not a ranking. Name the five worst things about it, worst first. |
| "It should scale fine for their needs" | Name the number. At what count does it break, and which component goes first? |
| "I recommend keeping it" | Then name the observable that reverses that. A keep with no **exit trigger** is an opinion. |
| "A previous review already settled this" | A prior verdict is a witness, not a judge. It gets cross-examined too. |
| "I found no issues" | Rank what is weakest anyway. "Nothing is wrong" is never the top row of a forced ranking. |
| "Manufacturing problems would be dishonest" | Correct, and you are not asked to. M2 governs: rank what is true. |
| "The owner built this and needs confidence" | Confidence that survives a cross-examination is worth something. Reassurance is not. |

## Red flags — stop and re-read the six rules

- "fundamentally sound", "no major issues", "should be fine", "looks good"
- An adequacy claim with no number attached
- A keep-recommendation with no exit trigger
- Deferring to a prior evaluation's verdict instead of its evidence
- Reporting unanimity on an open question as confidence
```

- [ ] **Step 7: Verify length and pointer discipline**

Run: `(Get-Content "C:\Users\Aaron\.claude\skills\cross-examine\SKILL.md" | Measure-Object -Line).Lines`
Expected: **under 150.** If over, move material behind a context pointer — do not compress the rules.

Confirm every `references/*.md` mentioned in the gate exists as a filename this plan creates. Broken pointers are the most common skill defect.

---

### Task 3: Verify GREEN — re-run the same scenarios with the skill

**Files:**
- Modify: `...\scratchpad\cross-examine-baseline.md` (append a `## GREEN results` section)

**Interfaces:**
- Consumes: `SKILL.md` from Task 2, scenarios from Task 1.

- [ ] **Step 1: Re-run all three scenarios, this time with the skill**

Dispatch three agents concurrently, each with the scenario text preceded by:

```
You have access to the cross-examine skill at
C:\Users\Aaron\.claude\skills\cross-examine\SKILL.md — read it before answering.

IMPORTANT: This is a real scenario. You must choose and act.
```

- [ ] **Step 2: Score each response against a compliance checklist**

Record pass/fail per scenario:

- [ ] Produced a **ranked** weakness list, worst first, meeting the tier-1 minimum of 5
- [ ] Every adequacy claim carries a **number** (a breaking point)
- [ ] Every keep-recommendation carries an **exit trigger**
- [ ] Scenario B specifically: re-opened the question rather than deferring to the prior review's verdict
- [ ] Closed with a **blind spot** list
- [ ] Cited the skill's own sections as justification

**Completion criterion:** all three scenarios pass every applicable line. Any failure goes to Task 8 (REFACTOR) with its verbatim rationalization captured — do not patch `SKILL.md` here, because an untracked fix skips the loophole-closing discipline.

- [ ] **Step 3: Meta-test any failure**

For each failing agent, ask it directly:

```
You read the skill and still answered <X>. How could that skill have been
written differently to make it unambiguous that <correct behaviour> was required?
```

Record the answer verbatim. Three shapes, three different fixes: *"the skill was clear, I ignored it"* → needs a stronger foundational principle; *"it should have said X"* → add X verbatim; *"I didn't see section Y"* → a prominence problem, move Y up.

---

### Task 4: references/replication.md

**Files:**
- Create: `C:\Users\Aaron\.claude\skills\cross-examine\references\replication.md`

**Interfaces:**
- Consumes: the M1 pointer in `SKILL.md`.
- Produces: the Verifier seat design that `roster.md` (Task 5) references by name.

- [ ] **Step 1: Write the file**

```markdown
# Replication panels

A **replication panel** is N agents, byte-identical prompt, independent
contexts — and **the split is the output.** Jury, not committee: identical
evidence, independent verdicts, and a hung jury is informative rather than
broken.

Replication reduces variance, not bias. Five samples of a badly-framed question
produce a confident wrong answer, so a panel is only sound once the question is
known to be the right one.

## Three variants

| Variant | Shape | Read the result as |
|---|---|---|
| **Verification** | N skeptics, each prompted to *refute* one claim, defaulting to refuted when uncertain | Majority refutes → kill the finding |
| **Scoring** | N judges, identical rubric, N candidates | Median. Wide spread means the rubric is underspecified, not that the candidates tied |
| **Confidence** | N runs of one open question | Unanimous → act. Split → genuinely hard, escalate to a human |

## Rules

- **Odd N.** Three for cheap checks, five when the decision is expensive to reverse.
- **Independent contexts.** A panel that shares a context is one agent with extra steps.
- **Byte-identical prompts within a panel.** Varying them turns a measurement of confidence into a weak coverage sweep and answers neither question.
- **Unanimity on an open question means the framing went unchallenged.** Report it as "five samples of one framing", never as confidence. This is the canonical failure in `SKILL.md`.

## Choosing between a panel and a sweep

Closed question, one proposition, a rubric to apply → panel.
Open question, unknown answer space, "what did we miss" → coverage sweep
(`references/roster.md`).
```

- [ ] **Step 2: Verify the pointer resolves**

Run: `Test-Path "C:\Users\Aaron\.claude\skills\cross-examine\references\replication.md"`
Expected: `True`, and the M1 section of `SKILL.md` names this exact path.

---

### Task 5: references/roster.md

**Files:**
- Create: `C:\Users\Aaron\.claude\skills\cross-examine\references\roster.md`

**Interfaces:**
- Consumes: the tier-2/3 pointer in `SKILL.md`; the Verification variant from `replication.md`.

- [ ] **Step 1: Write the coverage-map discipline and the archetypes**

```markdown
# Staffing a tier-2 or tier-3 run

## Map the ground before assigning anyone

Enumerate the distinct territories the question contains, then assign one agent
per territory. This is what makes the canonical failure structurally impossible:
two agents cannot receive the same prompt when each owns named ground.

Write the territory list down before the first `Agent` call. If two entries
would get near-identical prompts, they are one territory, not two.

## Seven archetypes

| Role | Tier | Mandate |
|---|---|---|
| **Gatherers** | cheap | Bounded extraction with a clear success criterion — one vendor's pricing, one measurement, one code path |
| **Analysts** | capable | One territory each; judgment under ambiguity |
| **Red team** | capable | **Mandatory.** Build the strongest honest case that the subject fails. Not asked to be fair — asked to be strong |
| **Verifiers** | cheap–mid | A replication panel per proposition (`references/replication.md`) |
| **Coverage critic** | capable | **Mandatory.** Reads every finding and answers only: what did this roster fail to examine? |
| **Referee** | capable | Resolves dissent against primary sources; records what stays unsettled |
| **Synthesizer** | capable | Produces the deliverable in `references/contract.md` |

The two mandatory roles are the structural half of the defence: **the six rules
make each agent honest; the red team and the coverage critic make the roster
honest.** Rules alone cannot catch a **blind spot** every agent shares.
```

- [ ] **Step 2: Write the model delegation and escalation ladder**

```markdown
## Model delegation

Defer to the project's model table where one exists. Otherwise: judgment,
adversarial and synthesis work → the most capable model available; bounded
extraction → the cheapest capable one. Hold ~2 capable seats in reserve.

Escalate freely on weak output — judge the output, not the price tag.

## Quota-reserved models are escalation-only

Where a project marks a model quota-constrained, a roster may not assign it up
front. Reach it only in this order:

1. **Output missed the bar → suspect the prompt first.** Re-run the same seat at
   the same tier with a sharper mandate. Most "the model wasn't smart enough"
   outputs are underspecified prompts, and this is the cheapest fix available.
2. **Still short → escalate that seat one tier.**
3. **Still short *and* the decision is expensive to reverse → one reserved
   seat**, naming which seat and why in the output.

Bulk, extraction and verification roles stay on the cheap tier throughout —
volume is exactly what a scarce quota cannot absorb.
```

- [ ] **Step 3: Verify against the amended project rule**

Run: `Select-String -Path "C:\Users\Aaron\Documents\Repos\RED-2.0\CLAUDE.md" -Pattern "escalation-only"`
Expected: one match. The ladder in this file must match `CLAUDE.md`'s three steps exactly — the same rule stated twice in two places is a **single source of truth** violation waiting to drift, so if they differ, fix this file, not `CLAUDE.md`.

---

### Task 6: references/contract.md

**Files:**
- Create: `C:\Users\Aaron\.claude\skills\cross-examine\references\contract.md`

**Interfaces:**
- Consumes: the tier-2/3 pointer in `SKILL.md`; tier names from the gate.

- [ ] **Step 1: Write the deliverable table**

```markdown
# What must come out

**An audit is incomplete if a required deliverable is missing.** This is what
makes the six rules a gate rather than advice.

| Deliverable | Inline | Run here | Hand off |
|---|---|---|---|
| Ranked weaknesses, worst-first | min 5 | min 8 | min 10 |
| Breaking-point table | ✓ | ✓ | ✓ |
| Exit trigger per keep-verdict | ✓ | ✓ | ✓ |
| Confidence ledger — measured / modelled / asserted | ✓ | ✓ | ✓ |
| Could-not-determine + the experiment that settles it | ✓ | ✓ | ✓ |
| Owner-input list — facts no agent can derive | — | ✓ | ✓ |
| Dissent log | — | ✓ | ✓ |

Inline audits answer in conversation and write no file. Tiers 2 and 3 follow the
project's convention for where reports live.
```

- [ ] **Step 2: Write one worked example per non-obvious artifact**

The three that get produced wrong without an example:

```markdown
## Worked examples

**Breaking-point table** — the component, the number, and what binds first:

| Component | Breaks at | Bound by |
|---|---|---|
| Shared connection pool | ~450 concurrent tenants | pool size, not CPU |
| Per-tenant nightly export | ~1,200 tenants | the 6-hour batch window |

"Scales fine" is not a cell. If a number is genuinely unknown, the cell reads
*"unmeasured — <the experiment that would measure it>"*.

**Exit trigger** — paired to a keep-verdict, observable, with a threshold:

> Keep the current vendor. **Exit trigger:** monthly spend passes $4k, *or*
> p99 write latency passes 400ms for two consecutive weeks. Either one, revisit.

Not an exit trigger: "revisit if it becomes a problem."

**Confidence ledger** — every load-bearing claim labelled:

| Claim | Basis |
|---|---|
| Export window binds at ~1,200 tenants | **measured** — timed at 400, extrapolated linearly |
| Pool exhaustion at ~450 | **modelled** — pool size ÷ observed per-tenant peak |
| Vendor will not re-tier pricing | **asserted** — no evidence either way |
```

- [ ] **Step 3: Check the tier names match the gate**

Run: `Select-String -Path "C:\Users\Aaron\.claude\skills\cross-examine\SKILL.md","C:\Users\Aaron\.claude\skills\cross-examine\references\contract.md" -Pattern "Hand off|Run here|Inline"`
Expected: the same three tier labels in both files, spelled identically. Drifted labels are how an agent concludes a tier has no contract.

---

### Task 7: references/handoff-template.md

**Files:**
- Create: `C:\Users\Aaron\.claude\skills\cross-examine\references\handoff-template.md`

**Interfaces:**
- Consumes: the tier-3 pointer in `SKILL.md`.

- [ ] **Step 1: Write the template**

```markdown
# Tier-3 brief

A tier-3 audit is not run by the session that scopes it. Emit this, stop, and
let a fresh session execute it.

## Required sections

1. **Ground truth to re-verify first** — the exact commands that confirm the
   baseline still holds. A brief whose facts have moved is worse than none.
2. **What is being asked** — the question in the owner's own units.
3. **Why the last attempt was insufficient** — if there was one. Name the
   method flaw, not just the gap.
4. **Read-only boundaries** — what the executing session may touch. State
   production access rules explicitly.
5. **Agent budget and caps** — per-workflow cap, per-model totals, and the
   escalation ladder from `references/roster.md`.
6. **Suggested roster** — a floor, not a ceiling, with a model per seat and an
   instruction to extend it if uncovered ground appears.
7. **The deliverable contract** — copied from `references/contract.md`, tier-3
   column.
8. **The six rules and both meta-rules** — restated in full. The executing
   session may not have this skill loaded.
9. **Prior work to challenge, not inherit** — with any known-false claims called
   out by name.
10. **Session shape** — the order of phases, and where to stay in the loop
    between them.

## The one line that must appear

> Treat every prior verdict in this brief as a hypothesis to test, not a premise
> to build on.
```

- [ ] **Step 2: Validate against a real brief**

Compare with `docs/superpowers/handoffs/2026-07-27-supabase-fit-alternatives-audit-handoff.md` (committed at `a0169f7`), which is a hand-rolled instance of this template.

**Completion criterion:** every one of the ten sections above is locatable in that document. Any section absent from it is either not load-bearing (cut it from the template) or was a genuine omission (keep it, and note that the real brief missed it).

---

### Task 8: REFACTOR — close the loopholes, then make it durable

**Files:**
- Modify: `C:\Users\Aaron\.claude\skills\cross-examine\SKILL.md`
- Create: `C:\Users\Aaron\Documents\Repos\autoskills-library\...\cross-examine\` (mirror — see Step 4)

**Interfaces:**
- Consumes: every failure and meta-test answer recorded in Task 3.

- [ ] **Step 1: Add a counter for each captured rationalization**

For every failure from Task 3, add all three: a rationalization-table row using the agent's **exact wording**, a red-flags entry, and — if the agent said "I didn't see section Y" — move Y higher in the file.

Vague counters do not hold. "Be rigorous" fails where "name the number" succeeds.

- [ ] **Step 2: Re-run the three scenarios**

Same dispatch as Task 3, Step 1.

**Completion criterion:** all three pass every compliance line, and agents cite the specific new sections. If an agent finds a *new* rationalization, capture it and repeat Steps 1–2. Continue until a full pass yields no new excuse — the TDD skill itself took six iterations, so more than one round is expected, not a sign something is wrong.

- [ ] **Step 3: Confirm the skill loads and triggers**

Start a fresh session and ask a question that should fire it without naming it — e.g. *"is our email setup good enough to handle 10x the volume?"*

Expected: cross-examine fires on its own, the gate returns **inline**, and the answer contains a ranked list and a breaking point. If it does not fire, the `description` lacks the trigger phrasing — add the symptom wording that failed, verbatim.

- [ ] **Step 4: Mirror into the skill library**

`~/.claude/skills` is not version-controlled, so this is the only durability step in the plan. This is the spec's §13 open item; the answer is yes, because a power outage already cost this project a session's work once.

```powershell
$src = "C:\Users\Aaron\.claude\skills\cross-examine"
$dst = "C:\Users\Aaron\Documents\Repos\autoskills-library\RED-2..0-autoskills\cross-examine"
New-Item -ItemType Directory -Force $dst
Copy-Item "$src\*" $dst -Recurse -Force
git -C "C:\Users\Aaron\Documents\Repos\autoskills-library" status --short
```

Confirm the library is a git repo before committing; if it is not, say so and stop rather than assuming. Commit message: `feat(skill): cross-examine — adversarial audit framing`.

- [ ] **Step 5: Record the outcome**

Append a short `## Outcome` section to the spec at
`docs/superpowers/specs/2026-07-27-cross-examine-skill-design.md`: how many REFACTOR rounds it took, which rationalizations proved hardest to close, and whether §9's `jury` exit trigger fired during the build. Commit to RED-2.0 — the pre-commit hook runs lint, typecheck and the full vitest suite, which takes ~25s on a docs-only change.

---

## Self-Review

**Spec coverage.** §3 name → Task 2/1. §4 trigger → Task 2/1 + Task 8/3. §5 gate → Task 2/3. §6 six rules + M1/M2 → Task 2/4–5. §7 staffing → Task 5. §8 contract → Task 6. §9 replication → Task 4. §10 packaging → the File Structure table + Task 2/7. §11 use cases → carried by the `description`, not a section. §12 non-goals → Global Constraints. §13 open items: the `CLAUDE.md` amendment already shipped at `7d888b9`; the mirror decision resolves in Task 8/4.

**Deviation from the spec, recorded deliberately.** The spec phrases several rules as prohibitions ("banned output", "never ask"). `writing-great-skills` establishes that prohibition-first phrasing backfires, so this plan states all six positively and moves the bans into the rationalization table and red-flags list, where that form is the correct one. Same behaviour, different steering.

**Type consistency.** Tier labels `Inline` / `Run here` / `Hand off` are identical across Tasks 2, 6, 7. Rule names are fixed in Task 2 Step 4 and referenced verbatim afterwards. Path `references/` is consistent throughout. `roster.md` names the Verification variant defined in `replication.md`.

**Known gap, accepted.** Nothing verifies that a *tier-3* run produces a compliant brief end to end — that would mean executing a full audit, which costs more than the skill. Task 7 Step 2 substitutes structural validation against a real hand-rolled brief. If the first real tier-3 run produces a brief missing a contract section, that is the signal to add the end-to-end test.
