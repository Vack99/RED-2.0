# Forge — Domain Glossary (es-MX)

The ubiquitous language of the gym. Every domain noun maps to a TypeScript
type and a file, so a rename surfaces drift. Distilled from the client brief
(`docs/superpowers/specs/2026-05-27-forge-gym-admin-architecture.md`).

| Término | Significado | Dónde vive en el código |
|---|---|---|
| **cliente** | A gym member. | `Cliente` — `src/lib/data/types.ts` (→ `src/domain/types.ts` at migration) |
| **ficha** | A client's detail/profile screen. | `src/app/(app)/clientes/[id]/` |
| **paquete** | A class package: 8 clases / 12 clases / Ilimitado. | `Paquete` — `src/lib/data/types.ts` |
| **vigencia** | A package's validity window (días, or the calendar month for Ilimitado). | `Vigencia` + `calcVigenciaEnd` — `src/domain/` |
| **asistencia** / **pase de lista** | Recording that a client attended. | `src/app/(app)/asistencia/` |
| **venta** | Selling/renewing a package. | `src/app/(app)/vender/` |
| **recibo** | The sale receipt. | `src/app/(app)/vender/_components/` |
| **estado** | Derived lifecycle: `activo` / `por_vencer` / `sin_clases`. Never stored. | `EstadoCliente` + `derivarEstado` — `src/domain/` |
| **clases restantes** | Classes left (a number, or `ilimitado`). | `Clases` (`Saldo.clases`) — `src/domain/types.ts` |
| **stacking** | Buying a package early ADDS its classes + days onto the current one. | `stackPaquete` — `src/domain/rules.ts` |
| **forfeit** | Remaining classes are lost when the vigencia expires. | `forfeit` — `src/domain/rules.ts` |
| **plantilla** | A WhatsApp message template with `{token}` placeholders. | `renderPlantilla` — `src/domain/rules.ts` |
| **cobro** | Payment/bank details for transfers (titular, banco, CLABE). | `Cobro` — `src/lib/data/types.ts` |
| **por pagar** / **pendiente** | An optional unpaid sale. | `MetodoPago` `"pendiente"` — `src/domain/types.ts` |

**Flagged tension:** the brief marks phone *optional* (Q4), but WhatsApp retention is the app's reason to exist, so phone is treated as *required* in practice. Email and birthday are optional stored fields (brief Q4). Brand name is **"FORGE"** (Q10) — not "Forge Bootcamp" (a mock string to be removed).
