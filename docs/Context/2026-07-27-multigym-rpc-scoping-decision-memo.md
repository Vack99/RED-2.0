> **Recovered 2026-07-27** from an interrupted session (power outage). Produced by the
> `multigym-rpc-scope-audit` workflow: 3 competing designs (minimum-diff / security / scale lenses,
> one lost to a transport drop) -> 3 adversarial judges (hostile-caller / 3k-gym / maintainability)
> -> synthesis. 7 agents, 788,947 tokens, all claims verified against live prod (PG 17.6) read-only.
> Companion to `2026-07-27-auth-structure-scale-audit.md`. **Analysis only - nothing was implemented.**
# DECISION MEMO — gym-scoping `mi_membresia` and `toggle_favorito_tipo`

**Verdict: ship Proposal 2 ("Conjunctive gym narrowing"), with Proposal 1's denial-suite fixture strategy grafted on, plus two things neither proposal had: a `ventas(cliente_id, …)` index and a repair of a denial-suite vector that cannot currently fail.** Everything below is verified against live prod (PostgreSQL 17.6) and the working tree; every claim carries a cite.

---

## 1. The approach, and what the losers traded away

**Chosen: P2.** For the writer, derive the gym from the row `p_class_type_id` already names — no new parameter, no signature change, `create or replace`, grants preserved, zero TS changes. For the reader, `p_gym_id uuid default null` ANDed onto an untouched `auth_user_id = (select auth.uid())`, resolved by an explicit plpgsql `IF/ELSE`.

**Why P2 beat P1** — they are ~95% the same SQL, so it turns on who read the database instead of the brief:

- **P1 states a defect that cannot occur.** `backwardCompat` and `denialSuiteWork` both claim today's `toggle_favorito_tipo` can "write onto gym A's row (silent corruption)". The live body (`pg_get_functiondef`) resolves the cliente row first, *then* runs `select ct.gym_id into v_ct_gym …; if not found or v_ct_gym <> v_gym then raise exception 'Tipo de clase no encontrado'`. A `class_type` belongs to exactly one gym, so a cross-gym toggle **always raises; it never writes**. The real defect is an intermittent *spurious denial* on a heart tap. P2 caught this and corrected the brief. Acting on P1's version would justify a prod data-repair hunt for rows that cannot exist.
- **P1's one security-flavoured decision rests on a false premise.** It collapses the not-a-member error into `'Tipo de clase no encontrado'` to avoid "telling a caller whether an arbitrary uuid is a real class_type". Live `pg_policies`: `class_type_anon_select`, role `anon`, `SELECT`, `USING (true)`. The entire catalog is already public. **Rejected** — keep `'No eres miembro de este gimnasio'`, the string already used by `reservar_clase` and `cancelar_reserva` for the identical condition. Nothing branches on it (`clase-miembro.ts:380` passes `error.message` through).
- **P1's #1 risk is probably a fiction.** It claims a stale `mi_membresia()` would silently win argument resolution over a defaulted overload and the suite would report green. Postgres has no exact-arity-beats-default preference; coexisting signatures make the 0-arg call *ambiguous*, and PostgREST returns PGRST203 — loud, not silent. Both proposals mandate the `DROP` anyway, so the prescribed action is identical; only P1's risk *ranking* is wrong.

**What P1 wins, and is grafted in:** its denial-suite fixture discipline (§4) and its verified read of the migration-replay guard (§4.3). Both are adopted wholesale.

**Losing tradeoffs made explicit:** P2's suite plan mutates `m_self` into a dual-gym member, which destroys the currently-green tenant-pin denial at `favorito_rules.sql:97-102`, then needs a third gym to restore it. **Dropped in favour of P1's separate `m_dual` user.** P2 also says `mi_membresia_rules.sql:120` "must be updated to `mi_membresia(null)`" — unnecessary, a 0-arg SQL call resolves against a defaulted param. That vector needs a *different* repair (§4.2).

---

## 2. Migration SQL

