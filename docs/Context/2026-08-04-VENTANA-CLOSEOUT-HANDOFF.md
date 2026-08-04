# HANDOFF 3 — VENTANA closeout + follow-ups

**Session 3 ended 2026-08-04.** All 8 VENTANA slices (#223–#230 agent-side) SHIPPED. **Local main = `73b705b`, UNPUSHED.** Gate 1244/1244; scratch `test:denial` 42/42. HITL #205/#206/#207 closed. Spec #222 and #230 stay OPEN pending the owner steps below.

## Boot sequence

1. `/ponytail` + `/caveman` — first tool calls. Main session = ORCHESTRATOR: sonnet builders in foreground worktrees, opus reviewers (findings only), fix rounds via SendMessage to the same builder. Fable never staffed.
2. `git log --oneline -5` in BOTH `Repos\RED-2.0` and this worktree — a t3 session ships to main concurrently; expect drift. Never branch an agent worktree without verifying its base is the current integration tip (a session-2 builder silently cut from a 2-day-stale HEAD).
3. Work in the worktree `Repos\improving-client-page` if t3 holds `RED-2.0`; ff main only when t3 is idle.

## Pending — the map

**Owner (blocks closing #230 → #222):**
- Plantilla live sweep BEFORE next push (#226 review F3): `select gym_id, id, nombre from plantillas where body like '%vence en {dias}%' or body like '%venció%{dias}%'` read-only on live; hand-fix hits (`{dias}` is now a full verb phrase — old-style bodies double the verb).
- The walk — checklist is the last comment on #230. Then IMPI Marcanet (classes 9/42) or explicit waiver.
- The push (owner-consented, one word). After deploy: re-check the #205 scenario (Forge login on RED host) per the shipped reconcile.

**Agent-ready (filed this session, slop-checked 6→4):**
- **#239** tel-arm digit guard — letters-only search matches every client with a phone; two call sites (roster search + `vender.tsx` picker); `telDigits` already in `@gym/format`.
- **#240** 1000-row ceilings — three symptoms, one axis (resumen vs roster truncate different windows; `asistencias_ultima_visita_por_cliente` RPC tail reads never-visited; search-door ceiling). One pagination/aggregation decision, not three patches. Not urgent below ~1000 clientes.
- **#241** CLIENTES bundle — default-order affordance · #184 `router.refresh()` gap · `∞ cl` backport. Three sub-hour same-surface tweaks, deliberately one issue.
- **#242** asistencia latency ~50–66ms — pre-existing (A/B-proven at `0a9fead`, evidence in `tools/perf/results/018-230-ventana-closeout.json`); fix = restructure the sequential round-trip chain, NOT caching. Highest-traffic surface at the live gym.

**t3's, not ours:** #220/#221 (member-side gym scoping, membership re-mint) — the last blockers on epic #203.

## State that changed this session (don't rediscover)

- Engine: `lifecycle.ts` now exports `muestraAusente` (badge gate = vigente OR vencido ≤ `RECUPERACION_DIAS` — the WINDOW, never tile membership, per A9) and `contarLifecycle` carries real `aunATiempo` + `fueraDeAlcance`. Tile `aun_a_tiempo` ⇒ eje `fecha`, pinned by test.
- RPC `asistencias_ultima_visita_por_cliente(p_gym_id)` returns BOTH clocks; `ultima_visita` does NOT filter perdonada (orphaned-pardon edge is real — docblock in migration `20260804090000`).
- `{dias}` token = full verb phrase; día 0 never "vencido". Editor preview updated.
- `/proto` DELETED; `resumirRoster` + `Segmented` retired; `porVencer` → `porRenovar`.
- Supabase Auth allow-list trimmed to 6 single-host `ibookit.lat` entries — localhost auth against LIVE fails by design; local dev = local stack. `red-2-0-admin.vercel.app` removed from Vercel.
- Scratch PAT: `RED-2.0/docs/db-testing-throwaway-project/data` (ref `gyyujeguycxxoaqgdnjp`). New migrations must be applied to scratch via the Management API `database/query` endpoint before `pnpm test:denial` sees them.
- Perf harness needs Docker Desktop + `supabase start` + `pnpm perf:env` + `pnpm perf:seed`; its login cookie check was fixed for `__Host-`/chunked names. Perf numbers are environment-sensitive — A/B against a baseline commit before calling anything a regression.

## Landmines (unchanged)

Supabase MCP is bound to LIVE PROD — migrations go through `supabase/migrations/` + scratch; never `supabase link`/`db push`. **NEVER `git push`** without owner consent for that push. Husky v9: never `husky` with an argument. #188's died-objections table: nothing on it gets re-litigated.
