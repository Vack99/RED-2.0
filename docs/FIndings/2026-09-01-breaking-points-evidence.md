# Breaking-points evidence — citations the map compressed

Read `2026-09-01-breaking-points-START-HERE.md` first. Open a heading when a catalog `ev:` points here.
Do not re-rank. Lines drift; match by file + symbol.

---

## write-path

**RPC = one PostgREST call = one transaction.** Mid-function failure rolls back. Damage is retry / post-commit.

### Indexes that save a row, not a retry

| Unique | On | Saves | Does not save |
|---|---|---|---|
| `ventas_idem_gym_uq` `(gym_id, idempotency_key) WHERE key IS NOT NULL` | `20260710120000_renewal_schema_prep.sql` | same-key replay | remount (new UUID); NULL keys coexist |
| `ventas_folio_gym_uq` `(gym_id, folio)` | folio migrations | double folio | double sale with two keys |
| `reservation_member_session_uq` `(member_id, class_session_id)` | `20260706170000_create_reservation_and_reservar_clase.sql:62` | second book of **same** class | book of **another** class after lost success |
| `asistencias_sesion_cliente_activa_uq` `(class_session_id, cliente_id) WHERE deleted_at IS NULL` | `20260728120000_asistencias_visit_invariants.sql:67-79` | two active visit rows | toggle invert |
| `asistencias_cliente_fecha_libre_uq` `(cliente_id, fecha) WHERE deleted_at IS NULL AND class_session_id IS NULL` | same | two free-visit rows | toggle invert |
| `clientes_email_gym_uq` `(gym_id, lower(email)) WHERE email IS NOT NULL` | email unique | two claimed emails | two tels; blank email+tel name twins |
| `clientes_auth_user_id_per_gym` | claim | two logins on one gym row | wedged auth user + unclaimed paid row |

No unique `(gym_id, tel)`. No unique occupancy cap.

### `registrar_venta` idempotency

Canonical lookup by `(gym_id, idempotency_key)` then return existing folio (`registrar_venta.sql` ~39-48).
UI: `apps/admin/src/app/(app)/vender/_components/vender.tsx:78-82` (`useState(() => crypto.randomUUID())`), reset only in `resetForm` (~296-298). `canSubmit` includes `!submitting` (`:155`). Button `disabled={!canSubmit}` (`:409`).
DAL: `packages/data/src/server/ventas.ts` passes caller key (`p_idempotency_key`).
Post-commit: `crearVentaAction` `Promise.all(enviarInvitacion, enviarReciboDeVenta)` then `revalidatePath` (`vender/actions.ts` ~55-70). `enviarReciboDeVenta` never throws (`recibo-envio.ts:13-16, 41-43`).
`fetch-shield.ts:30-36` refuses to time out POSTs so a shield retry cannot duplicate a sale. Humans still remount.

Concurrent same-key: one `unique_violation`, retry then hits the found path. Lookup is not `FOR UPDATE`.

### `eliminar_venta` vs FULL RESET

Reset: `v_base_clases := 0` in canonical `registrar_venta.sql` ~134-136 (ADR-0003 Amendment 2).
Delete: `eliminar_venta.sql:60-68` subtracts `venta.clases` / days from **current** `clientes` saldo, then sets `paquete_nombre` from the remaining latest venta.
Floor gate: `saldo - venta.clases < 0` (~40-42). No latest-sale gate.
UI: `pago-sheet.tsx` `puedeEliminar = dentroVentana && !clipeado` (~187-191, 413-418) — any in-window sale.
`editar_venta.sql:173-180` **does** refuse non-latest re-derive.
Suite `eliminar_venta_rules.sql` V4 still **asserts stack-undo** (10 with grants 4+8 → delete 8 → 2) — the test encodes the old arithmetic.

Sequence: sell A (8) → sell B (12, reset, stored 12) → delete A → stored 12−8=**4**, `vence` pulled back by A’s days.

### Toggle invert + refund onto a later RESET

`toggle_pase.sql:45-63`: if active row, soft-delete and `if v_active_consumio and v_clases is not null then clases_restantes + 1`.
`pasar_lista_sesion.sql:58-77`: same flip.
Advisory `pg_advisory_xact_lock(hashtext('pase:' || cliente))` serializes; does not make retry a no-op.
Desk `/asistencia`: ref `inFlight` (`asistencia.tsx:316-337`); catch optimistic rollback (`406-409`).
Agenda roster: **state** `rosterBusy` (`agenda.tsx:245-248`) — same class the editor closed with a **ref** (`200-204`).
`fijar_asistencia.sql:118-176` converges on `p_presente`. Desk does not call it.
Compound: mark (consume 1) → RESET sale → unmark → +1 on the **new** pack.

