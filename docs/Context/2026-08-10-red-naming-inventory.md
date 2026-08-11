# RED-as-platform-name inventory — 2026-08-10

Read-only sweep for every place "RED" is used to name the **platform** (iBookit) rather
than the RED gym brand/tenant. Scope: `docs/legal/gate0-borradores/*`,
`packages/domain/src/legal.ts`, `supabase/functions/send-email/`, all user-facing copy in
`apps/admin` + `apps/client`, README-class docs, `packages/brand`.

Excluded from this inventory per instructions (being deleted by another agent this
session): `apps/admin/src/app/(app)/_components/aceptar-anexo.tsx`,
`apps/admin/src/app/(app)/cuenta/anexo/page.tsx`, the anexo banner in
`apps/admin/src/app/(app)/layout.tsx`, `aceptarAnexoAction` in `(app)/actions.ts`, the
`ANEXO_TRATAMIENTO_DATOS_*` constants in `packages/domain/src/legal.ts` (lines ~25–241,
~37–46 "RED" occurrences depending on count method), `tools/guards/anexo-legal-drift.test.ts`.

---

## A — user-visible in product TODAY (2 hits, 1 file)

Tenant-agnostic infrastructure code: `buildIcs()` takes no brand/tenant parameter, so
every gym's member who clicks "Añadir al calendario" on a booking downloads a `.ics`
file naming "RED" as the producing product — regardless of which gym they belong to.

- `apps/client/src/lib/ics.ts:32` — `"PRODID:-//RED//Reservas//ES",`
- `apps/client/src/lib/ics.ts:35` — `` `UID:${evento.uid}@red`, ``

Call sites (all live, tenant-agnostic, no brand override at any of them):
- `apps/client/src/app/reservar/_components/reservar-semana.tsx:187-191`
- `apps/client/src/app/reservar/_components/perfil-overlay.tsx:49-53`
- `apps/client/src/app/confirmada/[sessionId]/_components/confirmada-vista.tsx:65-69`

**Fix needs a decision, not just a rename**: RFC 5545 PRODID is meant to identify the
*producing product* (i.e. "iBookit" is the correct semantic value here, not a per-gym
brand name) — so the fix is likely `-//iBookit//Reservas//ES` + `@ibookit` rather than
per-tenant substitution. Flag for the fix commit, not a decision made in this audit.

Everything else checked in `apps/admin` and `apps/client` came back clean: root/layout
metadata (`apps/client/src/app/layout.tsx` generic "Gym" title; `apps/admin/src/app/layout.tsx`
pulls per-tenant title from `resolveBrand()`), toasts/alerts/empty-states, receipt
generation (`negocio` is per-sale data, not a literal), footers (`{brandName}`/`{marca}`
are resolved per gym, not hardcoded). `supabase/functions/send-email/correo.ts` and
`index.ts` (the live templates) have zero "RED" occurrences — sender name is `gymNombre`
or the neutral fallback `"Notificaciones"`. `packages/brand` has no platform-name leak —
the `red` module is a normal per-brand config entry, structurally identical to `forge`;
the neutral `base` entry correctly says "Gimnasio"/"plataforma multi-inquilino", never
"RED". No README-class doc (`README.md`, `ARCHITECTURE.md`, `CONTEXT.md`, `docs/adr/*`)
is read at runtime by any app code — dev-facing only, out of scope.

---

## B — docs/borrador only (72 hits, 5 files)

All of the following sit in **borrador legal text that is not read by any app at
runtime** — the `.md` files are only ever read by `vitest` drift guards
(`tools/guards/anexo-legal-drift.test.ts`, `tools/guards/aviso-legal-drift.test.ts`), and
the non-excluded parts of `packages/domain/src/legal.ts` (the `AVISO_PRIVACIDAD_*`
constants) are stripped by `cuerpoMiembroIntegral`/`cuerpoMiembroSimplificado` before
`renderAvisoIntegral`/`renderAvisoSimplificado` ever reach the live `/legal` route
(`apps/client/src/app/legal/page.tsx`) or the admin CUENTA preview
(`apps/admin/src/app/(app)/cuenta/_components/legal-identity-sheet.tsx`). Traced and
confirmed: **zero "RED"-as-platform text survives into the actual member-facing render.**

**Caveat worth carrying into the fix**: the `.md` files' text is *separately* mirrored
byte-for-byte into `packages/domain/src/legal.ts`'s `ANEXO_TRATAMIENTO_DATOS_TEXTO`
constant, which — outside this audit's exclusion — **is** rendered live to gym owners via
the anexo click-wrap gate. That surface is out of scope here only because it's being
deleted this session; if it survives in any form, its ~46 "RED" occurrences are not B,
they're A, and are not double-counted below.

### `packages/domain/src/legal.ts` (9 hits, outside the excluded Anexo constant)

