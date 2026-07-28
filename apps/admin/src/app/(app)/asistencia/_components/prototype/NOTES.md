# Prototype — class-aware front desk (#89)

**Question:** the front desk is a per-day checkbox per member, so it cannot record a
second same-day visit and cannot say *which* class a visit was for. What should it
become, so that "mark a member present in two different classes on the same day" is
expressible — and so the product is sellable to gyms that live on either surface?

**Where:** the existing `/asistencia` route, `?variant=A|B|C`. With no param the route
renders production unchanged. Floating switcher at the bottom (← / → also work).

**Nothing is persisted.** Every tap is in-memory. The variants read real clients and
real classes but never call `togglePaseAction`, so the live database is untouched.
Today's real marks are seeded in as `ACCESO LIBRE` so the screens start populated.
The session reader is a plain read, *not* `getAgendaDia` — that one calls
`ensure_week_materialized`, which writes.

## Grounding — what the industry survey settled

All three variants were revised after a survey of ~20 products. The findings that
shaped them:

- **A class-aware desk is normal.** Gymdesk pins a session to the check-in screen so
  everyone who checks in inherits it; Zen Planner's kiosk auto-selects "your current
  class of the day"; PushPress, Glofox, ClubReady, Wodify, Clubworx and Xplor Triib
  all attribute a desk/kiosk check-in to a class. The class is **screen state with a
  smart default**, never a per-row control.
- **The per-day boolean is the anomaly.** Every product records **one timestamped row
  per visit**. No "×2" badge and no same-day counter exists anywhere in the survey —
  a second visit renders as a second row: `18:05 · Spinning` under `07:10 · Acceso libre`.
- **Do not replace the tappable list with a search box.** Zen Planner did exactly this
  in its new staff app, staff revolted in public reviews, and the vendor shipped the
  face list back in 1.0.11. The list is the strength; **scope** it, don't delete it.
- **Undo is per-visit and it is a toggle** (Wodify "click again to undo a sign-in",
  Arketa "it toggles off", PushPress "Remove Check-In"). Never "clear the day".
- **Class-less access is a first-class feature, not a degraded mode** — Mindbody
  Arrivals, PushPress Open Gym, Xplor Triib Onsite Check-In, Gymdesk's explicit
  "enable attendance tracking with no schedule/classes" setting. That is Forge's case.
  The anti-pattern to avoid is Wodify's advice to fabricate a recurring fake class.
- **The real same-day bug is double-deduction, and the industry fix is a cooldown**,
  not a per-day cap (Trainingym's configurable no-re-deduct window; Mindbody's 15-minute
  arrival cooldown). This is a ledger decision, not a UI one — see the issue.

## The variants

| | shape | primary affordance | what it's testing |
|---|---|---|---|
| **A — Chips de clase** | today's checklist, re-scoped by a context chip row (`ACCESO LIBRE` + each class); **opens on the class happening now** | tap a chip, then tap members | Can the existing register survive if the *day* stops being the unit and the *class* becomes it? Keeps Forge's habit — with no live class the default is `ACCESO LIBRE`, i.e. today's behaviour. Each row lists its visits as timestamps, no badge. |
| **B — Recepción (caras + feed)** | a **scoped grid of faces** for the selected class + today's arrivals as a reverse-chronological feed; search is a *filter*, not the path | tap a face | Is the completion-meter register the mistake? Counts `REGISTROS` and `PERSONAS` separately (the industry's *accesos totales* vs *accesos únicos*). Second visit is just another line. |
| **C — Clases del día** | today's classes as expandable sections + an `ACCESO LIBRE` bucket, each with its own roster, inline add, and **"mover a"** re-attribution | expand a class, add people to it | Should the two admin surfaces merge? This is PushPress's Check-Ins page — day's class cards *and* Open Gym on one screen, with after-the-fact "Move to Class". A member in two classes appears under two sections; nothing about it is special. |
| **D — Puerta (lista + selector fino)** | the verdicts, synthesized: C's class-scoped structure, but the **full member list IS the screen** — tappable (no typing to add), scoped by a **one-line pill selector** thinner than A's chips; in a class context the members who **booked it lead the list** as a `CON RESERVA` group (PushPress/Wodify: the roster IS the reserved list), everyone else under `SIN RESERVA` | tap a thin pill, then tap members | Is ONE number enough, and is booked-first the right order? Round 2 killed the inline roster block (a second rendering of the list): the arrival hora moved onto the marked row, undo = tap the row again. Group membership is the *booking*, not the check, so a marked row never moves — no list-jump under the thumb. Live data has zero bookings today, so `reservasPorSesion` synthesizes a labelled stand-in (`RESERVAS SIMULADAS` on screen — delete the fallback when real bookings exist). Other-context visits are gold stamps, never a ×2. With no schedule the pill row vanishes: ACCESO LIBRE + list, i.e. Forge's screen, intentional. |

