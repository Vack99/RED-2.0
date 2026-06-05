## Superseded — v2 (2026-06-05): clases is now editable; nombre is derived

> **This PRD describes v1 and is partly STALE. The shipped editor is v2.** The durable decision
> record is **[ADR-0007 — Operator-editable clases: future-only grant, derived nombre, single
> favorite](../adr/0007-editable-clases-derived-nombre-single-favorite.md)**, which **consciously
> reverses** this PRD's load-bearing exclusion of `clases`. Read v2 first; the v1 body below is kept
> for history with each now-false part annotated inline (look for **[SUPERSEDED v2 / ADR-0007]**).
>
> **What changed in v2:**
> - **`clases` is now editable** via a **1–30 / Ilimitado** picker (`null` = ilimitado). The grant
>   change applies to **FUTURE sales only**; past sales are snapshotted onto the immutable `ventas`
>   row (ADR-0004) and never retro-altered. This is the intended operator capability — v1's "clases
>   out" exclusion is reversed.
> - **`nombre` is DERIVED from `clases` in-DB** (`null → "Ilimitado"`, `1 → "1 clase"`,
>   `n → "{n} clases"`), mirroring `nombrePaquete` in `src/domain/rules.ts`. The **free-text NOMBRE
>   field is removed** — label and grant cannot drift. The edit payload is `{ id, clases, precio,
>   popular }` (no `nombre`).
> - **Single favorite: at most one (≤ 1) `popular` package per operator**, enforced by a partial
>   unique index `paquetes_one_popular`; the RPC **demotes siblings before promoting**. Zero
>   favorites is allowed.
> - **The duplicate message is grant-based:** **"Ya tienes un paquete con esa cantidad de clases"**
>   (was the name-based "Ya tienes un paquete con ese nombre"). Two packages that derive to the same
>   class count collide on `paquetes_nombre_uq`; the single-favorite index is a separate 23505,
>   disambiguated by constraint name.

---

> **Tracked locally** — no issue tracker / git remote exists (local-only repo, by decision 2026-05-29). This markdown is the source of record; `/to-issues` and `/to-goal` consume it directly. Intended triage: **ready-for-agent**. If a GitHub/Linear tracker is provisioned later, replace this line with `> Tracked in: <issue-url>`.

# PRD — Editor de paquetes: make the package catalog editable in-app

Let the operator edit their own **paquetes y precios** without leaving **cuenta**.
Today that card shows a real, read-only catalog; its **EDITAR** control and every
**paquete** row only fire a `proximamente("Editor de paquetes")` toast
([`cuenta.tsx:213,228`](../../src/app/(app)/cuenta/_components/cuenta.tsx)). This
feature replaces those stubs with a working editor for **precio**, **nombre**, and
the **popular** flag — and nothing else. It mirrors the already-shipped **plantillas**
CRUD vertical end to end (DB RPC → DAL → Server Action → bottom-sheet UI), so the
write path is the proven one: atomic Postgres RPC (ADR-0005), RLS owner-scoping
(ADR-0001), no new architecture. The load-bearing exclusion — **vigencia** and
**clases** stay out of the form — is the whole point, and §Risks explains why.

> **[SUPERSEDED v2 / ADR-0007]** The "clases stays out" exclusion is **reversed** in v2:
> `clases` is editable and applies to future sales only; `nombre` is no longer a free-text
> field but is **derived from `clases`**. **vigencia** does remain excluded (the 30-day
> invariant). See [ADR-0007](../adr/0007-editable-clases-derived-nombre-single-favorite.md).

## Problem Statement

The operator runs three real **paquetes** (e.g. *8 clases*, *Ilimitado*, *Mensual*)
whose **nombre**, **precio**, and **popular** badge are surfaced everywhere they sell
and renew. Those values are now real data read from the `paquetes` table — but they
are frozen. To raise a price, fix a typo in a package name, or move the gold star to
a different package, the operator has no path: the **EDITAR** button and each row
just say "próximamente". The catalog is honest about being read-only, but the
operator cannot actually maintain it. Everything else in **cuenta** that became real
this far (resumen del mes, respaldo, plantillas) is now writable; the package catalog
is the last honest-but-inert card on the screen.

## Solution

