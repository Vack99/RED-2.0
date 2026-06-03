# Client-profile edit (nombre + tel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the dormant "Editar" button on the client profile to a working flow that edits a client's `nombre` and `tel`, persisted through a new RLS-bounded Postgres RPC.

**Architecture:** A new `actualizar_cliente` `SECURITY INVOKER` RPC updates only the two identity columns (saldo is structurally untouchable), mirroring the ADR-0005 write seam. A new injectable DAL function (`actualizarCliente`) validates with zod and calls the RPC. A thin server action exposes it. The UI extracts an `EditarClienteSheet` component (a `Sheet` with two inputs) opened from the existing button; on success it refreshes the route (the `(app)` reads are dynamic, so no cache invalidation — matching `togglePaseAction`).

**Tech Stack:** Next.js 16 (app router) · React 19 · Supabase/Postgres (RLS, plpgsql RPCs) · zod · vitest · Tailwind v4. Spanish domain vocabulary.

---

## Spec

`docs/superpowers/specs/2026-06-02-cliente-edit-design.md` (approved).

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `supabase/migrations/20260602120000_actualizar_cliente_rpc.sql` | Create | The `actualizar_cliente` RPC (identity-only UPDATE, INVOKER, grants). |
| `supabase/tests/actualizar_cliente_rules.sql` | Create | Rolled-back SQL test: identity updates, saldo untouched, not-found guard. |
| `src/lib/supabase/database.types.ts` | Modify (regen) | Regenerated so the RPC is typed (no `as any`). |
| `src/lib/data/clientes.ts` | Modify | Add `actualizarClienteSchema` + `actualizarCliente` (injectable DAL write). |
| `src/lib/data/clientes.test.ts` | Create | Unit-tests the DAL write orchestration with an injected fake. |
| `src/app/(app)/clientes/[id]/actions.ts` | Modify | Add the thin `actualizarClienteAction` wrapper. |
| `src/app/(app)/clientes/[id]/_components/editar-cliente-sheet.tsx` | Create | The edit `Sheet` (two inputs + save), self-contained. |
| `src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx` | Modify | Replace the stub button onClick; render the sheet; add `editOpen` state. |

## Conventions to follow (verified in-repo)

- Every DAL write takes an optional trailing `client?: SupabaseServer` defaulting to `await createClient()` (the injectable seam that makes the fake test work — ADR-0001).
- `requireOperator(supabase)` returns the operator `sub` and throws `Error("No autenticado")`; the RPC independently re-checks `auth.uid()`.
- RPCs are `SECURITY INVOKER` (default) + `set search_path to ''`; `revoke execute ... from public; grant execute ... to authenticated;`.
- `Input.onChange` receives the **string value** (not the event). `forgeToast` tones: `success | warning | info`.
- DB CHECK: `char_length(regexp_replace(tel,'\D','','g')) = 10` accepts formatted phones; `isTelValido` (10 digits after stripping) is the matching TS rule.

---

## Task 1: The `actualizar_cliente` RPC + SQL rule test (database)

**Files:**
- Create: `supabase/tests/actualizar_cliente_rules.sql`
- Create: `supabase/migrations/20260602120000_actualizar_cliente_rpc.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerate)

> The SQL test and the RPC both run against the remote Supabase project (there is no local Docker — same as `toggle_pase_rules.sql`). The migration apply is an outward-facing DB change: **STOP and get explicit user confirmation at Step 4 before applying.**

- [ ] **Step 1: Write the failing SQL rule test**

Create `supabase/tests/actualizar_cliente_rules.sql`:

```sql
-- actualizar_cliente rule test (ADR-0005 contract-honesty item).
--
-- actualizar_cliente edits ONLY the identity columns (nombre, tel) of a client the calling
-- operator owns. Proven here, against the REAL deployed function in a rolled-back transaction:
--   (1) nombre + tel are updated;
--   (2) the saldo columns (clases_restantes, vence, paquete_nombre) are left UNTOUCHED;
--   (3) a non-existent / non-owned id raises 'Cliente no encontrado' (RLS-scoped UPDATE → 0 rows).
--
-- Self-asserting: every check RAISEs on mismatch; a clean run returns one 'OK' row. Wrapped in
-- BEGIN/ROLLBACK — touches no row permanently.
--
-- HOW TO RUN (no local Docker): via the Supabase MCP execute_sql, or
--   psql "$DATABASE_URL" -f supabase/tests/actualizar_cliente_rules.sql

