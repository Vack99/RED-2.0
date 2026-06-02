# Spec — Edit client identity (`nombre` + `tel`) from the profile

**Date:** 2026-06-02 · **Status:** Approved (brainstorming) · **Branch:** `feat/profile-settings-templates`
**Feature:** wire the dormant "Editar" button on the client profile to a working edit flow.

## Problem

The client profile (`src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx:80-88`) has an
edit button in the `AppBar` trailing slot that only fires a "Próximamente" toast. There is no edit
form, no edit server action, no DAL update function, and no update RPC. An operator cannot correct a
client's name or phone after creation. (A client is currently only ever *created* as a side effect of
the `vender` flow, via the `registrar_venta` RPC, which never touches identity fields afterward.)

## Goal

Let an operator edit a client's **`nombre`** and **`tel`** from the profile screen, with the change
persisted through the same RLS-bounded, RPC-based write seam the rest of the app uses.

## Locked decisions (from brainstorming)

1. **Field set: `nombre` + `tel` only.** The DB also has `email` and `birthday` columns, but they are
   unused everywhere in the app today; surfacing them is deferred (YAGNI). Saldo fields
   (`clases_restantes`, `vence`, `paquete_nombre`) are owned by the ventas/attendance flows and are
   **out of scope** for manual editing.
2. **Write path: a new `actualizar_cliente` Postgres RPC**, not a direct `.update()`. ADR-0005's
   *atomicity* rationale does not strictly apply to a single-row, single-statement update — but this
   is a showcase repo whose architecture story is "every mutation goes through a tested, RLS-bounded
   Postgres function" (today there are **zero** direct writes in the codebase). The RPC keeps that
   story uniform and makes the column allowlist structurally enforced in SQL. The small one-time
   ceremony (migration + grants + type regen) is accepted.
3. **UI surface: a `Sheet` bottom-modal**, opened from the existing edit button. Matches every other
   editor/picker in the app (e.g. the cliente picker in `vender`). No new route, no inline editing.

## Architecture & flow

```
[Edit btn]
  → Sheet(form: nombre, tel)            // prefilled from ficha
  → actualizarClienteAction(raw)        // server action ("use server")
  → actualizarCliente(raw)              // DAL: zod validate + requireOperator()
  → supabase.rpc("actualizar_cliente",  // SECURITY INVOKER → RLS = boundary
      { p_cliente_id, p_nombre, p_tel })
  → revalidatePath(profile, roster)
  → toast success + close Sheet + router.refresh()
```

The enforced sector boundary is respected: schema/DAL live in `src/lib/data`, the server action in
`src/app/(app)/clientes/[id]`, and the UI in the route's `_components`. No `src/lib`→`src/components`
import is introduced.

## Components

### 1. Data layer

**Migration** `supabase/migrations/<timestamp>_actualizar_cliente_rpc.sql`:

```sql
create or replace function public.actualizar_cliente(
  p_cliente_id uuid,
  p_nombre text,
  p_tel text
) returns void
language plpgsql
security invoker
set search_path to ''
as $$
begin
  update public.clientes
     set nombre = p_nombre,
         tel    = p_tel
   where id = p_cliente_id;
end;
$$;

revoke execute on function public.actualizar_cliente(uuid, text, text) from anon, public;
grant  execute on function public.actualizar_cliente(uuid, text, text) to authenticated;
```

- Updates **only** `nombre` + `tel` — saldo columns are structurally unreachable from this function.
- `SECURITY INVOKER` + the existing `clientes_update_own` policy = the authorization boundary; an
  operator can only edit a client where `user_id = auth.uid()`.
- DB-enforced invariants still apply on the write: `nombre NOT NULL`, and the
  `clientes_tel_10_digits_ck` check constraint on `tel`.
- `SET search_path TO ''` + schema-qualified objects = injection-safe, clears the
  `function_search_path_mutable` advisor (same as the ADR-0005 RPCs).
- Per ADR-0005's "canonical provisioner" consequence, this RPC is created **as a migration** (the
  migration set is the source of truth — no apply-without-mirroring).

**Zod schema** `actualizarClienteSchema` in `src/lib/data/clientes.ts`:

```ts
// shape (final names pinned during planning)
{
  clienteId: z.string().uuid(),
  nombre: z.string().trim().min(3),
  tel: z.string().refine(isTelValido),   // reuse the existing helper used by crearVentaSchema
}
```