From the operator's perspective: tapping **EDITAR** on the **Paquetes y precios**
card — or tapping any package row — opens a bottom sheet listing their three
**paquetes** (**nombre**, **precio** in pesos, a gold **star** when **popular**).
Tapping one opens a small form: change the **nombre**, change the **precio** (integer
pesos, es-MX), and toggle **popular** on or off. **Guardar** saves, shows a success
toast, refreshes the screen, and returns to the list. There is no "add package" and
no "delete" — the operator edits the three they have. **Vigencia** (the 30-day
window) and **clases** (how many classes the package grants) are deliberately *not*
in the form: they are sale-math inputs, and editing them would silently change what
future buyers receive (§Risks).

Under the hood this is the **plantillas** write vertical, copied exactly: a new
`actualizar_paquete` SECURITY INVOKER RPC (the only place the write happens, ADR-0005),
a thin injectable DAL function `actualizarPaquete` in `src/lib/data/paquetes.ts`, a
thin `actualizarPaqueteAction` Server Action, and a `paquetes-sheet.tsx` +
`paquete-editor.tsx` pair reusing the proven `Sheet` + view-state-machine +
`forgeToast` + `router.refresh()` pattern. The read side does not change at all — the
editor is fed from the `getPaquetes()` the **cuenta** page already fetches.

## User Stories

1. As the operator, I want to open a package editor from the **Paquetes y precios** card (its **EDITAR** button or any row), so that maintaining my catalog is one tap from where I already see it.
2. As the operator, I want a bottom sheet listing my three **paquetes** with name, price, and the **popular** star, so that I can pick the one to edit at a glance.
3. ~~As the operator, I want to change a package's **nombre** (1–40 characters), so that I can fix wording without a developer.~~ **[SUPERSEDED v2 / ADR-0007]** There is no editable `nombre`; the operator changes the package's **clases** (1–30 / Ilimitado) and the display name is derived from it.
4. As the operator, I want to change a package's **precio** to a whole-peso amount, so that a price change takes effect immediately for new sales.
5. As the operator, I want to toggle which package is **popular** (the gold star), so that I can steer attention to the package I'm promoting.
6. As the operator, I want **Guardar** disabled until I've actually changed something valid, so that I don't fire a pointless write or save an empty name.
7. As the operator, I want a success toast and the card to reflect my edit immediately (read-your-writes), so that I trust the change landed.
8. ~~As the operator, I want a clear error if I try to give two packages the same name, so that I understand why the save was rejected.~~ **[SUPERSEDED v2 / ADR-0007]** The collision is now on the **class count** (two packages deriving to the same name): the error is **"Ya tienes un paquete con esa cantidad de clases"**.
9. As the operator, I want each edited package to keep its **30-day vigencia** automatically, so that the catalog stays consistent with how the gym actually sells.
10. ~~As the operator, I do NOT want to accidentally change how many **clases** a package grants or its **vigencia** while editing a price, so that past and future sales math stays correct.~~ **[SUPERSEDED v2 / ADR-0007]** Changing **clases** is now a deliberate capability that applies to **future** sales only; **past** sales stay correct because they are snapshotted onto the immutable `ventas` row (ADR-0004). `vigencia` is still not user-editable.
11. As the maintainer, I want the write to flow through one atomic RPC behind RLS (ADR-0005/0001), so that a package edit can never partially apply or touch another operator's catalog.
12. As the maintainer, I want the DAL write unit-tested via the injected fake Supabase client, so that the validation and error mapping are covered without a live database.

## Locked Decisions

These are approved and **not open for re-litigation**; the build implements them as written.

1. **Scope = edit existing only.** No add-new, no delete in v1. Both are deferred (§Out of Scope). The sheet shows **no** "Agregar paquete" button and **no** trash/delete chrome.
2. ~~**Editable fields = `precio`, `nombre`, `popular` only.** `vigencia` and `clases` are **not** in the form and the RPC never reads them from the client.~~ **[SUPERSEDED v2 / ADR-0007]** Editable fields are now **`clases`, `precio`, `popular`**. `clases` IS in the form (1–30 / Ilimitado picker) and IS an RPC param; `nombre` is **removed** as an input and **derived from `clases`** in-DB. `vigencia` is still excluded (hard-normalized to the 30-day invariant by the RPC).
3. **Vigencia policy = 30 days, an in-DB invariant.** "30 days is the default vigencia for every package." The update RPC hard-normalizes **every edited row** to `vigencia_tipo = 'dias'`, `vigencia_dias = 30`. All three live rows already are; writing it on every edit makes the policy an enforced invariant, not a convention.
4. **UI pattern = the plantillas bottom-sheet pattern.** `Sheet` + a `{ mode: "list" } | { mode: "edit"; paquete }` view state-machine + `forgeToast` + `router.refresh()` + `forge-pressable` rows. **Not** inline-edit, **not** a sub-route.