One file, e.g. `supabase/migrations/20260727HHMMSS_gym_scoped_member_row_resolution.sql`.

```sql
-- Gym-scope the last two self-resolving `clientes` lookups.
--
-- CONSISTENCY FIX, not a new design. Eight public functions touch `auth_user_id`; the four that
-- resolve "the caller's own row" already pin the gym:
--   reservar_clase / cancelar_reserva : `where c.auth_user_id = v_uid and c.gym_id = v_gym`
--                                       (v_gym DERIVED from class_session — never a parameter)
--   reclamar_o_crear_cliente          : `where gym_id = p_gym_id and auth_user_id = v_uid`
--   reclamar_por_codigo               : `where gym_id = v_gym  and auth_user_id = v_uid`
-- mi_membresia and toggle_favorito_tipo are the only stragglers. (actualizar_cliente and
-- preparar_invitacion key off p_cliente_id — staff paths, not self-resolution. Nothing else.)
--
-- LOAD-BEARING PRECONDITION — do not drop or de-uniquify:
--   CREATE UNIQUE INDEX clientes_auth_user_id_per_gym
--     ON public.clientes USING btree (gym_id, auth_user_id) WHERE (auth_user_id IS NOT NULL)
-- Both bodies below drop `limit 1`/`order by` and get at-most-one-row DETERMINISM from that
-- uniqueness. plpgsql `SELECT ... INTO` (no STRICT) silently takes the first row, so if that index
-- is ever dropped or recreated non-unique BOTH functions revert to roulette and NO suite fails.
--
-- FIRMA RULE (why no HMAC here, when reclamar_o_crear_cliente has one): a tenant argument needs the
-- firma exactly when it appears in an INSERT's VALUES, or in a predicate NOT ANDed with an identity
-- pin. reclamar_o_crear_cliente's p_gym_id flows into `insert into public.clientes (gym_id, ...)`
-- and `insert into public.gym_membership (user_id, gym_id, role)` — it MANUFACTURES tenancy, so it
-- must authenticate. Here p_gym_id is a WHERE conjunct beside `auth_user_id = auth.uid()`: for every
-- input the result set is a SUBSET of today's. It can only remove rows, never add one. That is
-- ADR-0008's "narrow or warn, never grant", and it is checkable by reading four lines.
--
-- RULE FOR THE NEXT MEMBER-FACING RPC: derive the gym from a row the parameter already names;
-- accept a gym parameter only when no such row exists.
--
-- DELIBERATE NON-FIX: neither function checks gym_membership. A caller holding a clientes row in a
-- gym whose membership was revoked still gets a plan card and can still set a favorite. Unchanged
-- from today; adding is_member_of() would break the signed-in-but-not-yet-a-member self-heal state
-- the readers were built to tolerate (agenda-miembro.ts:120-138).

-- ═══ 1. toggle_favorito_tipo — gym DERIVED from the class type. Signature unchanged. ═══
-- Today's body resolves the cliente row FIRST (`where c.auth_user_id = v_uid limit 1`) and then
-- validates `v_ct_gym <> v_gym`. That check makes a cross-gym WRITE unreachable — the live defect
-- is a NON-DETERMINISTIC SPURIOUS DENIAL for a dual-gym member, not corruption. Swapping the two
-- lookups makes this a verbatim clone of reservar_clase's resolution.
create or replace function public.toggle_favorito_tipo(p_class_type_id uuid)
returns table(favorito uuid)
language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid     uuid := (select auth.uid());
  v_ct_gym  uuid;
  v_member  uuid;
  v_current uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- TENANT FIRST, server-derived: a class type belongs to exactly one gym, so the heart's gym is a
  -- property of the thing being favorited. Not the host, not a parameter.
  select ct.gym_id into v_ct_gym
    from public.class_type ct where ct.id = p_class_type_id;
  if not found then
    raise exception 'Tipo de clase no encontrado';
  end if;

  -- The caller's OWN row IN THAT GYM. `auth_user_id = v_uid` is the identity pin and is never a
  -- parameter; gym_id only narrows among rows the caller already owns. Unique on
  -- (gym_id, auth_user_id) ⇒ at most one row ⇒ no ORDER BY, no limit, no roulette.
  select c.id, c.favorite_class_type_id into v_member, v_current
    from public.clientes c
    where c.auth_user_id = v_uid and c.gym_id = v_ct_gym;
  if not found then
    raise exception 'No eres miembro de este gimnasio';   -- same string as reservar_clase/cancelar_reserva
  end if;

  if v_current is not distinct from p_class_type_id then
    update public.clientes set favorite_class_type_id = null where clientes.id = v_member;
    favorito := null;
  else
    update public.clientes set favorite_class_type_id = p_class_type_id where clientes.id = v_member;
    favorito := p_class_type_id;
  end if;
  return next;
end;
$function$;

-- create-or-replace on an identical signature reuses the OID and PRESERVES the ACL
-- (verified live: {postgres=X,authenticated=X,service_role=X}). Re-issued defensively.
revoke execute on function public.toggle_favorito_tipo(uuid) from public, anon;
grant  execute on function public.toggle_favorito_tipo(uuid) to authenticated;

-- ═══ 2. mi_membresia — gym becomes a NARROWING argument ═══
-- `create or replace` cannot change an argument list. Leaving both signatures makes the 0-arg
-- PostgREST call ambiguous (PGRST203) — every /perfil render 300s. The DROP is mandatory, and it
-- must precede the CREATE in SOURCE ORDER (tools/guards/denial-suite.ts:107-111 replays ops sorted
-- by source position, last-write-wins, and its DROP regex matches by NAME with no signature).
drop function if exists public.mi_membresia();

create function public.mi_membresia(p_gym_id uuid default null)
returns table(paquete_nombre text, clases_restantes integer, vence date,
              anchor_dia date, anchor_monto integer, anchor_vigencia_tipo text,
              anchor_vigencia_dias integer, attended_since_purchase integer)
language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid           uuid := (select auth.uid());
  v_cli           uuid;
  v_gym           uuid;
  v_tz            text;
  v_anchor_fecha  timestamptz;
  v_anchor_creado timestamptz;
  v_conteo_dia    date;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  -- ROW RESOLUTION — the only change to this function. TWO SEPARATE STATEMENTS, deliberately.
  -- plpgsql caches a plan per statement, so the hot branch keeps `gym_id` as a btree BOUNDARY qual
  -- in both the custom and the generic plan. A single `(p_gym_id is null or c.gym_id = p_gym_id)`
  -- would NOT — measured on live with EXPLAIN (GENERIC_PLAN):
  --     OR form  : Index Cond: (auth_user_id = $1)
  --                Filter:     (($2 IS NULL) OR (gym_id = $2))     ← boundary LOST, + a Sort
  --     conjunct : Index Cond: ((gym_id = $2) AND (auth_user_id = $1))
  -- The OR form is still CORRECT, so no denial suite would catch the regression. Do not "simplify".
  if p_gym_id is not null then
    select c.id, c.gym_id, c.paquete_nombre, c.clases_restantes, c.vence
      into v_cli, v_gym, paquete_nombre, clases_restantes, vence
      from public.clientes c
      where c.auth_user_id = v_uid          -- identity pin: NEVER a parameter
        and c.gym_id = p_gym_id;            -- narrowing conjunct: can only shrink the caller's own set
  else
    -- No tenant supplied (deploy window / direct PostgREST). Deterministic OLDEST row — the SQL twin
    -- of resolverMiembroGym's "host match, else the oldest" (agenda-miembro.ts:153-156). Never the
    -- limit(1) roulette. Unindexed by design: cold once the app deploy lands, because
    -- getPerfilResumenMiembro returns PERFIL_SIN_MEMBRESIA (agenda-miembro.ts:523) before it can
    -- ever reach fetchMembresia without a gym. Comment, do not index.
    select c.id, c.gym_id, c.paquete_nombre, c.clases_restantes, c.vence
      into v_cli, v_gym, paquete_nombre, clases_restantes, vence
      from public.clientes c
      where c.auth_user_id = v_uid
      order by c.created_at, c.id           -- created_at is NOT NULL default now(); id breaks exact ties
      limit 1;
  end if;
  if v_cli is null then
    return;  -- no cliente row in this gym → empty result (the card renders its no-plan state)
  end if;

  -- ── everything below is BYTE-IDENTICAL to 20260714120000_mi_membresia_reanchor.sql ──
  select g.timezone into v_tz from public.gym g where g.id = v_gym;

  select v.fecha, v.created_at, v.monto, v.vigencia_tipo, v.vigencia_dias
    into v_anchor_fecha, v_anchor_creado, anchor_monto, anchor_vigencia_tipo, anchor_vigencia_dias
    from public.ventas v
    where v.cliente_id = v_cli
    order by v.created_at desc, v.id desc
    limit 1;

  anchor_dia   := (v_anchor_fecha  at time zone v_tz)::date;
  v_conteo_dia := (v_anchor_creado at time zone v_tz)::date;
  if v_conteo_dia is not null then
    select count(*)::int into attended_since_purchase
      from public.asistencias a
      where a.cliente_id = v_cli
        and a.consumio = true
        and a.deleted_at is null
        and a.fecha >= v_conteo_dia;
  else
    attended_since_purchase := 0;
  end if;

  return next;
end;
$function$;

-- MANDATORY after a drop/create. Verified live: pg_default_acl for functions in `public` owned by
-- postgres is {postgres=X, anon=X, authenticated=X, service_role=X} — a fresh CREATE genuinely does
-- hand anon EXECUTE. Mirrors 20260706210000_mi_membresia_rpc.sql:111-112.
revoke execute on function public.mi_membresia(uuid) from public, anon;
grant  execute on function public.mi_membresia(uuid) to authenticated;

-- ═══ 3. The index the 3k-gym story actually depends on ═══
-- mi_membresia's ventas anchor is the DOMINANT cost in the function and there is no index on
-- ventas.cliente_id (live pg_indexes: only pkey, gym_id, gym_id+fecha, gym_id+folio,
-- gym_id+idempotency_key). Measured live, EXPLAIN (GENERIC_PLAN):
--     Limit -> Sort (created_at DESC, id DESC) -> Seq Scan on ventas, Filter: (cliente_id = $1)
-- At 3k gyms `ventas` is the largest table in the schema and this runs on every /perfil render.
-- Without this index the "the correctness fix is also the scale fix" claim is false.
-- Plain (not CONCURRENTLY): migrations run inside a transaction, and prod ventas is 171 rows.
create index if not exists ventas_cliente_created_idx
  on public.ventas (cliente_id, created_at desc, id desc);
-- (asistencias is already covered: asistencias_cliente_fecha_idx (cliente_id, fecha) WHERE deleted_at IS NULL.)
```

