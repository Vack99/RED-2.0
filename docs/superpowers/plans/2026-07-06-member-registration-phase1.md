# Member Registration SSOT — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make client-app member registration produce a single, bookable, correctly-gated account — close the accidental-Ilimitado hole and capture email on the admin sale so the two doors converge — with zero Stripe.

**Architecture:** Two additive Supabase migrations (`create or replace` the SECURITY DEFINER claim RPC to start fresh self-registrants at a finite `0` balance; drop+recreate the SECURITY INVOKER `registrar_venta` to accept a nullable `p_email` stored on the new `clientes` row), one DAL edit to pass `p_email` through, one admin-form field. Reuses the live claim RPC, balance writer, and booking gate — no new architecture.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase Postgres + RLS, TypeScript, Zod, Vitest (DAL unit tests via injected fake client, ADR-0001), SQL denial-suite (`supabase/tests/*.sql`, transaction-local BEGIN/ROLLBACK, self-asserting).

**Design spec:** `docs/superpowers/specs/2026-07-06-member-registration-payment-strategy-design.md`

## Global Constraints

- **Forge-safe / expand-only:** every migration is `create or replace` / drop+immediately-recreate, out-of-order-safe on live; nothing destructive; Forge stays green.
- **`p_email` / the form email field are NULLABLE, never required** — a cash-only walk-in with no email must still save (spec decision, owner-confirmed 2026-07-06).
- **Never block the sale on the email.** The email is an optional convenience key, never a gate. `crearVenta` calls `crearVentaSchema.parse(raw)` unguarded (`ventas.ts:90`), so the email's Zod rule must be a normalizer that CANNOT throw on any non-empty string — no format validation (`.email()`) that would reject a cash sale on an operator typo (spec §3.4, owner-locked; overrides §3.3's literal `.email()` snippet).
- **Posture preserved verbatim:** `reclamar_o_crear_cliente` stays `SECURITY DEFINER`, `set search_path=''`; `registrar_venta` stays `SECURITY INVOKER`, `set search_path=''`. No `user_id` in any INSERT (Contract-B, `20260705082018` — live).
- **Fresh self-registrant balance = `0` (finite), not `NULL`** — `NULL` = Ilimitado = free unlimited booking.
- **No lowercasing in SQL** — the claim compares `lower(email)` on both sides; the form `trim()`s. Store email as entered (trimmed).
- **SQL-test operator bootstrap = `gym_membership`, never `perfil.user_id`.** Contract-B (`20260705082018`) DROPPED `perfil.user_id`; `perfil` now has only `{id, negocio, coach, tel, ciudad, created_at, gym_id}`. Every ad-hoc money-path test resolves its operator session from the forge gym's owner/operator `gym_membership` row — the exact `(user_id, role in ('owner','operator'))` predicate `staff_gym()` itself keys on — so the session is staff of forge and RLS scopes `clientes`/`ventas` to it. Reading `perfil.user_id` raises `column "user_id" does not exist` at fixture setup.
- **Gate stays green:** `pnpm lint && pnpm typecheck && pnpm test` (pre-commit hook) plus `pnpm test:denial` for the self-seeding SQL suite.
- **DB test/apply target:** the scratch Supabase ref (memory: `SUPABASE_TARGET_REF`). SQL suites are BEGIN/ROLLBACK so they mutate nothing; apply migrations to the same scratch ref between a test's red and green. Live apply is the deploy step, not part of the TDD loop.
- Migration timestamps must sort AFTER the latest existing migration (`20260706230000_seed_red_demo_remediation_content.sql`).

---

### Task 1: Close the self-registration Ilimitado hole

Fresh (unmatched) self-registrants must start with a FINITE `0` balance, not `NULL` (= Ilimitado). Only the **create** path changes; the claim path (matched an existing sale-created row) is untouched.

**Files:**
- Create: `supabase/migrations/20260706231500_reclamar_create_zero_saldo.sql`
- Modify: `supabase/tests/registro_claim.sql` (V2 — add a `clases_restantes = 0` assertion)

**Interfaces:**
- Produces: `public.reclamar_o_crear_cliente(p_gym_id uuid) returns table(cliente_id uuid, reclamado boolean)` — signature UNCHANGED (body-only change); relied on by `packages/data/src/server/registro.ts` `reclamarCliente`.

