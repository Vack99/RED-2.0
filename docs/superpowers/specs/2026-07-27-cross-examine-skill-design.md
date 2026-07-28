# Design — `cross-examine`: a skill for interrogating systems that answer "everything's fine"

**Date:** 2026-07-27
**Status:** design approved, implementation pending
**Installs to:** `~/.claude/skills/cross-examine/` (personal, cross-project)
**Origin:** the 2026-07-27 auth-structure audit returned a confident all-clear that the owner did not
believe. Diagnosing *why* produced the framing rules below.

---

## 1. The problem this exists to solve

An evaluation asked "is X okay?" answers "yes." Not because the evaluator is lazy or sycophantic,
but because **the question has a cheap true answer** and nothing forces a more useful one. The
result reads as reassurance and carries no information.

The originating case: five Opus agents were given a **byte-identical prompt** about an
architecture, in independent contexts. All five returned "keep it." The report presented that
unanimity as *"the strongest signal in this report."* It was not. It was five samples of a single
framing, and everything outside that framing was invisible to all five simultaneously.

**The core insight — the one line the whole skill hangs from:**

> Replication reduces variance. It does not reduce bias. Five samples from a biased distribution
> give a very *precise* estimate of the biased answer — so a wrongly-framed question doesn't just
> survive replication, it gets laundered into "5/5 unanimous, high confidence."

The fix is **not** to instruct agents to find problems. That produces invented findings, which is
strictly worse than an all-clear because it burns the credibility of the real ones. The fix is to
change the *shape of the question* so that useful content is produced whether or not anything is
broken.

## 2. Scope

**Any high-stakes evaluation of something that already exists** — architecture, vendor choice,
security posture, a plan, a PR, a business decision. Domain-neutral by design: none of the six
framing rules mentions code.

**Not in scope:** generating new designs (that is `brainstorming`), interrogating *the user* about
their own plan (that is `grilling` — same posture, different witness), or gathering facts with no
verdict attached (that is `research`).

## 3. Name

**`cross-examine`.** A cross-examination assumes the witness is not volunteering what hurts them:
assertions are not accepted, specific answers are compelled, and hostility is procedure rather than
rudeness. It also completes a family — **`grilling` interrogates the user about their plan;
`cross-examine` interrogates a system about itself.**

Rejected: `pressure-test` (plainer, less evocative), `breaking-point` (names one output, too narrow).

## 4. Trigger

Model-invoked **and** explicitly invocable. Fires on:

- evaluating an existing system, vendor, plan, or decision
- "is X good enough" / "will X scale" / "should we keep X" / "what are our weaknesses"
- comparing alternatives against an incumbent
- **a prior evaluation came back clean and the user doubts it** — the originating case

Auto-firing is only safe because of the gate in §5. Without the gate this becomes a
fleet-summoning machine, which is a failure mode this user has already killed once in practice.

## 5. The sizing gate — runs first, every time

Three questions: **Is the question space open or closed? Can this context hold the evidence? How
reversible is the decision riding on it?**

| Verdict | Shape | When |
|---|---|---|
| **Inline** — 0 agents | Apply the framing rules directly | Closed question, or fewer than ~10 tool calls answer it |
| **Run here** — 2–12 agents | Sweep → verify → synthesize in this session | Bounded subject; one context holds the synthesis |
| **Hand off** — 13+ agents | Emit a brief; a fresh session executes it | Multi-vendor or multi-domain, or context already >40% spent |

**Inline is the most common verdict and the skill must say so out loud.** "Do this yourself, right
now, with no agents" is a first-class output, not a failure to engage. A skill that always fans out
gets switched off.

There is deliberately **no separate lite/full/ultra intensity dial** — the gate already sizes the
run, and a second knob would be two ways to say one thing. The user can override the tier by naming
it.

## 6. The six framing rules

Every rule is domain-neutral. These are the substance of the skill.

1. **Rank, don't rate.** Never "is X okay?" — that answers yes. Always **"rank the N worst things
   about X, worst first."** A forced ranking always produces content, and the top entry is
   informative even when its absolute severity is low. A minimum count is mandatory.
