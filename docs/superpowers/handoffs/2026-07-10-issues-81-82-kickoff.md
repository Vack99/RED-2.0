# Handoff — kickoff context for #81 (quarantine rewrite) and #82 (renewal fast-follows)

Written 2026-07-10, after the post-ship audit session. Claims are paired with verification commands —
don't take the summary's word for anything that matters.

---

## TL;DR — the state you inherit

- `main` @ `c11aa14`, pushed, working tree clean. Everything is green **including the previously-skipped
  definitive gate**: `pnpm test:denial` ran **32/32** against a real scratch DB today (full 66-migration
  replay), then the scratch was deleted. Live prod (`hjppxawglmukfvsgmcog`, Forge-1.0) was audited the
  same day: migration parity, deployed signatures, logs, advisors — all healthy, no drift.
- The local gate is lint 0 err / typecheck / **861 vitest** (74 files) incl. the two #80 guards.
- **#81 is smaller than its issue text says** (see below): 3 files to rewrite, not 5.
- **#82 is four independent fast-follows**; two bear migrations (→ scratch gate applies), one needs an
  owner semantics ruling first, one is cosmetic-on-next-touch.

Ground truth:
```bash
git log --oneline -3        # c11aa14 (rls suite scoping), fede039 (AC4 gap patch), 81454b3 (#80)
pnpm lint && pnpm typecheck && pnpm test
gh issue view 81; gh issue view 82
```

---

## The scratch `test:denial` recipe — PROVEN TODAY, copy it verbatim

Both #81 and #82 end with this gate (any migration-bearing change requires it; #81's rewritten suites
can't go green without it). The full flow was executed 2026-07-10 and works end-to-end:

1. **PAT**: `SUPABASE_ACCESS_TOKEN` lives in `apps/admin/.env.local` (never commit/echo it).
2. **Create a throwaway free project** (org `ncozakjylxhzemtvxnop`, region `us-west-2`) via
   `POST https://api.supabase.com/v1/projects`. Free tier fits exactly ONE scratch beside live.
3. **Replay every migration in filename order** (bash-glob order is correct):
   ```bash
   for f in supabase/migrations/*.sql; do
     node supabase/tests/apply-sql.mjs "$REF" "$f" || break
   done
   ```
   All 66 apply cleanly as of `c11aa14` (verified today, zero failures).
4. **Seed the operator — REQUIRED.** `registrar_venta_stamps_gym_id.sql` and `gym2_probe.sql` resolve
   the operator from a forge `gym_membership` row; a fresh project has an empty `auth.users`, so the
   spine migration seeds the forge gym but no membership. Apply this once (via `apply-sql.mjs`):
   ```sql
   insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data)
   values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
           'scratch-op@denial.local', now(), '{}');
   insert into public.gym_membership (user_id, gym_id, role)
   select u.id, g.id, 'owner' from auth.users u, public.gym g
    where u.email = 'scratch-op@denial.local' and g.slug = 'forge';
   ```
5. **Run**: `SUPABASE_TARGET_REF=$REF SUPABASE_ACCESS_TOKEN=<pat> pnpm test:denial` → expect all green.
6. **Delete the scratch project** when done (`DELETE /v1/projects/$REF`).

Safety: `apply-sql.mjs` and the runner both hard-refuse the live ref. Never point anything writable at
`hjppxawglmukfvsgmcog`; the Supabase MCP in `.mcp.json` IS bound to live — don't use `apply_migration`
for scratch work.

**Lesson written in blood today:** suites must not count rows they didn't seed. `gym_membership_rls.sql`
false-failed (3≠2) because its "gym A" IS the seeded forge gym and the operator seed above added a row;
fixed @ `c11aa14` by scoping the allow-count to the suite's own users (deny-counts stay unscoped — any
visible row is a leak). Apply the same discipline to every suite you write for #81.

---

## #81 — rewrite the quarantined denial suites

### Correction to the issue text (verify, then trust)

The issue names **5** files, but `toggle_pase_rules.sql` + `toggle_pase_gym2_timezone.sql` were already
rewritten per-gym and un-quarantined by renewal-flow (`20260710124000`); both ran green in today's
32/32 scratch pass. Real remaining scope — the runner's `QUARANTINE` array (`run-denial-suite.mjs:82-86`):

```
actualizar_cliente_rules.sql
actualizar_paquete_rules.sql
plantillas_rules.sql
```

Verify: `node -e "import('./supabase/tests/run-denial-suite.mjs').then(m=>console.log(m.QUARANTINE))"`

### What each parked file encodes (rules NO running suite asserts)

