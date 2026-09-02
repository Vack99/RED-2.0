# Project breaking points — 2026-09-01

**Next session starts at** `2026-09-01-breaking-points-START-HERE.md` (validate the catalog; do not scope a fix from this map).  
This file is the **verdict**: ranked 8, five stresses, numbers, keep/exit. Evidence the ranking compressed lives in `2026-09-01-breaking-points-evidence.md`. The validate work list is `2026-09-01-breaking-points-catalog.md`.

**Status:** audit (cross-examine tier 2)  
**Not** the architecture-diagram pass. This is the product under five stresses.  
**Feeds three later reviews after validation.** Each finding is tagged `shared` | `admin` | `client`.

| Review | Owns |
|---|---|
| **shared** — both apps + connections | Auth/cookies/proxy/refresh, fetch-shield, RPC gates, edge deploy, mail bucket, tenant cache, console-only state |
| **admin** — desk | Vender remount, `eliminar_venta` vs RESET, toggle/pase invert, roster 1000-row cap, `staff_gym()` |
| **client** — booking | Stay-logged-in, `/reservar` self-heal, dropped-response book lie, activation wedge, dual-host jars |

**What is actually solid (one paragraph):** a single Postgres RPC is one transaction. `registrar_venta` saldo+folio, `reservar_clase` reservation+consume, `cancelar_reserva` cancel+refund, `toggle_pase` mark±1 do not tear mid-function. The 2026-08-27 sales outage wrote **zero** money rows (PostgREST 300 before SQL). Same-mount Vender retry reuses one idempotency key. Occupancy serialization among `reservar_clase` callers is **inferred from the advisory lock, unmeasured** (no two-connection suite). The remaining failures are **after commit**, **anti-idempotent retries**, **gates that are conventions**, and **a second writer the repo may not see**.

---

## Ranked weaknesses (worst first)

### 1. The tests that can see a write/session failure are not in the hook — `shared`

CI and pre-commit are `lint + typecheck + pnpm test` (+ `build` in CI). `packages/data` mocks `.rpc()`. `test:denial` and `test:e2e` are documented conventions; unset e2e creds **skip, exit 0**.

Already shipped through that hole:

| Incident | What tests could not see |
|---|---|
| **#78** | Create path dropped verified `email` |
| **465dcf4** | 8 days of healthy token rotation; member walked to a password form |
| **2026-08-27** | `registrar_venta` 14-arg sibling, **~9h15m** 100% sales outage, 7× `300 PGRST203` |

The overload guard only replays **committed** migrations. The cause was **prod SQL not in the repo** (mobile-lane `p_gym_id` widen). That class is still invisible to `pnpm test`. Written-row suites for the 11 widened RPCs are still owed (`docs/audits/2026-08-27-registrar-venta-overload-outage.md`).

**Breaks at:** 1 merge that changes what a writer writes, or 1 live `CREATE OR REPLACE` at stale arity, if the human gate is skipped. Count of #78-class incidents is already **1**. Count of PGRST203 sales blackouts is already **1**.

### 2. Attendance is a toggle; a lost response + retry inverts the row — `admin`

`toggle_pase` / `pasar_lista_sesion` ON↔OFF in one RPC (`supabase/functions-canonical/toggle_pase.sql`). Desk UI rolls the optimistic flip **back** on any thrown/network error (`asistencia.tsx` catch), then the next tap **unmarks** and refunds. Unique indexes prevent two **active** visit rows; they do not preserve the first outcome. Agenda roster busy-flag is React **state**, not a ref (the editor already had to fix that).

`fijar_asistencia` converges on `p_presente` and is **unused** by the desk.

**Breaks at:** 1 timeout after a committed mark.

### 3. Force-quit after a committed sale, then remount, is a second charge — `admin`

Idempotency key is `useState(() => crypto.randomUUID())`, reset only in `resetForm` (`vender.tsx:78-82, 296-298`). `canSubmit` includes `!submitting` (`:155`) — same-mount double-tap is covered. Kill the tab / lose the response after `registrar_venta` commits (invite+recibo still running, Vercel default ~10–15s, no `maxDuration` on the action) → toast “No se pudo cobrar” → reopen VENDER → **new UUID** → second FULL RESET sale. Unique is `(gym_id, idempotency_key)`, not `(cliente, day, paquete)`. Two admin tabs = two keys by construction.

