# Handoff — Wayfinder map #105: clear T3–T6, then build the tracker end-to-end

**Date:** 2026-07-14 · **Map:** [🗺️ Wayfinder map #105](https://github.com/Vack99/RED-2.0/issues/105) · **Mode:** ONE autonomous session, owner AFK, **Fable** orchestrating · **Status:** 2 of 6 tickets resolved (T1, T2 done) — 4 remain

---

## TL;DR — this is NOT a normal wayfinder session

The owner wants the **entire rest of the effort done in one AFK run**:

1. **Resolve all four remaining tickets** — T3 (#108), T4 (#109), T5 (#110), T6 (#111) — closing each and clearing the map.
2. **`to-spec`** — turn the cleared route into a spec.
3. **`to-tickets`** — decompose the spec into implementation slices.
4. **Execute** — actually **write `docs/scope-model.yaml`** (populated from T3/T4) *and* **build the renderer** (sibling folder outside the repo), verify it runs on localhost.

This **overrides two wayfinder defaults on purpose** — cite this authorization if the skill tries to stop you:
- wayfinder says *"never resolve more than one ticket per session"* → **overridden for this run** by the owner's explicit instruction.
- wayfinder is *plan-only by default* → **already overridden** by the map's own Notes: *"This effort carries execution to the end."*
- Per `using-superpowers`, **user instructions outrank skill defaults.** The owner's instruction is the user instruction. Proceed through all four tickets and into execution — do not stop after one.

---

## The one rule that still holds, AFK or not: **capture, don't resolve**

Owner is AFK, so you make decisions autonomously — **except strategy, which you never invent.** The line:

- ✅ **You decide (autonomously, with taste):** the quest *structure* (what quests exist, their names, sizes, dependencies), the visual language (T5), the tracker tech (T6), how assets assemble into the yaml, the renderer build.
- ⛔ **You never decide (mark `status: needs-decision` instead):** pricing, the member-payment revenue cut, country launch order, ad budget/strategy, support-tooling choice, the Meta-agent build. These become `needs-decision` quests *in the model* — captured, not resolved. This is the safety valve that lets an AFK agent decompose owner-knowledge worlds (esp. T4) without fabricating the owner's business.

If you're ever unsure whether something is "structure" (yours) or "strategy" (owner's) → it's strategy → make it a `needs-decision` quest and move on.

---

## Model & orchestration strategy (Fable quota is scarce — read this)

Per `memory/fable-usage-conservation`: **Fable runs the main session only; subagents use opus/sonnet.** So:

- **Fable (main loop):** orchestrate, make the taste/synthesis calls, review subagent output, own the final decisions and the resolution ceremony. Keep bulk reading/writing *out* of the main context — delegate it.
- **opus subagents:** work needing judgment or taste — per-world quest decomposition (T3/T4), the T5 mock, the renderer UI build, reviews.
- **sonnet subagents:** mechanical bulk — light research legwork, assembling assets into `scope-model.yaml`, wiring.
- The owner explicitly asked for **orchestration through the whole thing** — this authorizes fanning out (the `Workflow` tool, or `dispatching-parallel-agents` / `subagent-driven-development`). The 6 ahead-worlds decompose in parallel; the build stages pipeline.

---

## Phase-by-phase

### Phase A — clear the map (resolve T3, T4, T5, T6)

All four are on the frontier now (unblocked, unassigned). **Claim each (`gh issue edit N --add-assignee @me`) before working it.** They can be done in any order; T3/T4/T5 are independent and parallelizable, T6 leans on T5's look.

Everything is designed **against the T2 schema** — read it first: [`docs/superpowers/wayfinder/2026-07-14-T2-scope-model-schema.md`](https://github.com/Vack99/RED-2.0/blob/main/docs/superpowers/wayfinder/2026-07-14-T2-scope-model-schema.md). And T1's catalogue + **ahead-world-bleed table**: [`…/2026-07-14-T1-foundation-catalogue.md`](https://github.com/Vack99/RED-2.0/blob/main/docs/superpowers/wayfinder/2026-07-14-T1-foundation-catalogue.md).

- **T3 (#108) — product-ahead worlds** (🛒 Sellable Product · 💳 Monetization · 🚀 Growth & Reach). Enumerate quests against the schema; light research where needed (e.g. what Stripe Connect actually entails). **Mark T1's bleed items `shipped` under their ahead world** (member self-registration → World 2; plan-change seam + payment strategy → World 3; scale audit / `.eq(gym_id)` / month-export / denial harness → World 4) — do **not** re-file them as todo. `needs-decision` for pricing / cut / caching strategy. → asset with the three worlds' quest lists.
- **T4 (#109) — business worlds** (📣 Go-To-Market · 🎧 Customer & Support · 🌎 LatAm Expansion). **Owner-knowledge territory** — this is where capture-don't-resolve works hardest. Enumerate the *standard structure* of each world (GTM: brand identity ✅earned, positioning/messaging, ad channels, ad **strategy** → `needs-decision`, marketing content, SEO; Support: contact channel ✅earned, support tooling → `needs-decision`, Meta-agent WhatsApp/IG build; LatAm: country **sequencing** → `needs-decision`, per-country currency/tax/legal localization, local payment methods). Mark the bleed items earned (contact channel #53 → World 6; brand identity/marketing copy → World 5; auth-mail delivery → 5/6). → asset with the three worlds' quest lists.
- **T5 (#110) — look & gamification language** (`prototype`; normally HITL). **You pick the direction** — the owner delegated the taste call to Fable. Build a cheap concrete mock (`/prototype`, `frontend-design`, `dataviz`). Suggested default unless you judge otherwise: a **clean progress-dashboard** (emoji worlds, honest progress bars, a crisp "🏗️ earned vs. 🌌 ahead" framing, tasteful motion) over heavy XP/badge/streak mechanics — the value is *seeing real project state*, not grinding points. Make it easy to re-skin. → linked mock + the decided visual language.
- **T6 (#111) — tracker tech & launch** (`grilling`; a technical decision). Honour the **split: renderer outside RED-2.0, repo untouched.** Sensible default to move fast (adjust if you see better): a **single self-contained HTML file** + a tiny **`refresh` script** that shells `gh`/git and writes a `status.json` snapshot the HTML reads (browsers can't call `gh` live). Sibling folder e.g. `Repos/red-tracker`. Launch = one command (`npx serve` / a `.bat` / just open the file). → the tech decision + exact launch recipe.

**Resolve each ticket the wayfinder way:** resolution comment on the issue (+ link its asset) → `gh issue close N` → append a one-line gist to the map's *Decisions so far*. When all four are closed, **the map is clear.**

### Phase B — `to-spec`

Invoke the `to-spec` skill. The cleared map (schema + 6 worlds of quest assets + look + tech) is the input. Produces the build spec/PRD on the tracker.

### Phase C — `to-tickets`

Invoke `to-tickets` on that spec. Expect a *small* slice set — the map's Notes note execution is "mostly assembly": (1) assemble `docs/scope-model.yaml` from the T3/T4 assets, (2) build the renderer per T5/T6, (3) wire the `gh`-derived status + derived states + unmapped-issues inbox, (4) the launch recipe.

### Phase D — Execute (build both deliverables)

- **`docs/scope-model.yaml`** — assemble every quest from the T3/T4 assets + the T1 Foundation into the T2 schema. Committed, in-repo. Validate against the invariant (every quest = `id` + `title` + ≥1 of `{github, status}`; all `depends_on` ids resolve).
- **The renderer** — in the sibling folder **outside** RED-2.0. Reads the yaml + `gh`/git read-only; renders world→subgroup→quest with the derived states (`shipped-with-open-threads`, `blocked`, "awaiting owner walk"); builds the **unmapped-issues inbox** (open repo issues bound to no quest). **Zero files/config touched inside RED-2.0 except `docs/scope-model.yaml`.**
- **Verify** it actually runs on localhost and shows real progress (use `/verify` / drive it). Leave the owner a one-line "how to open it" note.

---

## Guardrails (don't violate)

- **In/out split:** the *only* new file inside RED-2.0 is `docs/scope-model.yaml`. The renderer and its `status.json` live **outside** the repo. No changes to RED-2.0 build/deploy/config/`package.json`. The file is provably inert (no Prettier/lint-staged; `lint:src` skips `docs/`).
- **Capture, don't resolve** (see above) — strategy is `needs-decision`, never invented.
- **Refer by name** in everything the owner reads — ticket titles and quest names, not bare `#numbers`.
- **Docs land on `main` via clean fast-forward.** The effort lives on the `wayfinder-tracker` worktree (branch `wayfinder-tracker`, currently == `origin/main` @ `870af03`). Commit assets here, then `git push origin HEAD:main` (clean FF) + sync the branch. The pre-commit hook is `lint && typecheck && test` — docs-only commits are safe.
- **One worktree.** Stay in `.claude/worktrees/wayfinder-tracker`; don't `cd` to the primary checkout.

## The AFK contract (how to behave with nobody watching)

- **Make strong, documented decisions** — the recommended-approach pattern the owner blessed on T2. Record *why* in each resolution comment.
- **Never block on the owner.** The only "owner input" is the strategy calls — and those are captured as `needs-decision` quests, not waited on.
- **Graceful stop-points** if you run out of runway (don't leave a half-written yaml or a broken renderer): (1) after the map clears (all assets exist) is a clean stop; (2) after `to-tickets` is a clean stop; (3) execution should land the yaml *complete* before starting the renderer, so each deliverable is independently done. If you must stop mid-way, write a short continuation note at the bottom of this file and push it.
- **Update memory** (`memory/wayfinder-gamified-tracker-map.md` + the `MEMORY.md` index line) at the end with final state.

## Context pointers

- **T2 schema (author against this):** `docs/superpowers/wayfinder/2026-07-14-T2-scope-model-schema.md`
- **T1 catalogue + ahead-world-bleed table:** `docs/superpowers/wayfinder/2026-07-14-T1-foundation-catalogue.md`
- **Map body** (Destination · Notes · Decisions · Not-yet-specified · Out-of-scope): `gh issue view 105`
- **Frontier:** T3 #108, T4 #109, T5 #110, T6 #111 — all open, unblocked, unclaimed.
- **Full effort record + reusable "gamify-my-repo" skill notes:** `docs/superpowers/handoffs/2026-07-14-wayfinder-gamified-tracker-map.md`
- **Memory:** `memory/wayfinder-gamified-tracker-map.md`

---

## Paste-in prompt for the next session

> Handoff: `docs/superpowers/handoffs/2026-07-14-wayfinder-full-run-to-tracker.md`
>
> I'm AFK for this whole session and you're on Fable — orchestrate it end-to-end. Go **all the way**: resolve every remaining wayfinder ticket on map #105 (T3 #108, T4 #109, T5 #110, T6 #111), then run `to-spec` → `to-tickets`, then **execute** — write the real `docs/scope-model.yaml` and build the localhost tracker/renderer in a sibling folder outside the repo, and verify it runs. This deliberately overrides wayfinder's one-ticket-per-session and plan-only defaults (authorized in the handoff + the map's Notes). Hold the line on **capture-don't-resolve** — never invent my pricing/positioning/country-order/ad strategy; those become `needs-decision` quests. Conserve Fable quota: delegate decomposition, the mock, and the build to opus/sonnet subagents; you orchestrate and make the taste calls. Read the handoff for the phase plan, guardrails, and model routing before starting.

---

## ✅ RUN COMPLETE (2026-07-14→15) — all four phases done in one session

- **Phase A:** T3/T4/T5/T6 all resolved + closed (3 opus subagents in parallel + T6 by the orchestrator); assets in `docs/superpowers/wayfinder/`; map #105 body updated, fog empty.
- **Phase B/C:** spec #119 → slices #120/#121/#122 (all `ready-for-agent`, published in dependency order).
- **Phase D:** `docs/scope-model.yaml` on `main` @ `58c4fc4` (56 quests · 7 worlds · 14 needs-decision · issues #1–#122 each bound exactly once); tracker built at `Repos\red-tracker` and **driven end-to-end** (arc 39%, inbox caught 9 real unmapped issues #123/#128–#135 filed mid-session by the single-email-activation effort). #119–#122 closed.
- **Open residue (owner):** map #105 stays open for the "in use" walk — double-click `Repos\red-tracker\track.bat`. `config.json` reads the model from this worktree until the primary checkout's diverged `main` (unpushed perf-50ms commits, ahead 6 / behind 6+) is reconciled — then flip `modelPath` to `../RED-2.0/docs/scope-model.yaml`. The 9 inbox issues want a `quest:*` label or a new quest block.
- **Capture-don't-resolve held:** no pricing/positioning/country-order/ad/support/Meta-agent/caching strategy decided anywhere; all live as `needs-decision` quests in the model.
