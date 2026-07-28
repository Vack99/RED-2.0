# arch:api — 34-ish RPCs over PostgREST vs a service layer

Agent: `arch:api`. Date: 2026-07-27. Subject: RED 2.0.
All DB numbers below were read from **live prod** (`hjppxawglmukfvsgmcog`) read-only via the Supabase MCP
during this session. Every SQL statement I ran is reproduced inline. No writes, no DDL, no repo edits.

---

## 0. Method + what "34 RPCs" actually is

AGENTS.md says "The 34 `public` functions — **25 of them write rows**". The write count is right.
The function count is stale.

```sql
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';
-- 38
```

Live prod has **38** functions in `public`. I re-implemented the repo's own migration-replay derivation
(`tools/guards/denial-suite.ts:readRpcFunctions`) verbatim in a standalone script and ran it:

```
DERIVED TOTAL: 38   WRITERS: 25   READERS: 13
```

Names match live prod one-for-one. So the derivation is **correct and current**; what is stale is the prose
around it:

| Claim | Where | Reality |
|---|---|---|
| "The 34 `public` functions" | `AGENTS.md` | 38 |
| "exactly 34 functions, 25 writers, 9 pure readers — same names, no drift" | `tools/guards/denial-suite.ts:88-90` (docstring) | 38 / 25 / 13 |

This is a documentation nit, not a defect — I flag it only because the docstring asserts *"verified against
the live catalog … no drift"*, and a reader would reasonably treat that as a live-checked fact. It has been
wrong since roughly 2026-07-14 (`marcadas_por_gym_windowed`, `marcadas_presencia`, `ventas_count_por_cliente`,
`asistencias_mes_por_cliente` landed). The machine guard is unaffected — it derives, it does not read the prose.

### The surface, live

38 functions. 25 write. 18 `SECURITY DEFINER`. 26 raise exceptions. Every one carries `set search_path=''`
(good). Every RPC is called from exactly one place: `packages/data/src/server/*.ts` — I found **34 distinct
`.rpc(` call sites** in non-test source, all inside `@gym/data`. There is no RPC call from `apps/*`, and none
from a browser bundle. The DAL seam is real and it is clean.

Call sites (file:line), from `Grep '\.rpc[<(]'`:

| RPC | Call site |
|---|---|
| `registrar_venta` | `packages/data/src/server/ventas.ts:262` |
| `toggle_pase` | `packages/data/src/server/asistencia.ts:237` |
| `marcadas_presencia` / `marcadas_por_gym` | `asistencia.ts:49` / `asistencia.ts:77` |
| `reservar_clase` / `cancelar_reserva` | `reservas.ts:30` / `reservas.ts:60` |
| `reclamar_o_crear_cliente` / `reclamar_por_codigo` / `invitacion_info` | `registro.ts:129` / `:176` / `:200` |
| `ensure_week_materialized` | `agenda.ts:198` (called from `:212` **and** `:237`) |
| `create_class_session` / `create_recurring_schedule` / `edit_class_session` / `cancel_class_session` | `agenda.ts:379` / `:420` / `:463` / `:491` |
| `pasar_lista_sesion` | `agenda.ts:521` |
| `mi_membresia` | `agenda-miembro.ts:484` |
| `roster_clase` / `toggle_favorito_tipo` | `clase-miembro.ts:252` / `:377` |
| `ventas_count_por_cliente` / `asistencias_mes_por_cliente` / `actualizar_cliente` | `clientes.ts:79` / `:173` / `:443` |
| `preparar_invitacion` / `marcar_invitacion_enviada` | `invitaciones.ts:190` / `:214` |
| `crear_/actualizar_/eliminar_plantilla`, `sembrar_plantillas_default` | `plantillas.ts:44/53/62/71` |
| `actualizar_paquete` / `actualizar_paquete_marketing` / `set_plan_features` | `paquetes.ts:164` / `:206` / `:239` |
| `enviar_mensaje_contacto` | `marketing.ts:218` |
| `contar_reservas_activas` | `ocupacion.ts:23` |
| `next_folio`, `staff_gym`, `is_member_of`, `is_staff_of`, `has_role` | **no TS call site** — called from inside other RPCs / RLS policies |

---

## THE FIVE WORST PROPERTIES OF THIS API DESIGN, worst first

---

### #1 — Every RPC signature change is a breaking wire change with **no zero-downtime path**, and they ship every 5 days

**Evidence.** `grep -in "drop function" supabase/migrations/*.sql` returns 11 hits. Ten are *signature rolls*
(drop the old arity, create the new one in the same file); one is a deletion.

| Date | Migration | Function |
|---|---|---|
| 2026-06-01 | `20260601010721_registrar_venta_default_null.sql:8` | `registrar_venta` |
| 2026-06-05 | `20260605130000_paquete_clases_and_single_favorite.sql:20` | `actualizar_paquete` |
| 2026-07-07 | `20260707031000_registrar_venta_capture_email.sql:10` | `registrar_venta` |
| 2026-07-08 | `20260708220000_actualizar_cliente_email_arm.sql:24` | `actualizar_cliente` |
| 2026-07-10 | `20260710121000_registrar_venta_rederive.sql:27` | `registrar_venta` |
| 2026-07-11 | `20260711100100_registrar_venta_personalizado.sql:29` | `registrar_venta` |
| 2026-07-13 | `20260713190000_reclamar_tenant_binding.sql:26` | `reclamar_o_crear_cliente` |
| 2026-07-14 | `20260714090000_marcadas_por_gym_windowed.sql:24` | `marcadas_por_gym` |
| 2026-07-14 | `20260714110000_registrar_venta_backdate.sql:50` | `registrar_venta` |
| 2026-07-22 | `20260722120000_reclamar_por_codigo_firma.sql:21` | `reclamar_por_codigo` |

