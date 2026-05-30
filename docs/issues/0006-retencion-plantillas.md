# Issue 6 — Retención: plantillas table + converge both WhatsApp builders

> **Source:** docs/prds/prd-supabase-migration.md · **Type:** AFK · **Labels:** `ready-for-agent`
>
> **Status:** ✅ Done @4ada644 — gates green; both fresh-eyes gates YES (Elegance + Senior Dev).
> Note: 4 plantilla claves were seeded (`recibo` + the three retention templates
> `recordatorio`/`renovar`/`ultima`) — the `recibo` row is required so the recibo
> confirmation also renders from a stored plantilla, not an inline body.

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

- [x] `plantillas` table created with RLS keyed to `(select auth.uid())`; advisors clean; seeded with the template bodies (no `"Forge Bootcamp"`).
- [x] The recibo confirmation and the ficha recordatorio **both** render via `renderPlantilla` against stored plantilla rows; no inline hand-built message strings remain.
- [x] Real tokens substitute correctly incl. `{paquete}`; unknown tokens are left literal.
- [x] `waLink` prefixes `+52` for numbers lacking a country code (unchanged; already correct).
- [x] Brand token sourced from the stored perfil (`"FORGE"`), via the new `{negocio}` token.
- [x] spec §7 token list reconciled to include `{paquete}` (and `{negocio}`).
- [x] `pnpm lint` + `pnpm test` (37/37) + `pnpm build` green.

## Blocked by

#3 — the recibo confirmation surface.
#5 — the ficha mensaje surface.
