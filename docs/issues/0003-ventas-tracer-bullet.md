# Issue 3 — Ventas tracer bullet (first business slice)

> **Source:** docs/prds/prd-supabase-migration.md · **Type:** AFK · **Labels:** `ready-for-agent`
> **Status:** ✅ Done — branch `feat/supabase-infra-perfil` @ `e26f624` (2026-05-29). Gates green; RLS + folio verified via SQL. Full stacking-sale flow is the operator's in-browser check.

## What to build

The first real business slice: selling/renewing a **paquete** that persists and
**stacks**. Create the `clientes`, `paquetes`, and `ventas` tables with RLS; model the
active **saldo** as a stored running balance on the cliente, mutated transactionally.
`crearVenta` is a thin Server Action that re-auths (`getClaims`), Zod-validates,
computes the stacked saldo via the domain `stackPaquete` + the stacked `vence`, inserts
the **venta** with a DB-generated **folio**, persists the mutated cliente, records the
metodo de pago (incl. `"pendiente"` = **por pagar**), then calls
`updateTag('clientes','max')` for read-your-writes. The **recibo** renders from the real
venta (real folio/fecha/vigencia) and its WhatsApp confirmation goes through
`renderPlantilla`.

Decision shape (from the PRD — the active-saldo materialization):

```
cliente.clases_restantes : int | NULL   -- NULL = Ilimitado
cliente.vence            : date         -- stored running expiry (stacked, path-dependent)
-- sentinel mapping at the DAL boundary (domain never sees magic values):
clases NULL ⇄ "ilimitado"; vigencia_tipo='mes' ⇄ Vigencia "mes" else vigencia_dias ⇄ number
```

## Acceptance criteria

- [ ] `clientes`, `paquetes`, `ventas` tables created via `apply_migration` with RLS keyed to `(select auth.uid())`; `get_advisors` clean.
- [ ] Sentinel mapping applied at the DAL boundary (clases NULL ⇄ ilimitado; vigencia tipo/dias ⇄ Vigencia); the domain core sees only union types.
- [ ] `crearVenta` Server Action: re-auth `getClaims` → Zod validate → `stackPaquete` onto the existing saldo (or create a new cliente) → insert venta with DB folio → persist mutated cliente saldo → `updateTag('clientes','max')`.
- [ ] Buying early **stacks** (classes + days add); Ilimitado stays ilimitado; stacked `vence` is correct.
- [ ] Folio is DB-generated and unique; the receipt shows the real folio/fecha and the `calcVigenciaEnd`-derived vigencia.
- [ ] metodo de pago persisted on the venta incl. `"pendiente"` (por pagar).
- [ ] recibo WhatsApp confirmation rendered via `renderPlantilla`; no `"Forge Bootcamp"` literal remains in the receipt.
- [ ] ADR-0002 addendum recorded: `vence` is a stored running balance (stacking is path-dependent).
- [ ] Integration-verified against a Supabase branch: stack correctness + folio uniqueness; RLS denies cross-account reads.
- [ ] `pnpm lint` + `pnpm test` + `pnpm build` green.

## Blocked by

#2 — needs auth + the operator session for RLS-scoped writes.