**10 breaking signature changes in the 51 days 2026-06-01 → 2026-07-22 = one every 5.1 days.**
`registrar_venta` — the money path — changed its wire signature **5 times in 44 days** (Jun 1 → Jul 14),
going 11 args → 12 → 8 → 13 → 14.

The codebase already knows and has written it down. `20260714110000_registrar_venta_backdate.sql:10-14`:

> `-- WHY drop+create (G1): a defaulted arg must be LAST, and adding it changes the`
> `-- signature, so PostgREST dispatch (which keys on the full arg list) needs the old`
> `-- 13-arg overload gone or it can ambiguously resolve (PGRST203). Same honest deploy`
> `-- window as its predecessors: between applying this and deploying the matching app`
> `-- build, the old app's COBRAR fails loudly (PGRST202). Accepted for a solo deploy.`

Primary source confirms both codes — https://docs.postgrest.org/en/v13/references/errors.html (fetched 2026-07-27):

> **PGRST202** | 404 — "Caused by a stale function signature, otherwise the function may not exist in the database."
> **PGRST203** | 300 — "Caused by requesting overloaded functions with the same argument names but different types…"

**Why the obvious escape hatch is blocked.** The standard zero-downtime move — keep the old signature as an
overload for one deploy, then drop it — does not work here, for a reason *below* PostgREST: Postgres itself.
`registrar_venta` has 12 of 14 args defaulted. Keeping both `registrar_venta(…13 args, 12 defaulted)` and
`registrar_venta(…14 args, 13 defaulted)` makes any call supplying ≤13 args resolvable by both → Postgres
raises `function ... is not unique` (42725). PostgREST's arg-name dispatch cannot rescue this because the
overlapping name-sets are genuinely ambiguous. I could not find a PostgreSQL doc page that states the
default-arg overload ambiguity rule explicitly (checked
https://www.postgresql.org/docs/17/xfunc-sql.html and https://www.postgresql.org/docs/17/xfunc-overload.html,
both fetched 2026-07-27 — neither covers default-arg overloads), so I mark the *doc citation* ASSERTED while
the *repo's own migration comment* independently reaches the same conclusion from the PostgREST side.

**What would have to be true for this to be fine** (falsification): the deploy window would have to be
(a) short, (b) low-traffic, and (c) coordinated. Checked:
- (a) Migration and app-build deploy are **separate manual steps** — `20260707…` has a companion commit
  `424e6d5 docs(data): clarify registrar_venta migration must be applied before app deploy`. The window is
  as long as a human takes.
- (b) The affected surface is `COBRAR` (checkout) and `/activar` (member activation). Those are the two
  moments a gym cannot tolerate a 404.
- (c) There is no coordination mechanism: no feature flag, no dual-write, no API version in the path, no
  `Accept-Profile` schema versioning. `packages/data/src/database.types.ts:1511` hand-carries the
  `registrar_venta` signature; the plan doc `docs/superpowers/plans/2026-07-10-renewal-flow.md:188` instructs
  *"hand-edit the args/returns type to the new signature; do NOT regenerate from live"* — the type and the DB
  are kept in sync by hand.

Falsification **fails**. This is not fine; it is currently affordable.

**Breaking point.** It breaks the moment a signature roll lands while any gym is mid-checkout. At 4 gyms in
one timezone with one operator, that is a coin flip you can win. At **≥ 2 gyms in different timezones**, or
**≥ 1 gym you cannot phone**, every roll is a paying customer seeing "No se pudo registrar la venta". At
3,000 gyms × 7 sales/day and a 3-minute window every 5.1 days, the expected loss is
`3000 × 7 / 1440 × 3 ≈ 44 failed checkouts per roll`, ~8 rolls/year at current cadence ≈ **350 failed
checkouts/year**, each one an operator standing in front of a member with a card in their hand.

**Exit trigger (reverses "keep RPCs-as-API").** The first signature roll that happens with more than one
paying tenant live, OR any month with ≥2 rolls. Either one means the accepted-for-solo tradeoff has expired
and you need Postgres-side versioning (`api_v2` schema exposed via `Accept-Profile`, or a stable single-`jsonb`-arg
front door per RPC so the arg list never changes again).

---

### #2 — The error contract is 100 free-text Spanish `raise exception`s, 95 of them with no SQLSTATE, string-matched in TypeScript against a mock

**Evidence.** Live prod:

```sql
WITH r AS (SELECT p.proname,
  (SELECT count(*) FROM regexp_matches(p.prosrc,'raise\s+exception','gi')) AS raises,
  (SELECT count(*) FROM regexp_matches(p.prosrc,'using\s+errcode','gi')) AS errcodes
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
SELECT sum(raises), sum(errcodes), count(*) FILTER (WHERE raises>0), count(*) FILTER (WHERE errcodes>0) FROM r;
-- total_raises 100 | total_errcodes 5 | fns_that_raise 26 | fns_with_sqlstate 1
```

**100 raise sites across 26 functions. Exactly one function (`enviar_mensaje_contacto`, the anon contact form)
sets a SQLSTATE.** The other 95 raise bare, so Postgres assigns `P0001` and PostgREST returns HTTP 400 with
`{"code":"P0001","message":"<Spanish prose>"}`. The entire business-error taxonomy of this product is one code.

