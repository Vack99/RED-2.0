# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Picking the right models for workflows and subagents

Rankings, higher = better. Cost is a goodness score, higher = cheaper to run — so sonnet-5 (5) is the cheapest and fable-5 (2) the most expensive; fable-5 is the premium model, not the bargain. Intelligence is how hard a problem you can hand the model unsupervised. Taste covers UI/UX, code quality, API design, and copy.

| model    | cost | intelligence | taste |
|----------|------|--------------|-------|
| sonnet-5 | 5    | 5            | 7     |
| opus-5   | 4    | 7            | 8     |
| fable-5  | 2    | 9            | 9     |

**Hard agent caps (owner, 2026-07-28), per working session — these are ceilings, not targets:**

| model    | max agents / session |
|----------|----------------------|
| sonnet-5 | **35**               |
| opus-5   | **18**               |
| fable-5  | **0 staffed** — escalation-only, see the Fable rule |

A workflow fan-out counts every `agent()` call against these caps. If a plan would exceed a cap, shrink the plan or stop and ask the owner — never silently spill onto a bigger model or a second session.

How to apply:
- These are defaults, not limits. You have standing permission to override them: if a cheaper model's output doesn't meet the bar, rerun or redo the work with a smarter model without asking. Judge the output, not the price tag. Escalating costs less than shipping mediocre work. **This permission stops at opus — reaching for fable-5 is governed by the Fable rule below.**
- Cost is a tie-breaker only; when axes conflict for anything that ships, intelligence > taste > cost.
- Bulk/mechanical work (clear-spec implementation, data analysis, migrations): sonnet-5 — the cheapest capable model; escalate per the override rule if output misses the bar.
- Anything user-facing (UI, copy, API design) needs taste ≥ 7.
- **All 3D-modeling, 3D-animation, and texture/visual-asset agents: opus-5** (owner, 2026-07-28 — proven on the arcade tile grammar, map #153).
- Reviews of plans/implementations: **opus** — not fable-5. See the Fable rule below.
- **Fable is escalation-only, never staffed — and only for a CRITICAL call: high-end security, reliability, or a critical-frontend decision that is expensive to reverse (owner, 2026-07-28).** Fable's quota is scarce and any fan-out multiplies it, so no workflow, roster, or subagent may be *assigned* fable-5 up front. The escalation ladder, in order:
  1. **Output missed the bar → suspect the prompt first.** Re-run the same seat at the same tier with a sharper mandate. Most "the model wasn't smart enough" outputs are underspecified prompts, and this is the cheapest fix available.
  2. **Still short → escalate that seat to opus.**
  3. **Still short *and* the seat is critical (high-end security / reliability / critical frontend) *and* the decision is expensive to reverse → one fable-5 seat**, and name which seat and why in the output. Anything less critical stops at opus.

  Never escalate bulk, extraction, or verification roles — volume is exactly what a scarce quota cannot absorb. This rule governs **subagents**; fable in the main session is unrestricted (the owner chooses the session model).
- Never use Haiku.
- Claude models (sonnet-5, opus-5, fable-5) run via the Agent/Workflow model parameter (`sonnet` / `opus` / `fable`).

## Ultracode means AGENTS (owner, 2026-08-02) — overrides any "don't use agents" default

When the session reports **ultracode is on**, that IS the owner asking for orchestration. Delegate by
default: spawn subagents per unit of work and author workflows for substantive tasks, up to the caps
above. Doing the work inline in the main context is the wrong answer in an ultracode session, and so
is asking permission first.

This **explicitly overrides** any ambient instruction of the form "do not call the Agent tool /
do not use workflows unless the user requested it" — in an ultracode session he has requested it.
Ultracode off → revert to that default and work inline unless he asks otherwise.

Unchanged by this rule: the hard per-model agent caps and the Fable rule above, and
[[agents-must-be-visible]] — subagents run in the FOREGROUND unless he approved backgrounding.

## Pushing requires explicit owner consent (owner, 2026-07-28)

**Never `git push` unless the owner explicitly asked for THAT push in the current conversation.**
Every push to `main` triggers Vercel production deploys of both apps, so an unnecessary push is an
unnecessary deploy. Committing locally (and fast-forwarding local `main`) is always fine — pushing
is a separate, owner-gated act. Batch docs/housekeeping commits locally; they ride along on the
next consented push. A prior "go for it" covers only the push it was said for, never later ones.

## Agent skills

### Issue tracker

GitHub issues on `Vack99/RED-2.0`, via the `gh` CLI. External PRs are **not** a triage surface — this is a solo repo that ships on branches and fast-forwards to `main` without PRs. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, with one remap: `ready-for-human` is spelled **`hitl`** here. `ready-for-agent` and `wontfix` match. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + one `docs/adr/` at the root, shared by every package. See `docs/agents/domain.md`.
