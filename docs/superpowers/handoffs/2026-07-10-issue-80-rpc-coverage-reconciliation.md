# Handoff — #80 AC4+AC6 reconciled onto post-renewal-flow main & shipped (2026-07-10)

**For the next session: this is written to be *audited*.** Every claim below is paired with a command
you can run to confirm it independently. Don't take my word for the reconciliation calls — check them.

---

## TL;DR

- **#80 (RPC test coverage) AC4 + AC6 shipped to `main` as one commit `81454b3`, fast-forward, pushed to
  `origin/main`. Issue #80 is CLOSED.**
- 14 files, **+602 / −42**. No migrations. Test suites + guards + one doc fix only.
- Confidence boundary: verified by the local gate (lint/typecheck/**861** vitest incl. both guards) **and**
  a 4-agent adversarial static check vs the deployed RPC bodies (0 findings). **NOT run against a database**
  this pass (owner chose "push now"). The definitive check — a scratch `pnpm test:denial` — was skipped.

---

## Why this session was non-trivial (the starting state)

My `rpc-write-coverage-80` branch was cut from the **old** main `def8434`. Between then and now, the
**renewal-flow** work merged **~18 commits** into main (`9b09bc2`), and — critically — it **rewrote the
very RPCs three of my suites assert against**:

| Renewal migration | Changed | Effect on my suites |
|---|---|---|
| `20260710121000_registrar_venta_rederive.sql` | `registrar_venta` — new signature `(p_metodo, p_paquete_id, p_idempotency_key, …)`, re-derives monto/clases/vence from the paquete row | My old 12-arg call was **invalid**; hard conflict |
| `20260710123000_reservation_consume_flag.sql` | `reservar_clase` + `cancelar_reserva` — added `consumio` flag | Hard conflict on `reservar_clase_rules.sql` |
| `20260710124000_toggle_pase_unify_surfaces.sql` | `toggle_pase` unified across surfaces | Auto-merge; un-quarantined 2 suites |
| `20260710120000_renewal_schema_prep.sql` | schema prep (no functions) | — |

**5 files were touched by both branches** → 2 hard conflicts, 3 auto-merges. So this was a semantic
reconciliation, not a mechanical rebase.

Verify the starting divergence:
```
git merge-base rpc-write-coverage-80@{/close} main   # was def8434 (branch gone now; see reflog note below)
git log --oneline def8434..9b09bc2                   # the ~18 renewal commits
```

---

## What we did (and the decisions to audit)

1. **Analyzed** the git state + conflict/semantic drift (read-only) before touching anything.
2. **Backed up** the pre-rebase tip as `rpc-80-prerebase` (@ `15c9c21`), then **rebased** onto `main`.
3. **Reconciled the 5 overlapping files.** These are the judgment calls worth auditing:

   | File | Resolution | **Audit this** |
   |---|---|---|
   | `registrar_venta_stamps_gym_id.sql` | **Took main's verbatim.** My AC4 payload asserts were redundant with renewal-flow's `registrar_venta_stacking.sql` (13-vector written-row contract) **and** were written for the dead signature. | `git diff 9b09bc2 81454b3 -- supabase/tests/registrar_venta_stamps_gym_id.sql` → **empty** (identical to main). Then read `registrar_venta_stacking.sql` and confirm it asserts `ventas.{monto,metodo,gym_id}` + `clientes.{clases_restantes,vence,paquete_nombre,email}`. If you disagree it's fully covered, that's the one place coverage could have regressed. |
   | `reservar_clase_rules.sql` | **Union** — main's `consumio` asserts + my two grafts: a `reservation.gym_id` stamp check, and a deliberately-dirtied fixture (`is_walk_in=true, checked_at=now()`) + a 4-column reuse-arm reset readback. | Confirm the deployed reuse arm actually resets those 4 cols: `supabase/migrations/20260710123000_reservation_consume_flag.sql` → `update public.reservation set status='reservada', is_walk_in=false, cancelled_at=null, checked_at=null`. And the fresh insert stamps `gym_id` from `v_gym` (the session). If the reset list ever changes, my graft breaks. |
   | `reclamar_por_codigo.sql` | Auto-merge kept (function unchanged by renewal). My AC4 added a 6-col readback incl. `phone_e164`, `terms_accepted_at`, `privacy_accepted_at`. | `git diff 9b09bc2 81454b3 -- supabase/tests/reclamar_por_codigo.sql` — should be only my added asserts. |
   | `pasar_lista_sesion_rules.sql` | Auto-merge kept. My AC4 added `checked_at` + stored asistencia `hora/gym_id/fecha` readbacks. | The asserts read `current_setting('t.gym')` + `current_setting('t.today')`; confirm the seed sets both (lines ~79–80) — else they'd NULL-compare and false-fail. |
   | `run-denial-suite.mjs` | Auto-merge union: main's `SUITE` (toggle_pase un-quarantined + stacking + renewal_schema_prep) **+** my `paquete_marketing_rules.sql`. | Confirm no dupes and `toggle_pase_*` are in SUITE (not QUARANTINE). |

4. **Amended the commit message** to record the reconciliation (registrar_venta AC4 dropped, reservar_clase unioned).
5. **Verified** (below), then **fast-forwarded main + pushed**, **closed #80**, deleted the temp branches, updated memory.

---

## The confidence boundary — READ THIS BEFORE AUDITING

- **No scratch `test:denial` run happened.** The suites are inspection- and static-verified only. The
  owner explicitly approved "push now" on the basis that the change ships **no migrations**, the overlapping
  suites are renewal-flow's **already-scratch-proven** versions, and a denial-suite bug would only surface
  on a future `test:denial` run — never in the app.
- **Highest audit priority: `supabase/tests/paquete_marketing_rules.sql`** — it is NET-NEW and has **never
  executed against any database**. The adversarial agents verified it statically against the deployed
  `actualizar_paquete_marketing(p_id, p_code, p_name, p_subtitle, p_badge, p_cadence)` and
  `set_plan_features(p_plan_id, p_labels text[])` bodies (0 findings), but only a real run is definitive.
- Second priority: my `reservar_clase_rules.sql` grafts (new assertions, though verified vs the deployed body).

---

## Audit checklist (independent verification)

```bash
# 1. What shipped, and that it's a clean fast-forward (no merge commit)
git show 81454b3 --stat
git log --oneline --merges 9b09bc2..81454b3          # EMPTY = fast-forward, no merge

# 2. The whole diff #80 added on top of renewal-flow main
git diff 9b09bc2 81454b3

# 3. registrar_venta_stamps is identical to main (my redundant AC4 work was dropped)
git diff 9b09bc2 81454b3 -- supabase/tests/registrar_venta_stamps_gym_id.sql   # EMPTY

# 4. The full local gate (should be green: lint 0 err, typecheck, 861 vitest)
pnpm lint && pnpm typecheck && pnpm test

# 5. The write-coverage guard specifically (derives 25 writers from migrations, checks the map)
pnpm vitest run tools/guards/rpc-write-coverage.test.ts tools/guards/denial-suite-drift.test.ts

# 6. THE DEFINITIVE CHECK we did NOT run — a real scratch DB run.
#    Needs a scratch Supabase ref + PAT, and a seeded forge owner/operator gym_membership row
#    (registrar_venta_* + gym2_probe resolve the operator from it). Runner refuses the live ref.
SUPABASE_TARGET_REF=<scratch-ref> SUPABASE_ACCESS_TOKEN=<pat> pnpm test:denial
```

The adversarial verification workflow's per-agent output (each quoting the deployed signatures it read):
`.../035d3839-.../subagents/workflows/wf_307b271c-0a2/journal.jsonl`

---

## Files changed (14)

**AC6 — coverage machinery (new):**
- `tools/guards/denial-suite.ts` — shared helper; replays migrations order-sensitively, derives writer/reader from each body's DML.
- `tools/guards/rpc-write-coverage.test.ts` — fails if a derived writer is absent from the map.
- `supabase/tests/rpc-coverage.json` — 25-writer → suite map (4 quarantined pre-Contract-B).
- `tools/guards/denial-suite-drift.test.ts` — refactored onto the shared helper.

**AC4 — assertions (1 new suite + deepenings):**
- `supabase/tests/paquete_marketing_rules.sql` (NEW, +219) — `actualizar_paquete_marketing` + `set_plan_features`.
- `reclamar_por_codigo.sql`, `reservar_clase_rules.sql`, `pasar_lista_sesion_rules.sql`,
  `actualizar_cliente_email_rules.sql`, `contract_b_denials.sql`, `scheduling_materialization.sql`,
  `scheduling_rls_denial.sql`.

**Wiring + docs:** `run-denial-suite.mjs` (SUITE union), `AGENTS.md` (writes-vs-SECURITY-DEFINER axis fix).

---

## Open items / not-in-scope

- **#81** — rewrite the 4 quarantined pre-Contract-B suites (`actualizar_paquete`, and the plantilla trio:
  `actualizar_plantilla` / `eliminar_plantilla` / `sembrar_plantillas_default`). Their real payload suites
  (`actualizar_paquete_rules.sql`, `plantillas_rules.sql`) are parked; the coverage map records the reason.
  A scratch `test:denial` run will matter there.
- The `test:denial` scratch run for #80 was skipped — if the audit wants belt-and-suspenders, running it
  (checklist #6) is the definitive proof the reconciled/new suites are green against the live contract.

## Recovery note

The pre-rebase tip `15c9c21` (branch `rpc-80-prerebase`, since deleted) is still reachable via
`git reflog` / `git fsck --lost-found` if you ever need to diff the *original* #80 branch against what
actually shipped. The original `def8434`-based branch is gone; `81454b3` is the reconciled result.
