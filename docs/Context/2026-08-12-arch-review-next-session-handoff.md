# 2026-08-12 — Arch review batch 2 CLOSED: 7/8 cards shipped. Next session starts here.

Session recipe (per protocol): load `/caveman` `/ponytail` `/keep-it-lean`, orchestrate with
foreground sonnet/opus subagents, commit per slice (hook runs the full gate), fable only with
owner sign-off. Worktree: `.claude/worktrees/arch-review` (KEPT, clean, = `main`).

## Where things stand

- `main` = `fb44f46`, fast-forwarded to the worktree branch. 1555/1555, lint/typecheck/depcruise green.
- **NOT pushed.** origin/main is behind by: brand-docs batch + legal-docs commit (`d6addc2`) +
  veredicto batch 1 + this batch (8 commits). Next consented push carries all of it.
  Pure TS — **no migrations, no edge-function deploys pending.**
- Shipped this session (each commit message has the detail): Turnstile fail-loud (`c231ed1`→rebased),
  canonical RPC view (52 `.sql` + `pnpm gen:rpc-canon` + drift guard), `inquilino.ts` request-scoped
  tenant resolver (hostGymSlug threading gone), `BLOQUEOS_VENDIBLES` → `@gym/domain/rules`,
  `gym-content.ts` catalog (−262 lines), `derivarReservabilidad` booking verdict + `/clase/[id]`
  #89 nota, `intentarReclamo*` claim ceremony (throwing primitives de-exported), and the
  EOL-insensitive drift-guard fix (`fb44f46` — see Traps).

## ⚠️ WARNINGS — repeat these to the owner before anything ships

1. **Deploy gate (blocks the next push):** the Turnstile fix makes
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` **and** `TURNSTILE_SECRET_KEY` REQUIRED in Vercel for
   **apps/client**. Missing sitekey → build/first-render throw; missing secret → verify-call
   throw. That fail-loud is the point — but it means **owner must confirm both env vars exist
   in Vercel BEFORE consenting to a push.** If prod relied on the old silent fallback, CAPTCHA
   was never protecting those forms (worth checking Cloudflare dashboard traffic after deploy).
2. **Push consent is still owner-gated** — nothing here changes that. The push also carries the
   brand/legal docs batches from other sessions.
3. Standing repo traps that stay true: Supabase MCP is bound to LIVE; never `supabase link`/
   `db push` to prod; denial runner never applies migrations to scratch (apply first) and
   refuses the live ref.

## HITL — owner testing owed (two walks, both pending)

**Walk A — batch 1 (veredicto, from the previous handoff, still unwalked):** a client holding a
spent **pase suelto** (0 clases, días left):
- [ ] Ficha: días/vence accent no longer paints gold/urgente
- [ ] Respaldo export: Urgencia column reads **Ok**, not **Crítico**
- [ ] Roster shows the same client **ok/gris** (as before)
- [ ] Everything else identical: CLIENTES order + header counts, INICIO tiles, pase de lista
      badge, client-app member card. Any other difference = bug, file it.

**Walk B — batch 2 (reservabilidad, all intended, member-visible):**
- [ ] `/clase/[id]`: with another same-day reservation → "Ya tienes una clase hoy — esta usará
      otra de tus N clases" (#89 parity; suppressed for ilimitado; "ese día" when not today)
- [ ] Week cards: a DEPLETED member (0 clases o vencido) sees dimmed **"Sin clases"** — no more
      green Reservar the RPC then refuses
- [ ] `/clase/[id]` badge: near-full class reads **"Pocos lugares"** (was "Disponible")
- [ ] Full-class button reads **"Lleno"** everywhere (sheet used to say "Sin lugares")
- [ ] A booked class that already ended reads "Esta clase ya pasó" in the sheet too
- [ ] Claim/activation flows unchanged: /registro, both /activar rails, magic-link confirm,
      /reservar cold-retry (pure refactor — any visible difference = bug)

## Left missing (next session's queue, in order)

1. **Card 4 — SQL prelude del inquilino** (the only queue survivor; deserves the whole session):
   31 write RPCs open with 5 hand-rolled tenant/authz idioms; one shared prelude kills the
   `mi_membresia`-roulette bug class. Migration-bearing → scratch `test:denial` REQUIRED
   (PAT + scratch ref under `docs/db-testing-throwaway-project/data`; apply migrations to
   scratch FIRST — the runner doesn't; runner refuses live). The committed
   `supabase/functions-canonical/` view is the map of all 52 bodies — start there.
2. **#264** (filed this session, ready-for-agent): reserva preview misses `reservar_clase.sql:90`'s
   second expiry arm (`v_vence <` session date) — paquete lapsing mid-week still shows green
   Reservar for Friday, dead-ends at the RPC. Fix = expose `vence` + gym-local session day in
   DTOs, add `vence_antes` motivo to `derivarReservabilidad`. Member-visible → owner walks it.
3. **Small, next-touch:** `tools/guards/docs.test.ts:32` bans literal `src/lib` in docs —
   over-broad now that `apps/client/src/lib/` is real; relax to a lookbehind
   (`(?<!apps/[a-z-]+/)src/lib`). Cross-sector import `clientes/[id]/_components/cliente-detalle.tsx:27`
   → `asistencia/_components/marcadas` (`reciboResultado`) still open — the batch-2 vocab move
   did NOT fix it (different function); pairs with the post-#89 "helper dedupe" leftover.
4. **Documented non-bugs (don't re-file):** aviso-version under-record on a re-claim after a
   dropped first claim — deliberate, can never erase a stamp (registro.ts); the preview keeps
   `llena` before `sin_clases` against RPC order — buying a package doesn't create a seat
   (reserva.ts header).
5. **Parked list unchanged** (explore when bored, not urgent): dead `materializarSesion` +
   stacking-mirror guard in rules.ts; contradictory `revalidatePath` prose ×3; @gym/ui
   row/calendar/tile primitives; one PostgREST test double (33 hand-rolled fakes); denial-suite
   fixture contract (15/59 suites need ambient seeds, runner never checks target currency).
   Dormant: proxy session-rotation twin.

## Traps hit this session (so the next one doesn't)

- **Rebase + autocrlf turns generated files "stale":** rebasing re-materializes the working
  tree with CRLF; any byte-for-byte guard over committed generated files then fails wholesale.
  The rpc-canon guard is now EOL-insensitive on both sides (`fb44f46`). If a future guard
  compares generated files, normalize EOLs from day one.
- **Parallel agents in ONE worktree works** if their file sets are disjoint and they don't
  commit — but a mid-flight agent running bare `git stash`/full-suite runs sees the other's
  half-done state. Brief agents to expect it; attribute failures carefully. Sequential full-gate
  verification happens at commit time anyway (hook).
- `main` can move under the worktree (other sessions land docs) — rebase onto `main` before
  the ff, expect docs-only commits.

## ⚠️ Owner-owed inputs (unchanged debt — remind at session end)

- **SAT persona-física details** for the ToS/legal track: nombre completo, RFC, régimen,
  domicilio fiscal, correo de contacto. Blocks the ToS v1.0 assembly (T3).
- **Turnstile env vars in Vercel** (Warning 1 above) — needed before the next push, not after.
- Walks A + B above.
