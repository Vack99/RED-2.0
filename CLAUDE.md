# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Picking the right models for workflows and subagents

Rankings, higher = better. Cost is a goodness score, higher = cheaper to run — so sonnet-5 (5) is the cheapest and fable-5 (2) the most expensive; fable-5 is the premium model, not the bargain. Intelligence is how hard a problem you can hand the model unsupervised. Taste covers UI/UX, code quality, API design, and copy.

| model    | cost | intelligence | taste |
|----------|------|--------------|-------|
| sonnet-5 | 5    | 5            | 7     |
| opus-4.8 | 4    | 7            | 8     |
| fable-5  | 2    | 9            | 9     |

How to apply:
- These are defaults, not limits. You have standing permission to override them: if a cheaper model's output doesn't meet the bar, rerun or redo the work with a smarter model without asking. Judge the output, not the price tag. Escalating costs less than shipping mediocre work. **This permission stops at opus — reaching for fable-5 is governed by the Fable rule below.**
- Cost is a tie-breaker only; when axes conflict for anything that ships, intelligence > taste > cost.
- Bulk/mechanical work (clear-spec implementation, data analysis, migrations): sonnet-5 — the cheapest capable model; escalate per the override rule if output misses the bar.
- Anything user-facing (UI, copy, API design) needs taste ≥ 7.
- Reviews of plans/implementations: **opus** — not fable-5. See the Fable rule below.
- **Fable is escalation-only, never staffed.** Fable's quota is scarce and any fan-out multiplies it, so no workflow, roster, or subagent may be *assigned* fable-5 up front. It can only be escalated to, in this order:
  1. **Output missed the bar → suspect the prompt first.** Re-run the same seat at the same tier with a sharper mandate. Most "the model wasn't smart enough" outputs are underspecified prompts, and this is the cheapest fix available.
  2. **Still short → escalate that seat to opus.**
  3. **Still short *and* the decision is expensive to reverse → one fable-5 seat**, and name which seat and why in the output.

  Never escalate bulk, extraction, or verification roles — volume is exactly what a scarce quota cannot absorb. This rule governs **subagents**; fable in the main session is unrestricted.
- Never use Haiku.
- Claude models (sonnet-5, opus-4.8, fable-5) run via the Agent/Workflow model parameter.

## Agent skills

### Issue tracker

GitHub issues on `Vack99/RED-2.0`, via the `gh` CLI. External PRs are **not** a triage surface — this is a solo repo that ships on branches and fast-forwards to `main` without PRs. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, with one remap: `ready-for-human` is spelled **`hitl`** here. `ready-for-agent` and `wontfix` match. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + one `docs/adr/` at the root, shared by every package. See `docs/agents/domain.md`.
