# Forge — Domain Glossary (es-MX)

The ubiquitous language of the gym. Every domain noun maps to a TypeScript
type and a file, so a rename surfaces drift. Distilled from the client brief
(`docs/superpowers/specs/2026-05-27-forge-gym-admin-architecture.md`).

| Término | Significado | Dónde vive en el código |
|---|---|---|
| **cliente** | A gym member. | stored `ClienteFacts` → derived `ClienteDerivado` — `src/lib/data/derive.ts` (per-screen DTOs in `src/lib/data/clientes.ts`) |
| **ficha** | A client's detail/profile screen. | `src/app/(app)/clientes/[id]/` |
| **paquete** | A class package: 8 clases / 12 clases / Ilimitado. | `PaqueteDTO` — `src/lib/data/paquetes.ts`; the contributed `CompraPaquete` — `src/domain/types.ts` |
| **vigencia** | A package's validity window (días, or the calendar month for Ilimitado). | `Vigencia` + `calcVigenciaEnd` — `src/domain/` |
| **asistencia** / **pase de lista** | Recording that a client attended. | `src/app/(app)/asistencia/` |
| **venta** | Selling/renewing a package. | `src/app/(app)/vender/` |
| **recibo** | The sale receipt. | `src/app/(app)/vender/_components/` |
| **estado** | Derived lifecycle: `activo` / `por_vencer` / `sin_clases`. Never stored. | `EstadoCliente` + `derivarEstado` — `src/domain/` |
| **urgencia** / **por renovar** | Derived retention urgency (`critico`/`urgente`/`pronto`/`ok`) from whichever of clases\|días lapses first; drives the directory's "por renovar" list + sort. | `Urgencia` / `NivelUrgencia` + `urgenciaCliente` — `src/domain/` |
| **vigentes** / **resumen del roster** | Count of clientes with estado `activo`; `totalActivos` = those not `sin_clases` (the "/ N" denominator). | `resumirRoster` + `ResumenRoster` — `src/domain/` |
| **clases restantes** | Classes left (a number, or `ilimitado`). | `Clases` (`Saldo.clases`) — `src/domain/types.ts` |
| **stacking** | Buying a package early ADDS its classes + days onto the current one. | `stackPaquete` (+ `baseParaStack`, the still-valid base) — `src/domain/rules.ts` |
| **forfeit** | Remaining classes are lost when the vigencia expires. | `forfeit` — `src/domain/rules.ts` |
| **plantilla** | A WhatsApp message template with `{token}` placeholders. | `renderPlantilla` — `src/domain/rules.ts` |
| **cobro** | Payment/bank details for transfers (titular, banco, CLABE). | `CobroDTO` — `src/lib/data/cobro.ts` |
| **perfil** | The single operator's profile + brand (`negocio` = "FORGE", coach, ciudad). | `PerfilDTO` — `src/lib/data/perfil.ts` |
| **por pagar** / **pendiente** | An optional unpaid sale. | `MetodoPago` `"pendiente"` — `src/domain/types.ts` |
| **respaldo** | The operator's weekly **operational export** of the gym's record — a formatted, multi-sheet Excel (Clientes / Ventas / Asistencias + a Paquetes reference). A curated report the operator keeps, **not** a DB disaster-recovery backup (Supabase PITR owns that); excludes config + secrets (cobro/CLABE, perfil, plantillas). | `docs/adr/0006-respaldo-operational-export.md`; planned: `src/lib/data/respaldo.ts` (gather) + `src/lib/export/` (build, ExcelJS) + `src/app/(app)/cuenta/respaldo/route.ts` (deliver) |

**Flagged tension:** the brief marks phone *optional* (Q4), but WhatsApp retention is the app's reason to exist, so phone is treated as *required* in practice. Email and birthday are optional stored fields (brief Q4). Brand name is **"FORGE"** (Q10) — not "Forge Bootcamp" (a mock string to be removed). **respaldo** is an overloaded word resolved here: it means the operator-facing *operational export* (a curated report), **never** a database disaster-recovery backup — Supabase PITR owns DR, and the file deliberately omits the `cobro` bank details (CLABE) so it is safe to email (ADR-0006).