- [ ] **Step 1: Add the failing assertion to `registro_claim.sql` V2 (create-on-no-match)**

In the V2 `do $$ ... $$` block, extend the fresh-row SELECT and add the balance assertion:

```sql
  select nombre, tel, gym_id, auth_user_id, clases_restantes into rec from public.clientes where id = r.cliente_id;
  if rec.auth_user_id <> un then raise exception 'V2 FAIL: fresh cliente not owned by the registrant'; end if;
  if rec.gym_id <> g then raise exception 'V2 FAIL: fresh cliente not scoped to the resolved gym'; end if;
  if rec.nombre <> 'Nora Nueva' then raise exception 'V2 FAIL: nombre not carried from signup metadata (%)', rec.nombre; end if;
  if rec.tel <> '6142223344' then raise exception 'V2 FAIL: tel not derived from phone_e164 (%)', rec.tel; end if;
  if rec.clases_restantes is distinct from 0 then raise exception 'V2 FAIL: fresh self-registrant must start at 0 clases (finite), got % — NULL means Ilimitado = free booking', rec.clases_restantes; end if;
```

- [ ] **Step 2: Run the suite to verify V2 fails against current schema**

Run (via the Supabase MCP `execute_sql`, pasting the full file contents of `supabase/tests/registro_claim.sql`, against the scratch ref):
Expected: raises `V2 FAIL: fresh self-registrant must start at 0 clases (finite), got <NULL>` (the live create path leaves `clases_restantes` NULL).

- [ ] **Step 3: Author the migration**

Create `supabase/migrations/20260706231500_reclamar_create_zero_saldo.sql` — body byte-identical to the live Contract-B definition except the create-path INSERT sets `clases_restantes = 0`:

```sql
-- Close the self-registration Ilimitado hole (Defect B). A fresh, unmatched self-registrant must start
-- with a FINITE zero balance, not NULL (= Ilimitado), so reservar_clase blocks them until a sale grants
-- classes AND the later sale stacks correctly. Body identical to the live Contract-B definition
-- (20260705082018) except the create-path INSERT now sets clases_restantes = 0. Idempotent create-or-replace;
-- SECURITY DEFINER / search_path='' / EXECUTE grants preserved. Expand-only, Forge-safe, out-of-order-safe.
create or replace function public.reclamar_o_crear_cliente(p_gym_id uuid)
  returns table (cliente_id uuid, reclamado boolean)
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_email  text;
  v_conf   timestamptz;
  v_meta   jsonb;
  v_nombre text;
  v_phone  text;
  v_tel    text;
  v_cli    uuid;
  v_n      int;
  v_reclamado boolean := false;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select u.email, u.email_confirmed_at, u.raw_user_meta_data
    into v_email, v_conf, v_meta
    from auth.users u where u.id = v_uid;
  if v_conf is null then
    raise exception 'Correo no verificado';
  end if;

  v_nombre := coalesce(nullif(btrim(v_meta ->> 'full_name'), ''), split_part(v_email, '@', 1));
  v_phone  := nullif(v_meta ->> 'phone_e164', '');

  select id into v_cli from public.clientes
    where gym_id = p_gym_id and auth_user_id = v_uid
    limit 1;
  if v_cli is not null then
    insert into public.gym_membership (user_id, gym_id, role)
      values (v_uid, p_gym_id, 'member') on conflict (user_id, gym_id) do nothing;
    cliente_id := v_cli; reclamado := false; return next; return;
  end if;

  select count(*) into v_n from public.clientes
    where gym_id = p_gym_id and auth_user_id is null and lower(email) = lower(v_email);

  if v_n = 1 then
    select id into v_cli from public.clientes
      where gym_id = p_gym_id and auth_user_id is null and lower(email) = lower(v_email)
      for update;
    if v_cli is not null then
      update public.clientes
         set auth_user_id = v_uid,
             phone_e164 = coalesce(v_phone, phone_e164),
             terms_accepted_at = now(),
             privacy_accepted_at = now()
       where id = v_cli and auth_user_id is null;
      if found then
        v_reclamado := true;
      else
        v_cli := null;
      end if;
    end if;
  end if;

  if v_cli is null then
    if v_phone is null then
      raise exception 'Teléfono requerido';
    end if;
    v_tel := right(regexp_replace(v_phone, '\D', '', 'g'), 10);
    insert into public.clientes
      (gym_id, auth_user_id, nombre, tel, phone_e164, clases_restantes, terms_accepted_at, privacy_accepted_at)
      values (p_gym_id, v_uid, v_nombre, v_tel, v_phone, 0, now(), now())
      returning id into v_cli;
  end if;

  insert into public.gym_membership (user_id, gym_id, role)
    values (v_uid, p_gym_id, 'member') on conflict (user_id, gym_id) do nothing;

  cliente_id := v_cli; reclamado := v_reclamado; return next;
end;
$function$;
```

