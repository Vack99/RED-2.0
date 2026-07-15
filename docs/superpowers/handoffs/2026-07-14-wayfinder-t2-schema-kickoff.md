# Handoff — Wayfinder map #105: resolve T2 (scope-model schema)

**Date:** 2026-07-14 · **Map:** [#105](https://github.com/Vack99/RED-2.0/issues/105) · **This ticket:** [T2 · Design the scope-model schema, file format & repo location (#107)](https://github.com/Vack99/RED-2.0/issues/107) · **Status:** 1 of 6 tickets resolved (T1 done)

---

## TL;DR

- **T1 is done.** The Foundation is catalogued and — crucially — T1 **already delivered the schema shape** T2 must design against. Your job is not to invent a schema from scratch; it's to **lock the concrete decisions** (format, fields, file layout, location) with the owner, using T1's shape as the draft.
- **T2 is HITL grilling.** It resolves *with the owner*, one question at a time. **Never answer the owner's side yourself.** If the owner isn't available, don't proceed — pick nothing and stop.
- **T2 is the bottleneck.** T3, T4, and T6 are all blocked by it. Closing T2 opens the rest of the map. (T5 is the only other unblocked ticket and runs independently in its own session.)
- **Design only — don't build the file.** T2 decides the schema/format/location; the actual scope-model file gets *written* later in the execution tail (`to-spec` → `to-tickets` → build). T2's deliverable is the **decided schema**, not populated data.

---

## The one move (resume steps)

1. **EnterWorktree** by path `.claude/worktrees/wayfinder-tracker` (you're likely already in it — the effort lives on this worktree; docs fast-forward to `main`).
2. Invoke the **`wayfinder`** skill (this is "work through the map" mode).
3. Load context: this handoff · the map body (`gh issue view 105`) · **T1's answer** — the schema shape — at [#106's resolution comment](https://github.com/Vack99/RED-2.0/issues/106#issuecomment-4975081452) and the full asset [`docs/superpowers/wayfinder/2026-07-14-T1-foundation-catalogue.md`](https://github.com/Vack99/RED-2.0/blob/main/docs/superpowers/wayfinder/2026-07-14-T1-foundation-catalogue.md).
4. **Claim T2 first:** `gh issue edit 107 --add-assignee @me` (before any work).
5. Grill the owner via **`grilling`** + **`domain-modeling`** (consult **`keep-it-lean`** so the schema stays minimal). One question at a time.
6. Resolve: comment the decided schema on #107 → `gh issue close 107` → append a one-line pointer to map #105's *Decisions so far*. Closing T2 auto-unblocks T3/T4/T6 (native blocking).

---

## What T2 must decide (the grilling agenda)

T1 handed you the **shape**; T2 pins the **form**. The concrete decisions to land:

**A. File format & layout**
- **Format:** YAML vs JSON vs Markdown-with-frontmatter. Drivers: (1) hand-authorable by the owner, (2) trivially parseable by the **outside renderer** (JSON/YAML win; MD needs a parser), (3) inert to the repo gate (see inertness check below).
- **One file or many** — a single master file vs one file per world. T1's catalogue fell out naturally as per-world → per-subgroup → quests; either shape can hold that.
- **Exact location under `docs/`** — the map locked "inert data file under `docs/`". Pick the path (e.g. `docs/scope-model.yaml`, `docs/scope-model/`, …). The T1 asset sits at `docs/superpowers/wayfinder/`; the *model* is a separate, owner-facing data file.

**B. The quest schema (design against T1's 7 revelations — don't re-derive)**
- **Nesting:** world → subgroup → quest (two levels — T1 found one level loses the grain).
- **Status enum (~6 values, not done/todo):** `shipped`, `shipped-with-open-threads`, `in-flight`, `deferred`, `needs-decision`, `open/todo`, `blocked`. Confirm the final set + names.
- **Derivation tag:** `engineering` (auto from GitHub closed/total) vs `business` (hand-set). Decide how the **`github` reference** is shaped — a single issue? a label (e.g. `platform-phase5-agenda-2026-07`)? a list/range? an epic that sub-issues roll up? T1's proof spanned all of these, so this field must handle more than one URL.
- **`evidence[]`:** heterogeneous, typed list (issue, migration, commit, branch, ADR, runbook, audit doc, memory file) — not a single link.
- **`depends_on[]`:** quest→quest edges, incl. cross-pillar (the destination wants *sequenced* quests; sequencing likely = these edges, maybe + an explicit order).
- **Open-threads / caveats:** first-class on a quest *and* a world (or the tracker over-claims "done").
- **Earned-ahead:** a quest can live in an ahead world (2–7) with `status: shipped` — needed so the ahead-world-bleed T1 found isn't mislabeled todo.
- **HITL gates as a kind:** exit-gate quests (#9/#16/#28/#35/#47/#63/#88) close issues but their status is owner-set, not derived from child closure. Model `kind: gate` (or equivalent) + an `owner_action` field.
- **Fields per quest (T1's set):** `id/slug`, `title`, `what`, `world`+`subgroup`, `status`, `derivation`, `github`, `evidence[]`, `depends_on[]`, `owner_action`, `dates`.

**C. The load-bearing tension to grill hardest**
> The model must be **rich enough** to hold T1's real shape (nesting, typed evidence, enums, edges) yet **simple enough** to hand-author and for a tiny outside renderer to parse. Where those fight, the owner decides. `keep-it-lean`: cut any field that doesn't earn its place in the *tracker's* display or the *derivation*.

---

## Inertness re-verify (the one thing T1's charting hand-waved)

The map claims the data file is "provably untouched by eslint/tsc/vitest/turbo/Vercel." That was verified for those. **Not yet checked: the Husky pre-commit `lint-staged`/Prettier step.** Before locking the location/format, confirm against `.husky/pre-commit`, the `lint-staged` config, and `.prettierignore` whether Prettier would reformat a `.yaml`/`.json`/`.md` in the chosen `docs/` path. It won't *fail the gate* (cosmetic only), but the owner should know if the file gets auto-reformatted on commit — or add it to `.prettierignore`. This is a real, small decision, not a blocker.

---

## Framing constraints (from the map — don't relitigate)

- **Inert data-in / renderer-out split:** model = inert file in RED-2.0; renderer = sibling folder *outside* the repo. Zero config changes to RED-2.0.
- **Whole arc:** shipped Phases 1–7 (earned) *and* everything ahead to "sellable across LatAm."
- **Capture, don't resolve:** pricing / revenue-cut / country-order / ad-spend become `needs-decision` quests — never decided here.
- **Hybrid derivation:** engineering bars from `gh` (closed/total); business hand-set. No double bookkeeping.
- **7 worlds:** Foundation · Sellable Product · Monetization · Growth & Reach · Go-To-Market · Customer & Support · LatAm Expansion.
- **Refer by name** in everything the owner reads (ticket titles, not bare `#numbers`).

---

## After T2 resolves

- **Frontier opens to T3 (#108, product-ahead worlds 2·3·4), T4 (#109, business worlds 5·6·7), and T6 (#111, tracker tech).** All three become runnable (any order), each in its own session, one ticket per session.
- T5 (#110, prototype the look) remains independently available.
- T3/T4 will consume T2's schema to enumerate quests — and must mark T1's **ahead-world-bleed** items *earned*, not todo (that signpost is in the map's *Not yet specified*).
- The map clears when T2–T6 are all resolved; then `to-spec` → `to-tickets` → the execution effort writes the file + builds the tracker.

## Housekeeping

- Docs land on `main` via clean fast-forward (T1 + handoffs already there, `origin/main @ f92fa4a`). Your local `main` in the *primary* worktree may be one FF behind — `git pull --ff-only` there when convenient.
- Full effort record + reusable "gamify-my-repo" skill notes: `docs/superpowers/handoffs/2026-07-14-wayfinder-gamified-tracker-map.md`.
