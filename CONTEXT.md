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
