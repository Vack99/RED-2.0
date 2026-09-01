# Modos Lista / Cupo — execution kickoff (handoff)

Written 2026-09-01 at the close of the planning session. Read this, then #326, then the
ticket you are about to build. Nothing else is required to start.

## Start here

- Spec: #326 (`docs/superpowers/plans/2026-09-01-modos-lista-cupo-spec.md`, committed local
  @ e40731a, NOT pushed). Exit checklist = the comment on #326.
- Tickets (sub-issues of #326, all `ready-for-agent`, label `modos-lista-cupo-2026-09`):

| # | ticket | blocked by |
|---|---|---|
| #327 | mode spine: `modo` derived once, Lista tabs swap AGENDA→VENDER, `/agenda` redirect, Cuenta hides schedule settings, forge-demo flipped | none |
| #332 | Lista member surface: public page + hours field + `/saldo` + route redirects | none |
| #328 | home rebuilt on the CURRENT skin (structure from the lane), Cupo hero / Lista arm; includes the 4-helper prefactor | #327 |
| #329 | Lista desk forced ACCESO LIBRE; then hand-run SQL retiring forge's future sessions + plantillas (history kept) | #327 |
| #330 | Cupo desk entry step (date → class → LIBRE), skipped on `?sesion=` | #327 |
| #331 | "Reservas en línea" switch: ONE RPC (flip + cancel future reservations) + denial suite + consequence sheet | #327 |

Order: #327 and #332 first, in parallel. Then #328/#329/#330/#331 fan out. #329's SQL step
and #331's migration need owner consent at the moment they touch live.

## Rulings a builder must not re-derive (owner, 2026-09-01)

- Mode IS `gym.booking_enabled`. No new column, no second flag. Derive `modo` once in
  `@gym/domain`; never branch on the raw boolean or on "does today have sessions".
- **The mobile-admin worktree does NOT merge. Ever, this lane.** Port the home STRUCTURE only
  (`.claude/worktrees/mobile-admin/apps/admin/src/app/(app)/inicio/` is the reference:
  `page.tsx`, `inicio.tsx`, `inicio-vm.ts` + test) onto main's existing skin. Lift exactly four
  helpers into shared packages: `enCurso`, `sesionMasCercana` (→ `@gym/domain/rules`),
  `nombreSesion` (→ `@gym/ui/forge/agenda/session-card`), `fmtDiaInicio` (→ `@gym/format`).
  Nothing else crosses.
- "clases" wording stays everywhere (forge's real price list says clases).
- Lista→Cupo seeds NOTHING; no "Importar clases" placeholder. Cupo→Lista cancels future
  reservations through the existing cancel state, count shown even at 0.
- LIBRE remains selectable on Cupo (last option). Future dates never offered on the desk.
- forge retirement: `is_active=false` on plantillas, delete sessions `starts_at > now()`,
  keep every past row. Not a migration; recipe + counts recorded on #329 before running.
- Out of scope: schedule import/walkthrough, low-balance notification, onboarding mode question.

## Traps

- **NEVER `next dev`** (fork-bombs on Node 24). `next build && next start`.
- **Never push** without the owner asking for THAT push. Commit locally, fast-forward main.
- **MCP is bound to LIVE.** `execute_sql` reads are fine; every write is a live act.
- `test:denial` needs a scratch ref or the local docker path (`docs/` local-docker recipe); the
  scratch PAT is dead as of 08-17. Coverage guard will fail `pnpm test` the moment #331's RPC
  exists without a `rpc-coverage.json` entry — add it in the same change.
- `?sesion=` deep-link preselect on the desk is server-resolved in the lane but check main's
  `asistencia/page.tsx` before assuming it exists there.
- Home's `getAsistenciasHoy` has no `.limit()` — #328 removes the caller; don't re-add.
- Any change to auth/session surface (#332 changes login landing) runs `pnpm test:e2e` on
  red-demo before fast-forward.

## Staffing

- Builders: sonnet-5 per ticket, foreground, one at a time per ticket. Opus for review of
  #328 (user-facing composition) and #331 (write RPC). Fable 5.1 (`model: fable`): 5 seats
  granted for this lane, 0 spent — reserve for #331's RPC/denial design if opus misses, and
  for the #328 hero-ladder correctness call. Name the seat when you spend one.
- Worktree: `EnterWorktree` per ticket branch; ff main after gates.

## Owner-owed (standing)

SAT persona-física details; consent for the next push (this spec + handoff ride it);
consent for #329's live SQL and #331's live migration when they come up.
