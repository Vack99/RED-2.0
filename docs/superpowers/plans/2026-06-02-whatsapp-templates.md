# WhatsApp templates + send-time picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator manage a freeform library of named WhatsApp templates (cap 4) from `cuenta`, and choose which one to send at both send points (client message + post-sale receipt), with a live token-substituted preview.

**Architecture:** The `plantillas` table moves from fixed-purpose `clave` slots to operator-named `(id, nombre, body)` rows via an **expand/contract migration** (so every task stays build-green): expand first (add `nombre`, relax `clave`), migrate each consumer, drop `clave` last. CRUD goes through four new `SECURITY INVOKER` RPCs (`crear_plantilla` enforces the cap; `actualizar`/`eliminar_plantilla`; idempotent `sembrar_plantillas_default`). Both send points pre-render every template server-side into a `mensajes: {id, nombre, texto}[]` array; a single presentational `MensajePicker` (UI kit, `onEnviar` callback — the sector owns `waLink`) lists them. A manager + editor Sheet in `cuenta` replaces the dormant "Próximamente" card.

**Tech Stack:** Next.js 16 (app router) · React 19 · Supabase/Postgres (RLS, plpgsql RPCs) · zod · vitest · Tailwind v4. Spanish (es-MX) domain vocabulary.

---

## Spec

`docs/superpowers/specs/2026-06-02-whatsapp-templates-design.md` (approved). Phase 1 only; receipt-as-image is the deferred Phase 2 appendix.

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `supabase/migrations/20260602130000_plantillas_freeform_expand.sql` | Create | Expand: add `nombre`, relax `clave`, add DELETE policy + length checks. Non-destructive. |
| `supabase/migrations/20260602130100_plantillas_rpcs.sql` | Create | The four write RPCs (`crear`/`actualizar`/`eliminar`/`sembrar_…`) + grants. |
| `supabase/migrations/20260602140000_plantillas_drop_clave.sql` | Create | Contract: drop the now-unused `clave` column. Destructive — runs LAST. |
| `supabase/tests/plantillas_rules.sql` | Create | Rolled-back SQL test: cap-of-4, owner scoping, delete policy, idempotent seed. |
| `src/lib/supabase/database.types.ts` | Modify (regen) | Regenerated twice (after expand+RPCs, and after the drop). |
| `src/lib/data/plantillas.ts` | Modify | Add `PlantillaDTO`/`MensajeDTO`, `listarPlantillas`, CRUD writers + schemas, `sembrarPlantillasDefault`. Old readers removed in the contract task. |
| `src/lib/data/plantillas.test.ts` | Create | Unit-tests the write orchestration with an injected fake. |
| `src/app/(app)/cuenta/actions.ts` | Create | Thin `"use server"` wrappers for the four template mutations. |
| `src/components/forge/input.tsx` | Modify | Add a `Textarea` primitive (mirrors `Input`). |
| `src/components/forge/mensaje-picker.tsx` | Create | Presentational send-template picker (`onEnviar` callback). |
| `src/lib/data/derive.ts` | Modify | `shapeFicha`: render every template → `mensajes` (replaces single `waText`). |
| `src/lib/data/derive.test.ts` | Modify | Update the 14 `shapeFicha` call sites + the recordatorio test. |
| `src/lib/data/clientes.ts` | Modify | `getClienteFicha`: `listarPlantillas()` → pass list to `shapeFicha`. |
| `src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx` | Modify | "Mandar mensaje" opens `MensajePicker` with `ficha.mensajes`. |
| `src/lib/data/ventas.ts` | Modify | `crearVenta`: render every template → `VentaResult.mensajes`. |
| `src/lib/data/ventas.test.ts` | Modify | Update plantillas fixtures (`clave`→`id`+`nombre`). |
| `src/app/(app)/vender/_components/vender.tsx` | Modify | Receipt "Enviar por WhatsApp" opens `MensajePicker` with `result.mensajes`. |
| `src/app/(app)/cuenta/page.tsx` | Modify | `getPlantillas()` → `listarPlantillas()`; pass the list. |
| `src/app/(app)/cuenta/_components/cuenta.tsx` | Modify | Card opens the manager Sheet; takes the template list. |
| `src/app/(app)/cuenta/_components/plantillas-sheet.tsx` | Create | Manager Sheet: list ≤4, add/delete, seed-on-empty, hosts the editor pane. |
| `src/app/(app)/cuenta/_components/plantilla-editor.tsx` | Create | Editor pane: nombre + body Textarea, token chips, live preview, save. |

## Conventions to follow (verified in-repo)

- Every DAL write/read takes an optional trailing `client?: SupabaseServer` defaulting to `await createClient()` (the injectable seam — ADR-0001).
- `requireOperator(supabase)` returns the operator `sub` and throws `Error("No autenticado")`; the RPC independently re-checks `auth.uid()`.
- RPCs are `SECURITY INVOKER` (default) + `set search_path to ''`; `revoke execute … from public; grant execute … to authenticated;`.
- `Input`/`Textarea`/`onChange` receive the **string value** (not the event). `forgeToast` tones: `success | warning | info`.
- Server actions in `src/app` use **no `revalidatePath`** — `(app)` reads are dynamic; the client `router.refresh()`es after a write (matches `togglePaseAction`).
- TS types are regenerated via the Supabase MCP `generate_typescript_types` tool (no npm script); overwrite `src/lib/supabase/database.types.ts`.

## Shared types (introduced in Task 2, referenced throughout)

```ts
export interface PlantillaDTO { id: string; nombre: string; body: string }
export interface MensajeDTO   { id: string; nombre: string; texto: string }
```

`MensajePicker` declares its `mensajes` prop shape inline (structurally identical) so the UI kit imports nothing from `lib/data`.

---

## Task 1: Database — expand migration + RPCs + SQL rule test + types

**Files:**
- Create: `supabase/tests/plantillas_rules.sql`
- Create: `supabase/migrations/20260602130000_plantillas_freeform_expand.sql`
- Create: `supabase/migrations/20260602130100_plantillas_rpcs.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerate)

> Runs against the remote Supabase project (no local Docker — same as `toggle_pase_rules.sql`). The expand migration is **non-destructive** (adds a column, relaxes constraints). The destructive `DROP COLUMN clave` is deferred to Task 8.

- [ ] **Step 1: Write the failing SQL rule test**

Create `supabase/tests/plantillas_rules.sql`:

```sql
-- plantillas rule test (ADR-0005 contract-honesty item).
--
-- Proves, against the REAL deployed functions in a rolled-back transaction:
--   (1) crear_plantilla allows up to 4 and raises 'Máximo 4 plantillas' on the 5th;
--   (2) actualizar_plantilla edits nombre+body of an owned row; a random id raises 'Plantilla no encontrada';
--   (3) eliminar_plantilla removes an owned row (the new DELETE policy); a random id raises 'Plantilla no encontrada';
--   (4) sembrar_plantillas_default seeds 4 on an empty owner and is idempotent (no-op when rows exist).
--
-- Self-asserting: every check RAISEs on mismatch; a clean run returns one 'OK' row. BEGIN/ROLLBACK —
-- it deletes/inserts the operator's own plantillas inside the txn and rolls everything back.
--
-- HOW TO RUN (no local Docker): via the Supabase MCP execute_sql, or
--   psql "$DATABASE_URL" -f supabase/tests/plantillas_rules.sql

