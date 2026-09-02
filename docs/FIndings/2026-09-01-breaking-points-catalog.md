# Breaking-points catalog — validate work list

Read `2026-09-01-breaking-points-START-HERE.md` first. This file is Session V’s work list.
Every row starts `status: unverified`. V overwrites that in place with `held` | `refuted` | `stale` | `unmeasured`.

`owner:` is which of the three later reviews inherits the row **after** V. It is not a split of V.

`map:` points at `2026-09-01-project-breaking-points.md`. `ev:` points at a heading in `2026-09-01-breaking-points-evidence.md`.

---

## F-01 — CI cannot see write/session failures
- status: unverified
- owner: shared
- confidence: measured
- map: ranked #1
- claim: pre-commit + CI are lint/typecheck/vitest (+ build in CI). RPC mocked. `test:denial` and `test:e2e` are conventions; unset e2e creds skip exit 0. Hole already shipped #78, 465dcf4, 2026-08-27.
- validate: `.github/workflows/ci.yml`, `.husky/pre-commit`, `vitest.config.ts` (rpc mock), `AGENTS.md` denial/e2e sections, `apps/client/e2e/session.spec.ts` skip-on-unset. Confirm both scripts absent from CI/pre-commit.
- done when: held if still absent; stale if now in the hook.

## F-02 — Attendance toggle inverts on retry after lost response
- status: unverified
- owner: admin
- confidence: modelled (RPC+UI). Veronica extras not sourced as this gesture.
- map: ranked #2
- claim: `toggle_pase` / `pasar_lista_sesion` ON↔OFF. Desk optimistic rollback on error, next tap undoes a committed mark. Agenda roster busy is state not ref. `fijar_asistencia` is idempotent and unused by the desk.
- validate: canonical `toggle_pase.sql`, `pasar_lista_sesion.sql`, `fijar_asistencia.sql`; `apps/admin/.../asistencia/_components/asistencia.tsx` catch/inFlight; agenda roster busy flag vs editor ref. Confirm desk does not call `fijar_asistencia`.
- done when: held if still a toggle + optimistic rollback; refuted if desk now calls `fijar_asistencia` or retry is a no-op.

## F-03 — Sale remount after commit is a second charge
- status: unverified
- owner: admin
- confidence: modelled (key lifecycle). Not a counted live incident.
- map: ranked #3
- claim: `idemKey` is `useState(() => crypto.randomUUID())`, reset in `resetForm`. Same-mount retry is safe (`canSubmit` includes `!submitting`). Remount / second tab = new UUID = second FULL RESET. Unique is `(gym_id, idempotency_key)`.
- validate: `vender.tsx` idemKey + canSubmit + resetForm; `ventas.ts` passes caller key; canonical `registrar_venta.sql` lookup-by-key; unique `ventas_idem_gym_uq`. Confirm no `maxDuration` on vender action.
- done when: held if remount still mints a new key; refuted if key is durable across remount (e.g. sessionStorage) or unique is `(cliente, day, paquete)`.

## F-04 — Refresh consume-not-deliver signs the device out; admin fail-hard
- status: unverified
- owner: shared + client
- confidence: high on code; 465dcf4 is a different (surface) incident.
- map: ranked #4
- claim: unbounded `POST /auth/v1/token`. If GoTrue consumes RT and cookies never land, next load after 10s is `refresh_token_already_used`. Client rides teardown for that code. Admin proxy has no park.
- validate: `fetch-shield.ts` POST exclusion; `apps/client/src/proxy.ts` `CODIGOS_SESION_MUERTA` + `esBorradoTotal`; `apps/admin/src/proxy.ts` absence of park/try-catch; `supabase/config.toml` `refresh_token_reuse_interval`.
- done when: held if still unbounded POST + client teardown on `already_used` + admin no park.

## F-05 — `/reservar` remints membership; any-gym paint
- status: unverified
- owner: client
- confidence: measured
- map: ranked #5
- claim: `reclamar_o_crear_cliente` upserts `gym_membership(member)`. `/reservar` re-claims when `getEsMiembro` is false. `getEsMiembro` is `limit(1)` with no gym filter. Host miss → oldest membership’s week under this host’s chrome.
- validate: `agenda-miembro.ts` `getEsMiembro`; `reservar/page.tsx` claim retry; canonical `reclamar_o_crear_cliente.sql` membership upsert; `inquilino.ts` `resolverMiembroGym` fallback. ADR-0016 consequences paragraph.
- done when: held if still no gym filter and still remints.

