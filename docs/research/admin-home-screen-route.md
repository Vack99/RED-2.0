# Admin HOME screen — what belongs on it, and in what order

**Date:** 2026-08-16 · **Status:** RESEARCH COMPLETE, NOTHING RULED
**Method:** two independent research tracks run blind to each other — `/deep-research` (competitor
landscape, 6 subagents + verifier) and `/finding-the-standard` (measure → research → rank →
adversarial pass, 9 agents). Neither saw the other's output.

The question: we ship one admin home screen. Two designs compete — **Sample A** (action-first: live
class card + `Pasar lista` CTA at top, then MEMBRESÍAS, then a thin footer) and **Sample B**
(metrics-first: greeting + `ASISTENCIAS HOY` hero + sparkline + stat tiles + funnel row, *then* the
CTA — this is what ships today, `apps/admin/src/app/(app)/inicio/_components/inicio.tsx`).

---

## The headline: both samples are designed for one tenant, and the two live tenants are inverted

Measured live, read-only, last 30 days:

| gym  | clientes | asistencias | ventas | reservas | con cuenta |
|------|----------|-------------|--------|----------|------------|
| forge | 38 | 224 | 22 | 58 | 0 |
| **red** | **44** | **9** | **28** | 29 | **19** |

`forge` is attendance-dominant. **`red` runs ~3.1 sales per check-in — the exact inverse.** There is
no `homeVariant` and no brand-conditional layout; brand swaps the logo only. Every argument in this
document that leans on "attendance dominates" is a `forge` argument, and it does not transfer.

**This inversion was the deferred measurement. It flips the verdict, so it cannot be deferred.**

---

## MEASURE — what is actually true (live DB, SELECT-only)

Facts that survived the adversarial re-check. The first three each killed a claim that the ranking
stage had already accepted.

- **The attendance:sales ratio is ~2.25:1, not 11.72:1.** A check-in is one row *per person*; a
  venta is one row *per event*. 425 marks over 60 days land in only **81 distinct hour-blocks** across
  50 active days — the operator opens the desk ~1.6×/day and batch-marks ~8.5 people. Per *trip to the
  app*: 81 attendance sessions vs 36 sales. Days with a sale: **22/60 (37%)**. Selling is not a
  median-zero event.
- **`SEMANA · INGRESOS` is never zero.** Last 9 weeks at forge: **9 of 9 non-zero**, $2,149–$13,341.
  The "median sales/day is 0" statistic is a day-median being used to condemn a week-sum.
- **forge has 38 clientes, not 23.** `23` is the `forge-demo` tenant. Any reasoning of the form "an
  operator who can count 23 members in his head" is built on demo rows.
- **A live-session hero would be wrong most of the time.** Only **42.1%** of marks fall within ±90 min
  of any class start (so the card degrades to a contentless `ACCESO LIBRE` + button 58% of the time),
  and only **13.2%** of marks carry a `class_session_id` — a `2/12` occupancy figure would be counting
  ~1 in 8 of the people in the room, in the largest pixels on the screen.
- **`sesionCercana` ignores `duracionMin`** (`apps/admin/src/app/(app)/asistencia/_components/marcadas.ts:114-125`).
  It returns the nearest *start* within ±90 min — routinely a class that already ended. An `EN CURSO`
  label would assert something the function does not compute.
- **72% of forge's marks happen 18:00–23:00** (305/425), against a maintained schedule of 06/07/08 +
  19:00. The hardcoded `BUENOS DÍAS, COACH.` (`inicio.tsx:103-105`) is factually wrong most times it
  is read.
- **`VIGENTES 7/23` is not redundant.** `inicio.tsx:210` renders only `total`; `vigentes` — how many
  members hold an active package — appears nowhere else on the screen.

**What is fine and should be defended:** every empty state on the current screen is bespoke and
deliberate (`inicio.tsx:182,260-267,340-346,464-470`); the renewal counts are predicate-shared with
the directory and provably cannot drift (`packages/data/src/server/clientes.ts:286-297,335-338`); and
`ASIST` is a raised, always-visible primary tab on every screen (`apps/admin/src/app/(app)/layout.tsx:17,73`),
so the current layout costs **attention, not reachability**. That materially lowers the severity of
doing nothing.

