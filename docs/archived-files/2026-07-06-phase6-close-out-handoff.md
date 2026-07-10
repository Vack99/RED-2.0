# Phase 6 close-out — session handoff (2026-07-06)

## Status
Phase 6 client app is built, merged, and live. 13/13 slices on `main @ bfa9d37`; the 14-migration batch is applied + verified on the live DB (zero data loss, advisors clean, live types zero-drift vs committed, typecheck green); client deploy is green. Two owner steps remain to close the phase. #61 is done (resolved via the `mi_membresia()` scalars-only DEFINER RPC) — don't reopen it.

## Task 1 — production Turnstile keys
The captcha on the two public-write paths ships with Cloudflare's always-pass **test** keys. Swap real keys into the client app's deploy env:
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — client sitekey
- `TURNSTILE_SECRET_KEY` — server secret

Guards Contacto submit (#53) and Registro submit (#55); both read these vars (`apps/client/.env.example`, `src/lib/turnstile.ts`). Until swapped, any token passes — captcha is inert in prod.

## Task 2 — #63 exit gate (HITL, human-only)
Walk the full member journey on **red-demo** against the mock, plus a Forge paint spot-check; record evidence to a runbook (clone the `hitl-28` pattern under `docs/runbooks/`); then tick roadmap row 6 and close #49.

Reach red-demo in prod via `?gym=red-demo` on `red-2-0-client.vercel.app` — the seed added only a `red-demo-client.localhost` *dev* host row, no prod domain. Test member: `demo@red-demo.test` (password in the #45 plan doc).

Journey (one screen per slice): landing → precios / nosotros / contacto → registro / entrar → reservar (week) → book a class → mis reservas → cancel → clase detail + favorita → membresía → perfil hub + logout.

Money-path eyeball (gate-verified in tests; confirm on live): a finite plan consumes exactly one class at booking, admin Pasar lista does not double-consume, cancel-before-start refunds, ilimitado never decrements.

Watch items:
- **PublicHeader**: #51's drawer nav was hand-merged into #54's auth-hide header, no header test shipped — confirm the drawer opens on marketing pages and the header hides on entrar/registro/restablecer.
- **Auth email** rides Supabase's default sender (#27 SMTP deferred): ~2/hr, check spam — matters for the Registro confirm leg.
- Contacto/Registro captcha only truly gates once Task 1 is done.

## Reference
- Mock (read-only): `C:\Users\Aaron\Desktop\Pending\Red-1.0 Client App Frontend Design\RED-1.0-Design\index.html`
- Pre-apply DB backup: `C:\Users\Aaron\Documents\RED-2.0-backups\2026-07-06-pre-phase6\`
- Live hosts: `red-2-0-client.vercel.app` → RED · `forge-red-2-0-client.vercel.app` → Forge · `red-2-0-admin.vercel.app` → Forge admin

## Non-blocking follow-up
Root `tsconfig` includes `apps/admin/.next/types` but not `apps/client/.next/types`, so `tsc` fell back to permissive route types and a typed-route bug reached Vercel (fixed in `bfa9d37`). Adding the client include closes the gap — not required to close Phase 6.
