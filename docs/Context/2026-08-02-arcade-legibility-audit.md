# Arcade legibility audit — measured in a real browser with the owner

> Ticket #196 on map #191. Run 2026-08-02 against a fresh snapshot (202 issues, 35 unmapped-open),
> `arcade.html` 327,903 B, all six gates green, `check-emit` PASS.
> Viewport 1683×1051, Chrome, served over `http://localhost` (rendering identical to `file://`).
> **This is the first time in the tracker's history that anyone has opened a skin and measured it.**
> The 2026-07-30 cross-examination's first blind spot: *"Nobody opened either skin in a browser.
> All eight lenses read source."*

---

## 1. The headline

`SPEC-panel-arbol.md` §8 asserts: *"`arcade.html` after this spec answers 1–8."*

**Measured: it answers 1 of 8 cleanly.** The owner walked all eight jobs on live data in 5–10 minutes.

| # | job | result |
|---|---|---|
| 1 | What's next? | **WRONG ANSWER** — surfaced `#190`, work already completed by another session |
| 2 | Where are my loose ends? | **NOT SERVED** — question not parseable to the owner; the real need is a hierarchy the arcade does not render (see §4) |
| 3 | What is this issue's state? | **PARTIAL** — reached only by manually scrolling a 3,562 px column hunting a number. **There is no search affordance anywhere in the arcade** |
| 4 | Waiting on me or an agent? | **PASS** — the one clean pass. Answered instantly and correctly |
| 5 | Read the full description in-skin | **FAIL** — title only. `refresh.mjs:164` fetches no `body` (standing decision D1, unruled since 2026-07-30) |
| 6 | Compare several at once | **FAIL** — owner, verbatim: *"how the heck am I supposed to do that?"* No mechanism exists |
| 7 | Reach the GitHub issue in one action | **PARTIAL** — works, but the affordance is undiscoverable. Owner clicked the row; the only target is a **15.7 × 16.0 px `↗` glyph (≈251 px²)**, below WCAG 2.2 AA's 24 px minimum and far below the 44–48 px platform guidance |
| 8 | Create a new issue | **FAIL** — owner: *"don't know how to from the tracker."* The link **exists**, landed in the 2026-08-01 fix wave, and is pinned by `check-viewmodel.mjs:261` `new-issue-url`. It sits at **97% of the scroll depth**, 3,447 px down |

**Job 8 is the sharpest single result in this audit: a feature that is implemented, gated, and green,
that the owner cannot find.** The gate proves the URL is correct. Nothing proves it is reachable.
This is the same class of defect `HANDOFF-panel-arbol.md` §7 already documented — the DOM stub has no
layout engine, so a green assertion claimed the panel "grows with content" for months while the column
is a fixed 366 px.

## 2. Measured layout — where the screen goes

| metric | value |
|---|---|
| map share of viewport width | **66%** (1,108 px of 1,683) |
| total information the map renders | **7 realm names + 7 percentages** — 14 data points across two-thirds of the screen |
| panel width | 366 px, fixed |
| panel scroll height | **3,562 px = 3.4 full screens** |
| inbox rows | 35, spanning **2,613 px** |
| inbox rows visible at cold open | **4 of 35** |
| search inputs in the entire page | **0** |
| any date, timestamp or relative age | **0 — the page cannot state its own age** |
| realm labels clipped mid-word *on the cold open* | **3** — `MONETIZATIO`, `GO-TO-MARKE`, and `CUSTOMER`, which silently dropped the word "SUPPORT" |

**The allocation is inverted.** Two-thirds of the screen renders 14 numbers readable in two seconds;
one-third holds 3.4 screens of everything actionable in a 366 px column with no search. That is the
concrete, measured shape of the owner's complaint: *"I take more time understanding the damn thing than
actually using it."*

**The three clipped labels are the exact defect #176 was filed against** (`PROOF FIR` / `SALES MOTI` /
`BRAND IDEN`), still shipping, on the first screen. GROWTH-1 §4 already specifies the
`shortLabelFor` hardening that fixes it.

## 3. Queue composition — half the queue is the tracker

Of 35 inbox rows, **18 are wayfinder tickets** — 12 from map #191, 6 from map #180. Sorting is
strictly newest-first (`b.number - a.number`), so:

- `#166`, `#167`, `#168` — **two of them live billing defects**, filed 2026-07-29, still unlabelled
  four days later — sit at rows **28, 29 and 30 of 35**, roughly **2,800 px down the scroll**.
- They carry the chip `SIN TRIAGE`, **visually identical** to the research tickets stacked above them.

**Nothing on this surface distinguishes "money is leaking" from "someone should categorise this."**
The cross-examination predicted the recurrence of this failure mode on 2026-07-30 and it has recurred,
unchanged, in the audit of the tracker meant to prevent it.

