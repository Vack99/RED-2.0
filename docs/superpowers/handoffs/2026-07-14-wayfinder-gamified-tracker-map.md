# Handoff — Wayfinder map: RED 2.0 gamified scope tracker

**Date:** 2026-07-14 · **Map:** [#105](https://github.com/Vack99/RED-2.0/issues/105) · **Status:** map charted, **0 tickets resolved**

---

## TL;DR — read this before assuming anything

- **What exists:** a wayfinder **map** (#105) + **6 investigation tickets** (#106–#111). These are *questions to resolve*, not implementation slices.
- **What does NOT exist:** no full spec, no build-slices, **no scope-model content written**, **no tracker built**. The quest lists that the tracker will display are *produced by resolving T3/T4* — they aren't written yet.
- **The next session's job:** resolve **exactly one ticket** (wayfinder's hard rule). Start with **T1 (#106)** — it's AFK, needs no owner input, and unblocks the most.
- **Execution comes last:** only after the whole map clears do we `to-spec` → `to-tickets` → actually write the inert scope file + build the tracker.

---

## What this effort is (destination)

> A complete, sequenced **scope model** of RED 2.0's whole arc — the shipped foundation (Phases 1–7) **and** everything between today and **"RED is sellable across Latin America"** — living as an **inert data file inside the repo** (no eslint/tsc/vitest/turbo/Vercel ever reads it), decomposed into named/sized/sequenced quests **without resolving the strategy inside them**; plus a **gamified localhost HTML tracker in a sibling folder _outside_ the repo** that renders the model read-only and derives engineering progress from GitHub. Done when the model is populated, the tracker renders it, and the owner is using it.

### The 7 locked framing decisions (grilled this session)

1. **Both** the scope model *and* the tracker are the destination — neither works alone.
2. **Split, so the project stays untouched:** scope model = inert `docs/` data file (YAML/MD — no tool in the repo reads it); renderer = sibling folder *outside* the repo (like `Repos/autoskills-library`). **Zero** config changes to RED-2.0; never deployed.
3. **Whole arc:** model covers shipped Phases 1–7 (earned foundation) *and* everything ahead — so the tracker can show how far it's already come.
4. **Capture, don't resolve:** decompose every pillar into trackable quests, but do **not** decide pricing / member-payment cut / country order / ad spend. Those live in the tracker as `needs-decision` quests, each resolved later in its own effort. This is what keeps the map finishable.
5. **Hybrid derivation:** engineering leaves carry a `github:` link → bar derives from `gh` (closed/total). Business leaves carry hand-set status. No double bookkeeping.
6. **This effort carries execution to the end** (Notes override of wayfinder's plan-only default): once the map clears, a thin execution effort writes the file + builds the tracker. T1/T3/T4 *produce* the content as their answers, so execution is mostly assembly.
7. **Gamified & visual by intent** (owner's words): emojis, graphs, cool animations, "very visual," "a bit gamified," "checking off the ones we ship." The *exact* visual/game language is deliberately deferred to the T5 prototype.

---

## The map as shipped to GitHub

**Map [#105](https://github.com/Vack99/RED-2.0/issues/105)** (`wayfinder:map`) holds the destination, the 7 decisions, the 7 worlds, and the fog (Not-yet-specified / Out-of-scope).

| Ticket | Type | Blocked by | Job (a *question*, not a build) |
|---|---|---|---|
| [T1 #106](https://github.com/Vack99/RED-2.0/issues/106) | research (AFK) | — 🟢 | Read roadmap + memories + closed issues → enumerate Phases 1–7 as completed quests. Reveals the natural schema shape. |
| [T2 #107](https://github.com/Vack99/RED-2.0/issues/107) | grilling | T1 | Design the scope-model schema, file format, exact inert `docs/` location. |
| [T3 #108](https://github.com/Vack99/RED-2.0/issues/108) | grilling | T2 | Decompose product-ahead worlds (Sellable Product · Monetization · Growth) into quests. |
| [T4 #109](https://github.com/Vack99/RED-2.0/issues/109) | grilling | T2 | Decompose business worlds (Go-To-Market · Support · LatAm) into quests. |
| [T5 #110](https://github.com/Vack99/RED-2.0/issues/110) | prototype (HITL) | T1 | Prototype the look & gamification language — owner picks from a real mock. |
| [T6 #111](https://github.com/Vack99/RED-2.0/issues/111) | grilling | T2 | Decide tracker tech + how it's launched on localhost. |

**Dependency graph:** `T1 → T2 → {T3, T4, T6}`, and `T1 → T5` in parallel.
**Frontier right now:** **only T1 (#106).**

### The 7 worlds (top-level pillars — the agreed cut)

1. 🏗️ **Foundation** *(shipped)* — Phases 1–7: monorepo, multi-tenant tracer, RLS, brand system, Agenda, client app, harden.
2. 🛒 **Sellable Product** — commercial/marketing site, gym self-serve onboarding, member self-registration completion.
3. 💳 **Monetization** — Stripe subscriptions (gyms→us), Stripe Connect (gyms→their members), billing/dunning/invoices.
4. 🚀 **Growth & Reach** — SEO, analytics/tracking, caching/performance.
5. 📣 **Go-To-Market** — RED's own brand/image, positioning & selling points, ads + ad strategy, marketing content.
6. 🎧 **Customer & Support** — support integration, Meta-agent (WhatsApp/IG) client mgmt, contact channels.
7. 🌎 **LatAm Expansion** — country sequencing, per-country localization (currency/tax/legal), local payment methods.

---

## Game & visual profile scoped so far

This is what's **decided** vs. **deferred** on the "gamified" front — important, because the owner wants to reuse this profile as a skill.

**Decided (the frame):**
- **Metaphor:** the project is a game world map. Pillars = **worlds**; work items = **quests**; the shipped foundation = **already-earned** territory (visible progress, not a blank slate).
- **Progress = two-source:** engineering quests auto-derive completion from GitHub (closed/total → a real progress bar, free); business quests are hand-set. `needs-decision` is a first-class quest state (honest about what's undecided).
- **Feel (owner's brief):** very visual, emojis, graphs, cool animations, satisfying "check off what we ship," light gamification — *not* a spreadsheet.
- **Time axis:** whole arc — you can see both the mountain climbed (Phases 1–7) and the mountain ahead.

**Deferred to T5 (prototype) — do NOT invent these now:**
- The *specific* mechanics: XP / levels / badges / streaks vs. a clean progress-dashboard-with-personality. (Appetite confirmed; exact mechanic is a prototype-and-pick.)
- The visual language: palette, typography, world-map layout vs. card grid, animation set.
- These get decided by reacting to a real mock (via `/prototype` + `frontend-design` + `dataviz`), not by description.

**Deferred to T6 (tech):**
- Single self-contained HTML vs. tiny Vite app; how it reads the scope file + `gh` status (live vs. pre-generated JSON snapshot); the exact localhost launch recipe (open file? one command? `.bat`?).

---

## How we charted it (process record)

1. **Named the destination** via `/grilling` — resolved: both-are-the-destination, the in/out split, whole-arc, capture-don't-resolve, hybrid derivation. Each was put as a single decision with a recommendation.
2. **Verified the blast radius against reality, not vibes** — read `pnpm-workspace.yaml` (workspace = `apps/*`+`packages/*` only), `turbo.json`, root `package.json` (gate = `eslint .` + root `tsc` + `vitest run`), `.dependency-cruiser.cjs`, `.husky/pre-commit`. Conclusion: **non-JS/TS files in `docs/` are swept by nothing**; a JS/TS file anywhere is swept by the gate → hence data-in-repo / renderer-outside.
3. **Proposed the 7 worlds + 6-ticket plan in prose**, got a go, then wrote to GitHub: created `wayfinder:*` labels, the map, 6 child tickets (native sub-issues via `gh api .../sub_issues`), and blocking edges (native dependencies via `gh api .../dependencies/blocked_by` using each blocker's **database id**, not `#number`).
4. **Stopped** — charting is one session; resolving tickets is later sessions, one at a time.

---

## Next-session handoff — exactly what to load & do

**To resume:** open a fresh session, say *"work the wayfinder map #105"* (or just *"work the wayfinder map"*).

**Context to load:**
- This handoff.
- Map body: `gh issue view 105 --comments`.
- The ticket you'll work: `gh issue view 106 --comments`.
- For T1 specifically: `docs/archived-files/2026-06-29-multi-gym-platform-roadmap.md` + the auto-memory index (`memory/MEMORY.md`) + `gh issue list --state closed`.

**The one move (T1, AFK — no owner needed):**
1. `gh issue edit 106 --add-assignee @me` (claim first, before any work).
2. Read roadmap + memories + closed issues; produce a markdown asset enumerating Phases 1–7 as completed quests (one-line what-shipped + the initiative label/issue range that proves each + natural grouping).
3. Resolve: comment the answer on #106, close it, append a one-line pointer to the map's **Decisions so far**.
4. Graduate any newly-specifiable fog into tickets if needed (unlikely for T1).

**Then, subsequent sessions (one ticket each), in unlocked order:**
- T2 (#107) — grill the schema with the owner (uses T1's shape).
- T5 (#110) — `/prototype` the look with the owner (parallel to T2).
- T3, T4, T6 — after T2, in any order.

**When the map is fully clear:** run `/to-spec` on the resolved route → `/to-tickets` → an execution effort writes the inert scope file in `docs/` and builds the tracker in the sibling folder. RED-2.0 config/build/deploy stays untouched throughout.

---

## Reusable pattern (for the "gamify-my-repo" skill the owner wants)

The owner wants to extract this into a **skill runnable in any repo**. The generalizable core:

**Concept:** turn any repo's roadmap into a *gamified, visual, localhost progress tracker* — worlds (pillars) → quests (work) → XP/earned-territory — without touching the repo's build or deploy.

**The load-bearing design decisions that generalize (skill should encode these as its spine):**
1. **Data-in / renderer-out split.** The scope model is an **inert data file committed to the repo** (any format the repo's tooling ignores — e.g. `docs/*.yaml`). The renderer lives **outside** the repo (sibling folder), reads the file + the tracker read-only. → *Skill must first probe the repo's gate* (workspace globs, lint/typecheck/test scope, build inputs) to prove the data file is inert. This probe is repo-specific; the *conclusion* (put data where nothing reads it) is universal.
2. **Hybrid progress derivation.** Engineering quests link to the repo's issue tracker and derive completion automatically (closed/total); non-engineering quests carry hand-set status; `needs-decision` is a valid state. → Skill needs a tracker adapter (GitHub `gh` here; generalize to the repo's configured tracker).
3. **Capture, don't resolve.** Decompose pillars into *named/sized/sequenced* quests; never force strategy decisions to build the tracker. Undecided work is *visible*, not blocking.
4. **Whole arc.** Include already-shipped work as earned territory — the "how far we've come" is half the motivation.
5. **Prototype the game language, don't spec it.** The XP/level/badge/visual choice is a react-to-a-mock decision (`/prototype` + `frontend-design` + `dataviz`), never invented in prose.
6. **Chart with wayfinder, don't big-bang it.** The taxonomy + schema + look + tech are each a *decision ticket*; resolve one at a time so the scope model is discovered, not guessed.

**Repo-specific vs. reusable, for the skill:**
- *Reusable:* the 6-decision spine above; the world→quest→XP model; the two-source progress rule; the inert-data probe *method*.
- *Repo-specific (skill computes per-repo):* the actual gate config, the issue-tracker adapter, the pillar taxonomy, the shipped-work catalogue, the visual language.

**Skill-authoring note:** build it with `write-a-skill`. Likely shape — a process skill that (a) probes the repo's gate to place the inert file, (b) runs a wayfinder-style charting of worlds/quests, (c) scaffolds the sibling-folder renderer from a template, (d) wires the tracker adapter. The RED-2.0 run (#105 and its resolved tickets) is the reference implementation to generalize from — revisit it once the map clears and the tracker actually exists.