### Reservar / cancel

`reservar_clase.sql:101` `pg_advisory_xact_lock(hashtext(p_session_id))`.
Active existing: raise `Ya reservaste esta clase` (106-108).
Consume at book (138-146), `UPDATE … WHERE clases_restantes > 0`.
Client UI: `useTransition` disables Reservar (`reservar-semana.tsx:288-291, 504-516`). Not optimistic.
`cancelar_reserva.sql:71-77` guarded `WHERE status = 'reservada'`. **No** session advisory lock.
`revalidatePath` only if `result.ok` (`reservar/actions.ts:19-22, 32-35`).

### Claim

`reclamar_o_crear_cliente`: match verified email; `v_n != 1` → INSERT (~50-85). Already claimed: membership `ON CONFLICT DO NOTHING`, `reclamado: false` (~41-47) — idempotent.
`reclamar_por_codigo`: `FOR UPDATE` on code (~44-48); spent code **errors**. Doors swallow via `intentarReclamo*` (`registro.ts:310-320`).
`registrar_venta` NEW: dup check tel OR email unless `p_forzar_nuevo` (~142-150).
Children of `clientes` `ON DELETE CASCADE` — merge runbook `docs/runbooks/duplicate-member-merge.md`: delete-before-repoint wipes ventas/asistencias/reservas.

### `next_folio` / `editar_venta`

`next_folio.sql:6-13` bumps `gym_folio_counter` inside `registrar_venta`’s txn — abort rolls the counter.
`editar_venta`: `FOR UPDATE` on venta, re-derive only latest. Same GUARDAR twice is a no-op on monto/método. Busy flag is **state** (`pago-sheet.tsx:95, 276-278`).

---

## session

### Two proxies (not one file)

| | `apps/admin/src/proxy.ts` | `apps/client/src/proxy.ts` |
|---|---|---|
| Lines / bytes (2026-09-01) | 111 / 4969 | 200 / 10321 |
| `resolveTenant` + `tenantHeaders` | yes | yes |
| `cookieOptions: SUPABASE_COOKIE_OPTIONS` | yes | yes |
| Route gating | `decideRedirect` | no (page-level) |
| Cookie teardown | ride everything | park deletions-only unless dead-session codes |
| `try/catch` on `getClaims` | no (throw 500s) | yes — keep inbound cookies |
| `x-ruta` | yes | no |
| Fail-soft on GoTrue 5xx | no | yes |

Dead codes (client): `refresh_token_not_found`, `refresh_token_already_used`, `session_not_found`, `session_expired` (`CODIGOS_SESION_MUERTA`).
`esBorradoTotal`: **every** cookie in the batch is empty — not `any` (`proxy.ts` + `proxy.test.ts`). Changing `every` → `some` would fail that test.

Prefetch exclusion was investigated and **rejected** (client proxy comments ~90-97): skipping rotation in the proxy relocates it into RSC `setAll` (no-op) and manufactures consume-not-deliver.

### Cookies