2. **Find the breaking point, don't assess adequacy.** Never "does this scale?" Always **"at what
   number does this break, and which breaks first?"** Every component has a breaking point.
   **"It scales fine" is a banned output** — a refusal to answer wearing the costume of an answer.
3. **Every keep needs an exit trigger.** Any recommendation to keep something must name the
   observable condition that would reverse it. A keep-verdict with no exit trigger is an
   unfalsifiable opinion and does not count as a finding.
4. **The incumbent gets no default.** What already exists is a *candidate*, judged on the same
   evidence standard as every alternative. It does not win by being already built.
5. **Evidence or it didn't happen.** `file:line`, query output, or primary-source URL. Vendor facts
   come from the vendor, never from memory — pricing is the single most likely thing to be
   confidently wrong.
6. **Declare your blind spots.** Every agent ends its output with what it did *not* examine. That
   list is the coverage critic's input.

### Two meta-rules above them

**M1 — Replication vs coverage, chosen deliberately.** Identical prompts measure how *sure* you
are; diverse prompts measure what you *missed*. Never let the first stand in for the second. The
ideal shape is both in sequence: diversify to open the question space, then replicate on each
proposition that falls out.

**M2 — Honesty overrides everything above.** Never manufacture findings to satisfy rule 1. If
something is genuinely sound, say so plainly with evidence — then rank it against the rest anyway.
**A report padded with invented problems is a worse outcome than "this part is fine."** Without M2,
a skill built to defeat the all-clear becomes a skill that lies.

## 7. Staffing (tiers 2 and 3 only)

**Build a coverage map before a roster.** Enumerate the distinct territories the question contains,
*then* assign one agent per territory. This makes the identical-prompt failure structurally
impossible: two agents cannot receive the same prompt when each owns named ground.

| Role | Tier | Notes |
|---|---|---|
| **Gatherers** | cheap | Bounded extraction with a clear success criterion |
| **Analysts** | capable | One distinct territory each; judgment under ambiguity |
| **Red team** | capable | **Mandatory.** Paid to argue the thing fails. Not asked to be fair — asked to be strong |
| **Verifiers** | cheap–mid | Replication belongs *here*: identical prompt, N votes on one proposition |
| **Coverage critic** | capable | **Mandatory.** Only job: what did this entire roster fail to examine? |
| **Referee** | capable | Resolves dissent against primary sources; records what stays unsettled |
| **Synthesizer** | capable | Produces the deliverable |

The two mandatory roles are the structural half of the defence: **the framing rules make each agent
honest; the red team and coverage critic make the *roster* honest.** Rules alone cannot catch a
blind spot that every agent shares.

### Model delegation

Defer to the project's model table when one exists; otherwise judgment / adversarial / synthesis →
most capable available, bounded extraction → cheapest capable. Escalate freely on weak output —
judge the output, not the price tag. Hold ~2 capable seats in reserve for escalation.

**Quota-reserved models are escalation-only, never staffed.** Where a project marks a model
quota-constrained, a roster may not assign it up front. It can only be escalated to, in this order:

1. **Weak output → suspect the prompt first.** Re-run the seat at the same tier with a sharper
   mandate. Most "the model wasn't smart enough" outputs are underspecified prompts, and this step
   is the cheapest on the list.
2. **Still weak → escalate that seat one tier.**
3. **Still short of the bar *and* the decision is expensive to reverse → one reserved seat**, and
   the report names which seat and why.

**Never for gatherers, verifiers, or red team** — volume roles are exactly what a constrained quota
cannot absorb. Only a final synthesis or referee on an irreversible call is eligible, and only
after step 2.

> **RED-2.0 specifics:** Fable is quota-constrained (see the `fable-usage-conservation` memory), so
> the subagent ladder tops out at **opus**. ⚠️ `CLAUDE.md` currently says *"Reviews of
> plans/implementations: fable-5 or opus-4.8,"* which would staff Fable by default on exactly the
> review-shaped work this skill does most. That line contradicts the memory. **The skill follows
> the memory**; amend `CLAUDE.md` so a future session does not read the stale version.

## 8. Output contract

**An audit is incomplete if a required deliverable is missing.** This is what converts the framing
rules from advice into a gate.

