# hitl-63 — Phase-6 exit gate evidence log

Recorded by the 2026-07-06 close-out session. Companion to PRD **#49** and slice **#63**,
and the Phase-5 precedent `docs/runbooks/red-demo-seed-evidence.md` §Phase-5 exit gate.

**Walkthrough host (RED / red-demo):** https://red-2-0-client.vercel.app **+ `?gym=red-demo`**
— the seed added only the dev host row `red-demo-client.localhost`; in prod, red-demo is reached
via the `?gym=red-demo` query param, not a domain.
**Forge paint spot-check host:** https://forge-red-2-0-client.vercel.app
**Admin (occupancy cross-check + Pasar lista):** https://red-2-0-admin.vercel.app
**Test member:** `demo@red-demo.test` — password in `docs/superpowers/plans/2026-07-05-slice-45-red-demo-twin.md`.
**Mock (read-only, side-by-side reference):**
`C:\Users\Aaron\Desktop\Pending\Red-1.0 Client App Frontend Design\RED-1.0-Design\index.html`

## Pre-flight

- [x] 2026-07-06 — **Task 1 (prod Turnstile keys) closed:** live verify green, widget reporting in
  Cloudflare, real sitekey `0x4AAAAAADw0zgE_N--iabPb` confirmed shipped on `/registro` + `/contacto`,
  server secret in Vercel (Production), `.env.example` leak reverted (test keys restored, nothing tracked).
- [ ] Logged into admin for the red-demo gym (roster/occupancy cross-check + Pasar lista) — record the access path used in notes.

## AC1 — 12 screens signed off vs the mock

| # | Screen | Slice | Matches mock? | Notes |
|---|---|---|---|---|
| 1 | landing / comercial | #50 | [ ] | |
| 2 | precios | #51 | [ ] | |
| 3 | nosotros | #52 | [ ] | |
| 4 | contacto | #53 | [ ] | |
| 5 | entrar | #54 | [ ] | |
| 6 | registro | #55 | [ ] | |
| 7 | restablecer | #54 | [ ] | |
| 8 | reservar (week) | #56 | [ ] | |
| 9 | clase detalle (+ favorita / confirmada) | #59 | [ ] | |
| 10 | mis reservas | #58 | [ ] | |
| 11 | membresía | #61 | [ ] | |
| 12 | perfil hub | #62 | [ ] | |

## AC2 — end-to-end journey (evidence)

- [ ] **Register** a new member on red-demo (claim-by-match vs a seeded `clientes` row) — solve the **live** Turnstile widget → email confirm (Supabase default sender, ~2/hr, **check spam**) → claim on `/auth/confirm`
- [ ] **Browse marketing logged-out** — landing, precios, nosotros, contacto
- [ ] **Contact form submit** — the live Turnstile now truly gates it
- [ ] **Log in** (entrar)
- [ ] **Reservar (week)** renders live occupancy
- [ ] **Book on a FINITE plan** → balance −1, spots −1, occupancy live in **both** apps
- [ ] **Book on ILIMITADO** → **no** decrement
- [ ] **Mis reservas** shows the booking(s)
- [ ] **Cancel before start** → refund (+1) + spot freed
- [ ] **Rebook**
- [ ] **Clase detalle** + marcar favorita
- [ ] **Admin Pasar lista** (asistida) → writes `asistencias`, **no double-consume**; walk-in parity
- [ ] **Membresía** — plan status + usage; change-plan → honest "paga en tu gym"
- [ ] **Perfil hub** — identity, settings, notifications toggle, **cerrar sesión** (logout)

## Money-path assertions (gate-verified in tests — confirm on LIVE)

- [ ] Finite plan consumes **exactly 1** at booking
- [ ] Pasar lista does **not** double-consume
- [ ] Cancel-before-start **refunds**
- [ ] Ilimitado **never** decrements
- [ ] Occupancy **identical** in client (reservar / mis reservas) and admin (roster)

## Watch items (from the close-out handoff)

- [ ] **PublicHeader:** drawer nav opens on marketing pages
- [ ] **PublicHeader:** header **hides** on entrar / registro / restablecer
- [ ] Auth confirmation email arrived (check spam) — the registro confirm leg
- [ ] Turnstile visibly gates contacto + registro (Task 1 live)

## AC3 — Forge paint spot-check

- [ ] Spot-check the same pages on https://forge-red-2-0-client.vercel.app — renders in **Forge** paint, no RED bleed

## Deltas filed

- _(list any new issues found during the walk, or "none")_

## Stage log

- [x] 2026-07-06 — Task 1 (prod Turnstile keys) closed (see Pre-flight)
- [ ] 2026-07-06 — AC1: 12 screens signed off vs mock
- [ ] 2026-07-06 — AC2: end-to-end journey walked
- [ ] 2026-07-06 — money-path confirmed on live
- [ ] 2026-07-06 — AC3: Forge paint spot-check
- [ ] 2026-07-06 — roadmap row 6 ticked; deltas filed; **#63 + #49 closed**
