# Renewal Flow Remediation — Implementation Plan (2026-07-10)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement every owner-ruled fix from `docs/FIndings/2026-07-08-renewal-flow-findings.md` (rulings table is authoritative): C1 flat-30 `mes`, C4 purchase-wins stacking, C9 vence-day-valid, C13+C6 locked re-deriving `registrar_venta` with idempotency, D2/D3 dedup guard + unique-email backstop, C7 email backfill on renewal, C2 remove "Por pagar", C12 reservation consume flag, C14 gauge anchor, C15 unified pase surfaces, C8 correction runbook, and reconcile the two live duplicate pairs.

**Architecture:** The stacking/vigencia math moves from `packages/data/.../ventas.ts` into a rewritten `registrar_venta` RPC that re-derives everything from `p_paquete_id` inside one locked transaction (`FOR UPDATE`), per the C13 ruling. `packages/domain/src/rules.ts` stays the executable spec the SQL suites are written against. All RPC-write changes ship with self-asserting SQL suites in `supabase/tests/` (AGENTS.md `test:denial` contract).

**Tech Stack:** pnpm + Turborepo monorepo, Next.js apps, Supabase plpgsql RPCs, vitest, self-asserting SQL denial suites.

## Verified ground truth (re-verified at HEAD `def8434`, 2026-07-10)