## User-Facing UX

**Entry points (`cuenta.tsx`).** The two existing `proximamente("Editor de paquetes")`
calls become `setPaquetesOpen(true)`: the card's **EDITAR** button
([`cuenta.tsx:213`](../../src/app/(app)/cuenta/_components/cuenta.tsx)) and the
per-row `onClick` ([`cuenta.tsx:228`](../../src/app/(app)/cuenta/_components/cuenta.tsx)).
A new `paquetesOpen` state and a `<PaquetesSheet>` render mount alongside the existing
`<PlantillasSheet>`. No other change to the screen.

**List view (`paquetes-sheet.tsx`).** A `Sheet` with an **Eyebrow** + **H1** header
("PAQUETES Y PRECIOS" / "PRECIOS GUARDADOS" or similar), then the operator's packages
rendered from the passed-in `paquetes: PaqueteDTO[]` as `forge-pressable` rows:
**nombre** (uppercase), **precio** via `pesos(...)`, and a gold **star** icon when
`popular`. There is **no** add button and **no** delete affordance — list and edit
only. Tapping a row sets `view = { mode: "edit", paquete }`.

**Edit form (`paquete-editor.tsx`)** — a controlled form whose header mirrors
`plantilla-editor.tsx`: a back button, **Eyebrow** "EDITAR PAQUETE", **H1** = the
current **nombre**. Fields:

- **NOMBRE** → `<Input>`; `.trim()`, 1–40 characters.
- **PRECIO** → `<Input>` with a peso affordance; the entered text is parsed to a **positive integer** (the column is `int`; pesos are whole integers in es-MX — no decimals/centavos in v1).
- **POPULAR** → a single `forge-pressable` toggle row with the gold **star** icon, flipping a boolean.

**Save gating.** **Guardar** is enabled only when `valido && dirty && !saving`:

- `valido` = `nombre.trim()` is 1–40 chars **and** `precio` is a positive integer.
- `dirty` = `nombre`, `precio`, or `popular` differs from the loaded `PaqueteDTO`.
- `saving` = a write is in flight (button shows "GUARDANDO…").

**On save.** Call `actualizarPaqueteAction({ id, nombre, precio, popular })` → on
success `forgeToast({ tone: "success", ... })`, `router.refresh()` (re-reads
`getPaquetes()` so the card and the list reflect the edit), and `setView({ mode:
"list" })`. On failure, a warning toast and the form stays open with its values intact.

## Data-Layer / RPC Design

> **[SUPERSEDED v2 / ADR-0007]** — the SQL + DAL shown below are the **v1** design (4-arg
> `actualizar_paquete(p_id, p_nombre, p_precio, p_popular)`, free-text `nombre`). The **shipped v2**
> RPC is `actualizar_paquete(p_id, p_precio, p_popular, p_clases int default null)`: it takes
> `clases` (not `nombre`), **derives** `nombre` from `clases` in-DB (mirrors `nombrePaquete`),
> demotes other favorites before promoting, and maps the duplicate-tier `paquetes_nombre_uq` 23505 to
> "Ya tienes un paquete con esa cantidad de clases". See
> `supabase/migrations/20260605130000_paquete_clases_and_single_favorite.sql`,
> `supabase/tests/actualizar_paquete_rules.sql`, and ADR-0007. The v1 code below is kept for history.

The write vertical mirrors **plantillas** exactly. The display `PaqueteDTO` is **not
widened**; the editor reuses its existing `id` / `nombre` / `precio` / `popular`
fields, fed from the `getPaquetes()` the page already fetches. **No new read function,
no page-level data change** beyond mounting the sheet.

**DB / RPC — `supabase/migrations/<ts>_paquetes_rpcs.sql`** (new). One function:

```sql
create or replace function public.actualizar_paquete(
  p_id uuid, p_nombre text, p_precio int, p_popular boolean
)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  update public.paquetes
     set nombre = p_nombre,
         precio = p_precio,
         popular = p_popular,
         vigencia_tipo = 'dias',   -- 30-day policy as an in-DB invariant
         vigencia_dias = 30
   where id = p_id;                -- RLS scopes the row to the owner
  if not found then raise exception 'Paquete no encontrado'; end if;
end;
$function$;

revoke execute on function public.actualizar_paquete(uuid, text, int, boolean) from public;
grant  execute on function public.actualizar_paquete(uuid, text, int, boolean) to authenticated;
```

Conventions copied from `20260602130100_plantillas_rpcs.sql`: **SECURITY INVOKER**
(the default — so RLS applies as the calling operator), `set search_path to ''`
(injection-safe; clears the `function_search_path_mutable` advisor), the
`auth.uid()`-null guard raising `'No autenticado'`, the `if not found` guard raising
`'Paquete no encontrado'`, and the least-privilege `revoke`-from-`public` /
`grant`-to-`authenticated` pair. The hard-coded `vigencia_tipo = 'dias'` +
`vigencia_dias = 30` write satisfies the `paquetes_vigencia_ck` CHECK (see §Constraints).

**DAL — `src/lib/data/paquetes.ts`** gains (alongside the unchanged `getPaquetes`):

```ts
export const actualizarPaqueteSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().trim().min(1).max(40),
  precio: z.number().int().positive(),
  popular: z.boolean(),
});

export async function actualizarPaquete(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = actualizarPaqueteSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { error } = await supabase.rpc("actualizar_paquete", {
    p_id: input.id, p_nombre: input.nombre, p_precio: input.precio, p_popular: input.popular,
  });
  if (error) {
    // paquetes_nombre_uq (user_id, nombre) → a friendly es-MX duplicate message; anything else is generic.
    if (/paquetes_nombre_uq/.test(error.message ?? "")) {
      throw new Error("Ya tienes un paquete con ese nombre");
    }
    throw new Error("No se pudo actualizar el paquete");
  }
}
```

This mirrors `actualizarPlantilla` (parse → injectable client → `requireOperator` →
`supabase.rpc(...)` → throw an es-MX message on error), adding the unique-violation
branch the plantillas writer didn't need.

**Server Action — `src/app/(app)/cuenta/actions.ts`** gains a thin wrapper, identical
in shape to `actualizarPlantillaAction`:

```ts
export async function actualizarPaqueteAction(raw: unknown): Promise<void> {
  return actualizarPaquete(raw);
}
```

(`(app)` reads are dynamic/cookie-bound, so the client `router.refresh()`es after a
successful write — no cache-tag invalidation, matching `actualizarPlantillaAction`.)

**Wiring — `cuenta.tsx`.** Add `const [paquetesOpen, setPaquetesOpen] = React.useState(false)`,
render `<PaquetesSheet open={paquetesOpen} onClose={...} paquetes={paquetes} />`, and
point both `proximamente("Editor de paquetes")` call sites at `setPaquetesOpen(true)`.

## Validation Rules

> **[SUPERSEDED v2 / ADR-0007]** The `nombre` row, the name-based uniqueness row, and the
> name-based duplicate message below are **stale**. The v2 table is:
>
> | Field | Rule | Where enforced |
> | --- | --- | --- |
> | `clases` | integer 1–30, **or `null`** (Ilimitado) | client picker gate **and** `actualizarPaqueteSchema` (`z.number().int().min(1).max(30).nullable()`) **and** DB `paquetes_clases_ck` |
> | `precio` | positive **integer** pesos (no decimals) | client parse + gate **and** `z.number().int().positive()` |
> | `popular` | boolean; **at most one popular** per operator | Zod `z.boolean()`; the ≤ 1 invariant is DB `paquetes_one_popular` (partial unique index), kept satisfiable by the RPC demoting siblings before promoting |
> | `id` | valid uuid | Zod `z.string().uuid()` |
> | `nombre` | **derived from `clases`** in-DB — NOT a user input | RPC stores `nombrePaquete(clases)` (`src/domain/rules.ts` is the spec) |
> | duplicate grant | `(user_id, nombre)` unique → two packages can't derive to the same class count | DB `paquetes_nombre_uq`; surfaced as **"Ya tienes un paquete con esa cantidad de clases"** |
> | vigencia | always `'dias'` / `30` | hard-written by the RPC (not user input) |

