# Auditoría de branding — estructura nueva iBookit vs Forge/RED

2026-08-16 · fable session, 1 opus + 2 sonnet audit agents, live-DB verified.
Supersedes nothing; corroborates and extends `ANALISIS-ESTRUCTURA.md` (its 3-conditional
count and Option-A recommendation held up under independent re-audit).

## 1. Verdict on "the gyms aren't reading the brand structure at all"

**PARTIAL — wrong for the skin, right for the personalization half.**

LIVE (verified end-to-end, both apps, live DB): `gym_domain.hostname` → `gym_id_por_host`
→ `gym.brand_module_id` → `x-brand` header (`packages/data/src/server/resolve-tenant.ts:216-226`)
→ `resolveBrand()` (`apps/*/src/lib/brand.ts:15-18`) → `brandCss()` → SSR `<style>` in
`apps/*/src/app/layout.tsx`. Neither app ships a `:root` in globals.css — the injected block
is the **sole** token definer. Forge and RED paint from `packages/brand` on every request.
14 `gym_domain` rows, all 4 gyms mapped correctly.

DEAD or half-dead:

| # | What | Evidence |
|---|------|----------|
| 1 | `gym.token_overrides` entire data path — the "a escala" mechanism ADR-0012 sells. Apps never read the column; `apps/*/src/lib/token-overrides.ts:24-25` returns a hardcoded purple fixture keyed on `brandId === "base"` | column `{}` for all 4 gyms; `brand-css.ts:20` empty fast path always taken |
| 2 | `./forge/logo` subpath export — zero importers; `packages/brand/src/index.ts:4-5` comment is stale/false | `packages/brand/package.json:8` |
| 3 | `BrandModule.appIcon` — admin only. **apps/client has no `icon.tsx`, no favicon at all** — forge/red member sites serve unbranded tabs | `apps/admin/src/app/icon.tsx:12` |
| 4 | `BrandModule.defaultScheme` — client only; admin hardcodes `defaultTheme="light"` (`providers.tsx:27`) | `registry.ts:128-131` self-admits |
| 5 | Client root metadata hardcoded `title: "Gym"` — member tab never says FORGE/RED. The most defensible piece of the intuition | `apps/client/src/app/layout.tsx:12-15` |
| 6 | `p_app` never passed to `gym_id_por_host` — `gym_domain.app` column decorative in resolution (contained: presentation-only + `auditTenantInEffect` re-reconciles) | `resolve-tenant.ts:124` |
| 7 | `gym.brand_module_id` is bare `text` — no FK/check. A typo silently repaints an entire gym to `base` + purple, no error anywhere | live schema |

Brand is strictly SKIN. Exactly **3** brand conditionals above `packages/` repo-wide, all
cosmetic (`ticket-twin.ts:44` email hexes + 2 fixture checks). Nav is one static literal
`TABS` array (`apps/admin/src/app/(app)/layout.tsx:14-22`); `AppLayout` never reads brand.
RED's "structural-looking" identity = ~20 `.dark[data-brand="red"]` CSS selectors in the
**client** app (`globals.css:257-486` + `red/neon.css`). No brand-conditional routes,
layouts, or feature gates exist.

## 2. How bad is the new structure for Forge/RED?

**Skin axis: zero risk.** Token/logo/copy work is orthogonal to structure; a reorg of
`(app)/` touches neither `packages/brand` nor the client app (5 kit imports, all skeleton).

**Structure axis: one shared layout → the reorg ships to Forge and RED staff unavoidably.**
There is no per-brand structure to protect — that's the shield, not the hazard. The deltas:

- Additive (safe): `/clientes/[id]/historial`, `/clientes/[id]/mensaje`, `/clientes/nuevo`.
- Rename-shaped (safe): dock order, ASIST→PASE, raised slot dropped, sliding pill.
- Already-shipped, mock just repaints them: `/inicio` bucket strip, `/asistencia`
  CON RESERVA/TODOS split (`inicio.tsx:312/430`, `asistencia.tsx:594/599`).
