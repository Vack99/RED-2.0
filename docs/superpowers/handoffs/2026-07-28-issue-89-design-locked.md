# Handoff — #89 attendance ledger: DESIGN LOCKED, ready to implement

Written 2026-07-28, in the worktree `issue-89-attendance-ledger`, at the end of a long
grill + research + prototype session. **This supersedes `2026-07-27-issue-89-grill-kickoff.md`,
whose central premise is factually wrong** (see §2).

The design question is **settled**. The next session implements. Do not re-open the shape.

---

## 0. Read this first — what NOT to redo

Four agent investigations and a four-round prototype produced the decisions below. Re-running
any of them wastes a session and risks contradicting a settled ruling.

- **Do not re-survey the industry.** ~20 products were covered across two research passes
  (Mindbody, Wodify, PushPress, Zen Planner, Glofox, TeamUp, Momence, Vagaro, ClubReady,
  bsport, Gymdesk, Xplor Triib, Clubworx, Arketa, Virtuagym, Fitco, Trainingym, BoxMagic,
  gym-sys, XCORE). Findings are in §4.
- **Do not re-prototype the UI.** Variant D won. §3.
- **Do not re-derive the RPC mechanics.** §5 has them with file:line.
- **Do not trust the 2026-07-27 kickoff handoff.** Its "the front desk is unused in practice"
  premise is false and several conclusions rest on it.

---

## 1. The owner's actual goal (this reframes everything)

Verbatim, 2026-07-27:

> "this gym is actually pretty new, and they rarely have a 2 attendance member in a single day,
> actually they have never gone through this scenario, not even in RED gym … we are actually just
> preparing for the scenario, because we are working with this 2 gyms to perfect the project so
> that we can sell it in all Latin America."

**#89 is product-readiness work, not a bug fix.** Nothing is broken for a live user today. The
bar is therefore *"does this match what a buyer's gym will expect"*, not *"does this unblock
Forge and RED"*. That is why the industry survey outranks local convenience throughout.

---

## 2. Ground truth — re-verified live 2026-07-27/28

### The previous handoff's premise is FALSE

It claims the front desk is "unused in practice". Live rows:

| gym | front-desk rows | Agenda rows | clients | notes |
|---|---|---|---|---|
| **forge** (live, paying) | **268** | 3 | 29 | 11 check-ins on 2026-07-27 |
| forge-demo | 62 | 10 | 22 | |
| red-demo (sandbox) | 15 | **341** | 42 | |
| red (live) | **0** | **0** | 19 | invited 2026-07-24 |

**Forge runs almost entirely on the front desk; red-demo almost entirely on the Agenda.**
Neither uses both — which is why the cross-surface collision C15 guards **has never once fired
in production**.

### Other verified facts

- **No member in any gym has ever had two same-day attendance rows.** The entire edge set in
  #89 is hypothetical. There is nothing to migrate and nothing to repair.
- **Forge's Agenda has run dry**: 0 sessions scheduled after 2026-07-25, 0 coaches ever
  assigned to any of its 84 past sessions — while attendance continues daily at the desk.
  Owner's explanation: Forge was the first gym, onboarded *before the Agenda existed*; they
  want fast tactical attendance marking. Real classes do run.