- [ ] **Step 4: Apply the migration to the scratch ref, then re-run the suite**

Apply via the Supabase MCP `apply_migration` (name `reclamar_create_zero_saldo`, the SQL above) to the scratch ref, then re-run `registro_claim.sql` via `execute_sql`.
Expected: `registro claim suite: OK` (V2 now sees `clases_restantes = 0`; V1/V3–V8 unaffected).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260706231500_reclamar_create_zero_saldo.sql supabase/tests/registro_claim.sql
git commit -m "fix(data): fresh self-registrants start at 0 clases, not Ilimitado"
```

---

### Task 2: `registrar_venta` captures email (the two-doors join key)

Add a nullable `p_email` to `registrar_venta`, stored on the new `clientes` row so Door 2's verified-email claim can later match. Signature changes → drop+recreate + re-grant.

The two money-path SQL tests both resolve their operator session at fixture setup. The live checkout of this repo still reads `perfil.user_id` there — a column Contract-B (`20260705082018`) DROPPED — so **the existing regression test is already broken** and the new test would abort at setup before proving anything. Step 1 repairs the operator bootstrap in the existing test (establishing a real green baseline the regression check can rely on) and the new test is authored with the correct bootstrap from the start. Both read the forge gym's owner/operator `gym_membership` row — the exact predicate `staff_gym()` keys on.

**Files:**
- Modify: `supabase/tests/registrar_venta_stamps_gym_id.sql` (repair the operator bootstrap: `perfil.user_id` → `gym_membership`)
- Create: `supabase/tests/registrar_venta_email.sql`
- Create: `supabase/migrations/20260706232500_registrar_venta_capture_email.sql`

**Interfaces:**
- Produces: `public.registrar_venta(p_nombre text, p_tel text, p_paquete_nombre text, p_vigencia_tipo text, p_monto integer, p_metodo text, p_cliente_id uuid, p_clases_restantes integer, p_vence date, p_clases integer, p_vigencia_dias integer, p_email text) returns table(folio bigint, cliente_id uuid)` — `p_email` is the new 12th param (DEFAULT NULL). Consumed by `packages/data/src/server/ventas.ts` `crearVenta`.

- [ ] **Step 1: Repair the existing regression test's operator bootstrap, then establish a real green baseline**

`supabase/tests/registrar_venta_stamps_gym_id.sql` currently bootstraps the operator from `perfil.user_id` (lines 17–23), which Contract-B dropped — so it errors at setup and cannot report OK. This test is the regression gate Step 6 depends on; it must actually pass **before** we trust it. Replace its bootstrap block (the comment on lines 17–18 and the first `set_config('app.op', …)` call on lines 19–23) with the `gym_membership` lookup:

```sql
-- Resolve the operator at runtime (the only env-dependent value): the forge gym's owner/operator
-- gym_membership row carries a real auth.users id (perfil.user_id was dropped by Contract-B,
-- 20260705082018). staff_gym() resolves the caller's gym from this same (user_id, role in
-- ('owner','operator')) predicate, so the session is staff of forge and RLS scopes clientes/ventas to it.
select set_config(
  'app.op',
  (select user_id::text from public.gym_membership
     where gym_id = (select id from public.gym where slug = 'forge')
       and role in ('owner', 'operator')
     order by created_at
     limit 1),
  true
);
```

Leave the rest of the file (the `request.jwt.claims` set_config, `set local role authenticated`, and both new/existing-cliente assertion blocks) unchanged. Then run the file via `execute_sql` against the scratch ref.
Expected: `registrar_venta gym_id stamping: OK` — proving the repaired bootstrap resolves a real forge operator and the current (11-arg) function still stamps gym_id. This is the green baseline the Step 6 regression check re-runs after the migration.

- [ ] **Step 2: Write the failing SQL test**

Create `supabase/tests/registrar_venta_email.sql`:

```sql
-- registrar_venta email-capture test: the NEW-cliente path stores clientes.email = p_email so Door 2's
-- verified-email claim (reclamar_o_crear_cliente) can later match and converge the two doors. Proven
-- against the REAL deployed function, rolled back. Self-asserting; BEGIN/ROLLBACK; mutates nothing.
-- HOW TO RUN: via the Supabase MCP execute_sql, or psql "$DATABASE_URL" -f supabase/tests/registrar_venta_email.sql
begin;