## What to look for while flipping

1. **Where does your thumb go first?** A is a list you scan; B is a grid you tap; C is a stack you open.
2. **Does the second same-day visit feel normal or feel like an error?** That's the whole issue.
3. **Forge's case** (no maintained schedule): A degrades to today's screen, B to one face grid,
   C to a single `ACCESO LIBRE` section. Check whether any of those reads as broken.
4. **RED's case** (10-seat classes, 19 members): A's meter now counts a class, not the
   membership — see whether that fixes "a great day looks like 40%".
5. **C's "mover"** (the ⇄ button on a visit row) is the correction affordance the desk has
   never had. Try mis-filing someone and fixing it.

## Verdict — FINAL (owner, 2026-07-28)

# ✅ **VARIANT D — "Puerta" — WINS. This is the design to implement.**

> "I feel that we got the nail now, this is the winner."

`variant-d-puerta.tsx` is the reference implementation of the agreed design. **Do not
re-litigate the shape.** A, B and C are kept only as the decision record of how D was
arrived at; delete them when D is folded into production.

D's load-bearing properties, in the order they were fought for:

1. **The class is screen state**, chosen from a **one-line pill row**, defaulting to the
   class nearest now (`sesionCercana`) and falling back to `ACCESO LIBRE`.
2. **The full member list IS the screen** — always present, stationary, tap-to-mark.
   Never a search box as the path to marking (search is a filter only).
3. **`CON RESERVA` leads the list** in a class context; `SIN RESERVA` below. One
   mechanism — a labelled group. No per-row badges, no second sort.
4. **Group membership keys on the booking, not the check**, so marking someone changes
   their row in place and the list never jumps under a moving thumb.
5. **One number**: presentes in the selected context (`7 / 10` vs cupo; bare count for
   LIBRE), on a sticky hairline bar.
6. **No roster block, no hero card, no % meter, no completion bar.** The arrival `hora`
   lives inline on the marked row; undo is tap-again.
7. **A second visit is never a ×2 badge** — other-context visits render as gold stamps.
8. **No schedule ⇒ the pill row does not render.** `ACCESO LIBRE` + list is Forge's
   screen, reached deliberately rather than by degradation.

### Rounds

- **Round 1** — C's structure won on looks but adding someone required typing (the
  bottleneck); A and C both read saturated. B rejected outright. D built as the synthesis:
  C's scoping + B's thin selector + production's tap-the-list marking.
- **Round 2** — the inline roster block was cut entirely (a second rendering of what the
  list already carries), and bookings were surfaced as the `CON RESERVA` group. That two-part
  change is what made D the winner.

### Known limit, deliberately left open

D's toggle discipline means a member holds **at most one visit per context**. Two classes
works (two contexts); **two open-gym visits in one day does not**. The industry answer is a
cooldown window (Mindbody 15 min; Trainingym configurable), not a per-day block — this is a
ledger ruling, not a UI one. See the handoff.

### Scaffolding to delete when real data exists

`reservasPorSesion`'s synthetic fallback in `shared.tsx` (every gym had **zero** bookings for
today when D was designed). It self-labels `Reservas simuladas` on screen. Once bookings are
real, delete the fallback branch and the label.