**Scale defects found in passing (independent of this decision):**
- `getAsistenciasHoy` has **no `.limit()`** (`packages/data/src/server/asistencia.ts:372-378`) — at 300
  members it renders every mark of the day.
- `getRosterResumen` truncates at a 1000-row window (`packages/data/src/server/clientes.ts:305-315`),
  so past ~1000 members every count on the screen silently under-reports.

**Negative result — there is no telemetry.** Nothing records which admin route was visited or which
CTA was tapped. Nobody knows whether the home CTA is ever used versus the always-visible `ASIST` tab.
If the tab carries the traffic, this entire debate is about a screen the operator scrolls past.

---

## RESEARCH — the four required angles

### 1. The standard, and what it forbids
- NN/g's taxonomy is two-way: **operational** dashboards "impart critical information quickly to users
  as they are engaged in time-sensitive tasks"; **analytical** ones serve exploration without that time
  pressure (nngroup.com/articles/dashboards-preattentive). A front-desk check-in surface is the first.
- The three-way operational/tactical/strategic split usually miscited to NN/g is **Eckerson,
  *Performance Dashboards***; under it an operational dashboard is tied to running one specific,
  continuously-refreshed process.
- **Few, *Information Dashboard Design*** — the acceptance test: a dashboard "must be able to quickly
  point out that something deserves your attention and might require action." *Forbids* displays that
  consume space without changing a decision.
- **Ries on vanity metrics** — "any number that makes you feel good but does not help you make
  decisions." Cuts both ways: a giant `0 de pase registrado` at 08:00 fails the same test from the
  discouraging side.
- **Fold data cuts both ways.** 65%+ of above-fold viewing time sits in the top half
  (nngroup.com/articles/scrolling-and-attention), but above-fold time overall fell from 80% (2010) to
  57% (2018) (nngroup.com/articles/page-fold-manifesto). Both readings agree only that the top strip
  must hold the single most important thing.
- **No source anywhere says "gym staff apps must do X."** The frame is convergent, not canonical.

### 2. The incumbent
The class-first cohort converges on **schedule-as-home**, and notably *not* on a standalone attendance
CTA — the class list itself is the CTA:
- **PushPress Staff** — home is a Check-In page; "select 'Classes' or 'Open Gym'", then classes list
  chronologically by date. No KPI content documented. (*verified*)
- **Wodify Coach View** — Home tab lists today's assigned classes. (*unverified, 403*)
- **Zen Planner Staff** — "automatically defaults to today's date when opened." (*unverified*)
- **Mindbody Check-In**, **Fitco Check-in** (LatAm, staff-only, sales explicitly excluded),
  **Trainingym Booking**, **Clubworx Kiosk Mode** — four vendors built check-in as its *own surface*
  rather than a dashboard slot.
- **Metrics-first clusters on owner-facing dashboards**: TeamUp (11 mostly-financial blocks), Gymdesk
  (Payments → Attendance → Schedule → Tasks → Birthdays → Notifications → Overdue), Mariana Tek
  Insights 2.0. Mariana Tek — the strongest metrics-first case — keeps a **separate operational Daily
  Dashboard** for staff. Even Gymdesk, the closest published analogue to Sample B, puts schedule at
  block 3.
- **PerfectGym / Exercise.com / Arketa punt entirely**: user-reorderable widget dashboards. A third
  pattern neither sample represents.
- **Sample B's sparkline and vs-yesterday delta have no found precedent on any staff screen.** The one
  name-greeting found in the whole category is Trainerize's — on the **member** app.
- Spanish vocabulary: the attendance term with more than one source is **`control de acceso`**
  (Trainingym *verified*, Nubapp *unverified*). `pasar lista` appeared in none of the sourced
  vocabulary — but that vocabulary covers only 2 products, so this is not evidence of market usage.

