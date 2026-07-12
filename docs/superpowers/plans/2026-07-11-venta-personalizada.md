# Venta personalizada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-11-venta-personalizada-design.md` — read it first. It carries the six locked decisions and the rationale; this plan carries the code.

**Goal:** Let an admin sell a one-off custom package (promo, discount, special plan) from `/vender` — typing its name, price, class grant and vigencia — without ever creating a `paquetes` row, so it can never appear in the gym's marketing or client app.

**Architecture:** A custom sale writes the *same rows a normal sale writes* — a `ventas` snapshot (`paquete_nombre`, `clases`, `vigencia_tipo`, `vigencia_dias`, `monto`) plus the `clientes` balance update — and nothing else. `registrar_venta` grows a custom argument set, validates it, fills the *same locals* the paquete branch fills, and then falls through the **existing, unmodified** derivation, so the C1/C4/C6/C7/C9/D2 rulings are inherited rather than re-implemented. Marketing isolation is structural, not a filter: the catalog reads `paquetes`, and no `paquetes` row is created.

**Tech Stack:** pnpm + Turborepo monorepo · Next.js 16 (App Router, RSC) · Supabase/Postgres (plpgsql RPCs, RLS) · zod · vitest · TypeScript.

## Global Constraints

Every task's requirements implicitly include these. Values are verbatim from the spec.

- **Bounds (D6), enforced in the RPC and mirrored in zod:** `nombre` 3–40 chars trimmed · `precio` 1–100 000 integer MXN · `clases` 1–365 **or** ilimitado · `dias` 1–365.
- **Custom sales are always `vigencia_tipo = 'dias'`.** Never `'mes'`.
- **`clases = null` means ilimitado** — everywhere, in SQL and TS. That is why SQL needs a separate `p_custom_ilimitado` discriminator (a SQL argument that is absent and one that is `null` are the same value) and TS does **not** (a required-but-nullable field distinguishes them).
- **Never re-implement the stacking math** (C4 purchase-wins / days-carry, C9 vence-day-valid). Both branches converge on shared locals *before* the derivation runs.
- **Any staff sells (D5).** `staff_gym()` is the only gate. No new role check.
- **The Supabase MCP in this repo is bound to LIVE** (`hjppxawglmukfvsgmcog`). **Never `apply_migration` during implementation.** Migrations are files; they are exercised on a scratch project in Task 9.
- **Sale-path reads must not touch marketing columns.** `getPaquetes`'s fixed column list is deliberate (PRD #36(a)); do not widen it.
- The pre-commit hook runs `pnpm lint && pnpm typecheck && pnpm test`. Every commit below must pass it.
- Spanish, es-MX, for all operator-facing copy.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/20260711100000_ventas_personalizado_column.sql` | create | Add `ventas.personalizado`. |
| `supabase/migrations/20260711100100_registrar_venta_personalizado.sql` | create | `registrar_venta` v3: nullable `p_paquete_id`, custom args, XOR, bounds, convergence, `personalizado` stamp. |
| `supabase/tests/registrar_venta_personalizado.sql` | create | Written-row contract suite, V1–V8. |
| `supabase/tests/run-denial-suite.mjs` | modify | Register the new suite in `SUITE`. |
| `supabase/tests/rpc-coverage.json` | modify | Map the suite to `registrar_venta`. |
| `packages/data/src/database.types.ts` | modify | Regenerated types. |
| `packages/data/src/server/ventas.ts` | modify | Discriminated-union schema; custom RPC args; recibo display strings from typed values. |
| `packages/data/src/server/ventas.test.ts` | modify | Schema + RPC-arg + display-string tests. |
| `apps/admin/src/app/(app)/vender/_components/vender-vm.ts` | modify | All new pure logic: sentinel, limits, validation, derived price, `Hasta` hint. |
| `apps/admin/src/app/(app)/vender/_components/vender-vm.test.ts` | modify | Tests for the above. |
| `apps/admin/src/app/(app)/vender/_components/personalizado-editor.tsx` | create | The inline form. `vender.tsx` is already 701 lines; the form does not go in it. |
| `apps/admin/src/app/(app)/vender/_components/vender.tsx` | modify | Wiring only: custom state, the tile, auto-advance, footer price, submit payload. |
| `apps/admin/src/app/(app)/vender/page.tsx` | modify | Pass `hoyGym` (the gym's calendar day) so the client can derive the `Hasta` hint without touching the browser clock. |

---

### Task 1: Add the `ventas.personalizado` column

**Files:**
- Create: `supabase/migrations/20260711100000_ventas_personalizado_column.sql`

**Interfaces:**
- Produces: `public.ventas.personalizado boolean not null default false` — read by Task 2 (the insert stamps it) and Task 3 (the suite asserts it).

- [ ] **Step 1: Write the migration**

```sql
-- Venta personalizada (spec 2026-07-11 §5.1, decision D3): mark the sales whose
-- package was typed at the desk rather than picked from the gym's catalog.
--
-- `ventas` already snapshots WHAT was sold (paquete_nombre, clases, vigencia_tipo,
-- vigencia_dias, monto) and holds no paquete_id — so a custom sale is already
-- representable. This column records only that it WAS custom, so a gym can later
-- answer "how much did we give away in promos?".
--
-- Backfill is implicit: every row written before this migration came from a
-- paquetes row, so `false` is the correct value for all of them.

alter table public.ventas
  add column if not exists personalizado boolean not null default false;

comment on column public.ventas.personalizado is
  'True when the package was typed at the sale (promo/discount/one-off) instead of picked from public.paquetes. No paquetes row exists for it — by design, so it can never reach the public catalog.';
```

- [ ] **Step 2: Verify the guards still pass**

The denial-suite runner and the write-coverage guard both run inside the normal test gate. A migration that adds a column must not break them.

Run: `pnpm test`
Expected: PASS — 868 tests, including `tools/guards/denial-suite-drift.test.ts` and `tools/guards/rpc-write-coverage.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260711100000_ventas_personalizado_column.sql
git commit -m "feat(db): ventas.personalizado — mark desk-typed packages (D3)"
```

---

### Task 2: `registrar_venta` v3 — the custom sale path

**Files:**
- Create: `supabase/migrations/20260711100100_registrar_venta_personalizado.sql`
- Reference (read, do not modify): `supabase/migrations/20260710121000_registrar_venta_rederive.sql` — the current definition this one supersedes.

**Interfaces:**
- Consumes: `ventas.personalizado` (Task 1).
- Produces: the RPC below. Task 5 calls it by these exact argument names. Task 3 asserts against it.

```
registrar_venta(
  p_metodo text, p_idempotency_key uuid,
  p_paquete_id uuid default null, p_cliente_id uuid default null,
  p_nombre text default null, p_tel text default null, p_email text default null,
  p_forzar_nuevo boolean default false,
  p_custom_nombre text default null, p_custom_precio integer default null,
  p_custom_clases integer default null, p_custom_ilimitado boolean default false,
  p_custom_dias integer default null
) returns table(folio bigint, cliente_id uuid, clases_restantes integer,
                vence date, paquete_nombre text, monto integer)