Mail after the RPC is best-effort (`enviarReciboDeVenta` never throws). Same-key retry **re-sends** mail.

**Breaks at:** 1 remount after a committed RPC the operator never saw.

### 4. Refresh consume-not-deliver signs the device out; admin is fail-hard — `shared` + `client`

`POST /auth/v1/token` is unbounded on purpose (`fetch-shield.ts:30-36`). GoTrue consumes the old refresh token; if Set-Cookie never lands (force-quit, function kill, signal loss) and the next load is past `refresh_token_reuse_interval = 10s`, the code is `refresh_token_already_used`. Client proxy **rides teardown** for that code (`apps/client/src/proxy.ts` `CODIGOS_SESION_MUERTA`). Admin proxy has **no** park: any `_removeSession` batch writes.

Lived: 465dcf4 (surface, not this race). This race is the remaining mechanism.

**Breaks at:** 1 abandoned navigation after a successful rotation whose cookies did not land.

### 5. `/reservar` puts a removed member back; any-gym membership paints the wrong week — `client`

`reclamar_o_crear_cliente` upserts `gym_membership(member)`. `/reservar` re-runs `intentarReclamoPorEmail` when `getEsMiembro` is false (`apps/client/src/app/reservar/page.tsx`). ADR-0016 names this as untouched.

`getEsMiembro` is `gym_membership.limit(1)` — **no gym filter** (`agenda-miembro.ts:139-142`). Member of A on B’s host skips claim; `resolverMiembroGym` falls back to **oldest** membership (`inquilino.ts`). Gym A’s week under gym B’s chrome.

**Breaks at:** 1 membership DELETE of a member who still has the password; or 1 visit to a second host while already a member somewhere.

### 6. Dead Monday cron + #249 skip = empty live calendar — `shared` + `admin` + `client`

`roll-class-horizon` is pg_cron `0 8 * * 1` UTC. `ensureSemanaMaterializada` **returns without RPC** for weeks 0–5 (`agenda.ts:304-309`). Members **never** materialize (`agenda-miembro.ts`). Spec: “#249's fix removed the view-time self-heal.”

90 days unused does **not** stop pg_cron by itself. A **paused project** or a dead job does. Then this week is empty; opening Agenda does not heal; next auto-heal is Monday 08:00 UTC. Catch-up is 6 weeks × every gym against a **120s** statement cap (~20–50ms/gym → timeout ~2,400 gyms cold).

Vercel hourly cron watches auth/mail wedges, **not** `gym_horizon_depth`.

**Breaks at:** 1 missed Monday with no postgres-role manual `select cron_materialize_horizon()`.

### 7. One gym’s ~900th member silently vanishes from the desk — `admin`

`getClientesLite` / pase / roster are un-ranged selects. PostgREST `max_rows = 1000`. Accepted-debt L-001–L-003 trigger **900**. Truncation = a present member unfindable at check-in. Windowed *paint* does not page the query.

**Breaks at:** 901 clientes in one gym.

### 8. Activation/mail is a second identity factory; console state is invisible to every guard — `shared` + `client` + `admin`

Lived: Sarahí 34h wedge; desk sale minted a parallel `clientes` row (`auth_user_id` NULL). `registrar_venta` create does not consult `auth.users`. No unique `(gym_id, tel)`. Merge runbook: delete-before-repoint **cascades** ventas.

`send-email` is not deployed by `git push`. Auth mail **50/h** project-wide. Resend Free **100/day**. `/auth/confirm` consumes `token_hash` on GET. Site URL / allow-list / Turnstile hosts / JWKS pin / PITR are dashboard-only.

**Breaks at:** 1 wedged signup + 1 walk-in sale on the same email; or 1 `send-email` edit that Vercel ships and Supabase does not.

---

## The five stresses

### A. Stressed to the top

