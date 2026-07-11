# Handoff — kickoff context for #89 (attendance ledger: two same-day classes + consume edges)

Written 2026-07-10, immediately after the #81/#82 close (main @ `2052aed`, all migrations live).
**One session (#83–#88, Forge client branding) runs between this writing and your session.** That run
is client-app/branding/seed work and should not touch the attendance seams — but do not trust that:
re-verify ground truth before relying on anything here.

```bash
git log --oneline -5                     # expect branding commits on top of 2052aed
gh issue view 89
grep -rn "pasar_lista_sesion\|toggle_pase" supabase/migrations/ --include="*.sql" -l | sort | tail -5
```

---

## TL;DR — what #89 is

#89 is **an owner-semantics decision first, implementation second**. Do not write a line of SQL
until the ledger question is settled with Aaron (grill it — the edges below are the test cases).
The question: **what does attending two different classes on the same day consume?** Today's
guards enforce "one visit = one consume per day across all surfaces" (C15, both directions). Aaron
said (2026-07-10, verbatim intent): front desk is currently unused in practice; "later we have to
ship a way for the user to be able to mark a member present in two different classes."

## The decision space (put these to the owner)

1. **Two classes = two consumes** (each class attendance decrements): then the 20260710132000
   walk-in guard must key on the FD row's *purpose*, and the C15 guards need rethinking — what was
   "one visit" protection becomes per-class accounting. Biggest blast radius.
2. **Two classes = one consume** (a day is a visit, extra classes free): then marking in a second
   class should write consumio=false attendance (today the second *Agenda* class DOES consume —
   only FD↔Agenda cross-surface is guarded, Agenda→Agenda is not).
3. **Keep one-per-day but unblock the UX** (mark present in class 2 with consumio=false, mirroring
   the existing pattern): smallest change; decide whether that's the end state or a stopgap.

Whatever is ruled must also settle the **two accepted edges from the #81/#82 whole-branch review**
(they are facets of the same ledger — decide together, don't patch piecemeal):

- **Edge A — FD-untoggle-after-Agenda → net-zero-consume attended class.** FD check-in (consume)
  → Agenda mark (consumio=false per 20260710132000) → untoggle the FD row (refund). Member stands
  marked present with nothing consumed; FD re-tap refused by 20260710124000's mistap guard.
  Operator-repairable (untoggle+retoggle the Agenda mark). Unreachable in practice while FD unused.
- **Edge B — the 132000 guard keys on FD-row *existence*, not consumio.** A consumio=false FD row
  (zero balance at check-in) + same-day purchase + Agenda mark → class marked free though nothing
  was consumed for the visit. An `and consumio` filter closes it IF the ruling wants that.

## Mechanics inventory (verified live 2026-07-10 — re-verify bodies before asserting)

| piece | where | behavior today |
|---|---|---|
| `toggle_pase` (front desk) | `20260710124000` (latest) | ON path: (1) mistap guard — refuses if ANY same-day session-linked asistencia exists; (2) active-reservation no-consume; (3) C9 inclusive vigencia. OFF: refund iff consumed. FD owns only `class_session_id IS NULL` rows. |
| `pasar_lista_sesion` (Agenda) | `20260710132000` (latest) | BOOKED branch: no-consume (booking consumed at reserva). WALK-IN branch: consume, EXCEPT same-day FD row exists → consumio=false (existence check — Edge B). OFF: refund iff this pase consumed; walk-in reservation goes cancelada, booking reverts to reservada. Advisory-lock serialized per (cliente, session). |
| `reservar_clase` | `20260710123000` era | consumes at booking, stamps reservation.consumio; `cancelar_reserva` refunds iff consumed. |
| Second-Agenda-class today | — | **unguarded**: a walk-in mark in class 2 consumes a 2nd class; a booked class 2 consumed at booking. Only FD↔Agenda is cross-guarded. |

Suites that assert this seam (extend, don't rewrite): `supabase/tests/pasar_lista_sesion_rules.sql`
(vector 5 = the FD-then-Agenda no-reconsume written-row vector), `toggle_pase_rules.sql`,
`toggle_pase_gym2_timezone.sql`, `reservar_clase_rules.sql`, `cancelar_reserva_rules.sql`.
Admin UI surfaces: the pase map (`getMarcadas` — surfaces session rows on the front desk) and the
Agenda roster; client app books via `reservar_clase`.

## Rules that bind (unchanged from #81/#82)

- **The #80 written-row rule** (AGENTS.md "Database RPC contract tests"): any migration that
  changes what these RPCs write ships written-row suite asserts in the SAME change.
- **Scratch gate before merge**: recipe in
  `docs/superpowers/handoffs/2026-07-10-issues-81-82-kickoff.md` ("The scratch test:denial recipe")
  — still valid, PROVEN twice on 2026-07-10. Migration count was 69 at `2052aed` (+ whatever
  #83–#88 adds); SUITE was 35, QUARANTINE empty. First-run caveat: if a suite fails with SQL that
  isn't in the file, check what text was actually submitted (stale file read) before believing it.
- **Live apply is owner-gated** (runbook convention). Live history versions are MCP apply-time
  timestamps; parity with repo files is by NAME, not version.
- **#82.4 rename obligation likely FIRES here**: if you touch `TogglePaseOutcome` (or
  `CrearVentaResult`), the deferred failure-field rename `message`/`mensaje` → DAL-majority
  `error` ships in the same change (issue #82's close comment records this).
- Pre-commit runs `pnpm lint && pnpm typecheck && pnpm test` (863 vitest at `2052aed`). Never run
  `husky` with an argument. Supabase MCP is bound to LIVE — scratch work goes through
  `apply-sql.mjs`/`SUPABASE_TARGET_REF` only.

## Suggested session shape

1. Verify ground truth (commands above) — especially whether #83–#88 touched any of this.
2. Grill the owner on the decision space (options 1–3 + Edges A/B) until the ledger semantics are
   locked. Record the ruling in the session's plan doc.
3. Then: plan → suites-first (written-row vectors for the ruled behavior) → migration(s) →
   wiring → scratch gate green → whole-branch review → merge/push → owner-gated live apply →
   close #89.