| Field | Rule | Where enforced |
| --- | --- | --- |
| ~~`nombre`~~ | ~~`.trim()`, non-empty, ≤ 40 chars~~ — **removed in v2 (derived)** | ~~client `valido` gate **and** `actualizarPaqueteSchema` (Zod)~~ |
| `precio` | positive **integer** pesos (no decimals) | client parse + `valido` gate **and** `z.number().int().positive()` |
| `popular` | boolean | Zod `z.boolean()` |
| `id` | valid uuid | Zod `z.string().uuid()` |
| ~~uniqueness~~ | ~~`(user_id, nombre)` unique~~ | ~~DB `paquetes_nombre_uq`; surfaced as "Ya tienes un paquete con ese nombre"~~ — **v2: surfaced as "Ya tienes un paquete con esa cantidad de clases"** |
| vigencia | always `'dias'` / `30` | hard-written by the RPC (not user input) |

The Zod schema is the trust boundary: even if the client gate is bypassed, an
~~empty name~~ **out-of-range `clases`** (v2), a non-integer/zero/negative price, or a
malformed id is rejected before the RPC is touched.

## Affected / Created Files

**Database**
- `supabase/migrations/<ts>_paquetes_rpcs.sql` — **new**: `actualizar_paquete` RPC + revoke/grant. Apply via Supabase MCP `apply_migration`; run `get_advisors` (security) after.

**DAL (`src/lib/data`)**
- `src/lib/data/paquetes.ts` — **edit**: add `actualizarPaqueteSchema` + `actualizarPaquete(raw, client?)`. `getPaquetes` and `PaqueteDTO` unchanged.
- `src/lib/data/paquetes.test.ts` — **new**: DAL unit tests via the injected fake + Zod-bounds tests.

**Server Action (`src/app/(app)/cuenta`)**
- `src/app/(app)/cuenta/actions.ts` — **edit**: add thin `actualizarPaqueteAction(raw)`.

**UI (`src/app/(app)/cuenta/_components`)**
- `paquetes-sheet.tsx` — **new**: list + view state-machine (list/edit only).
- `paquete-editor.tsx` — **new**: the controlled edit form.
- `cuenta.tsx` — **edit**: `paquetesOpen` state, mount `<PaquetesSheet>`, repoint the two `proximamente` calls.

No change to `getPaquetes`, the `paquetes` schema (beyond the RPC), the **ventas**
sale path, or any other sector.

## Risks & Mitigations

- **Sale-math coupling — the central rationale for the field exclusion.** `crearVenta`
  re-reads `clases`, `vigencia_tipo`, and `vigencia_dias` **live from the `paquetes`
  row at sale time** ([`ventas.ts:96–119`](../../src/lib/data/ventas.ts)) to compute
  the grant, then **snapshots** the result into the `ventas` ledger. Editing **clases**
  or **vigencia** would therefore silently change what **future** buyers receive — a
  price/name edit must never have that side effect. *Past* sales are snapshotted and
  are **never** retro-updated, so editing **precio**/**nombre**/**popular** is safe:
  it touches presentation and new-sale price only. **Mitigation:** `clases` and
  `vigencia` are excluded from the form *and* from the RPC's parameter list; the RPC
  hard-writes the 30-day vigencia so an edit can't drift it either. This is *why* v1's
  field set is what it is.
- **DTO contract.** The editor must not depend on a widened DTO. **Mitigation:** it
  consumes the existing `PaqueteDTO` (`id`/`nombre`/`precio`/`popular`) only;
  `PaqueteDTO`, `getPaquetes`, and the page's data fetch are untouched, so nothing
  downstream of the catalog read can break.
- **RLS / authorization.** A forged `id` could target another operator's row.
  **Mitigation:** the `update ... where id = p_id` runs under **SECURITY INVOKER**, so
  the `paquetes` RLS owner policy (`user_id = (select auth.uid())`) scopes it; a
  non-owned id matches zero rows and the `if not found` guard raises `'Paquete no
  encontrado'`. RLS is the boundary (ADR-0001), not the WHERE clause alone.
