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
| **estado** | Derived lifecycle: `activo` / `por_vencer` / `sin_clases`. Never stored. | `EstadoCliente` + `derivarEstado` — `packages/domain/src/` |
| **urgencia** / **por renovar** | Derived retention urgency (`critico`/`urgente`/`pronto`/`ok`) from whichever of clases\|días lapses first; drives the directory's "por renovar" list + sort. | `Urgencia` / `NivelUrgencia` + `urgenciaCliente` — `packages/domain/src/` |
| **vigentes** / **resumen del roster** | Count of clientes with estado `activo`; `totalActivos` = those not `sin_clases` (the "/ N" denominator). | `resumirRoster` + `ResumenRoster` — `packages/domain/src/` |
| **clases restantes** | Classes left (a number, or `ilimitado`). | `Clases` (`Saldo.clases`) — `packages/domain/src/types.ts` |
| **stacking** | Buying a package early ADDS its classes + days onto the current one. | `stackPaquete` (+ `baseParaStack`, the still-valid base) — `packages/domain/src/rules.ts` |
| **forfeit** | Remaining classes are lost when the vigencia expires. | `forfeit` — `packages/domain/src/rules.ts` |
| **plantilla** | A WhatsApp message template with `{token}` placeholders. | `renderPlantilla` — `packages/domain/src/rules.ts` |
| **cobro** | Payment/bank details for transfers (titular, banco, CLABE). | `CobroDTO` — `packages/data/src/server/cobro.ts` |
| **perfil** | The single operator's profile + brand (`negocio` = "FORGE", coach, ciudad). | `PerfilDTO` — `packages/data/src/server/perfil.ts` |
| **por pagar** / **pendiente** | An optional unpaid sale. | `MetodoPago` `"pendiente"` — `packages/domain/src/types.ts` |
| **respaldo** | The operator's weekly **operational export** of the gym's record — a formatted, multi-sheet Excel (Clientes / Ventas / Asistencias + a Paquetes reference). A curated report the operator keeps, **not** a DB disaster-recovery backup (Supabase PITR owns that); excludes config + secrets (cobro/CLABE, perfil, plantillas). | `docs/adr/0006-respaldo-operational-export.md`; `packages/data/src/server/respaldo.ts` (gather) + `packages/data/src/server/export/` (build, ExcelJS) + `apps/admin/src/app/(app)/cuenta/respaldo/route.ts` (deliver) |

**Flagged tension:** the brief marks phone *optional* (Q4), but WhatsApp retention is the app's reason to exist, so phone is treated as *required* in practice. Email and birthday are optional stored fields (brief Q4). Brand name is **"FORGE"** (Q10) — not "Forge Bootcamp" (a mock string to be removed). **respaldo** is an overloaded word resolved here: it means the operator-facing *operational export* (a curated report), **never** a database disaster-recovery backup — Supabase PITR owns DR, and the file deliberately omits the `cobro` bank details (CLABE) so it is safe to email (ADR-0006).

## Plataforma multi-inquilino (multi-tenant)

Al servir muchos gimnasios desde un mismo despliegue por app, el vocabulario del
producto crece. La **marca es solo presentación** — nunca decide autorización
(ADR-0008); el aislamiento de datos es por membresía vía RLS (Fase 3), nunca por
el host.

