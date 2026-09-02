# New-user path — surface map

Gatherer pass, 2026-09-02. Bounded extraction, no judgment. Repo root
`C:\Users\Aaron\Documents\Repos\RED-2.0`, HEAD = `33c9087a`.

Path: admin desk (crear cliente + venta) → invite (`preparar_invitacion` +
`REENVIAR INVITACIÓN`) → send-email auth hook → client doors (`/activar` both
rails, `/registro`, `/entrar`, recovery, `/auth/confirm`) → session mint
(cookies, proxy, `@gym/data` clients, fetch shield) → `resolveTenant` →
first load `/reservar` (`mi_membresia`, señal) → RPC bodies
(`supabase/functions-canonical`) → tables/policies/triggers
(`supabase/migrations`) → test coverage (vitest, `supabase/tests/*.sql` +
SUITE/QUARANTINE membership, `apps/client/e2e/*.spec.ts`).

## 1. Admin desk (create cliente + sell venta) — 9 files
`apps/admin/src/app/(app)/vender/{page.tsx,actions.ts,loading.tsx,recibo-envio.ts}`,
`vender/_components/{vender.tsx,vender-vm.ts,recibo.tsx,ticket-twin.ts}`,
`apps/admin/src/app/(app)/clientes/[id]/actions.ts` (also owns
`reenviarInvitacionAction`, `editarVentaAction`, `eliminarVentaAction`,
`togglePaseAction`). Key symbols: `crearVentaAction`, `reenviarReciboAction`
(vender/actions.ts); calls `@gym/data/server/{ventas,clientes,invitaciones}`.
RPCs invoked: `registrar_venta`, `reclamar_o_crear_cliente` (via
`packages/data/src/server/clientes.ts` create path), `next_folio`,
`ventas_count_por_cliente`.

## 2. Invite send/resend — 3 files
`packages/data/src/server/invitaciones.ts` (`enviarInvitacion`,
`construirUrlInvitacion`, `mensajeInvitacion`, `resendTransport`,
`remitenteConNombre`) — calls RPCs `preparar_invitacion` (invitaciones.ts:224)
and `marcar_invitacion_enviada` (:248). Admin action wrapper:
`clientes/[id]/actions.ts:reenviarInvitacionAction`. Rate-limit helper:
`packages/data/src/server/reenvio-limite.ts`.

## 3. send-email auth hook — 3 files
`supabase/functions/send-email/{index.ts,correo.ts,correo.test.ts}`.
`index.ts`: Standard-Webhooks verify (`SEND_EMAIL_HOOK_SECRET`), gym lookup
via `gym_id_por_host` RPC (anon client), calls Resend, thin shell only.
`correo.ts` (pure): `construirCorreoAuth`, `bloqueCodigo` (6-digit OTP
fallback, signup-only), `respuestaEnvio`. Security dependency: Supabase Auth
Redirect-URL allow-list clamps `redirect_to` host (not enforced in this repo
— dashboard config).

## 4. Client doors — 15 files
`apps/client/src/app/activar/{page.tsx,actions.ts,_components/{activar-form.tsx,vincular-form.tsx}}`,
`activar/contrasena/{page.tsx,actions.ts,_components/activar-contrasena-form.tsx}`,
`registro/{page.tsx,actions.ts,_components/registro-form.tsx}`,
`entrar/{page.tsx,actions.ts,_components/entrar-form.tsx}`,
`restablecer/{page.tsx,actions.ts,_components/restablecer-form.tsx}`,
`codigo/{page.tsx,actions.ts,_components/codigo-form.tsx}`,
`auth/confirm/route.ts` (+ `route.test.ts`). `activar/actions.ts` has two
rails: fresh-provision (`iniciarActivacion`/`completarActivacion` via
`packages/data/src/server/activacion.ts`, which `fetch`es the
`activar-cuenta` edge function at `NEXT_PUBLIC_SUPABASE_URL/functions/v1/activar-cuenta`)
and `cuenta_existente` (magic-link, `firmaActivacion`). Edge function:
`supabase/functions/activar-cuenta/{index.ts,nucleo.ts,nucleo.test.ts}`.
`auth/confirm/route.ts` redeems `?code=`/`?token_hash=` via
`@gym/data/server/sesion.{confirmarCodigo,confirmarTokenHash}`, then calls
`intentarReclamoConFirma`/`intentarReclamoPorEmail` from
`packages/data/src/server/registro.ts`.