## F-06 — Dead Monday cron + #249 skip = empty live calendar
- status: unverified
- owner: shared + admin + client
- confidence: measured (code). Whether pg_cron counts as free-tier activity: unmeasured.
- map: ranked #6
- claim: `roll-class-horizon` `0 8 * * 1` UTC. `ensureSemanaMaterializada` skips weeks 0–5. Members never materialize. Opening Agenda does not heal a missed Monday.
- validate: `agenda.ts` `ensureSemanaMaterializada` clamp; `agenda-miembro.ts` “NEVER materializes”; `cron.schedule` in `20260805100000_class_horizon_autoroll.sql`; live `select jobname, schedule, active from cron.job where jobname = 'roll-class-horizon'`.
- done when: held if skip + schedule still true; stale if view-time self-heal returned.

## F-07 — Roster silent cap ~901
- status: unverified
- owner: admin
- confidence: measured (debt + config). Live cloud `max_rows`: unmeasured.
- map: ranked #7
- claim: `getClientesLite` / pase / roster un-ranged. PostgREST `max_rows = 1000`. L-001–L-003 trigger 900. Windowed paint does not page the query.
- validate: `packages/data/src/server/clientes.ts` those three readers still un-ranged; `docs/health/accepted-debt.md` L-001–L-003; `supabase/config.toml` `max_rows`. Dashboard API settings if possible.
- done when: held if still un-ranged; stale if paged.

## F-08 — Activation/mail second identity; console-blind
- status: unverified
- owner: shared + client + admin
- confidence: asserted from 2026-08-30 Sarahí / 08-21 Camila catalogs; code paths measured where named.
- map: ranked #8
- claim: desk sale does not consult `auth.users`. No unique `(gym_id, tel)`. Merge delete-before-repoint cascades. `send-email` not deployed by git push. Auth 50/h, Resend 100/day. `/auth/confirm` consumes token on GET. Site URL / Turnstile / JWKS / PITR are dashboard-only.
- validate: canonical `registrar_venta.sql` create insert; grep unique tel; `duplicate-member-merge.md`; `.husky/pre-push`; `apps/client/.../auth/confirm/route.ts` GET; `invitaciones.ts` 10s abort. Incidents: ev §incidents.
- done when: each sub-claim held or split (do not lump if some shipped).

---

## Write-path leftovers

## F-09 — `eliminar_venta` still undoes a stack after FULL RESET
- status: unverified
- owner: admin
- confidence: measured (SQL vs reset body)
- map: breaking-point table; off top-8
- claim: `registrar_venta` sets saldo from the new pack only. `eliminar_venta` subtracts `venta.clases` / days from **current** stored saldo. UI allows any in-window sale, not latest-only (`editar_venta` does refuse non-latest).
- validate: canonical `eliminar_venta.sql` vs `registrar_venta.sql` reset; `pago-sheet.tsx` `puedeEliminar`; `editar_venta.sql` latest gate; `eliminar_venta_rules.sql` still asserting stack-undo.
- done when: held if arithmetic still stack-undo; stale if rewritten for reset.

## F-10 — Unmark after a later RESET refunds onto the new pack
- status: unverified
- owner: admin
- confidence: modelled
- ev: write-path
- claim: mark (consumio=1) → sell new pack (reset) → unmark → `clases_restantes + 1` on the new grant.
- validate: `toggle_pase.sql` refund arm reads `v_active_consumio` not “this pack’s consume”.
- done when: held if refund ignores intervening reset.

## F-11 — Duplicate `clientes` (email/auth unique, not tel; sale ignores `auth.users`)
- status: unverified
- owner: admin + client
- ev: write-path, incidents
- claim: `reclamar_o_crear_cliente` matches verified email; phone never claims. `registrar_venta` NEW dups tel OR email unless `p_forzar_nuevo`. No unique tel. Wedged signup + walk-in sale = two rows.
- validate: indexes on `clientes`; canonical claim + venta create; runbook `duplicate-member-merge.md`.
- done when: held if still no `(gym_id, tel)` unique and venta create still ignores `auth.users`.