- **Atomicity / partial write.** The five-column update is a single statement inside
  one RPC (ADR-0005); it cannot partially apply.
- **CHECK violation.** `paquetes_vigencia_ck` requires `(tipo='mes') = (dias IS NULL)`.
  **Mitigation:** the RPC always writes `tipo='dias'` + `dias=30`, which satisfies the
  constraint by construction.
- **Duplicate name.** `paquetes_nombre_uq (user_id, nombre)` rejects a collision at the
  DB. **Mitigation:** the DAL maps that specific error to "Ya tienes un paquete con ese
  nombre"; the form surfaces it as a warning toast and stays open.
- **Decimal price input.** A price typed with centavos would violate the `int` column.
  **Mitigation:** the client parses to a positive integer and `z.number().int()`
  rejects non-integers — es-MX whole-peso pricing only in v1.

## ADR References

- **ADR-0001 — Supabase + RLS, no ORM** ([`docs/adr/0001-supabase-rls-no-orm.md`](../adr/0001-supabase-rls-no-orm.md)): write goes through the server-only DAL; RLS owner-scopes the row; no ORM.
- **ADR-0005 — atomic write RPCs** ([`docs/adr/0005-atomic-write-rpcs.md`](../adr/0005-atomic-write-rpcs.md)): the edit is one SECURITY INVOKER Postgres RPC, the single place the write happens.
- **Dependency boundary** (`.dependency-cruiser.cjs`, `domain-data-no-upward-ui`): write logic stays in `src/lib/data`; the new components/actions in `src/app` import *inward* only — `src/lib`/`src/domain` never import `src/app`/`src/components`. The boundary stays green.

## Testing Plan

Pre-commit gate (`pnpm lint && pnpm typecheck && pnpm test`) must pass. A good test
asserts **external behavior given known inputs**, never RPC internals.

**`src/lib/data/paquetes.test.ts`** — **new**, via the injected fake Supabase client
(pattern: [`src/lib/data/supabase-fake.test-helper.ts`](../../src/lib/data/supabase-fake.test-helper.ts),
prior art: `src/lib/data/ventas.test.ts`). Assertions:

- **Happy path** — `actualizarPaquete` parses a valid payload and calls `supabase.rpc("actualizar_paquete", { p_id, p_nombre, p_precio, p_popular })` with the trimmed name and integer price; resolves `void`.
- **Error mapping** — a fake RPC error mentioning `paquetes_nombre_uq` throws **"Ya tienes un paquete con ese nombre"**; any other error throws **"No se pudo actualizar el paquete"**.
- **Zod bounds** — empty/whitespace `nombre` rejects; `nombre` > 40 chars rejects; `precio` that is `0`, negative, or non-integer rejects; a non-uuid `id` rejects — all *before* the RPC is invoked (assert the fake's `rpc` was not called).

**Not unit-tested** (verified manually / by the integration pass against a Supabase
branch, matching the plantillas vertical): the `paquetes-sheet.tsx` / `paquete-editor.tsx`
UI, the thin Server Action, and the RPC's live RLS scoping. Key manual/integration
checks: an edit persists and the card refreshes; a non-owned `id` raises "Paquete no
encontrado"; an edit leaves `vigencia_tipo='dias'`/`vigencia_dias=30`; a duplicate name
is rejected with the friendly message.

## Acceptance Criteria

1. Tapping **EDITAR** on the **Paquetes y precios** card **or** any package row opens the **PaquetesSheet** — neither fires the `proximamente` toast any longer.
2. The sheet lists the operator's packages (**nombre**, **precio** in pesos, gold **star** when **popular**) with **no** add button and **no** delete chrome.
3. ~~Tapping a package opens the editor with header **Eyebrow** "EDITAR PAQUETE" + **H1** = current **nombre**, and **nombre** / **precio** / **popular** prefilled from the row.~~ **[SUPERSEDED v2 / ADR-0007]** The editor prefills **clases** (1–30 / Ilimitado picker) / **precio** / **popular** from the row; there is no editable `nombre` field (the H1 shows the derived name).
4. ~~**Guardar** is disabled unless `nombre` is 1–40 trimmed chars **and** `precio` is a positive integer **and** at least one field changed vs the loaded row **and** no save is in flight.~~ **[SUPERSEDED v2 / ADR-0007]** Gating is on **`clases` (1–30 or Ilimitado)** and `precio` (positive integer) being valid, at least one of clases/precio/popular changed, and no save in flight.
5. ~~Saving calls `actualizarPaqueteAction({ id, nombre, precio, popular })`~~ **[SUPERSEDED v2 / ADR-0007]** Saving calls `actualizarPaqueteAction({ id, clases, precio, popular })` (no `nombre`), shows a success toast, `router.refresh()`es, and returns to the list; the card reflects the new values immediately.
6. After any edit, the row in `paquetes` has `vigencia_tipo='dias'` and `vigencia_dias=30` (the 30-day invariant), regardless of its prior vigencia.
7. ~~The edit **never** changes `clases`, and the `actualizar_paquete` RPC has no `clases`/`vigencia` parameter — confirming future-sale grants are untouched.~~ **[SUPERSEDED v2 / ADR-0007]** The edit **does** change `clases` (an `actualizar_paquete` RPC param), applying to **future** sales only; the RPC derives `nombre` from `clases` and demotes other favorites before promoting. `vigencia` is still not a parameter. Past sales stay untouched via the `ventas` snapshot (ADR-0004).
8. ~~Editing a package to a name another package already uses is rejected with **"Ya tienes un paquete con ese nombre"** (the duplicate toast), and the form stays open with its values.~~ **[SUPERSEDED v2 / ADR-0007]** Editing a package's `clases` to a count another package already grants (same derived name) is rejected with **"Ya tienes un paquete con esa cantidad de clases"** (the duplicate toast), and the form stays open with its values.
9. The write is a single SECURITY INVOKER RPC under RLS; a forged/non-owned `id` raises "Paquete no encontrado" and changes nothing.
10. `PaqueteDTO`, `getPaquetes`, and the **cuenta** page data fetch are unchanged; no add/delete capability exists in v1.
11. `pnpm lint && pnpm typecheck && pnpm test` pass, including the new `src/lib/data/paquetes.test.ts` (RPC-call shape, error mapping, Zod bounds), and the dependency-cruiser boundary stays green.

## Out of Scope (Future)

- **Add a new package.** Deferred. A future `crear_paquete` RPC + an "Agregar paquete" affordance, with an `orden` slot and the same vigencia policy. Adds a catalog-cap question (how many packages max?) not decided here.
- **Delete a package.** Deferred — and riskier than plantillas-delete because **ventas** reference packages by snapshot; a delete policy must define what happens to the catalog ordering and whether a package with sales can be removed at all. Out of v1.
- ~~**Editing `vigencia` or `clases`.** Excluded by design (§Risks: sale-math coupling). Any future "advanced" editing of these must reckon with changing future-buyer grants and would warrant its own ADR.~~ **[SUPERSEDED v2 / ADR-0007]** `clases` editing **is now in scope** (it got its own ADR, exactly as this line anticipated): it changes future-buyer grants on purpose, with past sales safe via the `ventas` snapshot (ADR-0004). **`vigencia`** editing remains out of scope (the 30-day invariant).
- **Decimal / centavo pricing.** Whole-peso integers only in v1.
- **Reordering packages** (drag to change `orden`). Not in scope.
- **Multi-operator / shared catalogs.** Forge is single-operator (ADR-0001).

## Further Notes

- The whole vertical is a faithful copy of the **plantillas** CRUD vertical (`actualizar_plantilla` RPC ⟶ `actualizarPlantilla` DAL ⟶ `actualizarPlantillaAction` ⟶ `plantillas-sheet.tsx` / `plantilla-editor.tsx`); reuse those files as the template and diverge only where noted (no add/delete; the unique-violation error branch; the hard-coded vigencia normalization).
- **Install note / tooling:** apply the migration via Supabase MCP `apply_migration`, then `generate_typescript_types` (so `actualizar_paquete` lands in the generated DB types and the DAL needs no `as any`) and `get_advisors` (security) to confirm no missing-RLS / mutable-search-path regression.
- **Tracker:** local-only; this file in `docs/prds/` is the source of record and feeds `/to-issues` → `/to-goal` directly.