```

Raise messages (contract — Task 3 and Task 5 pin them):

| Condition | Message |
|---|---|
| No staff membership | `No autorizado` |
| Both a paquete and a custom payload, or neither | `Venta inválida: elige un paquete o define uno personalizado` |
| `nombre` outside 3–40 trimmed | `Nombre del paquete personalizado inválido` |
| `precio` outside 1–100000, or null | `Precio personalizado inválido` |
| `clases` outside 1–365 when not ilimitado, or null; or non-null when ilimitado | `Clases personalizadas inválidas` |
| `dias` outside 1–365, or null | `Vigencia personalizada inválida` |
| Existing messages (`Paquete no encontrado`, `Cliente no encontrado`, `Método inválido`, `CLIENTE_DUPLICADO:<id>`, `Este correo ya pertenece a otro registro de este gym`) | **unchanged** |

- [ ] **Step 1: Write the migration**

Three things make this correct, and all three are easy to get wrong:

1. **The old 8-arg overload MUST be dropped.** Two live overloads make PostgREST dispatch ambiguous (`PGRST203`). `create or replace` will *not* replace it — the arity differs, so it creates a second function.
2. **`p_paquete_id` moves to position 3.** Postgres requires defaulted arguments to come last, and `p_paquete_id` is now defaulted. PostgREST dispatches by name, so no caller cares about order.
3. **Both branches fill `v_pk_*` and then the derivation runs once.** The stacking block below is copied **verbatim** from the current migration with `v_paq.` mechanically renamed to `v_pk_`. Do not rewrite it.

```sql
-- registrar_venta v3 — venta personalizada (spec 2026-07-11 §5.1).
--
-- Supersedes 20260710121000. Two changes, nothing else:
--   (a) p_paquete_id becomes OPTIONAL, and a custom package (nombre/precio/clases/
--       dias typed at the desk) may be sent instead. Exactly one of the two — XOR.
--   (b) the ventas row stamps `personalizado`.
--
-- The derivation is UNTOUCHED. Both branches fill the same v_pk_* locals — the
-- package facts — and then one shared block runs: C1 (flat-30 'mes'), C9 (the vence
-- day is a full training day), C4 (purchase wins, days carry), C6 (idempotent replay),
-- C7 (email backfill), D2 (duplicate guard). A custom sale INHERITS all of them.
-- Re-implementing any of that math inside the custom branch would be a bug.
--
-- No paquetes row is ever created: that is the whole point. The public catalog
-- (/precios, the pricing teaser) reads public.paquetes, so a custom package cannot
-- reach it — structurally, not by a filter someone can forget.
--
-- Signature CHANGE — the 8-arg overload is dropped first so PostgREST dispatch stays
-- unambiguous (PGRST203). Same honest deploy window as 20260710121000: between
-- applying this and deploying the matching app build, the old app's COBRAR fails
-- loudly (PGRST202). Accepted for a solo-operated deploy.
--
-- p_paquete_id moves to position 3: Postgres requires defaulted args last, and it is
-- now defaulted. PostgREST dispatches by NAME, so no caller is affected.
--
-- SECURITY INVOKER preserved (ADR-0005): the sale runs under the operator's RLS; only
-- staff_gym()/next_folio() are definer helpers. `set search_path to ''` preserved.

drop function if exists public.registrar_venta(
  text, uuid, uuid, uuid, text, text, text, boolean);

create or replace function public.registrar_venta(
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
) returns table(folio bigint, cliente_id uuid, clases_restantes integer, vence date, paquete_nombre text, monto integer)
language plpgsql
set search_path to ''
as $$
declare
  v_gym uuid;
  v_tz text;
  v_hoy date;
  v_custom boolean;
  -- The converged package facts. BOTH branches fill these; the derivation reads only
  -- these. This is what lets the custom path inherit C1/C4/C9 instead of copying them.
  v_pk_nombre text;
  v_pk_clases integer;        -- null = ilimitado
  v_pk_vig_tipo text;
  v_pk_vig_dias integer;
  v_pk_precio integer;
  v_paq record;
  v_cli record;
  v_compra_dias integer;
  v_base_clases integer;      -- null = ilimitado
  v_base_dias integer;
  v_new_clases integer;       -- null = ilimitado
  v_new_dias integer;
  v_new_vence date;
  v_cliente_id uuid;
  v_folio bigint;
  v_code text;
  v_dup uuid;
  v_bytes bytea;
  i int;
  v_alpha constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';  -- 34 symbols (A-Z, 2-9)
begin
  v_gym := public.staff_gym();
  if v_gym is null then raise exception 'No autorizado'; end if;

  -- Idempotent replay: same (gym, key) returns the already-written sale untouched (C6).
  select v.folio, v.cliente_id into v_folio, v_cliente_id
    from public.ventas v
    where v.gym_id = v_gym and v.idempotency_key = p_idempotency_key;
  if found then
    return query
      select v_folio, c.id, c.clases_restantes, c.vence, c.paquete_nombre,
             (select va.monto from public.ventas va
               where va.gym_id = v_gym and va.idempotency_key = p_idempotency_key)
        from public.clientes c where c.id = v_cliente_id;
    return;
  end if;

  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta') then
    raise exception 'Método inválido';
  end if;

  -- XOR: exactly one package source. `v_custom` is true if ANY custom field was sent,
  -- so a half-filled custom payload alongside a paquete_id trips the guard rather than
  -- being silently ignored.
  v_custom := (p_custom_nombre is not null
               or p_custom_precio is not null
               or p_custom_clases is not null
               or p_custom_dias is not null
               or coalesce(p_custom_ilimitado, false));
  if v_custom = (p_paquete_id is not null) then
    raise exception 'Venta inválida: elige un paquete o define uno personalizado';
  end if;

  if v_custom then
    -- Bounds (D6) live HERE, not only in the form: the RPC is the trust boundary.
    v_pk_nombre := trim(coalesce(p_custom_nombre, ''));
    if length(v_pk_nombre) < 3 or length(v_pk_nombre) > 40 then
      raise exception 'Nombre del paquete personalizado inválido';
    end if;

    if p_custom_precio is null or p_custom_precio < 1 or p_custom_precio > 100000 then
      raise exception 'Precio personalizado inválido';
    end if;

    if p_custom_dias is null or p_custom_dias < 1 or p_custom_dias > 365 then
      raise exception 'Vigencia personalizada inválida';
    end if;

    -- p_custom_ilimitado exists because SQL cannot tell "argument absent" from
    -- "argument is null", and null IS the ilimitado value. Sending both is incoherent.
    if coalesce(p_custom_ilimitado, false) then
      if p_custom_clases is not null then
        raise exception 'Clases personalizadas inválidas';
      end if;
      v_pk_clases := null;                                   -- ilimitado
    else
      if p_custom_clases is null or p_custom_clases < 1 or p_custom_clases > 365 then
        raise exception 'Clases personalizadas inválidas';
      end if;
      v_pk_clases := p_custom_clases;
    end if;

    v_pk_precio := p_custom_precio;
    v_pk_vig_tipo := 'dias';                                 -- custom is always 'dias'
    v_pk_vig_dias := p_custom_dias;
  else
    -- Package facts come from the DB, never the client (C13).
    select p.nombre, p.clases, p.vigencia_tipo, p.vigencia_dias, p.precio into v_paq
      from public.paquetes p where p.id = p_paquete_id and p.gym_id = v_gym;
    if not found then raise exception 'Paquete no encontrado'; end if;
    v_pk_nombre := v_paq.nombre;
    v_pk_clases := v_paq.clases;
    v_pk_vig_tipo := v_paq.vigencia_tipo;
    v_pk_vig_dias := v_paq.vigencia_dias;
    v_pk_precio := v_paq.precio;
  end if;

  select g.timezone into v_tz from public.gym g where g.id = v_gym;
  v_hoy := (now() at time zone v_tz)::date;

  -- Ruling C1: 'mes' is a flat 30 days. (Custom is always 'dias', so this is a no-op
  -- for it — but the code path is SHARED, which is the point.)
  v_compra_dias := case when v_pk_vig_tipo = 'mes' then 30
                        else coalesce(v_pk_vig_dias, 0) end;

  if p_cliente_id is not null then
    -- Locked base read (C13/C6/C5): nothing can move the saldo mid-derivation.
    select c.clases_restantes, c.vence into v_cli
      from public.clientes c
      where c.id = p_cliente_id and c.gym_id = v_gym
      for update;
    if not found then raise exception 'Cliente no encontrado'; end if;

    -- baseParaStack, ruling C9: the vence day is a FULL training day — leftovers
    -- carry when renewing on it; forfeit starts the day after. Null vence = no
    -- vigencia ever sold = empty base.
    if v_cli.vence is not null and (v_cli.vence - v_hoy) >= 0 then
      v_base_clases := v_cli.clases_restantes;      -- null = ilimitado carries
      v_base_dias := v_cli.vence - v_hoy;
    else
      v_base_clases := 0;
      v_base_dias := 0;
    end if;
  else
    if coalesce(length(trim(p_nombre)), 0) < 3 or p_tel is null then
      raise exception 'Datos del cliente incompletos';
    end if;
    -- D2: block the accidental duplicate; the operator can override explicitly.
    if not p_forzar_nuevo then
      select c.id into v_dup from public.clientes c
        where c.gym_id = v_gym
          and (c.tel = p_tel or (p_email is not null and lower(c.email) = lower(p_email)))
        limit 1;
      if v_dup is not null then
        raise exception 'CLIENTE_DUPLICADO:%', v_dup;
      end if;
    end if;
    v_base_clases := 0;
    v_base_dias := 0;
  end if;

  -- stackPaquete, ruling C4: purchase wins, days carry. The ilimitado->finite branch
  -- keys on `v_base_clases is null` (true iff the locked base was an active ilimitado);
  -- it never re-reads v_cli, so the NEW-client path (v_cli unassigned) is safe.
  if v_pk_clases is null then
    v_new_clases := null;                                   -- becomes ilimitado
  elsif p_cliente_id is not null and v_base_clases is null then
    v_new_clases := v_pk_clases;                            -- ilimitado -> finite: pack's count
  else
    v_new_clases := coalesce(v_base_clases, 0) + v_pk_clases;
  end if;
  v_new_dias := v_base_dias + v_compra_dias;
  v_new_vence := v_hoy + v_new_dias;

  if p_cliente_id is not null then
    -- The C7 email backfill can collide with clientes_email_gym_uq (another row in the gym
    -- already holds p_email): surface a human message, not a raw 23505 — the TS write path
    -- matches this exact string (EMAIL_EN_USO_MSG). The whole sale rolls back (no venta row written).
    begin
      update public.clientes c
        set clases_restantes = v_new_clases,
            vence = v_new_vence,
            paquete_nombre = v_pk_nombre,
            email = coalesce(p_email, c.email)             -- C7 backfill
        where c.id = p_cliente_id;
    exception when unique_violation then
      raise exception 'Este correo ya pertenece a otro registro de este gym';
    end;
    v_cliente_id := p_cliente_id;
  else
    loop
      v_code := '';
      v_bytes := extensions.gen_random_bytes(8);
      for i in 0..7 loop
        v_code := v_code || substr(v_alpha, (get_byte(v_bytes, i) % 34) + 1, 1);
      end loop;
      begin
        insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, email, claim_code)
          values (trim(p_nombre), p_tel, v_new_clases, v_new_vence, v_pk_nombre, v_gym, p_email, v_code)
          returning id into v_cliente_id;
        exit;
      exception when unique_violation then
        -- claim_code collision retries; an email collision must surface (D2 backstop index).
        if exists (select 1 from public.clientes c where c.gym_id = v_gym and lower(c.email) = lower(p_email)) then
          raise exception 'CLIENTE_DUPLICADO:%',
            (select c.id from public.clientes c where c.gym_id = v_gym and lower(c.email) = lower(p_email) limit 1);
        end if;
      end;
    end loop;
  end if;

  v_folio := public.next_folio(v_gym);
  insert into public.ventas (cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, gym_id, idempotency_key, personalizado)
    values (v_cliente_id, v_folio, v_pk_nombre, v_pk_clases, v_pk_vig_tipo, v_pk_vig_dias, v_pk_precio, p_metodo, v_gym, p_idempotency_key, v_custom);

  return query
    select v_folio, c.id, c.clases_restantes, c.vence, c.paquete_nombre, v_pk_precio
      from public.clientes c where c.id = v_cliente_id;