---

## 3. TypeScript call-site changes — four edits, all on the reader

The toggle path needs **zero** changes.

| # | File:line | Change |
|---|---|---|
| 1 | `packages/data/src/server/agenda-miembro.ts:480-483` | `async function fetchMembresia(supabase: SupabaseServer, tz: string)` → `(supabase: SupabaseServer, tz: string, gymId: string)` |
| 2 | `packages/data/src/server/agenda-miembro.ts:484` | `await supabase.rpc("mi_membresia")` → `await supabase.rpc("mi_membresia", { p_gym_id: gymId })` |
| 3 | `packages/data/src/server/agenda-miembro.ts:539` | `fetchMembresia(supabase, tz)` → `fetchMembresia(supabase, tz, gymId)`. `gymId` is already destructured at `:524` from `resolverMiembroGym(supabase, hostGymSlug)` at `:522`, and already feeds `fetchClienteRow(supabase, gymId)` (`:529`), `fetchProximasReservas(…, gymId)` (`:538`) and `getPlanesPublicos(gymId, supabase)` (`:542`). |
| 4 | `packages/data/src/database.types.ts:1466-1478` | Regenerate. `mi_membresia: { Args: never }` (`:1467`) → `Args: { p_gym_id?: string }`. Required — `pnpm typecheck` runs in the pre-commit hook. |

