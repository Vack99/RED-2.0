# Harness Learnings Ledger

**Purpose.** A running, durable capture of every lesson from building Forge that should
shape the **back-half "shipping" skill** (the architecture → working-app half of the harness;
the front half is the already-extracted `sector-map` skill). Forge is the proving ground; this
ledger is how its lessons survive across sessions so the skill is built from *accumulated,
reinforced* learnings — not reconstructed from memory.

**How to use this file (every session, not just skill-building ones):**
1. While working, when you hit a real lesson — a mistake, a gotcha, a "the harness should have
   prevented this" — note it.
2. At the **end of every session**, append a dated entry below (newest at the bottom). Keep each
   lesson as a triplet: **What happened · Why it matters · Skill implication** (how the back-half
   skill should encode/prevent it). Reference artifacts by path; don't duplicate them.
3. The **skill-creation session** (GOAL B / N+2) reads this ledger top-to-bottom as the primary
   input to `write-a-skill`, alongside the audit doc.

**Do not duplicate — reference these existing sources:**
- The architecture audit's **7 harness implications** (the structural payload):
  `docs/superpowers/audits/2026-05-31-forge-architecture-audit-learnings.md`
- The proven orchestration shape (orchestrator + 2 fresh-eyes gates, local issue store):
  `docs/prompts/goal-forge-supabase-finish.md`, `docs/prompts/resume-forge-migration.md`
- Prior cycle handoffs: `docs/superpowers/handoffs/2026-05-29-*`, `2026-05-30-*`, `2026-05-31-*`
- The `sector-map` skill (front half, the template to mirror): `~/.claude/skills/sector-map/`

---

## 2026-05-31 — architecture audit + HIGH-cluster hardening session

**Structural lessons** — captured in full in the audit doc (the 7 implications). Reference, don't
re-list. One-line reminder of the through-line: *the single enforced dependency boundary catches
import **direction**, not concept **duplication** or contract **honesty** — the back-half skill's
headline gate must add those two.*

**Process lessons:**
- **Validate the OUTPUT before codifying the PROCESS.** We almost extracted the skill on faith;
  auditing Forge's actual architecture first turned every flaw into a concrete skill gate. *Skill
  implication:* the skill should open with a "audit a reference output before trusting the
  template" step, and ship its own adversarial-audit workflow. ([[forge-validate-before-codify]])
- **Fix the output first, extract second.** Forge embodies its own lessons now, so the extracted
  skill is cut from a clean reference. *Skill implication:* document this ordering as the
  recommended way to evolve the skill from each new project.
- **Thin seam over fat when the alternative duplicates the domain.** The audit literally flagged
  "rule re-coined in two places" as finding #1; a full-plpgsql RPC would have re-coined the money
  math in SQL on the very repo that showcases that audit. We chose the thin RPC (math stays in
  tested TS). *Skill implication:* a gate — "does this change duplicate a tested domain rule in a
  second language/layer? prefer the seam that keeps it single-source."
- **Aim for good-enough that showcases the harness, not perfection.** ([[forge-good-enough-not-perfectionist]])
  *Skill implication:* the skill should calibrate every gate to the project's stated goal, not an
  abstract ideal — and say so.

**Operational gotchas (bake into the skill's "execution mechanics"):**
- **Commit messages: `git commit -F <file>`, never a multi-line `-m` here-string.** PowerShell
  `@'...'@` repeatedly mangled messages into bogus pathspecs (failed commits). The `-F` temp-file
  approach worked every time.
- **`packageManager` must match the on-disk pnpm/workspace.** Pinning `pnpm@9.x` against a pnpm-11
  `pnpm-workspace.yaml` (which has only `allowBuilds`, no `packages:`) breaks every script with
  `ERROR packages field missing or empty`. Pin to the actual local version (here `pnpm@11.0.9`).
  ([[forge-pnpm-add-prefer-offline]])
- **Don't over-batch tool calls.** When one call in a parallel batch fails, the harness cancels all
  siblings — a wall of "Cancelled…" that looks like many failures but is one. Keep DB/commit/verify
  steps in small batches.
- **After ANY live-DB DDL: immediately mirror SQL → `supabase/migrations/`, regen + write
  `database.types.ts`, run `get_advisors`, and commit — in the same step.** We deployed RPCs and
  stopped, creating a live-DB↔repo drift (the audit's own finding #7, lived in real time). *Skill
  implication:* make "mirror + regen + advisor + commit" an atomic, non-skippable sub-step of any
  schema slice; a slice with applied-but-unmirrored DDL is NOT done.
- **Classifier-gated actions are HITL by design:** bulk push to a new public repo, and DDL on a
  live/public DB, each need explicit operator authorization. *Skill implication:* the skill should
  mark these as operator-gated checkpoints, not agent-autonomous steps.

<!-- Append the next session's entry below this line. -->