| What binds first | Number | Bound by | Review |
|---|---|---|---|
| Silent roster truncation | **901** clientes / gym | PostgREST `max_rows` 1000 | admin |
| Occupancy stampede | cupo **4–40**; waiters share **one** advisory lock; `statement_timeout` **8s** | Tail gets timeout, not `Clase llena`. Oversell among RPC callers prevented only while every writer uses `reservar_clase`. **Untested** (no two-connection suite) | client + admin |
| Shared Postgres | **`max_connections = 60`** (live 2026-07-28) | Two Vercel apps + pg_cron + studio. Dual `pdx1` does not isolate | shared |
| `resolveTenant` cache | **500** FIFO / isolate, **60s** TTL; admin+client keys double the slots | Unbounded POST `gym_id_por_host` after eviction | shared |
| Monday cron | **120s** postgres cap; ~20–50ms/gym; shard before **~2,000** gyms | Serial fleet walk. Catch-up after outage is 6× work | shared |
| Mail | Auth **50/h**; Resend **100/day** | Return-wave / onboarding day | shared |
| Respaldo default 24 months | ExcelJS OOM ~**500–600k** rows; body cap ~**4.5 MB** | One Node buffer, not streamed | admin |
| `mi_membresia` | no `ventas(cliente_id)` index | Seq-scan platform sales on every plan card | client |

Walk-ins use a **different** lock (`pase:{cliente}`) and are allowed to print over cupo (owner 2026-08-03). No unique occupancy cap.

### B. 90 days unused, then everyone comes back

| Surface | What is already true | Review |
|---|---|---|
| Phone session | iOS ITP ~**7d** on JS-writable cookie; website-data ~**30d**. Owner ruling is stay-in as long as possible. **Mass re-login.** | client |
| GoTrue session | `not_after = null`; 21-day live measurement. Server would still refresh **if** the cookie arrives | shared |
| Operator desk | Same cookie physics; **fail-hard** proxy. First blip signs them out | admin |
| Calendar | If pg_cron ran: weeks 0–5 exist. If it died: **empty this week**, no view-time heal | all |
| Membership | `vence` 90 days ago → UI Vencido + RPC `Paquete vencido`. Stored `clases_restantes` **not** zeroed (lazy forfeit) | client + admin |
| Sale correction | 30-day window; after 90d the desk **cannot** edit/delete that venta | admin |
| Invites | **No TTL**. 90-day-old code still claims. OTP/recovery **3600s** — old mail is dead | client |
| Wedge alerts | Hourly cron drops rows older than **30d**. Abandoned signups go dark | shared |
| Catch-up cron | 6 weeks × fleet vs 120s — first binder if the job was dead | shared |

### C. Human using the app (tap, lose signal, force-quit, switch account)

| Gesture | What happens | Corrupt? |
|---|---|---|
| Double-tap COBRAR same mount | Button off while `submitting`; same `idemKey` → existing folio | No (mail may duplicate) |
| Force-quit after sale commit, reopen VENDER | New UUID → **second FULL RESET** | **Yes — money** |
| Two admin tabs | Two keys | **Yes — money** |
| Double-tap Reservar same sheet | `useTransition` disables; unique blocks same class | No |
| Lost book response, then book **another** class | First consume already happened | **Yes — saldo** |
| Lost book response, retry **same** class | `Ya reservaste` (error on success) — UX lie, no second consume | Lie, not a second row |
| Toggle / pase, timeout, tap again | Optimistic rollback + anti-idempotent RPC | **Yes — asistencia ± saldo** |
| Force-quit during refresh | Consume-not-deliver → `already_used` → teardown | Session, not money |
| Switch host (member) | `__Host-` jars disjoint; any-gym `getEsMiembro` may paint the other gym | Wrong week, possible mint |
| Switch account | No switcher; must local `signOut`. Default `signOut()` without `scope: "local"` is **global** (already happened) | Other devices die |
| Delete member membership | Next `/reservar` remints it | Removal is not durable |

### D. One-line next month, `pnpm test` still green

Ranked by plausibility × blast. All of these skip `test:denial` / `test:e2e`.

