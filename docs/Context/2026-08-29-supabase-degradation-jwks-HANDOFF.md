# HANDOFF 2026-08-29 — "everything spins forever" = Supabase degradation, and the JWKS fix we owe

**Type:** incident diagnosis + next-session plan. Nothing pushed from this doc's session after `95583ac`.
**Repo state:** `main` = `ff1824f` local (1 ahead of origin: docs-only), origin = `95583ac`. Working tree clean except untracked `apps/mobile/` (node_modules junk) and `t3.json`. Docker Desktop + local Supabase stack running (fine to leave).


> **CORRECTION (same day, later session) — §0 item 3 and §3 are superseded.** Grouping `edge_logs` by
> `request.cf.colo` shows **all 65 requests over 5 s in 24 h entered Cloudflare at IAD** (AWS us-east-1
> IPs = the `iad1` Vercel page functions); SJC/LHR/SIN/LAX/FRA/DFW/PDX produced zero. Same minutes, same
> URL from SJC: 26–91 ms. GoTrue self-reported `jwks.json` at avg 3.9 ms while the edge measured 266 s.
> The stall is path-agnostic (`gym`, `clientes`, `paquetes`, `asistencias`, `ventas`, read-RPCs all
> stalled from IAD) — a per-request lottery on the IAD colo → Supabase (us-west-2) leg, ~9 % of IAD
> requests in the worst hour. **JWKS was never special**: auth-js 2.106.2 already keeps a process-global
> JWKS cache (`GLOBAL_JWKS`, 10-min TTL); "new client per request re-fetches" is false. Shield shipped on
> branch `fix/pdx1-colocation-fetch-shield`: (A) `"regions": ["pdx1"]` in both `vercel.json` (same AWS
> region as the DB — the perf-loop's open colocation item); (B) `packages/data/src/server/fetch-shield.ts`
> as `global.fetch` on every server client: GET/HEAD reads bounded (8 s + one untimed retry), `jwks.json`
> bounded (2.5 s → pinned key set), every POST untouched. Diagnose by colo first next time.
> **Verified green on the branch:** `pnpm lint && pnpm typecheck && pnpm test` (1765), `pnpm exec next build`
> ×2 (admin + client), `pnpm test:e2e` 3/3 against the `red-demo` twin, live GET-vs-POST parity 7/7
> byte-identical, and an admin smoke of 6 pages all 200 — the region decision is now
> [ADR-0017](../adr/0017-vercel-function-region-colocated-with-supabase.md).

---

## 0. TL;DR

1. **Forge admin "stuck at ENTRANDO…", then RED booking app, then everything** = **Supabase platform incident**, not our code. status.supabase.com: *"Increased response times for requests"* — impact **major**, opened 2026-08-27 17:20Z, "monitoring" since 08-28 21:06Z, **unresolved** at 16:59Z 08-29.
2. Our project's **Auth JWKS endpoint** (`/auth/v1/.well-known/jwks.json`) went from ~50 ms to **avg 62 s / max 266 s** (16:00Z hour) and **avg 41 s / max 205 s** (15:00Z). `/auth/v1/token` up to 130 s. A few PostgREST calls also slow (`ventas` 254 s, `marcadas_presencia` 171 s), most fine (<300 ms).
3. **Why one slow endpoint freezes every page:** every server request runs `supabase.auth.getClaims()` — admin proxy (`apps/admin/src/proxy.ts:78`), `requireOperator` (`packages/data/src/server/_auth.ts:19`), `activacion.ts:157`, `agenda-miembro.ts:272`, plus the client proxy. `@supabase/ssr` builds a **new client per request**, so auth-js's in-instance JWKS cache (`jwks_cached_at`, `JWKS_TTL`) never survives → **every request re-fetches the JWKS**. Auth latency × N calls per render = minutes per page. Pages DO eventually load (my forge-demo login landed on `/inicio` after **2 min 9 s**).
4. **Verified NOT the cause** (don't re-do): the `es_principal` push `95583ac`, forge's `gym_domain`/`booking_enabled`/membership rows, DB (no errors, no locks, no long queries, no duplicate RPC overloads), Turnstile, allow-list, forge brand module, slice-2 data shapes. Forge hosts serve 200 with `data-brand="forge"`; forge's own PostgREST calls all 200 in <300 ms.
5. **What we owe:** make `getClaims()` never block on Supabase Auth — in-process JWKS cache + fetch timeout + embedded public-key fallback (§3). Not coded yet. Owner said "nice suggestion" → build it next session, ship on a branch, owner-consented push.

---

## 1. How it was diagnosed (so the next session can re-check in 3 calls)

```sql
-- MCP query_logs (ClickHouse; window ≤ 24 h, pass both timestamps)
select toStartOfHour(timestamp) h, count(*) n,
       max(toInt32OrZero(log_attributes['response.origin_time'])) max_ms,
       avg(toInt32OrZero(log_attributes['response.origin_time'])) avg_ms
from logs where source='edge_logs'
  and log_attributes['request.path']='/auth/v1/.well-known/jwks.json'
group by h order by h
```
Healthy = avg < 200 ms. Degraded on 08-29: 02:00Z avg 5.8 s (max 45 s), 15:00Z avg 41 s, 16:00Z avg 62 s.

```
curl -s https://status.supabase.com/api/v2/incidents/unresolved.json | head -c 600
curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  https://hjppxawglmukfvsgmcog.supabase.co/auth/v1/.well-known/jwks.json
```
From this machine the JWKS answered in 0.2 s even while Vercel's calls took minutes — the slowness is between Vercel's region and Supabase's edge/Auth, so **a local curl proves nothing**; read the edge_logs.

Browser repro (t3 preview tab): `forge-demo-admin.ibookit.lat/login` → `demo@red-demo.test` / `RedDemo!2026` (forge-demo operator) → button "ENTRANDO…" for 2 min → `/inicio` renders fully. `login-form.tsx:69-70` does `router.replace("/inicio"); router.refresh()` — two RSC fetches, each blocked in the proxy's `getClaims()`.

Other findings while looking (all benign): 8 × `POST /auth/v1/token → 400` in 24 h are RED members (`invalid_credentials`, one `email_not_confirmed`); Ivan Acuña / Ivan Montañez signups are RED, hook ran fine; forge's owner `nahumtrevizo2@gmail.com` last successful login 08-27 02:11Z (before slice 2 deploy — coincidence, slice 2 is not implicated).

---

## 2. What to tell forge / RED (operator comms)

- "Supabase (nuestro proveedor de base de datos) tiene un incidente de lentitud desde el 27; las pantallas **sí cargan**, tardan 1–2 min. **No recargues** — cada recarga reinicia la espera." Roster marks themselves are fast once a page is up.
- Fallback for a class in progress: paper, then batch-enter in `/asistencia` (past entries supported).
- Nothing to re-login, no data lost, no config change on our side.

---

## 3. The fix we owe — JWKS never blocks (owner-approved direction, NOT built)

**Fact checked:** installed `@supabase/auth-js@2.106.2` — `getClaims(jwt?, options)` accepts `options.jwks: { keys }` (or `options.keys`), and `fetchJwk(kid, jwks)` checks the passed keys **before** the instance cache and before the network (`GoTrueClient.js:4721-4838`). So supplying keys skips Supabase Auth entirely when the `kid` matches.

**Design (ponytail-minimal):**
1. `packages/data/src/server/jwks.ts` — module-level `let cache: { keys, at }`; `getJwks()`:
   - return cache if `< 10 min` old;
   - else `fetch(<SUPABASE_URL>/auth/v1/.well-known/jwks.json, { headers: { apikey }, signal: AbortSignal.timeout(3000) })`; on success set cache;
   - on timeout/error: return stale cache if any, else the **embedded fallback** (`JWKS_FALLBACK` constant = the current public keys — public material, safe to commit; fetch it with the curl above and paste). Log one line on fallback.
   - never throw.
2. Every `getClaims()` → `getClaims(undefined, { jwks: await getJwks() })`: `apps/admin/src/proxy.ts:78`, `apps/client/src/proxy.ts` (find its getClaims), `packages/data/src/server/_auth.ts:19`, `activacion.ts:157`, `agenda-miembro.ts:272`. Grep `getClaims(` to be sure there are exactly these.
3. Key-rotation safety: if the token's `kid` is not in the supplied set, auth-js falls back to its own network fetch — so a rotated key degrades to today's behavior, never to a lockout. Note it in the helper's TSDoc.
4. What this does NOT fix: an **expired** access token still needs `/auth/v1/token` (refresh) — once per hour per session; acceptable. And PostgREST slowness stays PostgREST's.
5. Tests: one vitest for `getJwks` (fresh → fetch; within TTL → no fetch; timeout → fallback; stale-but-present → stale wins over fallback). `pnpm test:e2e` green (auth surface — AGENTS.md convention). No migration → no `test:denial`.
6. Ship: branch → gates → owner-consented push. Both apps deploy.

**Rejected:** `getUser()` (hits `/auth/v1/user`, same degradation); switching to `getSession()` (unverified, ADR-0001 forbids); larger auth refactors.

---

## 4. Everything else open (carried from the RED domain session)

| Item | State | Owner |
|---|---|---|
| RED custom domain | **DONE** — `es_principal` LIVE, fix pushed `95583ac`, owner step-4 walk GREEN; runbook `docs/runbooks/red-custom-domain-cutover.md` | — |
| Step 6 announce (irreversible) | copy ready in `docs/operador/red-tu-direccion.md` | owner |
| Mobile lane F1.7 | paste runbook §6 F1.7 into worktree-only `docs/mobile/HANDOFF-2026-08-26-RESKIN-EXECUTION.md` before merging main (postgrest belt is `order(col)` asc-only, no `not`) | next mobile session |
| `/activar` cross-tenant shield | runs as anon → reads no `gym_domain` → never redirects; pre-existing, ticket-worthy | agent |
| SAT persona-física details | nombre, RFC, régimen, domicilio fiscal, correo | owner |
| DMARC `redfunctionaltraining.com` | NXDOMAIN → publish `p=none; rua=`; don't touch MX/SPF | owner |
| Registrar auto-renew/lock/2FA | unknown | owner |
| TLS certs `ibookit.lat` | expire 2026-10-07; calendar check 2026-09-10 | owner |

---

## 5. Traps for the next session

- **`query_logs` window must be ≤ 24 h and both `iso_timestamp_start`/`end` explicit**, else "The log window can be at most 24 hours."
- The t3 preview `preview_type` fails with `role=` locators on this form; CSS `form > label:nth-of-type(1) > input` works. `preview_snapshot` on a background tab fails — open it visible.
- `edge_logs` has no caller host; `gym?select=…&slug=eq.forge` requests come from the `?gym=`/cookie override arm on an unmapped host (proxy.ts:32), not from forge-admin.
- Vercel CLI is logged out on this machine (`npx vercel whoami` → "Logged out"); function logs need the dashboard.
- Never push to "fix" a Supabase incident; the only deploy worth making is §3.
