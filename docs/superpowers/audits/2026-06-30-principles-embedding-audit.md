# Audit — Embedding DRY / YAGNI / KISS / SOLID into the delivery pipeline

**Date:** 2026-06-30 · **Trigger:** before Phase 2, decide the most elegant, durable way to make
DRY/YAGNI/KISS/SOLID *bite* on implementation — gated by this audit before changing `to-goal`,
one of the most-used skills in the toolset. **Method:** 3 adversarial lenses (elegance/minimalism,
cross-run generalization, anti-bloat) + synthesis over the live skill files.

## Finding (unanimous)

**Naming all four principles as positive mandates is too much — and partly harmful.**

- **YAGNI and KISS are already installed** in the `to-goal` gates (`~/.claude/skills/to-goal/gate-prompts.md`):
  - Gate 1's **deletion test** ("delete it — does complexity vanish (pass-through, bad) or
    concentrate (earned its keep)?") *is* YAGNI-applied-to-modules.
  - Gate 1's **"minimum diff needed to satisfy the acceptance criteria"** + "no cleverness for
    cleverness's sake" *is* KISS.
  - Gate 2's **"No premature optimization, no defensive code for impossible scenarios"** *is*
    YAGNI, verbatim.
- Re-listing them as a 4-principle roll-call restates installed teeth and spends the gate's
  capped reasoning budget on ceremony.
- **Printing "SOLID"/"DRY" as positive goals is actively harmful** — it cues the exact
  interface-for-one-caller premature abstraction the deletion test exists to reject.
- **The only genuine gap** is DRY + a *named inoculation* against SOLID/DRY being invoked to
  license premature abstraction. So they belong **only inside a negative guard**, never as
  "apply these."

## Decision — TRIAL-THEN-PROMOTE (honors the gate on the global change)

1. **Do not edit the global `gate-prompts.md` now.**
2. **Phase-local trial (Phase 2):** add ONE negative-guard clause to the Phase-2 goal file's
   Gate 1 blockquote, immediately after the "…minimum diff needed to satisfy the acceptance
   criteria." sentence. Blunt **tracer form** (single-caller abstraction = FAIL) is safe here
   because a thin tracer has no legitimate extraction to false-block:

   > This slice is a thin tracer: YAGNI and KISS dominate this call. Reject speculative
   > abstraction — any new interface, generic, dependency injection point, indirection layer, or
   > extracted 'shared'/base Module that has a SINGLE caller in this diff FAILS; 'DRY' and 'SOLID'
   > are NOT a licence to add structure the acceptance criteria do not require. The deletion test
   > decides: a one-caller wrapper whose removal makes complexity VANISH is a pass-through — cut
   > it inline. Prefer a little duplication over the wrong abstraction.

   Plus a `### Design principles` section in the PRD (see the Phase-2 kickoff prompt) so the
   weighting is set before decomposition and inherited by every slice through the PRD mirror.
3. **Promotion criterion (to go global):** promote a **softer, extraction-safe** form iff, across
   Phase 2's slices, (a) the phase-local clause produced ≥1 genuine NO or a documented
   reviewer-caught near-miss on a speculative single-caller abstraction, AND (b) **zero
   false-blocks** on legitimate present-need structure, AND (c) `~/.claude/skills/to-goal/gate-discipline-test.md`
   is extended with a NEW "clean-but-over-abstracted" fixture (a one-caller interface extracted
   "for SOLID" on a tracer AC set) that the amended Gate 1 returns **NO** on while still returning
   **YES** on the existing clean fixture — the skill's **Iron Law**: no edit to `gate-prompts.md`
   ships until that RED→GREEN harness re-runs green.

## Global promotion target (do NOT add until the criterion is met)

Insert as a marked line in the Gate 1 (Elegance) blockquote — the **extraction-safe** form (the
"sole justification … rather than a concrete present need" test passes legitimate `@gym/*`
single-caller-for-now extraction, unlike the blunt tracer form):

> *(principles-only)* Reject any new abstraction — interface, generic, base class, dependency
> injection point, indirection layer, or 'reusable' helper — whose SOLE justification is DRY,
> SOLID, or future-proofing rather than a concrete present need in this diff: premature
> abstraction fails YAGNI, so prefer a little duplication over the wrong abstraction. If the
> parent PRD has a Design principles section, apply its weighting for this run.

This marker is **default-on** (its guard needs no project artifact), unlike the presence-gated
`(ADR-only)`/`(vocab-only)` markers; drop only the final "If the parent PRD…" clause when the PRD
has no Design principles section. Document that non-standard drop-rule in `gate-prompts.md`'s tier
note + `to-goal/SKILL.md` Scenario adaptations when promoting.

## Why this shape

The gate file is **paraphrase-sensitive critical-path text** inlined verbatim into every
near-daily multi-phase run, with cross-project blast radius. The elegant, least-invasive move is
a single **negative** clause that adds only the missing signal (DRY + a named anti-abstraction
guard) as a *fail condition* — not a positive roster that restates installed teeth and cues the
pro-abstraction reflex. Trialing phase-local first buys the required new discipline-test fixture
real calibration data (does it catch premature abstraction without false-blocking the legitimate
extraction pattern?) at zero cross-run risk, then promotes a proven line.