-- Operator session = the forge gym's owner/operator gym_membership row (a real auth.users id), matching
-- registrar_venta_stamps_gym_id.sql; registrar_venta keys writes to auth.uid() + staff_gym(), which reads
-- this same (user_id, role in ('owner','operator')) predicate. perfil.user_id was dropped by Contract-B.
select set_config('app.op',
  (select user_id::text from public.gym_membership
     where gym_id = (select id from public.gym where slug = 'forge')
       and role in ('owner', 'operator')
     order by created_at limit 1), true);
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('app.op', true), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_today date := (now() at time zone 'America/Chihuahua')::date;
  v_cli   uuid;
  v_email text;
begin
  select cliente_id into v_cli
    from public.registrar_venta(
      p_nombre := 'TEST email capture', p_tel := '0000000008', p_paquete_nombre := '8 clases',
      p_vigencia_tipo := 'dias', p_monto := 800, p_metodo := 'efectivo',
      p_clases_restantes := 8, p_vence := v_today + 30, p_clases := 8, p_vigencia_dias := 30,
      p_email := 'Nuevo.Socio@Example.MX');

  -- Stored as entered (trimmed by the form; the claim compares lower() on both sides — no SQL lowercasing).
  select email into v_email from public.clientes where id = v_cli;
  if v_email is distinct from 'Nuevo.Socio@Example.MX' then
    raise exception 'EMAIL FAIL: clientes.email = % (expected the p_email passed to the sale)', v_email;
  end if;
end $$;

select 'registrar_venta email capture: OK' as result;
rollback;
```

- [ ] **Step 3: Run it to verify it fails against current schema**

Run `supabase/tests/registrar_venta_email.sql` via `execute_sql` against the scratch ref.
Expected: the operator bootstrap now succeeds (it reads `gym_membership`, not the dropped `perfil.user_id`), so execution reaches the RPC call and errors with `function public.registrar_venta(…, p_email => …) does not exist` (the live function has no `p_email` param). This is the correct red: it fails on the missing `p_email`, not on fixture setup.

- [ ] **Step 4: Author the migration**

Create `supabase/migrations/20260706232500_registrar_venta_capture_email.sql`:

```sql
-- registrar_venta captures the member-claim join key (email) — Defect A. Adding p_email changes the arg
-- signature (a new overload), so DROP the exact 11-arg live signature and CREATE the 12-arg version, then
-- re-issue EXECUTE grants (grants do not survive DROP). Body identical to the live Contract-B definition
-- (20260705082018) except the NEW-cliente INSERT now stores clientes.email = p_email. SECURITY INVOKER,
-- search_path='' preserved. p_email is nullable (DEFAULT NULL) so cash-only walk-ins and Forge stay green.
-- Note: PostgREST resolves named-arg calls that omit p_email to this single overload, so old app code calling
-- the 11 named args keeps working through the deploy window (no coordinated deploy needed).
drop function if exists public.registrar_venta(text, text, text, text, integer, text, uuid, integer, date, integer, integer);

