# ToS surface inventory — 2026-08-10

Read-only inventory of every legal-terms surface in the product today, as input to the
platform↔gym Terms-of-Service gap analysis. Two relationships, kept separate throughout:

- **member↔gym** — a gym's member accepting the gym's own terms/privacy notice.
- **platform↔gym** — the gym business accepting iBookit's (RED's) terms as a customer of the SaaS.

---

## 1. Member-facing legal page — `apps/client/src/app/legal/page.tsx`

Route `/legal`, public (no auth gate), reachable pre-login from the marketing footer and
post-login from the perfil overlay. Two sections, both **member↔gym**:

- **"Términos y condiciones"** (`page.tsx:97-116`, id `#terminos`) — static, brand-neutral,
  hardcoded prose (not in `legal.ts`, not per-tenant, not versioned). Covers: membership is
  personal/non-transferable; booking/cancellation/no-show class-credit rules; the gym (`"El
  estudio"`) may adjust schedule/capacity/content; member trains "bajo tu propia
  responsabilidad"; no permanence/penalty for closing an account. Key phrase: *"Al crear una
  cuenta y reservar clases aceptas estos términos."*
- **"Aviso de privacidad"** (`page.tsx:118-120`, id `#privacidad`) — the gym's real per-tenant
  aviso (`renderAvisoIntegral`, `@gym/domain/legal`) when the gym's legal identity is complete
  (`identidadLegalCompleta`), else a generic brand-neutral fallback (`AvisoGenerico`,
  `page.tsx:36-56`) describing "El estudio" as responsable of data.

Both sections govern the **gym's** relationship with **its members**. RED/iBookit is never a
named party here.

## 2. Consent-checkbox language on registro/activar

All three checkboxes are byte-identical and link to the **same page above** — no separate
platform document exists to check against.

| Surface | File:line | Checkbox label | Linked document |
|---|---|---|---|
| Self-registration | `apps/client/src/app/registro/_components/registro-form.tsx:246-275` | *"Acepto los **Términos y Condiciones** y el **Aviso de Privacidad**."* | `/legal#terminos`, `/legal#privacidad` |
| Activation set-password | `apps/client/src/app/activar/contrasena/_components/activar-contrasena-form.tsx:137-166` | Same text, same links | Same |
| Activation (email-only step) | `apps/client/src/app/activar/_components/activar-form.tsx` | **No checkbox** — only email + Turnstile; consent is captured one step later at set-password | n/a |

