# Venta personalizada — design

**Date:** 2026-07-11
**Branch:** `worktree-venta-personalizada` (worktree at `.claude/worktrees/venta-personalizada`, based on `main` @ `95ed5aa`)
**Status:** approved, ready to implement

---

## 1. The problem

The admin selling flow (`/vender`) can only sell **registered plans** — rows in `public.paquetes`. But gyms routinely sell things that are not, and must never become, catalog items:

- promos ("Promo Verano 2x1")
- personalized packages negotiated with one member
- special plans, one-off deals
- discounts

Registering these as `paquetes` rows is not an option: **every `paquetes` row of a gym is rendered publicly.** The client app's `/precios` page and the marketing pricing teaser read the gym's `paquetes` with no visibility filter (`getPlanesPublicos`, `packages/data/src/server/marketing.ts:93-106`), and anon RLS grants a flat `select … using (true)`. There is no `activo`, `publico`, `visible` or `archivado` column anywhere in the schema. A row exists ⇒ it is showcased.

## 2. The core insight

**A custom sale needs no `paquetes` row at all.**

`public.ventas` already stores a **snapshot** of what was sold — `paquete_nombre`, `clases`, `vigencia_tipo`, `vigencia_dias`, `monto` — and it holds **no `paquete_id`** and no foreign key to `paquetes`. The snapshot exists so a later package edit cannot rewrite history. It means a sale is *already* fully self-describing.

So a custom sale is a `ventas` row whose snapshot columns come from values the admin typed, plus the same `clientes` balance update every sale performs.

This makes the "never appears in marketing" requirement **structural rather than a filter**. The marketing surface reads `paquetes`; a custom sale never writes `paquetes`. There is nothing to hide, because nothing hideable is created. No visibility flag, no `WHERE activo`, no risk of a future query forgetting the filter.

### Why not a hidden `paquetes` row

Rejected. It fights three existing invariants at once:

| Invariant | Where | Conflict |
|---|---|---|
| `nombre` is **derived in-DB** from `clases` (`'Ilimitado'` / `'1 clase'` / `'{n} clases'`) | ADR-0007, `actualizar_paquete` | A custom name like "Promo Verano 2x1" cannot live in `nombre`. |
| `paquetes_nombre_gym_uq unique (gym_id, nombre)` | `20260702231021` | Two promos with the same name collide. |
| `paquetes_clases_ck check (clases between 1 and 30)` | `20260605130000` | A 50-class annual promo is rejected. |

Plus it would require a new visibility column *and* an audit of every reader to ensure the filter is applied — the exact class of bug that ships silently.

## 3. Locked decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Scope | **Blank custom entry only.** One `PERSONALIZADO` tile; the admin types everything. A discount is a custom package the admin names and prices. No price-override-on-a-plan, no copy-from-plan prefill. |
| D2 | Client modes | **Both NUEVO and EXISTENTE.** The Paquete accordion is shared; a custom sale to an existing client is a renewal and stacks by the normal rules. |
| D3 | Ledger flag | **Yes** — add `ventas.personalizado boolean not null default false`. Enables "how much did we give away in promos?" and lets the admin UI badge those rows later. |
| D4 | Form UI | **Inline expansion** inside the Paquete accordion section, below the plan list. |
| D5 | Permission | **Any staff (owner + operator).** Same gate as a normal sale (`staff_gym()`). No new role check. |
| D6 | Bounds | **Generous**, enforced in the RPC: `nombre` 3–40 chars trimmed · `precio` 1–100 000 (integer MXN) · `clases` 1–365 **or** ilimitado · `dias` 1–365. |

## 4. Member-visible consequence (accepted)

`mi_membresia` (`20260706210000_mi_membresia_rpc.sql`) anchors the member's plan card on **the latest `ventas` row** (`fecha, monto, vigencia_tipo, vigencia_dias`), and `clientes.paquete_nombre` holds the active-plan label.

Therefore a member sold "Promo Verano 2x1" will see **"Promo Verano 2x1"** on their plan card in the client app.

