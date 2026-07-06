# Slice #55 — Registro screen (Phase-6 client app)

RED-designed registration over the shipped Phase-3 register + claim-by-match flow.
UI-only + a captcha gate. No schema change (Phase-3 registration already carries
nombre/phone/terms; the claim RPC is reused untouched — including ADR-0009 debt I1,
which is left alone).

## Reuse (untouched)
- `@gym/data/server/registro` `registrarSocio` + `reclamarCliente` + `reclamar_o_crear_cliente` RPC.
- `apps/client/src/app/auth/confirm/route.ts` PKCE + claim.
- #54 patterns on the base: `AuthShell`, `resolveBrand`, `auth-validacion.ts`, the
  LoginHero seam (`brand.loginAnimation`), public-header hide set, the underline-field visual language.

## Changes (TDD, failing test first where there is pure logic)
1. `apps/client/src/lib/auth-validacion.ts` — ADD `validarNombreCompleto` (min 3 → "Escribe tu nombre completo.")
   + `validarTelefono` (uses `isTelValido` from `@gym/format` → "Ingresa un teléfono a 10 dígitos.").
   Tests in `auth-validacion.test.ts` FIRST.
2. `apps/client/src/lib/turnstile.ts` — NEW minimal server-side Cloudflare Turnstile verifier
   (fails closed; TEST-secret default so dev/tests pass with no real key). Test FIRST.
   Intentionally identical in shape to the sibling slice-53 verifier so the later stack merge is clean
   (duplication across siblings is accepted per the brief).
3. `apps/client/.env.example` — ADD the Turnstile key pair (documented always-pass test defaults).
4. `apps/client/src/app/registro/actions.ts` — verify Turnstile token (`cf-turnstile-response`) +
   caller IP BEFORE `registrarSocio`; refuse on failure. Host-resolved gym stays server-authoritative.
5. `apps/client/src/app/registro/_components/registro-form.tsx` — REWRITE as the RED-designed island:
   nombre / correo / teléfono(+52 prefix) / contraseña(show-hide), inline per-field validation on
   blur + submit, terms+privacy checkbox that gates the submit (disabled until checked), Turnstile
   widget, in-place success panel. `new FormData(form)` on valid submit carries the injected token.
6. `apps/client/src/app/registro/page.tsx` — mirror the entrar page: `resolveBrand` → LoginHero(form)
   with AuthShell fallback; keep the unknown-host refusal (no `x-gym` ⇒ "Sitio no reconocido").
7. `apps/client/src/app/_components/public-header.tsx` — add `/registro` to the header-hidden set.

## Acceptance mapping
- New reg on red-demo host → account+membership, confirm lands signed in: the Phase-3 flow is reused
  intact; the action still re-resolves gym from host + sets `emailRedirectTo` to this host's /auth/confirm.
- Known unclaimed email claims the row (balance/history carry): `reclamar_o_crear_cliente` untouched.
- Captcha enforced + terms/privacy timestamps persisted: new server-side verify gate; one checkbox →
  both timestamps via the existing `acepta` DAL contract.
- Submit disabled until terms accepted; validation states per mock: enforced in the island.
- Pre-commit suite green: lint + typecheck + test.

## Verify
Drive `/registro` on a red-demo host locally: refuse on unknown host, inline errors per field, submit
gated by terms, success panel on a well-formed submit (test Turnstile key always-passes).