## 4. What job 2 actually revealed — the real requirement

The owner could not parse "where are my loose ends," which is itself a finding: it is spec jargon, not
language the owner thinks in. What they said instead is the most important content of this audit,
verbatim:

> *"I want to be able to view it, intuitively understand **which issues correspond to which parent PRD**,
> what is the actual **scope of the whole family of issues (the realm)**, and **which other PRDs would
> correspond to this realm too**. Right now the current scope is usable, but I have to be clicking on
> track.bat for the issues to be represented, but **they are not always mapped correctly**. For which
> using the arcade tracker makes not much sense to use."*

**The job is containment and belonging, not queueing.** Given an issue: what family does it belong to?
Given a realm: what is actually in it, and which other PRDs share it?

This is decisive for #198, and three independent lines now converge on it:

1. **The arcade already has this shape** — realm → district → quest → issue — **and renders it empty**,
   because 35 of 35 open issues bind to nothing. The structure is right; the membership is missing.
2. **GitHub already maintains this natively** — parent/sub-issue links, live today, 20 of them across
   maps #180 and #191 (ticket #193). `refresh.mjs` does not read them, though `parent_issue_url` and
   `sub_issues_summary` ride free on `gh api .../issues` under the existing token scope.
3. **Wayfinder already works this way** and is the tracker the owner actually uses (ticket #194).

The owner's own diagnosis — *"the tracker is not autonomous"* — names the mechanism. The hierarchy is
not wrong; **nothing populates it without the owner.**

## 5. Two defects that are not legibility at all

**5.1 — Completion is never recorded, so "what's next" is wrong at the source.**
The owner's answer to job 1 was `#190`, immediately followed by *"but 190 has already been addressed by
a different session."* **Verified: `#190` is still `OPEN` on GitHub, `closedAt: null`.** The arcade
rendered GitHub faithfully. GitHub is the stale source — the work shipped and nobody closed the issue.

No renderer change can fix this. It is the issue-level instance of the cross-exam's blind spot
*"nobody asked what happens when a quest is done"*, and it makes the tracker's primary job return a
confidently wrong answer. **Routed to #201 (the automation contract): what marks work complete.**

**5.2 — The snapshot cannot admit its own age.**
`#192`, `#193`, `#194`, `#195` and `#197` were closed ~90 minutes after the refresh and **all five still
render as open**, with no timestamp anywhere for the page to disclose it. Distinct from 5.1: this one
*is* staleness, and it *is* fixable in the skin. `shell.mjs` already writes
`arcade.lastSeen = {generatedAt, worlds}` on every load — the substrate exists, the render does not.

**Corollary that outranks both:** job 5 failed not merely because the body is missing, but because of
what the owner said next — *"didn't even remember about this issue, it appears as pending work, ready
for agent, but no clue if I have done it already."* D1 is not a reading-convenience decision. **Without
the body, the owner cannot distinguish outstanding work from finished work.**

## 6. Comprehension debt — the vocabulary that must be learned before anything can be read

Present on the cold open, with **zero legend anywhere in the page**: fog/cloud cover · red brazier
markers · `!N` marks beside realm names · castle size variation · biome ground colour · bar widths ·
`▸` disclosure triangles · `10/14 GANADAS` · `AVISOS 4 — HILOS ABIERTOS` · and three status chips
(`TE TOCA A TI` / `LISTO PARA AGENTE` / `SIN TRIAGE`) whose distinction is undocumented on-screen.

**Ten symbol systems, no legend.** Ticket #195 independently reached the same conclusion from prior art
and found fog itself is genre-standard and *not* the tax — the unexplained five-symbol vocabulary is.

## 7. What survives — do not break these

- **The wait axis is the one thing that works.** Job 4 was answered instantly and correctly. It is
  cheap, derived from labels already in the snapshot, and it is the single most successful feature in
  the tracker's history. Whatever #198 rules, it survives.
- **The honesty discipline holds.** Nothing over-claimed progress at any point in the walk.
- **`gh` link-out works** once found — the URL template is correct on all 35 rows.

## 8. What was dropped

- **No stopwatch per job.** The owner reported 5–10 minutes total and qualitative friction; per-job
  timings were not captured. Deliberate — precise timings on n=1 would be false precision, and the
  failure/pass verdicts are unambiguous without them.
- **Interior realms were not walked.** The audit covered the cold-open overworld and panel only. Whether
  comprehension cost differs inside a realm is unmeasured.
- **Only one participant, one session, no repeat.** Every number here is n=1.
- **`index.html` was not walked for comparison**, so "is the plain skin better?" is unanswered here.
  Ticket #195 addresses it from prior art; a head-to-head remains unrun.
- **Rendered over `http://localhost`, not `file://`.** Rendering is identical; the double-click launch
  path itself was not timed.
