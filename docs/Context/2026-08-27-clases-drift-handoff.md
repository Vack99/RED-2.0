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

## 2026-08-27 INCIDENT + FIX (resolved same day — context for the state below)

Slice 1's `registrar_venta` migration hit uncommitted prod drift (mobile lane's tenant-in-effect
had widened it to 15 args) and left TWO overloads → `300/PGRST203` on every sale,
06:16:58Z→~15:30Z; the FULL RESET was NOT live until the fix. Full postmortem + exposure audit:
`docs/audits/2026-08-27-registrar-venta-overload-outage.md`. Resolved and verified:

- Fix migration applied to prod; **reset PROVEN live** (folio 1041 discarded an active carry).
- Prod drift healed (3 mobile-lane migrations recovered, md5-proven), **overload guard now in
  `pnpm test`**, denial 53/53 local docker. Pushed: `origin/main = 8f78cc1`.
- Sweep hole closed: the 08-26 sweep skipped *ilimitado* members; 3 prod corrections applied
  owner-consented (Fernanda →09-25, Elsa →09-16, Sandra →08-19; rollbacks in the audit doc).
- State markers: local `main = 09727c0` (docs commit, push owed); platform fully
  reset-rule-consistent except the parked Hanna/Oscar rows (item 5).

## Open ledger — NEXT SESSION starts here

0. **Carolina Nieto retry — CONFIRM FIRST (5 min).** Forge owner (Nahum/David) had NOT re-run the
   Renovar as of session close; he's pending on the update. Check edge logs for a
   `rpc/registrar_venta` 200 (or her row `eb495cc8`): expect **12 clases, vence = inicio+30**.
   Any new failure ≠ the 300 class (that's dead + guarded) — diagnose fresh.
1. **Veronica −2 — HARD DEADLINE before her vence 03-sep** (refunded classes expire unused).
   Blocked on forge's paper list of her 8 real days; procedure + suspect table in §Veronica above.
2. **editar_venta / editar_venta_paquete — owner ruling owed** (does an edit also reset?). Now the
   LAST stacking implementation anywhere; also still resets balance to full grant on a
   date/package correction. Fix rides slice 2 once ruled.
3. **Slice 2** — derived balance (`saldo_detalle`), honest gauge denominator, per-venta usadas
   attribution (closes the Berenice display seam), "No asistió — cargada" historial line.
4. Hanna Minjarez `bf79cee1` + Oscar Anchondo `24e90312` (red) eventless stored-0 — parked,
   owner ruling owed (only remaining reset-rule deviation platform-wide).
5. Tenant modes specced on #309; forge agenda takedown = its own session.
6. RED ops: roll call unrun accepted (booked = charged); records stay empty until slice 2.
7. **Mobile-lane merge hazard (from the incident):** branches `fix/staff-gym-tenant` /
   `mobile-admin` hold the 3 recovered migrations under OLD filenames
   (`20260819120000`, `20260820120000`, `20260824130000`) — delete branch copies before merging,
   else duplicates. Also owed with that lane: `dos_gimnasios_staff_pin{,_agenda}.sql`
   written-row suites for the 11 widened RPCs.
8. Diagnosability (small, from the incident): `ventas.ts` + vender toast flatten every RPC error
   to "Revisa los datos" — an infra 300 read as "your data is wrong". Worth a distinct message
   when convenient, not urgent.