## 5. Session mint / tenant resolution — 6 files
`apps/client/src/proxy.ts` (200 lines), `apps/admin/src/proxy.ts` (111
lines) — both call `resolveTenant`/`tenantHeaders` from
`@gym/data/server/resolve-tenant`, stamp `x-gym`/`x-brand`.
`packages/data/src/{cookie-options.ts,client.ts,server/supabase.ts,server/sesion.ts,server/resolve-tenant.ts,server/fetch-shield.ts}`.
`cookie-options.ts:36` sets `__Host-sb-auth-token` (prod-only). `sesion.ts`
exports `iniciarSesion`, `solicitarReset`, `reenviarConfirmacion`,
`enviarMagicLink`, `confirmarCodigo`, `confirmarTokenHash`,
`confirmarCodigoDeCorreo`, `actualizarPassword`. `fetch-shield.ts` exports
`shieldedFetch`, `JWKS_FALLBACK`.

## 6. First load /reservar — 5 files
`apps/client/src/app/reservar/{page.tsx,actions.ts,layout.tsx,loading.tsx}`,
`_components/{reservar-semana.tsx,sin-membresia.tsx,perfil-overlay.tsx,cerrar-sesion-link.tsx}`.
`page.tsx` calls `getAgendaSemanaMiembro`, `getEsMiembro`,
`getPerfilResumenMiembro`, `getSaldoMiembro` (`@gym/data/server/agenda-miembro`,
which wraps `mi_membresia` RPC at agenda-miembro.ts:494) and
`intentarReclamoPorEmail`. Señal: `packages/data/src/client-senal.ts`
(`useSenalGym`, `crearRegulador`, private Realtime channel `gym:<id>`) +
`apps/client/src/app/_components/senal-gym.tsx` (admin has its own copy at
`apps/admin/src/app/(app)/_components/senal-gym.tsx`).

## 7. RPCs on the path — 12 bodies (supabase/functions-canonical/*.sql)
`registrar_venta.sql`, `next_folio.sql`, `preparar_invitacion.sql`,
`marcar_invitacion_enviada` (body inline, no separate canonical file — check:
not listed, only referenced via call site), `reclamar_o_crear_cliente.sql`,
`reclamar_por_codigo.sql`, `invitacion_info.sql`, `mi_membresia.sql`,
`gym_id_por_host.sql`, `ventas_count_por_cliente.sql`,
`toggle_pase.sql` (ficha), `aceptar_acuerdo.sql` (consent). Spanish
`RAISE EXCEPTION` strings: 14 in `preparar_invitacion.sql`/
`reclamar_o_crear_cliente.sql`/`reclamar_por_codigo.sql`/`mi_membresia.sql`,
16 more in `registrar_venta.sql` (incl. `CLIENTE_DUPLICADO:%` sentinel).

## 8. Tables / policies / triggers — 12 migrations touch this path
`20260530023224_create_ventas_core.sql` (clientes/paquetes/ventas +
`clientes_select_own`/`insert_own`/`update_own` policies — legacy `user_id`
predicate, later superseded),
`20260530040213_clientes_email_birthday.sql`,
`20260601022323_clientes_tel_10_digits.sql`,
`20260702161010_create_gym_membership.sql` (+ `gym_membership_self_select`,
`gym_membership_staff_select`), `20260702173309_gym_scoped_rls_policies.sql`,
`20260705081431_contract_a_drop_legacy_policies.sql`,
`20260706190000/200000_clientes_favorite_class_type/notificaciones_toggle.sql`,
`20260708200000_clientes_claim_code.sql` (adds `claim_code`,
`invitacion_enviada_at`), `20260714080000_rls_uncorrelated_predicates.sql`,
`20260801120000_clientes_tel_opcional.sql`,
`20260808150000_clientes_privacy_aviso_version.sql` (consent column),
`20260901120000_senal_gym.sql` (per-table AFTER INSERT/UPDATE/DELETE
triggers calling `senal_gym()` + `senal_gym_select` policy on
`realtime.messages`).

