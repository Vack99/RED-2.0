# hitl-28 cutover evidence log

Recorded by the 2026-07-05 orchestration session. Companion to
`docs/runbooks/hitl-28-live-cutover-deploy-verify.md` and
`docs/superpowers/plans/2026-07-05-issue28-live-cutover.md`.

## Data-integrity baseline (live, 2026-07-05, pre-everything)

Operator continuity: `nahumtrevizo2@gmail.com` = `cf9b5357-dad5-4e2e-8954-3caf2d0f13a6`,
email confirmed, `gym_membership` = **owner of forge** (`d5f81022-0f3d-48ac-96b9-5e32a5214285`).
Post-contract access rides `is_staff_of`/`has_role` via this row; nothing keys on `user_id`.

Row counts (must be identical after Migration A and after Migration B):

| table | total | per gym |
|---|---|---|
| clientes | 35 | forge 20 · forge-demo 15 · red 0 |
| ventas | 31 | forge 20 ($22,690) · forge-demo 11 ($10,197) · red 0 |
| asistencias | 195 | |
| perfil | 2 | |
| plantillas | 8 | |
| cobro | 2 | |
| paquetes | 6 | |

The only data the contract destroys by design: the redundant per-row `user_id`
operator stamp (7 columns). All rows, balances, and the auth account survive.

## Rehearsal (throwaway project `cwwjwnvdqjerkgejqdye`, 2026-07-05)

- Migration replay ×26: catalog parity vs live EXACT (43/21/21/1 policies, claim RPC secdef+anon-denied, 3 RPCs on staff_gym, 7 user_id NOT NULL).
- Suite green BEFORE (6/6, after the folio_per_gym fixture fix: membership seeds — over-denial fixture bug, not a leak).
- **Rollback-A exercised for real: restores all 21 legacy policies** (caveat: does NOT restore the anon EXECUTE grants — harmless, disclosed).
- Migration A → suite green AFTER-A (6/6 unchanged files, +contract_a → 7/7).
- Fixture user_id sweep → Migration B → suite green AFTER-B (8/8).
- gym-#2 probe PASS: claim w/ balance carry, cross-gym invisibility, folio 1001 independent, America/Mexico_City dates.
- Post-B catalog on rehearsal DB: total 22 policies, **0 legacy, 0 user_id columns**, member seam + next_folio guard intact.

## Pre-Gate-1 (live, 2026-07-05)

- Manual backup: `C:\Users\Aaron\Documents\RED-2.0-backups\2026-07-05-pre-gate1\` — 13 files,
  all public tables + auth identities + the 7 tables' user_id stamps. Counts match baseline exactly.
- BEFORE-A live catalog snapshot: `{total_policies: 43, legacy_policies: 21, user_id_columns: 7, member_select: 1, legacy_rpcs_anon_exec: true}`.

## Stage log

- [x] 2026-07-05 — baseline recorded (above)
- [x] 2026-07-05 — claim RPC applied to live (`20260705070642`), anon denied, authenticated granted
- [x] 2026-07-05 — rehearsal complete, all gates green
- [x] 2026-07-05 — pre-Gate-1 backup + BEFORE-A snapshot recorded
- [x] 2026-07-05 — **GATE 1 executed (owner GO): Migration A live** (`contract_a_drop_legacy_policies`).
  AFTER-A snapshot: `{total_policies: 22, legacy_policies: 0, member_select: 1, membership_self_select: 1, any_legacy_rpc_anon_exec: false}`.
  Row counts identical to baseline (35/31/195/2/8/2/6). Awaiting human prod-health check before Gate 2.
- [x] 2026-07-05 — **human prod-health check between gates: all 5 green** (login, agenda, one real sale, plantillas, toggle_pase).
- [x] 2026-07-05 — **GATE 2 executed (owner GO): Migration B live** (`contract_b_drop_user_id_columns`).
  **AC catalog proof:** `{total_policies: 22, legacy_policies: 0, user_id_columns: 0, member_select: 1, auth_user_id_col: 1, next_folio_guarded: true}`.
  Row counts vs backup: 36/32/198 clientes/ventas/asistencias (+1/+1/+3 = the Gate-1 health-check sale + pases; monto +$799), perfil/plantillas/cobro/paquetes unchanged (2/8/2/6). **Zero data loss.**
  **Advisors AFTER-B:** dual-policy `multiple_permissive` WARNs collapsed 30+ → 2 (the by-design pairs: clientes member+staff SELECT, gym_membership self+staff SELECT); all 6 user_id unindexed-FK INFOs gone; security list = pre-cutover by-design baseline (REST-exposed definer helpers incl. reclamar + staff_gym; pre-existing HaveIBeenPwned auth note; folio counter deny-all INFO). Nothing introduced by the cutover.
  Live-recorded versions: claim RPC `20260705070642` · A `20260705081431` · B `20260705082018`.
- [x] 2026-07-05 — post-cutover exit audit: **FINDINGS-NONBLOCKING** (`docs/health/2026-07-05-post-cutover-db-audit.md`); F2 → ledger L-009.
- [x] 2026-07-05 — **human deploy-verify walk: ALL GREEN** (hosts resolve per gym_domain, brand-correct; Forge admin ops in prod; live register→confirm→claim on the default sender — "custom sender" AC WAIVED per #27 owner-deferral).
- [x] 2026-07-05 — #28 CLOSED. Rehearsal project deleted. Follow-up queued: weekly keepalive ping (free-tier pause guard).