The findings doc was pinned to `424e6d5`. Re-verification found:
- **D1 is FIXED** (shipped with #76–79): `cliente-detalle.tsx:42` pushes `/vender?cliente=${c.id}`; `vender/page.tsx:12-27` passes `initialClienteId`; `vender.tsx:48-52` preselects `mode="existing"`. **Do not re-implement.**
- **C11 needs no code change**: every rendered count already derives from `clases_restantes` (`derive.ts:45-47,63,89-93,462`); the ruling keeps `paquete_nombre`. Verify-only.
- **D3 is narrowed** by the claim-code rail (`20260708200002`): only emailless, never-invited duplicates stay orphaned.
- Live prod (project `hjppxawglmukfvsgmcog`): **all 22 RED-live clientes have null email** → tel is the only real dedup axis. Exactly 2 duplicate pairs exist (Jesus Ojeda tel 6142397814, Teodoro Rodriguez tel 6142904320). 8 forge-demo rows share placeholder `seed@mock.test`. **Zero `pendiente` ventas** → C2 removal + CHECK narrowing is data-clean.
- `pasar_lista_sesion_rules.sql:230-242` **actively asserts the same-day double-consume C15 removes** — that block must be rewritten, not extended.
- `toggle_pase_rules.sql` + `toggle_pase_gym2_timezone.sql` are QUARANTINED (pre-Contract-B). C15 changes toggle_pase's contract ⇒ they must be rewritten per-gym and un-quarantined in this change (partial #81).
- `registrar_venta` current version is `20260708200001` (12 params, client-computed absolutes, claim-code mint loop, SECURITY INVOKER, `set search_path to ''`). No FOR UPDATE / ON CONFLICT anywhere.
- `paquetes` columns used by the sale: `nombre, clases (int|null), vigencia_tipo ('mes'|'dias'... verify enum), vigencia_dias (int|null), precio (int)` (`ventas.ts:125`).
- `ventas.fecha` is `timestamptz` (C14 anchor exists); `asistencias.fecha` is `date` + `hora` time.
- Denial gate: PAT lives in `apps/admin/.env.local` (`SUPABASE_ACCESS_TOKEN`); no standing scratch project — create one via Management API, `apply-sql.mjs` replays migrations, run, delete (documented per-slice pattern).

## Global Constraints

- This work favors YAGNI and KISS: ship the minimum diff that satisfies the acceptance criteria and nothing more. Reject any interface, generic, dependency injection, or extracted 'shared' / base module with a single caller in this diff — DRY and SOLID do not justify structure the criteria do not require, and premature abstraction fails YAGNI. Prefer a little duplication over the wrong abstraction. Any deliberate exception must name its concrete present need; unnamed single-caller abstraction is a failure.
- **Denial-gate contract (AGENTS.md):** a migration that changes what an RPC writes ships in the same change with a suite assertion on the **written rows**. Suites are transaction-local, `RAISE` on failure, `rollback` at end. New/renamed suites must be added to `SUITE` in `supabase/tests/run-denial-suite.mjs` (the drift guard enforces disk ⊆ SUITE ∪ QUARANTINE).
- **Cross-package boundary** (dependency-cruiser, runs in `pnpm lint`): `@gym/domain`/`@gym/format`/`@gym/data` never import `@gym/ui`/apps.
- **Pre-commit** runs `pnpm lint && pnpm typecheck && pnpm test`. Never run `husky` with an argument.
- This repo's Next.js has breaking changes — read `node_modules/next/dist/docs/` before writing app-router code.
- All RPCs: keep `SECURITY INVOKER` + `set search_path to ''` + schema-qualified names (match `20260708200001` style). Grants: revoke public/anon, grant authenticated.
- Timezone: gym-local "today" = `(now() at time zone (select timezone from public.gyms where id = v_gym))::date` — same pattern as `20260702170314_toggle_pase_gym_timezone.sql`.
- Commit after every task; messages follow repo style (`feat(scope):`, `fix(scope):`, `test(scope):`, `docs(scope):`).
- Supabase MCP is bound to LIVE prod. Implementation tasks NEVER call MCP tools; migrations are files under `supabase/migrations/` only. Live application happens once, in Task 12, orchestrator-controlled.

## Migration files created by this plan (chronological)

1. `20260710120000_renewal_schema_prep.sql` — Task 3 (ventas.idempotency_key + unique, metodo CHECK narrow, reservation.consumio, placeholder email scrub + partial unique email index)
2. `20260710121000_registrar_venta_rederive.sql` — Task 4 (the C13/C6/C4/C1/C9/C7/D2 RPC rewrite; drops the 12-param overload)
3. `20260710122000_reclamar_email_conflict_guard.sql` — Task 4 (claim RPCs raise a clear error on the new unique index)
4. `20260710123000_reservation_consume_flag.sql` — Task 6 (reservar_clase stamps consumio; cancelar_reserva refunds iff consumio)
5. `20260710124000_toggle_pase_unify_surfaces.sql` — Task 7 (C15 no-double-consume + C9 vigencia check)

---

### Task 1: Domain spec — C1 flat-30, C4 purchase-wins, C9 vence-day-valid in `rules.ts`

**Files:**
- Modify: `packages/domain/src/rules.ts` (calcVigenciaEnd :58-68, stackPaquete :31-37, baseParaStack :179-181, forfeit :165-168, derivarEstado :88-98)
- Test: `packages/domain/src/rules.test.ts`

**Interfaces:**
- Produces: `stackPaquete(actual: Saldo, nuevo: CompraPaquete): Saldo` (same signature, new semantics: purchase wins), `baseParaStack(saldo: Saldo): Saldo` (keeps on `dias >= 0`), `calcVigenciaEnd(fechaCompra, vigencia)` (`mes` → +30 days), `forfeit(clases, dias)` (forfeits on `dias < 0`), `derivarEstado` (expired on `dias < 0`). These functions are the **executable spec** for the Task 4/5 SQL — the SQL suite vectors must mirror these tests' cases.

- [ ] **Step 1: Rewrite the pinned tests to the rulings** in `rules.test.ts`:
  - stackPaquete (replaces the ilimitado-wins arms at :13-29):

```ts
describe("stackPaquete — purchase wins, days carry (ruling C4)", () => {
  it("finite + finite adds classes and days", () => {
    expect(stackPaquete({ clases: 5, dias: 3 }, { clases: 8, dias: 20 })).toEqual({ clases: 13, dias: 23 });
  });
  it("ilimitado base + finite purchase: purchase wins — classes become the pack's count, days add", () => {
    expect(stackPaquete({ clases: "ilimitado", dias: 10 }, { clases: 8, dias: 30 })).toEqual({ clases: 8, dias: 40 });
  });
  it("finite base + ilimitado purchase: becomes unlimited, days add", () => {
    expect(stackPaquete({ clases: 5, dias: 3 }, { clases: "ilimitado", dias: 30 })).toEqual({ clases: "ilimitado", dias: 33 });
  });
  it("ilimitado + ilimitado stays unlimited, days add", () => {
    expect(stackPaquete({ clases: "ilimitado", dias: 4 }, { clases: "ilimitado", dias: 30 })).toEqual({ clases: "ilimitado", dias: 34 });
  });
});
```

  - calcVigenciaEnd (replaces the month-end cases at :56-69): `mes` from any date = that date + 30 days (e.g. 2026-06-01 → 2026-07-01; 2026-12-31 → 2027-01-30; 2026-02-28 → 2026-03-30). Fixed-day arm unchanged.
  - baseParaStack (replaces :154-156): `dias === 0` (vence day) now KEEPS the saldo — `expect(baseParaStack({ clases: 4, dias: 0 })).toEqual({ clases: 4, dias: 0 })`; `dias === -1` forfeits to `{clases: 0, dias: 0}`. Keep the still-valid carry test (:151-153) and the lapsed-ilimitado drop test (:157-159 — semantics unchanged: lapsed means dias < 0 now).
  - forfeit (replaces :136-138): `forfeit(4, 0) === 4` (vence day keeps), `forfeit(4, -1) === 0`.
  - derivarEstado (replaces :101-104): `{clases: 5, dias: 0}` → `"por_vencer"` (valid but ≤5 days); `{clases: 5, dias: -1}` → `"sin_clases"`.

- [ ] **Step 2: Run to verify the new expectations fail**: `pnpm --filter @gym/domain test` → the rewritten cases FAIL against current code.

- [ ] **Step 3: Implement** in `rules.ts`:

```ts
export function stackPaquete(actual: Saldo, nuevo: CompraPaquete): Saldo {
  // Ruling C4 (2026-07-08): the PURCHASED package's type takes effect immediately
  // ("purchase wins"); paid days always carry and add. Classes add only when both
  // sides are finite; buying finite over an active ilimitado yields the pack's count.
  const clases: Clases =
    nuevo.clases === "ilimitado" ? "ilimitado"
    : actual.clases === "ilimitado" ? nuevo.clases
    : actual.clases + nuevo.clases;
  return { clases, dias: actual.dias + nuevo.dias };
}
```

```ts
export function calcVigenciaEnd(fechaCompra: Date, vigencia: Vigencia): Date {
  // Ruling C1 (2026-07-08): "mes" is a flat 30 days — month-end semantics are gone.
  const end = new Date(fechaCompra.getFullYear(), fechaCompra.getMonth(), fechaCompra.getDate());
  end.setDate(end.getDate() + (vigencia === "mes" ? 30 : vigencia));
  return end;
}
```

  - `baseParaStack`: `return saldo.dias >= 0 ? saldo : { clases: 0, dias: 0 };` — update the doc comment: the vence day is a full training day (ruling C9); forfeit starts the day AFTER.
  - `forfeit`: `return dias < 0 ? 0 : clases;`
  - `derivarEstado`: `const expirado = saldo.dias < 0;` (the `<= 5` por_vencer threshold is a warning band, unchanged).
  - Update the header comments of each function to the new rulings (delete the "brief Q1/Q2" claims they contradict).

- [ ] **Step 4: Run domain + full test suites**: `pnpm --filter @gym/domain test` PASS, then `pnpm test` — expect fallout ONLY in `packages/data` tests that seeded `dias: 0` fixtures expecting forfeiture (fix those fixtures to `dias: -1` where the test means "expired", or accept the new vence-day-valid expectation where it means "on the day"). `derive.test.ts` gauge fixtures may shift — adjust to the new boundary, asserting intent (a vence-day member still shows their classes).

- [ ] **Step 5: Commit**: `feat(domain): flat-30 mes, purchase-wins stacking, vence-day-valid boundary (rulings C1/C4/C9)`

---

### Task 2: C14 — anchor the clases gauge at the venta instant

**Files:**
- Modify: `packages/data/src/server/clientes.ts:238-280` (ventas select already pulls `fecha` timestamptz; the in-window filter and the out-of-window count query)
- Test: `packages/data/src/server/clientes.test.ts` (existing ficha suites), `packages/data/src/server/derive.test.ts` only if fixtures shift

**Interfaces:**
- Consumes: `fechaEnZona`, `toIsoDay` from `@gym/format` (already imported there).
- Produces: no signature change — `attendedSincePurchase` just stops counting same-day check-ins that happened before the venta.

- [ ] **Step 1: Write the failing test** in `clientes.test.ts`: seed the fake with a venta at `2026-07-10T18:00:00Z` and two consumed asistencias on the same gym-local day — one with `hora` before the venta's gym-local time, one after. Assert `attendedSincePurchase` (via the ficha shape / gauge `usadas`) counts **1**, not 2. Follow the existing injected-fake pattern in that file.
- [ ] **Step 2: Run it**: `pnpm --filter @gym/data test -- clientes` → FAIL (counts 2).
- [ ] **Step 3: Implement** in `clientes.ts`: compute both the venta's gym-local day AND gym-local time (`HH:MM:SS`) from `ventas[0].fecha`. In-window filter becomes: `a.consumio && (a.fecha > ventaDay || (a.fecha === ventaDay && a.hora >= ventaTime))`. The out-of-window head-count query becomes `.or(\`fecha.gt.${ventaDay},and(fecha.eq.${ventaDay},hora.gte.${ventaTime})\`)` replacing `.gte("fecha", lastPurchaseIso)`. Handle null `hora` rows as counted (legacy rows predate hora? verify column nullability — if `hora` is not-null this clause is moot).
- [ ] **Step 4: Run**: package tests PASS, then `pnpm test`.
- [ ] **Step 5: Commit**: `fix(data): clases gauge anchors at the venta instant — same-day pre-renewal check-ins excluded (C14)`

---

### Task 3: Schema prep migration + suite (idempotency, metodo narrow, consume flag, email index)

**Files:**
- Create: `supabase/migrations/20260710120000_renewal_schema_prep.sql`
- Create: `supabase/tests/renewal_schema_prep.sql` (suite asserting the constraints bite)
- Modify: `supabase/tests/run-denial-suite.mjs` (add suite to `SUITE`)

**Interfaces:**
- Produces (later tasks rely on): `ventas.idempotency_key uuid null` + partial unique `ventas_idem_gym_uq (gym_id, idempotency_key) where idempotency_key is not null`; `ventas.metodo` CHECK narrowed to `('efectivo','transferencia','tarjeta')`; `reservation.consumio boolean not null default false`; partial unique `clientes_email_gym_uq (gym_id, lower(email)) where email is not null`.

- [ ] **Step 1: Verify preconditions** (read-only greps, no MCP): confirm no repo seed/migration inserts a `pendiente` venta (`grep -r "pendiente" supabase/migrations supabase/seed* 2>/dev/null`) and find where `seed@mock.test` rows are inserted (grep). If a seed migration inserts duplicate emails, the scrub statement below must be ordered AFTER it chronologically — it is (20260710 > all).
- [ ] **Step 2: Write the migration**:

```sql
-- Renewal-flow schema prep (rulings C6, C2, C12, D2 — findings 2026-07-08).
-- 1. Idempotency rail for registrar_venta (C6).
alter table public.ventas add column if not exists idempotency_key uuid;
create unique index if not exists ventas_idem_gym_uq
  on public.ventas (gym_id, idempotency_key) where idempotency_key is not null;

-- 2. Ruling C2: every sale collects at COBRAR — 'pendiente' is no longer a method.
--    Live has zero pendiente rows (verified 2026-07-10).
alter table public.ventas drop constraint ventas_metodo_check;
alter table public.ventas add constraint ventas_metodo_check
  check (metodo in ('efectivo', 'transferencia', 'tarjeta'));

-- 3. Ruling C12: record whether the booking consumed a class, so cancel refunds only that.
alter table public.reservation add column if not exists consumio boolean not null default false;

-- 4. D2 backstop: one member row per verified email per gym. Placeholder seed
--    emails (8 distinct demo people sharing seed@mock.test) are scrubbed to NULL
--    first — email is optional and demo rows need no join key.
update public.clientes set email = null where email = 'seed@mock.test';
create unique index if not exists clientes_email_gym_uq
  on public.clientes (gym_id, lower(email)) where email is not null;
```

  Verify the actual CHECK constraint name first (`grep -n "metodo" supabase/migrations/20260530023224_create_ventas_core.sql` — inline checks get auto-names; if it's unnamed, use `alter table ... drop constraint <discovered name from pg_constraint naming convention ventas_metodo_check>`; if the discovered reality differs, adapt and note it in the commit).
- [ ] **Step 3: Write the suite** `supabase/tests/renewal_schema_prep.sql` following the exemplar pattern (`reclamar_por_codigo.sql`): transaction-local fixtures via `gen_random_uuid()`, then assert: (a) inserting a venta with `metodo='pendiente'` raises check_violation; (b) two ventas same `(gym_id, idempotency_key)` raise unique_violation, while two NULL-key ventas coexist; (c) two clientes same gym + same email (case-insensitive) raise unique_violation, while two NULL-email clientes coexist and same email across DIFFERENT gyms coexists; (d) reservation rows default `consumio=false`. `RAISE` on any mismatch, `rollback` at the end.
- [ ] **Step 4: Wire it**: add `renewal_schema_prep` to `SUITE` in `run-denial-suite.mjs` (keep list order logical — after the rekey/core entries). Run `pnpm test` — the drift guard must pass.
- [ ] **Step 5: Commit**: `feat(db): idempotency key, metodo narrowing, reservation consume flag, unique member email (C6/C2/C12/D2)`

---

### Task 4: The C13 centerpiece — re-deriving locked `registrar_venta` + claim-guard + suites

**Files:**
- Create: `supabase/migrations/20260710121000_registrar_venta_rederive.sql`
- Create: `supabase/migrations/20260710122000_reclamar_email_conflict_guard.sql`
- Create: `supabase/tests/registrar_venta_stacking.sql` (the big written-rows suite)
- Modify: `supabase/tests/registrar_venta_email.sql`, `supabase/tests/registrar_venta_stamps_gym_id.sql` (rewrite callers to the new signature; grep ALL of `supabase/tests/` for `registrar_venta` and update every caller)
- Modify: `supabase/tests/run-denial-suite.mjs` (add `registrar_venta_stacking` to SUITE)
- Modify: generated Supabase types consumed by `.rpc("registrar_venta", ...)` — locate with `grep -rn "registrar_venta" packages/data/src` (hand-edit the args/returns type to the new signature; do NOT regenerate from live).

**Interfaces:**
- Produces the new RPC contract (Task 5's TS calls exactly this):

```sql
public.registrar_venta(
  p_metodo text,
  p_paquete_id uuid,
  p_idempotency_key uuid,
  p_cliente_id uuid default null,   -- existing-member sale when set
  p_nombre text default null,        -- required when p_cliente_id is null
  p_tel text default null,           -- required when p_cliente_id is null
  p_email text default null,         -- new-member capture OR existing-member backfill (C7)
  p_forzar_nuevo boolean default false  -- explicit operator override of the dup guard (D2)
) returns table(folio bigint, cliente_id uuid, clases_restantes integer, vence date, paquete_nombre text, monto integer)
```

- [ ] **Step 1: Write the migration.** Full body (adapt claim-code loop verbatim from `20260708200001:52-66`; keep `security invoker`, `set search_path to ''`, revoke/grant tail):

```sql
-- Ruling C13 (findings 2026-07-08): registrar_venta re-derives everything from the
-- paquete row inside one locked transaction. The client sends identity + paquete +
-- metodo + an idempotency key — never balances, prices, or dates. Kills C13 (trust),
-- C6 (idempotency/concurrency), C5 (stale-read race) in one move; implements C1
-- (flat-30 mes), C4 (purchase wins, days carry), C9 (vence day valid), C7 (email
-- backfill via coalesce), D2 (duplicate guard). rules.ts is the executable spec;
-- the registrar_venta_stacking suite pins this SQL to it.

drop function if exists public.registrar_venta(
  text, text, text, text, integer, text, uuid, integer, date, integer, integer, text);

create or replace function public.registrar_venta(
  p_metodo text,
  p_paquete_id uuid,
  p_idempotency_key uuid,
  p_cliente_id uuid default null,
  p_nombre text default null,
  p_tel text default null,
  p_email text default null,
  p_forzar_nuevo boolean default false
) returns table(folio bigint, cliente_id uuid, clases_restantes integer, vence date, paquete_nombre text, monto integer)
language plpgsql
set search_path to ''
as $$
declare
  v_gym uuid;
  v_tz text;
  v_hoy date;
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

  -- Package facts come from the DB, never the client (C13).
  select p.nombre, p.clases, p.vigencia_tipo, p.vigencia_dias, p.precio into v_paq
    from public.paquetes p where p.id = p_paquete_id and p.gym_id = v_gym;
  if not found then raise exception 'Paquete no encontrado'; end if;

  select g.timezone into v_tz from public.gyms g where g.id = v_gym;
  v_hoy := (now() at time zone v_tz)::date;

  -- Ruling C1: 'mes' is a flat 30 days.
  v_compra_dias := case when v_paq.vigencia_tipo = 'mes' then 30
                        else coalesce(v_paq.vigencia_dias, 0) end;

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

  -- stackPaquete, ruling C4: purchase wins, days carry.
  if v_paq.clases is null then
    v_new_clases := null;                                   -- becomes ilimitado
  elsif p_cliente_id is not null and v_base_clases is null
        and (v_cli.vence is not null and (v_cli.vence - v_hoy) >= 0) then
    v_new_clases := v_paq.clases;                           -- ilimitado -> finite: pack's count
  else
    v_new_clases := coalesce(v_base_clases, 0) + v_paq.clases;
  end if;
  v_new_dias := v_base_dias + v_compra_dias;
  v_new_vence := v_hoy + v_new_dias;

  if p_cliente_id is not null then
    update public.clientes c
      set clases_restantes = v_new_clases,
          vence = v_new_vence,
          paquete_nombre = v_paq.nombre,
          email = coalesce(p_email, c.email)               -- C7 backfill
      where c.id = p_cliente_id;
    v_cliente_id := p_cliente_id;
  else
    loop
      v_code := (claim-code mint — copy the exact loop body from 20260708200001:52-66);
      begin
        insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, email, claim_code)
          values (trim(p_nombre), p_tel, v_new_clases, v_new_vence, v_paq.nombre, v_gym, p_email, v_code)
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
  insert into public.ventas (cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, gym_id, idempotency_key)
    values (v_cliente_id, v_folio, v_paq.nombre, v_paq.clases, v_paq.vigencia_tipo, v_paq.vigencia_dias, v_paq.precio, p_metodo, v_gym, p_idempotency_key);

  return query
    select v_folio, c.id, c.clases_restantes, c.vence, c.paquete_nombre, v_paq.precio
      from public.clientes c where c.id = v_cliente_id;
end;
$$;

revoke all on function public.registrar_venta(text, uuid, uuid, uuid, text, text, text, boolean) from public, anon;
grant execute on function public.registrar_venta(text, uuid, uuid, uuid, text, text, text, boolean) to authenticated;
```

  (The claim-code line is a placeholder by intent — copy the mint expression verbatim from `20260708200001`; everything else above is complete. Adjust the drop signature to the exact 12-param order in `20260708200001:15-28`.)
- [ ] **Step 2: Write `20260710122000_reclamar_email_conflict_guard.sql`**: wrap the email-overwrite statements in `reclamar_por_codigo` (`20260708200002:73-80`) and the create/claim path of `reclamar_o_crear_cliente` (`20260710030000`) with `exception when unique_violation then raise exception 'Este correo ya pertenece a otro registro de este gym'` — re-emit each function whole (create or replace) with only that guard added. The new unique email index makes this collision reachable at claim time; it must fail with a human message, not a raw 23505.
- [ ] **Step 3: Write `supabase/tests/registrar_venta_stacking.sql`** — the written-rows contract, one vector per rules.ts spec case (transaction-local fixtures, staff JWT via `set_config`, `RAISE` on mismatch, rollback). Vectors (assert `clientes.clases_restantes`, `clientes.vence`, `clientes.paquete_nombre`, `clientes.email`, and the `ventas` row's `monto/metodo/gym_id/idempotency_key` — the WRITTEN rows, per #78/#80):
  1. Fresh finite sale, new client → clases = pack, vence = hoy + vigencia_dias, venta.monto = paquete.precio (ignoring any client-sent value is now structural).
  2. Fresh `mes` sale → vence = hoy + 30 (C1).
  3. Early `mes` renewal (vence in 10 days) → new vence = old vence + 30 (C1 flat extend).
  4. Renewal ON the vence day, finite base {4 clases, dias 0} + 8-class/30-day pack → 12 clases, vence = hoy + 30 (C9 carry).
  5. Lapsed base (vence yesterday, 4 clases) + 8/30 pack → 8 clases (forfeit), vence = hoy + 30.
  6. Active ilimitado + finite pack → clases = pack's count, days add (C4 purchase wins).
  7. Finite + ilimitado pack → clases_restantes NULL, days add (C4).
  8. Idempotent replay: call twice with the same p_idempotency_key → ONE ventas row, same folio returned, saldo written once (C6).
  9. Duplicate guard: second new-client call with the same tel → raises `CLIENTE_DUPLICADO:%`; with `p_forzar_nuevo => true` → inserts (D2).
  10. C7: existing-client sale with p_email → email written; with p_email null → prior email kept.
  11. `p_metodo => 'pendiente'` → raises (C2).
  12. Cross-gym paquete id → 'Paquete no encontrado' (scope).
- [ ] **Step 4: Update every old-signature caller** in `supabase/tests/` (grep `registrar_venta`) — `registrar_venta_email.sql` and `registrar_venta_stamps_gym_id.sql` keep their intents (email persisted on create; gym stamped server-side) but call the new signature. Add `registrar_venta_stacking` to `SUITE`.
- [ ] **Step 5: Hand-edit the generated RPC types** in packages/data (found via grep) to the new args/returns.
- [ ] **Step 6: Run `pnpm test`** (drift guard + typecheck fallout will point at Task 5's TS — if `ventas.ts` no longer compiles, that is EXPECTED; do Task 5 before committing if the pre-commit hook blocks, else commit migrations+suites alone if green).
- [ ] **Step 7: Commit**: `feat(db): registrar_venta re-derives in a locked txn — paquete_id in, written rows out (C13/C6/C4/C1/C9/C7/D2)`

---

### Task 5: TS write path + vender UI — thin client, idempotency, email backfill, no Por pagar

**Files:**
- Modify: `packages/data/src/server/ventas.ts` (crearVenta slims; schema gains `idempotencyKey`, `email` both modes, `forzarNuevo`; METODOS drops `"pendiente"`), `packages/data/src/server/ventas.test.ts` (rewrite the arg-spread pins)
- Modify: `packages/domain/src/types.ts` if `MetodoPago` includes `"pendiente"` (drop it; chase compile fallout — `derive.ts:253` per-sale display, `export/rows.ts`, etc.)
- Modify: `apps/admin/src/app/(app)/vender/_components/vender.tsx` (remove Por pagar toggle :598-607 + `Metodo` mapping :19-26; add existing-mode email field; duplicate dialog on `CLIENTE_DUPLICADO`; idemKey state), `vender/actions.ts`, `recibo.tsx` (drop POR PAGAR display), `vender-vm.ts/.test.ts` if touched
- Test: existing test files above

**Interfaces:**
- Consumes: Task 4's RPC contract exactly.
- Produces: `crearVenta(raw, client?)` same export; `crearVentaSchema` now `{ mode, nuevoNombre?, nuevoTel?, email?, clienteId?, paqueteId, metodo: 'efectivo'|'transferencia'|'tarjeta', idempotencyKey: uuid string, forzarNuevo?: boolean }`. On the RPC raising `CLIENTE_DUPLICADO:<uuid>`, crearVenta throws `DuplicadoError` (a named Error subclass carrying `existingId: string` — present need: vender.tsx switches on it to open the "¿Usar existente?" dialog).

- [ ] **Step 1: Rewrite `ventas.test.ts` pins first** (they assert the OLD arg spread — :136, :155, :172): new assertions per mode: RPC called with `p_paquete_id`, `p_idempotency_key`, `p_metodo`, and only identity fields; **no** `p_clases_restantes`/`p_vence`/`p_monto` keys exist in the payload. Add: replayed key passes the same `p_idempotency_key`; `CLIENTE_DUPLICADO:<id>` rpc error surfaces as `DuplicadoError` with the id; metodo `"pendiente"` fails schema parse. Run → FAIL.
- [ ] **Step 2: Slim `crearVenta`**: keep requireOperator + gym read; keep the paquete read **for display only** (nombre/vigencia/precio feed the receipt + plantilla ctx); delete the cliente read, the `compraDias`/`stackPaquete`/`baseParaStack`/`addDays` math (drop those imports), and pass through the RPC contract. Receipt fields (`venceDisplay`, ctx `clases`, `dias`) now come from the RPC's returned `vence`/`clases_restantes` (`parseDay` + `fmtShort` + `diasRestantes` for display only). `metodoDisplay` loses the pendiente branch. `isNew` = `!input.clienteId`... keep `mode` as-is for UI semantics.
- [ ] **Step 3: Run** ventas tests → PASS; `pnpm typecheck` to chase `MetodoPago` fallout.
- [ ] **Step 4: vender.tsx** (taste bar: match existing component idiom):
  - Delete the "Registrar como por pagar" toggle and the `"Por pagar"` member of the local `Metodo` union/mapping.
  - `const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());` — reset alongside the existing post-receipt/"vender otra" form reset. Pass through the action. An error retry keeps the same key (that is the point).
  - Existing mode: render the same optional email `Input` used in new mode when the selected roster member has no email (roster rows carry `email` — verify the `clientes` prop select), prefilled empty, forwarded as `email`.
  - On action failure with `duplicado`: dialog offering "USAR EXISTENTE" (switch to `mode="existing"` + `clienteId = existingId`, matching the existing dupMatch banner's action at :246-252) or "CREAR NUEVO DE TODOS MODOS" (`forzarNuevo: true` retry). Reuse the existing dupMatch banner styling — no new abstraction.
- [ ] **Step 5: `vender/actions.ts`**: thread `idempotencyKey`/`email`/`forzarNuevo`; map `DuplicadoError` to a typed `{ ok: false, duplicado: { id } }` result the component switches on (match the action's existing result shape convention).
- [ ] **Step 6: Full gate**: `pnpm lint && pnpm typecheck && pnpm test` green.
- [ ] **Step 7: Commit**: `feat(admin): thin sale client — idempotent COBRAR, email backfill on renewal, Por pagar removed, duplicate confirm (C6/C7/C2/D2)`

---

### Task 6: C12 — reservation consume flag through book/cancel

**Files:**
- Create: `supabase/migrations/20260710123000_reservation_consume_flag.sql` (re-emit `reservar_clase` from `20260706170000:122-234` stamping `consumio = (decrement happened)`, i.e. true iff the finite-plan guarded decrement updated a row; re-emit `cancelar_reserva` from `20260706180000:28-103` refunding `+1` **iff** the cancelled reservation row has `consumio = true`, clearing... no — leave `consumio` as the historical fact, just gate the refund on it)
- Modify: `supabase/tests/reservar_clase_rules.sql`, `supabase/tests/cancelar_reserva_rules.sql` — add written-row vectors
- (Column already added by Task 3.)

**Interfaces:**
- Consumes: `reservation.consumio` from Task 3.
- Produces: no API change — booking/cancel signatures unchanged.

- [ ] **Step 1: Migration** — in `reservar_clase`, capture the decrement: `update ... set clases_restantes = clases_restantes - 1 where ... and clases_restantes > 0` → use `GET DIAGNOSTICS v_consumed = ROW_COUNT` (or `returning true into v_consumed`) and write `consumio = coalesce(v_consumed, false)` on the reservation INSERT. In `cancelar_reserva`, replace the finite-only unconditional `+1` with: refund only when the just-cancelled row had `consumio` (read it in the same guarded UPDATE ... RETURNING).
- [ ] **Step 2: Suite vectors** (both files): (a) ilimitado books → reservation row `consumio=false`, saldo untouched; cancel → **no** refund, saldo still untouched (the C12 phantom-class bug, now pinned); (b) finite books → `consumio=true`, saldo −1; cancel → +1 restored; (c) the findings' flip scenario: ilimitado books (consumio=false) → plan flips to finite (simulate: update clientes to finite saldo in-fixture) → cancel → saldo unchanged (no phantom credit).
- [ ] **Step 3: `pnpm test`** (drift guard; suites are already in SUITE).
- [ ] **Step 4: Commit**: `fix(db): reservations record consumption; cancel refunds only what booking consumed (C12)`

---

### Task 7: C15 + C9-attendance — unified pase surfaces, vigencia check on toggle_pase

**Files:**
- Create: `supabase/migrations/20260710124000_toggle_pase_unify_surfaces.sql` (re-emit toggle_pase from `20260706180200:26-91` with the additions below)
- Modify: `packages/data/src/server/asistencia.ts:52` (getMarcadas stops filtering `class_session_id is null`) + its test file
- Modify: `supabase/tests/pasar_lista_sesion_rules.sql:230-242` (the xseam block — REWRITE: it currently asserts the double-consume as correct)
- Rewrite + un-quarantine: `supabase/tests/toggle_pase_rules.sql`, `supabase/tests/toggle_pase_gym2_timezone.sql` (per-gym fixtures like the exemplar; move both from `QUARANTINE` to `SUITE` in the runner — partial #81; keep their original intents: consume/refund/idempotent-toggle semantics + gym2 timezone day-boundary)
- Modify: `apps/admin/src/app/(app)/asistencia/_components/asistencia.tsx` only if the error toast needs the new message surfaced (verify existing error handling; add nothing else)

**Interfaces:**
- Consumes: gym-tz day pattern; `asistencias.class_session_id`; `reservation.status/consumio`; `class_session.starts_at`.
- Produces: toggle_pase semantics — ruling C15: one attended class = one consumed class regardless of surface.

- [ ] **Step 1: Migration — toggle_pase additions** (keep everything else verbatim):
  - **C9 vigencia (inclusive):** before the toggle-ON insert, read the cliente's `vence` (in the existing cliente lookup); `if v_vence is not null and v_vence < p_fecha then raise exception 'Paquete vencido';` — the vence day itself passes.
  - **C15 same-day session mark:** if a non-deleted `asistencias` row exists for `(cliente, p_fecha)` with `class_session_id is not null`, raise `'Asistencia de clase ya registrada — gestiónala en la clase'` instead of inserting a second consuming row. (The member now shows as marked on the pase page via getMarcadas, so this is a mistap guard, not a normal path.)
  - **C15 active reservation:** if a `reservation` row `status='reservada'` exists for this member on a session whose gym-local `starts_at::date = p_fecha`, insert the front-desk attendance with `consumio = false` and NO decrement (the class was paid at booking). Toggle-OFF refund logic already keys on the row's `consumio` — verify it does (`v_active_consumio`, `20260706180200:66-68`) and keep it.
- [ ] **Step 2: getMarcadas** — drop `.is("class_session_id", null)` (`asistencia.ts:52`); update its unit test to seed one session-linked and one front-desk row and expect both cliente_ids marked.
- [ ] **Step 3: Rewrite the xseam block** in `pasar_lista_sesion_rules.sql`: after a session pase (5→4), the front-desk toggle on the same date must now (a) raise the session-managed error, and (b) leave the balance at 4 — assert both (written-rows rule).
- [ ] **Step 4: Rewrite the two quarantined toggle_pase suites** per-gym (fixtures minted transaction-locally, staff JWT per gym, zero `user_id` references): original vectors (consume on ON, refund on OFF, no-negative-balance, timezone day boundary for gym2) PLUS the new vigencia + reservation-no-consume vectors. Move both filenames from QUARANTINE to SUITE.
- [ ] **Step 5: `pnpm test`** green (drift guard sees the moves).
- [ ] **Step 6: Commit**: `fix(db): one visit one consume across pase surfaces + vence-day-valid attendance (C15/C9, un-quarantines toggle_pase suites)`

---

### Task 8: Docs — ADR amendments, C8 correction runbook, duplicate-merge runbook

**Files:**
- Modify: `docs/adr/0005-atomic-write-rpcs.md` (dated addendum: the thin-seam "math stays in TS / DB never does that math" clause is superseded by ruling C13 — registrar_venta re-derives inside a locked txn; rules.ts remains the executable spec, pinned by `registrar_venta_stacking.sql`)
- Modify: `docs/adr/0003-stacking-forfeit-dates.md` (dated addendum: C4 purchase-wins replaces ilimitado-wins; C9 vence-day-valid boundary; C1 flat-30 mes)
- Create: `docs/runbooks/venta-correction.md` (C8 ruling: service-role correction recipe — compensating negative venta + saldo fix in ONE transaction, with a worked example; explicitly: never UPDATE/DELETE ventas rows, the ledger is append-only)
- Create: `docs/runbooks/duplicate-member-merge.md` (the Part C constraints as procedure: repoint ventas/asistencias/reservation by cliente_id to the survivor — never delete first; survivor = oldest row; survivor takes the newest row's saldo/vence/paquete_nombre; pre-resolve reservation_member_session_uq and auth_user_id uniqueness; verify counts before/after; then delete the emptied duplicate row. Include the exact SQL used for the two 2026-07-10 pairs as the worked example.)

- [ ] **Step 1:** Write all four docs. Keep each addendum to the decision delta + date + pointer to the findings doc — no restated history.
- [ ] **Step 2:** Commit: `docs: ADR-0003/0005 ruling addenda + venta-correction and duplicate-merge runbooks (C8, D2/D3)`

---

### Task 9: Full verification sweep

- [ ] **Step 1:** `pnpm lint && pnpm typecheck && pnpm test` at repo root — all green.
- [ ] **Step 2:** keep-it-lean pass over the whole diff (`git diff main...HEAD`): deletion test on every new module/flag/param; no-op test on every comment; confirm no single-caller abstraction crept in.
- [ ] **Step 3:** Re-read the findings doc's ruling table top to bottom; check each ruling maps to a shipped commit (C1,C2,C4,C6,C7,C9,C11-verify,C12,C13,C14,C15,C8,D2,D3). C3/C5 close by entailment. Record the mapping in the session report.

### Task 10: Denial gate (scratch project) — orchestrator-run

- [ ] Create a throwaway free-tier scratch project via the Supabase Management API (PAT from `apps/admin/.env.local`); apply all migrations with `supabase/tests/apply-sql.mjs`; run `SUPABASE_ACCESS_TOKEN=<pat> SUPABASE_TARGET_REF=<scratch-ref> pnpm test:denial` → ALL suites green (now 27 + 3 new + 2 un-quarantined = 32 running, 3 quarantined). Fix and re-run until green. Delete the scratch project afterwards.

### Task 11: Gates — Elegance + Senior Dev approval (user-mandated)

- [ ] Independent review agents (fable-5/opus-4.8) over the full branch diff, looped until both answer an unqualified yes; restructure on any no. Findings fixed, suite re-run if RPC-touching.

### Task 12: Ship — live apply, reconcile, merge

Orchestrator-run, in this order (each step gated on the previous):
- [ ] Apply the 5 migrations to live via MCP `apply_migration` (schema prep first; zero-downtime safe: new RPC signature deploys before the new client code is live).
- [ ] Execute the duplicate merge for the two pairs per the runbook (snapshot affected rows to the session scratchpad first; verify counts after).
- [ ] Fast-forward `main` to the branch, push (solo-main workflow), confirm Vercel deploy.
- [ ] Close/annotate: findings doc status line, #81 (partial — 2 of 5 suites rewritten), memory update.

## Self-review notes (writing-plans checklist)

- **Spec coverage:** every ruling in the authoritative table maps to a task (C1/C4/C9→T1+T4, C2→T3+T5, C6→T3+T4+T5, C7→T4+T5, C13→T4, C12→T3+T6, C14→T2, C15→T7, C8→T8, D2/D3→T3+T4+T5+T8+T12, C11 verify→T9, C3/C5 entailed). Fixed-day stacking stays untouched (INTENDED).
- **Type consistency:** RPC contract in T4 == TS calls in T5 (8 params, 6-column return). `DuplicadoError` defined T5, consumed T5 only.
- **Known judgment calls (for the gate reviewers):** (a) dup guard matches on exact tel OR ci-email with an explicit operator override — family-shared phones stay sellable; (b) `mes` maps to flat 30 via one `case` expression, no new Vigencia type; (c) toggle_pase raises on session-marked mistaps rather than silently no-oping; (d) survivor-takes-newest-saldo merge rule matches what correct stacking would have produced (expired base → renewal's fresh saldo).
