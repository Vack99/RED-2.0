# `registrar_venta` double overload — 300/PGRST203, total sales outage (2026-08-27)

Window ≈ **06:16:58Z → ~15:30Z** (~9h15m), UTC throughout.

| When | What |
|---|---|
| 08-25 14:59 | Prod applies `20260825145937_staff_gym_tenant_in_effect` + `fijar_asistencia_idempotente` + `crear_plantilla_gym_target` from the mobile lane. 11 RPCs grow a trailing `p_gym_id uuid default null`. **None of the three is committed to this repo.** |
| 08-27 06:16:58 | `20260826120200_registrar_venta_reset.sql` (FULL RESET, ADR-0003 Amendment 2) is applied. It `CREATE OR REPLACE`s at the **14-arg** signature; against a 15-arg function that is a CREATE, not a replace. Prod now holds two `registrar_venta`s — sales break at this instant. |
| 12:03 – 14:00 | 7 logged `300 PGRST203` on `POST /rest/v1/rpc/registrar_venta`. |
| ~15:30 | `20260827160000_registrar_venta_overload_fix.sql` applied. Sales restored. |

## Root cause

Uncommitted prod drift met a `create or replace` written against the repo's stale picture of the
signature. Postgres identifies a function by name **+ argument types**, so replacing at an argument
list that no longer exists creates a sibling instead. PostgREST routes `public` by NAME: a payload
matching both candidates is unresolvable and it answers `300/PGRST203` before a line of SQL runs.
The trap was armed for all 11 widened RPCs — any future migration that replaces one at its
pre-08-25 signature re-creates this outage.

## Blast radius

- **100% of web sales refused** for the window — every desk `VENDER` / `RENOVAR`.
- **Zero rows written, zero rows lost.** All failures were pre-SQL routing errors: no partial sale,
  no half-applied balance, no idempotency key burned.
- **The FULL RESET ruling never served traffic** — it shipped 06:16:58Z and was unreachable from
  that same instant. It first ran for real after the fix.
- **ADR-0005 regression, now gone.** `CREATE FUNCTION` grants EXECUTE to `public`, so the accidental
  14-arg overload was `anon`-callable; the drop removed the grant with it. Never reachable in
  practice — PostgREST refused to resolve the name at all.

## The fix

`20260827160000_registrar_venta_overload_fix.sql` (already applied to prod): drop the 14-arg,
`create or replace` the 15-arg with the tenant-in-effect prologue and the FULL RESET body, re-assert
grants, then `raise` unless exactly one `registrar_venta` survives. The three prod-only migrations
are recovered into `supabase/migrations/` under their **prod version numbers**, bodies verified
byte-identical to the applied statements (whitespace-normalized md5 vs `schema_migrations`).

## The guard

`tools/guards/rpc-overload.test.ts`, in the normal `pnpm test` gate. The replay in
`tools/guards/denial-suite.ts` is now keyed by **signature** rather than name — a `drop` cancels one
overload, a `create or replace` at an undropped argument list adds one — and the guard fails if any
`public` function survives with more than one. Verified two ways: it reproduces this exact outage
when the fix migration is removed, and its 55-signature census matches prod's `pg_proc`
name-for-name and arity-for-arity.

**Still owed:** `dos_gimnasios_staff_pin{,_agenda}.sql`, the written-row suites for the 11 widened
RPCs, remain uncommitted on the mobile lane and ship with it.

## Post-fix exposure audit + ilimitado sweep-hole corrections (same day, owner-consented)

Audit of every sale that succeeded between the 08-26 reset sweep and the outage start: the sweep
absorbed all pre-sweep stacking; the 10 swept members held their §7 values; one in-window renewal
stacked. Full-platform replay (forge + red, every member) found exactly 3 drifted rows — all
*ilimitado*: the sweep's `clases_restantes IS NOT NULL` scope filter had silently excluded every
unlimited member. Reset is proven live post-fix: folio 1041 (forge-demo, 16:30:53Z) discarded a
live 4-day carry and wrote `inicio + 30` exactly.

Date-only corrections applied to prod (owner-consented via picker; `clases_restantes` untouched):

| member | gym | applied vence | rollback |
|---|---|---|---|
| Fernanda Chávez Quezada `841724f6` | red | 2026-09-25 | 2026-09-28 |
| Elsa María Rodríguez González `a9bee3e6` | red | 2026-09-16 | 2026-09-18 |
| Sandra Báez Lopez `b64a15a4` | red | 2026-08-19 | 2026-08-24 |
| Testing new sale system `e6995a10` | forge-demo | 2026-09-26 | 2026-10-03 |

Each UPDATE was guarded on the expected old value and verified with a fresh SELECT. Remaining
deviations platform-wide: only the parked Hanna Minjarez / Oscar Anchondo eventless-0 rows
(owner ruling pending). Carolina Nieto had still not been re-renewed at audit time.