begin;

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
  v_op  uuid := current_setting('app.op', true)::uuid;
  v_id  uuid;
  v_n   text;
  v_b   text;
  v_cnt int;
begin
  -- Clean slate for this operator (rolled back).
  delete from public.plantillas where user_id = v_op;

  -- (1) cap of 4.
  perform public.crear_plantilla('Uno', 'b1');
  perform public.crear_plantilla('Dos', 'b2');
  perform public.crear_plantilla('Tres', 'b3');
  v_id := public.crear_plantilla('Cuatro', 'b4');
  begin
    perform public.crear_plantilla('Cinco', 'b5');
    raise exception 'RULE FAIL(1): 5th insert was allowed';
  exception when others then
    if sqlerrm <> 'Máximo 4 plantillas' then raise exception 'RULE FAIL(1): got %', sqlerrm; end if;
  end;

  -- (2) actualizar owned row.
  perform public.actualizar_plantilla(v_id, 'Cuatro-edit', 'b4-edit');
  select nombre, body into v_n, v_b from public.plantillas where id = v_id;
  if v_n <> 'Cuatro-edit' or v_b <> 'b4-edit' then raise exception 'RULE FAIL(2): not updated, got % / %', v_n, v_b; end if;
  begin
    perform public.actualizar_plantilla(gen_random_uuid(), 'X', 'y');
    raise exception 'RULE FAIL(2): expected Plantilla no encontrada';
  exception when others then
    if sqlerrm <> 'Plantilla no encontrada' then raise exception 'RULE FAIL(2): got %', sqlerrm; end if;
  end;

  -- (3) eliminar owned row (DELETE policy).
  perform public.eliminar_plantilla(v_id);
  if exists (select 1 from public.plantillas where id = v_id) then raise exception 'RULE FAIL(3): row not deleted'; end if;
  begin
    perform public.eliminar_plantilla(gen_random_uuid());
    raise exception 'RULE FAIL(3): expected Plantilla no encontrada';
  exception when others then
    if sqlerrm <> 'Plantilla no encontrada' then raise exception 'RULE FAIL(3): got %', sqlerrm; end if;
  end;

  -- (4) idempotent seed.
  delete from public.plantillas where user_id = v_op;
  perform public.sembrar_plantillas_default();
  select count(*) into v_cnt from public.plantillas where user_id = v_op;
  if v_cnt <> 4 then raise exception 'RULE FAIL(4): seed produced % rows', v_cnt; end if;
  perform public.sembrar_plantillas_default(); -- no-op
  select count(*) into v_cnt from public.plantillas where user_id = v_op;
  if v_cnt <> 4 then raise exception 'RULE FAIL(4): seed not idempotent, now % rows', v_cnt; end if;

  raise notice 'plantillas rules: cap, update, delete, idempotent-seed all hold';
end $$;

select 'plantillas rules: OK' as result;
rollback;
```

- [ ] **Step 2: Run the SQL test to verify it FAILS**

Load `ToolSearch` `select:mcp__supabase__execute_sql`, run the file's contents via `execute_sql`.
Expected: FAIL — `function public.crear_plantilla(text, text) does not exist`.

- [ ] **Step 3: Write the expand migration**

Create `supabase/migrations/20260602130000_plantillas_freeform_expand.sql`:

```sql
-- plantillas → freeform named templates: EXPAND step (expand/contract / parallel-change).
-- Non-destructive: add `nombre` (backfilled from clave), relax the fixed-key constraints, add the
-- missing DELETE policy + length guards. `clave` is kept NULLABLE so the existing getPlantillas/
-- getPlantilla readers keep compiling+running until their callers migrate; it is dropped in the
-- later contract migration (20260602140000) once nothing reads it. (ADR-0005: created as a migration.)

alter table public.plantillas add column nombre text;

update public.plantillas set nombre = case clave
  when 'recibo'       then 'Recibo'
  when 'recordatorio' then 'Recordatorio'
  when 'renovar'      then 'Renovación'
  when 'ultima'       then 'Última llamada'
  else initcap(clave)
end where nombre is null;

alter table public.plantillas alter column nombre set not null;

-- Relax the fixed-key model: names are free; clave is no longer required or unique.
-- (Confirm the auto-generated constraint name with \d public.plantillas before applying.)
alter table public.plantillas drop constraint plantillas_user_id_clave_key;
alter table public.plantillas alter column clave drop not null;

-- Defense-in-depth length guards (alongside the zod schema).
alter table public.plantillas
  add constraint plantillas_nombre_len_ck check (char_length(nombre) between 1 and 40),
  add constraint plantillas_body_len_ck   check (char_length(body)   between 1 and 1000);

-- The original migration shipped select/insert/update policies but NO delete policy; add it.
create policy "plantillas owner delete" on public.plantillas
  for delete to authenticated using ((select auth.uid()) = user_id);
```

- [ ] **Step 4: Write the RPCs migration**

Create `supabase/migrations/20260602130100_plantillas_rpcs.sql`. The seed bodies are the operator's CURRENT production bodies (pulled verbatim 2026-06-02), so seeding reproduces today's messages:

```sql
-- plantillas write seam (ADR-0005): four SECURITY INVOKER RPCs. crear enforces the cap-of-4
-- atomically (count-then-insert); actualizar/eliminar are owner-scoped single-row writes (RLS is the
-- boundary); sembrar seeds the canonical default set, idempotently. `set search_path to ''` keeps
-- them injection-safe and clears the function_search_path_mutable advisor. Single-operator usage makes
-- the count-then-insert race a non-issue (a partial unique index cannot express "≤ 4").

create or replace function public.crear_plantilla(p_nombre text, p_body text)
 returns uuid
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if (select count(*) from public.plantillas where user_id = v_uid) >= 4 then
    raise exception 'Máximo 4 plantillas';
  end if;
  insert into public.plantillas (user_id, nombre, body)
  values (v_uid, p_nombre, p_body)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.actualizar_plantilla(p_id uuid, p_nombre text, p_body text)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  update public.plantillas set nombre = p_nombre, body = p_body where id = p_id; -- RLS scopes to owner
  if not found then raise exception 'Plantilla no encontrada'; end if;
end;
$function$;

create or replace function public.eliminar_plantilla(p_id uuid)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  delete from public.plantillas where id = p_id; -- RLS scopes to owner
  if not found then raise exception 'Plantilla no encontrada'; end if;
end;
$function$;