Plus one vitest assertion: `packages/data/src/server/agenda-miembro.test.ts` — the fake forwards `(name, args)` at `:134-135` and nothing currently asserts `mi_membresia`'s args, so add a test pinning that `fetchMembresia` sends the **host-reconciled** `gymId`. That assertion is what stops the SQL and TS reconciliation rules from drifting.

**Explicitly unchanged:** `packages/data/src/server/clase-miembro.ts:377-379` (`rpc("toggle_favorito_tipo", { p_class_type_id })`), `apps/client/src/app/clase/[sessionId]/actions.ts:46-47` (`toggleFavoritoAction(classTypeId)` — never had a host to pass, and still doesn't), `packages/data/src/database.types.ts:1556-1561`. `mi_membresia` has exactly one call site repo-wide.

---

## 4. Denial-suite work AGENTS.md obligates

`toggle_favorito_tipo` is a **writer** and this change alters *which row* it writes → written-row assertions ship in the same change. `mi_membresia` is a **pure reader** (the new body has no INSERT/UPDATE/DELETE, so `tools/guards/denial-suite.ts:73-77` classifies it as a reader) → it must stay **out** of `supabase/tests/rpc-coverage.json`, or the no-pure-reader test fails.

**Wiring: no edits.** `favorito_rules.sql` is at `run-denial-suite.mjs:71`, `mi_membresia_rules.sql` at `:73`; `QUARANTINE` is empty (`:83`); `toggle_favorito_tipo` → `favorito_rules.sql` already at `rpc-coverage.json:32`. No new `.sql` files. Both guards stay green untouched.

### 4.1 `supabase/tests/favorito_rules.sql` — the AGENTS.md obligation

- **Add a NEW dual-gym user `m_dual`; do NOT edit `m_self`.** The tenant-pin RAISE at `:97-102` is a genuine denial vector *precisely because* `m_self` owns no row in `fav-gym2` (seeded `:39-40`, class type `v_ctx` at `:51`). Mutating `m_self` destroys it. Leave `:76-107` and `:114-121` byte-identical. Seed template is `:42-51`: `auth.users` row, `gym_membership` in both `forge` and `fav-gym2`, and `clientes` rows `c_dual1` (forge) / `c_dual2` (fav-gym2).
- **Written-row pair (the #78 shape — the whole point).** As `m_dual`, `toggle_favorito_tipo(ctx)` must SUCCEED and return `ctx`; then assert `clientes[c_dual2].favorite_class_type_id = ctx` **AND** `clientes[c_dual1].favorite_class_type_id IS STILL NULL`. A return-value-only assertion passes against the buggy body.
- **Independence pair.** Then `toggle_favorito_tipo(cta)` (forge type) and assert `c_dual1 = cta` while `c_dual2` is *still* `ctx`. Structurally impossible under the roulette.
- **Row-count guard.** `select count(*) from public.clientes where auth_user_id = m_dual and favorite_class_type_id is not null` equals the expected number at each step — proves no third row was written.
- **Skip the "loop 5 times for flapping" vector both proposals wanted.** It does not discriminate: with the confirmed index-scan plan, `where auth_user_id = X limit 1` is stable within a session, so the old body deterministically raises or deterministically succeeds and the loop is green against both bodies. The *toggle pair* above is the RED-reliable vector.

### 4.2 `supabase/tests/mi_membresia_rules.sql`

- **REPAIR the anon vector at `:115-123` — it currently cannot fail.** `set local role anon` is at `:116`, but `request.jwt.claims` is not set until `:126`. So `auth.uid()` is NULL, the body's first statement raises `'No autenticado'`, `raised := true`, and the suite reports green **even if anon holds EXECUTE**. Both proposals nominated this vector as the net catching a forgotten `REVOKE`; it is not one. Replace the `when others` swallow with an SQLSTATE assertion:
  ```sql
  begin
    perform public.mi_membresia(null);
    raise exception 'ANON DENIAL FAIL: anon executed mi_membresia';
  exception
    when insufficient_privilege then null;                       -- 42501: the grant held
    when others then raise exception 'ANON DENIAL FAIL: wrong error % (expected 42501)', sqlstate;
  end;
  ```
  No signature edit is needed for the *other* call sites (`:141`, `:164`, `:182`, `:207`) — a 0-arg SQL call resolves against a defaulted param, and leaving them proves the fallback branch survives the drop+create. (`favorito_rules.sql:114-121` is sound by accident of ordering — jwt claims are set at `:64` and survive `reset role` — but tighten it the same way while you're there.)
- **Second gym with a DIFFERENT timezone** (e.g. `America/Tijuana`) beside `mi-membresia-gym` (`:42-43`), with `member_a` holding a `clientes` row + `gym_membership` + its own venta/asistencias. The tz difference also proves `v_tz` is re-resolved from the *resolved* gym — the same axis the BOUNDARY-DAY vector at `:149-150` defends.
- **Gym-scoped resolution:** `mi_membresia(gym_t)` returns gym-1's scalars, `mi_membresia(mm_gym2)` returns gym-2's.
- **The ADR-0008 vector — the most important new assertion.** Seed a third gym where `member_b` demonstrably HAS a `clientes` row and `member_a` does not; assert `member_a` calling `mi_membresia(<gym3>)` returns **zero rows**. Seeding member_b's row is what turns this from "the gym is empty" into "the row exists and is unreachable".
- **Deterministic fallback:** `mi_membresia(null)` five times returns byte-identical output, matching the oldest `clientes` row's gym.
- Keep the Contract-A vectors (`:134-138`) and extend them to the newly seeded gym-2 rows.

### 4.3 Gate

`SUPABASE_TARGET_REF=<scratch-ref> SUPABASE_ACCESS_TOKEN=<pat> pnpm test:denial` green before fast-forwarding to `main`. The runner refuses the live parent ref (`run-denial-suite.mjs:139-140`). Scratch project `gyyujeguycxxoaqgdnjp` is the test bed. Suite count unchanged. **Never `supabase link` or `db push` to prod** — apply via `apply_migration` only.

---

## 5. The 3,000-gym verdict

**Index changes: one, and it is NOT on `clientes`.**

Live `pg_indexes` on `clientes` — there is **no index leading on `auth_user_id`**; the only structure covering it is `clientes_auth_user_id_per_gym UNIQUE (gym_id, auth_user_id) WHERE auth_user_id IS NOT NULL`. Measured on live with `EXPLAIN (GENERIC_PLAN)`:

```
today   : Limit -> Index Scan using clientes_auth_user_id_per_gym
                   Index Cond: (auth_user_id = $1)                        cost 0.13..3.48
fixed   : Index Scan using clientes_auth_user_id_per_gym
                   Index Cond: ((gym_id = $2) AND (auth_user_id = $1))    cost 0.13..2.35
```

Read the Index Cond composition, not the cost. Today's qual sits on the index's **second** column with no leading bound, so btree cannot descend — it walks from the leftmost leaf applying the qual. PG 17.6 (`select version()` on live) has **no skip scan** (that landed in PG 18). The fixed form is a full two-column boundary on a unique index: one descent, at most one entry. **Do not add a standalone `clientes(auth_user_id)` index** — it would make the *unscoped* lookup fast while leaving it returning the wrong gym's row. (Note: `docs/Context/2026-07-27-auth-structure-scale-audit.md` §7 recommends that index for the `clientes_member_select` RLS policy, which has no gym predicate. That justification is separate and still stands — this decision does not cancel it.)

**The index that IS needed:** `ventas(cliente_id, created_at desc, id desc)`. Measured live:

```
Limit -> Sort (created_at DESC, id DESC) -> Seq Scan on ventas, Filter: (cliente_id = $1)
```

No index on `ventas.cliente_id` exists. At 3k gyms `ventas` is the largest table in the schema, and this seq scan runs inside `mi_membresia` on every `/perfil` render — it dominates the clientes lookup by orders of magnitude. **Both proposals headlined a scale win while leaving this untouched; that framing was false.** With the index, the function is three bounded index descents (`clientes` → `gym` pk → `ventas`) plus a covered count on `asistencias_cliente_fecha_idx`.

**Round-trip delta on member hot paths: ZERO.** `mi_membresia`'s gym is a value already in scope at `agenda-miembro.ts:524`, before the `Promise.all` at `:537`, and `resolverMiembroGym` is `cache()`-wrapped (`:140`). `toggle_favorito_tipo` takes no new argument and performs the same two lookups, reordered. Per-request query count on `/reservar` and `/perfil` is unchanged.

**Honest limit on the evidence.** Live `clientes` is 112 rows with 5 claimed and `ventas` is 171 rows, so `EXPLAIN (ANALYZE, BUFFERS)` cannot discriminate the two shapes today. The asymptotic claim rests on Index Cond composition + PG17's lack of skip scan — a model, not a measurement. If the perf argument is load-bearing for your decision, seed the scratch project to ~10⁵ claimed rows and re-run. It is not load-bearing for mine: **ship this for the correctness bug; the perf win is a reasoned bonus.**

**ADR-0013 §2/§3 is not relied on anywhere above** and nothing here touches an RLS predicate — both functions are `SECURITY DEFINER`. Expect a reviewer citing ADR-0013's (false) O(1)-per-statement claim to object to the added gym predicate on invented grounds; pre-empt it by pasting the two GENERIC_PLAN outputs into the PR body.

---

## 6. Deploy ordering and the window

**Migration first. The order is free.**

- **`toggle_favorito_tipo`: no window at all.** Identical signature ⇒ `create or replace` ⇒ OID reused, ACL preserved (verified live: `{postgres=X,authenticated=X,service_role=X}`), PostgREST schema cache reloads via Supabase's DDL event trigger. Old and new app builds call it identically. It can land days before or after the Vercel deploy.
- **`mi_membresia`: covered by `default null`.** Between migration and deploy, un-updated app code posts `{}` to `/rpc/mi_membresia`; PostgREST resolves it to the single function whose only argument has a default and invokes it with `p_gym_id = null`; the body returns the caller's **oldest** `clientes` row deterministically. That is strictly better than today (random gym → oldest gym), never another person's data, and correct the moment the deploy lands. The drop+create is atomic inside the migration transaction, so there is no interval in which the function is absent.
- **Rollback: app-only, no DDL.** Reverting the TS to `rpc("mi_membresia")` restores pre-change behavior against the new function via the null branch.
- **Keep the default permanently?** Yes for now — it is the same "else the oldest" rule the TS layer has shipped since #74 (`agenda-miembro.ts:156`, `clase-miembro.ts:142`), and it costs one branch. But file the follow-up: once every caller passes a gym, a one-line migration making it `not null` turns a forgotten argument from a plausible-wrong-answer into a loud error. Left as-is it is a permanent, untested-in-anger fourth copy of the "which gym" rule.

**The single highest-consequence line in the migration is `revoke execute on function public.mi_membresia(uuid) from public, anon;`** — `pg_default_acl` confirms a fresh CREATE hands anon EXECUTE.

---

## 7. What the audit found that the brief did not

1. **The toggle's stated impact is wrong.** The wrong-gym write is unreachable (live body's `v_ct_gym <> v_gym` raise). The defect is a non-deterministic spurious denial. Do **not** open a prod data-repair task.
2. **`mi_membresia_rules.sql:115-123` is a test that cannot fail** (§4.2). Independent of this change, that is a live hole in the anon-denial coverage — it would report green today if anon held EXECUTE.
3. **The `ventas.cliente_id` seq scan** (§5) — bigger than everything the brief asked about, in the same function body, on the same hot path.
4. **A forgotten REVOKE is defense-in-depth, not a leak.** A real anon PostgREST request carries no `sub`, so `if v_uid is null then raise exception 'No autenticado'` fires first. Both proposals overstated the exposure *and* overstated the mitigation; write the true version in the migration header.
5. **No other unswept surfaces.** Eight `public` functions reference `auth_user_id`; `reservar_clase`, `cancelar_reserva`, `reclamar_o_crear_cliente` and `reclamar_por_codigo` already pin the gym, and `actualizar_cliente` / `preparar_invitacion` key off `p_cliente_id` (staff paths). These two are the complete straggler set. The TS layer is already clean (`fetchClienteRow`, `favoritoDelMiembro` both `.eq("gym_id", gymId)`).
6. **Zero prod users are affected today.** `select count(*) from (select auth_user_id from clientes where auth_user_id is not null group by 1 having count(*)>1)` = **0** (112 rows, 5 claimed). Both defects are latent. Ship calmly, no data repair, no emergency path — and note that the dual-gym fixtures are the *entire* value of the suite work, since a happy-path single-gym suite passes against both bodies.
7. **A reason to do less:** if you want the 80% fix in an hour with no DDL risk, adding `order by c.created_at, c.id` to both existing bodies kills the flapping heart with no signature change, no DROP, no grants touched, no `database.types.ts` regeneration. **I do not recommend it** — it converts an intermittent wrong plan card into a permanent one for affected members, and it leaves both index problems in place — but it is the honest cheaper option if the DROP makes you uncomfortable this week.
8. **Gap neither proposal closed, and I am not closing it here:** this repo machine-enforces its conventions (dependency-cruiser, denial-suite-drift, rpc-write-coverage, loading-coverage), but "gym-pin the caller's cliente lookup" stays prose. `tools/guards/denial-suite.ts:94` already exports `readRpcFunctions()`, which returns each surviving function's final body — a sibling test failing on a body matching `/auth_user_id\s*=\s*v_uid/` without `gym_id` in the same statement would close the class. **File it as a follow-up, don't block this change** — a body-regex guard is brittle (false reds on staff paths like `preparar_invitacion`) and deserves its own design pass.

---

## 8. Confidence, and what would change my mind

**High (≈90%) on correctness and on the SQL as written.** Both bodies, all indexes, both GENERIC_PLAN comparisons, the ACL defaults, the `class_type` anon policy, the multi-gym count, the guard's replay semantics, and every file:line cite above were read from live prod or the working tree in this session.

**Medium (≈70%) on the 3k-gym magnitudes.** The `clientes` index-shape argument is a planner-behaviour model, unmeasurable at 112 rows. The `ventas` seq scan is directly observed, so that half is solid.

**Low-confidence, and it does not matter:** whether a missed DROP fails loudly (PGRST203, my belief) or silently (P1's stale-resolution claim). I could not test it — analysis-only, no DDL on live. Both paths mandate the DROP, so the migration text is identical either way. Settle it on scratch if you care.

**What would change my mind:**
- Someone produces a server-side anchor for `mi_membresia` that answers "which tenant surface is rendering" without a client-supplied value. Then the parameter is unjustified and the reader should derive like the writer does. I looked and found none — but "I looked" is weaker than "none can exist".
- A scratch run at ~10⁵ claimed rows showing the `clientes` shapes within noise of each other. That would strip the perf justification (not the correctness one) and shrink this to the `ventas` index plus the row-resolution fix.
- The owner rules that a favorite is **per person**, not per membership. The column lives on `clientes` (per-gym), so per-membership is almost certainly right — but this change makes it true in prod, and a Forge member who joins RED will keep two independent hearts. That is a product statement someone should say out loud before it ships.