| Deliverable | Inline | Run here | Hand off |
|---|---|---|---|
| Ranked weaknesses, worst-first | min 5 | min 8 | min 10 |
| Breaking-point table — component → the number → which arrives first | ✓ | ✓ | ✓ |
| Exit trigger per keep-verdict | ✓ | ✓ | ✓ |
| Confidence ledger — measured / modelled / asserted | ✓ | ✓ | ✓ |
| Could-not-determine + the experiment that would settle it | ✓ | ✓ | ✓ |
| Owner-input list — facts no agent can derive (dashboards, invoices, contracts) | — | ✓ | ✓ |
| Dissent log — what disagreed, how refereed, what stays unsettled | — | ✓ | ✓ |

Written reports follow project convention for location (in RED-2.0: `docs/Context/` or
`docs/superpowers/audits/`). Inline audits answer in conversation and write nothing.

## 9. Replication — specified here, spun out later

Cross-examine needs replication today for the Verifiers role, so the guidance lives in
`references/replication.md`.

**The technique:** a *replication panel* — N agents, byte-identical prompt, independent contexts,
where **the split is the output.**

| Variant | Shape | Read the result as |
|---|---|---|
| **Verification** | N skeptics each prompted to *refute* one claim, defaulting to refuted when uncertain | Majority refutes → kill the finding |
| **Scoring** | N judges, identical rubric, N candidates | Median; disagreement means the rubric is underspecified |
| **Confidence** | N runs of one open question | Unanimous → act. Split → genuinely hard, escalate to a human |

Non-obvious rules: **odd N** (3 cheap, 5 for high-stakes); never pool the contexts; and never
report unanimity on an *open* question as confidence — that is the trap that produced the
originating case.