| File | RPC(s) | Parked rules worth preserving |
|---|---|---|
| `actualizar_paquete_rules.sql` | `actualizar_paquete` — **the ONE write-bearing RPC with zero running coverage** | single-popular invariant + derived-name |
| `plantillas_rules.sql` | `actualizar_plantilla`, `eliminar_plantilla`, `sembrar_plantillas_default` | the 4-plantilla cap; real written-row asserts (today they're only invoked in `contract_a_denials.sql` anon-denial vectors, which write nothing) |
| `actualizar_cliente_rules.sql` | `actualizar_cliente` (partially covered by `actualizar_cliente_email_rules.sql`) | identity-only edits (nombre/tel edit must not touch saldo/vence) |

The 4 `"quarantined"` entries in `supabase/tests/rpc-coverage.json` (`actualizar_paquete`,
`actualizar_plantilla`, `eliminar_plantilla`, `sembrar_plantillas_default`) all point at these files
and reference #81.

### Why they broke (the rewrite pattern)

All three predate Contract-B (`20260705082018`), which dropped `user_id` from
`clientes`/`paquetes`/`plantillas`/`perfil`. They resolve the operator via the dead `perfil.user_id`
and seed rows with dead `user_id` columns → first write errors.

**Model suites for the current idiom** (all scratch-proven today):
- `supabase/tests/paquete_marketing_rules.sql` — the best template: synthetic gym + operator
  (zero prod UUIDs), `set_config('t.…')` fixtures, per-vector jwt-claims + `set local role
  authenticated`/`reset role`, nested-BEGIN savepoints for expected-failure vectors, written-row
  readbacks, one `BEGIN…ROLLBACK`.
- `supabase/tests/registrar_venta_stacking.sql` — the written-row assert style (#80 rule: *an RPC's
  return value is not its contract; the rows it writes are*).
- `supabase/tests/reservar_clase_rules.sql:49-54` — the minimal `auth.users` insert shape.

Before writing asserts, read the CURRENT function bodies — grep `supabase/migrations/` for the LATEST
`create or replace function public.<name>` (later timestamps override earlier).

### Done-when (from the issue, corrected)

All three files run in `SUITE`, `QUARANTINE` is empty, no `"quarantined"` keys remain in
`rpc-coverage.json`, and a scratch `pnpm test:denial` is fully green. The drift + write-coverage guards
(`pnpm vitest run tools/guards/rpc-write-coverage.test.ts tools/guards/denial-suite-drift.test.ts`)
enforce the wiring at every commit. Fix #81's stale title/count while closing.

---

## #82 — renewal-flow fast-follows (four independent items)

Source: the 2026-07-10 gate reviews; all explicitly ruled fast-follow, not blockers.
Full context: `docs/runbooks/renewal-flow-deploy.md` + `docs/FIndings/2026-07-08-renewal-flow-findings.md`.

1. **pasar_lista reverse double-consume (C15's other half).** Renewal fixed front-desk-after-Agenda;
   the Agenda walk-in branch (`20260706180100:104-114`) still doesn't check for an existing same-day
   front-desk row → front-desk-then-Agenda = one visit, two consumes. **OWNER SEMANTICS CALL FIRST**,
   then mirror the mistap-guard/`consumio=false` pattern from `20260710124000`. Migration-bearing →
   per AGENTS.md, the same change MUST ship written-row asserts in `pasar_lista_sesion_rules.sql`
   and pass the scratch gate.
2. **Friendly unique-violation guard on the ficha email editor.** `actualizar_cliente` can hit
   `clientes_email_gym_uq` → user sees generic "No se pudo actualizar el cliente". Copy
   `registrar_venta`'s typed-message pattern (`EMAIL_EN_USO_MSG`, see `20260710121000:148-157` and its
   TS match in the vender write path). May be TS-only or TS+function change depending on where the
   violation surfaces — check the current `actualizar_cliente` body first.
3. **Re-revoke anon EXECUTE on `actualizar_cliente`.** `20260708220000`'s drop/recreate restored anon
   EXECUTE via default privileges. One-line migration; then **narrow `contract_a_denials.sql` back**
   (it was widened to accept both grant shapes, so nothing currently forces this fix). Migration-bearing
   → scratch gate.
4. **(cosmetic, next-touch-only)** unify failure-field naming: `TogglePaseOutcome.message` vs
   `CrearVentaResult.mensaje` → DAL-majority `error`.

### Sequencing hint (if one session does both issues)

Items #82.2/#82.3 and #81's `actualizar_cliente_rules.sql` rewrite touch the same RPC's body, grants,
and suites. Cheapest order: ship #82.3's revoke migration first, narrow `contract_a_denials.sql`, then
write #81's rewritten suite asserting the corrected grant posture — one scratch project serves the
whole run (it's reusable across runs; every suite rolls back).

---

## Open bookkeeping (nothing blocking)

- Two pre-renewal migrations are missing rows in LIVE's history table though their effects are live:
  `create_rls_auto_enable` (20260531210400), `seed_red_demo_remediation_content` (20260706230000).
  Repair opportunistically next time live migrations are touched.
- `docs/superpowers/handoffs/2026-07-10-issue-80-rpc-coverage-reconciliation.md` documents the #80
  reconciliation this session audited; its "highest audit priority" items are all now resolved
  (scratch-proven) — read it only for history.