- **RED maintains its schedule**: 96 future sessions through 2026-08-29, 10-seat capacity.
- **Zero reservations exist for today in any gym** (red-demo's 341 are historical). Any
  booking-aware UI must ship with a labelled stand-in or it renders invisible.
- **RED is 14/19 Ilimitado**, so #89 is mostly an attendance-*recording* feature there, not an
  entitlement one.
- Packages — RED: Mensualidad ilimitada $1200 · 8 clases $850 · 5 clases $550 · Clase individual
  $120. Forge: 1 clase $149 · 8 $799 · 12 $1199 · Ilimitado $1349. All 30-day vigencia.

---

## 3. THE DESIGN — variant D "Puerta" (locked)

Owner, 2026-07-28: *"I feel that we got the nail now, this is the winner."*

**Reference implementation:** `apps/admin/src/app/(app)/asistencia/_components/prototype/variant-d-puerta.tsx`
(runnable at `/asistencia?variant=D`). Full rationale and round history:
`apps/admin/src/app/(app)/asistencia/_components/prototype/NOTES.md`.

The eight load-bearing properties:

1. The **class is screen state**, picked from a **one-line pill row**, defaulting to the class
   nearest now, falling back to `ACCESO LIBRE`.
2. The **full member list IS the screen** — always present, stationary, tap-to-mark. Search is
   a filter, **never** the path to marking.
3. **`CON RESERVA` leads the list** in a class context; `SIN RESERVA` below. One mechanism —
   a labelled group. No per-row badges, no second sort.
4. **Group membership keys on the booking, not the check** — marking changes a row in place;
   the list never jumps under a moving thumb.
5. **One number**: presentes in the selected context (`7 / 10` vs cupo, bare count for LIBRE).
6. **No roster block, no hero card, no % meter.** Arrival `hora` sits inline on the marked row;
   undo is tap-again.
7. **Never a ×2 badge.** Other-context visits render as gold stamps.
8. **No schedule ⇒ no pill row.** `ACCESO LIBRE` + list *is* Forge's screen, by design.

**Rejected, with reasons** (so they don't come back): B's search-first shape (Zen Planner shipped
it, staff revolted publicly, vendor restored the face list); C's add-by-typing (the bottleneck);
A's and C's saturation (hero card, % meter, per-chip counts, meta lines — all cut).

**Delete when folding into production:** variants A/B/C, the switcher, and
`reservasPorSesion`'s synthetic fallback in `shared.tsx` (self-labels `Reservas simuladas`).
Prototype code was written under prototype constraints — rewrite, don't promote.

---

## 4. Industry consensus (the evidence base for the rulings)

1. **Two classes same day = two credits. Universal.** Not one of ~20 products discounts the
   second same-day class. The unit of consumption is the class instance, never the day.
2. **Where a per-day limit exists it BLOCKS, never discounts** — Wodify "Daily Reservation
   Limit", TeamUp Frequency Restrictions, Zen Planner "Set Reservation Limit Per Day", Momence,
   Fitco "Límite diario de reservas", BoxMagic. **All optional, all default OFF.** A per-gym
   *booking restriction* is the shape to grow into later — never a free second class.
3. **Nobody stores a per-day attendance boolean.** Every product records one **timestamped row
   per visit**. Wodify has separate API families for Class Reservations vs Class Sign-ins.
   Our per-day set-of-cliente-ids is the anomaly.
4. **A class-aware desk is normal** — Gymdesk pins a session to the check-in screen; Zen Planner
   auto-selects the current class; PushPress, Glofox, ClubReady, Wodify, Clubworx, Xplor Triib
   all attribute a desk check-in to a class. The class is screen state, never a per-row control.
5. **Class-less access is a first-class object everywhere it exists** — Mindbody **Arrivals**
   (own API, own report, own pricing options), ClubReady **club check-in** ("only applies to club
   check in and not booking check in"), TeamUp **Check In**, PushPress **Open Gym**, Gymdesk's
   explicit "enable attendance tracking with no schedule/classes". **Never modelled as a mode of
   class attendance.** Anti-pattern to avoid: Wodify's advice to fabricate a recurring fake class.
6. **The real same-day bug is double-deduction, and the industry fix is a COOLDOWN** — Trainingym
   documents exactly our failure (a booking consumes, then the turnstile deducts again) and fixes
   it with a configurable no-re-deduct window; Mindbody enforces a 15-minute arrival cooldown,
   hard enough that they patched their API when it could be bypassed.
7. **Undo is per-visit and reversible by the same gesture** (Wodify "click again to undo",
   Arketa "it toggles off", PushPress "Remove Check-In"). Never "clear the day".
8. **Best-in-class target** = PushPress's Check-Ins page: one day-scoped screen with the day's
   class cards *and* an Open Gym table together, walk-in add on either, and **"Move to Class" /
   "Move to Open Gym"** to re-attribute after the fact.

**Gaps the platform has vs every serious competitor** (each is its own issue, none belongs in
#89): cancellation window with automatic credit return; no-show as an auto-marked state with a
policy (Glofox's non-monetary **Strike System** fits a cash market better than fees); which
entitlement is consumed when a member holds several overlapping packages; manual credit
adjustment with a comp reason; enforcement mode (count-but-allow vs block) with a staff override;
waitlist with auto-promotion; booking/cancellation windows; activate-on-first-use.

---

## 5. Owner rulings

### LOCKED

**R1 — The unit of entitlement is the CLASS, not the day.** One class attended = one class
spent. Grounded in the price list (Clase individual $120 vs ~$110/class in a 5-pack) and
universal industry practice.

**R2 — Ilimitado is uncapped.** No per-day cap. Costs zero code (`clases_restantes IS NULL` is
already exempt from every decrement). Capacity is the throttle.

**R3 — The client app charges per booking and says so.** `reservar_clase` needs **no change** —
it already charges per booking with no same-day guard. Add **one line** to the existing booking
summary sheet when the member already holds a class that day: *"Ya tienes una clase hoy — esta
usará otra de tus N clases."* Derived from `miReserva`, already on the page. Ilimitado sees
nothing. No modal, no block.

### WITHDRAWN — do not implement these

Two rulings were given and then **superseded** by the industry evidence; they are recorded only
so nobody resurrects them from the transcript:

- ~~"Claim-once pairing": the desk row pairs with the first class of the day, later classes charge.~~
- ~~"Drop the mistap refusal so a desk tap after a class mark consumes a second class."~~

Both were day-keyed heuristics guessing at whether two rows meant one visit. They also made the
ledger **order-dependent** (desk→class = 1 consume, class→desk = 2), and the second was
UX-broken: after an Agenda mark the member already renders *checked* on the desk
(`packages/data/src/server/asistencia.ts:63-69`), so the operator's tap reads as *uncheck*.
**Replaced by the cooldown model (§6).**

### STILL OPEN — needs the owner

1. **Cooldown length**, and per-gym configurable or a fixed constant? (Mindbody: 15 min fixed.
   Trainingym: configurable.) Recommend a fixed constant first; configurability is a later sale.
2. **Should the desk express two visits in the *same* context?** D's toggle discipline allows at
   most one visit per (member, context). Two classes works; two open-gym visits in one day does
   not. This is exactly the case the cooldown exists to disambiguate — decide whether "beyond the
   cooldown, a second tap in the same context appends" is in scope for the first slice.
3. **Retroactivity** — never formally asked, and **moot**: zero same-day double-marks exist
   platform-wide. Ship forward-only; state it in the migration header.

---

## 6. Implementation shape

### The ledger

- **Attendance becomes a timestamped visit event.** Kill the per-day boolean. This is the single
  structural change everything else depends on.
- **Double-charge is prevented by a cooldown window**, not a per-day cap and not a pairing
  heuristic. Order-independent, no guessing, and it retires the whole C15 apparatus.
- **`ACCESO LIBRE` becomes a stated visit kind**, not the absence of a class id. Today
  `class_session_id IS NULL` means *unknown*, which is why "did open gym" and "did a class nobody
  recorded" are the same row. Consider an explicit `origen`/kind column.
- **Uniqueness re-keys from the day to the class.** Two partial unique indexes replace three
  hand-written `exists` guards:
  - `unique (cliente_id, class_session_id) where deleted_at is null and class_session_id is not null`
    — supersedes the non-unique `20260706175900:23-25`; exact sibling of `reservation_member_session_uq`
    (`20260706170000:62`).
  - a bounded rule for class-less visits, whose exact shape depends on open question #2 above.
    Today's convention is enforced only by `limit 1` (`20260710124000:69-74`).
- **Guards to delete**: the C15 mistap raise (`20260710124000:91-97`) and the FD-existence mirror
  (`20260710132000:118-124`). **Both accepted edges in the issue body evaporate with them** —
  Edge A exists only because a mark can be `consumio=false`; Edge B only because the guard keys
  on existence rather than `consumio`. That they both vanish is the strongest signal the guards,
  not the model, were the defect.
- **Keep** `toggle_pase` addition (2) (active-`reservada` booking ⇒ no re-consume) — it is
  correct: the booking genuinely paid for that class.

### The counter-vs-ledger question — answered NO for now

A full append-only `entitlement_entry` ledger was analysed properly and **rejected for #89**:
`clases_restantes` appears in **143 lines across 28 migrations** and ~20 TS call sites; the
balance is not a linear sum (NULL-means-Ilimitado is a *type*; forfeit is applied lazily at read
with no cron); the read path was deliberately optimised to raw column tests
(`clientes.ts:210-222`, and the perf wave's measured 42 ms → ~3 ms in
`20260714080000:9-11`); so a ledger would have to keep `clases_restantes` as a materialised cache
anyway — i.e. **counter *plus* ledger**, a second source of truth, not a replacement. Estimated
6–8 slices touching 19 real members' balances with an unfaithful backfill, versus 2–3 for the
guard fix. **It is a real idea for a different problem** — `attended_since_purchase` is wrong by
design (`derive.ts:402-403`: booked-but-not-yet-attended and no-showed classes are
spent-and-invisible). File that separately; do not fold it into #89.

### Your own domain layer already agrees

`packages/domain/src/rules.ts:165-167`: *"Same-day duplicate attendance is allowed and each still
consumes a class."* Unit-tested. **The three SQL guards added on 2026-07-10 drifted away from the
project's own canonical spec.** This is a guard problem plus one narrow model defect, not a
rewrite.

---

## 7. Live defects found along the way — file as separate issues

None of these is #89, all are real, and two become dangerous the moment two rows per day are legal.

1. **`toggle_pase` takes no advisory lock** while `pasar_lista_sesion` does
   (`20260710132000:71`). Today a double-tap is hidden by `DISTINCT`; once a second row per day is
   legal it is a **silent double-charge**. Must ship *with* #89.
2. **A desk mark on a booked member strands the reservation** (`20260710124000:103-110` never
   touches it). The class roster still shows them absent, the "3/5 presentes" headline is wrong,
   and the seat stays occupied in `contarActivos`.
3. **`pasar_lista_sesion` never reads `vence`** (`20260710132000:60-61`) — ruling C9 is enforced
   on 1 of 3 write paths. An expired member is refused at the desk, admitted on the Agenda.
4. **`no_show` has zero writers** anywhere in the repo, though it is in the CHECK constraint
   (`20260706170000:55`). Flaked bookings stay `reservada` forever and inflate occupancy.
5. **`reservar_clase` has no `starts_at > now()` gate** — only the client UI blocks it
   (`reservar-semana.tsx:228-234`) — while `cancelar_reserva` does gate
   (`20260710123000:186-188`).
6. **Late roster-marking charges the wrong package**: the consume fires at `now()`, not at the
   session's instant, so a renewal landing in between pays for last Tuesday's class.
7. **`attended_since_purchase` is short by design** (`derive.ts:402-403`) — the ledger's real
   customer.

---

## 8. Gates and hazards for the implementing session

- **AGENTS.md rule:** a migration that changes what an RPC *writes* ships in the same change with
  assertions on the **written rows** — `consumio`, `clases_restantes`, `reservation.status`,
  `gym_id` — never on the return value. #78 and #80 were exactly this failure.
- **Suites to extend, not rewrite:** `pasar_lista_sesion_rules.sql` (**vectors 4–5 currently
  assert the OPPOSITE of the new semantics and must be rewritten**), `toggle_pase_rules.sql`,
  `toggle_pase_gym2_timezone.sql`, `reservar_clase_rules.sql`, `cancelar_reserva_rules.sql`,
  `roster_clase_rules.sql`. All six are live in `SUITE`; `QUARANTINE` is empty and must stay so.
- **`pnpm test:denial` green against the scratch project before fast-forwarding to `main`.**
  Scratch `gyyujeguycxxoaqgdnjp` (creds in gitignored `docs/db-testing-throwaway-project`); it
  may be a migration or two behind — re-check. The runner refuses the live ref.
- **The Supabase MCP is bound to LIVE** (`hjppxawglmukfvsgmcog`). `apply_migration` hits
  production. Never `supabase link` to prod or `db push` — prod's `schema_migrations` does not
  recognise 56 of the migration filenames and a push would re-apply them, seeds included.
- **The worktree needs `apps/admin/.env.local`** — it is gitignored, so it does not come across.
  Copy it from the primary checkout or the dev server dies with `supabaseUrl is required`.
- **Run the dev server FROM the worktree.** A server started in the primary checkout serves
  production code and silently ignores `?variant=`.
- **`getAgendaDia` writes** (`ensure_week_materialized`). The prototype uses a plain read
  (`prototype-sesiones.ts`) for exactly this reason. Mind it in the real implementation.

---

## 9. Suggested first slice

1. **The invariant** — partial unique indexes on `asistencias` (validate zero violations first;
   there are none) + the explicit visit-kind column. Denial-suite vectors asserting `23505` on the
   duplicate shapes.
2. **The guards** — one migration re-emitting `toggle_pase` (drop `:91-97`, add the advisory
   lock) and `pasar_lista_sesion` (drop `:118-124`), plus the cooldown. Rewrite
   `pasar_lista_sesion_rules.sql` vectors 4–5 as written-row assertions on the new semantics.
3. **The desk** — `toggle_pase` gains `p_session_id uuid default null` so the existing signature
   keeps working; `getMarcadas`' read contract changes from a set of cliente ids to per-visit
   rows; variant D's UI is rewritten properly into `_components/asistencia.tsx`.
4. **The booking note** — R3's one line in the client booking sheet.

Get the two open questions in §5 answered before writing SQL for step 2.
