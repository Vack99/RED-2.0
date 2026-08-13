# 2026-08-12 — Arch review batch 2: 7 of 8 queue cards shipped

## Shipped (this worktree, rebased onto main's legal-docs commit)

| card | commit | what |
|---|---|---|
| 1. Turnstile fallback | `fix(client)` | Always-pass test-key fallbacks DELETED (4 forms + server secret). Missing env now throws. One home: `apps/client/src/lib/turnstile-site-key.ts`. |
| 3. Vista canónica | `feat(guards)` | `supabase/functions-canonical/` — 52 committed `.sql`, one per live RPC; `pnpm gen:rpc-canon` regenerates; `tools/guards/rpc-canon-drift.test.ts` guards drift. |
| 2. El gym en efecto | `refactor(data)` | `packages/data/src/server/inquilino.ts`: `slugDelHost()` + `resolverMiembroGym()` (React `cache()`, request-scoped). `hostGymSlug` threading GONE from 8 signatures / 4 app call sites. `getOperatorGym` deliberately NOT folded in (member row must never win admin). |
| 5. Refusal vocabulary | `refactor(domain)` | `BLOQUEOS_VENDIBLES` → `@gym/domain/rules`; both copies were identical. Cross-sector `_components` import is about `reciboResultado`, unrelated — left, still open. |
| 8. Catálogo curado | `refactor(data)` | `packages/data/src/server/gym-content.ts` owns about/facilities/faqs/stats, authed + anon twins share row→DTO mappers. 4 modules deleted, −262 lines. No drift found. |
| 6. Reservabilidad | `refactor(domain)` | `derivarReservabilidad` in `packages/domain/src/reserva.ts` — one booking verdict, RPC `reservar_clase` as referee; 6 drifts resolved (see commit). `/clase/[id]` gains the #89 nota. 76 tests. |
| 7. Reclamo del socio | `refactor(data)` | Claim ceremony → `intentarReclamo{PorCodigo,ConFirma,PorEmail}` in `registro.ts`; throwing primitives DE-EXPORTED (re-drift hole closed); 5 doors delegate; 13 tests. Both /activar rails untouched. |

Every commit went through the full pre-commit gate. Final: 1555/1555, lint + typecheck + depcruise green.

## ⚠️ DEPLOY GATE — before the next push

The Turnstile fix makes both env vars REQUIRED in Vercel for **apps/client**:
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. If either is missing in prod
the app now throws (build/first-render for the sitekey, verify-call for the secret) instead
of silently passing CAPTCHA. **Owner: confirm both exist in Vercel before consenting to a
push.** If prod relied on the old silent fallback, CAPTCHA was never protecting those forms.

## Owner walk — member-visible changes to verify (all intended, from card 6)

- [ ] `/clase/[id]`: second class same day now shows "Ya tienes una clase hoy — esta usará otra de tus N clases" (#89 parity; suppressed for ilimitado)
- [ ] Week cards: a DEPLETED member (0 clases or vencido) sees dimmed **"Sin clases"** — no more green Reservar that the RPC then refuses
- [ ] `/clase/[id]` badge: near-full class now reads **"Pocos lugares"** (was "Disponible")
- [ ] Full-class button: **"Lleno"** everywhere (sheet used to say "Sin lugares")
- [ ] A booked class that already ENDED reads "Esta clase ya pasó" in the sheet too (used to say "Ya tienes tu lugar")
- Everything else (pase-suelto veredicto walk from batch 1) unchanged — still pending if not walked yet.

## Left

- **Card 4 — SQL prelude del inquilino** (the only queue survivor): 31 write RPCs, 5 hand-rolled
  tenant/authz idioms → one shared prelude. Needs its OWN session: migrations + scratch
  `test:denial` (PAT at `docs/db-testing-throwaway-project/data`; TRAP: the denial runner never
  applies migrations to scratch — apply them first; runner refuses the live ref).
- **New defect filed**: reserva preview doesn't anticipate `v_vence < session date`
  (`reservar_clase.sql:90`'s second expiry arm) — a member whose paquete lapses mid-week sees
  green Reservar on Friday, dead-ends in the RPC. See issue filed 2026-08-12 + the module
  header of `packages/domain/src/reserva.ts`.
- Small: `tools/guards/docs.test.ts:32` bans literal `src/lib` in docs — over-broad now that
  `apps/client/src/lib/` is real; relax to a lookbehind. Aviso under-record on re-claim after a
  dropped first claim (can never ERASE a stamp; deliberate, documented in registro.ts).
- Parked list unchanged from batch 1 (materializarSesion, revalidatePath prose, @gym/ui
  primitives, PostgREST test double, denial fixture contract, proxy rotation twin).

## State

- Worktree `.claude/worktrees/arch-review` KEPT; branch rebased onto `main` (d6addc2) and
  `main` fast-forwarded to it.
- **Nothing pushed** — origin/main still behind by the brand-docs batch + veredicto batch +
  this batch. Next consented push carries it all; NO migrations or edge deploys pending
  (pure TS again), but the deploy gate above applies.
