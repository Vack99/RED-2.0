# Handoff — activation firma + magic-link: this is a CUTOVER, not an implementation

Written 2026-07-23, after a power cut interrupted the implementing session. The code survived intact and
is gate-green. **Do not re-implement anything.** This session merges, migrates live, deploys, and settles
one owner decision.

## Verify ground truth before trusting a word of this

```bash
git log --oneline -3 activation-magic-link      # expect 4d5fffc, 0e683ba on top of 1ab639d
git rev-list --count origin/main..main          # expect 2 (the activation work)
git rev-list --count main..origin/main          # expect 4 (loading-screens, already pushed)
pnpm typecheck && pnpm test                     # expect 3/3 + 83 files / 1045 tests
```

```sql
-- expect (p_codigo text) — one arg. If it already shows two, the live apply ALREADY RAN.
select pg_get_function_identity_arguments(p.oid) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'reclamar_por_codigo';
```

---

## TL;DR — what shipped and what's left

The bottleneck was: an invited member clicks their invite link and is still made to confirm an email. Two
commits fixed it, plus the security hole that fixing it exposed.

| | |
|---|---|
| `0e683ba` | firma-gate the code-claim (audit §3) + magic-link activation (audit §4) — 15 files, +508/−47 |
| `4d5fffc` | post-implementation review addendum: the H2v2 residual + de-over-claims §3 |

**Three UX changes** (the actual bottleneck work):
- **Logged-in short-circuit** — `/activar?codigo=` with a live verified session renders one-click
  "Vincular {gym} a tu cuenta" (`vincular-form.tsx`, new) → `/reservar`. No email, no password.
- **Existing-account rail** — the `cuenta_existente` branch sends a passwordless magic link
  (`enviarMagicLink`, `shouldCreateUser:false`) instead of a password-reset mail. Member signs straight
  in; membership binds at `/auth/confirm`; password never touched.
- New-account rail unchanged.

**One security change** it could not ship without: `reclamar_por_codigo` now requires a server-minted
HMAC firma over `activar:v1:${codigo}` (Vault `tenant_assertion_key`), verified before any read or write.
Closes audit H1 (direct PostgREST claim) and H2v1 (attacker-appended `&codigo=` on a recovery link).

Full audit + addendum: `docs/Context/2026-07-22-activation-security-audit.md`.

## State — verified 2026-07-23

| piece | state |
|---|---|
| Code | done, gates green (typecheck 3/3, 83 files / 1045 tests) |
| Backup | `origin/activation-magic-link` @ `4d5fffc` — pushed, verified matching local |
| `main` (local) | 2 ahead / 4 behind `origin/main` — **diverged** |
| Merge of `origin/main` | **clean, no conflicts** (dry-run merged and aborted) |
| Live DB | migration **NOT applied** — prod still has `reclamar_por_codigo(p_codigo)`, one arg |
| Pending migrations vs live | exactly one: `20260722120000_reclamar_por_codigo_firma.sql` |
| `test:denial` | 37/37 green on scratch at implementation time; SUITE = 37, QUARANTINE empty |

## The job — a cutover with an ordering constraint

The migration **drops** the one-arg function (`create or replace` with a new signature would leave the
unbound overload callable, re-opening H1). Deployed prod code calls the one-arg version. So there is no
zero-downtime ordering — some window exists either way. Pick the short one:

1. `git merge origin/main` on local main — verified clean.
2. Re-run gates; re-run `pnpm test:denial` against scratch if you want the convention satisfied
   post-merge (loading-screens adds no migrations, so the 37/37 should still hold).
3. **Window opens** — apply `20260722120000` to live (MCP `apply_migration`; it is bound to LIVE).
4. `git push origin main` immediately → Vercel builds the client app.
5. **Window closes** when the deploy goes green (~2–4 min).
6. Walk one real activation end to end.

Exposure during the window is Forge members hitting `/activar` — RED is not taking members yet (seeding
Stage 5 is blocked on phone numbers). Run it at a quiet hour.

**Do not `supabase link` to prod or `db push`** — prod's `schema_migrations` doesn't recognize most
repo filenames, so a push would re-apply migrations including seeds. MCP `apply_migration` only.

## The owner decision — H2v2, and it is now decidable

The firma binds the **code**, not the caller. So `/registro?codigo=` survives as a claim vector:
`registrarAction` mints a valid firma for *any* code submitted, with no identity gate, and the
confirmation lands in the **caller's own** inbox. A code-holder registers their own email + the victim's
code → confirms their own inbox → the claim passes every gate → victim's paid row rebound, email
overwritten, victim locked out. One victim per code; not enumerable (34⁸). **Pre-existing on `main`** —
not a regression — and the same class as the `vincular` short-circuit the owner already accepted.

