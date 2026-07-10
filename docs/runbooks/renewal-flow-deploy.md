# Renewal-flow deploy gate (branch `renewal-flow`, 2026-07-10)

Everything on the branch is gate-passed and proven; **only the live mutations remain**, and they
need you (the session's auto-mode permission boundary blocks live prod DDL/writes — correctly).
Deploy order is load-bearing: **migrations first, push second** — the new app code calls the new
8-param `registrar_venta`, so pushing before applying breaks COBRAR until the migrations land.

Evidence already banked: 31/31 denial suites green on a full 67-migration scratch replay
(scratch `scswnmluoxuztlqdlvno`, torn down); vitest 856/856; lint/typecheck/boundary green;
per-task reviews + whole-branch senior review (Ready to merge: Yes); Elegance gate YES — 100%;
Senior Dev gate APPROVED — 100%.

## 1. Apply the four migrations to live — IN THIS ORDER (MCP `apply_migration`, or paste each into the SQL editor)

| order | file | what it does |
|---|---|---|
| 1 | `supabase/migrations/20260710120000_renewal_schema_prep.sql` | idempotency column+index, metodo CHECK narrow, reservation.consumio + backfill, seed-email scrub + unique email index |
| 2 | `supabase/migrations/20260710121000_registrar_venta_rederive.sql` | drops the 12-arg overload, creates the locked re-deriving 8-param RPC |
| 3 | `supabase/migrations/20260710123000_reservation_consume_flag.sql` | reservar_clase stamps consumio; cancelar_reserva refunds iff consumed |
| 4 | `supabase/migrations/20260710124000_toggle_pase_unify_surfaces.sql` | C15 mistap guard + booked-no-consume + C9 walk-in vigencia |

⚠️ From step 2 until the app deploy finishes, the OLD deployed admin's COBRAR fails loudly
(PGRST202, generic toast, zero partial writes). Do steps 1–4 and step 2 below back-to-back.

## 2. Fast-forward main and push (triggers the Vercel deploys)

```
git checkout main && git merge --ff-only renewal-flow && git push
```

## 3. Post-deploy smokes (2 minutes)

- One real COBRAR each way: an EXISTENTE renewal (check the receipt's vence = old vence + 30 for
  a `mes` package) and a NUEVO sale (dup-guard: re-submitting the same tel must offer
  USAR EXISTENTE / CREAR NUEVO).
- Open the ficha of a member whose **last purchase is >30 days old** — the clases gauge must
  render (this exercises the one PostgREST `.or()` filter no automated test executes).

## 4. Reconcile the two duplicate members (live data repair)

Run `docs/runbooks/duplicate-member-merge.md` — the two RED pairs (Jesus Ojeda tel 6142397814,
Teodoro Rodriguez tel 6142904320) are its worked example; resolve the real UUIDs with its Step-0
lookup, never paste truncated ids. Every guard is fail-closed; each pair is one transaction.
Note (senior review): the locked survivor-takes-newest-saldo rule shortchanges Pair A ~1–2 days
vs ideal stacking (the June row still had ~1 day left on 07-08); gift them via the
venta-correction runbook if you care.

## 5. Re-verify gate (optional but cheap)

`SUPABASE_ACCESS_TOKEN=<pat from apps/admin/.env.local> SUPABASE_TARGET_REF=<fresh scratch ref> pnpm test:denial`
after creating a throwaway project and replaying `supabase/migrations/*` with
`node supabase/tests/apply-sql.mjs <ref> <file>` (loop in order). Delete the scratch after.