50 distinct message strings exist, including `Clase llena`, `Sin clases disponibles`, `Paquete vencido`,
`Ya reservaste esta clase`, `CLIENTE_DUPLICADO:%`, `Este correo ya pertenece a otro registro de este gym`.

The client has no choice but to string-match, and it does:

```ts
// packages/data/src/server/ventas.ts:289
const dup = rpcErr.message?.match(/CLIENTE_DUPLICADO:(\S+)/);
// packages/data/src/server/ventas.ts:293
if (rpcErr.message === EMAIL_EN_USO_MSG) throw new EmailEnUsoError();
// packages/data/src/server/clientes.ts:452  (same string, second call site)
if (error?.message === EMAIL_EN_USO_MSG) throw new EmailEnUsoError();
```

`EMAIL_EN_USO_MSG` is declared at `ventas.ts:153` as a TS literal duplicating the SQL literal. Two copies of a
contract, in two languages, with nothing joining them.

**The two halves of the contract are tested in two places that never meet.** The TS side pins the strings —
against a *fake client*:

```ts
// packages/data/src/server/reservas.test.ts:48
const { client } = makeFake(() => ({ data: null, error: { message: "Clase llena" } }));
// packages/data/src/server/ventas.test.ts:237
{ rpcError: { message: "CLIENTE_DUPLICADO:cli-existing-9" } }
// packages/data/src/server/asistencia.test.ts:167
makeFake({}, { rpc: { error: { message: "Paquete vencido" } } });
```

Nothing in that test proves the SQL still raises that string. So I measured the SQL side. I extracted all 49
distinct literal messages from `pg_proc.prosrc` and grepped every suite in `supabase/tests/*.sql`:

```
SQL suites pin: 22 / 49 distinct raise messages   (45%)
```

**27 of 49 message strings are asserted nowhere on the SQL side.** The unpinned list includes the three
strings TS branches on hardest: `Clase llena`, `Sin clases disponibles`, `Ya reservaste esta clase` —
plus `No eres miembro de este gimnasio`, `Firma de tenant inválida`, `Firma de activación inválida`,
`Código de invitación inválido o ya utilizado`, `Correo no verificado`. The activation security rail's
refusal messages are entirely unpinned.

**Breaking point.** Zero gyms — it is already broken, silently. Rename `'Clase llena'` to `'Clase completa'`
in a migration and: `pnpm lint` passes, `pnpm typecheck` passes, `pnpm test` passes (the fake still returns
the old string), `pnpm test:denial` passes (no suite asserts it), and members silently get a raw Spanish
exception blob in a UI slot that expected a friendly branch. Nothing anywhere fails.

The second, harder break: **market #2**. The error contract is the Spanish copy. There is no message id, no
SQLSTATE, no i18n key. Selling to a non-Spanish LatAm market (Brazil) or to any gym that wants its own
wording requires rewriting 100 raise sites *and* the TS string-matchers *and* re-pinning the suites.

**Exit trigger.** The first product decision that requires a second language, OR the first incident traced to
an edited message string. Either one means the fix (a `using errcode = 'RD001'` + stable machine code on every
raise, TS matching on `code` not `message`) is overdue.

---

### #3 — Observability inside a plpgsql RPC is dead by construction: `auto_explain` can provably never fire

This is the real, measurable cost of putting 25 write functions' worth of domain logic in plpgsql.

**(a) `auto_explain` is loaded, configured, and mathematically unreachable.**

```sql
SELECT name, setting FROM pg_settings
WHERE name LIKE 'auto_explain%' OR name='shared_preload_libraries';
-- auto_explain.log_min_duration     = 10000
-- auto_explain.log_nested_statements = off
-- auto_explain.log_analyze          = off
-- shared_preload_libraries          = ... auto_explain ...

SELECT rolname, rolconfig FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role');
-- anon           {statement_timeout=3s}
-- authenticated  {statement_timeout=8s}
-- service_role   NULL          <-- no timeout; inherits cluster default 120s
```

`auto_explain` logs a plan when a statement **completes** having exceeded its threshold. The threshold is
**10,000 ms**. An `authenticated` statement is killed at **8,000 ms**; an `anon` statement at **3,000 ms**.
A statement killed by `statement_timeout` never completes and is never logged. **Therefore auto_explain
cannot log a single plan for any app-role query — ever.** Every plan capture on this database is dead code,
and it has been since the timeouts were set. The only role that *can* trigger it is `service_role`, which the
Next apps never use (`packages/data/src/server/supabase.ts:26,59` — both clients use
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the only `SUPABASE_SERVICE_ROLE_KEY` consumer in the repo is
`supabase/functions/activar-cuenta/index.ts:36`).

And even if you fixed the threshold, `auto_explain.log_nested_statements = off` means it would log the RPC
call and **none of the ~20 statements inside `registrar_venta`'s 10,743-character body**.

**(b) There is no per-function timing at all.** `track_functions = none` → `pg_stat_user_functions` is empty.

**(c) `pg_stat_statements.track = 'top'`** → only the PostgREST wrapper statement is recorded. When
`registrar_venta` takes 100 ms you learn "registrar_venta took 100 ms" and nothing about which of its internal
statements did it. Measured worst cases, live:

```sql
SELECT coalesce((regexp_match(query,'"public"\."([a-z0-9_]+)"'))[1],'(none)') AS fn,
       count(*) AS distinct_stmts, sum(calls) AS calls,
       round(sum(total_exec_time)::numeric,1) AS total_ms, round(max(max_exec_time)::numeric,2) AS worst_ms
FROM pg_stat_statements WHERE query LIKE 'WITH pgrst_source%' GROUP BY 1 ORDER BY total_ms DESC;
```