The addendum left three options and flagged option (b) as a "small diff" pending a check on in-flight
links. **That check is done. Live numbers, 2026-07-23:**

| | |
|---|---|
| Unclaimed codes total | 25 |
| …of which an invite was ever emailed | **6** |
| …emailed BEFORE the `/activar` switch (`be731d7`, 2026-07-15) | **3** |
| …emailed after (they hold `/activar` links) | 3 |
| Codes minted per-sale but never emailed | 19 |

```sql
-- the 3 to re-invite if option (b) is chosen
select id, nombre, email, invitacion_enviada_at from public.clientes
 where claim_code is not null and invitacion_enviada_at < '2026-07-15';
```

So **option (b) breaks exactly 3 outstanding invite links**, all sent 2026-07-11..14, all ≥8 days stale,
each re-sendable in one click via `reenviarInvitacionAction` (which now emails an `/activar` link).

**Correction to the addendum:** the diff is *not* small. `/registro`'s codigo arm spans
`registro/page.tsx` (the codigo param, `invitacionInfo`, and the entire cross-tenant shield — it is
codigo-gated, so it goes too), `registro/actions.ts` (firma mint + confirm URL), `registro-form.tsx`
(codigo prop + invite banner), the `ruta: "/activar" | "/registro"` union in `invitaciones.ts`, and
tests in `invitaciones.test.ts` (3 refs) + `registro.test.ts`. Removing the shield is safe on its own
terms: without a codigo, `/registro` is plain host-scoped self-registration and needs no shield.

Options, unchanged otherwise: **(a)** accept it, consistent with the accepted `vincular`; **(b)** remove
the `/registro` code-claim arm so `/activar` is the sole invite door; **(c)** recipient-bind the code —
deeper, and conflicts with the deliberate staff-typo email-agnostic tolerance (ADR-0015).

## LAUNCH GATE — owner config, blocks nothing in git

`TURNSTILE_SECRET_KEY` (server, `turnstile.ts`) and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (widget,
`activar-form.tsx`) both fall back to Cloudflare's **always-pass test keys** when unset, and there is no
`middleware.ts` and no rate limit anywhere on the claim paths. If the client Vercel project ships
without them, the only anti-automation gate on both new claim paths is a no-op — and `vincular` is now
one click.

The #129 cutover runbook (2026-07-15) records `TURNSTILE_SECRET_KEY` as set in the client Vercel
project; it says nothing about `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. **So the likely gap is the site key —
check both in the Vercel dashboard, don't assume.**

## Deferred, audit §5 — file or park, don't silently drop

`Referrer-Policy: no-referrer` on activar/confirm + strip `&correo=`/`&codigo=` post-read; a TTL on
`claim_code`; a `codigo+email` cooldown on the reset send.

## Rules that bind

- Migration-bearing change → `pnpm test:denial` green on a **scratch** project before main. Runner
  refuses the live ref. Scratch ref is in `docs/db-testing-throwaway-project/data` (gitignored).
- The #80 written-row rule: a migration changing what an RPC *writes* ships written-row suite
  assertions in the same change. Already satisfied — `reclamar_por_codigo.sql` V8 proves a bare/empty/
  wrong firma raises and leaves the row untouched.
- Supabase MCP is bound to **LIVE**. Scratch work goes through `SUPABASE_TARGET_REF` only.
- Pre-commit runs `pnpm lint && pnpm typecheck && pnpm test`. Never run `husky` with an argument.

## Also unsaved on this disk — separate topics, not this session's job

Two other topics were in flight when the power cut hit, and their docs are untracked (local-only):
the invite-mail capacity audit (`docs/Context/2026-07-22-invite-mail-capacity-audit.md`,
`docs/superpowers/handoffs/2026-07-22-email-infrastructure-investigation.md`) and the RED live-seed
(`docs/superpowers/{plans,specs}/2026-07-20-red-gym-live-seed*.md`, plus handoffs). `docs/supabase/`
holds `seeding-contacts.json` — real member contact data, so it wants a `.gitignore` entry, not a commit.

## Suggested session shape

1. Verify ground truth (blocks above).
2. Settle H2v2 with Aaron — the 3-link number makes (b) cheap to choose; the diff size makes it honest.
   If (b): implement + gates + scratch denial, then fold into the same cutover.
3. Confirm the Turnstile env vars are set in the client Vercel project.
4. Run the cutover (merge → gates → apply live → push → watch deploy → walk one activation).
5. File the §5 deferrals; update the audit doc with the H2v2 ruling.
