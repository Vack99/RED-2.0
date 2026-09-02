# Drift timeline, 2026-08-10 → 2026-09-02

Gatherer pass. Git archaeology only — no ranking, no verdicts. All commit citations are `git show --stat <hash>` at HEAD plus a `git show <hash> -- <path>` skim; incident rows cite the named memory file verbatim (tag: as-recorded, not re-verified this round unless noted).

**Path correction (flag, not silent fix):** the task's path list assumed `apps/client/app/**` / `apps/admin/app/**`. At HEAD the real source root is `apps/{client,admin}/src/app/**` (`app/` alone only exists under `.next/` build output). Also: neither app has a `middleware.ts`/`middleware.*` source file — routing/auth run through `apps/{admin,client}/src/proxy.ts` only (`.next/server/middleware.js` is Next's compiled artifact of that same proxy, not a separate source). Ran the log against the corrected real paths: `apps/client/src/app/{activar,registro,entrar,auth}`, `apps/client/src/lib/auth-validacion.ts(.test.ts)`, `apps/client/src/app/_components/auth-shell.tsx`, `apps/admin/src/app/(auth)`, `apps/admin/src/lib/auth.ts(.test.ts)`, `apps/{admin,client}/src/proxy.ts(.test.ts)`, `packages/data`, `supabase/functions/send-email`, `supabase/functions-canonical`, `supabase/migrations`, `supabase/tests`, `apps/admin/src/app/(app)/{clientes,vender}`, `packages/brand`, `.dependency-cruiser.cjs`, `tools/guards`, `package.json`, `pnpm-lock.yaml`. **65 non-merge commits + 4 empty merge commits** matched, 2026-08-10 → 2026-09-02.

Gate legend: `vitest` = covered by `pnpm test` (packages/data, apps component `.test.ts`); `denial(convention)` = a migration/RPC-body change, covered only by the pre-merge `pnpm test:denial` convention (not CI/pre-commit — AGENTS.md); `e2e(convention)` = touches the auth/session surface, covered only by the pre-merge `pnpm test:e2e` convention; `none` = docs/rename/merge/typegen, no test surface.

## Chronological table