| # | Edit | Guarantee that dies | Review |
|---|---|---|---|
| 1 | Omit `cookieOptions: SUPABASE_COOKIE_OPTIONS` at **one** of four `@supabase/ssr` sites | Silent empty session (#209). **No** exhaustiveness guard | shared |
| 2 | Timeout `POST /auth/v1/token` “to finish the shield” | `refresh_token_already_used` mass sign-out. Test only asserts RPC POST unbounded | shared + client |
| 3 | `signOut()` without `{ scope: "local" }` | Global revoke. Already lived. **No** test | client / admin |
| 4 | `resolveTenant(null, h.get("x-gym"))` on a Server Action | Presentation header becomes authz; mints membership (ADR-0008) | client |
| 5 | `CREATE OR REPLACE registrar_venta` same arity, `SECURITY DEFINER` | RLS no longer scopes money. Canon-drift compares **bodies only** | shared + admin |
| 6 | Drop `email` / `gym_id` from a writer INSERT | #78 class. Coverage guard checks suite **exists**, not written columns | shared |
| 7 | `getClaims()` → `getSession()` on a page/proxy | Cookie is not a verified JWT. App pages are untested | admin / client |
| 8 | Stale `JWKS_FALLBACK` after key rotation | Mass bounce while `jwks.json` is down. Test only `importKey`s the JWK | shared |
| 9 | `host` → `x-forwarded-host` | Spoofable tenant (ADR-0012). No header-name test | shared + client |
| 10 | Pre-push `exit 0` | Stale `send-email` on live. Hook not in `pnpm test` | shared |

Most likely **green-and-fatal** combo: a fifth Supabase client without the shared cookie options, **or** “completing” fetch-shield on `/token`.

### E. Every await is 30s; every network call fails halfway

Postgres RPC: exception → **full rollback**. Damage is **after** commit. Default Vercel action budget ~10–15s; only `/api/cron/alertas` sets `maxDuration = 60`. A 30s await **kills the function after the write**.

| Operation | Commit | If the second hop dies | Retry |
|---|---|---|---|
| `registrar_venta` | Sale+saldo | Operator sees failure | Same mount: safe + duplicate mail. Remount: **second sale** |
| `toggle_pase` / `pasar_lista` | Mark±1 | UI rolls back | **Inverts** |
| `reservar_clase` | Spot+consume | UI error | Same class: error. Other class: **second consume** |
| `cancelar_reserva` | Refund | UI still reserved | Second cancel errors; no double refund |
| Invite/recibo | (after sale) | Best-effort | Duplicate inbox |
| `preparar_invitacion` → Resend → stamp | Claim code | Stamp missing | Duplicate mail |
| `activar-cuenta` `createUser` then link | Auth user | Orphan confirmed user | `cuenta_existente` |
| `send-email` hook | OTP already minted | Resend 200 + hook 503 = duplicate mail; 4xx mapped 200 = **burned OTP** | |
| Proxy refresh | GoTrue rotation | Cookies never land | `already_used` → sign-out |
| `ensure_week_materialized` | Week rows | Empty/slow agenda | Idempotent |
| Respaldo | none | Truncated file | New snapshot |

**Worst desk path under this mandate:** attendance invert (#2). **Worst money path:** sale remount (#3). **Worst member path:** burned refresh + password form (#4).

---

## Breaking-point table (numbers only)

| Component | Breaks at | Bound by |
|---|---|---|
| Write-RPC CI | 1 skipped `test:denial` | Convention, 1 scratch project beside live |
| Session CI | 1 skipped `test:e2e` | Needs real login; unset creds skip |
| `toggle_pase` | 1 lost response | Anti-idempotent RPC + optimistic rollback |
| `registrar_venta` remount | 1 new UUID after commit | Unique is per key, not per (cliente, day) |
| Refresh | 1 consume-not-deliver > **10s** | `refresh_token_reuse_interval` |
| JWT after revoke | ≤ **3600s** | ES256 local `getClaims` (ADR-0016 trap, sprung) |
| Member cookie | ~**7d** ITP / ~**30d** iOS | `httpOnly: false`; free tier cannot time-box |
| `/reservar` self-heal | 1 sign-in after membership DELETE | RPC upsert |
| Horizon | 1 dead Monday | #249 skip weeks 0–5 |
| Cron timeout | ~**2,000–2,400** gyms | 120s × 20–50ms/gym |
| Roster | **901** clientes | `max_rows` 1000 |
| Postgres pool | **60** connections (2026-07-28) | Dual apps + cron |
| Tenant cache | **500** entries / isolate | FIFO; POST host lookup unbounded |
| Auth mail | **50/h** project | One bucket |
| Resend Free | **100/day** | Shared bounce budget |
| Invite code | **never** | No TTL |
| Sale edit/delete | **30d** from `created_at` | RPC window |
| `eliminar_venta` vs RESET | 1 delete of a non-latest sale | Still stack-undo arithmetic |

---

## Keep verdicts and exit triggers

Keep **SQL as the write contract** (do not move `registrar_venta` into TypeScript).  
**Exit trigger:** a second #78-class write defect on `main` with `pnpm test` green and `test:denial` not run, **or** a second PGRST203-class sales blackout.

Keep **two apps + one Auth project**.  
**Exit trigger:** a third `proxy.ts` (mobile) ships without the client fail-soft park **and** without `cookieOptions` exhaustiveness — or membership-removal of a member is required to be durable and `/reservar` still remints.

Keep **unbounded POSTs** in fetch-shield.  
**Exit trigger:** a timed-out write is observed to **duplicate a sale**, or aborting refresh is observed to mass-sign-out (>1 device in a 24h window). Then the shield comment is wrong and the policy must change with a test that would have caught it.

`undecided — owner:` is 901-member truncation a ship-blocker before the second gym hits 500, or is the trigger still “recalibrate when crossed”? L-001 already names 900.

---

## Mapping for the three reviews

**shared (start here)**  
Gates (#1), fetch-shield + region + JWKS (#3 in red-team numbering), cookies/proxy split, `gym_id_por_host`, edge-deploy hook, mail caps, console-only state, horizon cron + #249, `staff_gym()` UUID order, generated types omitting `p_gym_id`.

**admin**  
Vender remount (#3), `eliminar_venta` stack-undo after RESET, toggle/pase invert (#2), roster 1000 cap (#7), desk-minted duplicate vs wedged auth (#8), two-tab sales, `maxDuration` unset on actions.

**client**  
Stay-logged-in vs ITP (#4), `/reservar` self-heal + any-gym paint (#5), dropped-response book lie, activation GET-burn, dual `__Host-` jars, `signOut` scope.

---

## Confidence ledger

| Claim | Basis |
|---|---|
| CI/pre-commit omit denial + e2e | **measured** — `.github/workflows/ci.yml`, `.husky/pre-commit` |
| `canSubmit` includes `!submitting`; idemKey per mount | **measured** — `vender.tsx:78-82,155` |
| `eliminar_venta` subtracts `venta.clases` from current saldo | **measured** — canonical SQL:60-68 |
| `getEsMiembro` has no gym filter | **measured** — `agenda-miembro.ts:139-142` |
| Weeks 0–5 skip view-time materialize | **measured** — `agenda.ts:304-309` |
| 9h15m sales outage, #78, 465dcf4, 266s IAD, 21-day session | **asserted** from dated repo audits (not re-queried live this turn) |
| Remount after committed sale → second charge | **modelled** — key lifecycle + unique index; not a counted live incident |
| Toggle invert after timeout | **modelled** from RPC+UI; Veronica extras **not sourced** as this gesture |
| Occupancy no-oversell under the lock | **inferred-from-code**; **unmeasured** — no concurrent suite |
| `max_connections = 60` still | **asserted** — 2026-07-28 probe |
| iOS ITP 7d / 30d eviction | **asserted** — ADR-0016 + vendor; not re-measured |
| Whether pg_cron counts as free-tier “activity” | **unmeasured** |
| Aborting HTTP to PostgREST rolls back vs leaves committed RPC | **unmeasured** |

---

## Could not determine (experiment)

| Open | Experiment |
|---|---|
| How many of 34 write suites assert **written rows** vs return values | Read each file in `rpc-coverage.json` |
| Occupancy timeouts at cupo | pgbench N=`2×cupo` and N=200 `reservar_clase` on scratch |
| Live `max_connections` / pooler / PITR | Dashboard, not git |
| `eliminar_venta` used on a post-RESET non-latest sale | Prod query + folio |
| Cookie `maxAge` 400d still SDK default | Read installed `@supabase/ssr` |
| Hosted Auth `not_after` still null | `select not_after from auth.sessions` |
| `apps/mobile` signature drift vs repo | The untracked tree vs `pg_proc` |

---

## Owner-input (no agent can derive)

- Treat 901-member truncation as a ship-blocker now, or wait for the trigger?
- Must member removal stay non-durable?
- Is a 7-day iOS logout acceptable against the “longest period possible” ruling?
- PITR on or off — gates say add it before you sell; ADR-0006 says Supabase owns DR.
- When the third app (mobile) is real, is a third `proxy.ts` allowed to exist?

---

## Dissent log

- **D1 month-boundary as a live dashboard bug:** withdrawn in `docs/FIndings/2026-07-13-respaldo-mensual-base-defects.md` (fetch is a superset; bucketing is gym-local). Residual: `ventas.fecha` is timestamptz named like `asistencias.fecha` (`date`); the **next** windowed money reader can repeat it. Do not re-accuse the current card.
- **Occupancy oversell:** lock should prevent it among `reservar_clase` callers; there is **no** unique cap; walk-ins and cancel-vs-book are outside the lock. Rank as untested, not as a known oversell.
- **cookie-options.ts `SECURE_COOKIES = isProd`:** boolean is intentional, not a truncated assignment.

---

## Blind spots

- Did not re-run `test:denial` or `test:e2e`.
- Did not line-diff admin vs client `proxy.ts` beyond the two analyst passes.
- Did not open `apps/mobile/` beyond git status (untracked).
- Did not `EXPLAIN` live `mi_membresia` / `contar_reservas_activas`.
- Did not read every denial suite for written-row assertions.
- Did not load the three apps in a browser this turn.
- Legal/DPA, Apple review, and marketing surfaces were out of scope.

---

## Draft audit

- Cut “the architecture is sound so writes are safe” — adequacy without a number (Rule 7); the 08-27 outage is the number.
- Cut “RLS is the standard way to isolate tenants” — substitution test (Rule 4).
- Ranked **8** weaknesses (tier-2 floor). Toggle invert kept above sale remount because it is the default desk retry, not an edge remount.
- `eliminar_venta` vs RESET is inside admin review, not the top-8 product rank: it needs an operator to press Eliminar; toggle/sale-remount fire on timeouts.
- Tagged 08-27 / #78 / 465dcf4 / IAD as **asserted from dated audits**, not live re-probes (Rule 5).
- Keep of SQL-owns-writes carries a numeral (second #78 or second PGRST203).
- Swept: adequacy-without-number, keep-without-digit, substitution praise, untagged load-bearing claims, ranking under floor, all-escape-tag research-plan. Hits listed above.
- Coverage critic (this session): occupancy is not “solid”; #2/#3 are modelled not counted; global `signOut()` without `scope: "local"` is under-ranked relative to its lived incident; iOS 7d re-login is more certain than the consume-not-deliver race; mail caps can bind before the 901-member desk cap; RLS/PITR/`apps/mobile` live drift were not examined and **can** outrank #1 if they fail.

---

## Coverage critic (roster)

Territories that could **change the ranking** if they fail, and were not examined this turn:

| Miss | If it fails | Vs current #1–8 |
|---|---|---|
| Live `pg_proc` vs repo / `apps/mobile` | 08-27 class is *now*, not next | **Can outrank #1** |
| RLS / anon GRANT / host as write gym | Cross-tenant money | **Can outrank all eight** — no policy result this pass |
| PITR on/off | No rewind after a bad replace | **Can outrank #1** as durability; unknown |
| Two-connection occupancy | Class of 4 with 5 seats | Enters ~#2–6; does not beat #1 |
| Denial suites assert return values only | `test:denial` is hollow | Deepens #1 |
| A live Server Action already trusts `x-gym` | Mint, not paint | Merges with #5 |

**Under-ranked given evidence already in this file:** global `signOut()` without `scope: "local"` (lived, untested) — **client** review should treat it as a peer of #4, not a one-liner footnote. iOS ~7d mass re-login is more certain than the consume-not-deliver race. Auth 50/h and Resend 100/day can bind before per-gym 901.