Both checkbox screens also render `AvisoSimplificadoInline` (the gym's short-form aviso body)
directly above the checkbox.

**What gets stamped, and where (names only, no DB work performed):**
- `apps/client/src/app/registro/actions.ts:56` reads `formData.get("acepta")` → passed to
  `registrarSocio` (`packages/data/src/server/registro.ts:35-37`, zod `.refine(v === true)`,
  gate only — `signUp` itself stamps nothing legal).
- The actual stamp happens post-verification in `reclamarCliente`
  (`packages/data/src/server/registro.ts:135-162`) → RPC `reclamar_o_crear_cliente` with
  `p_aviso_version` (sourced from `AVISO_PRIVACIDAD_VERSION`, or `null` if the gym's aviso
  wasn't complete at render time). Per that function's own doc comment, the RPC stamps
  `clientes.privacy_aviso_version` + `clientes.privacy_accepted_at`, and separately
  `clientes.terms_accepted_at` — **a bare timestamp with no version column**, called out
  in-code as *"Gate 0.1 scope cut"* (there is no Términos-y-Condiciones version concept today).
- `apps/client/src/app/activar/contrasena/actions.ts:31-53` mirrors this: `acepta` gates the
  action (line 40-41), `avisoVersionParaGym(gym)` resolves the version, passed into
  `completarActivacion` → RPC `reclamar_por_codigo` with `p_aviso_version` (per
  `registro.ts:203`).

This entire flow is **member↔gym**: the member is accepting the gym's Términos y the gym's
Aviso de Privacidad. RED/iBookit is not a party to what's being accepted.

## 3. Admin app (`apps/admin`) — searched for any platform↔gym surface

**Found: one candidate, and it is being deleted this session.**

- `apps/admin/src/app/(app)/cuenta/anexo/page.tsx` + `apps/admin/src/app/(app)/_components/aceptar-anexo.tsx`
  — the Gate 0.1 click-wrap for the **Anexo de Tratamiento de Datos** (`ANEXO_TRATAMIENTO_DATOS_TEXTO`,
  `packages/domain/src/legal.ts:1-241`, excluded from the constant inventory below per this
  task's scope, but its *relationship* is the whole reason it's the one real hit). Its own
  Cláusula Primera §II names **"RED"** as "la Encargada" / **el Gimnasio** as "el Responsable" —
  this is the only text anywhere in the repo where the platform and a gym appear as the two
  named parties. Reachable at `/cuenta/anexo`, linked from a dismissible owner-only banner in
  `apps/admin/src/app/(app)/layout.tsx:96-109` ("Anexo de Tratamiento de Datos pendiente").
  Caveats, all visible in the document's own text and in recent commit history:
  - It is a **BORRADOR**: banner reads *"PENDIENTE DE REVISIÓN POR ABOGADO MEXICANO. ESTE
    DOCUMENTO NO CONSTITUYE ASESORÍA LEGAL"* (`legal.ts:33`), version pinned at
    `"0.1-borrador"` (`legal.ts:27`), deliberately reserving `"1.0"` for the reviewed text.
  - It is explicitly scoped as a **rider to a Contrato de Prestación de Servicios that does not
    yet exist**: Cláusula Tercera (`legal.ts:71-73`) and Cláusula Décima Octava §18.1
    (`legal.ts:198-200`) both subordinate this Anexo to a future "Contrato de Prestación de
    Servicios (Gate 2)"; the doc-comment header (`legal.ts:1-24`) states the platform's own
    legal entity ("la persona moral que prestará el servicio") has not yet been constituted.
  - It only covers **data processing**, not commercial terms — no pricing, no SLA, no term/
    termination-for-cause, no liability cap outside data-breach indemnity, no acceptable-use.
  - It was **demoted from a blocking wall to a dismissible banner** by owner ruling 2026-08-10
    (commit `ada6e57`, "demote anexo click-wrap gate from blocking wall to banner") — an owner
    can use the entire admin app today without ever accepting it.
  - Per the current session's own mandate (commit `3247578`, "delete standalone click-wrap, keep
    evidence spine") this surface is slated for deletion in this session — it will not exist
    once that work lands.

- No footer legal text, no "Términos de servicio" link, no copyright/company-identity string
  anywhere else in `apps/admin` (`grep -rniE "terminos|aviso de privacidad|legal|acepto|acuerdo"`
  across `apps/admin/src` returns only the four files above plus `cuenta.tsx` /
  `legal-identity-sheet.tsx`, both of which are the gym's own member-facing aviso editor —
  member↔gym, not platform↔gym).
- No gym signup/onboarding/provisioning surface exists in `apps/admin` at all — confirmed by
  `find apps/admin/src/app -ipath "*onboard*" -o -ipath "*signup*" -o -ipath "*provision*"`
  (zero hits) and by a grep for "Contrato de Prestación de Servicios" / "suscripción" / billing
  language outside `legal.ts` (zero hits). This matches the known fact that gyms are provisioned
  manually — there is no self-serve flow to gate on platform terms even if they existed.

## 4. `packages/domain/src/legal.ts` — full export list (excl. the 3 `ANEXO_TRATAMIENTO_DATOS_*`)

Every remaining export is **member↔gym** — the gym's own aviso de privacidad to its members.
None is platform↔gym.

| Export | Kind | What it is | Relationship |
|---|---|---|---|
| `AVISO_PRIVACIDAD_INTEGRAL_TEXTO` | const | Full aviso-de-privacidad template (LFPDPPP art. 15, 6 elements); gym is "el responsable" | member↔gym |
| `AVISO_PRIVACIDAD_SIMPLIFICADO_TEXTO` | const | Short-form aviso template for electronic-collection points; includes an inert (unused) secondary-purposes checkbox example | member↔gym |
| `IdentidadLegalGym` | interface | Shape of a gym's legal identity (razón social, domicilio, ARCO contact, etc.) used to render its aviso | member↔gym |
| `identidadDesde` | function | Assembles `IdentidadLegalGym` from a gym's DTO + brand name + contact + URL | member↔gym |
| `mergeAvisoTemplate` | function | Pure `{{token}}` substitution over any template string (generic plumbing) | n/a (shared helper) |
| `AVISO_PRIVACIDAD_VERSION` = `"0.1-borrador"` | const | Version stamped on `clientes.privacy_aviso_version` when a member accepts | member↔gym |
| `AVISO_PRIVACIDAD_FECHA_ACTUALIZACION` | const | "Last updated" date shown in the aviso | member↔gym |
| `AVISO_PLAZO_RESPUESTA_ARCO_DIAS` = `"20"`, `AVISO_PLAZO_EJECUCION_ARCO_DIAS` = `"15"` | const | ARCO response/execution day-windows promised to members, flagged "pendiente de verificación legal" | member↔gym |
| `AVISO_CANAL_CAMBIOS_ADICIONAL` | const | The additional change-notice channel text ("aviso visible en la recepción del gimnasio") | member↔gym |
| `urlAvisoIntegralDesde` | function | Builds the aviso's stable public URL (`${origin}/legal`) | member↔gym |
| `renderAvisoIntegral` | function | Renders the full aviso body for a gym's current identity | member↔gym |
| `renderAvisoSimplificado` | function | Renders the short aviso body for a gym's current identity | member↔gym |
| `tokensSinResolver` | function | Finds unresolved `{{token}}`s in any rendered text (generic plumbing) | n/a (shared helper) |
| `camposFaltantesIdentidadLegal` | function | Human-readable list of what a gym still needs to fill in before its aviso is "ready" | member↔gym |
| `identidadLegalCompleta` | function | Boolean readiness check for a gym's aviso | member↔gym |

## 5. Email footers — `supabase/functions/send-email/`

`correo.ts` builds three auth transactional templates (signup confirm, password-change,
generic — inferred from their `cierre` closing lines, `correo.ts:75-108`): *"Si no creaste
esta cuenta, puedes ignorar este mensaje."*, *"Si no solicitaste este cambio, ignora este
mensaje; tu contraseña seguirá igual."*, *"Si no solicitaste esto, puedes ignorar este
mensaje."* (`correo.ts:140,149`). No footer legal boilerplate at all: no Términos/Aviso links,
no company legal name, no copyright/address line, no unsubscribe text. Not a platform↔gym
surface, and not really a member-facing legal document either — just a one-line courtesy
disclaimer.

---

## Verdict

**No platform↔gym Terms of Service exists anywhere in the product today — confirmed, not
assumed.** The only text in the entire repo that even names RED/iBookit and a gym as two
counterparties is the Anexo de Tratamiento de Datos (`packages/domain/src/legal.ts:1-241`,
rendered at `apps/admin/.../cuenta/anexo/page.tsx`), and by its own drafting it cannot stand in
for one: it is a data-processing addendum only (no pricing, SLA, term, termination, liability,
or acceptable-use clauses), it is an unreviewed `"0.1-borrador"` that says on its own banner it
"NO CONSTITUYE ASESORÍA LEGAL", it is explicitly written as a rider to a Contrato de Prestación
de Servicios that has not been authored (RED's own legal entity isn't yet constituted per its
header comment), it was demoted from a blocking gate to a dismissible banner on 2026-08-10
(commit `ada6e57`), and it is slated for deletion as a standalone click-wrap in this very
session (commit `3247578`). Every other legal surface in the codebase — the `/legal` page, the
three registro/activar checkboxes, all fourteen non-Anexo exports of `legal.ts`, the
`legal-identity-sheet.tsx` editor — governs member↔gym only, and RED/iBookit is not a named
party in any of it. There is also no gym signup/onboarding surface in `apps/admin` to attach
platform terms to even if they existed, consistent with gyms being provisioned manually.