## F-12 — `signOut()` without `{ scope: "local" }` (lived)
- status: unverified
- owner: client + admin
- confidence: high (ADR-0016 amendment; critic: under-ranked)
- map: one-liner D.3; critic
- claim: default is global. One “cerrar sesión” deleted every device. Four call sites now pass `scope: "local"`. No unit test.
- validate: grep `signOut(` in `apps/`. Confirm all pass `{ scope: "local" }`. Confirm no test asserts it.
- done when: held if still untested; stale if a test exists; refuted if a site dropped the scope.

---

## Session leftovers

## F-13 — Cookie name mismatch at one of four `@supabase/ssr` sites
- status: unverified
- owner: shared
- ev: one-liners
- claim: no exhaustiveness guard (unlike fetch-shield). Mismatch = silent empty session.
- validate: the four sites in `cookie-options.ts` header still share `SUPABASE_COOKIE_OPTIONS`. Grep `createServerClient` / `createBrowserClient` for a fifth. Confirm no `tools/guards` analog.
- done when: held if still unguarded.

## F-14 — Timeout on `POST /auth/v1/token`
- status: unverified
- owner: shared + client
- ev: one-liners
- claim: fetch-shield tests only that an RPC POST is unbounded. Token URL is untested. Adding a timeout would mass-sign-out.
- validate: `fetch-shield.ts` + `fetch-shield.test.ts` POST cases. Confirm `/auth/v1/token` not asserted.
- done when: held if token POST still untested.

## F-15 — Trust `x-gym` as write-side gym
- status: unverified
- owner: client
- ev: one-liners
- claim: ADR-0008 hinge. A Server Action that `resolveTenant(null, h.get("x-gym"))` mints membership. Critic: unknown if already live on a path.
- validate: grep `x-gym` at write doors (`registro/actions.ts`, `reservar/page.tsx`, confirm route). Confirm they re-resolve from `host`.
- done when: held as one-liner if still host-resolved; promote if a live path already uses the header.

## F-16 — `SECURITY DEFINER` / `search_path=public` on `registrar_venta` same arity
- status: unverified
- owner: shared + admin
- ev: one-liners
- claim: canon-drift compares dollar-quoted **bodies**. Overload guard is arity. Vitest mocks RPC. INVOKER is the default, not even spelled.
- validate: `rpc-canon-drift.test.ts`; latest `registrar_venta` create attributes; `prosecdef` not in vitest.
- done when: held if attributes still outside the drift hash.

## F-17 — `getClaims()` → `getSession()` on a page/proxy
- status: unverified
- owner: admin / client
- ev: one-liners
- claim: `getSession()` is cookie, not verified JWT. App/proxy pages untested. DAL fakes implement `getClaims` only.
- validate: grep `getSession(` in `apps/` (comments vs calls).
- done when: held if still no app-level test forbidding it.

## F-18 — Stale `JWKS_FALLBACK`
- status: unverified
- owner: shared
- ev: one-liners, scale
- claim: test only `importKey`s the JWK. Wrong pin during jwks outage = mass bounce.
- validate: `fetch-shield.ts` pin vs live `jwks.json` kid. Test does not compare kid to live.
- done when: held if pin matches live and test still does not check kid; stale if kid drifted.

## F-19 — `host` → `x-forwarded-host`
- status: unverified
- owner: shared + client
- ev: one-liners
- claim: no test of the header name. ADR-0012.
- validate: grep `x-forwarded-host` vs `headers.get("host")` at proxy + confirm + registro.
- done when: held if still `host`.

## F-20 — Pre-push always `exit 0` / `EDGE_DEPLOY_OK` default
- status: unverified
- owner: shared
- ev: one-liners
- claim: git push deploys Vercel, never edge functions. Lived: stale `send-email` v6.
- validate: `.husky/pre-push` still requires `EDGE_DEPLOY_OK` when `supabase/functions/**` is in the range.
- done when: held if still honor-system.

## F-21 — JIT `exports` → `dist/` strips `server-only`
- status: unverified
- owner: shared
- ev: one-liners 11
- claim: ADR-0011 poison pill. `server-only-coverage.test.ts` reads source. CI `pnpm build` may still catch.
- validate: `packages/data/package.json` exports; `transpilePackages` in both Next configs.
- done when: held if still src/ JIT.

## F-22 — Stored occupancy column
- status: unverified
- owner: shared
- ev: one-liners 11
- claim: ADR-0010 forbids stored spots. No forbidden-column guard. Denial not in CI.
- validate: `class_session` columns; `reservar_clase.sql` still counts.
- done when: held if still derived.