| Date | Commit / incident | Area | What moved | Guarantee possibly affected | Gate |
|---|---|---|---|---|---|
| 08-10 | `15d5a545` refactor(admin) | legal/docs | Deleted `tools/guards/anexo-legal-drift.test.ts` (64 lines) — the standalone click-wrap anexo surface removed | Guard for the deleted click-wrap surface no longer exists (deliberately — surface itself gone) | vitest |
| 08-10 | `764f0d0f` rename(platform) | legal/docs | ics `PRODID`/`UID` + legal borrador text: `RED` → `iBookit` | Calendar-invite identity string, legal doc text | vitest (`aviso-legal-drift.test.ts`) |
| 08-10 | `68161be9` docs(cleanup) | legal/docs | `gym.ts`/`legal.ts` scrub anexo-restart leftovers; drift-guard test rewritten | Legal aviso drift guard | vitest |
| 08-12 | `6d7b344b` refactor(domain) | money/lifecycle | New "una fila, un veredicto" deep module absorbs `clientes-vm.ts`/`derive.ts`/`agenda-miembro.ts` lifecycle logic (net −122 lines) | Saldo/lifecycle derivation surface rewritten wholesale | vitest |
| 08-12 | `c43fbc63` fix(client) | auth-door | `activar-form`/`vincular-form`/`registro-form`: removed always-pass Turnstile fallback, now fails loud on missing keys | Bot-gate can no longer silently no-op | e2e(convention) |
| 08-12 | `a482fe25` feat(guards) | rpc-canon | Added `supabase/functions-canonical/*.sql` (55 files, one per live RPC body) + `tools/guards/rpc-canon-drift.test.ts` — the canon this repo's drift-guard now checks | Establishes the RPC-body drift shield itself | vitest |
| 08-12 | `938b9980` refactor(data) | tenant | New `inquilino.ts` request-scoped tenant resolver; `hostGymSlug` threading removed from `agenda-miembro.ts`/`clase-miembro.ts`/`gym.ts` | Tenant resolution path rewired mid-slice | vitest |
| 08-12 | `4792314b` refactor(data) | catalog | Collapsed `about-values/facilities/faqs/stats.ts` (5 modules, −1265 lines) into one `gym-content.ts` (+460) with anon twins | Public catalog read surface consolidated | vitest |
| 08-12 | `a5ddac30` refactor(domain) | booking | `clase-miembro.ts` gains one booking-verdict module (RPC as referee), #89 parity | Booking eligibility logic centralized | vitest |
| 08-12 | `097db92a` refactor(data) | auth-door | "reclamo del socio" claim ceremony: `activar/actions.ts`, `auth/confirm/route.ts`, `registro.ts`, `activacion.ts` — throwing primitives de-exported | Member-claim path rewritten (pre-dates the 08-21/08-30 auth incidents) | e2e(convention) |
| 08-12 | `fb44f467` fix(guards) | rpc-canon | Drift guard made EOL-insensitive (autocrlf checkout had flagged all 52 canon files stale) | False-positive drift-guard failures | vitest |
| 08-13 | `dad9ad49` feat(#269) | money | New `editar_venta`/`eliminar_venta` RPCs, migration `20260813120000`, denial suites | First payment-correction write path (edit/delete a sale) | denial(convention) + vitest |
| 08-13 | `a545b9e6` feat(#269) | money/UI | PagoSheet: tappable pago rows, edit monto/metodo, windowed delete (UI only) | — | vitest |
| 08-14 | `7f6f1c9d` fix(#269) | money | Delete race, monto bound, refusal class, grant vectors on `editar_venta`/`eliminar_venta` | Correction-window race/permission edges | denial(convention) |
| 08-14 | `10976c4b` fix(#269) | money | Dropped monto upper bound — paquete branch now writes monto unbounded | Sale-amount validation loosened | denial(convention) |
| 08-14 | `dcca3e24` feat(#269-ff) | money | `editar_venta` gains `p_fecha` (date/month attribution only), migration `20260814120000` | Backdating a correction's attribution month | denial(convention) |
| 08-14 | `15d6089a` feat(#269-ff) | money/UI | PagoSheet made detail-first, fecha editable | — | vitest |
| 08-14 | `1ce0451d` fix(#269-ff) | money | ADR amendment, boundary vectors, seed clamp | — | denial(convention) |
| 08-14 | `55426261` chore | types | `database.types.ts` formatting parity with live typegen | None (generated artifact) | none |
| 08-14 | `6c36fc9b` feat(#269-ff) | money | Owner ruling: dropped the "sale fecha may not predate cliente's created_at" floor at both doors, migration `20260814130000_drop_alta_floor.sql` (357 lines) | Backdate-floor invariant removed by ruling | denial(convention) |
| 08-15 | `275c410e` feat(#266) | money | Paquete-swap core: `editar_venta` grows package args, re-derives saldo; migration `20260815120000` (442 lines), suite `editar_venta_paquete.sql` (+849) | "Vence follows fecha" + package-swap re-derive introduced | denial(convention) + vitest |
| 08-15 | `e3ae279b` feat(#266) | money/UI | Pago-sheet paquete-swap UI: picker, personalizado, re-derive preview, delete gate | — | vitest |
| 08-15 | `588aa4ea` fix(#266) | money | Review wave: top-of-stack guard, full re-derive window, UI truth fixes | Re-derive correctness on stacked corrections | denial(convention) + vitest |
| 08-15 | `7f39078a` fix(#266) | money | Verify-wave residuals: delete-note advice, deselect-monto restore, comment truth | — | vitest |
| 08-15 | `046ac081` fix(#266) | money | **Bug fix**: vence re-derive anchor inversion — fresh-sale fecha moves had been a no-op; migration `20260815130000` (366 lines) is a bare `CREATE OR REPLACE` of `editar_venta` only | Balance/expiry re-derive was silently not applying on live | denial(convention) |
| 08-15 | `1aa0f6f4` docs(#266) | money | Migration header comment only — names the unrecoverable-B under-credit cells from review D1/D2 | — | none |
| 08-17 | `c16b76b9` feat(brand) | brand | `gym.token_overrides` wired into the skin; purple fixture retired | Per-gym brand-token override path | vitest |
| 08-17 | `44051379` feat(data) | tenant | Both `proxy.ts` (client+admin) now declare identity via `p_app`; `resolve-tenant.ts` grows a test file (#275) | Host resolution stops guessing app from host alone | e2e(convention) |
| 08-17 | `ace68adc` feat(db) | tenant | New CHECK: `gym.brand_module_id` constrained against the brand registry; migration `20260817120000` (#273) | Invalid brand_module_id can no longer land silently | denial(convention) |
| 08-17 | `65a7ebb1` fix(brand) | brand | Brand-voice descriptions, admin title template, `AppScope` type follow-ups | — | vitest |
| 08-19 | *(incident)* member-reachability-todo.md | reachability | RED member hit a FortiGuard "Not Rated" block; root-caused as **not our bug** across 2 workflows (17 agents). Flagged ahead of the Fortinet finding itself: (1) `auth/confirm/route.ts:104-110` consumes a single-use `token_hash` on a bare GET and mail-scanner prefetch can permanently wedge a member (fixed later by the 08-21/08-30 auth work below); (2) all 9 TLS certs expire **2026-10-07**, issued in one 19-min window, renewal never verified — calendar check owed 09-10. | Silent permanent lockout via scanner prefetch; TLS cert expiry with no monitor | none (docs-only at the time; the prefetch defect is later addressed by 08-21/08-30 rows) |
| 08-21 | `991323d0` fix(client) | session/auth-door | Session-aware auth surface + fail-soft proxy rotation: `activar/contrasena/actions.ts`, `entrar-form.tsx`, `entrar/page.tsx`, `registro/page.tsx`, `proxy.ts` (+132/−?), `sesion.ts` | Root fix for the session-blind auth surface (see incident row) | e2e(convention) |
| 08-21 | `15319b29` fix(client) | session/auth-door | Applied review verdicts to the session-persistence surface: `auth-validacion.ts`, `proxy.ts` (net −128/+134, near full rewrite), `sesion.ts` | Same surface, review-hardened | e2e(convention) |
| 08-21 | `97fbbe58` feat(shield) | infra | **Creates** the browser e2e session shield (`pnpm test:e2e`, Playwright/chromium) + daily auth-log alert cron; `apps/admin/src/lib/auth.ts`, `package.json`/`pnpm-lock.yaml` (+Playwright) | Establishes the e2e gate itself | e2e(convention) (origin of the gate) |
| 08-21 | *(incident)* login-session-persistence-shipped.md | session | Root cause was NOT refresh races (the analysis doc's theory) but a session-blind auth surface: `/entrar`+`/registro` never checked claims, so healthy 8-day-refreshing sessions (Katya) still hit a password form. SHIPPED+PUSHED @`465dcf4`. C1 prefetch-exclusion explicitly REJECTED (recorded in a `proxy.ts` doc-comment). Camila Rodríguez resolved via manual SQL provision 08-25; Camila Reyes (`Cam***@hotmail.com`) left accountless. | Login persistence for members with valid sessions | e2e(convention) (shield born same day) |
| 08-23 | `a760a742` feat(db+admin) | agenda | Agenda slot exclusivity: migrations `20260823120000` (690 lines) + `20260823120100` (85 lines, indexes) | One class per gym per instant — new invariant | denial(convention) |
| 08-23 | `54245993` docs(audit) | agenda | 4-line comment addition to the exclusivity-indexes migration recording the audit verdict | — | none |
| 08-24 | `50a6a207` fix(client+admin) | session/auth-door | Login-first booking CTAs everywhere, iOS 16px zoom fix, `proxy.ts` session-survival changes (+64/−12) | CTA funnel + iOS form zoom + session survival | e2e(convention) |
| 08-24 | `c54b656c` fix(review) | session | Hardened the session/CTA batch per two-axis review — `proxy.ts`/`proxy.test.ts` | — | e2e(convention) |
| 08-24 | `ad5ff779` fix(brand) | brand | `ring-mark.tsx`: iOS Safari boxed-glow fix, filter moved from SVG root onto 5 animated children | Visual only, no test surface named in memory note | none |
| 08-24 | *(incident)* booking-app-fixes-2026-08-24.md | session | Root cause of "weekly re-login": `signOut()` defaulted to `scope:'global'` — one cerrar-sesión tap revoked every device (proven via session-row deletion, not expiry). All 4 call sites moved to `{scope:'local'}`. Session length already at platform max (400-day cookie, refresh tokens never expire); iOS Safari realistic ceiling ≈30 days via ITP eviction, no config raises it. | Cross-device session survival on logout | e2e(convention) |
| 08-26 | `3d50253f` fix(db) | money | Pase decrement guards, `toggle_pase` fecha clamp, back-dated visit re-attribution; migration `20260826120000` (413 lines) | Pase (class-credit) decrement correctness | denial(convention) |
| 08-26 | `51884306` fix(client) | agenda/booking | Pinned member's own reads + added per-gym booking on/off switch; migration `20260826120100` (198 lines) | Forge-containment: booking switch per gym | denial(convention) + vitest |
| 08-26 | `11f28182` feat(db) | money | **Ruling change**: renewal is a FULL RESET on both axes (was stacking, ADR-0003); migration `20260826120200` (308 lines) | Renewal no longer carries leftover days/classes forward | denial(convention) |
| 08-27 | `fbf84505` fix(review) | money | ADR trace for the reset ruling, past-date no-op arm, two suite gaps | — | denial(convention) |
| 08-27 | `5dee2e30` test(denial) | infra/money | Suites made to own their own fixture state; `toggle_pase_rules` stopped depending on wall-clock hour | Denial-suite determinism | denial(convention) |
| 08-27 | `8f78cc1b` fix(db) | money — **outage** | Collapsed a `registrar_venta` double overload (see incident row); recovers 3 prod-only migrations into the repo (`20260825145937`, `20260825151534`, `20260825151556`) + adds fix migration `20260827160000`; adds `tools/guards/rpc-overload.test.ts` | Sales writes were 100% dead in the outage window | denial(convention) + vitest (new guard) |
| 08-27 | `26799a96` docs(domain) | domain | RED custom-domain research: runbook + handoff + migration `20260827210000` **explicitly marked NOT applied** at commit time (applied later, see 08-28) | — | none at commit time |
| 08-27 | `85b29ce5` wip(slice2) | money | Saldo_detalle checkpoint: `derive.ts`/`clientes.ts`/`agenda.ts` + RPC canon + suites + 3 migrations (`20260828100000/110000/120000`, ~1300 lines combined) | Balance-derivation rewrite in progress (checkpoint, not final) | denial(convention) + vitest |
| 08-28 | `9b439930` fix(saldo) | money | Slice-2 review round 1: domain grace boundary, `conteo_cargable` RPC on old-anchor path, ADR-0003 Amendment 3 | Charge-count correctness on old vs. new anchor sales | denial(convention) + vitest |
| 08-28 | `8d9f16a1` fix(saldo) | money | Slice-2 review round 2: `mi_membresia` new-column SQL vector, gym pin on `FOR UPDATE` | Cross-gym row-lock scoping on the balance RPC | denial(convention) |
| 08-28 | `7a9cce1a` fix(ventas) | multi-gym | `ventas.ts` passes host-resolved `p_gym_id` on all sale writes | Multi-gym staff sale attribution (staff_gym() roulette) | vitest |
| 08-28 | `95583ac9` fix(domain) | domain | `gym_domain.es_principal`: canonical host per (gym_id, app); migration `20260828130000`; RED invite links now mint on `www.redfunctionaltraining.com` | Outbound link minting picks the wrong host without this | denial(convention) + vitest |
| 08-28 | *(incident)* red-custom-domain-cutover.md | domain | PUSHED+DEPLOYED @`95583ac` with owner consent; migration went live before the code deploy on purpose (code-before-column would null every minted link). Step-4 owner walk GREEN. Open: `/activar` cross-tenant shield runs as anon and never redirects (pre-existing, not fixed this round — unverified this round). | Invite-link host correctness | denial(convention) |
| 08-29 | `826ee6b2` fix(auth) | session/infra | Colocated both apps in `pdx1`; new `fetch-shield.ts` bounds Supabase reads/JWKS with timeout+retry | Unbounded GET/JWKS stalls (see 08-29 degradation incident) | e2e(convention) + vitest |
| 08-29 | `4ba89bc5` fix(auth) | session/infra | `resolve-tenant.ts` anon client shielded; read RPCs moved to GET | — | e2e(convention) |
| 08-29 | `87f54f27` refactor(auth) | infra | Fetch-shield review cleanups: English names, caller-abort in JWKS branch, new `tools/guards/fetch-shield-coverage.test.ts` | Coverage guard for the shield itself | vitest |
| 08-29 | `4b5432eb` fix(invitaciones) | money/auth-door | Non-ASCII emails refused at intake; Resend-rejection reason surfaced (see incident row) | Sale-creation email validity | vitest |
| 08-29 | `bed1f7db` fix(vender) | UI | ñ-email error shown on sight; copy says a typed email must be valid | — | vitest |
| 08-29 | *(incident)* supabase-degradation-2026-08-29.md | infra | "Spins forever" root-caused to the Cloudflare IAD→Supabase(us-west-2) leg from Vercel `iad1` page functions — corrected the handoff doc's JWKS-only theory (auth-js already has a process-global JWKS cache). Shield = `pdx1` region pin (`vercel.json`) + fetch-shield GET/HEAD timeout+retry. PUSHED @`337feb4`, post-deploy colo check GREEN (97 calls, p50 44ms, 0 stalls). | Read-request latency under a degraded far-region leg | e2e(convention) |
| 08-29 | *(incident)* non-ascii-email-invite-bug.md | auth-door | RED's "no pudimos enviar la invitación" traced to `Ivanmontañez77@gmail.com` — Resend 422s on non-ASCII `to`. Fix LOCAL @`bed1f7d`+`4b5432e` at commit time (pushed with the 08-29 degradation fix per incident note); live row deliberately left uncorrected (real address unknown) pending owner EDITAR. | Invite-email deliverability for non-ASCII addresses | vitest |
| 08-30 | `afd7a5d5` feat(auth) | auth-door — **incident response** | Shield wave 1: resend door, honest registro, instrumented confirm, OTP rail (`/codigo`), wedge detection; migration `20260830120000_registros_atorados.sql` (120 lines); `send-email/correo.ts` changed | Members permanently wedged between the two auth doors (see incident) | denial(convention) + e2e(convention) |
| 08-30 | `17566753` fix(auth) | auth-door | Post-review: one shared resend counter, cold-start `/codigo` link, 24h legacy-alert lookback, honest probe comment | — | e2e(convention) |
| 08-30 | *(incident)* auth-door-incident-shield-plan.md | auth-door | RED incident (Sarahí): self-signup wedge from an unlogged `/auth/confirm` catch-all + a resend door that did not exist + `/registro` resubmit silently rotating the one confirm token. 24 verified failure points (FC-01..24). SHIPPED @`1756675`; send-email v8 deployed; live-verified: `/codigo` 200, cold-start link, bogus confirm → 307 with matching error copy. Two members (jessica_s_h6, paucasavantes) deliberately left unrepaired — no roster/identity evidence, confirming would mint empty clientes rows. | Auth-door wedge / permanent lockout | e2e(convention) + denial(convention) |
| 09-01 | `43801e64` feat(modos) | modos | Mode spine: `modo()` added to `@gym/domain`; Lista nav swaps AGENDA for VENDER | — | vitest |
| 09-01 | `d85c1634` feat(client) | modos | Lista member public landing, `/saldo`, hours field (#332); migration (later renamed) `..._lista_member_surface.sql` | Anon can now read gym mode pre-login | denial(convention) + vitest |
| 09-01 | `8654fd3b` feat(modos) | modos/UI | Admin home rebuild for #328: Cupo day card, Lista PASE arm | — | vitest |
| 09-01 | `c84dd576` feat(cuenta) | modos | "Reservas en línea" switch (#331): one RPC, cascade-cancel, confirm sheet; migration `20260901140000_cambiar_modo_reservas.sql` | Turning booking off must cancel every future reservation atomically | denial(convention) |
| 09-01 | `fbe3c3c8`/`32306c86`/`9d453321`/`958a2cee` merges | modos | Integration merges of #331/#328/#332 branches — empty diffs | — | none |
| 09-01 | `e0afe64d` fix(modos) | modos | Review fixes: `agenda.ts` `?sesion=` param, `asistencia.ts`/`clientes.ts` orphan cleanup (net −70 lines) | — | vitest |
| 09-01 | `43800b17` fix(modos) | modos — concurrency | `reservar_clase` gains a `FOR SHARE` lock on `gym.booking_enabled`; migration `20260901150000` (184 lines) | Race: a booking could land after the switch flipped OFF (MVCC snapshot read) | denial(convention) |
| 09-01 | `353b6477` fix(modos) | modos | Pure rename: `..._lista_member_surface.sql` timestamp `20000`→`130000` (no content diff) | — | none |
| 09-01 | `b0053e54` feat(modos) | modos | Owner ruling: Lista home keeps the ASISTENCIAS·HOY hero (spec had said remove it) | — | vitest |
| 09-01 | `491804d1` fix(admin) | multi-gym | `gym.ts` `resolveOperatorGyms` query gains `.eq("user_id", userId)` — `gym_membership_staff_select` is a second permissive RLS policy that let a staffer read co-staff rows, ORed with the self-read policy, duplicating gyms in the chooser | Multi-owner gym showed duplicate entries / wrong "choose vs. redirect" branch | vitest |
| 09-01 | `92c2059d` feat(senal) | realtime | New `senal_gym` freshness rail: one `realtime.send` broadcast per gym per transaction (15 triggers), policy gating read by `is_member_of`; migration `20260901120000_senal_gym.sql` (158 lines) | Cross-client staleness (staff sees stale agenda while members book) | denial(convention) |
| 09-01 | `9bafe755` test(senal_gym) | realtime | Partition-precondition suite fix: checks existence before CREATE | — | denial(convention) |
| 09-01 | `309bfb00` test(senal_gym) | realtime | Delete + gym-move vectors, exact payload assertion | — | denial(convention) |
| 09-01 | `4292447f` feat(senal) | realtime | New browser hook `useSenalGym` + busy-aware trailing debounce (`client-senal.ts`, +193) | — | vitest |
| 09-01 | `2ecb00dd` fix(client-senal) | realtime | Hook made inert after `destruir()`; release now flushes through the debounce | Double-fire / stale-callback risk after unmount | vitest |
| 09-01 | `63f1b48f` fix(senal) | realtime | `await` added before channel leave/re-subscribe; door-hold moved inside `try`; anon+membership test vectors added | Subscribe/unsubscribe race on rapid gym switches | vitest + denial(convention) |
| 09-01 | *(incident)* senal-gym-freshness-built.md | realtime | Migration applied live 09-01; apps PUSHED @`ddeddf95` 09-02 after rebase onto the modos batch. Live-probed: member SUBSCRIBED in 553ms, RECV within 1s of a committed no-op update; anon private join → `Unauthorized`; anon public join → refused (dashboard "public channels" already OFF). Follow-up branch `glance-card-vigente` (3 commits, PUSHED @`bdea9ed3`) fixed the glance-sheet header using a stale card snapshot and the pasar-lista checkbox lagging two round trips. **Found on the way, still open, unrelated**: live registration returns 500 from `send-email` auth hook for `delivered@resend.dev` — `signup.spec.ts` fails. | Realtime signal reaches only same-gym clients; UI freshness on toggle | e2e(convention) (session suite) + denial(convention) |
| 09-01 | *(incident)* email-deliverability-lane.md | auth-door/email | 20-agent research: verdict = buy nothing, stay on Resend, build a Svix-verified bounce webhook. F4 (DMARC p=quarantine/reject) and F5 (one-click unsub) ruled **NEVER** — transactional mail is exempt from unsub rules, Microsoft hard-550s at `p=reject`. Marce ticket (marcerubiogarcia07@gmail.com) resolved: invite had delivered to spam all along; her inert unconfirmed `auth.users` row deleted live. | Email deliverability / spam placement | none (research; execution is the still-open green-list handoff) |
| 09-02 | `108b45a0` fix(agenda) | multi-gym | `agenda.ts`/`plantillas.ts` now pass `p_gym_id` on every agenda write RPC — the `staff_gym()` fallback had been writing into the lowest-uuid gym for multi-gym operators | A multi-gym operator's class writes could land on the wrong gym | vitest |
| 09-02 | `24d9912b` fix(data) | multi-gym | 18 files across `packages/data/src/server/*` gain `.eq("gym_id", …)` on admin reads (agenda, catalog, class-type, clientes, coach, gym-content, mensajes, paquetes, ventas) | A multi-gym staffer saw sibling-gym catalogs rendered under the wrong brand chrome | vitest |
| 09-02 | `4a1323bf` fix(modos) | modos | Review fixes: rolled hero links carry `?d=`, week-read logic for "next day", one-query attendance summary, client `Modo` params (`entrar/actions.ts`, `entrar/page.tsx`) | — | vitest + e2e(convention) (touches `entrar/`) |
| 09-02 | *(incident)* modos-lista-cupo-shipped.md | modos | Lane #326 (#327–#332) SHIPPED, PUSHED @`4a1323b`. Live acts with owner consent: 3 migrations applied, forge-demo flipped to Lista, forge schedules retired. **Same-session discoveries, both fixed, both had been live**: the `108b45a0` and `24d9912b` rows above — found by testing this lane, not by this lane's own spec. | Multi-gym write/read scoping (see the two rows above) | vitest |

## Migrations added since 2026-08-10 (25 files)

| File | Purpose (from header) |
|---|---|
| `20260813120000_editar_eliminar_venta.sql` | #269 — `editar_venta` (monto+método) and `eliminar_venta` (hard delete + clawback, 30-day window); `ventas` was previously append-only by policy. |
| `20260814120000_editar_venta_fecha.sql` | Fast-follow — `ventas.fecha` becomes editable through `editar_venta`; ruling #266.3 reversed 2026-08-14 (backdated real-desk sales). |
| `20260814130000_drop_alta_floor.sql` | Owner ruling 2026-08-14 — drops the "sale fecha ≥ cliente created_at" floor at both doors (client row may not exist yet when a client first pays). |
| `20260815120000_editar_venta_paquete.sql` | Paquete-swap: `editar_venta` grows package args, re-derives saldo. Rulings: vence-follows-fecha, package swap on an existing sale. |
| `20260815130000_editar_venta_base_anchor.sql` | Correction of the above — re-derive had recovered the ANCHOR, not the BASE; fresh-sale fecha moves were a no-op. Bare `CREATE OR REPLACE`. |
| `20260817120000_constrain_gym_brand_module_id.sql` | #273 — CHECK constrains `gym.brand_module_id` to the brand registry's ids; an unknown id now fails loudly instead of silently downgrading to default skin. |
| `20260823120000_agenda_slot_guards.sql` | Agenda slot exclusivity, RPC half (audit defects D1/D11, DB side of D2/D3/§1.1/§1.5). |
| `20260823120100_agenda_slot_exclusivity_indexes.sql` | Agenda slot exclusivity, database backstop — marked "deliberately deferred" live-apply precondition in its own header. |
| `20260826120000_pase_guards_and_backdate.sql` | Three attendance-write defects from the "clases restantes" drift audit — pase decrement guards + `toggle_pase` fecha clamp. |
| `20260826120100_gym_booking_enabled.sql` | "FORGE CONTAINMENT" — per-gym switch turning member booking off; forge is class-only and every stray `reservar_clase` there burns an unwatched hold. |
| `20260826120200_registrar_venta_reset.sql` | Owner ruling 2026-08-26 — renewal is a FULL RESET on both axes (grants replace unexpired remainder, ADR-0003), not stacking. |
| `20260825145937_staff_gym_tenant_in_effect.sql` | RECOVERED 2026-08-27 from prod — applied 2026-08-25 from the mobile lane, never committed here. 11 RPCs grow an optional `p_gym_id`; one grows a predicate. |
| `20260825151534_fijar_asistencia_idempotente.sql` | RECOVERED 2026-08-27 from prod (mobile lane, mobile-05 #293) — `fijar_asistencia` becomes the idempotent, set-state check-in. |
| `20260825151556_crear_plantilla_gym_target.sql` | RECOVERED 2026-08-27 from prod (mobile lane) — `crear_plantilla` grows an explicit gym target; multi-gym operator template had been landing on the wrong gym. |
| `20260827160000_registrar_venta_overload_fix.sql` | Restores all admin sales after the outage (since 2026-08-27 06:16:58Z) — a `CREATE OR REPLACE` at a stale 14-arg signature had created a second `registrar_venta` overload alongside prod's uncommitted 15-arg version → PostgREST 300. |
| `20260827210000_red_custom_domain_client_host.sql` | Maps `www.redfunctionaltraining.com` as a second `app='client'` host for gym `red`; explicitly marked NOT applied at commit time (26799a96), applied live 2026-08-28 alongside `es_principal`. |
| `20260828100000_reservation_charge_moment_hygiene.sql` | Slice-2 §D6 — every surface derives the balance from the charge-moment write site instead of asking the stored counter to explain itself. |
| `20260828110000_editar_venta_as_if_original.sql` | Slice-2 §D0/§D5 ruling — correcting a sale must leave the member exactly where they'd be if the corrected terms had applied from the start. |
| `20260828120000_mi_membresia_cargadas.sql` | Slice-2 §D3 — `mi_membresia` learns the charge count additively so the client app's honest gauge can reach it (client reads only this RPC's scalars). |
| `20260828130000_gym_domain_es_principal.sql` | `es_principal`: declared canonical host per (gym_id, app) for outbound link minting only — RED now maps two `app='client'` hosts and the old "oldest row wins" selector picked the wrong one. |
| `20260830120000_registros_atorados.sql` | `registros_atorados()` — the wedge detector, auth-door shield plan §3(d); a member stuck between the two doors had been invisible to everyone. |
| `20260901120000_senal_gym.sql` | `senal_gym` — the "signal, not data" realtime freshness rail; one broadcast per gym per transaction, policy gates read by `is_member_of`. |
| `20260901130000_lista_member_surface.sql` (renamed from `...120000...`) | Modos #332 — one `gym_contact.hours_text` free-text field + lets anon read the gym's mode pre-login. |
| `20260901140000_cambiar_modo_reservas.sql` | "Reservas en línea" switch #331 — one RPC, single transaction flips `gym.booking_enabled` and cascade-cancels every future reservation when turning OFF. |
| `20260901150000_reservar_clase_booking_enabled_for_share.sql` | #331 review fix — `reservar_clase` reads `booking_enabled` with `FOR SHARE` to close a race against the OFF-flip's cancel loop. |

## docs/Context and docs/adr, added or modified since 2026-08-10 (39 files)

**docs/Context/** (31 files; A=added, listed chronologically):
- `2026-08-08-membership-booking-market-taxonomy.md` — "Who buys iBookit — a membership + class-booking + client-roster platform"
- `2026-08-10-anexo-restart-HANDOFF.md` — "HANDOFF — anexo restart (written 2026-08-10, after the forge/red-demo incident)"
- `2026-08-10-brand-structure-HANDOFF.md` — "Brand-structure session — HANDOFF (2026-08-10 → next morning)"
- `2026-08-10-dpa-acceptance-competitor-norms.md` — "DPA / ToS acceptance + update-notice norms across B2B SaaS (2026-08-10)"
- `2026-08-10-dpa-legal-floor-mx.md` — "DPA legal floor under the reformed LFPDPPP (DOF 20-Mar-2025) — research notes"
- `2026-08-10-red-naming-inventory.md` — "RED-as-platform-name inventory — 2026-08-10"
- `2026-08-10-sales-niche-sweep.md` — "Sales niche sweep — beyond the 12-genre taxonomy"
- `2026-08-10-tos-execution-plan.md` — "Plan de ejecución — Términos de la Plataforma iBookit (de hoy a 'blindado')"
- `2026-08-10-tos-gap-analysis.md` — "Análisis de brechas — Términos de la Plataforma (iBookit ↔ Gimnasio)"
- `2026-08-10-tos-production-research.md` — "How ToS actually get written — production routes for a bootstrap SaaS (2026-08-10)"
- `2026-08-10-tos-surface-inventory.md` — "ToS surface inventory — 2026-08-10"
- `2026-08-11-marketing-page-HANDOFF.md` — "Marketing-page kickoff — HANDOFF (2026-08-11)"
- `2026-08-12-app-store-launch-plan.md` — "iBookit → App Store + Play Store, from zero (Chihuahua, MX)"
- `2026-08-12-arch-review-next-session-handoff.md` — "2026-08-12 — Arch review batch 2 CLOSED: 7/8 cards shipped. Next session starts here." (modified 3× through 08-12)
- `2026-08-12-tos-niche-standard-deep-research.md` — "Legal papering in gym/class-booking SaaS: what the niche actually does"
- `2026-08-13-apple-app-store-playbook.md` — "iBookit → Apple App Store: the whole path, from no account to live"
- `2026-08-13-apple-b2b-saas-verdict.md` — "Charging gyms through Apple: the admin-app-only model"
- `2026-08-13-issue-269-EXECUTION-BRIEF.md` — "Issue #269 — execution brief (worktree `payment-correction`)"
- `2026-08-14-issue-269-HANDOFF.md` — "Issue #269 — session handoff (2026-08-14)"
- `2026-08-14-paquete-swap-HANDOFF.md` — "Paquete-swap edit — session handoff (2026-08-14)"
- `2026-08-15-paquete-swap-SPEC.md` — "Paquete-swap edit — implementation SPEC (2026-08-15)"
- `2026-08-18-niche-blind-spot-sweep.md` — "Niche blind-spot sweep — what the first two market docs left aside"
- `2026-08-19-member-reachability-todo.md` — "Member reachability — ordered TODO" (modified again 08-28)
- `2026-08-21-login-session-persistence-analysis.md` — "Login & Session Persistence — Full Analysis (5 passes)" (modified 3× through 08-21)
- `2026-08-24-booking-fixes-handoff.md` — "Handoff — booking-app fix batch, 2026-08-24 (for porting into a stale worktree)"
- `2026-08-27-clases-drift-handoff.md` — "Handoff 2026-08-27 — clases-restantes drift, session close" (modified twice)
- `2026-08-27-red-custom-domain-HANDOFF.md` — "HANDOFF — RED custom-domain cutover (`www.redfunctionaltraining.com`)" (modified twice)
- `2026-08-27-red-custom-domain-findings-appendix.md` — "Appendix — full findings inventory (RED custom-domain cutover research, 2026-08-27)"
- `2026-08-28-atp404951-unclaim-session.md` — "Un-claiming `atp404951@gmail.com` on RED to re-walk the invite flow"
- `2026-08-28-slice2-shipped-handoff.md` — "Handoff 2026-08-28 — slice 2 shipped, next session"
- `2026-08-29-supabase-degradation-jwks-HANDOFF.md` — "HANDOFF 2026-08-29 — 'everything spins forever' = Supabase degradation, and the JWKS fix we owe" (modified 3×)
- `2026-09-01-email-deliverability-HANDOFF.md` — "2026-09-01 — Email deliverability: execute the green list — HANDOFF"

**docs/adr/** (7 files, all modified not added):
- `0003-stacking-forfeit-dates.md` — "ADR-0003 — Stacking, forfeit & the date model" (Amendment 3, modified twice)
- `0004-saldo-stored-running-balance.md` — "ADR-0004 — Active saldo is a stored running balance (extends ADR-0002)"
- `0005-atomic-write-rpcs.md` — "ADR-0005 — Atomic write seam: Postgres RPCs for the money path" (modified 4×, #269 series)
- `0012-host-brand-resolution.md` — "ADR-0012 — Host→brand resolution: one shared `proxy.ts` seam, a static registry stubbing the Phase-3 `gym`-row lookup"
- `0015-invite-token-claim.md` — "ADR-0015 — Invite-token claim: a deterministic join between the two member doors"
- `0016-session-revocation-and-lifetime.md` — "ADR-0016 — Session revocation on membership removal; session lifetime is a plan + dashboard action, not a repo artifact"
- `0017-vercel-function-region-colocated-with-supabase.md` — "ADR-0017 — Vercel functions run in ONE region, colocated with Supabase (`pdx1`)" (added 08-29, amended same day)

## Blind spots

- **Diff depth is uneven.** Full `git show <hash> -- <path>` was read for the ambiguous/critical rows (491804d1, 95583ac9, several migration headers); the remaining ~55 commits' "what moved" is derived from `git show --stat` + the commit subject/body, not a line-by-line diff read. Subjects here are unusually descriptive (this repo's convention), so risk is low, but it is not the same rigor as a full skim on every row.
- **`apps/mobile/`** is untracked (shown in the session's git-status snapshot) and outside every pathspec the task named — not examined at all in this pass.
- **"Gate" column states coverage, not a historical pass/fail.** I did not re-run `pnpm test`, `pnpm test:denial`, or `pnpm test:e2e` this round; the column says which convention *applies* to the touched surface per AGENTS.md, not that it was run green for every commit (some commit bodies self-report green gates — e.g. `95583ac9`, `afd7a5d5` — those are tagged as-recorded, not re-verified this round).
- **Incident rows are quoted from memory notes verbatim** (tagged as-recorded) and were not re-derived from live logs/DB this round — e.g., the `senal-gym-freshness-built.md` live-probe numbers (553ms subscribe, 09-02) and the `supabase-degradation-2026-08-29.md` colo latencies are the prior session's evidence, not re-measured here.
- **Files outside the named pathspecs within touched commits** (e.g., `docs/adr/*` edits riding inside a money-path commit) are captured in the docs/adr list above but not cross-referenced back into the main table row-by-row.
- Did not check whether any of the 25 migrations listed have since drifted from what's live on prod (`mcp__supabase__list_migrations` was available but not invoked this round — out of scope for a pure git-archaeology pass).
