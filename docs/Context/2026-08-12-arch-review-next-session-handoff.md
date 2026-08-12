# 2026-08-12 — Arch review: veredicto shipped, candidate queue open

## Shipped today (on main after ff)

**Una fila → un veredicto** — `6d7b344` (+ `6ac9b9c` stale test fixture, `6a028ba` glossary).
`derivarVeredicto` in `packages/domain/src/lifecycle.ts` now owns the whole lifecycle
verdict; DTOs carry `veredicto`; both duplicated `clientes.ts` assembly blocks and the
vm's hand-built fila are gone. 1509/1509, net −200 lines. Full detail: the commit
message of `6d7b344` and CONTEXT.md's **veredicto** row.

## Owner walk (tomorrow's testing)

The ONE intended visible change — a client holding a **spent pase suelto** (0 clases,
días still left):

- [ ] Ficha: días/vence accent no longer paints gold/urgente
- [ ] Respaldo export: Urgencia column reads **Ok**, not **Crítico**
- [ ] Roster shows the same client **ok/gris** (as before)

Everything else must look identical: CLIENTES order + header counts, INICIO tiles,
pase de lista badge, client-app member card. Any other visible difference = bug, file it.

## Left to fix (from the 14-candidate review; full text in memory `arch-review-veredicto-shipped`)

1. **Turnstile fallback** — 4 client forms default to Cloudflare's always-pass test
   sitekey (`?? "1x000…AA"`); env var missing in prod = CAPTCHA silently passes. ~20 min, do first.
2. **El gym en efecto** — one request-scoped tenant resolver; today 3 confessed twins
   (`gym.ts`, `agenda-miembro.ts:144`, `clase-miembro.ts:128`) + optional `hostGymSlug`
   threaded through 22 signatures; forgetting it silently reads another gym.
3. **Vista canónica de funciones** — commit the migration replay
   `tools/guards/denial-suite.ts:128` already computes (one file per RPC) + drift guard. Cheapest card.
4. **SQL prelude del inquilino** — 31 write RPCs open with 5 hand-rolled tenant/authz
   idioms; one shared prelude kills the `mi_membresia` roulette bug class. Needs scratch `test:denial`.
5. **Refusal vocabulary** — `BLOQUEOS_VENDIBLES` duplicated in `marcadas.ts:177` +
   `session-vm.ts:266` + the app's one cross-sector `_components` import; home it in `@gym/domain`.
6. **Reservabilidad del socio** — booking cascade written twice, drifted 4 ways;
   `/clase/[id]` is missing the #89 "usará otra clase" nota (member-visible).
7. **Reclamo del socio** — the claim ceremony re-decided at 5 call sites, zero tests.
8. **Catálogo curado** — about-values/facilities/faqs/stats are one module written 4×
   (+ anon twins in `marketing.ts`).

Parked (worth exploring, not urgent): delete dead `materializarSesion` + guard the
stacking mirror in `rules.ts`; the contradictory `revalidatePath` prose ×3 seams;
`@gym/ui` row/calendar/tile primitives; one PostgREST test double (33 hand-rolled fakes);
denial-suite fixture contract (15/59 suites need ambient seeds, runner never checks
target currency). Dormant: proxy session-rotation twin.

## State

- Worktree `.claude/worktrees/arch-review` KEPT; `main` fast-forwarded to it.
- **Nothing pushed** — origin/main is behind by the brand-docs batch + today; next
  consented push carries it all. Pure TS today: no migrations, no edge deploys pending.