## F-23 — D1 residual: new money reader uses bare ISO vs timestamptz
- status: unverified
- owner: admin
- map: dissent
- claim: current resumen/respaldo patched. Next `.gte("fecha", monthStartIso)` on `ventas.fecha` repeats it.
- validate: grep `.gte("fecha"` on ventas vs asistencias. `resumen.ts` still uses instants.
- done when: held as a trap (no current bug) if patched readers stay instant-aware.

## F-24 — `'use client'` + `@gym/data/server` in apps/client
- status: unverified
- owner: client
- ev: one-liners 14
- claim: ESLint restricted-import is **admin-only**. depcruise cannot see `'use client'`.
- validate: `eslint.config.mjs` files glob; `client-seam.test.ts` path-only.
- done when: held if client app still unrestricted.

## F-25 — Live SQL at stale arity (dashboard / MCP)
- status: unverified
- owner: shared + admin
- ev: one-liners 15
- claim: in-repo overload guard would fail a committed second signature. Residual is applying old-arity SQL **on live** without a migration.
- validate: `rpc-overload.test.ts` still in `pnpm test`. Compare `pg_proc` to canonical if credentials exist; else leave unmeasured.
- done when: held as residual live-SQL class.

## F-26 — Generated types omit `p_gym_id` on `registrar_venta`
- status: unverified
- owner: shared + admin
- ev: incidents
- claim: live function is 15-arg with `p_gym_id uuid DEFAULT NULL`. `database.types.ts` may still omit it. DAL passes it. Typecheck cannot see a forgotten gym stamp.
- validate: `database.types.ts` `registrar_venta` Args vs canonical/migration 15-arg. `ventas.ts` still passes `p_gym_id`.
- done when: held if types still omit; stale if regenerated.

## F-27 — `staff_gym()` is `order by gym_id limit 1`
- status: unverified
- owner: admin
- ev: incidents
- claim: omit `p_gym_id` and money stamps the lowest UUID, not the host. Critic: do not promote until someone is staff of two gyms.
- validate: canonical `staff_gym.sql`; call sites that still use it without host pick (`getOperatorGym`).
- done when: held if still UUID-ordered; note whether any live operator is multi-gym staff.

## F-28 — `gym` cookie has no maxAge
- status: unverified
- owner: shared
- ev: session
- claim: session cookie vs auth 400d. Host-wins on mapped hosts so impact is preview/`?gym=`.
- validate: both `proxy.ts` `cookies.set("gym"` options.
- done when: held if still no maxAge.

## F-29 — Admin proxy fail-hard; no admin e2e
- status: unverified
- owner: admin + shared
- ev: session
- claim: no park, no try/catch, no session.spec twin.
- validate: admin `proxy.ts` vs client; grep e2e under `apps/admin`.
- done when: held if still no park and no admin e2e.

## F-30 — `/auth/confirm` consumes `token_hash` on GET
- status: unverified
- owner: client
- ev: incidents, half-fail
- claim: prefetch/scanner burns the only link (Sarahí FC-22).
- validate: `apps/client/src/app/auth/confirm/route.ts` method + verify call.
- done when: held if still GET-consumed.

## F-31 — Signup re-POST destroys the previous confirmation link
- status: unverified
- owner: client
- ev: half-fail, incidents
- claim: `UNIQUE (user_id, token_type)` — four mails, four dead `flow_state` (Sarahí).
- validate: `registrarSocio` / signup action comments + GoTrue behavior still described in-repo.
- done when: held if re-signup still rotates the token.

## F-32 — `activar-cuenta` `createUser` then link
- status: unverified
- owner: client
- ev: half-fail
- claim: cut after `createUser` → orphan confirmed user; retry `cuenta_existente`. Cut after `generateLink` → burned recovery token.
- validate: `supabase/functions/activar-cuenta/index.ts` order.
- done when: held if order unchanged.

## F-33 — `send-email` hook: Resend 4xx mapped to HTTP 200
- status: unverified
- owner: shared
- ev: half-fail
- claim: GoTrue will not retry. Burned OTP, no inbox. 5xx after Resend 200 = duplicate mail.
- validate: `supabase/functions/send-email/index.ts` `respuestaEnvio`.
- done when: held if 4xx still 200.

## F-34 — `class_session` appends forever
- status: unverified
- owner: shared
- ev: idle
- claim: ledger prune does not touch sessions. ~1,040 rows/gym/year. Spec out of scope.
- validate: `cron_materialize_horizon.sql` prune target; no session DELETE.
- done when: held if still unbounded.