| Término | Significado | Dónde vive |
|---|---|---|
| **inquilino** (tenant) | Un **gimnasio** — la fila `gym` (`slug`, `timezone` IANA, `brand_module_id`, `token_overrides`). Es la frontera de aislamiento, resuelta por `gym_membership` vía RLS — **nunca** por el host. | tabla `gym` (migración Fase 3); ADR-0008/0013 |
| **gym_domain** | La fila `hostname → gym` (`gym_id`, `hostname` único, `app` admin\|client). Un gimnasio necesita ≥2 hosts. Legible por `anon` (los hostnames son hechos públicos de DNS) para la resolución pre-auth del proxy. | tabla `gym_domain` (Fase 3); ADR-0012 §5 |
| **gym_membership** (membresía de gimnasio) | La fila `(user_id, gym_id, role ∈ owner\|operator\|member)` de la que **toda** política RLS resuelve "qué gimnasio + qué rol". Escrita solo dentro de RPCs SECURITY DEFINER, nunca directo. | tabla `gym_membership` (Fase 3); ADR-0009/0013 |
| **reclamar** (claim-by-match) | Al registrarse, un **email verificado** que coincide con un `cliente` pre-existente del gimnasio reclama esa fila (saldo + historial siguen). El teléfono **nunca** reclama (auto-declarado); ambigüedad → fila nueva. Una RPC atómica SECURITY DEFINER hace claim + `gym_membership` en una transacción. | ADR-0009 (enmienda 2026-07-02) |
| **RLS-por-membresía** | El mecanismo de aislamiento: helpers SECURITY DEFINER (`is_member_of`/`is_staff_of`/`has_role`) initplan-cacheados vía `(select …)`, un predicado estándar por clase RLS (§3 del shield), `cobro`/CLABE solo-owner. | ADR-0013; `supabase/migrations/` (Fase 3) |
| **marca** (brand) | La identidad de presentación de un gimnasio-cliente (Forge #1, RED #2). Solo tokens/logo/animación/copy; nunca cambia datos, reglas ni permisos. | `BrandId` — `packages/brand/src/brand-id.ts` |
| **contrato de marca** (brand contract) | La interfaz de **nombres** de variables CSS (`--canvas`, `--yellow`, `--fg`, …) que los primitivos de `@gym/ui` consumen por nombre. La abstracción estable (DIP) que toda marca debe llenar; no se inventa una segunda capa. | `apps/admin/src/app/globals.css` (`@theme inline`) |
| **módulo de marca** (brand module) | La implementación concreta del contrato para una marca: **valores** de tokens + logo + una animación opcional. Es **código** (raro, enumerable); Fase 2 trae dos: forge, red. | `BrandModule` / `brands` — `packages/brand/src/registry.ts` (valores en `packages/brand/src/forge/`, `packages/brand/src/red/`) |
| **host → inquilino → marca** | La cadena de resolución que corre en el `proxy.ts` de **ambos apps**: `resolveTenant(host, override)` (async, en `@gym/data`) busca la fila `gym_domain → gym` y el proxy sella `x-gym` (slug del inquilino) + `x-brand` (= `gym.brand_module_id`). El host elige *presentación*, nunca confianza. Precedencia: fila `gym_domain` › override `?gym=` (slug abierto, validado contra la DB) › **sin inquilino** (marca por defecto; escrituras que requieren inquilino se rechazan). | `packages/data` (Fase 3 — reemplaza `resolve-brand-id.ts` + `host-map.ts`, que se **eliminan**); ADR-0012 §5 |

**A escala:** el *módulo de marca* (código) trae el baseline; la **personalización
por gimnasio** (paleta/logo/copy) es **dato** en la fila `gym` (Fase 3). Miles de
gimnasios comparten un módulo genérico con cero código; unos pocos son a medida.
Onboarding de un gimnasio = fila `gym` + dominio, **nunca** un despliegue
(ADR-0008). El registro host→marca de Fase 2 es un *stub* estático que en Fase 3
se cambia por una búsqueda de la fila `gym` detrás de la misma firma
`resolveBrandId` (ADR-0012).

**Flagged ambiguity:** *inquilino* (el gimnasio = tenant) ≠ *cliente* (un miembro
del gym, glosario arriba). El host resuelve *presentación y UX*, no *autorización*:
`x-gym`/`x-brand` son metadatos influenciables por el atacante (ADR-0008); qué filas
puede leer/escribir una sesión lo decide **solo** la RLS por membresía. El único uso
autoritativo-del-lado-servidor del host es fijar el `gym_id` de un **registro** nuevo
(nunca lo aporta el cliente — ADR-0009), y por eso un host desconocido resuelve *sin
inquilino* en vez de caer a Forge. `@gym/brand` es solo-presentación y no puede
importar `@gym/data` ni `@gym/domain` (frontera dependency-cruiser, ADR-0011 §6).
**Segunda ambigüedad:** *gym_membership* (quién pertenece a qué gimnasio con qué rol)
≠ la futura pantalla **membresía** del mock (la *suscripción/plan* del miembro,
Fase 6) — en código y docs, "membresía" a secas es la suscripción; la fila de
pertenencia se nombra siempre `gym_membership`. En Fase 3 el término del dominio
sigue siendo **cliente**: la tabla `clientes` evoluciona *aditivamente* (gana
`gym_id`, `auth_user_id` NULL permanente, `phone_e164`, timestamps de términos) —
el "`member`" del shield es esta misma fila, sin rename.