- `legal.ts:260` — `"El aviso resultante es documento del gimnasio, no de RED. RED únicamente lo genera..."` — pre-slice drafting note, never reaches `cuerpoMiembroIntegral`'s output.
- `legal.ts:262` — `"...Las categorías de datos enumeradas son las que RED realmente trata... RED no puede conocerlos."` — same drafting-notes block.
- `legal.ts:368` — `"Utilizamos la plataforma de gestión de gimnasios RED, operada por \`{{red_razon_social}}\`..."` — inside the "PÁRRAFO OPCIONAL — ALOJAMIENTO Y ENCARGADOS" block, explicitly sliced out by `cuerpoMiembroIntegral`'s `fin` marker. The single most dangerous string in the file if ever wired up unstripped.
- `legal.ts:383` — `"| {{url_aviso_integral}} | Generado por RED | ... |"` — CAMPOS DE COMBINACIÓN reference table, after the slice's `fin`.
- `legal.ts:384` — `"| {{fecha_actualizacion}} | Generado por RED | 07 de agosto de 2026 |"` — same table.
- `legal.ts:385` — `"| {{version_aviso}} | Generado por RED | 1.0 |"` — same table.
- `legal.ts:430` — `"| {{url_aviso_integral}} | Generado por RED — URL estable por inquilino |"` — simplificado template's own combination table, after `cuerpoMiembroSimplificado`'s end marker.
- `legal.ts:447` — TSDoc comment quoting the template's "Generado por RED" wording for developer context; never rendered.
- `legal.ts:506-507` — TSDoc comment on `AVISO_PRIVACIDAD_VERSION`/`AVISO_PRIVACIDAD_FECHA_ACTUALIZACION`, same as above.

### `docs/legal/gate0-borradores/anexo-tratamiento-datos.md` (47 hits)

L2, L8, L27 (×2), L33, L34, L35 (×2), L44, L48 (×2), L52, L54, L56, L58, L62, L66 (×3),
L70, L79 (×3), L85, L87, L89, L91, L95, L97 (×2), L99, L103, L105, L107, L113, L117,
L119, L123, L125, L132, L134, L153 (×2), L163 (×2), L185, L207.

Representative: L2 `"...de la Plataforma RED)"`; L27 `"...operadora de la plataforma de
gestión de gimnasios \"RED\" (la \"Plataforma\"; ... la \"Encargada\" o \"RED\")."`; L185
`"Objeto | Prestación del servicio de software de gestión de gimnasios RED..."`.

### `docs/legal/gate0-borradores/aviso-privacidad-integral-template.md` (8 hits)

- L7 (×2) — `"...documento del gimnasio, no de RED. RED únicamente lo genera..."`
- L9 (×2) — `"...las que RED realmente trata... RED no puede conocerlos."`
- L115 — `"Utilizamos la plataforma de gestión de gimnasios RED, operada por {{red_razon_social}}..."`
- L130 — `"Generado por RED | https://{{host_gimnasio}}/aviso-de-privacidad"`
- L131 — `"Generado por RED | 07 de agosto de 2026"`
- L132 — `"Generado por RED | 1.0"`

### `docs/legal/gate0-borradores/aviso-privacidad-simplificado-template.md` (1 hit)

- L37 — `"Generado por RED — URL estable por inquilino"`

### `docs/legal/gate0-borradores/brief-abogado.md` (7 hits)

- L1 — `"# BRIEF PARA ABOGADO — PROTECCIÓN DE DATOS PERSONALES (RED)"`
- L7 (×3) — `"RED es un SaaS multi-inquilino..."`, `"...RED es encargada;"`, `"RED se aloja en Supabase, Inc. sobre AWS..."`
- L30 — `"...gimnasio (responsable) → RED (encargada) → Supabase, Inc. (subencargada) → AWS..."`
- L32 — `"¿La exclusión del art. 2-XX cubre a los subencargados de RED, o Supabase debe reputarse \"tercero\"...?"`
- L53 — `"RED no los trata y los prohíbe contractualmente..."`

---

## C — examples of legitimate RED-gym-brand usage (representative, not exhaustive)

- `packages/brand/src/registry.ts:133-146` — the `red` brand module's own config: `copy: { name: "RED", description: "RED — administración del gimnasio.", tagline: "Con beneficios de luz roja" }`, structurally identical to the `forge` entry. This is the RED tenant naming itself, correctly.
- `apps/admin/src/app/(app)/vender/_components/ticket-twin.ts:35,44` — `RED_TICKET` palette, selected via `ticketPalette(brandId): return brandId === "red" ? RED_TICKET : FORGE_TICKET` — per-brand receipt styling keyed on the gym's own brand id.
- `apps/client/src/app/globals.css:11,225,430` — `@import "@gym/brand/red/neon.css"` and `[data-brand="red"]` selectors — brand-scoped CSS keyed on the tenant's own `data-brand` attribute.
- `supabase/functions/send-email/correo.test.ts:37,39,66,68,89-91` — test fixture `gymNombre: "RED"`, asserting the RED tenant's own name appears in its own emails, plus `red-demo.ibookit.lat`/`red.ibookit.lat` subdomain fixtures.
- `apps/admin/src/app/(app)/vender/recibo-envio.test.ts:32,83,114` — test fixture `negocio: "RED"`, asserting `"Tu recibo de RED · F-1001"` — the receipt threads the sale's own `negocio` field, confirmed per-gym.
- ~30 further instances across both apps are JSDoc/comment prose describing the brand-neutral token architecture ("a RED host renders RED and a Forge host renders Forge") or references to "the RED mock" (the original design reference) — developer comments, not user-facing strings, and not enumerated here.

---

## Methodology

Four parallel read-only sweeps (legal.ts render-path trace through `cuerpoMiembroIntegral`/
`renderAvisoIntegral` to their live call sites; the four gate0-borradores `.md` files plus
a runtime-fs-read check; a full `apps/admin`+`apps/client` grep-then-read-context pass
excluding CSS color tokens and unrelated substrings; email templates + `packages/brand` +
README-leak check) — classification required tracing actual render/import paths per hit,
not counting raw grep matches.