## 9. Test coverage
- Vitest, path-relevant (18 in `packages/data/src/server` + `client-senal.test.ts`,
  33 in `apps/admin`/`apps/client` incl. `apps/client/src/app/auth/confirm/route.test.ts`,
  `apps/client/src/proxy.test.ts`, `apps/admin/src/app/(app)/vender/**`,
  `apps/admin/.../clientes/**`).
- `supabase/tests/*.sql` on this path (all present in `SUITE`, `QUARANTINE`
  is empty — `run-denial-suite.mjs:85-154`): `registro_claim.sql`,
  `preparar_invitacion_rules.sql`, `actualizar_cliente_email_rules.sql`,
  `actualizar_cliente_rules.sql`, `reclamar_por_codigo.sql`,
  `registrar_venta_{stamps_gym_id,email,stacking,personalizado,backdate}.sql`,
  `editar_venta_{rules,paquete}.sql`, `eliminar_venta_rules.sql`,
  `renewal_schema_prep.sql`, `contract_{a,b}_denials.sql`,
  `gym_tenant_anon_read.sql`, `gym_membership_rls.sql`, `mi_membresia_rules.sql`,
  `toggle_pase_{rules,gym2_timezone}.sql`, `aceptar_acuerdo.sql`,
  `dos_gimnasios_tenant_pin.sql`, `gym2_probe.sql`, `senal_gym.sql`,
  `rls_cross_tenant_denial.sql`, `rekey_gym_scoped.sql` — 45 total files in
  SUITE, ~25 of them touch this path directly.
- `apps/client/e2e/{signup.spec.ts (199 lines, 3 tests),session.spec.ts (137
  lines, 3 tests)}` — Playwright, not in CI/pre-commit, convention-gated per
  AGENTS.md (`pnpm test:e2e`).
- Gates NOT in pre-commit (convention-only, per AGENTS.md): `test:denial`,
  `test:e2e`.

## 10. Env vars / config (names only, grepped `process.env.`/`Deno.env.get`)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NODE_ENV`, `PLATFORM_CLIENT_FALLBACK_HOST`, `RESEND_API_KEY`,
`RESEND_FROM`, `TENANT_ASSERTION_KEY`, `SEND_EMAIL_HOOK_SECRET`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`,
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` — 13 names.
Supabase auth setting dependency (not repo config): Auth Redirect-URL
allow-list (send-email/index.ts:11-14 comment), Send Email Hook toggle
(dashboard, manual).

## 11. User-visible Spanish error strings (file:line) — 14 in app-tier action
files + 16 more `RAISE EXCEPTION` in `registrar_venta.sql` (§7)
- `apps/client/src/app/activar/actions.ts:53,64,76,99,121,129`
- `apps/client/src/app/activar/contrasena/actions.ts:38,41,44,47`
- `apps/client/src/app/registro/actions.ts:42,49`
- `apps/client/src/app/restablecer/actions.ts:21`
(entrar-form.tsx, codigo-form.tsx, vincular-form.tsx, and vender/clientes
action files carry additional inline copy not captured by the `mensaje:`/
`error:` grep pattern — see Blind spots.)

## Blind spots (not examined this pass)
- Did not open `entrar-form.tsx`, `codigo-form.tsx`, `vincular-form.tsx`,
  `vender.tsx`, `cliente-detalle.tsx` bodies for inline/toast copy beyond the
  `mensaje:`/`error:` literal grep — likely under-counts §11.
- Did not confirm `marcar_invitacion_enviada`'s canonical SQL file (absent
  from the `functions-canonical` listing captured — may be inlined elsewhere
  or named differently; unverified this round).
- Did not query live Supabase (`list_tables`/`execute_sql`) to confirm which
  `clientes`/`gym_membership` policies are the CURRENT effective set vs.
  superseded-by-later-migration; §8 is migration-file order only, not a
  live `pg_policies` read.
- Did not open `apps/mobile/` (untracked at session start) — task scope is
  the admin/client web path only, so it is out of scope, not missed.
- Did not verify `test:denial` was actually run green at HEAD this round —
  SUITE membership confirmed by reading the runner file, not by executing it.
