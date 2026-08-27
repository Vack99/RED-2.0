# Handoff 2026-08-27 — clases-restantes drift, session close

Slice 1 SHIPPED + PUSHED: `origin/main = fb6a1b3`, 3 migrations LIVE (pase guards + backdate
re-attribution, `gym.booking_enabled` forge=false, `registrar_venta` FULL RESET both axes —
ADR-0003 Amendment 2). Gates: code-review 2 axes, `test:denial` 52/52 ×2, 1701 unit. Prod data
corrected earlier: Mariana 7→9, reset sweep 10/10 (rollback values in
`docs/audits/2026-08-26-reset-sweep-report.md`).

## Berenice — ANSWERED, no correction needed (2026-08-27)

Ticket: "last payment 21 Aug, reset should apply that date; attended Vie-21 + Mar-25, only one
discounted/used — why?"

Timeline (cliente `e9ea73ac`, prod, all times gym-local UTC−6):

| Instant | Event | Effect |
|---|---|---|
| Vie 21 ago **18:12** | libre mark | charged the **OLD** 12-pack (folio 1047, 24-jul) — its 11th class, 1 left |
| Vie 21 ago **20:53** | renewal folio 1075, 8-pack | reset (applied by the 08-26 sweep): leftover 1 discarded, balance = 8 |
| Mar 25 ago **18:57** | libre mark | new pack 8→7 |

Stored today: `clases_restantes = 7`, vence 20-sep — **exactly correct under the reset ruling**.
The Vie-21 class predates the payment by 2h41m, so it charged (and displays under) the previous
pack. Both classes WERE discounted — one from each pack; nothing owed either direction.

Why the ficha says "1 used": the gauge counts usadas since the current venta's timestamp — the
venta-boundary display seam. That is the **slice 2** work (per-venta attribution / honest
historial), not a balance bug.

If forge's intent is "a same-evening renewal covers that day's earlier class": policy call, and
strictly WORSE for the member (Vie-21 would move to the new pack → 6, with the old pack's last
class discarded unspent). Recommendation: leave as-is; explain the two-pack split to the gym.

## Veronica Barrera — RULED −2, pending desk paper (NEXT SESSION)

Owner ruling: take out 2 charges (she claims 8 attended; system charged 10 → should end at 4).
Cliente `46f5bf35`, current pack folio 1058 (04-ago, 12 clases), stored 2, **vence 03-sep**.

The 10 charged days (all consumio=true, no same-day duplicates, weekday in parens):

1. 04-ago (mar) 22:17 libre ← **outlier: 2+h later than every other mark she has**
2. 06-ago (jue) 21:33 libre
3. 11-ago (mar) 18:00 clase ← **operator batch roll-call** (same batch marked Berenice 60s apart), not a door tap
4. 12-ago (mié) 20:00 libre
5. 13-ago (jue) 18:22 libre
6. 18-ago (mar) 19:03 libre
7. 19-ago (mié) 18:03 libre
8. 20-ago (jue) 19:55 libre
9. 25-ago (mar) 18:59 libre
10. 26-ago (mié) 19:53 libre

Read: her cadence weeks are 2-2-3-3-2… if she is really a 2/week member (8 over the pack ≈ 2×4),
the two 3-visit weeks (11/12/13 and 18/19/20) each hold one phantom. Prime suspects = the
**11-ago batch roll-call** + one of 18/19/20; alternate = the **04-ago 22:17** outlier. Data alone
cannot decide — get the forge owner's paper list of her 8 real days first.

Procedure once the 2 days are named: undo each mark from the admin asistencia screen on that date
(untoggle → auto-refund +1 each; the undo branch sits ABOVE the p_fecha clamp so any past date
stays undoable). Verify restantes = 4 after. **Do it before her vence 03-sep** (or the refunded
classes expire unused).

## Industry-standard research — already on main, do NOT re-run

Three docs, committed @ fb6a1b3:

- `docs/research/2026-08-26-checkin-capture-standard.md` — attendance capture (the owner's open question)
- `docs/research/2026-08-26-charge-timing-noshow-standard.md` — charge at booking, no-show forfeit, auto-no-show timers
- `docs/research/2026-08-26-class-pack-renewal-standard.md` — renewal reset vs stack (basis of the reset ruling)

Panel base (who "the industry standard" is): **US/EU mainstream** Mindbody (incumbent), Glofox,
Vagaro, Gymdesk, Zen Planner; **class/CrossFit natives** Wodify, PushPress; **boutique moderns**
Momence, Arketa, Mariana Tek, TeamUp, WellnessLiving; **pack specialist** Punchpass; **aggregator**
ClassPass; **access-control hardware vendors** Kisi, Brivo; **LatAm** Fitco, Trainingym, Klasius,
Crossfy, GymHero, Buq, Reeply. Sources = official help centers first, marketing flagged.

## Open ledger

1. **editar_venta / editar_venta_paquete** — the LAST stacking implementation; needs owner ruling
   (does an edit also reset?), then slice 2.
2. **Slice 2** — derived balance (`saldo_detalle`), honest gauge denominator, per-venta usadas
   attribution (closes the Berenice display seam), "No asistió — cargada" historial line.
3. **Veronica −2** — above.
4. Hanna Minjarez `bf79cee1` + Oscar Anchondo `24e90312` (red) eventless stored-0 — parked.
5. Tenant modes specced on #309; forge agenda takedown = its own session.
6. RED ops: roll call unrun accepted (booked = charged); records stay empty until slice 2.

## 2026-08-27 INCIDENT + FIX

Slice 1's `registrar_venta` migration hit uncommitted prod drift and left TWO overloads →
`300/PGRST203` on every sale, 06:16:58Z→~15:30Z; the FULL RESET above was NOT live until the fix.
Fixed, prod drift recovered, overload guard added — `docs/audits/2026-08-27-registrar-venta-overload-outage.md`.
