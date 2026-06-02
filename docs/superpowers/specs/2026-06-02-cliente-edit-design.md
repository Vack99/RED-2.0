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
  → (client) toast success + close Sheet + router.refresh()
```

The enforced sector boundary is respected: schema/DAL live in `src/lib/data`, the server action in
`src/app/(app)/clientes/[id]`, and the UI in the route's `_components`. No `src/lib`→`src/components`
import is introduced.

## Components

### 1. Data layer

**Migration** `supabase/migrations/<timestamp>_actualizar_cliente_rpc.sql`:

```sql
create or replace function public.actualizar_cliente(p_cliente_id uuid, p_nombre text, p_tel text)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  update public.clientes
     set nombre = p_nombre,
         tel    = p_tel
   where id = p_cliente_id;          -- RLS scopes this to the owner
  if not found then
    raise exception 'Cliente no encontrado';
  end if;
end;
$function$;

revoke execute on function public.actualizar_cliente(uuid, text, text) from public;
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
  tel: z.string().trim().refine(isTelValido),   // reuse the existing helper used by crearVentaSchema
}
```

**DAL** `actualizarCliente(raw: unknown)` in `src/lib/data/clientes.ts` (server-only), mirroring the
structure of `crearVenta`:

1. `const input = actualizarClienteSchema.parse(raw)`
2. `await requireOperator(supabase)` (existing auth seam; presence check)
3. `await supabase.rpc("actualizar_cliente", { p_cliente_id: input.clienteId, p_nombre: input.nombre, p_tel: input.tel })`
4. returns `Promise<void>`; throws `Error("No se pudo actualizar el cliente")` on RPC error (the client catches and toasts).

**Types**: regenerate Supabase TypeScript types after the migration so the RPC call is fully typed
(no `as any`), consistent with ADR-0005's type-bridge discipline.

### 2. Server action

`actualizarClienteAction(raw: unknown): Promise<void>` added to `src/app/(app)/clientes/[id]/actions.ts`
next to the existing `togglePaseAction`:

- a thin wrapper that delegates to `actualizarCliente(raw)`,
- **no `revalidatePath`** — the `(app)` reads are dynamic (cookie-bound), so the client calls
  `router.refresh()` after a successful save and the next read is fresh (this is exactly the rationale
  documented on `togglePaseAction`; the roster picks up the new name on its next dynamic read too),
- throws on failure; the client's `try/catch` renders a warning toast.

### 3. UI (built via the frontend-design skill)

The edit form is **extracted into its own component**, `EditarClienteSheet`, at
`src/app/(app)/clientes/[id]/_components/editar-cliente-sheet.tsx` — keeping the already-large
`cliente-detalle.tsx` focused (one responsibility per file).

- `EditarClienteSheet({ open, onClose, cliente: { id, nombre, tel } })` owns its own form state
  (`nombre`, `tel`, `saving`), re-seeded to the current values when it opens, and renders a `Sheet`
  with two `Input`s reusing the kit (`Input`, `Button`, `H1`, `forgeToast`),
- **Save** is enabled only when: `nombre.trim().length >= 3` **and** `isTelValido(tel)` **and** the
  values differ from the current ones (no-op guard) **and** `!saving`,
- on submit: set `saving`, call `actualizarClienteAction`, then on success close the Sheet, fire a
  success toast, and `router.refresh()`; on failure fire a warning toast, keep the Sheet open, and
  re-enable Save.
- `cliente-detalle.tsx` changes are minimal: add `editOpen` state, point the existing button's
  `onClick` at `setEditOpen(true)` (replacing the "Próximamente" toast), and render
  `<EditarClienteSheet open={editOpen} ... cliente={{ id: c.id, nombre: c.nombre, tel: c.tel }} />`.

Visual polish (layout, header, footer button arrangement) is produced through the **frontend-design**
skill at build time.

## Error handling

| Case | Behavior |
| --- | --- |
| Invalid name/phone (client-side) | Save disabled; no submit. |
| Invalid input reaching the DAL | `schema.parse` throws → action throws → client catch → warning toast. |
| Unauthorized / wrong owner | RLS-scoped UPDATE matches 0 rows → RPC raises `Cliente no encontrado` → warning toast; nothing changes. |
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