create or replace function public.sembrar_plantillas_default()
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from public.plantillas where user_id = v_uid) then return; end if; -- idempotent
  insert into public.plantillas (user_id, nombre, body) values
    (v_uid, 'Recordatorio', $body$Hola {nombre} 👋

Aún te quedan {clases} de tu paquete (*{paquete}*), vence el {vence}.

¡Te esperamos en el bootcamp! 💪🔥
— {negocio}$body$),
    (v_uid, 'Recibo', $body$Hola {nombre} 👋

¡Gracias por tu compra en {negocio}! Tu paquete *{paquete}* queda activo hasta el {vence}.

Nos vemos en el bootcamp. 💪🔥$body$),
    (v_uid, 'Renovación', $body$Hola {nombre}, soy del coach de {negocio}.

Tu paquete vence en {dias} — ¿lo renovamos? 🔥

📦 *Paquetes disponibles:*
{precios}

Avísame cuál te conviene y te lo apartamos. 💪$body$),
    (v_uid, 'Última llamada', $body$Hola {nombre} 👋

Te aviso que solo te queda *1 clase* de tu paquete y vence el {vence}.

Si quieres seguir entrenando con nosotros, renovamos después de la próxima clase. 💪
— {negocio}$body$);
end;
$function$;

-- Least privilege: CREATE FUNCTION grants EXECUTE to public by default; revoke, then grant to authenticated.
revoke execute on function public.crear_plantilla(text, text)              from public;
revoke execute on function public.actualizar_plantilla(uuid, text, text)   from public;
revoke execute on function public.eliminar_plantilla(uuid)                 from public;
revoke execute on function public.sembrar_plantillas_default()             from public;
grant  execute on function public.crear_plantilla(text, text)              to authenticated;
grant  execute on function public.actualizar_plantilla(uuid, text, text)   to authenticated;
grant  execute on function public.eliminar_plantilla(uuid)                 to authenticated;
grant  execute on function public.sembrar_plantillas_default()             to authenticated;
```

- [ ] **Step 5: Apply both migrations to the remote project**

Load `ToolSearch` `select:mcp__supabase__apply_migration`. Apply, in order:
1. name `plantillas_freeform_expand` with the Step 3 body,
2. name `plantillas_rpcs` with the Step 4 body.

This is a non-destructive DB write (adds a column, relaxes constraints, adds functions). After applying, post a one-line confirmation of what changed (no blocking prompt — the destructive drop is Task 8).

- [ ] **Step 6: Run the SQL test to verify it PASSES**

Re-run `supabase/tests/plantillas_rules.sql` via `execute_sql`.
Expected: a single row `plantillas rules: OK`.

- [ ] **Step 7: Regenerate the TypeScript types**

Load `ToolSearch` `select:mcp__supabase__generate_typescript_types`, run it, overwrite `src/lib/supabase/database.types.ts`. Verify: `plantillas.Row` now has `nombre: string` and `clave: string | null`; the `Functions` block contains `crear_plantilla`, `actualizar_plantilla`, `eliminar_plantilla`, `sembrar_plantillas_default`.

- [ ] **Step 8: Typecheck + commit**

Run: `pnpm typecheck`
Expected: clean (the old `getPlantillas` still selects `clave, body`, which still exists — green).

```bash
git add supabase/migrations/20260602130000_plantillas_freeform_expand.sql supabase/migrations/20260602130100_plantillas_rpcs.sql supabase/tests/plantillas_rules.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): expand plantillas to freeform named templates + CRUD/seed RPCs"
```

---

## Task 2: DAL — listarPlantillas + CRUD writers + seed (TDD)

**Files:**
- Create: `src/lib/data/plantillas.test.ts`
- Modify: `src/lib/data/plantillas.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/plantillas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  actualizarPlantilla,
  crearPlantilla,
  eliminarPlantilla,
  listarPlantillas,
  sembrarPlantillasDefault,
} from "./plantillas";
import type { SupabaseServer } from "@/lib/supabase/server";

/**
 * The seam: every plantillas write takes an injectable client (ADR-0001), so the orchestration —
 * zod validation, the auth gate, and the exact RPC payload — is testable with a hand-rolled fake.
 * The RPC behavior itself (cap, ownership, idempotent seed) is proven against the real schema in
 * supabase/tests/plantillas_rules.sql (ADR-0005).
 */
interface FakeClient {
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  client: SupabaseServer;
}

function makeFake(opts: { sub?: string | null; rows?: unknown[] } = {}): FakeClient {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const rows = opts.rows ?? [];
  const client = {
    auth: { getClaims: async () => ({ data: sub ? { claims: { sub } } : null }) },
    from: () => {
      const b = {
        select: () => b,
        order: () => b,
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
      };
      return b;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: name === "crear_plantilla" ? "new-id" : null, error: null });
    },
  };
  return { rpcCalls, client: client as unknown as SupabaseServer };
}