create function public.registrar_venta(
  p_nombre text,
  p_tel text,
  p_paquete_nombre text,
  p_vigencia_tipo text,
  p_monto integer,
  p_metodo text,
  p_cliente_id uuid default null,
  p_clases_restantes integer default null,
  p_vence date default null,
  p_clases integer default null,
  p_vigencia_dias integer default null,
  p_email text default null
)
 returns table(folio bigint, cliente_id uuid)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_cliente uuid;
  v_gym uuid;
  v_folio bigint;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_cliente_id is null then
    v_gym := public.staff_gym();
    insert into public.clientes (nombre, tel, clases_restantes, vence, paquete_nombre, gym_id, email)
    values (p_nombre, p_tel, p_clases_restantes, p_vence, p_paquete_nombre, v_gym, p_email)
    returning id into v_cliente;
  else
    update public.clientes
       set clases_restantes = p_clases_restantes,
           vence = p_vence,
           paquete_nombre = p_paquete_nombre
     where id = p_cliente_id;          -- RLS scopes this to the owner
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
    v_cliente := p_cliente_id;
    select gym_id into v_gym from public.clientes where id = p_cliente_id;  -- venta inherits the cliente's gym
  end if;

  v_folio := public.next_folio(v_gym);
  insert into public.ventas (cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, gym_id)
  values (v_cliente, v_folio, p_paquete_nombre, p_clases, p_vigencia_tipo, p_vigencia_dias, p_monto, p_metodo, v_gym);

  return query select v_folio, v_cliente;
end;
$function$;

-- EXECUTE lockdown (grants do not survive DROP): revoke the CREATE default + anon, grant authenticated.
revoke execute on function public.registrar_venta(text, text, text, text, integer, text, uuid, integer, date, integer, integer, text) from public, anon;
grant execute on function public.registrar_venta(text, text, text, text, integer, text, uuid, integer, date, integer, integer, text) to authenticated;
```

- [ ] **Step 5: Apply to the scratch ref, then re-run the email test**

Apply via `apply_migration` (name `registrar_venta_capture_email`), then re-run `registrar_venta_email.sql` via `execute_sql`.
Expected: `registrar_venta email capture: OK`.

- [ ] **Step 6: Re-run the repaired gym-stamp test (regression)**

Run `supabase/tests/registrar_venta_stamps_gym_id.sql` via `execute_sql` against the scratch ref (migration applied).
Expected: `registrar_venta gym_id stamping: OK` (its 11 named-arg calls resolve to the new 12-arg function with `p_email` defaulting NULL). This confirms the drop+recreate did not regress the existing money path, measured against the real green baseline from Step 1.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260706232500_registrar_venta_capture_email.sql supabase/tests/registrar_venta_email.sql supabase/tests/registrar_venta_stamps_gym_id.sql
git commit -m "feat(data): registrar_venta captures nullable email; repair money-path test operator bootstrap (perfil.user_id -> gym_membership)"
```

---

### Task 3: Regenerate `database.types.ts`

Both RPCs' generated types must reflect the applied migrations before the DAL/app will typecheck. `registrar_venta` Args gains `p_email?: string`; `reclamar_o_crear_cliente` is unchanged (body-only) but regenerate wholesale to stay honest.

**Files:**
- Modify: `packages/data/src/database.types.ts`

- [ ] **Step 1: Regenerate from the scratch ref (both migrations applied)**

Run the Supabase MCP `generate_typescript_types` against the scratch ref and overwrite `packages/data/src/database.types.ts`.
(Fallback if regeneration is unavailable: hand-add `p_email?: string` to the `registrar_venta` `Args` object in the `Functions` block — it is the only Args change.)

- [ ] **Step 2: Verify the type surface changed as expected**

Run: `pnpm typecheck`
Expected: PASS. Confirm the `registrar_venta` `Args` in `database.types.ts` now includes `p_email?: string` and nothing else regressed (e.g. `git diff packages/data/src/database.types.ts` shows only the `p_email` addition).

- [ ] **Step 3: Commit**

```bash
git add packages/data/src/database.types.ts
git commit -m "chore(data): regen database.types for registrar_venta p_email"
```

---

### Task 4: DAL — `crearVentaSchema` + `crearVenta` pass `p_email`

**Files:**
- Modify: `packages/data/src/server/ventas.ts` (schema field + spread-guard arg)
- Modify: `packages/data/src/server/ventas.test.ts` (two new assertions)