| fn | distinct stmts | calls | total ms | mean ms | worst ms |
|---|---|---|---|---|---|
| `toggle_pase` | 1 | 350 | 4700.4 | 13.43 | **85.78** |
| `registrar_venta` | **22** | 72 | 2757.4 | 38.30 | **100.39** |
| `ensure_week_materialized` | 1 | 215 | 2496.4 | 11.61 | **90.64** |
| `mi_membresia` | 1 | 97 | 823.4 | 8.49 | 54.21 |
| `contar_reservas_activas` | 1 | 302 | 523.2 | 1.73 | 16.19 |
| `pasar_lista_sesion` | 1 | 25 | 296.9 | 11.87 | 44.45 |
| `create_recurring_schedule` | 1 | 3 | 190.8 | 63.62 | 72.04 |

That is a 100 ms money path on a **15 MB database with 175 ventas rows**, and there is no tool in the stack
that can tell you which line of it is slow.

**(d) `pg_stat_statements` is at 65.5% capacity and RPC arg-shapes are eating it.**

```sql
SELECT (SELECT count(*) FROM pg_stat_statements) AS entries_now,
       (SELECT setting FROM pg_settings WHERE name='pg_stat_statements.max') AS max_entries,
       (SELECT dealloc FROM pg_stat_statements_info), (SELECT stats_reset FROM pg_stat_statements_info);
-- entries_now 3275 | max_entries 5000 | dealloc 0 | stats_reset 2026-05-29 20:23:34+00
```

3,275 / 5,000 after 59 days at 4 gyms. **`registrar_venta` alone occupies 22 of those entries for 72 calls**,
because PostgREST emits a *distinct SQL text per set AND ORDER of named args in the JSON body*, and
`ventas.ts:262-284` builds that body with **seven conditional spreads**:

```ts
...(input.paquete.tipo === "registrado" ? { p_paquete_id } : { p_custom_nombre, p_custom_precio, p_custom_dias,
   ...(input.paquete.clases === null ? { p_custom_ilimitado: true } : { p_custom_clases }) }),
...(input.mode === "existing" && { p_cliente_id }),
...(input.mode === "new" && { p_nombre, p_tel }),
...(input.email ? { p_email } : {}),
...(input.forzarNuevo ? { p_forzar_nuevo: true } : {}),
...(input.fechaInicio ? { p_fecha_inicio } : {}),
```

Two of the 22 entries have **identical argument sets in different order** (`p_metodo, p_idempotency_key,
p_paquete_id, p_cliente_id` at 4 calls vs `p_metodo, p_paquete_id, p_idempotency_key, p_cliente_id` at 4 calls)
— key-insertion order from the spread guards splits one logical call into two statistics buckets. And **8 of
the 22 are for the pre-2026-07-10 signature** (`p_paquete_nombre`, `p_monto`, `p_vence`, …) that no longer
exists in the database — the highest-`calls` `registrar_venta` entry (18 calls) is a **dead signature**.

Once `dealloc` starts, `pg_stat_statements` evicts by least usage — which is precisely the rare-and-slow
variants you would need. The 8-call / 54.9 ms `registrar_venta` custom-package path is evicted before the
18-call dead-signature entry.

**Breaking point.** Not gym-count-driven — entry count scales with *distinct code paths and arg shapes*, not
tenants (literals are normalised). Honest number: **`dealloc` starts at ~1,725 more distinct query shapes.**
At the observed rate (3,275 shapes in 59 days of active development, ~55/day) that is **~31 more days of
development at this pace**, arriving well before 3,000 gyms. From that day, the tool silently deletes the
evidence you need, and it is the only tool you have, because auto_explain is dead.

**Exit trigger.** `SELECT dealloc FROM pg_stat_statements_info` returns > 0. Also, today, unconditionally:
`auto_explain.log_min_duration` must drop below 8000 and `log_nested_statements` must go on, or the setting
should be removed so nobody believes it is protecting them.

---

### #4 — Five **write-bearing** RPCs are EXECUTE-granted to `anon` in live production, and no guard exists that could ever catch it

**Evidence, live:**

```sql
SELECT p.proname, has_function_privilege('anon', p.oid,'EXECUTE') AS anon_can_exec, p.prosecdef
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND has_function_privilege('anon', p.oid,'EXECUTE') ORDER BY 1;
```

| function | anon EXECUTE | SECURITY DEFINER | writes rows? | intended? |
|---|---|---|---|---|
| `cancel_class_session` | **true** | false | **yes** | **no** |
| `create_class_session` | **true** | false | **yes** | **no** |
| `create_recurring_schedule` | **true** | false | **yes** | **no** |
| `edit_class_session` | **true** | false | **yes** | **no** |
| `ensure_week_materialized` | **true** | false | **yes** | **no** |
| `enviar_mensaje_contacto` | true | true | yes | yes (contact form) |
| `invitacion_info` | true | true | no | yes (pre-auth invite lookup) |

**Root cause, exactly.** `supabase/migrations/20260706120100_scheduling_write_rpcs.sql:243-247` revokes from
`public` **only**:

```sql
revoke execute on function public.create_class_session(...)      from public;
revoke execute on function public.ensure_week_materialized(date) from public;
revoke execute on function public.create_recurring_schedule(...) from public;
revoke execute on function public.edit_class_session(...)        from public;
revoke execute on function public.cancel_class_session(uuid)     from public;
```

Every *other* write-RPC migration in the repo writes `from public, anon`. The repo knows why —
`20260706170100_create_contact_message.sql:103`:

> `-- Supabase's default privileges grant EXECUTE to PUBLIC + anon + authenticated on new public functions;`

`revoke … from public` does not remove the **separate explicit grant to `anon`**. Five functions, one file,
one missing word.

**This is not a new class of bug in this repo and the sweeps keep missing it.** There are already **five**
one-off remediation migrations for exactly this mistake: `20260601010843_revoke_registrar_venta_anon_execute`,
`20260605120000` (actualizar_paquete), `20260710130000_revoke_anon_actualizar_cliente`,
`20260711003731` (re-revoke actualizar_cliente, per commit `29305f1 fix(rpc): re-revoke anon EXECUTE on 4-arg
actualizar_cliente (#82.3)` — it regressed once already), and `20260715080000_revoke_anon_perf_rpcs` which
swept **four read RPCs** (`marcadas_por_gym`, `marcadas_presencia`, `ventas_count_por_cliente`,
`asistencias_mes_por_cliente`) on 2026-07-15 — twelve days ago — **and did not touch these five writers.**

**No machine guard exists.** `grep -rln "grant|privilege|proacl|has_function_privilege" tools/guards/` returns
only `denial-suite.ts` (which matches on the word "grants" inside a code comment about CRLF stripping). There
is a guard that every write RPC has a *suite*, and a guard that every suite is *wired* — and **zero** guard
that any RPC has the right *grants*. The one axis that has regressed five times is the one axis nothing checks.

**Honest severity.** I checked the blast radius rather than assuming it. All five are `SECURITY INVOKER` with
`set search_path=''`, and all five gate on `staff_gym()`, which resolves `auth.uid()` → `gym_membership`.
For `anon`, `auth.uid()` is null, `staff_gym()` returns null, and the function raises `'No autorizado'`
(confirmed: `ensure_week_materialized` has exactly 1 raise, message `No autorizado`; `create_class_session`
and `edit_class_session` have 4 and 5). So **this is not a live data-loss hole** — RLS and the in-body
authorization are doing the work the grant should have done. What it *is*:

1. A defence-in-depth layer that is off, on the five functions that create and destroy schedule rows.
2. An **unauthenticated CPU amplification vector**: anon can call `create_recurring_schedule` (mean 63.6 ms,
   max 72.0 ms measured) at will; each call burns a PostgREST pool slot and a Postgres backend up to the
   3 s anon `statement_timeout` before raising. With PostgREST's pool default of 10
   (https://docs.postgrest.org/en/v13/references/configuration.html, fetched 2026-07-27), **10 concurrent
   anonymous callers can hold the entire pool** and every legitimate request gets PGRST003 / HTTP 504.
3. Proof that the review process cannot see this class of defect, which is the finding that actually matters.

**Breaking point.** The DoS is live **now, at 4 gyms** — it needs 10 concurrent HTTP requests and no account.
The data risk breaks the day any one of those five functions is refactored to derive its gym from an argument
instead of `staff_gym()`, or is changed to `SECURITY DEFINER` — at which point the missing revoke becomes an
unauthenticated write.

**Exit trigger / fix.** Add a guard test that asserts the expected `anon`-EXECUTE allowlist is exactly
`{enviar_mensaje_contacto, invitacion_info}` and fails otherwise. Cheap: one SQL snapshot committed to the
repo, or a `test:denial` suite asserting `has_function_privilege('anon', …)` for all 38. Until that guard
exists, treat every future "we revoked it" as unverified — it has already regressed once.

---

### #5 — `test:denial` is a human convention that cannot be machine-enforced on this setup, and the guards that *are* machine-enforced check wiring, not behaviour

**What is actually enforced.** I read both guards. They are good, and they are honest about their own limits.

- `tools/guards/rpc-write-coverage.test.ts` — 5 assertions: every writer is listed; no reader/phantom is
  listed; every listed suite exists on disk **and is in the runner's `SUITE` array**; every listed suite
  textually **invokes** the function; quarantine entries carry a reason. The obligation set is *derived* by
  replaying `supabase/migrations/` (`denial-suite.ts:93-120`) — I re-ran that derivation and it is correct.
- `tools/guards/denial-suite-drift.test.ts` — every `*.sql` on disk is in `SUITE` or `QUARANTINE`.
- `supabase/tests/run-denial-suite.mjs:37` `SUITE` has 31 files; `:83` `QUARANTINE = []` — nothing parked.

The guard's own docstring states the limit plainly (`rpc-write-coverage.test.ts:18-21`): *"this guard proves a
covering suite EXISTS, is WIRED, and INVOKES the function. It cannot prove the suite asserts the function's
WRITTEN ROWS rather than its return value."* That is exactly right and I have nothing to add to it.

**What is not enforced, and cannot be.** `pnpm test:denial` is in neither `.husky/pre-commit`
(`pnpm lint && pnpm typecheck && pnpm test`) nor `.github/workflows/ci.yml` (`lint`, `typecheck`, `test`,
`build` — I read the whole file). AGENTS.md is explicit that this is deliberate: the runner needs a
`SUPABASE_ACCESS_TOKEN` and a throwaway project, and `run-denial-suite.mjs:140` refuses the live ref.

**Is a human-convention gate viable permanently? No, and here is the failure mode with a number.**

86 commits touch `supabase/migrations/`. The convention is "any migration-bearing change runs `pnpm test:denial`
green against a scratch project before it fast-forwards to `main`." Three properties make this fail:

1. **It is unobservable after the fact.** Nothing in the repo records that a run happened. There is no
   artifact, no timestamp, no "denial: green" trailer in the commit messages I read (`git log --format=%s --
   supabase/migrations`, 86 entries — none mention denial). So the convention cannot be audited, only trusted.
   A convention you cannot audit has already been broken; you just don't know when.
2. **The cost is front-loaded onto the busiest moment.** Running it requires provisioning or reusing a scratch
   project, exporting a PAT, and replaying 87 migrations. The memory record shows the scratch project
   (`gyyujeguycxxoaqgdnjp`) is kept alive precisely to avoid that cost — which is the right mitigation and
   also the tell: the cost is high enough that it had to be mitigated. On the week where a member-facing bug
   needs a same-day migration, the marginal cost of skipping is zero and the marginal cost of running is 15
   minutes. It gets skipped.
3. **Prod cannot be reconciled against the repo, so "did it actually get applied correctly" is unanswerable.**

```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;  -- 87 rows
```
vs `ls supabase/migrations/*.sql` — 87 files. Diffed both ways:

```
versions present in BOTH:               22 / 87   (25%)
repo versions prod has never heard of:  65
prod versions with no repo file:        65
names in both:                          87 / 87   (100%)
```

**Honest reading:** all 87 *names* match exactly, so the content identity is almost certainly intact — this is
version-stamp drift from `apply_migration` restamping, not evidence of untracked prod DDL. I want that stated
plainly because it would be easy to over-claim here. But the consequence is real and permanent:
`supabase migration list` and `supabase db push` are **unusable forever** on this project (a push would
re-apply 65 migrations, seeds included). There is therefore **no command that answers "is prod's schema the
one the suites were run against?"** The scratch project is built by replaying files; prod was built by a
different sequence. Their equality is an article of faith.

**Breaking point.** The convention survives exactly as long as one person holds the whole system in their head.
It fails at **the second contributor**, or **the first week with two migrations and a deadline** — whichever
comes first. At 3,000 gyms neither condition is optional.

**What would make it machine-enforced cheaply** (in ascending cost):
1. **Free, today:** a `postgres:17` service container in `.github/workflows/ci.yml`, `psql -f` every file in
   `supabase/migrations/` in filename order, then run the 31 `SUITE` files against it. The suites are
   self-asserting, transaction-local, and roll back (`run-denial-suite.mjs`); they need Postgres, not
   Supabase. The only blockers are `auth.uid()`/`auth.jwt()` and the vault key — both stubbable in ~40 lines
   of a CI-only bootstrap SQL file. This removes the PAT and the scratch project from the loop entirely and
   turns the whole gate green-or-red on every push. **This is the recommendation.**
2. If the auth stubs prove too invasive, keep the scratch project but put the PAT in GitHub Actions secrets
   and run `test:denial` on `push` to any branch touching `supabase/migrations/**` (`paths:` filter). Cost:
   one already-existing scratch project, zero new dollars.
3. Add a `schema-fingerprint` guard: a committed snapshot of `pg_proc` (name, args, prosecdef, proacl hash)
   for all 38 functions, plus a test that fails when the derived-from-migrations set disagrees with it. This
   is what would have caught #4 and the stale "34 functions" docstring.

---

## Answers to the mandate's five questions

### (1) Versioning — is there a zero-downtime story?
**No.** See #1. Ten breaking rolls in 51 days; the money path rolled 5 times in 44 days; the escape hatch
(temporary overload) is blocked by default-arg ambiguity; the repo's own migration comment documents the
outage window and marks it "Accepted for a solo deploy." There is no API version, no `Accept-Profile` schema
switch, no dual-write, no flag. The TS types are hand-edited to match, by instruction.

### (2) Contract testing — is a human-convention gate viable permanently?
**No.** See #5. It is unobservable, unauditable, front-loaded onto the busiest moment, and it sits on top of a
prod↔repo relationship (25% version match) that no command can verify. Honest failure mode: it does not fail
loudly on a busy week — it fails *silently*, because skipping produces a green `pnpm test` and a green CI.
The cheap fix is a `postgres:17` service container in the existing CI workflow; the suites need Postgres, not
Supabase, and CI already has 4 gates it could become the 5th of.

### (3) Business logic in plpgsql — the real cost
- **Testability:** actually *good*, and better than most service layers. 31 self-asserting SQL suites, 25/25
  writers mapped in `rpc-coverage.json`, obligation set derived not declared. This is the strongest part of
  the design and I want that on the record. The gap is that it never runs automatically (#5).
- **Observability:** the worst part. Cannot trace inside a function at all — `track='top'`,
  `track_functions=none`, `log_nested_statements=off`, and `auto_explain` provably unreachable (#3). A 10,743-char
  `registrar_venta` is a black box with a single aggregate timing.
- **Refactorability:** every change to a writer's shape is a DDL migration + a hand-edited type + a coordinated
  deploy (#1). Compare: changing a TS service function's signature is a compile error caught in 200 ms.
- **Hiring:** 100 raise sites of Spanish plpgsql, `plpgsql_check` is loaded in
  `shared_preload_libraries` but there is no evidence it is run. There is no plpgsql linting, formatting, or
  coverage in `pnpm lint` (`eslint . && depcruise apps packages`). A new hire gets no tool support at all in the
  layer that holds the domain.

### (4) Is "the written rows are the contract, not the return value" sufficient?
**No — it covers one of four contract surfaces.** It is a good rule for the surface it names (#78/#80 were
real write bugs and the rule is well-aimed). The three it does not cover:
- **The error contract.** 100 raises, 95 without SQLSTATE, 27/49 messages unasserted, string-matched in TS
  against a mock (#2). No rule mentions raises at all.
- **The privilege contract.** Five anon-executable writers live, five prior regressions of the same class, zero
  guards (#4).
- **The signature contract.** Nothing requires a rollout plan for an arity change; the plan docs instead say
  "hand-edit the type" (#1).

A sufficient rule would read: *a migration that changes what an RPC writes, raises, or accepts ships with a
suite assertion on the written rows, an assertion on every raise message it adds or renames, an assertion on
its `anon`/`authenticated` EXECUTE grants, and — for an arity change — a stated rollout order.*

### (5) PostgREST specifics — does RPC-heavy traffic change the connection math?
**Yes, by ~50x per call, measured.**

```sql
SELECT sum(calls) AS total_calls, round(sum(total_exec_time)::numeric/1000,1) AS total_exec_sec,
  round((sum(total_exec_time) FILTER (WHERE query LIKE 'WITH pgrst_source%'))::numeric/1000,1) AS pgrst_exec_sec,
  sum(calls) FILTER (WHERE query LIKE 'WITH pgrst_source%') AS pgrst_calls, ... FROM pg_stat_statements;
-- total_calls 177444 | total_exec_sec 233.4 | pgrst_exec_sec 28.9 | pgrst_calls 53889
-- write_rpc_exec_sec 12.0 | write_rpc_calls 739
```

| | calls | DB exec | mean/call |
|---|---|---|---|
| all PostgREST | 53,889 | 28.9 s | 0.536 ms |
| **write RPCs** | **739 (1.37%)** | **12.0 s (41.5%)** | **16.24 ms** |
| everything else | 53,150 | 16.9 s | 0.318 ms |

**Write RPCs are 1.37% of PostgREST calls and 41.5% of PostgREST DB time — 51x the per-call cost.** A plain
REST read releases the pool slot in ~0.3 ms; an RPC holds one connection for the entire plpgsql body inside an
implicit transaction. Connection-seconds, not request count, is the currency.

**The pool.** PostgREST's `db-pool` default is **10**, `db-pool-acquisition-timeout` default **10 s**, and pool
starvation surfaces as **PGRST003 / HTTP 504 "The request timed out waiting for a pool connection"**
(https://docs.postgrest.org/en/v13/references/configuration.html and
https://docs.postgrest.org/en/v13/references/errors.html, both fetched 2026-07-27). Supabase does not publish
its per-instance PostgREST pool value; its guidance is *"be conscientious about raising your pool size past 40%
of the Database Max Connections"* (https://supabase.com/docs/guides/database/connection-management, fetched
2026-07-27) → with `max_connections = 60` (confirmed live; matches Nano/Micro in
https://supabase.com/docs/guides/platform/compute-and-disk, fetched 2026-07-27) that is **≤ 24**.
I mark Supabase's actual configured value **ASSERTED/unknown** and model both P=10 and P=24.

Note also `db-pool-acquisition-timeout` (10 s) **exceeds** `authenticated` `statement_timeout` (8 s): a request
can wait 10 s for a slot and then still be killed at 8 s — a worst-case user-visible wait of **18 s before an
error**, with no partial feedback.

**Where it breaks, with the formula.** Model a 200-member class-based gym:

| operation | calls/gym/day | measured mean ms | ms/gym/day |
|---|---|---|---|
| `toggle_pase` (front-desk check-in) | 120 | 13.43 | 1,612 |
| `reservar_clase` (proxy: `pasar_lista_sesion`) | 120 | 11.87 | 1,424 |
| `cancelar_reserva` | 15 | ~10 | 150 |
| `registrar_venta` | 7 | 38.30 | 268 |
| `ensure_week_materialized` (30 agenda loads) | 30 | 11.61 | 348 |
| **total write-RPC** | **292** | | **≈ 3.8 s** |

Scaling by the measured 41.5% write share → **≈ 9.2 s of DB exec per gym per day**.
At 3,000 gyms: 27,500 s/day = **7.6 core-hours/day**, mean utilisation **0.32 cores**. Gym check-ins cluster
06:00-09:00 and 17:00-21:00 local, and Mexico spans only ~2 h of timezone, so peak/mean ≈ 8 →
**≈ 2.5 cores at peak** against a Micro's 2 shared vCPU.

**→ CPU saturates around 2,000–2,500 gyms on Micro, before the pool does.** Compute is cheap
(Small $15/mo, Medium $60/mo, Large $110/mo — https://supabase.com/pricing, fetched 2026-07-27), so this is a
credit-card problem, not an architecture problem, and I will say so plainly.

Pool exhaustion is the *conditional* break. Concurrent slots held = peak arrival × mean hold:

```
gyms_max = P / (H_seconds × peak_factor × rpc_per_gym_per_second)
         = P / (H × 8 × 292/86400)
         = P / (H × 0.02704)
```

| mean write-RPC hold H | gyms_max @ P=10 | gyms_max @ P=24 |
|---|---|---|
| 16 ms (**today's measured**) | 23,100 | 55,500 |
| 100 ms | 3,700 | 8,900 |
| 500 ms | **740** | **1,780** |
| 1,000 ms | 370 | 890 |

**So: the pool is not the binding constraint at today's per-call cost, and pretending otherwise would be
manufacturing a finding.** It becomes the binding constraint the moment mean write-RPC hold reaches
~500 ms — and the orchestrator's own baseline plus the ADR-0013 warning say that is the live direction of
travel: `ventas` has no index on `cliente_id`, `clientes` has no leading-column index on `auth_user_id`, and
the gym RLS helper compiles to a correlated SubPlan evaluated **per row**. `registrar_venta` already reaches
100 ms on 175 ventas rows.

**Error surface at saturation is uninformative:** PGRST003 is a bare 504 that names no function. With
`pg_stat_statements` evicting by then (#3) and `auto_explain` dead (#3), you will have a 504 and no way to
learn which RPC caused it.

**Exit trigger for the connection model:** `max(mean_exec_time)` across write RPCs in `pg_stat_statements`
crossing **150 ms**, or any observed PGRST003. Either one means move the write path off the shared PostgREST
pool (dedicated pooler / direct connection for the money path) before adding compute.

---

## What is genuinely sound (checked, not assumed)

Rule 7. These are real and I looked for reasons to downgrade them.

1. **The DAL seam is airtight.** All 34 `.rpc(` call sites are in `packages/data/src/server/*.ts`. Zero in
   `apps/*`, zero in client bundles. `createClient()` (`supabase.ts:21`) and `createAnonClient()` (`:56`) both
   use the publishable key — **`service_role` never enters the Next apps**. I checked: the only
   `SUPABASE_SERVICE_ROLE_KEY` consumer is `supabase/functions/activar-cuenta/index.ts:36`. That is the single
   most common way this architecture goes catastrophically wrong and it has been avoided.
2. **`set search_path=''` on all 38 functions.** No exceptions. This closes the classic `SECURITY DEFINER`
   search-path hijack, and it is applied uniformly rather than case by case.
3. **The derived-obligation coverage guard is genuinely un-dodgeable for what it checks.** I re-ran the
   derivation independently and it reproduces prod exactly. There is no `writes: false` flag. The
   `WRITES_UPDATE` regex even tolerates `update t x set …` aliasing, with a comment explaining that it is the
   one silent-exemption path. That is careful work.
4. **The suites themselves are the right shape.** Transaction-local fixtures, `RAISE` on failure, rollback,
   31 wired, `QUARANTINE` empty. The problem is scheduling, not design.
5. **Prod schema content matches the repo.** 87/87 migration *names* align. I expected to find untracked prod
   DDL and did not.
6. **Atomicity is real where it matters.** `registrar_venta` holds a `for update` row lock and an
   idempotency key; `reservar_clase` and `pasar_lista_sesion` each take a `pg_advisory` lock. That is the
   right primitive in the right three places, and it is the strongest single argument *for* the RPC design
   over a service layer: a Node service would need a distributed lock to get the same guarantee.

---

## Verdict

**Keep the RPC surface. It is the correct choice for atomicity and it buys real tenant-isolation guarantees a
Node service layer would have to re-earn.** The five defects above are all *fixable within the RPC design* —
none of them argues for a service layer. Rewriting 25 plpgsql writers into a Node service would cost months and
would trade a documented, testable, atomic surface for a distributed-lock problem.

**But the incumbent does not win by default, and three of these are due now, not at 3,000 gyms:** the anon
grants (#4) are live today, `auto_explain` (#3) is dead today, and the error contract (#2) is silently
breakable today. Cost to fix all three: roughly one day. The versioning problem (#1) is the one that needs a
real decision, and it needs it before gym #5.

**Primary exit trigger — the number that reverses "keep RPCs-as-API":**
**the first signature roll executed with more than one revenue-generating tenant live.** At that moment the
`-- Accepted for a solo deploy` comment at `20260714110000_registrar_venta_backdate.sql:14` is false, and the
next roll must ship behind a versioned front door (a single-`jsonb`-arg RPC per writer, so the arg list never
changes again, or an `api_v2` schema selected by `Accept-Profile`) rather than a drop+create.

**Secondary triggers:** `pg_stat_statements_info.dealloc > 0`; any write RPC's `mean_exec_time` > 150 ms; any
PGRST003 in the logs; any second contributor with commit rights (at which point `test:denial` must be in CI
that same week).

---

## Blind spots — what I did NOT examine

1. **I never executed an RPC.** Read-only session. All latency figures are historical `pg_stat_statements`
   aggregates from a 4-gym workload with 15 MB of data; I did no load test, no `EXPLAIN` of any function body,
   and no concurrency test. The 500 ms hold in my pool model is **modelled, not measured**.
2. **The anon-DoS vector is reasoned, not demonstrated.** I confirmed the grant and the pool default from
   primary sources but did not (and must not) fire concurrent anonymous `create_recurring_schedule` calls at
   prod. Someone should verify against the scratch project whether Supabase's edge/API gateway rate-limits
   unauthenticated `/rest/v1/rpc/*` before the pool is reached — that would substantially downgrade #4's item 2.
3. **Supabase's actual configured PostgREST `db-pool` value.** Not published; not reachable without the
   dashboard. I modelled P=10 and P=24. Someone with dashboard access should read the real number — it moves
   every row of my pool table.
4. **I did not read the 31 SQL suites' bodies.** I measured *which* messages they pin (grep) and *that* they
   invoke the credited function (the guard does this), but I did not verify that any given suite asserts
   written rows rather than return values. That is the guard's stated blind spot and it remains mine.
5. **RLS policy cost inside RPCs.** The ADR-0013 correlated-SubPlan issue is the largest input to my pool
   model and I took it from the orchestrator's brief rather than re-deriving it. `arch:db` should own that.
6. **Edge functions.** `supabase/functions/activar-cuenta` runs as `service_role` with **no statement_timeout**
   (`rolconfig` NULL → cluster default 120 s). I noted it and did not audit it. A `service_role` query that
   hangs holds a connection for two minutes against `max_connections = 60`. That is a separate audit.
