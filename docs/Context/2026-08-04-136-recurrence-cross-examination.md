# Recurrence at 4000 gyms — cross-examination of #136's auto-roll plan

**Date:** 2026-08-04 · **Trigger:** owner interrupted the #136 ruling: *"research the most elegant way
to be chipping the repeating classes on each gym… what are other systems using… what shields the
feature at 4000 small/mid LATAM gyms?"*

**Method (tier 2):** four territory agents (gym-vertical web sweep, calendar-standards web sweep,
scale/ops codebase analysis, red team) + coverage critic + live-DB verification of every load-bearing
number by the main session. Roster: 3× sonnet, 2× opus, synthesis in-session.

---

> **OWNER RULING (2026-08-04, after reading this report): weekly cron, overriding recommendation 3.**
> The declaration principle governs: a gym that stated "repeats every Tuesday" gets Tuesdays
> unconditionally — the piggyback couples that promise to staff app usage, which is a hidden
> dependency no measured-demand argument cures at 4000 unknown gyms. The cron ships WITH this
> report's hardening list (per-gym isolation, shared rule core, tz guard, observability, denial
> coverage). Everything else in the verdict stands, including the series-edit finding.

## Verdict

1. **The data model is right and stays.** Rule (`schedule_template`) → materialized, individually
   addressable `class_session` rows is what every sourced gym platform ships (Mindbody, Wodify,
   PushPress, Glofox, Gymdesk, TeamUp, LegitFit — one section per platform with URLs in the
   gym-vertical sweep). The calendar-standards world (RFC 5545, Google, Microsoft, Cal.com)
   expands-on-read instead — but it optimizes display interop, not capacity-limited bookings that
   need FK-able rows for a walk-in desk. Dissent logged below; resolved toward the vertical.