end;
$$;

revoke all on function public.registrar_venta(text, uuid, uuid, uuid, text, text, text, boolean, text, integer, integer, boolean, integer) from public, anon;
grant execute on function public.registrar_venta(text, uuid, uuid, uuid, text, text, text, boolean, text, integer, integer, boolean, integer) to authenticated;
```

- [ ] **Step 2: Confirm no other caller uses the old signature**

Run: `grep -rn "registrar_venta" --include=*.ts --include=*.tsx --include=*.sql . | grep -v node_modules | grep -v "^./supabase/migrations/2026071"`
Expected: hits only in `packages/data/src/server/ventas.ts` (rewritten in Task 5), `packages/data/src/database.types.ts` (regenerated in Task 4), the existing `supabase/tests/*.sql` suites, and `rpc-coverage.json`. **If any other production caller appears, stop and report it** — it would break at deploy.

- [ ] **Step 3: Verify the gate**

Run: `pnpm test`
Expected: PASS. `rpc-write-coverage.test.ts` derives the write-bearing RPC set by replaying the migrations, so it must still find `registrar_venta` covered (its existing suites are still listed).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260711100100_registrar_venta_personalizado.sql
git commit -m "feat(db): registrar_venta v3 — custom package path (XOR + bounds, shared derivation)"
```

---

### Task 3: The written-row contract suite

**Files:**
- Create: `supabase/tests/registrar_venta_personalizado.sql`
- Modify: `supabase/tests/run-denial-suite.mjs` (the `SUITE` array, ~line 50)
- Modify: `supabase/tests/rpc-coverage.json` (the `registrar_venta` entry, line 28)
- Reference: `supabase/tests/registrar_venta_stacking.sql` — **imitate its idiom exactly**: transaction-local fixtures, `RAISE` on failure, rollback at the end.

**Interfaces:**
- Consumes: the RPC from Task 2 and the column from Task 1.

**Why this suite matters more than the vitest ones:** `packages/data` mocks the RPC boundary, so a bug that drops a column or stamps the wrong `gym_id` passes all of `pnpm test`. #78 shipped exactly that way. **Assert the written ROWS, not the return value** — that is the repo's rule (AGENTS.md).

- [ ] **Step 1: Read the reference suite**

Read `supabase/tests/registrar_venta_stacking.sql` end to end. Reuse its fixture helpers, its gym/staff seeding, its `RAISE EXCEPTION` assertion style and its rollback. Do not invent a new idiom.

- [ ] **Step 2: Write the suite**

Cover exactly these vectors. Each asserts the rows in `ventas` and `clientes`, never just the RPC's return.

| Vector | Setup | Assert |
|---|---|---|
| V1 | Custom sale, NEW client: nombre `'Promo Verano'`, precio 750, clases 12, dias 45 | `ventas`: `paquete_nombre = 'Promo Verano'`, `monto = 750`, `clases = 12`, `vigencia_tipo = 'dias'`, `vigencia_dias = 45`, `personalizado = true`, correct `gym_id`. `clientes`: `clases_restantes = 12`, `vence = hoy + 45`, `paquete_nombre = 'Promo Verano'`. **Zero new rows in `paquetes`.** |
| V2 | Custom ilimitado: `p_custom_ilimitado := true`, `p_custom_clases := null` | `ventas.clases is null`; `clientes.clases_restantes is null`. |
| V3 | EXISTING client with an active base (5 clases, vence = hoy + 10), then a custom sale of 12 clases / 45 días | C4 stacking inherited: `clientes.clases_restantes = 17`, `vence = hoy + 55`. This is the vector that catches a re-implemented derivation. |
| V4 | (a) both `p_paquete_id` and `p_custom_nombre`; (b) neither | Both raise `Venta inválida: elige un paquete o define uno personalizado`. |
| V5 | Each bound, one call per violation: precio 0; precio 100001; clases 0; clases 366; dias 0; dias 366; nombre `'ab'`; nombre 41 chars; ilimitado true **with** clases 5 | Each raises its message from the Task 2 table. **After all of them, `ventas` has no new rows** (every failure rolled back). |
| V6 | The same custom call twice with the same `p_idempotency_key` | Exactly **one** `ventas` row; both calls return the same `folio`; `clientes.clases_restantes` credited once. |
| V7 | **Regression:** a normal registered-plan sale | `ventas.personalizado = false`. |
| V8 | Call as a non-staff member of the gym | Raises `No autorizado`; no rows written. |

- [ ] **Step 3: Register the suite in the runner**

Add to the `SUITE` array in `supabase/tests/run-denial-suite.mjs`, immediately after `'registrar_venta_stacking.sql'`:

```js
  'registrar_venta_stacking.sql',
  'registrar_venta_personalizado.sql',
```

A `.sql` file in `supabase/tests/` that is in neither `SUITE` nor `QUARANTINE` fails `tools/guards/denial-suite-drift.test.ts`. There is no third option.

- [ ] **Step 4: Register the suite in the coverage map**

In `supabase/tests/rpc-coverage.json`, replace line 28 with:

```json
    "registrar_venta": { "suites": ["registrar_venta_stacking.sql", "registrar_venta_personalizado.sql", "registrar_venta_stamps_gym_id.sql", "registrar_venta_email.sql", "folio_per_gym.sql", "reclamar_por_codigo.sql", "gym2_probe.sql", "rls_cross_tenant_denial.sql"] },
```

Note this also adds `registrar_venta_stacking.sql`, which the map omitted even though it is the primary contract suite and is registered in the runner. In-scope hygiene (spec §5.4); we are in the file anyway.

- [ ] **Step 5: Verify both guards**

Run: `pnpm test`
Expected: PASS. `denial-suite-drift.test.ts` sees the new file registered; `rpc-write-coverage.test.ts` sees `registrar_venta` covered.

The suite itself cannot run here — `test:denial` needs a scratch project and a PAT. That is Task 9.

- [ ] **Step 6: Commit**

```bash
git add supabase/tests/registrar_venta_personalizado.sql supabase/tests/run-denial-suite.mjs supabase/tests/rpc-coverage.json
git commit -m "test(db): registrar_venta_personalizado suite — written-row contract, V1-V8"
```

---

### Task 4: Regenerate the database types

**Files:**
- Modify: `packages/data/src/database.types.ts`

**Interfaces:**
- Produces: `Database["public"]["Functions"]["registrar_venta"]["Args"]` carrying the five `p_custom_*` arguments, and `ventas.Row.personalizado`. Task 5 typechecks against this.

- [ ] **Step 1: Regenerate**

The generator must see the new migrations. **Do not apply them to live.** Regenerate against the local Supabase stack:

```bash
pnpm supabase start
pnpm supabase db reset            # replays supabase/migrations/ into the local DB
pnpm supabase gen types typescript --local > packages/data/src/database.types.ts
pnpm supabase stop
```

If the local stack is unavailable (no Docker), generate against the **scratch** project from Task 9 instead — never `hjppxawglmukfvsgmcog`.

- [ ] **Step 2: Verify the diff is what you expect**

Run: `git diff --stat packages/data/src/database.types.ts`
Expected: `registrar_venta` Args gain `p_custom_nombre`/`p_custom_precio`/`p_custom_clases`/`p_custom_ilimitado`/`p_custom_dias` and `p_paquete_id` becomes optional; `ventas` Row/Insert/Update gain `personalizado`.

Expect **one unrelated fix to ride along**: `ventas.idempotency_key` (added by `20260710120000`) is missing from the current committed types — a known pre-existing drift. Its appearance is correct.

If the diff shows anything else — dropped tables, renamed types — the generator ran against the wrong database. Stop.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/data/src/database.types.ts
git commit -m "chore(data): regenerate database types — registrar_venta v3, ventas.personalizado (+ idempotency_key drift)"
```

---

### Task 5: The data layer — discriminated union + custom RPC args

**Files:**
- Modify: `packages/data/src/server/ventas.ts`
- Test: `packages/data/src/server/ventas.test.ts`

**Interfaces:**
- Consumes: the RPC (Task 2), the types (Task 4).
- Produces — Task 8's `finish()` sends exactly this shape:

```ts
export type PaqueteSeleccion =
  | { tipo: "registrado"; paqueteId: string }
  | { tipo: "personalizado"; nombre: string; precio: number; clases: number | null; dias: number };
```

`crearVentaInput.paqueteId` is **removed** and replaced by `paquete: PaqueteSeleccion`. `VentaResult` is unchanged — the recibo needs no new field.

**The trap in this task:** `crearVenta` currently builds the ticket's `paquete.vigencia` display by re-reading the `paquetes` row. **For a custom sale there is no row to read.** The display strings must come from the typed values. Miss this and the receipt renders `undefined días` — or throws `Paquete no encontrado` on a perfectly valid sale.

- [ ] **Step 1: Write the failing tests**

Add to `packages/data/src/server/ventas.test.ts`, following the file's existing mocked-RPC idiom:

```ts
describe("crearVenta — paquete personalizado", () => {
  it("rejects a custom package whose price is out of bounds", async () => {
    await expect(
      crearVenta({
        mode: "new",
        nuevoNombre: "Ana Ruiz",
        nuevoTel: "6141234567",
        paquete: { tipo: "personalizado", nombre: "Promo Verano", precio: 0, clases: 12, dias: 45 },
        metodo: "efectivo",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      }),
    ).rejects.toThrow();
  });

  it("rejects a custom package name shorter than 3 characters", async () => {
    await expect(
      crearVenta({
        mode: "new",
        nuevoNombre: "Ana Ruiz",
        nuevoTel: "6141234567",
        paquete: { tipo: "personalizado", nombre: "ab", precio: 750, clases: 12, dias: 45 },
        metodo: "efectivo",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      }),
    ).rejects.toThrow();
  });

  it("sends the custom args to the RPC and derives ilimitado from a null class grant", async () => {
    // Arrange the mocked supabase client per this file's existing pattern, capturing
    // the rpc() args, and stub the RPC's return row:
    //   { folio: 1042, cliente_id: "c-1", clases_restantes: null, vence: "2026-08-25",
    //     paquete_nombre: "Promo Verano", monto: 750 }
    const res = await crearVenta({
      mode: "new",
      nuevoNombre: "Ana Ruiz",
      nuevoTel: "6141234567",
      paquete: { tipo: "personalizado", nombre: "Promo Verano", precio: 750, clases: null, dias: 45 },
      metodo: "efectivo",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    }, fakeClient);

    expect(rpcArgs).toMatchObject({
      p_custom_nombre: "Promo Verano",
      p_custom_precio: 750,
      p_custom_ilimitado: true,
      p_custom_dias: 45,
    });
    expect(rpcArgs.p_custom_clases).toBeUndefined();
    expect(rpcArgs.p_paquete_id).toBeUndefined();

    // The recibo strings come from the TYPED values — there is no paquetes row to read.
    expect(res.paquete).toEqual({ nombre: "Promo Verano", vigencia: "45 días", precio: 750 });
  });

  it("never reads the paquetes table for a custom sale", async () => {
    // Assert the fake client's .from("paquetes") was not called during a custom sale.
    expect(fromCalls).not.toContain("paquetes");
  });

  it("still sends p_paquete_id for a registered plan", async () => {
    await crearVenta({
      mode: "new",
      nuevoNombre: "Ana Ruiz",
      nuevoTel: "6141234567",
      paquete: { tipo: "registrado", paqueteId: "p-1" },
      metodo: "efectivo",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    }, fakeClient);

    expect(rpcArgs.p_paquete_id).toBe("p-1");
    expect(rpcArgs.p_custom_nombre).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run packages/data/src/server/ventas.test.ts`
Expected: FAIL — the schema still requires `paqueteId` at the top level, so every new test errors on parse.

- [ ] **Step 3: Implement**

In `packages/data/src/server/ventas.ts`:

(a) Replace the `paqueteId` field with the union. Put it above `crearVentaSchema`:

```ts
/** The two package sources a sale can have. A discriminated union, not two optional
 *  fields: "both" and "neither" are unrepresentable, not merely rejected.
 *
 *  `clases: null` = ilimitado — a REQUIRED nullable field, so "absent" is a parse
 *  error and null unambiguously means unlimited. (SQL needs an extra
 *  p_custom_ilimitado discriminator for the same job, because an absent argument and
 *  a null one are the same value there. See the RPC edge below.)
 *
 *  Bounds mirror the RPC (spec D6) for a fast, local failure — but the RPC is the
 *  trust boundary and enforces them again. This copy is convenience, not security. */
const paqueteSeleccionSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("registrado"),
    paqueteId: z.string().min(1).transform(asPaqueteId),
  }),
  z.object({
    tipo: z.literal("personalizado"),
    nombre: z.string().trim().min(3).max(40),
    precio: z.number().int().min(1).max(100_000),
    clases: z.number().int().min(1).max(365).nullable(),
    dias: z.number().int().min(1).max(365),
  }),
]);

export type PaqueteSeleccion = z.infer<typeof paqueteSeleccionSchema>;
```

Then in `crearVentaSchema`, delete `paqueteId: z.string().min(1).transform(asPaqueteId),` and add `paquete: paqueteSeleccionSchema,`.

(b) In `crearVenta`, make the `paquetes` read conditional. It exists only to compose display strings for a registered plan; a custom sale has nothing to read:

```ts
  const isNew = input.mode === "new";
  const esCustom = input.paquete.tipo === "personalizado";
  const [paqRes, cliRes] = await Promise.all([
    // Display-only read, and ONLY for a registered plan — a custom package has no
    // paquetes row by design (spec §2). Reading here would throw on a valid sale.
    esCustom
      ? Promise.resolve(null)
      : supabase
          .from("paquetes")
          .select("nombre, vigencia_tipo, vigencia_dias, precio")
          .eq("id", forPaquete((input.paquete as { paqueteId: PaqueteId }).paqueteId))
          .single(),
    input.mode === "existing"
      ? supabase.from("clientes").select("nombre, tel").eq("id", forCliente(input.clienteId!)).single()
      : Promise.resolve(null),
  ]);