### 3. Prior art post-mortems
Thin, and the gap is real: **no A/B or field study comparing action-first vs metrics-first for a
small-business operational tool exists in the searched literature**; no company post-mortem of moving
KPIs on/off a home screen was located; no primary research on whether daily users read or ignore KPI
tiles (the banner-blindness material is an untested *analogy* from ad research — and it is
self-defeating, since habituation would eat reordered tiles too); nothing quantifies the cost of a
greeting line. Three targeted searches for gym-staff friction reports on Reddit/G2/Capterra returned
**empty**, which is an empty result, not a null finding.

### 4. Our own prior art — the crux question
*If `/agenda` already shows today's classes and `/asistencia` already does attendance, what job is
left for home?* `/asistencia` already resolves the nearest session server-side and is **one tap** from
a raised always-visible tab. So a live-session hero on home saves **zero taps** and duplicates a
number that is 13% accurate. The job actually left for home is the one thing no other tab does:
**name the humans who need action taken on them** — which is MEMBRESÍAS, currently sitting *below*
five metric blocks.

---

## Where the two tracks agreed and disagreed

| | `/deep-research` | `/finding-the-standard` |
|---|---|---|
| Frame | operational, not analytical | same, independently |
| Sample B's greeting/sparkline | no staff-side precedent found | delete (greeting is factually wrong 72% of the time) |
| Sample A's top CTA | **no vendor does this** — the class list *is* the CTA | saves zero taps; `ASIST` tab already there |
| Evidence quality | **zero screenshots inspected** — all text-derived | live DB, SELECT-only, re-verified twice |
| Verdict | schedule-as-home has the better precedent | **the recommendation FALLS as written** |

Both tracks independently reached the same frame. Neither, on its own, caught the tenant inversion —
that came from the adversarial pass going back to the DB rather than trusting the summary it was given.

---

## The route — what is still open

Ordered by dependency. Nothing is ruled until the units feeding it close.

| # | question | type | blocked by | artifact |
|---|---|---|---|---|
| R1 | Does `red`'s sales-dominant shape mean home must adapt per gym, or serve the union of both? | **ruling** | — (this is the owner's, and it gates everything) | a decision recorded here |
| M1 | Does the home CTA ever get tapped, versus the always-visible `ASIST` tab? | measure | needs instrumentation | one event row per admin route entry; ~2 weeks of data |
| M2 | On a real 390×844 phone, where does the fold actually land on the shipped screen? | measure | — | a screenshot at device width |
| M3 | Is a per-session marked count cheaply derivable on `/inicio` without a second roster read? | measure | — | one spike |
| R2 | Reorder-only, or the live-session hero? | ruling | M1, M3, and R1 | the shipped layout |
| R3 | Does `SEMANA · INGRESOS` stay on the phone, move to CUENTA, or leave? | ruling | R1 | — |
| P1 | Put the chosen order in front of the operator before speccing it | prototype | R2 | a clickable screen |
| F1 | `getAsistenciasHoy` missing `.limit()`; `getRosterResumen` 1000-row truncation | fix | — | independent of this decision |

**M1 is the highest-leverage thing available**, and it is the one action that is not a guess: without
it, the whole argument is about attention nobody has measured.

## What was dropped, deliberately
- **No screenshots were ever inspected** — `/deep-research`'s entire competitor layout claim set is
  text-derived from help docs. A vision-capable pass over App Store galleries would confirm or
  demolish every "schedule-as-home" claim. Not run.
- Of 27 products named, 3 (Sportlogic, Gymtopia, Fitsy) could not be confirmed to exist; ~10 more
  yielded no home-screen evidence at all. Usable evidence covers about a third of the list.
- `red`'s operator was measured in aggregate only — no per-hour or per-week shape, as `forge` got.
- Mobile-vs-desktop was never confirmed as any vendor's stated staff default; surface is inferred
  from product naming throughout.

## Unresolved conflict worth naming
Apple's guidance says a first screen is not a branding moment. This is a per-gym re-branded platform
where `/inicio` is also the screen a prospective gym is shown in a demo. The standards optimise the
daily tool; the business may want the sales surface. That tension is a judgement call, not a
research gap.