- **The actual hazard: the prototype is a happy-path comp, not a spec.** Implemented
  literally it REGRESSES shipped capability: `/vender` has no counterpart (its EXISTENTE
  tab in the mock is functionally inert — no client picker renders); ficha drops
  primera-compra swap, attendance undo, invitation resend; `/cuenta` drops Identidad
  legal + the ASIST metric (the one live operator, Forge, is 8:1 pasa-lista:ventas).
  Plus stale `ibookit.mx` string (line 309; locked domain is `ibooki.lat`).

So: harm to current users comes only from treating the mock as a spec. Paint + additive
routes + renames are safe to ship to everyone.

## 3. Shield plan (ranked, lazy-first)

1. **Ruling: comp-not-spec.** Every screen keeps its shipped capability inventory; the
   mock supplies paint, spacing, dock, and the 3 new routes. `/vender` → rename to
   `/clientes/nuevo` keeping ALL capabilities (dup guards, PERSONALIZADO, backdate,
   idempotency, 3-rail recibo, existing-client search). Concurs with ANALISIS ruling.
2. **iBookit = repurpose `base`, not a 4th module** (overrides ANALISIS D1). `base` is
   already `DEFAULT_BRAND` and already the unmapped-host chrome; "no branding → iBookit"
   is literally what `base` does today. Zero new keyspace, no union/census/tripwire churn.
   Nobody needs a neutral brand once the platform default IS the platform brand. Changes:
   `base/tokens.ts` → plum palette, `base/logo.tsx` → El lugar mark + "iBookit" wordmark,
   `registry.ts:104-114` copy. Keep the id `base` (rename = churn, later if ever).
3. **Delete the purple fixture + wire the real `token_overrides` read**
   (`apps/*/src/lib/token-overrides.ts` — the documented one-line swap that never
   happened). The fixture would repaint iBookit purple otherwise. This supersedes the
   #35 "leave fixture in prod" ruling — the product changed.
4. **Constrain `gym.brand_module_id`** — CHECK or FK to the module set. At 3000 users a
   typo = silent whole-gym rebrand. Migration ⇒ scratch `test:denial` run per convention.
5. **Client app brand hygiene** (cheap, ships anytime): `generateMetadata` from
   `resolveBrand().copy` (mirror admin `layout.tsx:20-23`), add `apps/client/src/app/icon.tsx`.
6. **Capability-derived TABS** — the real divergence axis is capability per gym (Forge =
   open-access/no schedule, RED = scheduled classes; today one static array serves both,
   inverted-fit). When the dock reorg lands, derive items from tenant data in the same
   `AppLayout` seam instead of hardcoding the new dock. No brand slot, no `homeVariant`.
7. Housekeeping in the same wave: drop `./forge/logo` export + stale comment; pass `p_app`
   in `resolve-tenant.ts:124`; `gym_domain` rows for `ibooki.lat` apex.

## 4. Elegance at 3000 users

The scale mechanism already exists and is the dead one: **brand modules for designed
flagship brands (forge, red), `token_overrides` JSONB over the iBookit base for the long
tail.** No code module per gym, no deploy per rebrand. Wiring item 3 + constraining item 4
IS the 3000-user answer. Typeface stays app-level (Hanken Grotesk swap at
`apps/*/src/app/layout.tsx:12-16`) — not token-expressible today, and per ANALISIS D2
shouldn't be.

## 5. Open / owner-veto points

- D1 overridden here (repurpose `base`) — veto restores the 4th-module plan, all other
  items unchanged.
- Dock reorg + reskin ships to Forge/RED staff by design (one structure, Option A). If a
  tenant must be visually frozen, that's a new requirement nobody has asked for — YAGNI.
- Admin dark scheme: not free (admin never reads `defaultScheme`). Prototype is
  light-only; build dark when a screen needs it (HANDOFF Q6), not before.
- `@gym/ui/forge/*` rename: defer, one dedicated commit (ANALISIS D4 stands).