**DAL** `actualizarCliente(raw: unknown)` in `src/lib/data/clientes.ts` (server-only), mirroring the
structure of `crearVenta`:

1. `const input = actualizarClienteSchema.parse(raw)`
2. `await requireOperator()` (existing auth seam)
3. `await supabase.rpc("actualizar_cliente", { p_cliente_id: input.clienteId, p_nombre: input.nombre, p_tel: input.tel })`
4. return a small typed result (e.g. `{ ok: true }`) or surface the error.

**Types**: regenerate Supabase TypeScript types after the migration so the RPC call is fully typed
(no `as any`), consistent with ADR-0005's type-bridge discipline.

### 2. Server action

`actualizarClienteAction(raw: unknown)` added to `src/app/(app)/clientes/[id]/actions.ts` next to the
existing `togglePaseAction`:

- delegates to `actualizarCliente(raw)`,
- on success `revalidatePath` the profile (`/clientes/[id]`) and the roster (`/clientes`) so the name
  and phone update everywhere they appear,
- returns `{ ok: true }` or a typed error result (no throw across the boundary; the client renders a
  warning toast on `ok: false`).

### 3. UI (built via the frontend-design skill)

In `cliente-detalle.tsx`:

- add `editOpen` and `saving` state; the existing edit button sets `editOpen = true` (replacing the
  "Próximamente" toast),
- render a new `<Sheet open={editOpen} onClose={...}>` containing two `Input`s (prefilled from
  `ficha`: name, phone) reusing the existing kit (`Input`, `Button`, `forgeToast`),
- **Save** is enabled only when: `nombre.trim().length >= 3` **and** `isTelValido(tel)` **and** the
  values differ from the current ones (no-op guard) **and** `!saving`,
- on submit: set `saving`, call `actualizarClienteAction`, then on success close the Sheet, fire a
  success toast, and `router.refresh()`; on failure fire a warning toast, keep the Sheet open, and
  re-enable Save.

Visual polish (layout, header, footer button arrangement) is produced through the **frontend-design**
skill at build time.

## Error handling

| Case | Behavior |
| --- | --- |
| Invalid name/phone (client-side) | Save disabled; no submit. |
| Invalid input reaching the DAL | `schema.parse` throws → action returns error → warning toast. |
| Unauthorized / wrong owner | RLS yields no row updated / error → warning toast; nothing changes. |
| Unchanged values | Save disabled (no-op guard); no request. |
| RPC / network failure | Warning toast, Sheet stays open, Save re-enabled. |

## Testing

Following the repo's data-layer-focused strategy (vitest covers pure logic/data; there is no
component-test harness):

- **`src/lib/data/clientes.test.ts`** (new, mirrors `ventas.test.ts`): with an injected fake Supabase
  client — asserts the exact `.rpc("actualizar_cliente", { p_cliente_id, p_nombre, p_tel })` payload,
  that the auth seam is invoked, and that the schema rejects a too-short name and an invalid phone.
- **`supabase/tests/actualizar_cliente_rules.sql`** (new, mirrors `toggle_pase_rules.sql`): a
  rolled-back SQL test on the real schema proving the RPC updates `nombre`+`tel`, leaves the saldo
  columns untouched, and is owner-scoped under RLS (a non-owner cannot update another operator's
  client).
- **UI**: verified manually via the `/run` (or `/verify`) skill.

Implementation follows TDD on the data layer (schema + DAL tests first), per the project's standard.

## Out of scope (YAGNI)

`email` / `birthday` editing · any saldo or package mutation · client deletion · an audit log of
edits · optimistic UI. These can be revisited later if needed.

## References

- ADR-0001 — Supabase RLS, no ORM (RLS is the authorization boundary).
- ADR-0004 — saldo stored as a running balance (why saldo is off-limits to manual edits).
- ADR-0005 — atomic write RPCs (the write-seam pattern this mirrors; `SECURITY INVOKER`, grants,
  canonical-provisioner migration, type-bridge).
- Mirror targets: `crearVenta` / `crearVentaSchema` (`src/lib/data/ventas.ts`), `togglePaseAction`
  (`src/app/(app)/clientes/[id]/actions.ts`), `ClienteEditor` (`src/app/(app)/vender/_components/vender.tsx`),
  `toggle_pase_rules.sql` (`supabase/tests/`).