`packages/data/src/cookie-options.ts`: prod `{ name: '__Host-sb-auth-token', secure: true }`. Four sites must match (#209). No exhaustiveness guard.
`__Host-` forbids `Domain`. `red.ibookit.lat` and `www.redfunctionaltraining.com` are disjoint jars (comment :44-49).
`gym` cookie: path/sameSite/secure only — **no maxAge** → browser-session cookie. Auth cookie SDK maxAge **400 days** (repo does not set it; asserted from ADR-0016).
`httpOnly: false` — browser `autoRefreshToken` rewrites `document.cookie` → ITP ~7-day cap (ADR-0016).
`SECURE_COOKIES = isProd` is a boolean. Intentional.

### Numbers

| | |
|---|---|
| `jwt_expiry` | 3600 |
| `refresh_token_reuse_interval` | 10 |
| `otp_expiry` | 3600 |
| Cache | 60_000 ms, 500 FIFO, negatives cached, transient errors not (`resolve-tenant.ts`) |
| JWKS GET | 2.5s then pin |
| Other GET/HEAD | 8s then one **untimed** retry |
| POST / rpc / token | unbounded |
| Lived session | 21 days, `not_after = null` (2026-08-02, ADR-0016) |
| 465dcf4 | 8 days healthy rotation; password form 37s after a 200 refresh (2026-08-21 analysis) |
| `token_refresh` | 150 / 5 min / IP (`config.toml`) |
| EXPIRY_MARGIN | ~90s (auth-js) |

JWKS pin `kid` `76da07da-65ca-404a-a1ab-00c3d0b59d38`, ES256 (`fetch-shield.ts:66-80`). Rotation obligation in the comment. Test only `importKey`s.

### Identity

`getEsMiembro`: `from("gym_membership").select("gym_id").limit(1)` — any gym (`agenda-miembro.ts:139-142`).
`resolverMiembroGym`: host match else oldest membership (`inquilino.ts`).
`/reservar` calls `intentarReclamoPorEmail(tenant.id)` when not a member (`reservar/page.tsx`).
`signOut({ scope: "local" })` at 4 sites (ADR-0016 amendment 2026-08-24). Default without scope is **global**. No test.
Admin `getOperatorGym` is host-aware; leftover `staff_gym()` is `order by gym_id limit 1` (`supabase/functions-canonical/staff_gym.sql`).
Staff on client: `getEsMiembro` true (staff row is a membership) → skip self-heal → hollow week.
`/entrar` and `/registro` redirect a live session to `/reservar`. No account switcher.

Admin has **no** `e2e/session.spec.ts` twin.

---

## idle

`cron.schedule('roll-class-horizon', '0 8 * * 1', 'select public.cron_materialize_horizon();')` in `20260805100000_class_horizon_autoroll.sql:267-271`. UTC Monday 08:00. Idempotent by jobname.
Per-gym subtransaction; summary → `cron_run_log`. Scaling ceiling in the migration header: ~20–50ms/gym vs ~120s postgres cap → ~2,400–6,000 gyms; shard before ~2,000.
Frontier catch-up + ledger prune: `week_start` older than current Monday − 14 days. **`class_session` is never pruned** (spec out of scope, FKs from asistencias RESTRICT).
`HORIZONTE_SEMANAS = 26` (`agenda.ts:289`). `ensureSemanaMaterializada` skips `lunes <= lunesActual+5w` and `lunes > horizonte` (`:304-309`). #249 removed view-time self-heal for weeks 0–5 (`docs/Context/2026-08-08-horizon-cron-spec.md`).
Members: `agenda-miembro.ts` never materializes. Bookable surface is one week.
Backward clamp: target Monday < gym-local current Monday → 0 writes (`materialize_week_for_gym`).
`gym_horizon_depth` exists, revoked from anon/authenticated, **unpolled**. Vercel cron is hourly `/api/cron/alertas` only (`apps/admin/vercel.json`) — auth/mail wedges, not horizon.
`class_session` growth: ~1,040 rows/gym/year (`docs/Context/2026-07-28-audit-evidence/workload-growth.md`). Idle-with-cron-on still writes ~12 unused weeks/gym.
`vence` / `clases_restantes`: forfeit is lazy at read (`forfeit()` in `rules.ts`). RPC `reservar_clase` raises `Paquete vencido` on `vence < hoy` and `vence < session_date`. Stored leftover classes are not zeroed.
Invite: ADR-0015 no TTL. OTP 3600s.
Wedge detector: 30-day actionability ceiling (`registros_atorados`). `maxDuration = 60` on alertas route. 24h log window. Digest 12:00 UTC.
`no_show` is derived at read; no cron flips `reservada` after the class ends. Consume already happened at book (ADR-0010).
Heal residual: 08-23 agenda-duplication audit — cron-outage heal can double NULL-template one-offs.

Whether free-tier pause-after-~7d treats pg_cron as activity: **unmeasured** (`docs/Context/2026-08-04-136-recurrence-cross-examination.md`).

---

## half-fail

Default Vercel action `maxDuration` unset (~10s Hobby / ~15s Pro). Only `apps/admin/src/app/api/cron/alertas/route.ts` sets 60s. A 30s await kills the function **after** the RPC.

`fetch-shield.ts`: GET/HEAD 8s abort + untimed retry (two in-flight reads). JWKS 2.5s → pin. POST never timed, never retried.

| Op | Commit | Second hop | Retry |
|---|---|---|---|
| `registrar_venta` | sale+saldo | invite+recibo+revalidate | same key: no second sale, **mails again**. remount: **second sale** |
| `toggle_pase` / `pasar_lista` | mark±1 | UI rollback on throw | **inverts** |
| `reservar_clase` | spot+consume | error UI | same class: `Ya reservaste`. other class: **second consume** |
| `cancelar_reserva` | refund | UI still reserved | second cancel errors; no double refund |
| `preparar_invitacion` | maybe mint `claim_code` | Resend 10s abort (`invitaciones.ts:56-73`) then `marcar_invitacion_enviada` | duplicate mail; stamp-miss looks unsent |
| `actualizar_cliente` | row | auto-invite | email on row, invite may fail |
| `activar-cuenta` | `createUser` | `generateLink` then `verifyOtp` (`activar-cuenta/index.ts`) | orphan user / burned recovery / `cuenta_existente` |
| `send-email` hook | OTP already minted | Resend then `respuestaEnvio`: null/429/≥500 → HTTP 503 (retry); other incl. 4xx → HTTP 200 | 4xx swallowed = burned OTP; 503 after 200 = duplicate mail |
| signup `registrarSocio` | `signUp` | hook | re-POST rotates previous confirmation token (`UNIQUE (user_id, token_type)`) |
| magic link | send | confirm GET consumes `token_hash` | prefetch/double-click burns it |
| proxy refresh | GoTrue rotation | Set-Cookie may not land | `already_used` |
| `ensure_week_materialized` | week rows | page 500 | `ON CONFLICT DO NOTHING` |
| respaldo | none | truncated file | new snapshot. GET retry = two gathers. OFFSET×RLS quadratic |

`completarActivacion`: password first, then best-effort claim. Abandoned after password, before claim: logged in, code may still be live.

---

## one-liners

Exact plausible edits. `pnpm test` / pre-commit stay green unless noted. Map lists 1–10; 11–15 live here.

1. Drop `cookieOptions: SUPABASE_COOKIE_OPTIONS` at **one** of: admin `proxy.ts`, client `proxy.ts`, `packages/data/src/server/supabase.ts`, `packages/data/src/client.ts`. Or add a fifth `createBrowserClient` without it.
2. In `fetch-shield.ts`, before the GET/HEAD branch, timeout `/auth/v1/token`. Test only asserts `/rpc/registrar_venta` unbounded (`fetch-shield.test.ts` ~L79-92).
3. `signOut()` without `{ scope: "local" }` — e.g. `apps/client/src/app/reservar/_components/cerrar-sesion-link.tsx`. Default **global**.
4. `apps/client/src/app/registro/actions.ts` `resolveTenant(null, h.get("x-gym"))` instead of `host`.
5. Migration: `CREATE OR REPLACE FUNCTION registrar_venta(…same 15 args…)` `SECURITY DEFINER` and/or `SET search_path TO 'public'`. Canon-drift hashes **bodies** (`tools/guards/rpc-canon-drift.test.ts`). Latest INVOKER is default, not spelled (`20260827160000_registrar_venta_overload_fix.sql:22-25`).
6. `CREATE OR REPLACE` a writer omitting `email` / `gym_id` / consent from INSERT. `rpc-write-coverage.test.ts` checks a suite **exists and calls the name**.
7. `getClaims()` → `getSession()` on admin `proxy.ts` or `reservar/page.tsx`. `getSession(` in apps is comments only. DAL fakes implement `getClaims`.
8. Replace `JWKS_FALLBACK` kid/x/y with another well-formed P-256 JWK. Test `importKey`s only.
9. `headers.get("host")` → `get("x-forwarded-host")` at proxy, `auth/confirm/route.ts`, `registro/actions.ts`. No test of the header name. `resolve-tenant.test.ts` takes a host **string**.
10. `.husky/pre-push` last line unconditional `exit 0`.
11. `packages/data/package.json` exports `./src/*.ts` → `./dist/*.js` + a bundler that strips `import "server-only"`. Or drop `@gym/data` from `transpilePackages`. `server-only-coverage.test.ts` reads **source**. CI `pnpm build` may still fail — pre-commit has no build.
12. `alter table class_session add column spots` and/or `reservar_clase` `spots = spots - 1` instead of `contar_reservas_activas_miembro`.
13. Copy `.gte("fecha", monthStartIso(hoy))` onto `ventas.fecha` (timestamptz). `resumen.ts` is pinned to instants. `clientes.ts` `monthStartIso` is for **asistencias** (`date`).
14. In `apps/client/**/_components/**`: `import { createClient } from "@gym/data/server/supabase"`. ESLint restricted-import is **admin-only** (`eslint.config.mjs` ~L20-24). `client-seam.test.ts` checks **path**, not imports.
15. Apply old-arity SQL **on live** (dashboard / MCP) without a repo migration. In-repo `rpc-overload.test.ts` **would** fail a committed second signature.

Most likely green-and-fatal: (1) or (2).

---

## scale

Occupancy: lock then count then insert. **No** UNIQUE/EXCLUDE forbidding the 16th active row. `UNIQUE (member_id, class_session_id)` only. No two-connection suite in `supabase/tests/`.
`hashtext` is int4 — collisions serialize unrelated sessions (conservative). Birthday ~65k keys for 50% any-collision — unmeasured.
`cancel_class_session` does **not** take that lock. `reservation_staff_insert` exists (walk-ins on purpose via `pasar_lista_sesion`).
Walk-ins: lock `hashtext('pase:'||cliente_id)`, excluded from member count, allowed to print over cupo (owner 2026-08-03).
`registrar_venta`: `SELECT clientes FOR UPDATE`; folio via `gym_folio_counter`. Two desks serialize. No unique tel for new walk-in with null email. E5 pgbench never run.

PostgREST `max_rows = 1000` (`config.toml`). L-001 `getClientesLite`, L-002 `getClientesParaPase`, L-003 `getClientesRoster` still one un-ranged select (`clientes.ts`). Windowed paint (50 SSR rows) does not page the query. L-004 JS-aggregates roster, trigger 800.

`max_connections = 60` (live 2026-07-28). Current compute/pooler: unmeasured.
ADR-0017: both apps `regions: ["pdx1"]`. Page functions post-pin: p50 44ms, p95 210ms, max 327ms, 0 >5s (97 calls, 2026-08-29). **3–9 sequential DB round trips per render.** Middleware still global (SJC/LHR/SIN/IAD). 7% of middleware entered IAD post-fix (ADR-0017).
IAD incident: 65 req >5s in 24h, max 266s, all HTTP 200. Same URL from SJC 26–91ms. Origin jwks 3.9ms. Pre-pin: IAD 3,714 calls, 103 over 5s.

`resolveTenant`: 500×60s per isolate; keys `${app}|${host}` double the slots. Two apps × many isolates.

Cron: serial, per-gym exception, ledger skip. First-week fleet or outage heal is the expensive shape. `ensure_week_materialized` skipped for weeks 0–5. Canonical `materialize_week_for_gym` has **no** advisory lock (owner: stray class accepted).

Respaldo: ADR-0006 default 24 months; `?mes=` one month. Pages 1000 then **one Node Buffer**. ExcelJS OOM ~500–600k rows / ~1.9 GB RSS; Vercel body ~4.5 MB ≈ 400k rows (2026-07-13). OFFSET under RLS quadratic. `maxDuration` unset.

`mi_membresia`: `from ventas where cliente_id = v_cli order by created_at desc`. Migrations index `ventas` on `gym_id` and `(gym_id, fecha)` only — **no** `ventas(cliente_id, …)`.
RLS SELECT rewrite 2026-07-14: 42.2 → 2.98 ms on 5k asistencias. INSERT/UPDATE still correlated helpers. `statement_timeout` authenticated 8s / anon 3s. `auto_explain` at 10s **cannot log** a query the 8s timeout already killed.
`contar_reservas_activas*` is DEFINER + `is_member_of` per row, POST (uuid[]), unshielded.

Hourly Vercel cron watches auth/mail, not pool, locks, or `cron_run_log`. `pg_cron` job existence is out of scope of the autoroll SQL comment (verify live).

---

## incidents

### #78 — create path dropped email
`AGENTS.md` denial section. Vitest green. Rows were the contract. `rpc-write-coverage.test.ts` still cannot check that the named suite asserts written columns.

### 465dcf4 — session-blind surface
Katya: auto-refresh 8 days; 37s after a 200 rotation, password form (`docs/Context/2026-08-21-login-session-persistence-analysis.md`). Cause: `/entrar` + CTAs, not token race. Shield: `apps/client/e2e/session.spec.ts` — not in CI; unset creds skip exit 0. One-line: delete `if (data?.claims?.sub) redirect("/reservar")` in `entrar/page.tsx`.

### 2026-08-27 — `registrar_venta` overload, ~9h15m
`docs/audits/2026-08-27-registrar-venta-overload-outage.md`. Uncommitted mobile-lane 15-arg (`p_gym_id`) met repo `CREATE OR REPLACE` at 14-arg. Sibling function. PostgREST 300/PGRST203. **Zero rows written.** Guard `rpc-overload.test.ts` replays **committed** migrations. Still owed: written-row suites for the 11 widened RPCs (`dos_gimnasios_staff_pin{,_agenda}.sql`). Generated types for `registrar_venta` may still omit `p_gym_id` (`database.types.ts`) while live is 15-arg (`20260827160000_…`). DAL passes `p_gym_id` (`ventas.ts:279-283`).

### 2026-08-29 — IAD jwks 266s
`docs/Context/2026-08-29-supabase-degradation-jwks-HANDOFF.md`, ADR-0017. Pin `pdx1` + fetch-shield. Residuals: POST unbounded, GET retry untimed, middleware unpinnable, JWKS pin must rotate with keys.

### 2026-08-30 — Sarahí 34h activation wedge
`docs/superpowers/plans/2026-08-30-auth-door-shield-plan.md`. First click: zero `/auth/v1/verify`. Catch-all told her to use a password that cannot work. Re-POST `/registro` destroyed the previous link. Four mails, four `flow_state` with `auth_code_issued_at NULL`. Desk sale 22:22 minted a second identity (`claim_code YC2YQCPJ`, `auth_user_id NULL`). Repair = raw SQL. **4 of 53** auth accounts wedged; one 17 days. Alert cron watched `invalid_grant` + send-email non-2xx — both 0. FC leftovers still in code: desk sale ignores `auth.users` (FC-06); no unique tel; GET confirm burns token (FC-22); Site URL retired host (FC-10); Turnstile hostnames (FC-14/15); dual member hosts no canonical redirect (FC-11). Some shields shipped (distinct `?error=`, `reenviarConfirmacion`, signup e2e still not in CI).

### Camila — invited, never activated
2026-08-21 analysis: invited 08-14, “wrong password” against a nonexistent account.

### 2026-08-24 — global signOut
Owner asked for password after a week away. Live `auth.sessions` **deleted**, not expired. `signOut` default `scope: 'global'`. Amendment: all 4 sites `scope: "local"`.

### 2026-08-02 — sessions never die
All six `auth.sessions` `not_after = null`. Session from 2026-07-11 still refreshing 2026-08-01 (21 days). Free tier cannot time-box. Pro 30d/14d **rescinded** for members (same Auth project).

### 2026-08-28 — `atp404951` unclaim
Nulling `auth_user_id` does not log anyone out. Live session still short-circuited to VINCULAR (`docs/Context/2026-08-28-atp404951-unclaim-session.md`).

### Mail bucket
Auth **50/h** project-wide. GoTrue floor 60s/address = 60/h, **above** the platform budget. Resend Free 100/day, 3,000/month, bounce <4%. 07-22 audit: 28 invites ever; 1 hard bounce in 18 = 5.6%. One Resend key on invite + receipt + auth hook + alert cron, also the SMTP password. No outbox, no retry (`invitaciones.ts` 10s abort; 429 ≡ 500).

### `enviar_mensaje_contacto`
Rate limit inside `if p_ip is not null` (canonical SQL ~26-33). Caller omits IP → unbounded insert. 07-28 ranked live.

### TRUNCATE
REVOKE in migrations is `gym_legal` only (`20260808140000:78`). 07-28: anon TRUNCATE on 29/29 tables; RLS does not apply.

### D1 month-boundary
Withdrawn as a live dashboard bug (`docs/FIndings/2026-07-13-respaldo-mensual-base-defects.md`). Residual: `ventas.fecha` timestamptz vs `asistencias.fecha` date; 13/41 live ventas (32%) sit on a different UTC day than the gym-local day. Next reader that compares timestamptz to `'YYYY-MM-DD'` repeats it. `gym.timezone` has no CHECK; `"CST"` silently becomes Chicago DST.

### 07-28 scale audit leftover
“12 of 16 ranked weaknesses live at 4 gyms.” Do not reuse 32.8% RLS coverage without a re-count (agenda now `.eq("gym_id")`).

### Edge deploy
`.husky/pre-push` blocks a push that touches `supabase/functions/**` unless `EDGE_DEPLOY_OK=1`. Lived: stale `send-email` v6 (AGENTS.md, 2026-08-04).

---

## what V should not treat as a current dashboard bug

- D1 card totals (withdrawn; patched readers).
- Occupancy oversell among `reservar_clase` callers (lock inferred; untested).
- Walk-in over-cupo print (owner ruling).
- `SECURE_COOKIES = isProd` as a truncated assignment (boolean, intentional).
