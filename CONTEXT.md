# Forge — Domain Glossary (es-MX)

The ubiquitous language of the gym. Every domain noun maps to a TypeScript
type and a file, so a rename surfaces drift. Distilled from the client brief
(`docs/superpowers/specs/2026-05-27-forge-gym-admin-architecture.md`).

| Término | Significado | Dónde vive en el código |
|---|---|---|
| **cliente** | A gym member. | stored `ClienteFacts` → derived `ClienteDerivado` — `packages/data/src/server/derive.ts` (per-screen DTOs in `packages/data/src/server/clientes.ts`) |
| **ficha** | A client's detail/profile screen. | `apps/admin/src/app/(app)/clientes/[id]/` |
| **paquete** | A class package: 8 clases / 12 clases / Ilimitado. | `PaqueteDTO` — `packages/data/src/server/paquetes.ts`; the contributed `CompraPaquete` — `packages/domain/src/types.ts` |
| **vigencia** | A package's validity window (días, or the calendar month for Ilimitado). | `Vigencia` + `calcVigenciaEnd` — `packages/domain/src/` |
| **asistencia** / **pase de lista** | Recording that a client attended. | `apps/admin/src/app/(app)/asistencia/` |
| **venta** | Selling/renewing a package. | `apps/admin/src/app/(app)/vender/` |
| **recibo** | The sale receipt. | `apps/admin/src/app/(app)/vender/_components/` |
| **estado** | A PACKAGE's derived lifecycle — never a verdict on the person (no `Activo`/`Inactivo` on a human, #225): `vigente` / `vencido` / `sin_clases` / `sin_paquete`. Never stored. FECHA WINS (A2): `vencido` is set unconditionally once the date has lapsed, even when classes also read 0 — `sin_clases` is reserved for class-empty WITH days remaining; `sin_paquete` covers "no package at all" (a same-day sign-up or a pendienteOnline row). Single source: `derivarEstado` (a Saldo + the pase-suelto fact) — `derivarLifecycle` (the lifecycle engine, richer input) calls this SAME function rather than a second copy. Replaces the retired `activo`/`por_vencer`/`sin_clases` split — that threshold now lives in **urgencia**/POR RENOVAR, never in estado. | `EstadoCliente` (= `EstadoPaquete`) + `derivarEstado` — `packages/domain/src/rules.ts`; re-exported as `EstadoPaquete` by `packages/domain/src/lifecycle.ts` |
| **urgencia** | Derived retention urgency (`critico`/`urgente`/`pronto`/`ok`) from whichever of clases\|días lapses first; drives the directory's sort + accent color. **FLOORED** by `nivelUrgenciaLifecycle` (#225, widened F3): a `vencido` OR `sin_paquete` package is never `critico` — a lapsed package has nothing left to run out of, and a package-less one (a same-day sign-up) never had anything to begin with (story 13). `urgenciaCliente`'s own dimension thresholds (día/clase bands) are the ONE place those numbers live; every consumer passes `estado` and reads the floored wrapper, never re-derives the bands. | `Urgencia` / `NivelUrgencia` + `urgenciaCliente` (raw) / `nivelUrgenciaLifecycle` (floored, takes `estado`) — `packages/domain/src/` |
| **por renovar** | The renewal-due gate (`esPorRenovar`): a live package (not `vencido`, not `sin_paquete`) within `RENOVACION_DIAS` of its date OR down to `RENOVACION_CLASES` classes (the pase suelto exemption applies — see **pase suelto**). Drives INICIO's POR RENOVAR tile (`derivarTile`), the pase de lista's badge, and the directory's "por renovar" filter/count — the SAME single-row predicate everywhere (#225 F4: two live meanings of this phrase — the directory's own `nivel ∈ {critico,urgente}` gate — was the exact bug map #180 was chartered to kill). The full CLIENTES flat-list rebuild (estado column, ratio header, ruled order) is #227's. | `esPorRenovar` / `RENOVACION_DIAS` / `RENOVACION_CLASES` — `packages/domain/src/lifecycle.ts` |
| **vigentes** / **resumen del roster** | Count of clientes with estado `vigente`; `total` = the whole roster (the "/ N" denominator — never a narrower "activos" subset on people, #225). One predicate shared by the dashboard (`getRosterResumen`) and the directory header, both reading `derivarCliente`/`derivarEstado`. | `contarLifecycle` + `ResumenRoster` — `packages/domain/src/` (`resumirRoster` retired #230 — its only callers were `/proto`); `getRosterResumen` — `packages/data/src/server/clientes.ts` |
| **ciclo de vida** (del paquete) / **eje** | The lifecycle engine (#223, spec #222/map #180; unified with `derivarEstado`/`urgenciaCliente` by #225 — one source, not a parallel copy). Derives, from one roster row + `hoy`: `estado` (see **estado**, above — this engine's `EstadoPaquete` IS `EstadoCliente`), `eje` (which axis binds a non-vigente package — `fecha` wins unconditionally when a package is both date-expired and class-exhausted), the two INICIO tiles (`por_renovar` / `aun_a_tiempo`, clocked from expiry only), the urgencia FLOOR (a VENCIDO row is never `critico` — there is nothing left to run out of), and the `ausente` badge (a null last-visit floors on `alta`, never gated on estado). `pendienteOnline` is reconciled against AÚN A TIEMPO structurally (that tile requires no app account, and a pendienteOnline row always carries one) — and, since #227 F1 narrowed `esRegistroOnlinePendiente` to `estado === sin_paquete` (a lapsed account-holder is a plain `vencido`, not pendienteOnline), a pendienteOnline row now always carries `vence: null` too, so it can never even reach AÚN A TIEMPO's `estado === vencido` gate. Never `Activo`/`Inactivo` on a person — every label names a package and a clock. | `derivarLifecycle` / `FilaLifecycle` / `ordenarLifecycle` / `contarLifecycle` / `nivelUrgenciaLifecycle` — `packages/domain/src/lifecycle.ts` |
| **pase suelto** (one-off / drop-in) | A single-session package — a catalog grant of exactly 1 class (never a roster row's current remaining balance, which drains through 1 legitimately). Never a renewal target: structurally excluded from the whole CLASES axis (never `sin_clases`, never POR RENOVAR's clases arm, never AÚN A TIEMPO, never drives urgencia) — only its own días can still place it in POR RENOVAR. Classified from the package's own catalog fact, never a `paquete_nombre` string match in data/UI. | `esPaseSuelto` (the membership-vs-drop-in predicate) — `packages/domain/src/lifecycle.ts` |
| **clases restantes** | Classes left (a number, or `ilimitado`). | `Clases` (`Saldo.clases`) — `packages/domain/src/types.ts` |
| **stacking** | Buying a package early ADDS its classes + days onto the current one. | `stackPaquete` (+ `baseParaStack`, the still-valid base) — `packages/domain/src/rules.ts` |
| **forfeit** | Remaining classes are lost when the vigencia expires. | `forfeit` — `packages/domain/src/rules.ts` |
| **plantilla** | A WhatsApp message template with `{token}` placeholders. | `renderPlantilla` — `packages/domain/src/rules.ts` |
| **cobro** | Payment/bank details for transfers (titular, banco, CLABE). | `CobroDTO` — `packages/data/src/server/cobro.ts` |
| **perfil** | The single operator's profile + brand (`negocio` = "FORGE", coach, ciudad). | `PerfilDTO` — `packages/data/src/server/perfil.ts` |
| **por pagar** / **pendiente** | RETIRED (ruling C2, 2026-07-08): every sale collects at COBRAR. `MetodoPago` is exactly `efectivo\|transferencia\|tarjeta` — a DB CHECK enforces it, so a "Por pagar" bucket can never exist. | `MetodoPago` — `packages/domain/src/types.ts`; `20260710120000_renewal_schema_prep.sql` |
| **respaldo** | The operator's **operational export** of the gym's record — a formatted, multi-sheet Excel. Since 2026-07-13 (ADR-0006 amendment): `?mes=YYYY-MM` exports ONE gym-local month (5 sheets: Resumen / Ventas / Asistencias / Altas / Paquetes); the default is the last 24 months (4 classic sheets). A curated report the operator keeps, **not** a DB disaster-recovery backup (Supabase PITR owns that); excludes config + secrets (cobro/CLABE, perfil, plantillas). | `docs/adr/0006-respaldo-operational-export.md`; `packages/data/src/server/respaldo.ts` (gather) + `packages/data/src/server/export/` (build, ExcelJS) + `apps/admin/src/app/(app)/cuenta/respaldo/route.ts` (deliver) |
| **corte** (del mes) | One month's reckoning, folded from the ledgers: ingresos, ventas, ticket promedio, desglose por método (3 buckets), altas, asistencias, plus a prior-month block. **parcial** = the month is still in progress (prev block cut like-for-like to the same day); a closed month compares the FULL prior month. Raw numbers — the shaper/chart formats. | `calcularCorteMes`, `CorteMes`/`VentaMes`/`AltaMes` — `packages/domain/src/rules.ts` + `types.ts` |
| **coach** | A roster member the operator curates (nombre, iniciales, rol, especialidad, bio); `activo`/`orden` drive deactivate + reorder. Deactivation, not deletion — a coach already cited by a class session stays renderable. | `CoachDTO` — `packages/data/src/server/coach.ts`; authoring under `apps/admin/src/app/(app)/cuenta/_components/coaches-sheet.tsx` |
| **tipo de clase** | A curated class-catalog entry (nombre, sala, nivel, descripción, duración) with two ordered child lists: **bloques** (workout segments, e.g. "Calentamiento") and **porTraer** (what to bring, e.g. "Toalla"). No delete path — add/edit/reorder only. | `ClassTypeDTO` — `packages/data/src/server/class-type.ts`; authoring under `apps/admin/src/app/(app)/cuenta/_components/class-types-sheet.tsx` |
| **sin reserva** / **visita sin reserva** | A member the desk checks into a class session who had no prior booking — added on the spot from the class sheet's "Agregar visita" picker, then checked in through the exact same pasar-lista path as a booked member. The roster chip reads SIN RESERVA, the same term the Asistencia screen already uses for the un-booked group (#236 — the glossary gap was the stated reason the English "walk-in" leaked into the UI). The DB flag `is_walk_in` keeps its English name by decision: it is a stored identifier, never shown to an operator, and renaming it is out of scope (#235). | `RosterRow.isWalkIn` — `packages/ui/src/forge/agenda/session-roster.tsx`; `is_walk_in` column — `supabase/migrations/` |
| **ventana de arribo** (arrival window) | The half-open window `[startsAt − 90 min, startsAt + duración + 15 min)` during which a booking can be marked/checked in or reads as a candidate for **no asistió**. Twin of the SQL `public.ventana_arribo(...)` — display and write share one boundary. | `ventanaArribo` / `enVentanaArribo` / `esNoAsistio` — `packages/domain/src/rules.ts` |

**Flagged tension:** the brief marks phone *optional* (Q4), but WhatsApp retention is the app's reason to exist, so phone is treated as *required* in practice. Email and birthday are optional stored fields (brief Q4). Brand name is **"FORGE"** (Q10) — not "Forge Bootcamp" (a mock string to be removed). **respaldo** is an overloaded word resolved here: it means the operator-facing *operational export* (a curated report), **never** a database disaster-recovery backup — Supabase PITR owns DR, and the file deliberately omits the `cobro` bank details (CLABE) so it is safe to email (ADR-0006).

## Plataforma multi-inquilino (multi-tenant)

Al servir muchos gimnasios desde un mismo despliegue por app, el vocabulario del
producto crece. La **marca es solo presentación** — nunca decide autorización
(ADR-0008); el aislamiento de datos es por membresía vía RLS (Fase 3), nunca por
el host.

| Término | Significado | Dónde vive |
|---|---|---|
| **inquilino** (tenant) | Un **gimnasio** — la fila `gym` (`slug`, `timezone` IANA, `brand_module_id`, `token_overrides`). Es la frontera de aislamiento, resuelta por `gym_membership` vía RLS — **nunca** por el host. | tabla `gym` (migración Fase 3); ADR-0008/0013 |
| **gym_domain** | La fila `hostname → gym` (`gym_id`, `hostname` único, `app` admin\|client). Un gimnasio necesita ≥2 hosts. Desde #216 `anon` **no** lee la tabla: resuelve **un** hostname que ya conoce vía `gym_id_por_host` (SECURITY DEFINER) — un hostname es un hecho público de DNS, la *lista completa* es el censo de clientes de la plataforma. `authenticated` ve solo los dominios de sus propios gimnasios. | tabla `gym_domain` (Fase 3); ADR-0012 §5 |
| **gym_membership** (membresía de gimnasio) | La fila `(user_id, gym_id, role ∈ owner\|operator\|member)` de la que **toda** política RLS resuelve "qué gimnasio + qué rol". Escrita solo dentro de RPCs SECURITY DEFINER, nunca directo. | tabla `gym_membership` (Fase 3); ADR-0009/0013 |
| **reclamar** (claim-by-match) | Al registrarse, un **email verificado** que coincide con un `cliente` pre-existente del gimnasio reclama esa fila (saldo + historial siguen). El teléfono **nunca** reclama (auto-declarado); ambigüedad → fila nueva. Una RPC atómica SECURITY DEFINER hace claim + `gym_membership` en una transacción. Desde 2026-07-08 es el **rail de respaldo**: el rail primario es *reclamar por código* (ADR-0015). | ADR-0009 (enmienda 2026-07-02) |
| **invitación** / **código de invitación** (claim code) | El join determinista entre la venta del staff y el login del miembro: `clientes.claim_code` — 8 caracteres cripto-aleatorios (A-Z, 2-9), único global, **sin expiración, un solo uso** (se borra al reclamar). Se envía automáticamente por email (Resend) al registrar la venta con email, o al backfillear el email después. El email pasa a ser **dato de contacto, nunca el conector**. | ADR-0015; `clientes.claim_code` |
| **reclamar por código** | El claim primario: `/activar?codigo=…` (la ÚNICA puerta de invitación; el brazo `/registro?codigo=` se eliminó — H2v2 opción b) → RPC SECURITY DEFINER resuelve la fila por `claim_code`, sella `auth_user_id`, **sobrescribe `clientes.email` con el email verificado del login**, borra el código y upserta `gym_membership`. El código resuelve la fila, la fila resuelve el gym — el host jamás es input de authz (ADR-0008). | ADR-0015; RPC `reclamar_por_codigo` |
| **estados de invitación** | Ciclo derivado (nunca almacenado como enum): `sin email` → `sin invitar` → `invitación enviada {fecha}` (re-enviable) → `cuenta activa` (`auth_user_id` sellado). Visible en ficha, roster, picker de Vender y recibo. | derivado de `email`/`invitacion_enviada_at`/`auth_user_id` |
| **registro online pendiente** | Un miembro que se auto-registró (Door 2: `auth_user_id` sellado) y **nunca ha comprado paquete alguno** (`estado === sin_paquete`) — visible al staff en el tile "Nuevos registros online" + filtro del roster; el cobro en mostrador es una venta **EXISTENTE** sobre esa misma fila (nunca NUEVO). Un miembro CON cuenta cuyo paquete venció o se quedó sin clases NO cuenta aquí — es un `vencido`/`sin_clases` liso (#227 F1): la app cliente ya lo notifica al vencer, así que no debe leerse como "recién llegado" ni encabezar el directorio. | derivado (`esRegistroOnlinePendiente`); tile en inicio, filtro en roster |
| **RLS-por-membresía** | El mecanismo de aislamiento: helpers SECURITY DEFINER (`is_member_of`/`is_staff_of`/`has_role`) initplan-cacheados vía `(select …)`, un predicado estándar por clase RLS (§3 del shield), `cobro`/CLABE solo-owner. | ADR-0013; `supabase/migrations/` (Fase 3) |
| **marca** (brand) | La identidad de presentación de un gimnasio-cliente (Forge #1, RED #2, más la neutra **base** — Fase 4). Solo tokens/logo/animación/copy; nunca cambia datos, reglas ni permisos. | `BrandId` — `packages/brand/src/brand-id.ts` |
| **contrato de marca** (brand contract) | La interfaz de **nombres** de variables CSS (`--canvas`, `--yellow`, `--fg`, …) que los primitivos de `@gym/ui` consumen por nombre. La abstracción estable (DIP) que toda marca debe llenar; no se inventa una segunda capa. El esquema zod de `token_overrides` (Fase 4) es su espejo machine-checked: solo estas claves son sobreescribibles. | `apps/admin/src/app/globals.css` (`@theme inline`) |
| **módulo de marca** (brand module) | La implementación concreta del contrato para una marca: **valores** de tokens (estructurados; un único serializador los vuelve CSS) + logo + copy (nombre, descripción) + una animación opcional. Es **código** (raro, enumerable); censo Fase 4: **base, forge, red** (el test de censo es un tripwire deliberado). | `BrandModule` / `brands` — `packages/brand/src/registry.ts` (valores en `packages/brand/src/forge/`, `packages/brand/src/red/`) |
| **módulo base** | El módulo de marca neutro que sirven los miles de gimnasios sin código a medida; es el `DEFAULT_BRAND` (fallback cuando `x-brand` es desconocido o ausente — el único knob de fallback). Renderiza completo desde baseline + datos de fila; su voz de copy neutra la aprueba el humano (HITL Fase 4). | `packages/brand/src/base/` (tokens/logo/app-icon) + su fila en `packages/brand/src/registry.ts` |
| **token overrides** (personalización por gimnasio) | El jsonb `gym.token_overrides`: mapa parcial `{ light?, dark? }` de claves del contrato → valores CSS, con light/dark sobreescribibles por separado. Validado por zod — enum **cerrado** de claves + charset restringido de valores (ES la guardia del `dangerouslySetInnerHTML`); payload inválido → baseline íntegro del módulo. El CSS servido = `módulo ⊕ overrides` por el único serializador. | esquema en `packages/brand/src/token-overrides.ts`, merge `brandCss` en `packages/brand/src/brand-css.ts`; columna `gym.token_overrides` (Fase 3) |
| **host → inquilino → marca** | La cadena de resolución que corre en el `proxy.ts` de **ambos apps**: `resolveTenant(host, override)` (async, en `@gym/data`) busca la fila `gym_domain → gym` y el proxy sella `x-gym` (slug del inquilino) + `x-brand` (= `gym.brand_module_id`). El host elige *presentación*, nunca confianza. Precedencia: fila `gym_domain` › override `?gym=` (slug abierto, validado contra la DB) › **sin inquilino** (marca por defecto; escrituras que requieren inquilino se rechazan). | `packages/data` (Fase 3 — reemplaza `resolve-brand-id.ts` + `host-map.ts`, que se **eliminan**); ADR-0012 §5 |

**A escala:** el *módulo de marca* (código) trae el baseline; la **personalización
por gimnasio** (paleta/copy) es **dato** en la fila `gym`: el CSS servido es
`baseline del módulo ⊕ token_overrides`, zod-validado antes de serializar (Fase 4).
Miles de gimnasios comparten el **módulo base** con cero código; unos pocos son a
medida. Onboarding de un gimnasio = fila `gym` + dominio, **nunca** un despliegue
(ADR-0008).

**Flagged ambiguity:** *inquilino* (el gimnasio = tenant) ≠ *cliente* (un miembro
del gym, glosario arriba). El **inquilino-en-efecto** es una propiedad de la petición
*derivada del servidor* que solo puede **reducir** a un gimnasio del que quien llama ya
tiene fila `gym_membership` — **nunca ampliar** (ADR-0008, enmienda 2026-08-02). Sale del
host reconciliado contra la membresía, jamás de un parámetro, header o cookie que el
llamante controle: `tenantHeaders` **borra** un `x-gym`/`x-brand` entrante cuando ningún
inquilino resuelve, así que el header es siempre sellado por el proxy. Qué filas puede
**leer** una sesión lo decide **solo** la RLS por membresía. En **escritura** el host sí
es autoritativo dos veces, a propósito: fija el `gym_id` de un **registro** nuevo (nunca
lo aporta el cliente — ADR-0009) y alimenta `reclamar_o_crear_cliente`, que **inserta**
una fila `gym_membership` — por eso un host desconocido resuelve *sin inquilino* en vez
de caer a Forge, y por eso el app **reconcilia** host↔membresía en vez de servir en
silencio (#203/#212). `@gym/brand` es solo-presentación y no puede
importar `@gym/data` ni `@gym/domain` (frontera dependency-cruiser, ADR-0011 §6).
**Segunda ambigüedad:** *gym_membership* (quién pertenece a qué gimnasio con qué rol)
≠ la futura pantalla **membresía** del mock (la *suscripción/plan* del miembro,
Fase 6) — en código y docs, "membresía" a secas es la suscripción; la fila de
pertenencia se nombra siempre `gym_membership`. En Fase 3 el término del dominio
sigue siendo **cliente**: la tabla `clientes` evoluciona *aditivamente* (gana
`gym_id`, `auth_user_id` NULL permanente, `phone_e164`, timestamps de términos) —
el "`member`" del shield es esta misma fila, sin rename.

## Contenido del gimnasio (Fase 5, PRD #36 S3)

El contenido operador-curado que la app cliente (Fase 6) mostrará en sus páginas
de nosotros/marketing — para que nada de cara al miembro quede hardcodeado. Cada
tabla es `gym_id`-scoped, clase RLS curada/mostrable (ADR-0013 §3: staff escribe,
miembro lee, anon diferido a Fase 6) y trae `sort_order` para el orden que el
operador elige.

| Término | Significado | Dónde vive en el código |
|---|---|---|
| **valor** (about_value) | Una tarjeta de "quiénes somos" (título + descripción), p. ej. "Comunidad". | `AboutValueDTO` — `packages/data/src/server/about-values.ts` |
| **instalación** (facility) | Una tarjeta de instalación (nombre + descripción), p. ej. "Área de pesas". | `FacilityDTO` — `packages/data/src/server/facilities.ts` |
| **stat** | Un par etiqueta/valor de marketing (`value` es texto libre: "500+", "10 años"). | `StatDTO` — `packages/data/src/server/stats.ts` |
| **FAQ** | Un par pregunta/respuesta. | `FaqDTO` — `packages/data/src/server/faqs.ts` |

Autoría bajo `cuenta` (patrón existente de sub-sheet): `apps/admin/src/app/(app)/cuenta/_components/gym-content-sheet.tsx` + los seams `"use server"` en `apps/admin/src/app/(app)/cuenta/actions.ts`. Esquema + RLS: `supabase/migrations/20260706150000_create_gym_content.sql`; suite de negación: `supabase/tests/gym_content_denial.sql`.
