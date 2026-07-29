# Cross-examination — the post-#89 reservation-truthfulness design (D1–D4)

2026-07-29. Owner-ordered `/cross-examine` on the four decisions ruled earlier this session, BEFORE any
SQL. Tier 2: 2 design seats (prior panel) + 4 examination seats (front desk, coach, member, red team)
+ coverage critic + orchestrator verification + live-DB counts. Priority axis as re-anchored by the
coverage critic: **product-readiness for a buyer's gym** (design-locked handoff §1), with gym-floor
"easier than pen and paper" as the working test.

The decisions examined (as ruled before the examination):
- **D1** — arrival window `[starts_at−90, starts_at+duration+15)`; desk 2-arg tap inside a booking's
  window delegates to `pasar_lista_sesion` (attribution); T = window close.
- **D2** — persisted lazy `no_show` sweep RPC riding staff reads, stamp-only.
- **D3** — delete the C15 same-day pardon entirely; outside-window taps charge.
- **D4** — `perdonada` boolean stamped at write; visits = active non-pardoned rows.

## Verdict

| decision | verdict | replacement |
|---|---|---|
| D1 attribution + window | **survives, amended** | arm-only (never undoes), no-op+toast on already-marked, `p_fecha` equality, pill-matching tie-break, disclosure UI, returned session id |
| D2 persisted sweep | **overturned** | **derive `no_show` at read** — zero writes, fully reversible |
| D3 delete C15 | **split** | delete only the **pre-window** arm (charges); keep a **closed-window** pardon (Terms-compliant) |
| D4 pardon column | **overturned as premature** | `count(*)` expression swap now; column deferred behind a named trigger |

## Ranked weaknesses of the examined design (contract: ≥8, worst first)

1. **Attribution delegates to a TOGGLE, so three surfaces become one-press erasers of class
   attendance** (red R2/R4, desk F1, coach F1 — four independent traces, one root cause). The ficha's
   ASISTENCIA button renders unpressed after a coach mark and one press soft-deletes the class row and
   reverts the reservation (`derive.ts:332-341` states the invariant D1 broke); the desk's LIBRE tap
   does the same while *showing* the mark it destroys ("18:02 CROSSFIT", `asistencia.tsx:284-287`);
   a re-tap on a row that looks unmarked (state keyed by selected context, `asistencia.tsx:235-242`)
   undoes a correct mark with **no toast** (`:262` has no else branch). Deterministic, silent, daily.
2. **The stamp's one distinguishing property — surviving changes to its inputs — is the bug** (red
   R1/R3, coach F2/F4). `edit_class_session` has no time guard (`20260706120100:210-219`, verified):
   one date typo mass-stamps every booking `no_show` on the next roster read, capacity releases on a
   live class, and **editing the date back does not un-stamp** — 2 taps/member to repair, with no UI
   hint. Sweep-then-cancel leaves N false accusations. Reading a roster becomes writing 12 rows.
   Occupancy history rewrites order-dependently (who browsed when) — the exact order-dependence D3's
   own rationale condemns for money. The schema author had already designed the derived form:
   *"a still-reservada past booking reads as 'no asistió'"* (`20260706170000:51-53`).
3. **D3's missed-class story violates the gym's published Terms** (member F1, verified
   `legal/page.tsx:52-54`): "la clase se descuenta" — singular — caps the no-show penalty at one
   class; the ruled D3 takes two. Five member surfaces also promise a 2-hour cancel deadline the DB
   does not impose (free until start, `20260710123000:186-188`), teaching members NOT to cancel.