begin;

-- Resolve the operator at runtime (the only env-dependent value): perfil.user_id is a real
-- auth.users id; the RPC keys the write to auth.uid() and RLS scopes clientes to it.
select set_config(
  'app.op',
  (select user_id::text from public.perfil order by created_at limit 1),
  true
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('app.op', true), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $$
declare
  v_op     uuid := current_setting('app.op', true)::uuid;
  v_today  date := (now() at time zone 'America/Chihuahua')::date;
  v_cli    uuid;
  v_nombre text;
  v_tel    text;
  v_clases int;
  v_vence  date;
  v_paq    text;
begin
  -- Seed: a finite client owned by the operator, with a known saldo.
  insert into public.clientes (user_id, nombre, tel, clases_restantes, vence, paquete_nombre)
  values (v_op, 'TEST original', '0000000001', 5, v_today + 20, '8 clases')
  returning id into v_cli;

  -- (1) Update identity → nombre + tel change.
  perform public.actualizar_cliente(v_cli, 'TEST editado', '6141112233');
  select nombre, tel, clases_restantes, vence, paquete_nombre
    into v_nombre, v_tel, v_clases, v_vence, v_paq
    from public.clientes where id = v_cli;
  if v_nombre <> 'TEST editado' then raise exception 'RULE FAIL(1): nombre not updated, got %', v_nombre; end if;
  if v_tel <> '6141112233' then raise exception 'RULE FAIL(1): tel not updated, got %', v_tel; end if;

  -- (2) Saldo columns untouched.
  if v_clases <> 5 then raise exception 'RULE FAIL(2): clases_restantes changed, got %', v_clases; end if;
  if v_vence <> v_today + 20 then raise exception 'RULE FAIL(2): vence changed, got %', v_vence; end if;
  if v_paq <> '8 clases' then raise exception 'RULE FAIL(2): paquete_nombre changed, got %', v_paq; end if;

  -- (3) A random (non-owned / non-existent) id raises 'Cliente no encontrado'.
  begin
    perform public.actualizar_cliente(gen_random_uuid(), 'X', '0000000002');
    raise exception 'RULE FAIL(3): expected Cliente no encontrado, none raised';
  exception
    when others then
      if sqlerrm <> 'Cliente no encontrado' then
        raise exception 'RULE FAIL(3): expected Cliente no encontrado, got %', sqlerrm;
      end if;
  end;

  raise notice 'actualizar_cliente rules: (1) identity updated, (2) saldo untouched, (3) not-found guard all hold';
end $$;

select 'actualizar_cliente rules: OK' as result;
rollback;
```

- [ ] **Step 2: Run the SQL test to verify it FAILS**

Load the Supabase MCP tool: `ToolSearch` with `select:mcp__supabase__execute_sql`, then run the file's contents via `execute_sql`.
Expected: FAIL — `function public.actualizar_cliente(uuid, text, text) does not exist`.

- [ ] **Step 3: Write the RPC migration**

Create `supabase/migrations/20260602120000_actualizar_cliente_rpc.sql`:

```sql
-- actualizar_cliente: edit a client's identity (nombre + tel) from the profile.
--
-- Thin write seam (ADR-0005): this RPC performs ONLY the single-row UPDATE of the two identity
-- columns. It deliberately never touches the saldo columns (clases_restantes / vence /
-- paquete_nombre) — those are owned by registrar_venta and toggle_pase. SECURITY INVOKER (the
-- default) so the clientes_update_own RLS policy still scopes the write to the calling operator;
-- `SET search_path TO ''` keeps it injection-safe and clears the function_search_path_mutable
-- advisor. nombre NOT NULL and the clientes_tel_10_digits_ck CHECK are enforced by the table.
-- Guards mirror registrar_venta: 'No autenticado' when unauthenticated, 'Cliente no encontrado'
-- when the RLS-scoped UPDATE matches no row.

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

-- Restrict EXECUTE to authenticated operators (CREATE FUNCTION grants EXECUTE to public by default).
revoke execute on function public.actualizar_cliente(uuid, text, text) from public;
grant  execute on function public.actualizar_cliente(uuid, text, text) to authenticated;
```

- [ ] **Step 4: 🛑 CRITICAL CHECKPOINT — apply the migration to the remote project**

This writes to the live Supabase DB. Confirm with the user (direct apply vs. a preview branch) BEFORE proceeding. Once confirmed: load `ToolSearch` `select:mcp__supabase__apply_migration` and apply with name `actualizar_cliente_rpc` and the migration body above.

- [ ] **Step 5: Run the SQL test to verify it PASSES**

Re-run `supabase/tests/actualizar_cliente_rules.sql` via `execute_sql`.
Expected: a single row `actualizar_cliente rules: OK` (any rule violation aborts with `RULE FAIL: ...`).

- [ ] **Step 6: Regenerate the TypeScript types**

Load `ToolSearch` `select:mcp__supabase__generate_typescript_types`, run it, and overwrite `src/lib/supabase/database.types.ts` with the output. Verify the `Functions` block now contains:

```ts
      actualizar_cliente: {
        Args: { p_cliente_id: string; p_nombre: string; p_tel: string }
        Returns: undefined
      }
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260602120000_actualizar_cliente_rpc.sql supabase/tests/actualizar_cliente_rules.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): actualizar_cliente RPC for client identity edits"
```

---

## Task 2: DAL schema + `actualizarCliente` (TDD with injected fake)

**Files:**
- Create: `src/lib/data/clientes.test.ts`
- Modify: `src/lib/data/clientes.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/clientes.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { actualizarCliente } from "./clientes";
import type { SupabaseServer } from "@/lib/supabase/server";