This is correct and accepted: the member sees what they actually bought. It is the *ledger* being honest, not the *catalog* leaking — the package still never appears on `/precios` or in the pricing teaser. **The operational consequence is that the name the admin types is member-facing**, and the UI should say so.

## 5. Architecture

### 5.1 Database

**Migration A — schema.**

```sql
alter table public.ventas
  add column personalizado boolean not null default false;
```

Backfill is implicit: every existing row is a plan sale, so `false` is correct.

**Migration B — `registrar_venta` v3.**

Current signature (`20260710121000_registrar_venta_rederive.sql`):

```sql
registrar_venta(
  p_metodo text, p_paquete_id uuid, p_idempotency_key uuid,
  p_cliente_id uuid default null, p_nombre text default null,
  p_tel text default null, p_email text default null,
  p_forzar_nuevo boolean default false
) returns table(folio bigint, cliente_id uuid, clases_restantes integer,
                vence date, paquete_nombre text, monto integer)
```

New signature. `p_paquete_id` becomes nullable, so it must move **after** the last non-defaulted argument (Postgres requires defaulted args last). PostgREST dispatches by name, so callers are unaffected by order.

```sql
registrar_venta(
  p_metodo text,
  p_idempotency_key uuid,
  p_paquete_id uuid default null,
  p_cliente_id uuid default null,
  p_nombre text default null,
  p_tel text default null,
  p_email text default null,
  p_forzar_nuevo boolean default false,
  p_custom_nombre text default null,
  p_custom_precio integer default null,
  p_custom_clases integer default null,
  p_custom_ilimitado boolean default false,
  p_custom_dias integer default null
) returns table(folio bigint, cliente_id uuid, clases_restantes integer,
                vence date, paquete_nombre text, monto integer)
```

**The return shape is unchanged.** The DAL already knows whether it sent a custom payload; returning `personalizado` would be redundant.

**The old 8-arg signature MUST be dropped in the same migration.** Two live overloads make PostgREST dispatch ambiguous (`PGRST203`). This is the same `drop function if exists` pattern `20260710121000` used on its predecessor.

`p_custom_ilimitado` is a **separate boolean discriminator** and not merely `p_custom_clases = null`, because `clases = null` already means *ilimitado* in this schema. Without the discriminator, null-as-"argument not sent" and null-as-"unlimited classes" are the same value.

**Validation, in order:**

1. `staff_gym()` → else raise `'No autorizado'`. (Unchanged.)
2. **XOR:** exactly one of `p_paquete_id` / the custom payload must be present. Both ⇒ raise. Neither ⇒ raise.
3. Registered branch: unchanged — re-read the `paquetes` row, cross-gym ⇒ `'Paquete no encontrado'`.
4. Custom branch: bounds per D6. Each violation raises a distinct, human-readable message.

**Convergence — the load-bearing design rule.** Both branches populate the *same locals* (name, price, class grant, vigencia tipo, vigencia días) and then fall into the **existing, unmodified** derivation. This means the custom path inherits — rather than re-implements — every ruling already proven by the suites:

- **C1** flat-30 for `'mes'` — moot for custom (always `'dias'`), but the code path is shared.
- **C9** the `vence` day is a full training day.
- **C4** stacking: days always carry; purchase wins on class count (ilimitado pack ⇒ ilimitado balance; ilimitado base + finite pack ⇒ the pack's count).
- **C6** idempotent replay via `(gym_id, idempotency_key)`.
- **D2** new-client duplicate guard on `tel` / `lower(email)`, with `p_forzar_nuevo` override.
- **C7** email backfill + the collision raise with atomic rollback.

**Any re-implementation of the stacking math inside the custom branch is a bug.** Fill the locals, then converge.

Custom sales are always `vigencia_tipo = 'dias'`. The `ventas` insert additionally stamps `personalizado`.

### 5.2 Data layer — `packages/data/src/server/ventas.ts`

`crearVentaSchema` gains a **zod discriminated union** on the package:

```ts
paquete:
  | { tipo: "registrado";     paqueteId: string }
  | { tipo: "personalizado";  nombre: string; precio: number;
      clases: number | null; ilimitado: boolean; dias: number }
```

A union, not two optional fields with a `.refine`: it makes "both sent" and "neither sent" **unrepresentable** rather than merely rejected. Zod mirrors the D6 bounds for a fast client-side failure; **the RPC remains the trust boundary** — the bounds are enforced there too, and that is the enforcement that counts.

`crearVenta` builds the RPC args from the union arm.

**The recibo display strings need real work.** Today `crearVenta` composes `VentaResult.paquete = { nombre, vigencia, precio }` by re-reading the `paquetes` row for its display `vigencia` (e.g. `"30 días"`). **For a custom sale there is no row to read** — the DAL must compose the display strings from the typed values (`` `${dias} días` ``). This is the single most likely place for the implementation to break; it is not optional polish.

`database.types.ts` gets regenerated. This also clears a known pre-existing drift: `ventas.idempotency_key` (added by `20260710120000`) is **missing** from the generated types today.

### 5.3 Admin UI — `apps/admin/src/app/(app)/vender/`

The "steps" are **accordion sections, not routes** — one `openSection` string driving `CLIENTE` / `PAQUETE` / `MÉTODO`, with a `useRef` auto-advance gate. There is no step machinery to hook into.

- **`_components/personalizado-editor.tsx` (new).** The inline form: nombre, precio, clases (with an ilimitado toggle), días. `vender.tsx` is already 701 lines; the form does not go in it.
- **`_components/vender-vm.ts` (extend).** The pure, already-tested view-model module is where the new logic lives — `customError()`, `paqueteListo()`, `precioMostrado()`. `vender.tsx` should gain wiring, not a brain.
- **`_components/vender.tsx` (extend).** `sel` widens to carry the custom sentinel; new `custom` form state; the auto-advance gate holds on the custom tile until the form validates, then advances to `MÉTODO`.
- **Footer.** The `CountUp` price and the `COBRAR $X` label read one derived price (`precioMostrado`) for both branches. Today the `CountUp` deliberately has **no `key`**, so it tweens price→price instead of flashing $0 — preserve that.
- **`Hasta · 25 ago` hint.** For registered plans this is precomputed **server-side** in the gym's timezone (`PaqueteDTO.hasta`). A custom package's expiry is not knowable until the admin types `dias`, so the server page must pass the gym's *today* (`hoyGym`, ISO date in gym TZ) and the client derives the hint with a pure helper. Do **not** reach for `new Date()` in the browser — that is the user's timezone, not the gym's.
- The tile must communicate that the typed name is **member-facing** (§4).

### 5.4 Tests

**Denial suite — `supabase/tests/registrar_venta_personalizado.sql` (new).** Per the #78/#80 rule, it asserts the **written rows**, not the return value:

| Vector | Asserts |
|---|---|
| V1 | Fresh custom sale, new client → `ventas`: nombre/precio/clases/`vigencia_tipo='dias'`/`vigencia_dias`/`personalizado=true`; `clientes`: `clases_restantes`, `vence`, `paquete_nombre`. |
| V2 | Custom **ilimitado** → `ventas.clases is null`, `clientes.clases_restantes is null`. |
| V3 | Custom **renewal** on an existing client → C4 stacking holds (days carry, purchase wins). |
| V4 | **XOR:** both `p_paquete_id` and custom ⇒ raise. Neither ⇒ raise. |
| V5 | **Every bound** (D6): precio 0 / 100 001; clases 0 / 366; dias 0 / 366; nombre 2 chars ⇒ raise. |
| V6 | Idempotent replay of a custom sale ⇒ one `ventas` row, same folio. |
| V7 | **Regression:** a normal registered-plan sale still writes `personalizado = false`. |
| V8 | Non-staff / cross-gym ⇒ `'No autorizado'`. |

Registered in `run-denial-suite.mjs`'s `SUITES` (else `denial-suite-drift.test.ts` fails) **and** in `supabase/tests/rpc-coverage.json` under `registrar_venta` (else `rpc-write-coverage.test.ts` fails).

*In-scope hygiene:* `rpc-coverage.json` currently omits `registrar_venta_stacking.sql` from `registrar_venta`'s suite list even though it is the primary contract suite and is registered in the runner. Add it while we are in the file.

**Vitest:** extend `vender-vm.test.ts` (customError / paqueteListo / precioMostrado) and the `packages/data` schema tests for the discriminated union.

**Gate:** this is a migration-bearing change, so `pnpm test:denial` must run **green against a scratch Supabase project** before the branch fast-forwards to `main`:

```
SUPABASE_TARGET_REF=<scratch-ref> SUPABASE_ACCESS_TOKEN=<pat> pnpm test:denial
```

The runner refuses the live ref. **The Supabase MCP in this repo is bound to LIVE** (`hjppxawglmukfvsgmcog`) — do not `apply_migration` from the implementation session.

## 6. Risks

| Risk | Mitigation |
|---|---|
| **PostgREST overload ambiguity** (`PGRST203`) if both `registrar_venta` signatures exist. | `drop function if exists` the 8-arg signature in the same migration. |
| **Stacking re-implemented** in the custom branch, silently diverging from C4/C9. | Converge on shared locals before the derivation. V3 asserts it. |
| **Recibo strings** — the DAL re-reads `paquetes` for the display `vigencia`; no row exists for custom. | Explicitly composed from typed values. Called out in §5.2. |
| **Timezone** — deriving the `Hasta` hint from the browser clock. | Server passes `hoyGym`; a pure helper does the math. |
| Applying migrations to **live** via the MCP. | Scratch project only. Stated in §5.4. |

## 7. Out of scope (YAGNI)

Explicitly **not** in this change:

- Price-override on a registered plan (D1).
- "Copy from a plan" prefill (D1).
- Saving/reusing a custom package ("recientes") — every custom sale is one-off.
- Owner-only gating (D5).
- A promo-reporting screen. The `personalizado` column (D3) makes it *possible* later; nothing reads it in this change beyond the tests.
- Any change to the marketing / client-app catalog surfaces. They are untouched **by construction** (§2).

## 8. File map (for the implementation session)

**Read first:** `AGENTS.md` (the `test:denial` contract), `ARCHITECTURE.md` (the enforced package boundary).

| Concern | Path |
|---|---|
| RPC (current) | `supabase/migrations/20260710121000_registrar_venta_rederive.sql` |
| `paquetes` / `ventas` DDL | `supabase/migrations/20260530023224_create_ventas_core.sql` |
| `ventas` idempotency + metodo CHECK | `supabase/migrations/20260710120000_renewal_schema_prep.sql` |
| Member plan card (reads latest venta) | `supabase/migrations/20260706210000_mi_membresia_rpc.sql` |
| Sale DAL — sole `registrar_venta` caller | `packages/data/src/server/ventas.ts` (`crearVenta` @ 143, RPC @ 190) |
| Sale-path package read | `packages/data/src/server/paquetes.ts` (`getPaquetes` @ 34, `PaqueteDTO` @ 14) |
| Public catalog (must stay untouched) | `packages/data/src/server/marketing.ts` (`getPlanesPublicos` @ 93) |
| Vender server page | `apps/admin/src/app/(app)/vender/page.tsx` |
| Vender screen (701 lines) | `apps/admin/src/app/(app)/vender/_components/vender.tsx` (`PaqueteEditor` @ 642) |
| Pure view-model + its test | `apps/admin/src/app/(app)/vender/_components/vender-vm.ts` |
| Ticket | `apps/admin/src/app/(app)/vender/_components/recibo.tsx` (`CONCEPTO` @ 105) |
| Server action | `apps/admin/src/app/(app)/vender/actions.ts` |
| Denial-suite runner | `supabase/tests/run-denial-suite.mjs` |
| Write-coverage map | `supabase/tests/rpc-coverage.json` |
| Reference suite to imitate | `supabase/tests/registrar_venta_stacking.sql` |
