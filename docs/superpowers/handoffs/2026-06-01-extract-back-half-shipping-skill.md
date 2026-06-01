# Handoff — SESSION N+2: extract the back-half "shipping" skill (GOAL B, the real prize)

**Date:** 2026-06-01 · **Repo:** `forge-1.0` · **Branch:** `master` @ `8b8a779` · working tree clean
· **no remote yet** (publish is a HITL item, below).

> This session is **skill creation only**. Forge itself (GOAL A) is DONE — do **not** add app
> features. The job is to distill everything Forge taught us into a reusable skill. Read the
> referenced artifacts; do not re-derive them.

---

## The one job

Forge has always had a meta-goal beyond the app: a **repeatable harness that takes a
`claude.ai/design` mock → a working, production-grade app**, in two halves:

- **Front half — `sector-map` skill: DONE/EXTRACTED.** Lives at `~/.claude/skills/sector-map/`
  (`SKILL.md` + `PHASES.md` + `TEMPLATES.md`). It shapes a non-working mock into a sectored,
  book-readable architecture with one machine-checked boundary, BEFORE behavior exists. **This is
  the structural template to mirror** — match its shape, voice, and progressive-disclosure style.
- **Back half — the "shipping" skill: NOT YET EXTRACTED. This is the whole task.** It must codify
  taking that sectored mock → a real, tested, deployed app: the `to-prd → to-issues → to-goal`
  flow on a **local issue store**, run as **vertical tracer-bullet slices** through an
  **orchestrator + TWO fresh-eyes gates** (Elegance + Senior Dev, K=1, commit only on YES/YES),
  **plus** the hardening lessons proven on Forge (below).

`sector-map` and the back-half skill are siblings: front shapes the mock, back ships it.

---

## START HERE — read in this order (the payload, do not re-derive)

1. **The learnings ledger — `docs/superpowers/harness-learnings.md`.** THE primary input. Read it
   top-to-bottom. Three dated sections (2026-05-31, 2026-06-01, 2026-06-01-cont) of
   *What happened · Why it matters · Skill implication* triplets — process, operational, and
   architecture lessons, each written to become a skill gate. This is the accumulated, reinforced
   record the whole "finish Forge first" plan existed to produce.
2. **The architecture audit — `docs/superpowers/audits/2026-05-31-forge-architecture-audit-learnings.md`.**
   Its **7 harness implications** are the structural spine of the skill (per-slice concept-duplication
   gate; docs-as-assertions; slice-done = typecheck+test+build in CI; keep the DAL seam injectable;
   ADR consequence-clauses → gates; stack-aware default rule set; migrations are the canonical
   provisioner + definer/grant audit). Also lists "what the harness GOT RIGHT — codify verbatim."
3. **The proven orchestration shape — `docs/prompts/goal-forge-supabase-finish.md` and
   `docs/prompts/resume-forge-migration.md`.** The actual orchestrator + 2-fresh-eyes-gates + local
   issue store prompts that drove the migration. This is the runnable skeleton the skill generalizes.
4. **The prior handoffs** (`docs/superpowers/handoffs/2026-05-29-*`, `-05-30-*`, `-05-31-*`) for the
   arc; the `-05-31` one frames the two-session plan that this handoff is the second half of.
5. **The exemplar outputs the skill should be able to reproduce** (read as reference, the skill points
   at patterns like these, doesn't hard-code them): `docs/issues/0001-0008` (tracer-bullet vertical
   slices), `docs/prds/prd-supabase-migration.md`, `docs/adr/0001-0005`, `CONTEXT.md`,
   `ARCHITECTURE.md`, `supabase/tests/*.sql` (the rolled-back self-asserting DB test pattern).

---

## What changed since the last handoff (so the ledger's newest entries make sense)

GOAL A is now **fully complete and hardened twice**. Since `2c5a544`:
- **Atomic-writes wiring** (`cc9c427`→`8fb82a8`): money-path RPCs mirrored verbatim, typed, wired,
  ADR-0005, rebuild proof, RLS-denial test. (Detail in the `-05-31` handoff + ledger 2026-06-01.)