/**
 * The seam: `actualizarCliente` takes an injectable client (ADR-0001), so the write
 * orchestration — zod validation, the auth gate, and the exact actualizar_cliente RPC payload —
 * is testable with a hand-rolled fake. No supabase, no DB. The RPC itself is smoke-tested against
 * the real schema in supabase/tests/actualizar_cliente_rules.sql (ADR-0005).
 */
interface FakeClient {
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  client: SupabaseServer;
}

function makeFake(opts: { sub?: string | null } = {}): FakeClient {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    auth: {
      getClaims: async () => ({ data: sub ? { claims: { sub } } : null }),
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { rpcCalls, client: client as unknown as SupabaseServer };
}

const valid = {
  clienteId: "11111111-1111-1111-1111-111111111111",
  nombre: "Andrea Castro",
  tel: "614 218 3401",
};

describe("actualizarCliente — write orchestration (injected fake)", () => {
  it("sends the exact actualizar_cliente RPC payload", async () => {
    const fake = makeFake();
    await actualizarCliente(valid, fake.client);
    expect(fake.rpcCalls).toHaveLength(1);
    const { name, args } = fake.rpcCalls[0];
    expect(name).toBe("actualizar_cliente");
    expect(args).toEqual({
      p_cliente_id: "11111111-1111-1111-1111-111111111111",
      p_nombre: "Andrea Castro",
      p_tel: "614 218 3401",
    });
  });

  it("rejects a too-short nombre (zod) before any write", async () => {
    const fake = makeFake();
    await expect(actualizarCliente({ ...valid, nombre: "Al" }, fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("rejects an invalid (non-10-digit) tel before any write", async () => {
    const fake = makeFake();
    await expect(actualizarCliente({ ...valid, tel: "614 123" }, fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("throws 'No autenticado' when getClaims returns no sub (requireOperator wired)", async () => {
    const fake = makeFake({ sub: null });
    await expect(actualizarCliente(valid, fake.client)).rejects.toThrow("No autenticado");
    expect(fake.rpcCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

Run: `pnpm test clientes`
Expected: FAIL — `actualizarCliente` is not exported from `./clientes`.

- [ ] **Step 3: Implement the schema + DAL function**

In `src/lib/data/clientes.ts`: add `import { z } from "zod";` to the import block, and add `isTelValido` to the existing `@/lib/format` import (currently `import { iniciales } from "@/lib/format";` → `import { iniciales, isTelValido } from "@/lib/format";`). Then append at the end of the file:

```ts
/** Identity-edit input (nombre + tel). Trims like crearVenta; tel validity is the canonical
 *  10-digit MX rule (isTelValido), the same rule the DB CHECK enforces. */
export const actualizarClienteSchema = z.object({
  clienteId: z.string().uuid(),
  nombre: z.string().trim().min(3),
  tel: z.string().trim().refine(isTelValido, { message: "Teléfono inválido" }),
});

export type ActualizarClienteInput = z.infer<typeof actualizarClienteSchema>;

/** Edit a client's identity (nombre + tel). Injectable client (ADR-0001). The actualizar_cliente
 *  RPC re-checks auth.uid() and RLS scopes the UPDATE to the owner (SECURITY INVOKER), so the sub
 *  from the presence check is discarded here (matches crearVenta). */
export async function actualizarCliente(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = actualizarClienteSchema.parse(raw);
  const supabase = client ?? (await createClient());

  await requireOperator(supabase);

  const { error } = await supabase.rpc("actualizar_cliente", {
    p_cliente_id: input.clienteId,
    p_nombre: input.nombre,
    p_tel: input.tel,
  });
  if (error) throw new Error("No se pudo actualizar el cliente");
}
```

Note: `requireOperator` must be imported. Check the top of `clientes.ts` — if it is not already imported, add `import { requireOperator } from "./_auth";` (the same path `ventas.ts` uses).

- [ ] **Step 4: Run the test to verify it PASSES**

Run: `pnpm test clientes`
Expected: PASS (4 tests).

- [ ] **Step 5: Full typecheck + tests**

Run: `pnpm typecheck` then `pnpm test`
Expected: both clean; total test count = previous 107 + 4 = 111.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/clientes.ts src/lib/data/clientes.test.ts
git commit -m "feat(data): actualizarCliente DAL + schema (injectable, RPC-backed)"
```

---

## Task 3: Server action

**Files:**
- Modify: `src/app/(app)/clientes/[id]/actions.ts`

- [ ] **Step 1: Add the action**

`actions.ts` already starts with `"use server";` and imports `togglePase`. Add the import and the action:

```ts
import { actualizarCliente } from "@/lib/data/clientes";
```

```ts
/** Edit a client's identity (nombre + tel) from the ficha. Thin write seam over the DAL; (app)
 *  reads are dynamic (cookie-bound), so the client refreshes the route after a successful save and
 *  no cache invalidation is needed (matches togglePaseAction). */
export async function actualizarClienteAction(raw: unknown): Promise<void> {
  return actualizarCliente(raw);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck` then `pnpm lint`
Expected: both clean (the `src/lib` → `src/app` boundary is not crossed — the action lives in `src/app` and imports from `src/lib`, the allowed direction).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/clientes/[id]/actions.ts"
git commit -m "feat(actions): actualizarClienteAction wrapper"
```

---

## Task 4: Edit Sheet UI + wire the button (via frontend-design skill)

**Files:**
- Create: `src/app/(app)/clientes/[id]/_components/editar-cliente-sheet.tsx`
- Modify: `src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx`

> The implementing subagent MUST invoke the **frontend-design** skill for the visual layer of the Sheet, refining the baseline below while preserving its wiring/contract (props, validation, action call, refresh). The baseline already reuses the kit (`Sheet`, `Input`, `Button`, `H1`, `forgeToast`) and mirrors the vender picker, so it is on-brand to start.

- [ ] **Step 1: Create the EditarClienteSheet component (baseline, then refine via frontend-design)**

Create `src/app/(app)/clientes/[id]/_components/editar-cliente-sheet.tsx`:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/forge/sheet";
import { forgeToast } from "@/components/forge/toaster";
import { Button, H1, Input } from "@/components/forge/ui";
import { isTelValido } from "@/lib/format";
import { actualizarClienteAction } from "../actions";

export function EditarClienteSheet({
  open,
  onClose,
  cliente,
}: {
  open: boolean;
  onClose: () => void;
  cliente: { id: string; nombre: string; tel: string };
}) {
  const router = useRouter();
  const [nombre, setNombre] = React.useState(cliente.nombre);
  const [tel, setTel] = React.useState(cliente.tel);
  const [saving, setSaving] = React.useState(false);

  // Re-seed the form to the current values whenever the sheet opens.
  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional re-seed on open
      setNombre(cliente.nombre);
      setTel(cliente.tel);
    }
  }, [open, cliente.nombre, cliente.tel]);

  const valido = nombre.trim().length >= 3 && isTelValido(tel);
  const dirty = nombre.trim() !== cliente.nombre.trim() || tel.trim() !== cliente.tel.trim();
  const canSave = valido && dirty && !saving;

  const guardar = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await actualizarClienteAction({ clienteId: cliente.id, nombre, tel });
      forgeToast({ tone: "success", title: "Cliente actualizado", body: nombre.trim() });
      onClose();
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo actualizar", body: "Intenta de nuevo." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div style={{ padding: "8px 22px 12px" }}>
        <H1 size={22}>EDITAR CLIENTE</H1>
      </div>
      <div className="flex flex-col" style={{ padding: "0 16px 16px", gap: 12 }}>
        <Input placeholder="Nombre completo" value={nombre} onChange={setNombre} autoFocus />
        <Input icon="phone" placeholder="614 000 0000" value={tel} onChange={setTel} suffix="MX" inputMode="tel" />
        <Button variant="primary" full icon="check" disabled={!canSave} onClick={guardar}>
          {saving ? "GUARDANDO…" : "GUARDAR"}
        </Button>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 2: Wire it into cliente-detalle.tsx**

Add the import (next to the other local import `import { togglePaseAction } from "../actions";`):

```tsx
import { EditarClienteSheet } from "./editar-cliente-sheet";
```

Add state alongside the existing `useState` calls (after `const [busy, setBusy] = React.useState(false);`):

```tsx
  const [editOpen, setEditOpen] = React.useState(false);
```

Replace the stub button's `onClick` in the `AppBar` `trailing` prop. Change:

```tsx
            onClick={() => forgeToast({ tone: "info", title: "Próximamente", body: "Editar cliente llega en la siguiente entrega." })}
```

to:

```tsx
            onClick={() => setEditOpen(true)}
```

Render the sheet — add this immediately after the `<AppBar ... />` element (before the swipe `<div ...>`):

```tsx
      <EditarClienteSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        cliente={{ id: c.id, nombre: c.nombre, tel: c.tel }}
      />
```

- [ ] **Step 3: Typecheck, lint, tests**

Run: `pnpm typecheck` then `pnpm lint` then `pnpm test`
Expected: all clean; 111 tests still pass.

- [ ] **Step 4: Manual verification**

Use the `/run` (or `/verify`) skill to launch the app, open a client profile, tap the edit button, change the name and phone, save, and confirm the toast fires and the profile reflects the new values after refresh. Confirm Save is disabled for an empty/short name, an invalid phone, and when nothing changed.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/clientes/[id]/_components/editar-cliente-sheet.tsx" "src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx"
git commit -m "feat(ui): edit-client Sheet wired to the profile edit button"
```

---

## Final gate (per user directive — run before declaring done)

After Task 4, run both gates and do NOT declare the feature complete until each is 100% yes; otherwise re-structure, re-plan, and re-check:

1. **Elegance Check** — is every change the most elegant approach overall?
2. **Senior Dev Approval** — would a senior dev approve these changes?

---

## Self-review (author)

- **Spec coverage:** field set nombre+tel ✓ (schema + RPC + form); RPC write path ✓ (Task 1); Sheet UI ✓ (Task 4); RLS/constraint reliance ✓ (Task 1 SQL test); TS unit test ✓ (Task 2); SQL test ✓ (Task 1); out-of-scope (email/birthday/saldo/delete) not touched ✓.
- **Refinements vs spec (elegance pass):** thin action without `revalidatePath` (matches `togglePaseAction`); `EditarClienteSheet` extracted to its own file; RPC carries `No autenticado`/`Cliente no encontrado` guards like `registrar_venta`. Spec updated to match.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `actualizar_cliente` (RPC), `actualizarCliente` (DAL), `actualizarClienteAction` (action), `EditarClienteSheet` (UI), `actualizarClienteSchema` — names consistent across tasks; RPC arg keys `p_cliente_id/p_nombre/p_tel` match between migration, DAL, test, and regenerated types.