## F-35 — `no_show` derived at read, never written
- status: unverified
- owner: admin + client
- ev: idle
- claim: 90-day-old `reservada` rows still occupy historical sessions as active.
- validate: reservation status transitions; any cron that flips `no_show`.
- done when: held if no writer sets `no_show`.

## F-36 — `cancel_class_session` does not take the occupancy lock
- status: unverified
- owner: client + admin
- ev: scale
- claim: a book can pass `cancelled_at` before the lock, then insert onto a class the desk just cancelled.
- validate: canonical `cancel_class_session.sql` vs `reservar_clase.sql` lock.
- done when: held if cancel still unlocked.

## F-37 — Walk-ins use a different lock; over-cupo allowed
- status: unverified
- owner: admin
- ev: scale
- claim: `pase:{cliente}` vs session lock. Owner ruling 2026-08-03 allows 17/15 print.
- validate: `pasar_lista_sesion.sql` lock key; occupancy count excludes walk-ins.
- done when: held (ruling, not a bug — catalog so S does not “fix” it by accident).

## F-38 — Shared Postgres ~60 connections
- status: unverified
- owner: shared
- confidence: asserted 2026-07-28
- map: scale table
- claim: two Vercel apps + pg_cron + studio. Dual pdx1 does not isolate.
- validate: dashboard compute / `pg_settings max_connections`. If no creds: leave unmeasured.
- done when: held at current number, or updated.

## F-39 — `resolveTenant` 500 FIFO / 60s / isolate
- status: unverified
- owner: shared
- map: scale table
- validate: `resolve-tenant.ts` CACHE_* constants; `gym_id_por_host` still POST; negative cache; app in the key.
- done when: held if constants unchanged.

## F-40 — `mi_membresia` seq-scan `ventas` by `cliente_id`
- status: unverified
- owner: client
- ev: scale
- claim: no `ventas(cliente_id)` index in migrations.
- validate: grep migrations for that index; canonical `mi_membresia.sql`.
- done when: held if still absent; stale if added.

## F-41 — Respaldo default 24 months, fully buffered
- status: unverified
- owner: admin
- ev: scale
- claim: ExcelJS OOM ~500–600k rows; body ~4.5 MB. Month mode is the safe door.
- validate: `cuenta/respaldo/route.ts` still buffers; ADR-0006 default window; `maxDuration` unset.
- done when: held if still buffered full default.

## F-42 — Middleware still all regions (~7% IAD post-pin)
- status: unverified
- owner: shared
- ev: scale, incidents
- claim: `vercel.json` pins functions `pdx1`. `proxy.ts` cannot be pinned. Unbounded POSTs from IAD.
- validate: ADR-0017; both `vercel.json`; fetch-shield POST exclusion.
- done when: held if still unpinnable.

## F-43 — GET 8s + untimed retry still hangs
- status: unverified
- owner: shared
- ev: half-fail
- claim: 266s stall on the retry still hangs the render. Comment admits it.
- validate: `fetch-shield.ts` retry `return fetch(input, init)` without timeout.
- done when: held if retry still untimed.

## F-44 — Invite codes never expire
- status: unverified
- owner: client
- map: 90-day table
- claim: ADR-0015 rejected TTL. HMAC has no `exp`. OTP is 3600s.
- validate: ADR-0015; `otp_expiry` in config.toml; no invite expiry column.
- done when: held if still no TTL.

## F-45 — Sale edit/delete 30-day window
- status: unverified
- owner: admin
- map: 90-day table
- validate: `editar_venta.sql` / `eliminar_venta.sql` window.
- done when: held if still 30d.

## F-46 — PITR on or off unknown
- status: unverified
- owner: shared
- map: owner-input
- claim: gates say add PITR before you sell. ADR-0006 says Supabase owns DR. 07-13: free tier no backups.
- validate: dashboard. Git cannot settle it.
- done when: unmeasured unless dashboard read; then held at the fact.

## F-47 — TRUNCATE revoke is `gym_legal` only
- status: unverified
- owner: shared
- ev: incidents
- claim: 07-28: anon TRUNCATE on 29/29. RLS does not apply to TRUNCATE.
- validate: grep GRANT/REVOKE TRUNCATE in migrations; current grants if creds.
- done when: held or stale.