```

(c) Compose the receipt's package block from whichever source applies. Replace the `const { data: paq, error: paqErr } = paqRes; if (paqErr || !paq) …` block with:

```ts
  // The recibo's CONCEPTO. For a registered plan it mirrors the paquetes row; for a
  // custom package there IS no row, so it comes from the typed values (always 'dias').
  let reciboPaquete: { nombre: string; vigencia: string; precio: number };
  if (input.paquete.tipo === "personalizado") {
    const c = input.paquete;
    reciboPaquete = { nombre: c.nombre, vigencia: `${c.dias} días`, precio: c.precio };
  } else {
    const { data: paq, error: paqErr } = paqRes!;
    if (paqErr || !paq) throw new Error("Paquete no encontrado");
    reciboPaquete = {
      nombre: paq.nombre,
      vigencia: vigenciaDisplay(paq.vigencia_tipo, paq.vigencia_dias),
      precio: paq.precio,
    };
  }
```

Then use `reciboPaquete.nombre` where the code currently reads `paq.nombre` (the `PlantillaContext`'s `paquete` token, ~line 246) and return `paquete: reciboPaquete` (~line 267).

(d) Build the RPC args from the union arm. Replace the `p_paquete_id` line in the `.rpc("registrar_venta", …)` call:

```ts
      p_metodo: input.metodo,
      p_idempotency_key: input.idempotencyKey,
      ...(input.paquete.tipo === "registrado"
        ? { p_paquete_id: forPaquete(input.paquete.paqueteId) }
        : {
            p_custom_nombre: input.paquete.nombre,
            p_custom_precio: input.paquete.precio,
            p_custom_dias: input.paquete.dias,
            // SQL cannot distinguish an absent argument from a null one, and null IS
            // the ilimitado value — so the flag carries what the type already knows.
            ...(input.paquete.clases === null
              ? { p_custom_ilimitado: true }
              : { p_custom_clases: input.paquete.clases }),
          }),
```

Leave the `p_cliente_id` / `p_nombre` / `p_tel` / `p_email` / `p_forzar_nuevo` spreads exactly as they are.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/data/src/server/ventas.test.ts`
Expected: PASS — new tests and every pre-existing one.

- [ ] **Step 5: Full gate**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS. `apps/admin` will **fail typecheck** here if you have not yet updated `vender.tsx`'s `crearVentaAction` payload — that is expected and is fixed in Task 8. If so, note it and continue; do not paper over it by keeping `paqueteId` on the schema.

> If you prefer a green commit at every step, do Task 5 and Task 8 back to back and commit once. The union is a breaking change to one caller.

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/server/ventas.ts packages/data/src/server/ventas.test.ts
git commit -m "feat(data): venta paquete union — registrado | personalizado, recibo strings from typed values"
```

---

### Task 6: The pure view-model

**Files:**
- Modify: `apps/admin/src/app/(app)/vender/_components/vender-vm.ts`
- Test: `apps/admin/src/app/(app)/vender/_components/vender-vm.test.ts`

**Interfaces:**
- Consumes: `PaqueteSeleccion` (Task 5).
- Produces — Task 7 and Task 8 import exactly these:

```ts
export const PERSONALIZADO = "__personalizado__";
export interface CustomForm { nombre: string; precio: string; clases: string; ilimitado: boolean; dias: string }
export const CUSTOM_VACIO: CustomForm;
export interface CustomErrors { nombre: string | null; precio: string | null; clases: string | null; dias: string | null }
export function customErrors(f: CustomForm, blurred: Partial<Record<keyof CustomErrors, boolean>>): CustomErrors
export function customValido(f: CustomForm): boolean
export function paqueteListo(sel: string | null, f: CustomForm): boolean
export function precioSeleccionado(sel: string | null, precioPaq: number | null, f: CustomForm): number | null
export function customSeleccion(f: CustomForm): PaqueteSeleccion   // the wire payload
```

This is where the logic goes. `vender.tsx` is 701 lines already; it gets wiring, not a brain. The form holds **strings** (that is what an `<Input>` gives you) and this module parses them — so "12abc" and "" and "0" all have defined behavior in one tested place.

- [ ] **Step 1: Write the failing tests**

Append to `apps/admin/src/app/(app)/vender/_components/vender-vm.test.ts`:

```ts
import { CUSTOM_VACIO, customErrors, customSeleccion, customValido, paqueteListo, PERSONALIZADO, precioSeleccionado } from "./vender-vm";

const lleno = { nombre: "Promo Verano", precio: "750", clases: "12", ilimitado: false, dias: "45" };
const todoBlurred = { nombre: true, precio: true, clases: true, dias: true };

describe("customErrors", () => {
  it("has no errors for a complete, in-bounds form", () => {
    expect(customErrors(lleno, todoBlurred)).toEqual({ nombre: null, precio: null, clases: null, dias: null });
  });

  it("stays quiet on empty untouched fields", () => {
    expect(customErrors(CUSTOM_VACIO, {})).toEqual({ nombre: null, precio: null, clases: null, dias: null });
  });

  it("flags an empty required field once blurred", () => {
    expect(customErrors(CUSTOM_VACIO, todoBlurred).nombre).not.toBeNull();
  });

  it("rejects a name shorter than 3 characters", () => {
    expect(customErrors({ ...lleno, nombre: "ab" }, todoBlurred).nombre).not.toBeNull();
  });

  it("rejects a name longer than 40 characters", () => {
    expect(customErrors({ ...lleno, nombre: "x".repeat(41) }, todoBlurred).nombre).not.toBeNull();
  });

  it("rejects a price of zero and a price above 100000", () => {
    expect(customErrors({ ...lleno, precio: "0" }, todoBlurred).precio).not.toBeNull();
    expect(customErrors({ ...lleno, precio: "100001" }, todoBlurred).precio).not.toBeNull();
  });

  it("rejects non-numeric and non-integer input", () => {
    expect(customErrors({ ...lleno, precio: "abc" }, todoBlurred).precio).not.toBeNull();
    expect(customErrors({ ...lleno, precio: "750.5" }, todoBlurred).precio).not.toBeNull();
  });

  it("rejects classes outside 1-365", () => {
    expect(customErrors({ ...lleno, clases: "0" }, todoBlurred).clases).not.toBeNull();
    expect(customErrors({ ...lleno, clases: "366" }, todoBlurred).clases).not.toBeNull();
  });

  it("ignores the classes field entirely when ilimitado is on", () => {
    expect(customErrors({ ...lleno, ilimitado: true, clases: "" }, todoBlurred).clases).toBeNull();
  });

  it("rejects vigencia outside 1-365", () => {
    expect(customErrors({ ...lleno, dias: "0" }, todoBlurred).dias).not.toBeNull();
    expect(customErrors({ ...lleno, dias: "366" }, todoBlurred).dias).not.toBeNull();
  });
});

describe("paqueteListo", () => {
  it("is true for any picked registered plan", () => {
    expect(paqueteListo("p-1", CUSTOM_VACIO)).toBe(true);
  });
  it("is false with nothing picked", () => {
    expect(paqueteListo(null, CUSTOM_VACIO)).toBe(false);
  });
  it("is false on the custom tile until the form validates", () => {
    expect(paqueteListo(PERSONALIZADO, CUSTOM_VACIO)).toBe(false);
    expect(paqueteListo(PERSONALIZADO, lleno)).toBe(true);
  });
});

describe("precioSeleccionado", () => {
  it("reads the plan's price for a registered plan", () => {
    expect(precioSeleccionado("p-1", 900, CUSTOM_VACIO)).toBe(900);
  });
  it("reads the typed price for a valid custom package", () => {
    expect(precioSeleccionado(PERSONALIZADO, null, lleno)).toBe(750);
  });
  it("is null for an incomplete custom package, so the footer shows a dash", () => {
    expect(precioSeleccionado(PERSONALIZADO, null, CUSTOM_VACIO)).toBeNull();
  });
});