**Deliberately not a separate skill yet.** Building `jury` now would be speculative: two artifacts
covering one body of knowledge before knowing whether it is ever invoked standalone.
**Exit trigger** (applying rule 3 to this design's own decision): *spin `jury` out the first time
replication is wanted without an audit wrapped around it.* If that never happens, it was never
needed. If it happens twice, build it.

## 10. Packaging

```
~/.claude/skills/cross-examine/
  SKILL.md                        # trigger + gate + six rules      (always read, ~150 lines)
  references/replication.md       # replication-vs-coverage in full
  references/roster.md            # coverage map, archetypes, model delegation
  references/contract.md          # deliverable spec + templates
  references/handoff-template.md  # the tier-3 brief format
```

Progressive disclosure: an inline audit reads only `SKILL.md` and never loads the roster docs.

`SKILL.md` must include **the canonical failure case, abstracted**: *five agents, one prompt,
unanimous "keep it" — and the unanimity was five samples of a single framing.* Concrete
anti-patterns make skills far more reliable than abstract warnings.

## 11. What it gets pointed at

- The Supabase fit / alternatives audit (that handoff *is* this skill, hand-rolled)
- "Should we keep X" — any ADR up for revision, notably `ADR-0013`, which carries a false claim
  that tells reviewers to delete correct fixes
- Vendor decisions — Resend vs SES; Stripe when it arrives
- Pre-launch readiness — "are we ready to sell to gym #5, #50, #500"
- Plan review before execution — pairs with `grilling`
- Post-incident — breaking points and blast radius are already the right questions
- The existing elegance / senior-dev review gates, which get sharper from rules 1 and 3 alone

## 12. Deliberate non-goals

- **No intensity dial** — the gate sizes the run (§5)
- **No `jury` skill yet** — exit trigger recorded (§9)
- **No project-specific baselines inside the skill** — those belong in the handoff it emits, not in
  a cross-project skill that would rot
- **Does not generate designs or fixes** — evaluation only; remediation is a separate act

## 13. Open items

- ~~Author the five files in §10~~ — **done**, all five live at `~/.claude/skills/cross-examine/`
- ~~Amend the `CLAUDE.md` model-table line flagged in §7~~ — **done** at `7d888b9`
- ~~Decide whether to mirror into `Repos/autoskills-library`~~ — **done**; the library was
  `git init`-ed (baseline `f9c3565`) and the skill committed at `97ffdd8`

## 14. Outcome — built and measured 2026-07-28

Built RED-GREEN-REFACTOR per `superpowers:writing-skills`. Three pressure scenarios were run against
agents **five times**: once with no skill, then after each of three fix rounds. Same scenarios, same
model, same rubric, scored by an agent held to identical standards each round.

| Round | Score | What moved |
|---|---|---|
| Baseline (no skill) | **3/18** | Exit triggers and blind spots 0/3. Ranked lists 0/3. |
| GREEN (skill v1) | **15/18** | Full reversal. |
| Refactor 1 | 15/18 | F3 closed; a ranking-floor regression appeared. No net gain. |
| Refactor 2 | 16/18 | Floor fixed. F1 survived a third prose attempt. |
| Refactor 3 | **18/18** | F1 and F2 closed. |

### The central lesson

**Prose failed three times; making the check a deliverable worked immediately.**

The stubborn failure (F1) was an agent granting the incumbent credit for resembling a known pattern.
Rule 4 was stated against that exact move in four separate places. An agent read all four and
committed it anyway, then — asked how the skill should have been written — answered *"the skill was
clear, I did not follow it"* and rejected better wording as the fix. A second failing agent
independently said the same.

Two structural fixes came out of that, and both worked where prose had not:

1. **Mechanical gates.** *"An exit trigger is invalid if the sentence contains no numeral"* closed F3
   on first attempt. As the agent that failed it put it: hedge words do not feel vague when you write
   them — *"materially faster than linearly"* reads as quantitative because it references a
   mathematical concept. Self-recognition is the wrong enforcement mechanism because it is the
   faculty already under pressure.
2. **Visible deliverables.** Rule 7's self-audit was ignored while it was an invisible internal pass
   (1 of 3 declared it, **0 of 3** showed it changing anything). Made a required closing `Draft audit`
   section, it went to **3 of 3 emitted, 3 of 3 visibly changing a sentence.** Every mechanism that
   reliably works in this skill works because it emits something a contract can demand.

Also learned: **Rule 2's and Rule 3's honest escapes must differ in shape.** Rule 2's gap is a fact
not yet collected, so it routes to an experiment (`unmeasured — <experiment>`). Rule 3's is usually a
decision not yet made — a risk line only an owner can set — so it routes to a person
(`undecided — <the question, and who must answer it>`).

### The property that never slipped

**The padding check was clean in all five rounds** — no fabricated or scenario-unsupported weakness at
any stage, including the round that stated the minimum-of-five floor most forcefully. In the final
round one answer held at five items and explicitly declined to pad to six, naming the candidate and
why it could not be stated without guessing. This was the outcome most in doubt at design time: a
skill built to defeat a false all-clear producing false alarms instead would have failed differently,
not succeeded.

### Known-unverified — needs a fresh session, not another agent

**Autonomous invocation did not fire in 2 of 2 subagent tests.** Asked *"is it good enough to handle
10x that volume?"* — phrasing the description's trigger list covers — the skill was listed as
available and was not invoked. **This is not evidence the description is too weak**, because a
subagent test cannot distinguish that from subagents not auto-invoking skills at all. Changing the
description on this evidence would be acting on an unmeasured premise.

**The experiment that settles it:** in a fresh main session, ask an evaluation-shaped question
without naming the skill. If it fires, the description is fine. If it does not, add the plain-language
symptom wording verbatim (`"is X good enough to handle…"`, `"will this hold up at…"`) — the current
description carries the formal *"judging whether something will scale"* but not the colloquial forms
people actually type. **Run it two or three times before rewriting anything:** invocation is
probabilistic, so a single non-fire is weak evidence — acting on one would repeat exactly the
unmeasured-premise error this section exists to avoid.

### Deferred, not worth another round

The draft audit's both-ways property — that an unsupportable *criticism* is cut exactly as an
unsupported reassurance is — is asserted in the rule and demonstrated in `contract.md`'s worked
example, but **0 of 3 runs executed a cut of a criticism** (one near-cut was reversed and kept). Watch
for false severity in real use; revisit only if it appears.

§9's `jury` exit trigger did not fire during the build: replication was never wanted standalone.