- **2nd `improve-codebase-architecture` pass** (`3f8d8f9`→`5e5337c`): 6 findings found → adversarially
  verified → fixed by dispatched agents. Phone rule single-homed; **injectable DAL seam restored**
  (the audit's last open structural finding); ADR-0005 honesty fix + `toggle_pase_rules.sql`;
  roster-nav extracted to a tested seam. Tests 60→76. (Detail in ledger 2026-06-01-cont.)

The point for THIS session: the ledger's newest triplets (orchestrate-don't-over-checkpoint,
review-the-agent's-diff, testability-as-interface-depth, don't-home-a-rule-where-no-caller-runs-it)
are fresh skill fodder — fold them in.

---

## How to build it (suggested, not prescriptive)

1. **Brainstorm the skill's shape FIRST** (`superpowers:brainstorming`). The open framing question
   to resolve up front: **is the back-half a gate-layer ON `to-goal`, a standalone twin of
   `sector-map`, or an enhancement of `to-goal` itself?** Decide before writing.
2. **Then `write-a-skill`**, mirroring `sector-map`'s structure (SKILL.md entry + PHASES.md +
   TEMPLATES.md). Compose: the audit's 7 implications + the full ledger as the skill's gates, and the
   `goal-*`/`resume-*` prompts as the orchestration skeleton.
3. **Validate before codify** ([[forge-validate-before-codify]]): Forge is the clean reference output;
   cut the skill from it. Where a gate is claimed, point at the real Forge artifact that proves it
   (e.g. the rolled-back SQL test, the dependency-cruiser config, the CI workflow).
4. **The headline gate** (from the audit): the single enforced boundary catches import *direction*,
   not concept *duplication* or contract *honesty* — the back-half skill's marquee addition is the
   per-slice concept-duplication + docs-as-assertions gates the cruiser structurally can't do.

---

## Operating style for this session (Aaron's standing directives)

- **Orchestrate; don't over-checkpoint** ([[forge-orchestrate-dont-over-checkpoint]]). Run the
  fork-test before any human checkpoint: only interrupt on a genuine decision you can't resolve from
  the repo / a precedent / the audit. Dispatch Opus agents for delegable work, review their diffs
  yourself, gate, proceed. Lead with a senior recommendation, not a blank question.
- **Good-enough that showcases the harness, not perfection** ([[forge-good-enough-not-perfectionist]]).
- This is a **public showcase** of Aaron's AI-workflow-harness brand — keep it brand-facing, no
  secrets in tree.
- Commit messages: `git commit -F .commitmsg` (it's gitignored); never a multiline `-m` here-string.

---

## HITL items still open (Aaron only — NOT skill work, don't block on them)

1. **Publish to GitHub:** `! gh repo create vack99/forge --public --source=. --remote=origin --push`
   (the classifier blocks the agent from the bulk push; `gh` authed as `Vack99`; `.mcp.json` gitignored).
2. **Enable leaked-password protection** — Supabase dashboard → Auth → Password security (the only
   remaining security advisor; one click).

---

## Suggested skills for SESSION N+2

- **`superpowers:brainstorming`** — FIRST, to resolve the gate-layer-vs-twin-vs-enhancement framing
  before writing anything.
- **`write-a-skill`** — the main event; build the skill mirroring `sector-map`'s structure.
- **`superpowers:writing-skills`** — for the discipline/verification of skill authoring.
- Reference, not to invoke: `~/.claude/skills/sector-map/` (the front-half template), and the
  `to-prd` / `to-issues` / `to-goal` / `triage` skills the back-half generalizes.

**First actions:** (1) read the ledger + audit (the two payload docs); (2) `superpowers:brainstorming`
to fix the skill's shape; (3) `write-a-skill`. Do NOT add Forge app features. Do NOT publish or toggle
auth — those are Aaron's calls.