**Interfaces:**
- Consumes: `public.registrar_venta(..., p_email text)` from Task 2.
- Produces: `crearVentaSchema` gains optional `nuevoEmail: string`; `crearVenta(raw, client?)` forwards it as `p_email` when `mode === "new"` and present. Consumed by `apps/admin/.../vender.tsx` via `crearVentaAction`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/data/src/server/ventas.test.ts` inside the `describe("crearVenta — write orchestration (injected fake)", …)` block:

```ts
  // §3.4 — the optional email must NEVER block a sale. Forwarding a MALFORMED value proves it:
  // it is passed through as entered (it just won't match at claim time — the same harmless
  // outcome as omitting it), which also regression-guards against a `.email()` format check that
  // would throw a ZodError from the unguarded `crearVentaSchema.parse` and reject the whole sale.
  it("forwards the entered email as p_email without validating it (never blocks the sale)", async () => {
    await crearVenta(input({ mode: "new", nuevoEmail: "maria@" }), fake.client);
    expect(lastRpc(fake).args).toHaveProperty("p_email", "maria@");
  });

  it("omits p_email for a new client when no email is provided (spread-guard)", async () => {
    await crearVenta(input({ mode: "new" }), fake.client);
    expect(lastRpc(fake).args).not.toHaveProperty("p_email");
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run packages/data/src/server/ventas.test.ts -t "p_email"`
Expected: FAIL — the forwarding test errors because `nuevoEmail` is not yet a schema key, so `crearVentaSchema.parse` strips it and no `p_email` arg is set (and `input({ …, nuevoEmail })` is a type error until Step 3 adds the field). The spread-guard test already passes (it asserts the key's ABSENCE) — the forwarding test is the meaningful red.

- [ ] **Step 3: Add the schema field**

In `packages/data/src/server/ventas.ts`, add to `crearVentaSchema`'s object (alongside `nuevoNombre`/`nuevoTel`):

```ts
    nuevoEmail: z.string().trim().optional(),
```

Rationale: **no `.email()` format check.** This field must NEVER block a cash sale (spec §3.4, owner-locked). `crearVenta` calls `crearVentaSchema.parse(raw)` unguarded (`ventas.ts:90`), so any Zod throw rejects the entire sale — cash collection included — surfacing only a generic "No se pudo cobrar" toast with no field-level pointer to the email (the admin form runs no email validation; `clienteValid` checks nombre+tel only). A `.email()` would do exactly that on a plausible operator typo (`"maria@"`). It also protects nothing: the sole downstream use is `lower(email)` EXACT-equality matching inside `reclamar_o_crear_cliente`, so a malformed value simply never converges — the identical, harmless outcome to omitting the email entirely. `.optional()` skips the blank (`undefined`, the only value the form sends when empty via `nuevo.email.trim() || undefined`); `.trim()` is the normalization point here because the spread-guard (Step 4) forwards the parsed value verbatim (the sibling `nuevoNombre`/`nuevoTel` are plain `z.string().optional()` and trim at consumption instead — `ventas.ts:145-146`). This resolves the conflict between spec §3.3's literal `.email()` snippet and §3.4's never-blocking rule toward never-blocking.

- [ ] **Step 4: Forward it as `p_email` in the RPC call**

In `crearVenta`, in the `.rpc("registrar_venta", { … })` args object, add a spread-guard line next to the other `...(cond && { … })` guards:

```ts
      ...(input.mode === "new" && input.nuevoEmail ? { p_email: input.nuevoEmail } : {}),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/data/src/server/ventas.test.ts`
Expected: PASS (the new two + the existing six; the "omits the DEFAULT-NULL keys" exact-key-set test is unchanged because the default `input()` has no `nuevoEmail`, so no `p_email` key is added).

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/server/ventas.ts packages/data/src/server/ventas.test.ts
git commit -m "feat(data): crearVenta forwards optional email to registrar_venta"
```

---

### Task 5: Admin sale form — email field (new-client mode)

**Files:**
- Modify: `apps/admin/src/app/(app)/vender/_components/vender.tsx`

**Interfaces:**
- Consumes: `crearVentaAction` (unchanged signature — passes an object through to `crearVenta`); `nuevoEmail` from Task 4's schema.

- [ ] **Step 1: Add `email` to the `nuevo` state**

Change the state initializer and `resetForm`:

```tsx
  const [nuevo, setNuevo] = React.useState({ nombre: "", tel: "", email: "" });
```
```tsx
    setNuevo({ nombre: "", tel: "", email: "" });
```

- [ ] **Step 2: Render the email input in `ClienteEditor`'s new-client block**

In `ClienteEditor`, update the `nuevo`/`setNuevo` prop types to include `email`, and add an Input after the tel Input inside `{mode === "new" && (…)}`:

```tsx
          <Input
            placeholder="Email para la app (opcional)"
            value={nuevo.email}
            onChange={(v) => setNuevo((n) => ({ ...n, email: v }))}
            inputMode="email"
          />
```

Prop-type change on `ClienteEditor`:

```tsx
  nuevo: { nombre: string; tel: string; email: string };
  setNuevo: React.Dispatch<React.SetStateAction<{ nombre: string; tel: string; email: string }>>;
```

Note: leave `clienteValid` and `maybeAdvanceCliente` unchanged — email is never required and must not gate the sale.

- [ ] **Step 3: Pass `nuevoEmail` through `finish()`**

In `finish()`'s `crearVentaAction({ … })` call, add:

```tsx
        nuevoEmail: mode === "new" ? (nuevo.email.trim() || undefined) : undefined,
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS (0 errors, dependency-cruiser clean).

- [ ] **Step 5: Manual smoke (admin app)**

Run the admin app, open **Vender → NUEVO**, confirm the email field renders, a sale saves WITH an email, a sale saves WITHOUT an email (field left blank), and a sale saves with a deliberately malformed email (e.g. `"maria@"`) — the last proving the field never blocks the sale. This is verified end-to-end in Task 6; this step only confirms the field renders and does not block submit.

- [ ] **Step 6: Commit**

```bash
git add "apps/admin/src/app/(app)/vender/_components/vender.tsx"
git commit -m "feat(admin): capture optional email on new-client sale"
```

---

### Task 6: End-to-end acceptance (both directions) + full gate

**Files:** none (verification only).

The self-seeding claim suite (`registro_claim.sql`, Task 1) is in `run-denial-suite.mjs`'s `SUITE` and is exercised by `pnpm test:denial`. The two money-path tests (`registrar_venta_email.sql`, `registrar_venta_stamps_gym_id.sql`) are intentionally NOT in that runner: both bootstrap from an ambient forge operator (`gym_membership`) rather than seeding their own auth rows, so they cannot run on a fresh preview branch (where `auth.users` is empty). They are run ad hoc via `execute_sql` against the scratch ref, exactly as `registrar_venta_stamps_gym_id.sql` always has been.

- [ ] **Step 1: Run the full gate**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:denial`
Expected: lint 0 / typecheck 0 / all Vitest pass / every SUITE file prints its `… : OK` line (including `registro claim suite: OK`).

- [ ] **Step 2: Run the two money-path tests ad hoc (affirmative + regression)**

Against the scratch ref (both migrations applied), via `execute_sql`:
- `registrar_venta_email.sql` → `registrar_venta email capture: OK` (Defect-A fix proven).
- `registrar_venta_stamps_gym_id.sql` → `registrar_venta gym_id stamping: OK` (no regression on the existing money path).

- [ ] **Step 3: Acceptance — operator-first direction (on red-demo)**

With both migrations applied to red-demo: operator records a NEW-client sale **with** an email → later that person self-registers in the client app with the **same** email. Verify (SQL read or app): `reclamar_o_crear_cliente` returned `reclamado = true`, the paid `clientes` row was claimed (`auth_user_id` set, balance carried), and NO duplicate row exists for that email/gym.

- [ ] **Step 4: Acceptance — member-first direction (on red-demo)**

A person self-registers first → confirm `clientes.clases_restantes = 0` and `reservar_clase` is blocked (`Sin clases disponibles`), while the schedule/class detail still browse. Then the operator sells to them in **EXISTENTE** mode → confirm the same row's `clases_restantes`/`vence`/`paquete_nombre` updated (no duplicate) and `reservar_clase` now succeeds.

- [ ] **Step 5: Acceptance — Forge/cash regressions**

Confirm a NEW-client sale with the email field left blank still succeeds, a NEW-client sale with a malformed email (e.g. `"maria@"`) also succeeds (never blocked — it just won't converge at claim time), and the Forge admin is unaffected (`registrar_venta_stamps_gym_id.sql` still OK, per Step 2).

- [ ] **Step 6: Integration / deploy**

Per the solo-main workflow, this branch is then fast-forwarded to main and the two migrations applied to live as the deploy step (owner-gated), followed by the #63 re-walk. No further code commit is needed — Task 6 is verification only.

---

## Self-Review

**Spec coverage** (`…-payment-strategy-design.md` §3):
- §3.1 close Ilimitado hole → Task 1. ✔
- §3.2 registrar_venta email (drop+recreate, Contract-B body, re-grant) → Task 2. ✔
- §3.3 DAL schema + `p_email` + types regen → Task 4 (+ Task 3). §3.3's literal `.email()` is intentionally NOT applied — it conflicts with §3.4's never-blocking rule (the unguarded `crearVentaSchema.parse` at `ventas.ts:90` would throw on an operator typo and reject the cash sale); resolved toward never-blocking with a plain `z.string().trim().optional()` (normalizer, not validator). ✔
- §3.4 admin form field (optional, non-blocking) → Task 5. ✔
- §3.5 free-demo / test access via `pendiente` sale → runbook (no code); exercised in Task 6 acceptance. ✔
- §3.6 both onboarding directions verified end-to-end → Task 6 Steps 3–4. ✔
- §3.8 cut list (no `p_phone_e164`, no unique index, no write-time dedupe, no invite/merge) → honored; none appear as tasks. ✔

**Placeholder scan:** every code/SQL step contains complete content; no TBD/TODO/"similar to". ✔

**Elegance (`nuevoEmail` schema):** `z.string().trim().optional()` — a normalizer, never a validator, so it CANNOT throw on any non-empty string and can never block a cash walk-in sale (spec §3.4, owner-locked). No `.email()`: the join is `lower(email)` exact-equality, so a typo fails to match at claim time — identical, harmless outcome to omitting the email — whereas `.email()` would convert a plausible operator typo (`"maria@"`) into a thrown ZodError that rejects the whole sale (parse is unguarded at `ventas.ts:90`) with only a generic "No se pudo cobrar" toast and no field-level feedback. `.trim()` is load-bearing (not redundant with the siblings): the spread-guard forwards the parsed value verbatim, whereas `nuevoNombre`/`nuevoTel` are plain `z.string().optional()` and trim at consumption. This resolves the conflict between spec §3.3's literal `.email()` snippet and §3.4's never-blocking rule toward never-blocking. The two DAL tests pin it: a malformed value is still forwarded as `p_email` (never blocked — regression-guards against re-adding `.email()`); omitted → key dropped (spread-guard). ✔

**SQL-test operator bootstrap:** both money-path tests (`registrar_venta_email.sql` new; `registrar_venta_stamps_gym_id.sql` repaired) resolve the operator from the forge `gym_membership` owner/operator row — `perfil.user_id` was dropped by Contract-B (`20260705082018`) and reading it aborts fixture setup. This is the exact `(user_id, role in ('owner','operator'))` predicate `staff_gym()` keys on, so the session is staff of forge, the new cliente lands in forge, and RLS reads it back. Task 2 Step 1 repairs the existing test to a real green baseline **before** Step 6 relies on it as the regression gate; the new test's red (Step 3) is now reachable and fails on the missing `p_email`, not on setup. ✔

**Suite wiring:** `registro_claim.sql` (self-seeding) stays in `run-denial-suite.mjs` and is covered by `pnpm test:denial`. The two operator-dependent money-path tests are deliberately NOT wired into the runner (they cannot seed a fresh preview branch's empty `auth.users`); they run ad hoc via `execute_sql`, matching the established pattern for `registrar_venta_stamps_gym_id.sql`. No empty final commit is created — Task 6 is verification only. ✔

**Type consistency:** `nuevoEmail` (schema/input/form) and `p_email` (RPC arg/DAL/types) used consistently across Tasks 2–5; `registrar_venta` 12-arg signature identical in the migration, the `revoke/grant`, `database.types.ts`, and the DAL call. `reclamar_o_crear_cliente` signature unchanged (body-only). ✔
