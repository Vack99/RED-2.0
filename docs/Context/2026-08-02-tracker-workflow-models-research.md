# Proven workflow models for running a tracker day to day — research for #192

> Part of wayfinder map [#191](https://github.com/Vack99/RED-2.0/issues/191). Resolves
> [#192](https://github.com/Vack99/RED-2.0/issues/192): *"How do people actually run an issue
> tracker day to day, and which model fits a solo owner whose issues are essentially all
> agent-filed?"*
>
> Method: `finding-the-standard` skill — RESEARCH act only. Primary sources over vendor blogs;
> anything sourced to whoever sells the model is tagged **[VENDOR]**. The incumbent
> (GitHub-native conventions / Jira) is ranked, not assumed inferior. **The ranking is the
> deliverable**, not a survey. All in-repo counts are taken from the pinned snapshot
> `red-tracker/.snapshot-2026-08-02.js` (**74 quests / 202 issues / 35 unmapped-open**) so this
> ticket shares a clock with the three concurrent research tickets; no live counts were queried.
> The 84-issues-in-16-days / 0-of-84-bound figures are as stated in this ticket's own brief and
> in #191's 2026-08-01 charting session — restated here, not re-measured.

## 0. Scope and what this does not cover

This ticket covers **named workflow models**: Kanban, Scrum, Shape Up, GTD, and the
Linear/Height/Basecamp/Jira family of tool conventions. Three sibling tickets on the same map
cover adjacent ground and are not duplicated here:

- **#193** — what GitHub's own native primitives (Projects v2, sub-issues, dependencies) already
  do. This document treats "the incumbent" as *storage* (GitHub Issues, already ruled) and asks
  only what workflow model should be layered on it; #193 owns whether GitHub's UI already renders
  that model for free.
- **#194** — why wayfinder's own map→ticket→frontier system is the tracker that already gets
  used. This document notes the structural resemblance where it's load-bearing to the ranking
  (§5) but does not re-derive #194's answer.
- **#195** — gamified/spatial tracker prior art and the fog-of-war/aesthetic question. Not covered
  here at all; this document is about the *ordering and selection* logic underneath any skin, not
  the skin.

The MEASURE act for this question was already supplied by #191's charting session and the pinned
snapshot; nothing in this repository was re-measured to write this document.

## 1. The five models, primary source first

For each: source and vendor tag, the unit of work, its states, what "next" means, and what the
model enforces that a flat list cannot.

### Kanban (Toyota origin → David J. Anderson's Kanban Method)

- **Sources.** Origin: Toyota's pull-based production scheduling system, 1940s–1970s (documented
  in Taiichi Ohno's own account of the Toyota Production System). Software adaptation: David J.
  Anderson, *Kanban: Successful Evolutionary Change for Your Technology Business* (2010) —
  [PRIMARY, but Anderson also runs Kanban University and sells certification through it
  (kanban.university, djaa.com); tag any claim sourced only to those sites **[VENDOR]**].
- **Unit of work:** a card. **States:** an explicit, visualized workflow (as many columns as the
  work needs) with an explicit **WIP limit** on each column. **"Next"** = *pulled*, never pushed —
  a worker takes the next card only when a column has open capacity.
- **What it enforces that a flat list can't:** the WIP limit itself. A flat list has no ceiling —
  nothing stops 35 open items sitting at "todo" simultaneously. A WIP limit makes "too much in
  flight" a visible, blocking condition instead of an invisible one.
- **Directly validated for solo use**, not inferred: Jim Benson & Tonianne DeMaria Barry,
  *Personal Kanban: Mapping Work | Navigating Life* (2011) [PRIMARY; Benson also runs a
  consultancy, tag lightly **[VENDOR-ADJACENT]**] — applies WIP-limit-plus-pull to individuals
  by name, no team required.
- **Says nothing about strategizing.** Kanban's own literature stops at "make policies explicit."
  There is no portfolio or priority layer. It answers *what do I do now* and is silent on *what
  should I be doing at all*.

### Scrum

- **Source:** Ken Schwaber & Jeff Sutherland, *The 2020 Scrum Guide*, scrumguides.org [PRIMARY —
  they invented it — but they also sell it: Scrum.org / Scrum Alliance certification is their
  commercial product. Tag anything beyond the Guide's own text **[VENDOR]**].
- **Unit of work:** a Product Backlog Item, pulled into a Sprint Backlog. **States:** the Sprint
  (a fixed timebox) plus four events — Sprint Planning, Daily Scrum, Sprint Review, Retrospective.
  **"Next"** = whatever the Developers commit to for the Sprint Goal, decided once at Planning.
- **What it enforces that a flat list can't:** a hard boundary around in-flight scope (nothing
  added mid-Sprint) and named accountability split across three **roles** — Product Owner, Scrum
  Master, Developers.
- **The roles are the load-bearing mechanism, and roles require distinct people.** At n=1,
  Planning/Review/Retrospective become one person narrating to themselves, and "the team commits"
  synchronizes zero actual disagreement. The word "solo" does not appear anywhere in the Guide.

### Shape Up (Basecamp)

- **Source:** Ryan Singer, *Shape Up: Stop Running in Circles and Ship Work that Matters*, free
  at basecamp.com/shapeup [**[VENDOR]** — Basecamp is a project-management SaaS company
  documenting its own internal practice, which is also its product's design philosophy].
- **Unit of work:** a "bet" — a pitch (problem, appetite, solution, rabbit holes, explicit
  no-gos) sized to a fixed **appetite** (e.g. six weeks), not an estimate. **States:** shaping
  (unscheduled raw material) → betting table (in the cooldown between cycles) → building (in a
  cycle) → shipped or killed. **There is deliberately no backlog** — unshaped raw material is not
  tracked as a growing list; most of it is left to die or resurface on its own.
- **"Next"** = decided at the betting table, a scheduled ritual that *is* the strategy mechanism —
  it forces an explicit "no" on everything not bet on.
- **Basecamp's own scaling guidance**, "Adjust to Your Size" [PRIMARY, same vendor tag]: at 2–3
  people, drop the formal cycle/cooldown/pitch/betting-table apparatus but keep the underlying
  discipline — shape before building, bet deliberately, say no to most things. This is Basecamp's
  own text, fetched directly for this document, and it explicitly stops at "2–3 people, everybody
  does a bit of everything" — **no primary Shape Up text addresses a single person.**

### GTD (David Allen)

- **Source:** David Allen, *Getting Things Done: The Art of Stress-Free Productivity* — Allen
  sells GTD certification/coaching through his own company; tag process claims sourced only to
  that org **[VENDOR]**; the book's core mechanics are the primary artifact and are treated as
  such here.
- **Unit of work:** the **next action** — the single physical, visible next step on an item,
  distinct from the "project" (anything needing more than one step) that contains it. **States:**
  a five-stage workflow — capture, clarify, organize (into context-tagged lists: Next Actions,
  Projects, Waiting For, Someday/Maybe), reflect (the Weekly Review), engage. **"Next"** = the
  Next Actions list filtered by context, available time and energy — a named list, not a status
  column.
- **The only one of the five natively built for a single person** — not scaled down from team
  practice, built for it from the start. It is also the only model that explicitly names and
  separates the two altitudes: the **runway** (next actions — tactical) versus the **Horizons of
  Focus** (10,000ft projects up through 50,000ft purpose/vision — strategic), reconciled by the
  **Weekly Review**, a ritual whose entire job is to connect the two.
- Adjacent academic field, not GTD-specific: William Jones, *Keeping Found Things Found: The
  Study and Practice of Personal Information Management* (2007) [**ACADEMIC**] — independent
  confirmation that individual-scale information/task organization is a studied problem distinct
  from team workflow, cited here as corroborating context, **not as a GTD efficacy study**. I did
  not find an independent, rigorous efficacy study of GTD itself; flagged as a gap in §6 rather
  than asserted either way.

### Linear Method / Height / Basecamp-the-tool / Jira conventions

- **Linear Method**, linear.app/method [**[VENDOR]** — Linear is a paid tool selling this as its
  design philosophy; fetched directly for this document]. **Unit of work:** a small, scoped
  Issue. **States:** **Triage** (an inbox for new/incoming issues, reviewed once before anything
  else happens to them) → Backlog → Cycle (Todo/In Progress/Done) → Archive. **"Next"** = pulled
  into the active Cycle during planning, from a **deliberately, aggressively pruned** Backlog
  ("you don't need to save every feature request or piece of feedback indefinitely").
  **What it enforces that a flat list can't:** the Triage state is the *one* mechanism among all
  five models built specifically to intercept new work **at the point of entry**, before it can
  silently become an unmanaged backlog. No solo/individual guidance exists anywhere in Linear's
  own docs — confirmed by direct fetch, team-shaped throughout.
- **Jira / Atlassian's own agile guides** [**[VENDOR]** — atlassian.com/agile, selling Jira]:
  backlog grooming as a recurring team meeting, issue ranking, and a "single source of truth" for
  a team's shared priorities (Atlassian's own phrase). Mechanically this is Scrum/Kanban
  implemented as software, and it inherits Scrum's exact failure mode at n=1: the value
  proposition is coordinating multiple people around one list; there is nobody to coordinate with
  alone.
- **Height:** searched directly; found only product marketing around AI-assisted "autopilot"
  triage, no primary methodology text distinct from Linear's mechanics. Dropped from deep
  treatment — see §6.
- **Basecamp-the-tool's Hill Charts** (distinct from the Shape Up book — a different
  visual-progress device inside Basecamp's own product): noted, not researched — see §6.

## 2. Which survive at 35 unmapped-open issues across ~6 concurrent efforts, solo

| model | survives solo? | why |
|---|---|---|
| **Scrum** | **No.** | Every enforcing mechanism (roles, ceremonies, team commitment) requires ≥2 people to do anything; at n=1 it is one person performing a dialogue. The Guide is silent on solo use. |
| **Jira / Atlassian conventions** | **No**, same reason. | It is Scrum/Kanban ceremony encoded as software; Atlassian's own stated value ("single source of truth for a team") is moot at n=1, independent of whether the storage stays GitHub Issues. |
| **Linear Method** | **Partially — by inference, not validated.** | Its mechanics (Triage gate, Cycles, aggressive pruning) are not team-specific in mechanism even though its own docs frame them for teams. No primary source validates solo use; this is a portability claim I am making, not one Linear makes. |
| **Kanban** | **Yes — directly validated.** | *Personal Kanban* is dedicated solo-use prior art. WIP limits are a self-discipline device that needs no counterpart to negotiate with. Strong on the tactical job; explicitly silent on the strategic one, by the model's own design. |
| **Shape Up** | **Yes, with ceremony stripped** — per Basecamp's own scaling appendix. | Keep shape-before-build and appetite-boxed, deliberate bets; drop cycles/cooldown/betting-table-as-formal-meeting. Uniquely strong on the *strategic* job (its whole mechanism is a scarcity-forcing "say no" device), but has zero primary-source validation below ~2 people, and its "no permanent backlog" instinct sits in tension with the owner's standing ruling that storage stays GitHub Issues. |
| **GTD** | **Yes — the only model built for one person from the ground up.** | Its native vocabulary already matches the owner's own two-job framing more closely than anything else found (§4). |

## 3. The genuinely new variable — an automated, non-human producer

**State plainly: none of the five named workflow standards has a producer/consumer distinction
at all.** Kanban's card, Scrum's backlog item, Shape Up's pitch, GTD's captured item, and
Linear's issue are all created by the same human(s) who complete them — every one of these
methodologies models a closed loop, not a one-way feed from an external system. I searched
Anderson's Kanban Method guide, the Scrum Guide, Shape Up, GTD, and Linear's Method docs
specifically for language addressing an external, automated ticket producer and found none. This
is a genuine silence in the named prior art, not an oversight in the search — say so rather than
invent a fit, per the ticket's own instruction.

The closest empirical analog is not a workflow methodology at all, but software-engineering
research on dependency-update bots (Dependabot / Renovate) — an automated producer generating a
continuous ticket stream for one or a few human reviewers:

- **[ACADEMIC/PRIMARY]** "Automating Dependency Updates in Practice: An Exploratory Study on
  GitHub Dependabot" (IEEE Transactions on Software Engineering; also on arXiv,
  arxiv.org/abs/2206.07230) — documents developers as "suspicious of" and reporting "notification
  fatigue" from bot-generated tickets; **11.3% of studied projects deprecated Dependabot** in
  favor of an alternative.
- **[LOW-CONFIDENCE — practitioner blog, not peer-reviewed]** a reported case of one team
  receiving ~200 bot PRs/week and "revolting," resolved by switching to Renovate's grouping
  feature, reportedly collapsing many bot tickets into fewer human-reviewed ones and saving
  ~15 hours/month. Included only as an illustrative anecdote, explicitly tagged below the
  academic finding.

**What this transfers to this project.** The empirical pattern in the bot-producer literature is
not "the human tracks harder" — it is that unfiltered automated volume gets muted, deprioritized,
or the tool is dropped, *unless something groups or filters at the point of entry*. That is
mechanically identical to what this ticket's own brief already reports: 0 of 84 agent-filed
issues bound to the taxonomy, 28 ghost labels never applied. This is not evidence that any one of
the five named models is wrong — it is evidence that the failure is orthogonal to which model is
chosen, and that **the one mechanism among the five models built for exactly this moment —
intercepting new items before they enter the working set — is Linear's Triage state.** That piece
is worth carrying into the ruling regardless of which model wins §5.

## 4. The two jobs — tactical tracking vs strategizing — one surface or two?

| model | one surface or two? | mechanism |
|---|---|---|
| **Kanban** | **One — tactical only.** | No strategic mechanism exists in the model at all; the board answers flow, not priority. |
| **Scrum** | Bundled into one continuous artifact. | Product Backlog *ordering* (strategic) feeds the Sprint Backlog (tactical), but both live on one list, and the strategic half is delegated to a role (Product Owner) that presumes a human distinct from whoever executes. |
| **Shape Up** | **Two, explicitly.** | The shaping pool / betting table is the strategic surface (what to bet on at all); the cycle is the tactical surface (build what was bet on). The betting table is a *scheduled ritual*, not a live view. |
| **GTD** | **Two, explicitly and by name.** | Horizons of Focus (strategic, altitude-based) versus Next Actions/runway (tactical), reconciled by the Weekly Review. This is the closest documented match found anywhere in this research to the owner's own words, *"tactical tracking, for strategysing my own work."* |
| **Linear** | **Effectively one.** | Triage/Backlog/Cycles are all tactical-flow surfaces; the Method's own text has no strategic/portfolio layer — that work is implicitly left to a separate "Projects"/roadmap feature and human leadership, not documented as part of "the Method." |

**Cross-model convergence, stated as a finding:** every model that answers the strategic job at
all — Scrum's Product Backlog ordering, Shape Up's betting table, GTD's Weekly Review — answers
it with a **bounded, recurring, scheduled human ritual**, never a live dashboard. No named model
proposes solving "what should I be doing at all" by making the tracker more real-time or more
detailed. They all insert a periodic, deliberately-slow checkpoint instead of a faster view.

## 5. Ranking against this project's actual shape

No single named model covers both jobs, at solo scale, on top of GitHub-Issues storage. The
strongest fit is a composite, ranked by which piece of the problem each model is uniquely good
at — not a menu, an ordering:

1. **GTD's altitude split (Horizons of Focus vs. Next Actions/runway) governs the two-surface
   question.** It is the only model whose own vocabulary already matches "tactical tracking" and
   "strategizing my own work" as two named things reconciled by one ritual, rather than one
   thing or three roles.
2. **Kanban's pull-under-a-WIP-limit governs the tactical surface.** It is directly validated for
   solo use (Personal Kanban) and it already has a working proof of concept in this repository:
   wayfinder's own computed "frontier" — issues with zero unresolved blockers — is structurally a
   pull-under-a-limit mechanism, which is a candidate explanation (not re-derived here; see #194)
   for why that surface gets opened daily and the arcade does not.
3. **Shape Up's scarcity discipline, stripped of ceremony, supplies content for GTD's Weekly
   Review.** GTD names the strategic ritual but says little about *how* to say no; Shape Up's
   entire mechanism is built for exactly that, against 35 unmapped items spread across ~6
   concurrent efforts.
4. **Linear's Triage state supplies the missing intake filter for the automated-producer
   problem (§3).** This is the one piece with no equivalent in Kanban, GTD, or Shape Up, and it
   is the direct fix for the specific failure this ticket's brief documents (0 of 84 agent-filed
   issues ever bound).
5. **Scrum — rejected.** Dies at solo; no primary source claims otherwise.
6. **Jira/Atlassian ceremony conventions — rejected**, for the same reason as Scrum, independent
   of whether storage stays GitHub Issues.

This is a ranked recommendation for the downstream ruling tickets on this map (**#198** "THE
RULING: pick the workflow model the tracker implements" and **#199**, the cross-examination
gate) to consume. It is not itself a locked ruling — per the skill this research runs under, the
owner rules, holding this evidence.

## 6. What was dropped, and why

- **Height** — marketing-only material found (an "autopilot" triage pitch); no primary
  methodology text distinct from Linear's mechanics. Dropped for low signal relative to search
  cost.
- **Basecamp-the-tool's Hill Charts** — a genuinely different visual-progress model from the
  Shape Up book, but outside the ticket's named list and this session's effort budget. Flagged,
  not researched.
- **Independent GTD efficacy research** — none found beyond the adjacent (not GTD-specific) PIM
  academic literature (Jones). Left as an open gap rather than asserted either way.
- **A full read of the Scrum Guide PDF** — relied on the official guide's own summarized
  structure plus well-established public description of its roles/events rather than a
  line-by-line primary read. The mechanics described here (roles, events, timeboxing) are
  low-risk, well-attested facts, but flagging the shortcut for the record.
- **Queueing-theory framing (e.g. M/G/1) for the automated-producer question** — considered,
  dropped as out of the "named workflow models" brief; the bot-producer literature in §3 already
  supplies a directly relevant empirical answer without it.
- **No new in-repo measurement was performed.** Every project-shape number here (74 quests / 202
  issues / 35 unmapped-open; ~6 concurrent efforts; 84 issues / 16 days / 0 bound) is taken from
  the pinned snapshot or restated from this ticket's own brief and #191's 2026-08-01 charting
  session — no live `gh` queries were run against RED-2.0 to produce this document.

## Sources

**Primary / primary-with-vendor-tag:**
- [The 2020 Scrum Guide](https://scrumguides.org/scrum-guide.html) — Schwaber & Sutherland
- [Shape Up: Stop Running in Circles and Ship Work that Matters](https://basecamp.com/shapeup) — Ryan Singer / Basecamp **[VENDOR]**
- [Shape Up — Adjust to Your Size](https://basecamp.com/shapeup/4.1-appendix-02) — Basecamp **[VENDOR]**, fetched directly
- [The Official Guide to The Kanban Method](https://kanban.university/kanban-guide/) — Kanban University **[VENDOR-ADJACENT]** (Anderson's own org)
- *Personal Kanban: Mapping Work | Navigating Life* — Jim Benson & Tonianne DeMaria Barry (book; publisher page: [kanbantool.com summary](https://kanbantool.com/kanban-library/books/personal-kanban-mapping-work-navigating-life))
- [Linear Method — Introduction](https://linear.app/method/introduction) — Linear **[VENDOR]**, fetched directly
- [Atlassian — Backlog grooming](https://www.atlassian.com/agile/project-management/backlog-grooming) — Atlassian **[VENDOR]**
- *Getting Things Done: The Art of Stress-Free Productivity* — David Allen (book; GTD org overview via [any.do summary](https://www.any.do/blog/getting-things-done-gtd-a-complete-beginners-guide-to-david-allens-system/))

**Academic:**
- [Automating Dependency Updates in Practice: An Exploratory Study on GitHub Dependabot](https://arxiv.org/abs/2206.07230) — He et al., IEEE Transactions on Software Engineering / arXiv
- *Keeping Found Things Found: The Study and Practice of Personal Information Management* — William Jones (2007)

**Low-confidence, tagged as such in-line:**
- [Renovate vs. Dependabot practitioner comparison](https://dev.to/alex_aslam/renovate-vs-dependabot-which-bot-will-rule-your-monorepo-4431) — DEV Community blog post, not peer-reviewed