## F-48 — `enviar_mensaje_contacto` rate limit only if `p_ip` set
- status: unverified
- owner: shared
- ev: incidents
- validate: canonical SQL `if p_ip is not null`. Caller still omit-able?
- done when: held if still gated on ip.

## F-49 — Console-only: Site URL, allow-list, Turnstile hosts
- status: unverified
- owner: shared + client
- ev: incidents
- claim: Site URL was a retired host (`https://red.ibookit.lat`). Guards cannot see dashboard.
- validate: cannot from git. Dashboard or leave unmeasured.
- done when: unmeasured or held at current dashboard values.

## F-50 — Dual member hosts, disjoint `__Host-` jars, no canonical redirect
- status: unverified
- owner: client
- ev: session, incidents
- claim: `red.ibookit.lat` vs `www.redfunctionaltraining.com`. Sign in on one, signed out on the other.
- validate: `cookie-options.ts` comment; gym_domain rows if creds; any redirect between hosts.
- done when: held if both hosts live and no canonical.

## F-51 — Occupancy: `hashtext` int4; `reservation_staff_insert` bypasses cupo
- status: unverified
- owner: client + admin
- ev: scale
- claim: lock is not a unique cap. Staff insert policy exists. No concurrency suite.
- validate: lock expression; RLS insert policies on `reservation`; `supabase/tests/` for two-connection races.
- done when: held if still no unique cupo and no race suite.

## F-52 — Written-row suites for 11 widened RPCs still owed
- status: unverified
- owner: shared
- ev: incidents
- claim: outage audit “still owed” `dos_gimnasios_staff_pin*.sql`.
- validate: those files exist in `supabase/tests/`? `rpc-coverage.json` vs the 11.
- done when: held if still missing; stale if shipped.

## F-53 — `token_refresh` 150 / 5 min / IP
- status: unverified
- owner: shared
- ev: session
- claim: gym Wi-Fi NAT can look like one IP.
- validate: `config.toml` rate limit. Live dashboard if possible.
- done when: held at the number.

## F-54 — Revocation lag ≤ 3600s (ES256 local verify)
- status: unverified
- owner: shared + admin
- map: numbers table
- claim: ADR-0016 trap sprung. Fired operator can look authed for up to 1h.
- validate: JWKS alg ES256 in pin; admin `getClaims` still local; no `getUser` fallback required.
- done when: held if still local verify.

## F-55 — Staff identity on the client app → hollow week
- status: unverified
- owner: client
- ev: session
- claim: staff membership makes `getEsMiembro` true, skip self-heal, `resolverMiembroGym` may show a hollow member week.
- validate: role filter on client agenda vs `getEsMiembro`.
- done when: held if staff-only identity still enters `/reservar` as a member.

## F-56 — Duplicate merge delete-before-repoint cascades
- status: unverified
- owner: admin
- ev: write-path
- validate: FKs `ON DELETE CASCADE` from `clientes`; runbook warning still present.
- done when: held if cascade + warning still true.

## F-57 — Magic-link `token_hash` single-use / double-click
- status: unverified
- owner: client
- ev: half-fail
- validate: magic-link send + confirm consume. Prefetch of confirm URL.
- done when: held if still single-use GET.

## F-58 — One Resend key = SMTP password; shared bounce budget
- status: unverified
- owner: shared
- ev: incidents
- claim: 07-22: 28 invites, 1 hard bounce in 18 = 5.6% vs <4% shutdown.
- validate: in-repo mail audit still describes one key. Cannot see live bounce % from git.
- done when: held as architecture; bounce % unmeasured unless dashboard.

## F-59 — Wedge alerts drop rows older than 30 days
- status: unverified
- owner: shared
- map: 90-day table
- validate: `registros_atorados` window in `alertas/`.
- done when: held if still 30d ceiling.

## F-60 — Whether pg_cron counts as free-tier “activity”
- status: unverified
- owner: shared
- map: F-06, critic
- claim: pause after ~7 days unused would kill horizon. Unverified in-repo.
- validate: vendor docs + whether `roll-class-horizon` has run in the last 7 idle days (`cron.job_run_details`). Else unmeasured.
- done when: unmeasured unless probed.

---

## V tally

When V finishes, count:

| status | n |
|---|---|
| held | |
| refuted | |
| stale | |
| unmeasured | |

Session V is done when every `F-01`–`F-60` has a status and this tally is filled. Then stop.