4. **D3 also converts an admission into a door refusal** (coverage critic #3): C15 sits before the C9
   vence gate, so an expired member holding today's booking is admitted today
   (`20260728121000:212-226`, pinned green by `toggle_pase_rules.sql:36-37`). Ruled-D3 refuses them
   'Paquete vencido' outside the window. Live population: **24 of 52 real clientes** are
   expired-with-balance (measured 2026-07-29).
5. **D4 counts a phenomenon that has never occurred and miscounts one that has** (red R5, critic #8,
   member F3). Measured live: **zero** member-days with two active rows in 690 attendance rows —
   `perdonada` would be false on 100% of rows. The orphaned-pardon edge makes a real recorded visit
   count **zero**, contradicting `20260728121000:39-45` ("recording it is the whole point"). The
   re-emitted aggregate feeds only a sort comparator (`clientes.tsx:69`) — no rendered number. And the
   ruling's cost basis inverted: the "cheap" option became the largest of the three (critic #2).
6. **The desk cannot distinguish a charging tap from a free one, before or after** (desk F3, verified:
   no refresh call in the asistencia route). Identical toasts, frozen balance across the rush, no
   booking indicator on the LIBRE tab while the server consults exactly that data. Worse than the
   Excel sheet on the axis the owner named. Money cliff of one class across a 2-second boundary with
   no clock shown (desk F5).
7. **Gym-cancelled classes strand consumed credits with no refund path** (coach F3 + red R6,
   independent; verified `20260706120100:229-240` touches no reservation; "Se avisó a los reservados"
   is a hardcoded toast with no writer behind it, `agenda.tsx:317`). C15 was accidental compensation;
   ruled-D3 removes it → gym-fault −2. Measured live: zero occurrences to date — latent, not live.
8. **G-return as one line breaks the desk's default path** (red R9): a third return column requires
   DROP+CREATE of BOTH functions (42P13), and `return query select * from pasar_lista_sesion(...)`
   (`20260728121000:153`) raises a runtime structure mismatch on the class-pill delegation — the
   desk's default state — if arities diverge.
9. **The sweep is unobservable** (red R10): sole producer of a state with zero readers, riding
   swallowed-error reads; a dead sweep is indistinguishable from today; vitest mocks the RPC boundary
   and `test:denial` is a convention.
10. **The 3-arg class-pill path is also a machine guess, ON by default** (desk F2): `sesionCercana`
    flips 18:00→19:00 at the midpoint; a late arrival tapped into the wrong class is a walk-in
    consume + wrong seat + (under ruled-D2) a false `no_show` on the class they attended. Pre-existing
    on main; D2 upgraded its consequence. Mitigated but not closed by the revision (money-neutral for
    double-booked members; coach's explicit mark remains the corrector).
11. **Back-to-back double-bookers need two desk interactions; one ships** (member F7): the unmarked
    second class reads "no asistió" (derived or stamped) unless the coach marks it. Forge's seeded
    schedule makes back-to-back the default shape. Money-neutral; record-truth issue; the roster mark
    remains the free fix.
12. **The count-unit map was never written** (critic #7): six live definitions of "asistencia"
    (desk header, day strip, dashboard, roster sort, member plan card, respaldo Excel); D4 changed
    two, left the owner's month-close Excel counting raw rows forever (`respaldo.ts:95-126`), and the
    member plan card is separately broken (booked visits never count — `20260714120000:77`
    `consumio=true` filter; "0 de 4" with a full bar).

## The revised design (what replaces D1–D4)

**The window survives as the single boundary concept** — `[starts_at−90, starts_at+duration+15)`,
T = its close — but it now gates *inference and display*, never a stored state:

1. **Derived `no_show`, zero writes.** A past-T `reservada` row *is* "no asistió" — computed at read
   (TS-side on rows already fetched: `status='reservada' && now ≥ starts_at+duration+15`), rendered
   as the "NO ASISTIÓ" state on the admin roster (the real #164 deliverable). No RPC, no
   rpc-coverage entry, no locks, no observability question, no irreversibility: R1–R3, coach
   F1/F2/F4/F5, member F7's false-record persistence, and the whole G-unflip/G-165-drain apparatus
   dissolve. The `no_show` enum value stays unwritten (as its author designed) until a SQL-side
   consumer needs it — see exit triggers.
2. **Attribution is ARM-ONLY.** The 2-arg tap attributes only when it would MARK: candidate =
   `reservada`, `is_walk_in=false`, non-cancelled session, gym-local date = `p_fecha`, window
   contains now; tie-break = smallest `|starts_at − now|` (the pill's own metric, so screen and
   server agree). If the nearest in-window booking is already `asistida` → **no-op + toast** ("Ya
   está marcada en CLASE 18:00 — deshaz desde la clase"), never an undo, never a charge. Undo lives
   only in the context that owns the mark (class pill / roster / Agenda). Kills findings 1 and the
   re-tap loop outright.
3. **Disclosure UI ships with attribution** (desk seat's dominating option): a `RESERVA 18:00` chip
   on LIBRE-tab rows (data already in the client), the toast names the landing context, and
   `toggle_pase` returns the attributed session id — implemented as DROP+CREATE of BOTH functions
   with the delegation arity fixed (R9's plan), types regenerated.
4. **C15 splits at the window instead of dying.** In-window `reservada` → attribute (free).
   **Closed-window** `reservada` today → libre mark with `consumio=false` (the pardon survives for
   the missed-class case: Terms-compliant single-class penalty, and it keeps covering the
   gym-cancelled-class member — finding 7 — until refund-on-cancel is decided). **Pre-window**
   (>90 min early) → normal walk-in path, which charges: the ONE money change that survives, the
   defensible one (R1; the booking sheet already carries its consent copy,
   `reservar-semana.tsx:264-269`). Pure clock, order-independent, no sweep to race.
5. **#169 "visits" = a count-expression swap after all**: `count(*)` (active rows) replaces
   `count(distinct fecha)` in `asistencias_mes_por_cliente`, and `resumen.ts` drops its day-dedupe.
   Exactly correct until the first cooldown pair exists (measured: zero ever); overcounts by 1 per
   pair thereafter — the named trigger below re-opens the column decision. Day strip stays a people
   count. `perdonada` is NOT added.
6. **Riders**: #165's `starts_at > now()` gate in `reservar_clase` (stands on its own — the
   client-only gate is the hole; the drain motivation vanished). The 2-hour cancel copy corrected on
   its 5 surfaces (member F1) — claims a deadline the DB doesn't impose.
7. **Filed, not folded** (owner-input below): refund-on-gym-cancel (finding 7); member plan-card
   unit defect (finding 12); member receipt surface (no member-visible record of any visit —
   Contract A dropped the SELECT deliberately; #167 territory); `edit_class_session` time guard.

**Coach flow under the revision** (the owner's mid-exam question): marking during, right after, or
weeks after class is the SAME single tap it is today — the booked branch has no time gate, "NO
ASISTIÓ" is only ever a derived display that the mark instantly supersedes, and there is no sweep to
race or repair. Zero taps added over today; strictly more truth shown.

## Breaking points

| component | breaks at | bound by |
|---|---|---|
| attribution-as-toggle (ruled D1) | 2nd tap/press on any marked in-window member — deterministic | fixed by arm-only revision |
| persisted sweep (ruled D2) | first `edit_class_session` date typo or sweep-then-cancel: N members × 2 taps, irreversible | removed by derivation |
| `perdonada` (ruled D4) | first orphaned pardon → a real visit counts 0 | not shipped |
| `count(*)` visits (revised) | first genuine cooldown pair → +1 overcount | trigger query below; measured 0 occurrences in 690 rows |
| closed-window pardon (revised) | a member gaming rest-of-day free entry via one booking: costs them a kept booking consume each time — self-limiting at balance 0 | `clases_restantes` floor |
| Terms copy (unfixed) | first real-member no-show dispute | 18 RED members activating now |
| frozen-`now()` suites | every window edge needs the backdate pattern; D3-lite flips the meaning of `toggle_pase_rules.sql:230` | enumerate red vectors BEFORE SQL (critic #4) |
| desk balance staleness | any rush > 1 member — balance frozen from page load | unfixed in this slice unless G-return also returns `clases_restantes` (cheap, recommended) |

## Exit triggers (every keep)

- **Derived (not stored) `no_show`**: revisit if a SQL-side aggregate/report needs no-show counts
  across >200 sessions per query, or a second consumer beyond the two admin readers appears.
- **`count(*)` visits without the column**: revisit when this query first returns >0 —
  `select count(*) from (select cliente_id, fecha from asistencias where deleted_at is null group by 1,2 having count(*)>1) t`
  — run it at each month-close (one line in the respaldo ritual).
- **Closed-window pardon retained**: revisit when the member receipt surface exists AND the Terms
  are re-issued; `undecided — whether flake-then-train should ever cost 2 is the owner's product
  line to draw, not derivable here.`
- **90-min lower edge**: revisit if the month-close count of desk taps on members holding a same-day
  booking >90 min pre-start exceeds `undecided — owner sets the tolerance; measurable only after
  `origen`-stamped data accumulates.`

## Confidence ledger

| claim | basis |
|---|---|
| zero two-row member-days; 95 stale reservada (94 demo); 24 expired-with-balance; 0 cancelled-with-bookings; Forge 33 / RED 19 | **measured** — live SQL 2026-07-29 |
| toggle destructiveness, C15/C9 bypass, Terms text, edit/cancel-session bodies, no-notification toast, frozen desk balance | **measured** — file:line, orchestrator-verified |
| operator re-tap behavior, coach marking cadence, early-arrival frequency | **asserted** — priors; experiments named below |
| 42P13 / delegation arity failure | **modelled** — PostgreSQL CREATE OR REPLACE semantics + `:153` |
| "derived no_show costs no measurable read time" | **modelled** — ≤40 rows/session scalar predicate on rows already fetched |

## Could-not-determine → experiment

- Re-tap probability & round-trip feel → the owner's desk walk (already in progress) with the
  disclosure UI prototyped.
- Coach marking cadence at RED → observe one evening; decides how often "NO ASISTIÓ" appears at all.
- Whether a member receipt RPC violates Contract A's intent → architecture ruling, #167 cycle.
- Real early-arrival distribution → `origen`-stamped data, measurable after ~a month of RED traffic.

## Owner-input list

1. Re-rulings on the four verdicts (asked in-session).
2. Refund-on-gym-cancel policy (finding 7) — new issue.
3. Terms re-wording (2h → hasta el inicio) — rides the slice; final copy is the owner's voice.
4. The walk script: seeded bookings in red-demo to walk attribution + NO ASISTIÓ + pardon arms.
5. Whether #169's "both, labelled" (accesos totales vs únicos) should replace "visits" given the
   cost inversion (critic #2) — the swap ships either way; "both" is additive later.

## Dissent log

- Designer seat kept a narrowed C15 (free before-window) vs adversary deleted it entirely →
  resolved by the member seat's story-split + critic's C9 finding: delete pre-window arm only.
- Coach seat called D1 "net gain during class" vs red team's eraser findings → both true; resolved
  by arm-only amendment (the gain survives, the eraser dies).
- Desk seat's confirm-dialog analysis vs silent attribution → resolved: silent + disclosure.
- Coach seat proposed derive-don't-store as an untested alternative; red team independently made it
  R1 with the guard-evaporation table → adopted; noted below as the one revision not itself
  adversarially examined.

## Blind spots of this examination

- No seat ran the app; all UI claims are read off JSX.
- The DERIVED alternative was adopted from convergent evidence but never given its own red-team
  pass — the next diff's review must treat it as unexamined ground (e.g., client-clock vs
  server-clock skew in the TS derivation; render-time now() in RSC caching).
- Demo-gym data patterns stood in for buyer-gym patterns everywhere.
- Client-app coach views (if any) and member-app screens beyond the reservation readers unread.
- The examination consumed one framing of #169 ("visits"); "both, labelled" was costed but not
  walked through the UI.

## Draft audit

- Cut "the #164 backlog is real at meaningful scale" (first live query) after the per-gym split
  showed 94/95 rows are `red-demo` sandbox data — Rule 5, the number survived but its implication
  did not.
- Corrected the brief's "Forge ~300 clientes" to 33 (Rule 5; measured) and its
  `attended_since_purchase` "raw count" claim (member F3 + red R5 both caught the omitted
  `consumio=true` line — Rule 5).
- Acknowledged the brief substituted "easier than pen and paper" for the owner's product-readiness
  bar (critic #1) — M1: a framing error every seat inherited; both bars are applied above.
- Replaced "the closed-window pardon is safe" with the self-limiting bound + an `undecided` owner
  line (Rule 3 — the keep needed a trigger, and the threshold is the owner's to draw).
- Cut "derived no_show is obviously correct" → adopted with a named blind spot (it was never
  red-teamed) and an exit trigger (Rule 7's sixth shape — adopting a fix on convergence alone would
  be an adequacy claim without examination).
- Swept for the six shapes: adequacy-without-number, keep-without-trigger, substitution-surviving
  support, untagged claims, under-floor ranking, all-tagged-no-findings. Remaining hits: none found.