describe("plantillas DAL — write orchestration (injected fake)", () => {
  it("listarPlantillas maps rows → PlantillaDTO[]", async () => {
    const fake = makeFake({ rows: [{ id: "t1", nombre: "Recibo", body: "Hola {nombre}" }] });
    const list = await listarPlantillas(fake.client);
    expect(list).toEqual([{ id: "t1", nombre: "Recibo", body: "Hola {nombre}" }]);
  });

  it("crearPlantilla sends the exact crear_plantilla payload", async () => {
    const fake = makeFake();
    await crearPlantilla({ nombre: "Bienvenida", body: "Hola {nombre}" }, fake.client);
    expect(fake.rpcCalls).toEqual([{ name: "crear_plantilla", args: { p_nombre: "Bienvenida", p_body: "Hola {nombre}" } }]);
  });

  it("actualizarPlantilla sends the exact actualizar_plantilla payload", async () => {
    const fake = makeFake();
    await actualizarPlantilla(
      { id: "11111111-1111-4111-8111-111111111111", nombre: "Recibo", body: "x" },
      fake.client,
    );
    expect(fake.rpcCalls[0]).toEqual({
      name: "actualizar_plantilla",
      args: { p_id: "11111111-1111-4111-8111-111111111111", p_nombre: "Recibo", p_body: "x" },
    });
  });

  it("eliminarPlantilla sends the exact eliminar_plantilla payload", async () => {
    const fake = makeFake();
    await eliminarPlantilla({ id: "11111111-1111-4111-8111-111111111111" }, fake.client);
    expect(fake.rpcCalls[0]).toEqual({ name: "eliminar_plantilla", args: { p_id: "11111111-1111-4111-8111-111111111111" } });
  });

  it("sembrarPlantillasDefault calls the seed RPC", async () => {
    const fake = makeFake();
    await sembrarPlantillasDefault(fake.client);
    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0].name).toBe("sembrar_plantillas_default");
  });

  it("rejects an empty nombre (zod) before any write", async () => {
    const fake = makeFake();
    await expect(crearPlantilla({ nombre: "  ", body: "x" }, fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("rejects an over-length body (zod) before any write", async () => {
    const fake = makeFake();
    await expect(crearPlantilla({ nombre: "X", body: "a".repeat(1001) }, fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("throws 'No autenticado' when getClaims returns no sub", async () => {
    const fake = makeFake({ sub: null });
    await expect(crearPlantilla({ nombre: "X", body: "y" }, fake.client)).rejects.toThrow("No autenticado");
    expect(fake.rpcCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

Run: `pnpm test plantillas`
Expected: FAIL — `listarPlantillas`/`crearPlantilla`/etc. are not exported.

- [ ] **Step 3: Implement the new DAL surface**

Replace the entire contents of `src/lib/data/plantillas.ts` with (the old `getPlantillas`/`getPlantilla` are KEPT for now — the contract task removes them — but updated to also select `id, nombre`):

```ts
import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient, type SupabaseServer } from "@/lib/supabase/server";

import { requireOperator } from "./_auth";

/** A stored WhatsApp template (freeform, named). */
export interface PlantillaDTO {
  id: string;
  nombre: string;
  body: string;
}

/** A template rendered for a specific send context (token-substituted text). */
export interface MensajeDTO {
  id: string;
  nombre: string;
  texto: string;
}

/** WhatsApp template keys — LEGACY, removed in the contract migration once readers are gone. */
export type PlantillaClave = "recibo" | "recordatorio" | "renovar" | "ultima";

/** The operator's templates, newest-first. RLS scopes rows to (select auth.uid()). Memoized per request. */
export const listarPlantillas = cache(async (client?: SupabaseServer): Promise<PlantillaDTO[]> => {
  const supabase = client ?? (await createClient());
  const { data } = await supabase.from("plantillas").select("id, nombre, body").order("created_at");
  return (data ?? []).map((p) => ({ id: p.id, nombre: p.nombre, body: p.body }));
});

/** LEGACY reader (kept until the contract task). Bodies keyed by clave. */
export const getPlantillas = cache(async (client?: SupabaseServer): Promise<Record<string, string>> => {
  const supabase = client ?? (await createClient());
  const { data } = await supabase.from("plantillas").select("clave, body");
  const map: Record<string, string> = {};
  for (const p of data ?? []) if (p.clave) map[p.clave] = p.body;
  return map;
});

/** LEGACY reader (kept until the contract task). */
export async function getPlantilla(clave: PlantillaClave, client?: SupabaseServer): Promise<string> {
  const all = await getPlantillas(client);
  return all[clave] ?? "";
}

const nombreSchema = z.string().trim().min(1).max(40);
const bodySchema = z.string().trim().min(1).max(1000);

export const crearPlantillaSchema = z.object({ nombre: nombreSchema, body: bodySchema });
export const actualizarPlantillaSchema = z.object({ id: z.string().uuid(), nombre: nombreSchema, body: bodySchema });
export const eliminarPlantillaSchema = z.object({ id: z.string().uuid() });

/** Create a template. The crear_plantilla RPC enforces the cap-of-4 atomically. Injectable (ADR-0001). */
export async function crearPlantilla(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = crearPlantillaSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { error } = await supabase.rpc("crear_plantilla", { p_nombre: input.nombre, p_body: input.body });
  if (error) throw new Error("No se pudo crear la plantilla");
}

/** Edit a template (owner-scoped via RLS). Injectable (ADR-0001). */
export async function actualizarPlantilla(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = actualizarPlantillaSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { error } = await supabase.rpc("actualizar_plantilla", { p_id: input.id, p_nombre: input.nombre, p_body: input.body });
  if (error) throw new Error("No se pudo actualizar la plantilla");
}

/** Delete a template (owner-scoped via RLS). Injectable (ADR-0001). */
export async function eliminarPlantilla(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = eliminarPlantillaSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { error } = await supabase.rpc("eliminar_plantilla", { p_id: input.id });
  if (error) throw new Error("No se pudo eliminar la plantilla");
}

/** Seed the canonical default set if the operator has none (idempotent in the RPC). Injectable. */
export async function sembrarPlantillasDefault(client?: SupabaseServer): Promise<void> {
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  // sembrar_plantillas_default takes no args (Args: never) — call without a payload.
  const { error } = await supabase.rpc("sembrar_plantillas_default");
  if (error) throw new Error("No se pudieron crear las plantillas predeterminadas");
}
```

- [ ] **Step 4: Run the test to verify it PASSES**

Run: `pnpm test plantillas`
Expected: PASS (8 tests).

- [ ] **Step 5: Full typecheck + tests**

Run: `pnpm typecheck` then `pnpm test`
Expected: both clean (legacy readers still compile; existing consumers untouched).

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/plantillas.ts src/lib/data/plantillas.test.ts
git commit -m "feat(data): listarPlantillas + CRUD/seed writers (injectable, RPC-backed)"
```

---

## Task 3: Server actions (cuenta)

**Files:**
- Create: `src/app/(app)/cuenta/actions.ts`

- [ ] **Step 1: Create the actions file**

Create `src/app/(app)/cuenta/actions.ts`:

```ts
"use server";

import {
  actualizarPlantilla,
  crearPlantilla,
  eliminarPlantilla,
  sembrarPlantillasDefault,
} from "@/lib/data/plantillas";

/** Thin write seams over the DAL. (app) reads are dynamic (cookie-bound), so the client
 *  router.refresh()es after a successful write — no cache invalidation needed (matches togglePaseAction). */
export async function crearPlantillaAction(raw: unknown): Promise<void> {
  return crearPlantilla(raw);
}

export async function actualizarPlantillaAction(raw: unknown): Promise<void> {
  return actualizarPlantilla(raw);
}

export async function eliminarPlantillaAction(raw: unknown): Promise<void> {
  return eliminarPlantilla(raw);
}

export async function sembrarPlantillasDefaultAction(): Promise<void> {
  return sembrarPlantillasDefault();
}
```

- [ ] **Step 2: Typecheck + lint + commit**

Run: `pnpm typecheck` then `pnpm lint`
Expected: clean (`src/app` → `src/lib` is the allowed direction).

```bash
git add "src/app/(app)/cuenta/actions.ts"
git commit -m "feat(actions): plantillas CRUD + seed action wrappers"
```

---

## Task 4: UI kit — Textarea primitive + MensajePicker

**Files:**
- Modify: `src/components/forge/input.tsx`
- Create: `src/components/forge/mensaje-picker.tsx`

> The implementing subagent SHOULD invoke the **frontend-design** skill for the visual polish of `MensajePicker` and `Textarea`, preserving the wiring/contract below. Both reuse existing kit tokens, so the baseline is already on-brand.

- [ ] **Step 1: Add a `Textarea` to the kit**

Open `src/components/forge/input.tsx` and read the existing `Input` for its exact class/style tokens (border, background, padding, focus ring). Append a `Textarea` that mirrors them — a controlled multiline field whose `onChange` emits the **string value**:

```tsx
export function Textarea({
  placeholder,
  value,
  onChange,
  rows = 5,
  autoFocus,
  className,
  style,
}: {
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      rows={rows}
      autoFocus={autoFocus}
      className={className}
      style={{
        width: "100%",
        resize: "vertical",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        color: "var(--fg)",
        padding: "12px 14px",
        fontSize: 14,
        lineHeight: 1.5,
        fontFamily: "inherit",
        ...style,
      }}
    />
  );
}
```

> Match the real `Input` token names found in the file (e.g. if it uses `--line` vs `--silver-dim`, a className instead of inline styles, etc.). The contract that matters: controlled `value` + `onChange(string)`.

- [ ] **Step 2: Create the MensajePicker**

Create `src/components/forge/mensaje-picker.tsx` — presentational only; imports nothing from `domain`/`lib`:

```tsx
"use client";

import * as React from "react";
import { Sheet } from "./sheet";
import { Button, Eyebrow, H1 } from "./ui";

export interface MensajePickerItem {
  id: string;
  nombre: string;
  texto: string;
}

/** A send-template picker. The caller owns the actual send (onEnviar) so this stays free of
 *  domain/lib imports (waLink lives in the sector). Lists the operator's templates, previews the
 *  selected one rendered for the current context, and hands the choice back. */
export function MensajePicker({
  open,
  onClose,
  titulo = "ENVIAR MENSAJE",
  mensajes,
  onEnviar,
}: {
  open: boolean;
  onClose: () => void;
  titulo?: string;
  mensajes: MensajePickerItem[];
  onEnviar: (m: MensajePickerItem) => void;
}) {
  const [selId, setSelId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed selection to the first template on open
      setSelId(mensajes[0]?.id ?? null);
    }
  }, [open, mensajes]);

  const sel = mensajes.find((m) => m.id === selId) ?? null;

  return (
    <Sheet open={open} onClose={onClose}>
      <div style={{ padding: "8px 22px 14px" }}>
        <Eyebrow color="var(--gold)">PLANTILLA</Eyebrow>
        <H1 size={22} style={{ marginTop: 6 }}>{titulo}</H1>
      </div>

      {mensajes.length === 0 ? (
        <div style={{ padding: "0 22px 24px", color: "var(--muted)", fontSize: 13 }}>
          No tienes plantillas. Créalas en Cuenta → Plantillas de WhatsApp.
        </div>
      ) : (
        <>
          <div className="flex flex-col" style={{ padding: "0 16px", gap: 8 }}>
            {mensajes.map((m) => {
              const active = m.id === selId;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelId(m.id)}
                  className="uppercase font-bold"
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    fontSize: 12,
                    letterSpacing: 0.6,
                    cursor: "pointer",
                    color: active ? "var(--fg)" : "var(--muted)",
                    background: active ? "var(--surface)" : "transparent",
                    border: `1px solid ${active ? "var(--gold)" : "var(--line)"}`,
                  }}
                >
                  {m.nombre}
                </button>
              );
            })}
          </div>

          <div style={{ padding: "16px 22px 0" }}>
            <Eyebrow>VISTA PREVIA</Eyebrow>
            <div
              style={{
                marginTop: 8,
                padding: "12px 14px",
                background: "var(--surface)",
                border: "1px solid var(--line)",
                whiteSpace: "pre-wrap",
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--fg)",
              }}
            >
              {sel?.texto}
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--line)", margin: "20px 0 0", padding: "20px 16px 4px" }}>
            <Button variant="wa" size="lg" full icon="wa" disabled={!sel} onClick={() => sel && onEnviar(sel)}>
              ENVIAR POR WHATSAPP
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 3: Typecheck + lint + commit**

Run: `pnpm typecheck` then `pnpm lint`
Expected: clean (no `domain`/`lib` import added to the kit).

```bash
git add src/components/forge/input.tsx src/components/forge/mensaje-picker.tsx
git commit -m "feat(ui): Textarea primitive + presentational MensajePicker"
```

---

## Task 5: Client-message path → mensajes + wire cliente-detalle (end-to-end green)

**Files:**
- Modify: `src/lib/data/derive.ts`
- Modify: `src/lib/data/derive.test.ts`
- Modify: `src/lib/data/clientes.ts`
- Modify: `src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx`

- [ ] **Step 1: Update the derive.test.ts expectations (red first)**

In `src/lib/data/derive.test.ts`:

1. Replace the 6th positional argument to **every** `shapeFicha(...)` call from `""` to `[]` (lines 177, 192, 202, 204, 207, 276, 284, 291, 298, 309, 324, 331, 337).
2. Replace the recordatorio test (lines 211–214) with — keeping the existing `body` const on line 212:

```ts
    const f = shapeFicha(clienteRow, [], [], HOY, HOY_ISO, [{ id: "t1", nombre: "Recordatorio", body }], "FORGE GYM", 0);
    expect(f.mensajes).toEqual([
      { id: "t1", nombre: "Recordatorio", texto: "Hola Andrea, te quedan 5 clases de tu 8 clases (vence 16 jun). — FORGE GYM" },
    ]);
```

Run: `pnpm test derive`
Expected: FAIL — `mensajes` not on the result / `shapeFicha` arg type mismatch.

- [ ] **Step 2: Update `shapeFicha` in derive.ts**

In `src/lib/data/derive.ts`:

1. Add to the imports: `import type { PlantillaContext } from "@/domain/types";` (if not already imported) and `import type { MensajeDTO, PlantillaDTO } from "./plantillas";`.
2. In the `FichaDerivada` interface (line 203) replace `waText: string;` with `mensajes: MensajeDTO[];`.
3. In the signature (line 221) replace `recordatorioBody: string,` with `plantillas: PlantillaDTO[],`.
4. Replace the `const waText = renderPlantilla(recordatorioBody, { … });` block (lines 279–285) with:

```ts
  const ctx: PlantillaContext = {
    nombre: firstName(c.nombre),
    clases: cliente.clasesRest === "ilimitado" ? "clases ilimitadas" : `${cliente.clasesRest} clases`,
    paquete: cliente.paquete,
    vence: cliente.venceDisplay,
    negocio,
  };
  const mensajes: MensajeDTO[] = plantillas.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    texto: renderPlantilla(p.body, ctx),
  }));
```

5. In the returned object (line 300) replace `waText,` with `mensajes,`.

- [ ] **Step 3: Update `getClienteFicha` in clientes.ts**

In `src/lib/data/clientes.ts`:

1. Change the import `import { getPlantilla } from "./plantillas";` → `import { listarPlantillas } from "./plantillas";`.
2. In the `Promise.all` (line 165) replace the last element `getPlantilla("recordatorio", supabase)` with `listarPlantillas(supabase)`, and rename the destructured `recordatorioBody` to `plantillas`.
3. In the `shapeFicha(...)` call (lines 217–224) replace the `recordatorioBody` argument with `plantillas`.

- [ ] **Step 4: Wire the picker into cliente-detalle.tsx**

In `src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx`:

1. Add imports:

```tsx
import { MensajePicker } from "@/components/forge/mensaje-picker";
```

2. Add state next to the existing `editOpen` state:

```tsx
  const [msgOpen, setMsgOpen] = React.useState(false);
```

3. Replace the handler (line 55) `const mensaje = () => window.open(waLink(c.tel, ficha.waText), "_blank");` with:

```tsx
  const mensaje = () => setMsgOpen(true);
```

4. Render the picker — add immediately after the `<EditarClienteSheet … />` element:

```tsx
      <MensajePicker
        open={msgOpen}
        onClose={() => setMsgOpen(false)}
        mensajes={ficha.mensajes}
        onEnviar={(m) => {
          window.open(waLink(c.tel, m.texto), "_blank");
          setMsgOpen(false);
        }}
      />
```

(`waLink` is already imported in this file; the existing "Mandar mensaje" button already calls `mensaje`.)

- [ ] **Step 5: Typecheck, lint, tests**

Run: `pnpm typecheck` then `pnpm lint` then `pnpm test`
Expected: all clean; `derive` tests pass with the `mensajes` shape.

- [ ] **Step 6: Manual verification**

Use `/run` (or `/verify`): open a client profile, tap "Mandar mensaje", confirm the picker lists templates, switching updates the preview, and "Enviar por WhatsApp" opens wa.me with the selected rendered text.

- [ ] **Step 7: Commit**

```bash
git add src/lib/data/derive.ts src/lib/data/derive.test.ts src/lib/data/clientes.ts "src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx"
git commit -m "feat: template picker on the client message (mensajes[] + MensajePicker)"
```

---

## Task 6: Receipt path → mensajes + wire vender (end-to-end green)

**Files:**
- Modify: `src/lib/data/ventas.ts`
- Modify: `src/lib/data/ventas.test.ts`
- Modify: `src/app/(app)/vender/_components/vender.tsx`

- [ ] **Step 1: Update ventas.test.ts fixtures (red first)**

In `src/lib/data/ventas.test.ts`:

1. Update the `FakeRows` type's `plantillas` field to `{ id: string; nombre: string; body: string }[]`.
2. Replace the three plantillas fixtures (lines 112, 138, 152) `{ clave: "recibo", body: "…" }` → `{ id: "t1", nombre: "Recibo", body: "…" }` (keep each `body` value as-is).

Run: `pnpm test ventas`
Expected: FAIL — type/shape mismatch on the plantillas fixture.

- [ ] **Step 2: Update `crearVenta` in ventas.ts**

In `src/lib/data/ventas.ts`:

1. Change the import `import { getPlantilla } from "./plantillas";` → `import { listarPlantillas, type MensajeDTO } from "./plantillas";`, and ensure `import type { PlantillaContext } from "@/domain/types";` is present.
2. In `VentaResult` (line 56) replace `waText: string;` with `mensajes: MensajeDTO[];`.
3. In the `Promise.all` (line 166) replace `getPlantilla("recibo", supabase)` with `listarPlantillas(supabase)`, renaming the destructured `reciboBody` to `plantillas`.
4. Replace the `const waText = renderPlantilla(reciboBody, { … });` block (lines 185–190) with:

```ts
  const ctx: PlantillaContext = {
    nombre: firstName(nombre),
    paquete: paq.nombre,
    vence: venceDisplay,
    negocio,
  };
  const mensajes: MensajeDTO[] = plantillas.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    texto: renderPlantilla(p.body, ctx),
  }));
```

5. In the returned object (line 214) replace `waText,` with `mensajes,`.

- [ ] **Step 3: Wire the picker into vender.tsx**

In `src/app/(app)/vender/_components/vender.tsx`:

1. Add import:

```tsx
import { MensajePicker } from "@/components/forge/mensaje-picker";
```

2. Change the result destructure (line 445): remove `waText` and rely on `result.mensajes`. Add state and replace the `wa()` handler (line 453):

```tsx
  const [msgOpen, setMsgOpen] = React.useState(false);
  const wa = () => setMsgOpen(true);
```

3. Render the picker once in the receipt view (near the "ENVIAR POR WHATSAPP" button's container):

```tsx
        <MensajePicker
          open={msgOpen}
          onClose={() => setMsgOpen(false)}
          titulo="ENVIAR RECIBO"
          mensajes={result.mensajes}
          onEnviar={(m) => {
            window.open(waLink(c.tel, m.texto), "_blank");
            setMsgOpen(false);
          }}
        />
```

(`waLink`, `c` (`result.cliente`), and React are already in scope; the button already calls `wa`.)

- [ ] **Step 4: Typecheck, lint, tests**

Run: `pnpm typecheck` then `pnpm lint` then `pnpm test`
Expected: all clean; `ventas` tests pass.

- [ ] **Step 5: Manual verification**

Use `/run` (or `/verify`): complete a sale, on the receipt tap "Enviar por WhatsApp", confirm the picker lists templates and sends the chosen rendered text.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/ventas.ts src/lib/data/ventas.test.ts "src/app/(app)/vender/_components/vender.tsx"
git commit -m "feat: template picker on the post-sale receipt (mensajes[] + MensajePicker)"
```

---

## Task 7: Cuenta — template manager + editor

**Files:**
- Modify: `src/app/(app)/cuenta/page.tsx`
- Modify: `src/app/(app)/cuenta/_components/cuenta.tsx`
- Create: `src/app/(app)/cuenta/_components/plantilla-editor.tsx`
- Create: `src/app/(app)/cuenta/_components/plantillas-sheet.tsx`

> The implementing subagent SHOULD invoke the **frontend-design** skill for the visual polish of both new components, preserving the wiring/contract.

- [ ] **Step 1: Switch the page to `listarPlantillas`**

In `src/app/(app)/cuenta/page.tsx`:

1. Change `import { getPlantillas } from "@/lib/data/plantillas";` → `import { listarPlantillas } from "@/lib/data/plantillas";`.
2. In `Promise.all`, replace `getPlantillas()` with `listarPlantillas()` (rename destructured `plantillas`).
3. Remove `const plantillasCount = Object.keys(plantillas).length;`.
4. In `<CuentaScreen … />` replace `plantillasCount={plantillasCount}` with `plantillas={plantillas}`.

- [ ] **Step 2: Create the editor pane**

Create `src/app/(app)/cuenta/_components/plantilla-editor.tsx`:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { forgeToast } from "@/components/forge/toaster";
import { Button, Eyebrow, H1, Input } from "@/components/forge/ui";
import { Textarea } from "@/components/forge/input";
import { renderPlantilla } from "@/domain/rules";
import type { PlantillaContext } from "@/domain/types";
import type { PlantillaDTO } from "@/lib/data/plantillas";
import { actualizarPlantillaAction, crearPlantillaAction } from "../actions";

const TOKENS = ["nombre", "clases", "paquete", "vence", "dias", "precios", "datos_pago", "negocio"] as const;

/** A live-preview sample context so the operator sees how {tokens} resolve. */
function sampleCtx(negocio: string): PlantillaContext {
  return {
    nombre: "Andrea",
    clases: "5 clases",
    paquete: "Ilimitado",
    vence: "16 jun",
    dias: "3 días",
    precios: "• 1 mes — $600\n• 8 clases — $450",
    datos_pago: "BBVA 1234 5678",
    negocio: negocio || "FORGE",
  };
}

export function PlantillaEditor({
  plantilla,
  negocio,
  onDone,
  onCancel,
}: {
  plantilla?: PlantillaDTO;
  negocio: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const isEdit = !!plantilla;
  const [nombre, setNombre] = React.useState(plantilla?.nombre ?? "");
  const [body, setBody] = React.useState(plantilla?.body ?? "");
  const [saving, setSaving] = React.useState(false);
  const bodyRef = React.useRef<HTMLTextAreaElement | null>(null);

  const valido = nombre.trim().length >= 1 && nombre.trim().length <= 40 && body.trim().length >= 1 && body.trim().length <= 1000;
  const dirty = !isEdit || nombre !== plantilla!.nombre || body !== plantilla!.body;
  const canSave = valido && dirty && !saving;

  const insertToken = (t: string) => {
    const el = bodyRef.current;
    const tok = `{${t}}`;
    if (!el) { setBody((b) => b + tok); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + tok + body.slice(end));
  };

  const guardar = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isEdit) await actualizarPlantillaAction({ id: plantilla!.id, nombre, body });
      else await crearPlantillaAction({ nombre, body });
      forgeToast({ tone: "success", title: isEdit ? "Plantilla actualizada" : "Plantilla creada", body: nombre.trim() });
      router.refresh();
      onDone();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo guardar", body: "Intenta de nuevo." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center" style={{ gap: 10, padding: "8px 22px 14px" }}>
        <button onClick={onCancel} aria-label="Atrás" className="border border-line bg-surface" style={{ width: 34, height: 34, cursor: "pointer" }}>‹</button>
        <div>
          <Eyebrow color="var(--gold)">{isEdit ? "EDITAR" : "NUEVA"} PLANTILLA</Eyebrow>
          <H1 size={20} style={{ marginTop: 4 }}>{nombre.trim() || "Sin nombre"}</H1>
        </div>
      </div>

      <div className="flex flex-col" style={{ padding: "0 16px", gap: 18 }}>
        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>NOMBRE</Eyebrow>
          <Input placeholder="Ej. Bienvenida" value={nombre} onChange={setNombre} autoFocus />
        </label>

        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>MENSAJE</Eyebrow>
          <textarea
            ref={bodyRef}
            placeholder="Hola {nombre}…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            style={{ width: "100%", resize: "vertical", background: "var(--surface)", border: "1px solid var(--line)", color: "var(--fg)", padding: "12px 14px", fontSize: 14, lineHeight: 1.5, fontFamily: "inherit" }}
          />
        </label>

        <div className="flex" style={{ flexWrap: "wrap", gap: 6 }}>
          {TOKENS.map((t) => (
            <button key={t} onClick={() => insertToken(t)} style={{ padding: "5px 9px", fontSize: 11, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--muted)", cursor: "pointer" }}>
              {`{${t}}`}
            </button>
          ))}
        </div>

        <div>
          <Eyebrow>VISTA PREVIA</Eyebrow>
          <div style={{ marginTop: 8, padding: "12px 14px", background: "var(--surface)", border: "1px solid var(--line)", whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5, color: "var(--fg)" }}>
            {renderPlantilla(body, sampleCtx(negocio))}
          </div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--line)", margin: "20px 0 0", padding: "20px 16px 4px" }}>
        <Button variant="primary" size="lg" full icon="check" disabled={!canSave} onClick={guardar}>
          {saving ? "GUARDANDO…" : isEdit ? "GUARDAR" : "CREAR"}
        </Button>
      </div>
    </div>
  );
}
```

> Note: a raw `<textarea>` is used inline here for the cursor-insert `ref`; the kit `Textarea` from Task 4 is the styling reference. If `Textarea` exposes a ref, prefer it. (frontend-design may consolidate.)

- [ ] **Step 3: Create the manager Sheet**

Create `src/app/(app)/cuenta/_components/plantillas-sheet.tsx`:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/forge/sheet";
import { Icon } from "@/components/forge/icon";
import { forgeToast } from "@/components/forge/toaster";
import { Button, Eyebrow, H1 } from "@/components/forge/ui";
import type { PlantillaDTO } from "@/lib/data/plantillas";
import { eliminarPlantillaAction, sembrarPlantillasDefaultAction } from "../actions";
import { PlantillaEditor } from "./plantilla-editor";

type View = { mode: "list" } | { mode: "edit"; plantilla: PlantillaDTO } | { mode: "new" };

export function PlantillasSheet({
  open,
  onClose,
  plantillas,
  negocio,
}: {
  open: boolean;
  onClose: () => void;
  plantillas: PlantillaDTO[];
  negocio: string;
}) {
  const router = useRouter();
  const [view, setView] = React.useState<View>({ mode: "list" });
  const seededRef = React.useRef(false);

  // Reset to the list each time the sheet opens; auto-seed defaults if the operator has none.
  React.useEffect(() => {
    if (!open) { seededRef.current = false; return; }
    setView({ mode: "list" });
    if (plantillas.length === 0 && !seededRef.current) {
      seededRef.current = true;
      sembrarPlantillasDefaultAction()
        .then(() => router.refresh())
        .catch(() => forgeToast({ tone: "warning", title: "No se pudieron crear las predeterminadas" }));
    }
  }, [open, plantillas.length, router]);

  const borrar = async (p: PlantillaDTO) => {
    if (!window.confirm(`¿Eliminar "${p.nombre}"?`)) return;
    try {
      await eliminarPlantillaAction({ id: p.id });
      forgeToast({ tone: "success", title: "Plantilla eliminada", body: p.nombre });
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo eliminar", body: "Intenta de nuevo." });
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      {view.mode === "list" ? (
        <>
          <div style={{ padding: "8px 22px 14px" }}>
            <Eyebrow color="var(--gold)">{plantillas.length} de 4</Eyebrow>
            <H1 size={22} style={{ marginTop: 6 }}>PLANTILLAS</H1>
          </div>

          <div className="flex flex-col" style={{ padding: "0 16px", gap: 8 }}>
            {plantillas.map((p) => (
              <div key={p.id} className="flex items-center" style={{ gap: 8, border: "1px solid var(--line)", background: "var(--surface)", padding: "10px 12px" }}>
                <button onClick={() => setView({ mode: "edit", plantilla: p })} className="min-w-0 flex-1" style={{ textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}>
                  <div className="uppercase font-bold" style={{ fontSize: 12, letterSpacing: 0.6, color: "var(--fg)" }}>{p.nombre}</div>
                  <div style={{ marginTop: 3, fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.body}</div>
                </button>
                <button onClick={() => borrar(p)} aria-label="Eliminar" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 6 }}>
                  <Icon name="trash" size={15} color="var(--muted)" />
                </button>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid var(--line)", margin: "20px 0 0", padding: "20px 16px 4px" }}>
            <Button variant="secondary" size="lg" full icon="plus" disabled={plantillas.length >= 4} onClick={() => setView({ mode: "new" })}>
              {plantillas.length >= 4 ? "MÁXIMO 4 PLANTILLAS" : "AGREGAR PLANTILLA"}
            </Button>
          </div>
        </>
      ) : (
        <PlantillaEditor
          plantilla={view.mode === "edit" ? view.plantilla : undefined}
          negocio={negocio}
          onDone={() => setView({ mode: "list" })}
          onCancel={() => setView({ mode: "list" })}
        />
      )}
    </Sheet>
  );
}
```

- [ ] **Step 4: Wire the manager into cuenta.tsx**

In `src/app/(app)/cuenta/_components/cuenta.tsx`:

1. Add imports:

```tsx
import * as React from "react";
import type { PlantillaDTO } from "@/lib/data/plantillas";
import { PlantillasSheet } from "./plantillas-sheet";
```

2. In `CuentaScreenProps` replace `plantillasCount: number;` with `plantillas: PlantillaDTO[];`.
3. Destructure `plantillas` from props; add open state at the top of the component body:

```tsx
  const [plantillasOpen, setPlantillasOpen] = React.useState(false);
```

4. In the `ajustes` array, change the "PLANTILLAS DE WHATSAPP" entry's `sub` and `onClick`:

```tsx
    {
      icon: "wa",
      label: "PLANTILLAS DE WHATSAPP",
      sub: `${plantillas.length} configurada${plantillas.length === 1 ? "" : "s"}`,
      onClick: () => setPlantillasOpen(true),
    },
```

5. Render the sheet before the component's closing tag (alongside other top-level JSX):

```tsx
      <PlantillasSheet
        open={plantillasOpen}
        onClose={() => setPlantillasOpen(false)}
        plantillas={plantillas}
        negocio={perfil?.negocio ?? ""}
      />
```

- [ ] **Step 5: Typecheck, lint, tests**

Run: `pnpm typecheck` then `pnpm lint` then `pnpm test`
Expected: all clean. (`getPlantillas` is now unused everywhere — that's fine; it's removed in Task 8.)

- [ ] **Step 6: Manual verification**

Use `/run` (or `/verify`): in Cuenta, tap "Plantillas de WhatsApp" → manager lists templates; create one, edit one (token chips + preview), delete one; confirm the cap disables "Agregar" at 4 and the count on the card updates after refresh.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/cuenta/page.tsx" "src/app/(app)/cuenta/_components/cuenta.tsx" "src/app/(app)/cuenta/_components/plantilla-editor.tsx" "src/app/(app)/cuenta/_components/plantillas-sheet.tsx"
git commit -m "feat(ui): WhatsApp templates manager + editor in cuenta"
```

---

## Task 8: Contract — remove legacy readers + drop the `clave` column

**Files:**
- Modify: `src/lib/data/plantillas.ts`
- Create: `supabase/migrations/20260602140000_plantillas_drop_clave.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerate)

- [ ] **Step 1: Verify nothing reads `clave` / the legacy DAL**

Run a Grep for `getPlantilla\b|getPlantillas\b|PlantillaClave|\.clave` across `src/` (excluding `database.types.ts`).
Expected: the only hits are the definitions in `src/lib/data/plantillas.ts`. If any consumer remains, migrate it before proceeding.

- [ ] **Step 2: Remove the legacy readers from plantillas.ts**

In `src/lib/data/plantillas.ts`, delete `PlantillaClave`, `getPlantillas`, and `getPlantilla` (the three legacy exports). Leave `listarPlantillas` + the writers + the DTO types.

- [ ] **Step 3: Write the contract (drop) migration**

Create `supabase/migrations/20260602140000_plantillas_drop_clave.sql`:

```sql
-- plantillas → freeform named templates: CONTRACT step. The `clave` column is now unused (all
-- readers migrated to listarPlantillas/nombre). Its semantic content was backfilled into `nombre`
-- by 20260602130000. Safe to drop. (ADR-0005: created as a migration.)
alter table public.plantillas drop column clave;
```

- [ ] **Step 4: Apply the contract migration**

This DROPs a column on the live DB. It is non-destructive to behavior (the column is provably unused after Step 1's grep) but irreversible at the column level. Post a one-line heads-up, then apply via `mcp__supabase__apply_migration` name `plantillas_drop_clave`.

- [ ] **Step 5: Regenerate types**

Run `mcp__supabase__generate_typescript_types`, overwrite `src/lib/supabase/database.types.ts`. Verify `plantillas.Row` no longer has `clave`.

- [ ] **Step 6: Typecheck, lint, tests**

Run: `pnpm typecheck` then `pnpm lint` then `pnpm test`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/data/plantillas.ts supabase/migrations/20260602140000_plantillas_drop_clave.sql src/lib/supabase/database.types.ts
git commit -m "refactor(db): drop legacy plantillas clave column + readers (contract step)"
```

---

## Final gate (per user directive — run before declaring done)

After Task 8, run both gates and do NOT declare the feature complete until each is 100% yes; otherwise re-structure, re-plan, and re-check:

1. **Elegance Check** — is every change the most elegant approach overall?
2. **Senior Dev Approval** — would a senior dev approve these changes?

Then optionally run `/code-review` on the branch diff.

---

## Self-review (author)

- **Spec coverage:** freeform named templates cap 4 ✓ (Task 1 expand + `crear_plantilla` cap; UI disables at 4); CRUD ✓ (Tasks 1–3); manager + editor with token chips + preview ✓ (Task 7); picker at client message ✓ (Task 5) + receipt ✓ (Task 6); auto-seed when empty ✓ (Task 1 RPC + Task 7 seed-on-open); missing DELETE policy added ✓ (Task 1); SQL rule test ✓ (Task 1); DAL unit tests ✓ (Task 2); Phase 2 image **not** built ✓.
- **Elegance/senior refinements vs spec:** expand/contract migration (every task stays green; the spec implied a single reshape) — adopted because the 14 `shapeFicha` call sites + three legacy-reader consumers make a single destructive migration leave a multi-commit red window. Picker kept domain/lib-free via an `onEnviar` callback (kit purity). Manager uses a single Sheet with an internal list/edit view (avoids nested-portal focus issues the repo already had to shield).
- **Placeholder scan:** none — every step has concrete code/SQL/commands. Seed bodies are the real production strings (pulled 2026-06-02). The only `<…>`-style note is the constraint-name confirmation in Task 1 Step 3 (an explicit verify-then-apply instruction, not a gap).
- **Type consistency:** `PlantillaDTO {id,nombre,body}` and `MensajeDTO {id,nombre,texto}` (Task 2) are used identically in `derive.ts`/`ventas.ts` (Tasks 5–6) and structurally by `MensajePickerItem` (Task 4). RPC arg keys `p_nombre/p_body/p_id` match between migration (Task 1), DAL (Task 2), tests, and regenerated types. Action names `crearPlantillaAction/actualizarPlantillaAction/eliminarPlantillaAction/sembrarPlantillasDefaultAction` consistent across Tasks 3, 7.