describe("customSeleccion", () => {
  it("builds the wire payload with a finite class grant", () => {
    expect(customSeleccion(lleno)).toEqual({
      tipo: "personalizado", nombre: "Promo Verano", precio: 750, clases: 12, dias: 45,
    });
  });
  it("sends clases: null for ilimitado", () => {
    expect(customSeleccion({ ...lleno, ilimitado: true, clases: "" }).clases).toBeNull();
  });
  it("trims the name", () => {
    expect(customSeleccion({ ...lleno, nombre: "  Promo Verano  " }).nombre).toBe("Promo Verano");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run apps/admin/src/app/\(app\)/vender/_components/vender-vm.test.ts`
Expected: FAIL — nothing is exported yet.

- [ ] **Step 3: Implement**

Append to `apps/admin/src/app/(app)/vender/_components/vender-vm.ts`:

```ts
import type { PaqueteSeleccion } from "@gym/data/server/ventas";

/** The custom tile's id in `sel`. A sentinel, not a uuid — it can never collide with
 *  a real paquete id, and it keeps `sel` a single string instead of a second state. */
export const PERSONALIZADO = "__personalizado__";

/** Bounds (spec D6). Mirrored in the RPC, which is the real trust boundary — these
 *  exist so the operator learns about a typo before the round trip, not instead of it. */
export const LIMITES = {
  nombreMin: 3,
  nombreMax: 40,
  precioMin: 1,
  precioMax: 100_000,
  clasesMin: 1,
  clasesMax: 365,
  diasMin: 1,
  diasMax: 365,
} as const;

/** The form holds strings — that is what an <Input> gives you. Parsing lives here, so
 *  "12abc", "" and "750.5" all have one tested behavior instead of three at the call sites. */
export interface CustomForm {
  nombre: string;
  precio: string;
  clases: string;
  ilimitado: boolean;
  dias: string;
}

export const CUSTOM_VACIO: CustomForm = {
  nombre: "",
  precio: "",
  clases: "",
  ilimitado: false,
  dias: "",
};

export interface CustomErrors {
  nombre: string | null;
  precio: string | null;
  clases: string | null;
  dias: string | null;
}

/** Strict positive integer parse: rejects "", "abc", "750.5", "-1" and "1e3". */
function entero(s: string): number | null {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

function rangoError(s: string, min: number, max: number, etiqueta: string): string | null {
  const n = entero(s);
  if (n === null) return `${etiqueta} debe ser un número entero.`;
  if (n < min || n > max) return `${etiqueta} debe estar entre ${min} y ${max}.`;
  return null;
}

/**
 * Per-field errors for the PERSONALIZADO form. A field that is still empty and has
 * not been blurred stays quiet — the operator should not be scolded for a field they
 * have not reached yet. Same discipline as telError (#48).
 *
 * The `clases` field is skipped entirely when `ilimitado` is on: it is not merely
 * optional then, it is meaningless (a null grant IS the ilimitado value).
 */
export function customErrors(
  f: CustomForm,
  blurred: Partial<Record<keyof CustomErrors, boolean>>,
): CustomErrors {
  const quieto = (campo: keyof CustomErrors, valor: string) =>
    valor.trim() === "" && !blurred[campo];

  const nombre = (() => {
    if (quieto("nombre", f.nombre)) return null;
    const n = f.nombre.trim().length;
    if (n < LIMITES.nombreMin || n > LIMITES.nombreMax)
      return `El nombre debe tener entre ${LIMITES.nombreMin} y ${LIMITES.nombreMax} caracteres.`;
    return null;
  })();

  const precio = quieto("precio", f.precio)
    ? null
    : rangoError(f.precio, LIMITES.precioMin, LIMITES.precioMax, "El precio");

  const clases = f.ilimitado
    ? null
    : quieto("clases", f.clases)
      ? null
      : rangoError(f.clases, LIMITES.clasesMin, LIMITES.clasesMax, "Las clases");

  const dias = quieto("dias", f.dias)
    ? null
    : rangoError(f.dias, LIMITES.diasMin, LIMITES.diasMax, "La vigencia");

  return { nombre, precio, clases, dias };
}

/** Complete AND in bounds — the COBRAR gate for a custom package. Checks every field
 *  as though blurred, so an untouched empty form is invalid (not merely quiet). */
export function customValido(f: CustomForm): boolean {
  const e = customErrors(f, { nombre: true, precio: true, clases: true, dias: true });
  return !e.nombre && !e.precio && !e.clases && !e.dias;
}

/** PAQUETE-section completion. A registered plan is done the moment it is picked; the
 *  custom tile is done only once its form validates. */
export function paqueteListo(sel: string | null, f: CustomForm): boolean {
  if (sel === PERSONALIZADO) return customValido(f);
  return !!sel;
}

/** The one price the footer renders — CountUp and the COBRAR label read this for both
 *  branches. Null renders the "$—" placeholder. */
export function precioSeleccionado(
  sel: string | null,
  precioPaq: number | null,
  f: CustomForm,
): number | null {
  if (sel === PERSONALIZADO) return customValido(f) ? entero(f.precio) : null;
  return precioPaq;
}

/** The wire payload. Only call with a form that `customValido` accepts — the non-null
 *  assertions below are safe exactly then, and zod re-checks at the server boundary. */
export function customSeleccion(f: CustomForm): PaqueteSeleccion {
  return {
    tipo: "personalizado",
    nombre: f.nombre.trim(),
    precio: entero(f.precio)!,
    clases: f.ilimitado ? null : entero(f.clases)!,
    dias: entero(f.dias)!,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run apps/admin/src/app/\(app\)/vender/_components/vender-vm.test.ts`
Expected: PASS, including the pre-existing `telError` / `clienteListo` tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/\(app\)/vender/_components/vender-vm.ts apps/admin/src/app/\(app\)/vender/_components/vender-vm.test.ts
git commit -m "feat(admin): vender-vm — PERSONALIZADO validation, derived price, wire payload"
```

---

### Task 7: The inline form component

**Files:**
- Create: `apps/admin/src/app/(app)/vender/_components/personalizado-editor.tsx`

**Interfaces:**
- Consumes: `CustomForm`, `customErrors`, `LIMITES` (Task 6).
- Produces:

```tsx
export function PersonalizadoEditor(props: {
  form: CustomForm;
  setForm: (f: CustomForm) => void;
  hasta: string | null;   // "25 ago" — the derived expiry hint, or null while incomplete
}): React.JSX.Element
```

Match the surrounding style: `var(--yellow)` for the active border, `var(--line)` idle, `var(--muted)` for secondary text, `forge-pressable` on buttons, uppercase bold labels. Reuse `Input`, `Eyebrow`, `Tnum` from `@gym/ui/forge/ui` — do not hand-roll inputs.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import * as React from "react";
import { Eyebrow, Input } from "@gym/ui/forge/ui";

import { customErrors, LIMITES, type CustomErrors, type CustomForm } from "./vender-vm";

/**
 * The PERSONALIZADO form — a promo, discount or one-off package typed at the desk.
 * It never becomes a paquetes row, so it can never reach the gym's public catalog
 * (spec §2). It DOES reach the member: `mi_membresia` anchors their plan card on the
 * latest venta, so whatever is typed here is what they see. Hence the hint below.
 *
 * Pure presentation: every rule lives in vender-vm (customErrors / LIMITES).
 */
export function PersonalizadoEditor({
  form,
  setForm,
  hasta,
}: {
  form: CustomForm;
  setForm: (f: CustomForm) => void;
  /** Expiry if sold today, e.g. "25 ago" — derived by the parent in the GYM's timezone. */
  hasta: string | null;
}) {
  const [blurred, setBlurred] = React.useState<Partial<Record<keyof CustomErrors, boolean>>>({});
  const errors = customErrors(form, blurred);
  const touch = (k: keyof CustomErrors) => setBlurred((b) => ({ ...b, [k]: true }));
  const set = <K extends keyof CustomForm>(k: K, v: CustomForm[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="flex flex-col" style={{ gap: 16, padding: "16px 2px 4px" }}>
      <Campo label="NOMBRE" error={errors.nombre}>
        <Input
          placeholder="Promo Verano 2x1"
          value={form.nombre}
          onChange={(v: string) => set("nombre", v)}
          onBlur={() => touch("nombre")}
          maxLength={LIMITES.nombreMax}
        />
        <Nota>Este nombre aparece en el ticket y en la cuenta del cliente.</Nota>
      </Campo>

      <div className="grid grid-cols-2" style={{ gap: 12 }}>
        <Campo label="PRECIO" error={errors.precio}>
          <Input
            inputMode="numeric"
            placeholder="750"
            value={form.precio}
            onChange={(v: string) => set("precio", v)}
            onBlur={() => touch("precio")}
          />
        </Campo>

        <Campo label="VIGENCIA" error={errors.dias}>
          <Input
            inputMode="numeric"
            placeholder="45"
            value={form.dias}
            onChange={(v: string) => set("dias", v)}
            onBlur={() => touch("dias")}
          />
          <Nota>{hasta ? `Hasta ${hasta}` : "Días desde hoy"}</Nota>
        </Campo>
      </div>

      <Campo label="CLASES" error={errors.clases}>
        <div className="flex" style={{ gap: 8 }}>
          <div style={{ flex: 1, opacity: form.ilimitado ? 0.4 : 1 }}>
            <Input
              inputMode="numeric"
              placeholder="12"
              value={form.ilimitado ? "" : form.clases}
              onChange={(v: string) => set("clases", v)}
              onBlur={() => touch("clases")}
              disabled={form.ilimitado}
            />
          </div>
          <button
            type="button"
            onClick={() => set("ilimitado", !form.ilimitado)}
            aria-pressed={form.ilimitado}
            className="forge-pressable uppercase font-bold"
            style={{
              padding: "0 18px",
              background: "transparent",
              border: `1px solid ${form.ilimitado ? "var(--yellow)" : "var(--line)"}`,
              color: form.ilimitado ? "var(--yellow)" : "var(--muted)",
              cursor: "pointer",
              fontSize: 10.5,
              letterSpacing: 1.2,
              transition: "border-color 140ms ease, color 140ms ease",
            }}
          >
            Ilimitado
          </button>
        </div>
      </Campo>
    </div>
  );
}

function Campo({
  label,
  error,
  children,
}: {
  label: string;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 7 }}>
      <Eyebrow>{label}</Eyebrow>
      {children}
      {error && (
        <div style={{ fontSize: 11, color: "var(--danger, #e5484d)", letterSpacing: 0.2 }}>{error}</div>
      )}
    </div>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 0.2 }}>{children}</div>;
}
```

- [ ] **Step 2: Reconcile the Input props with the real component**

`@gym/ui/forge/ui`'s `Input` may not accept every prop used above (`onBlur`, `maxLength`, `inputMode`, `disabled`).

Run: `grep -n "export function Input" -A 30 packages/ui/src/forge/ui.tsx`

If a prop is missing, **add it to `Input`** (forwarding to the underlying `<input>`) rather than hand-rolling a raw `<input>` here — the sale form must not drift from the kit's focus ring and typography. Keep the addition minimal and typed. If `--danger` is not a defined token, use the token the app already uses for error text (`grep -rn "danger\|error" packages/brand/src/tokens.ts`) and match it.

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS. (The component is not rendered by anything yet — that is Task 8.)

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/\(app\)/vender/_components/personalizado-editor.tsx packages/ui/src/forge/ui.tsx
git commit -m "feat(admin): PersonalizadoEditor — the inline custom-package form"
```

---

### Task 8: Wire it into the sale screen

**Files:**
- Modify: `apps/admin/src/app/(app)/vender/page.tsx`
- Modify: `apps/admin/src/app/(app)/vender/_components/vender.tsx`

**Interfaces:**
- Consumes: everything from Tasks 5, 6, 7.
- Produces: the shipped feature.

**The timezone rule:** the `Hasta` hint for a registered plan is precomputed server-side in the gym's timezone (`PaqueteDTO.hasta`). A custom package's expiry is unknown until `dias` is typed, so the client must compute it — **from the gym's calendar day, never `new Date()`**. The browser clock is the operator's timezone, which is not necessarily the gym's.

- [ ] **Step 1: Pass the gym's today from the server**

In `apps/admin/src/app/(app)/vender/page.tsx`:

```tsx
import { getClientesLite } from "@gym/data/server/clientes";
import { getOperatorGym } from "@gym/data/server/gym";
import { getPaquetes } from "@gym/data/server/paquetes";
import { hoyEnZona, toIsoDay } from "@gym/format";

import { resolveBrand } from "../../../lib/brand";
import { VenderScreen } from "./_components/vender";

export default async function Page({
  searchParams,
}: {
  // Next 15: searchParams is async. The ficha/roster COBRAR deep-links land here
  // as `/vender?cliente=<id>` to preselect an EXISTENTE sale (#77).
  searchParams: Promise<{ cliente?: string }>;
}) {
  const [{ cliente }, paquetes, clientes, brand, gym] = await Promise.all([
    searchParams,
    getPaquetes(),
    getClientesLite(),
    resolveBrand(),
    getOperatorGym(),
  ]);
  // The receipt lockup is the resolved marca's logo (grill lock (g)), rendered
  // server-side and slotted into the client receipt.
  const Lockup = brand.logo;
  return (
    <VenderScreen
      paquetes={paquetes}
      clientes={clientes}
      initialClienteId={cliente ?? null}
      // The GYM's calendar day, not the browser's. A PERSONALIZADO package's expiry
      // is only known once the operator types `dias`, so the client derives the
      // "Hasta …" hint — and it must anchor on the gym's timezone (ADR-0003), the
      // same way PaqueteDTO.hasta is precomputed here for registered plans.
      hoyGym={toIsoDay(hoyEnZona(gym.timezone))}
      lockup={<Lockup size={11} />}
    />
  );
}
```

Check `getOperatorGym`'s signature first (`grep -n "export.*getOperatorGym" -A 6 packages/data/src/server/gym.ts`) — if it requires a client argument, pass `await createClient()` the way its other callers do.

- [ ] **Step 2: Wire the screen**

In `apps/admin/src/app/(app)/vender/_components/vender.tsx`, make these edits and no others.

(a) Imports — add:

```tsx
import { calcVigenciaEnd } from "@gym/domain/rules";
import { fmtShort, parseDay, pesos } from "@gym/format";
import { PersonalizadoEditor } from "./personalizado-editor";
import {
  clienteListo,
  CUSTOM_VACIO,
  customSeleccion,
  paqueteListo,
  PERSONALIZADO,
  precioSeleccionado,
  telError,
  type CustomForm,
} from "./vender-vm";
```

(`pesos` is already imported from `@gym/format`; merge, don't duplicate.)

(b) Props — add `hoyGym` to `VenderScreen`'s signature:

```tsx
  /** The gym's calendar day ("YYYY-MM-DD"), for the custom package's "Hasta …" hint.
   *  Never `new Date()` in here: that is the operator's timezone, not the gym's. */
  hoyGym: string;
```

(c) State — after the `sel` line (~55):

```tsx
  const [custom, setCustom] = React.useState<CustomForm>(CUSTOM_VACIO);
```

(d) Derived values — replace the `paq` / `vigenciaEnd` / `clienteValid` / `canSubmit` block (~85–109):

```tsx
  const esCustom = sel === PERSONALIZADO;
  const paq = sel && !esCustom ? (paquetes.find((p) => p.id === sel) ?? null) : null;
  const vigenciaEnd = paq?.hasta ?? null;

  // The custom package's expiry, derived in the GYM's timezone from the typed `dias`.
  const customHasta = React.useMemo(() => {
    const dias = Number(custom.dias);
    if (!Number.isSafeInteger(dias) || dias < 1) return null;
    return fmtShort(calcVigenciaEnd(parseDay(hoyGym), dias));
  }, [custom.dias, hoyGym]);

  const clienteValid = clienteListo(mode, nuevo.nombre, nuevo.tel, !!existing);
  const paqueteValid = paqueteListo(sel, custom);
  const precio = precioSeleccionado(sel, paq?.precio ?? null, custom);
  const canSubmit = clienteValid && paqueteValid && !!metodo && !submitting;
```

(e) The section summary (~119) — the custom tile has no `paq`:

```tsx
  const paqueteSummary = esCustom
    ? customValido(custom)
      ? `${custom.nombre.trim().toUpperCase()} · ${pesos(Number(custom.precio))}`
      : "PERSONALIZADO"
    : paq
      ? `${paq.nombre.toUpperCase()} · ${pesos(paq.precio)}`
      : null;
```

Add `customValido` to the `./vender-vm` import.

(f) `missing` (~246) — swap the `sel` check for the real gate:

```tsx
  if (!paqueteValid) missing.push("paquete");
```

(g) Auto-advance (~153) — the custom tile must not skip past an unfilled form:

```tsx
  const selectPaquete = (id: string) => {
    setSel(id);
    // A registered plan completes the section the instant it is picked. The custom
    // tile does not: it advances only once its form validates (see setCustomForm).
    if (id !== PERSONALIZADO && openSection === "paquete") advanceFrom("paquete", "metodo");
  };

  // Advance out of PAQUETE the moment the custom form first becomes valid — the same
  // "advance once, on the event that completes the section" discipline as CLIENTE.
  const setCustomForm = (f: CustomForm) => {
    setCustom(f);
    if (sel === PERSONALIZADO && openSection === "paquete" && paqueteListo(PERSONALIZADO, f)) {
      advanceFrom("paquete", "metodo");
    }
  };
```

(h) The accordion section (~289) — `complete` now reads the real gate:

```tsx
        <AccordionSection label="PAQUETE" summary={paqueteSummary} emptyHint="Elegir paquete" complete={paqueteValid} open={openSection === "paquete"} onToggle={() => toggle("paquete")}>
          <PaqueteEditor
            paquetes={paquetes}
            sel={sel}
            setSel={selectPaquete}
            vigenciaEnd={vigenciaEnd}
            custom={custom}
            setCustom={setCustomForm}
            customHasta={customHasta}
          />
        </AccordionSection>
```

(i) The footer (~304–318) — one derived price for both branches. **Keep `CountUp` un-`key`ed** (the comment there explains why: it tweens price→price instead of flashing $0):

```tsx
          <span className="tnum font-extrabold" style={{ fontSize: 30, color: precio !== null ? "var(--fg)" : "var(--muted-soft)", letterSpacing: -0.6 }}>
            {precio !== null ? (
              <CountUp value={precio} format={pesos} />
            ) : (
              <>$<span style={{ opacity: 0.6 }}>—</span></>
            )}
            <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 6, fontWeight: 600 }}>MXN</span>
          </span>
        </div>
        <Button variant="primary" size="lg" full disabled={!canSubmit} iconRight={submitting ? undefined : "arrow"} onClick={() => finish()}>
          {submitting ? "PROCESANDO…" : precio !== null ? `COBRAR ${pesos(precio)}` : "CONFIRMAR VENTA"}
        </Button>
```

(j) `finish` (~163) — send the union:

```tsx
  const finish = async (opts: { forzarNuevo?: boolean } = {}) => {
    if (!canSubmit || !sel || !metodo) return;
    setSubmitting(true);
    try {
      const email = (mode === "new" ? nuevo.email : backfillEmail).trim() || undefined;
      const res = await crearVentaAction({
        mode,
        nuevoNombre: mode === "new" ? nuevo.nombre : undefined,
        nuevoTel: mode === "new" ? nuevo.tel : undefined,
        email,
        clienteId: mode === "existing" ? (clientId ?? undefined) : undefined,
        paquete: esCustom
          ? customSeleccion(custom)
          : { tipo: "registrado" as const, paqueteId: sel },
        metodo: METODO_ENUM[metodo],
        idempotencyKey: idemKey,
        forzarNuevo: opts.forzarNuevo,
      });
```

The rest of `finish` is unchanged.

(k) `resetForm` (~207) — clear the custom form too, or the next sale inherits the last promo:

```tsx
    setSel(null);
    setCustom(CUSTOM_VACIO);
```

(l) `PaqueteEditor` (~642) — add the tile. Append it **after** the `paquetes.map(...)`, inside the same flex column:

```tsx
function PaqueteEditor({
  paquetes,
  sel,
  setSel,
  vigenciaEnd,
  custom,
  setCustom,
  customHasta,
}: {
  paquetes: PaqueteDTO[];
  sel: string | null;
  setSel: (id: string) => void;
  vigenciaEnd: string | null;
  custom: CustomForm;
  setCustom: (f: CustomForm) => void;
  customHasta: string | null;
}) {
  const onCustom = sel === PERSONALIZADO;
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {paquetes.map((p) => {
        const on = sel === p.id;
        return (
          <button
            key={p.id}
            onClick={() => setSel(p.id)}
            className="forge-pressable flex items-center justify-between text-left"
            style={{ padding: 18, background: "transparent", border: `1px solid ${on ? "var(--yellow)" : "var(--line)"}`, color: "var(--fg)", cursor: "pointer", transition: "border-color 140ms ease" }}
          >
            <div className="flex flex-col" style={{ gap: 4 }}>
              <div className="uppercase font-bold" style={{ fontSize: 16, letterSpacing: -0.1 }}>{p.nombre}</div>
              <div className="uppercase" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 0.8 }}>{on && vigenciaEnd ? `Hasta ${vigenciaEnd}` : p.vigencia}</div>
            </div>
            <Tnum className="font-extrabold" style={{ fontSize: 22, color: on ? "var(--yellow)" : "var(--fg)", letterSpacing: -0.4 }}>{pesos(p.precio)}</Tnum>
          </button>
        );
      })}

      {/* Promos, discounts and one-off deals. Never becomes a paquetes row, so it can
          never reach the gym's public catalog (spec §2). */}
      <div style={{ border: `1px solid ${onCustom ? "var(--yellow)" : "var(--line)"}`, transition: "border-color 140ms ease" }}>
        <button
          onClick={() => setSel(PERSONALIZADO)}
          className="forge-pressable flex items-center justify-between text-left"
          style={{ width: "100%", padding: 18, background: "transparent", border: "none", color: "var(--fg)", cursor: "pointer" }}
        >
          <div className="flex flex-col" style={{ gap: 4 }}>
            <div className="uppercase font-bold" style={{ fontSize: 16, letterSpacing: -0.1 }}>Personalizado</div>
            <div className="uppercase" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 0.8 }}>Promo · descuento · plan especial</div>
          </div>
          <Icon name="plus" size={20} color={onCustom ? "var(--gold)" : "var(--muted)"} />
        </button>
        {onCustom && (
          <div style={{ padding: "0 18px 18px" }}>
            <PersonalizadoEditor form={custom} setForm={setCustom} hasta={customHasta} />
          </div>
        )}
      </div>
    </div>
  );
}
```

If `"plus"` is not a valid `IconName`, run `grep -n "IconName" -A 40 packages/ui/src/forge/icon.tsx` and pick an existing one (or add a `plus` glyph in the kit's idiom).

- [ ] **Step 3: Full gate**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS — 868 pre-existing tests plus the new ones from Tasks 5 and 6.

- [ ] **Step 4: Drive the real screen**

Do **not** claim this works because typecheck passed. Start the admin app and walk it:

```bash
pnpm --filter @gym/admin dev
```

Walk all four, on a **local/scratch** database:
1. NUEVO client + PERSONALIZADO ("Promo Verano", $750, 12 clases, 45 días) → footer counts to $750 → COBRAR → the recibo's `CONCEPTO` reads `Promo Verano · $750` and `Vigencia · 45 días`.
2. The ilimitado toggle blanks and disables the classes field; the sale writes a null grant.
3. EXISTENTE client + PERSONALIZADO → stacks onto the existing balance.
4. A **registered** plan still sells exactly as before (the regression that matters most).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/\(app\)/vender/page.tsx apps/admin/src/app/\(app\)/vender/_components/vender.tsx
git commit -m "feat(admin): PERSONALIZADO tile in the Paquete step — promos, discounts, one-off packages"
```

---

### Task 9: The merge gate

**Files:** none — this is verification.

The repo's rule (AGENTS.md): **a migration-bearing change runs `pnpm test:denial` green against a scratch project before it fast-forwards to `main`.** `packages/data` mocks the RPC boundary, so `pnpm test` proves nothing about what the RPC actually writes. This task is where the SQL is first executed.

- [ ] **Step 1: Get a scratch project**

Supabase preview branching is Pro-gated (402), and the free tier fits exactly one scratch project beside live. Create a throwaway project in the Supabase dashboard and take its ref. **It must not be `hjppxawglmukfvsgmcog`** — the runner refuses the live ref, but do not rely on that.

- [ ] **Step 2: Run the suite**

```bash
SUPABASE_TARGET_REF=<scratch-ref> SUPABASE_ACCESS_TOKEN=<pat> pnpm test:denial
```

Expected: every suite green, including the new `registrar_venta_personalizado.sql`. A failing vector surfaces as its `RAISE` message.

- [ ] **Step 3: Fix and re-run until green**

A red vector means the RPC is wrong, not the test. Fix the migration, re-run. Do not quarantine the suite.

- [ ] **Step 4: Record the evidence**

Paste the run's output (suite count and result) into the branch's final commit message or a short note under `docs/superpowers/`. The gate is a convention, not a hook — the evidence is what makes it real.

- [ ] **Step 5: Delete the scratch project**

It holds a copy of the schema and costs a free-tier slot.

---

## Deploy note

Applying migration `20260711100100` drops the 8-arg `registrar_venta`. Between that apply and the matching app deploy, **the old app's COBRAR fails loudly** (`PGRST202` — no function matches the old call). This is the same accepted window as `20260710121000`: apply and deploy back-to-back. It is not zero-downtime, and it should not be discovered at 7pm on a Friday.