2. **The pg_cron auto-roll is REJECTED as proposed.** Not because auto-extension is wrong — the
   industry does extend automatically (Glofox documents a nightly batch; Wodify guarantees 365 days
   generated; LegitFit's manual extension is the documented failure case) — but because production
   demand data makes a fleet-wide cron the wrong-shaped machine here (weaknesses 2–3).
3. **Replace it with the piggyback roll:** the attendance desk already calls `getAgendaDia(hoy)`
   every morning, which already materializes the current week (`packages/data/src/server/agenda.ts:213`,
   staff-JWT, idempotent). Change: that call materializes the viewed week **+ the next one** (a second
   call to the same existing RPC). Every operating gym then self-maintains a 7–13-day horizon with
   zero new infrastructure, zero SECURITY DEFINER surface, zero new copy of the materialization rule,
   per-gym failure isolation by construction (a bad timezone string breaks one gym's own desk,
   visibly, same-day).
4. **The finding that outranks the question:** there is **no series-edit path at all**. No RPC, no UI
   action, no `is_active` toggle reachable from the app; the contract test asserts template edits
   never touch materialized rows (`supabase/tests/scheduling_materialization.sql:96-104`). Every
   sourced competitor ships "edit this class / this and future." At 4000 gyms this is the support-load
   generator, and it — not the horizon — is the real scaling exposure. Files as its own issue.

## What production actually says (measured, live, 2026-08-04)

| gym | future sessions | horizon ends |
|---|---|---|
| forge (the only real operator) | 13 | **2026-08-08 (3 days)** |
| red | 136 | 2026-09-13 |
| forge-demo / red-demo | 27 / 33 | mid-Aug |

Booking lead across all 482 reservations ever: **p50 0.92 days, p95 3.44, max 5.49. Zero bookings
have ever been made more than 7 days out.** The member `/reservar` surface renders only the current
week (no week navigation — `apps/client/src/app/reservar/page.tsx:47-52`). forge has been at a
~3-day horizon for weeks and nothing broke: the desk's daily `getAgendaDia` call re-materializes each
current week. **#136's premise ("horizon shrinks until classes dry up") is false for any gym that
operates its desk; what actually exists is a 1-week self-healing equilibrium.** The 6-week number
under debate came from a SQL default (`p_horizon_weeks default 6`) that no UI ever passes and no
product decision backs.

## Ranked weaknesses of the incumbent + proposed cron (worst first)

1. **No series-edit path** (above). Cancel-one-instance-at-a-time is the only schedule-change tool,
   and until #172's release-refund ships, each cancel of a booked session silently confiscates the
   member's credit. Sourced: absence verified independently by two agents + the test suite.
2. **The plan was sized against an unmeasured premise.** 6-week cron for a product whose worst-ever
   booking lead is 5.49 days and whose member surface shows one week. Measured above.
3. **The cron as proposed is a new cross-tenant SPOF:** requires a SECURITY DEFINER 4th copy of the
   materialization rule (the DST-careful TS twin runs only in tests); a single-transaction 4000-gym
   loop brushes the documented ~2-min `postgres` statement cap → total rollback, zero gyms served;
   silent death detectable only by a member finding an empty week (~weeks of latency); pg_cron is not
   even installed on live; a free-tier project pause stops it fleet-wide. Sourced per claim in the
   scale/ops report.
4. **Book-beyond-entitlement:** `reservar_clase` checks `vence` against *today*, never against the
   session's date — a member can spend a credit on a class dated after their package expires. Any
   deeper horizon widens this linearly. (The red team's sibling claim "can book past classes" is
   stale — live `20260803140000:100-102` blocks started classes.)
5. **Frozen instants vs tzdata:** materialized `starts_at` is computed once; Mexico changed tz rules
   in 2022 with four days' notice; no recompute path exists and the idempotency ledger is immutable.
   A deep pre-materialized horizon maximizes the stale window.
6. **`gym.timezone` is unvalidated text** — one typo halts that gym's materialization (under a
   single-transaction cron: everyone's).
7. **Schema CHECKs encode forge's product:** weekday 0–5 (Sunday unrepresentable), capacity 4–40,
   duration ∈ {30,45,60,75,90}; no room/coach double-booking exclusion constraint. Fine at 2 gyms;
   ticket generators at 4000.
8. **Append-only growth, no retention/partition plan:** ~2.6 rows per class across
   session/ledger/coach tables (measured live ratio), `reservation` grows fastest at real fill;
   RESTRICT FK chain also means no member-erasure path (LFPDPPP *cancelación* — flagged, unassessed
   legally) and the respaldo export omits the whole schedule subgraph.
9. **Backward materialization:** unvalidated `?d=` lets staff materialize weeks into the past (or
   2099); rows are permanent by design.
10. **No duplicate-template guard:** re-creating a schedule to "fix" it double-books every future
    week, and the only cleanup fires weakness 1.

## Breaking points

| component | breaks at | bound by |
|---|---|---|
| Desk-driven horizon (piggyback) | a real gym whose staff open nothing for >7 days | staff usage, not code — measured: forge desk runs daily |
| Single-txn cron loop (rejected design) | ~2,400–6,000 gyms/txn | modelled — 20–50ms/gym vs the documented ~2-min postgres cap |
| `class_session` growth | partitioning conversation at ~10–50M rows (~2–5 yrs at 4000 gyms) | Supabase partition guidance; `reservation` binds first at real fill |
| Auth email during gym onboarding | 50/hr project-wide (#152) | unrelated to recurrence but the earlier fleet ceiling |
| Series-edit absence | first real gym that changes its timetable with bookings present | support load — unmeasured: no second operator exists yet |

## Keeps and their exit triggers

- **Keep materialized instances.** Exit: only if the platform pivots to member-authored recurring
  bookings (Cal.com shape) — `undecided — product direction, owner draws that line`; partition (don't
  re-model) when `class_session` passes ~20M rows or the week read exceeds the repo's 50ms budget.
- **Keep lazy materialization; add the +1-week piggyback; no cron.** Exit triggers, any one: (a) a
  reservation appears with `starts_at - created_at > 7 days` (query in this doc's appendix-of-one);
  (b) any real gym's `future_sessions` hits 0 on a day its desk was opened; (c) owner decides the
  member app should advertise >2 weeks of bookable visibility — `undecided — owner`.
- **Keep the 6-week seed default for `create_recurring_schedule`.** Harmless burst; decays into the
  equilibrium. Exit: none needed.

## Confidence ledger

| claim | basis |
|---|---|
| forge horizon 3 days; red 39; zero bookings >7d lead; p95 3.44d | **measured** — live SQL, this session |
| Gym vertical = rule + generated instances, auto-extended | **sourced** — per-platform URLs (gym-vertical report); Wodify/Glofox specifics via search snippets, 403 on direct fetch |
| No template-edit path; edits never reach materialized rows | **measured** — code + test suite, two independent agents |
| Cron single-txn rollback at 4000 gyms | **modelled** — 20–50ms/gym × 4000 vs documented 2-min cap |
| pg_cron availability/limits, free-tier pause | **sourced** — supabase.com docs; maintenance-window behavior **asserted** (unverifiable in docs) |
| Piggyback covers demand | **modelled** — 7–13d depth vs measured p95 3.44d |
| LFPDPPP erasure exposure | **asserted** — FK chain sourced, legal reading not done |

## Could not determine → experiment

- Piggyback's added latency on the desk load → time `getAgendaDia` + second `ensure_week_materialized`
  on scratch against the 50ms budget (`tools/perf`).
- Whether a weekly cron's own runs prevent the free-tier 7-day pause → unverified in docs; moot if no cron.
- Wodify/Glofox horizon details beyond snippets → full-page reads blocked (403); re-verify if ever load-bearing.
- Recovery from a mis-claimed materialization ledger row → scratch experiment named by the critic, not run.

## Owner-input list

- Is >2-week member-facing booking visibility ever a product goal? (drives horizon + member week-nav)
- Retention/partition window for sessions/attendance (RESTRICT ruling says 1–2yr analytics horizon).
- When a second real operator onboards, weakness 7's CHECKs need widening — who triggers that review?

## Dissent log

Calendar-standards agent: "no reputable source pre-materializes unbooked capacity on a rolling
horizon" vs gym-vertical agent: Glofox nightly batch / Wodify 365-day generation do exactly that.
Resolved toward the vertical (bookable capacity + a physical desk need concrete rows); the standards
world's lesson retained where it is strongest: exceptions-as-overrides and "this and future"
semantics (weakness 1). — Critic's G5 (Stripe 7-day auth-hold vs 6-week horizon) cut: #233's hold is
an internal class-credit hold, no card authorization exists; the visible-vs-bookable distinction it
raised is kept as a note.

## Blind spots

Operator interviews (the critic's G8) not conducted; no synthetic 4000-gym perf seed was run; legal
read on LFPDPPP erasure not done; Supabase maintenance-window cron behavior unverified; the piggyback
change itself is unbenchmarked (experiment named above).

## Draft audit

Cut red team's *"a member can also book a session in the past"* — refuted against live
`20260803140000:100-102`, read this session (Rule 5). Cut critic's G5 Stripe-hold incompatibility —
premise mismatch, logged in dissent (Rule 5). Replaced my own earlier *"RED runs dry ~Aug 31"* with
measured Sep 13 + the self-healing equilibrium (Rule 2). Retagged *"the industry auto-extends, so the
cron is right"* — survives substitution (any auto-extension satisfies it, including the piggyback);
kept as a constraint, not an endorsement (Rule 4). Downgraded #136's own *"buffer is finite, classes
dry up"* framing from fact to falsified-for-operating-gyms (Rule 2). Sweep for the remaining shapes —
adequacy-without-number, keep-without-trigger, under-floor ranking, all-tagged output: no further hits.
