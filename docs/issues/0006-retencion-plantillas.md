# Issue 6 — Retención: plantillas table + converge both WhatsApp builders

> **Source:** docs/prds/prd-supabase-migration.md · **Type:** AFK · **Labels:** `ready-for-agent`

## What to build

Stored, editable WhatsApp **plantillas** rendered through one path. Create the
`plantillas` table (recordatorio / renovar / ultima bodies) with RLS. Route both message
surfaces — the **recibo** confirmation (from the ventas slice) and the **ficha**
recordatorio (from the clientes slice) — through the domain `renderPlantilla` with real
tokens (`{nombre}` `{clases}` `{paquete}` `{vence}` `{dias}` `{precios}` `{datos_pago}`),
sourcing the brand from the stored **perfil** and prefixing `+52` via `waLink`. Unknown
tokens stay literal so typos are visible. Reconcile spec §7's token list (which omits
`{paquete}`, though the code already supports it).

## Acceptance criteria

- [ ] `plantillas` table created with RLS keyed to `(select auth.uid())`; advisors clean; seeded with the three template bodies (no `"Forge Bootcamp"`).
- [ ] The recibo confirmation and the ficha recordatorio **both** render via `renderPlantilla` against stored plantilla rows; no inline hand-built message strings remain.
- [ ] Real tokens substitute correctly incl. `{paquete}`; unknown tokens are left literal.
- [ ] `waLink` prefixes `+52` for numbers lacking a country code.
- [ ] Brand token sourced from the stored perfil (`"FORGE"`).
- [ ] spec §7 token list reconciled to include `{paquete}`.
- [ ] `pnpm lint` + `pnpm test` + `pnpm build` green.

## Blocked by

#3 — the recibo confirmation surface.
#5 — the ficha mensaje surface.
