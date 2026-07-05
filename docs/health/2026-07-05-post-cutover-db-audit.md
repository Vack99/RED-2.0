# Post-cutover DB architecture audit — issue #28 exit gate

**Date:** 2026-07-05 · **Project:** `hjppxawglmukfvsgmcog` (live) · **Access:** strictly read-only
(catalog + advisors; no DDL/DML/branch) · **Methodology:** `improve-database-architecture` skill —
one question per rule: *is it enforced in the database, for every writer, across all time, or merely
trusted from the app?* · **Scope:** confirm the #28 RLS cutover (Migrations `20260705081431_contract_a`
+ `20260705082018_contract_b`, claim RPC `20260705070642`) landed with every ADR-0013 invariant intact.

## Verdict: **FINDINGS-NONBLOCKING**

The cutover is complete and correct. All four ADR-0013 "must never be undone" invariants are live and
verified in the catalog. The legacy per-`auth.uid()` boundary is fully retired (21 policies dropped,
7 `user_id` columns dropped) and the membership-keyed boundary carries every tenant table. No finding
below rises to blocking; every one is either pre-recorded accepted debt, a pre-flagged deferral, or a
perf-floor INFO that is inert at current (single-gym) scale. **Nothing #28 introduced is a leak.**

---

## Invariant verification — ADR-0013 §"What a future reader must not undo" (all PASS)

Verified against `pg_proc`, `pg_policies`, `pg_class`, `pg_event_trigger`, `pg_constraint`, `pg_index`.

| # | Invariant | Result | Evidence |
|---|---|---|---|
| I1 | Helpers still `SECURITY DEFINER` | ✅ PASS | `is_member_of` / `is_staff_of` / `has_role` / `staff_gym` all `prosecdef=true`, `STABLE`, `search_path=''`, bodies read `public.gym_membership` keyed on `(select auth.uid())` + role. `next_folio` / `reclamar_o_crear_cliente` also DEFINER. Recursion into `gym_membership` RLS is correctly broken. |
| I2 | Predicates still initplan-wrapped `(select helper(gym_id))` | ✅ PASS | All 22 policies render as `( SELECT is_staff_of(...))` / `is_member_of(...)` / `has_role(...,'owner')` — never a bare per-row call. Member self-read is `(auth_user_id = ( SELECT auth.uid()))`. O(1)-per-statement preserved. |
| I3 | Anon reads limited to `gym` + `gym_domain` only | ✅ PASS | Only `gym_anon_select` and `gym_domain_anon_select` carry `{anon,...}`; both `USING (true)`, SELECT-only. Every other policy is `TO authenticated`. No policy reads a host/`x-brand` header. |
| I4 | `rls_auto_enable` event trigger still present | ✅ PASS | `ensure_rls` on `ddl_command_end`, `evtenabled='O'` (enabled), function `rls_auto_enable` (DEFINER, `search_path=pg_catalog`, EXECUTE granted only to `postgres`/`service_role` — not `anon`/`authenticated`). |

### Cutover completeness (AC of #28) — all confirmed live
- **21 legacy policies dropped.** No `*_own` / space-named `cobro owner *` / `plantillas owner *` policy remains; 22 gym-scoped policies present, matching Migration A's survivor list (`clientes_member_select`, `gym_membership_self_select` retained by design).
- **7 `user_id` columns dropped.** No `user_id` column on clientes/ventas/asistencias/perfil/plantillas/cobro/paquetes. `gym_membership.user_id` (a different column, the membership map) correctly remains `NOT NULL`.
- **`gym_id NOT NULL` + indexed on every tenant table** (clientes, ventas, asistencias, paquetes, perfil, plantillas, cobro, gym_domain, gym_membership; `gym_folio_counter` PK). `clientes.auth_user_id` correctly **nullable** (ADR-0009 permanent-nullable rule).
- **No `anon` EXECUTE on any function** (Migration A M1 revokes confirmed): every routine grants EXECUTE to `authenticated`/`postgres`/`service_role` only; `rls_auto_enable` to `postgres`/`service_role` only.
- **Every write policy carries `WITH CHECK`** (no write-side IDOR): all `*_staff_insert`/`*_staff_update`/`cobro_owner_*` have the gym-scoped check; INSERTs gate on `is_staff_of(gym_id)`, so a staff of gym A cannot stamp a row into gym B.
- **`gym_membership` writes are default-deny** (SELECT-only policies: self + staff); the only writer is the DEFINER `reclamar_o_crear_cliente`, which can mint only `role='member'` (never owner/operator).
- **DB-enforced integrity invariants** (illegal states unrepresentable, not app-trusted): `clientes_auth_user_id_per_gym` UNIQUE partial `(gym_id, auth_user_id) WHERE auth_user_id IS NOT NULL` = one-claim-per-gym; `ventas_folio_gym_uq (gym_id, folio)` = per-gym folio; `paquetes_one_popular (gym_id) WHERE popular` = single favorite; `clientes_tel_10_digits_ck`; `gym_membership_role_check`; `cobro`/`perfil` per-gym UNIQUE. All constraints `validated=true` (no `NOT VALID` debt).

---

## Findings

### F1 — Open-enrollment DEFINER write vector (`reclamar_o_crear_cliente`) — ACCEPTED DEBT
- **Rule / boundary:** enrollment authorization is trusted from the RPC argument `p_gym_id`, not enforced against the caller's resolved tenant. Any `authenticated` verified-email session can mint a `clientes` + `gym_membership(role='member')` row into **any** anon-readable `gym_id`.
- **Severity:** Medium · **Blocks #28:** No.
- **Status:** Pre-recorded accepted debt — **ADR-0009 Amendment 2026-07-05 (I1)**. Bounded to CRM pollution of the attacker's *own* rows: no PII/`cobro` read-back, no cross-member read, no other write surface (RLS write gate is `is_staff_of`, never satisfied). Un-defer trigger already set (second gym live **or** first abuse report); real mitigation named (server-injected gym proof, not a naive `p_gym_id` guard). **Do not re-litigate.** Recorded here only as still-matching-ledger.

### F2 — `plantillas_member_select` exposes operator WhatsApp templates to members
- **Rule / boundary:** `plantillas` is operator-authoring content, but its read policy uses the curated-class default `is_member_of(gym_id)`, so every gym **member** can read the operator's internal message templates. The rule "templates are staff-internal" is enforced at the wrong layer (member-read is granted where staff-read is intended).
- **Severity:** Low · **Blocks #28:** No. **Latent** — inert until members self-register (no `role='member'` rows exist yet).
- **Recommended action:** narrow the read to `is_staff_of(gym_id)` when member-facing scope is next touched. Already flagged in ADR-0009 Amendment 2026-07-05 ("Flag: separate surface"). **Gap:** it lives only as an ADR flag, not in `docs/health/accepted-debt.md` — recommend adding a ledger row so future audits stop re-surfacing it (or fix it; the one-line policy swap is cheap).

### F3 — Advisor (security): `authenticated`-executable `SECURITY DEFINER` functions — BY DESIGN
- **Detail:** 6 WARNs (`has_role`, `is_member_of`, `is_staff_of`, `next_folio`, `reclamar_o_crear_cliente`, `staff_gym`) REST-callable via `/rest/v1/rpc/*`.
- **Severity:** Low/informational · **Blocks #28:** No. Matches ADR-0013 §1 ("EXECUTE revoked from public/anon, granted to authenticated") and the evidence-log by-design baseline. The four pure helpers return only facts about the **caller's own** membership (leak nothing about other users/gyms); `next_folio` is now `is_staff_of`-guarded (Migration B); `reclamar` is F1.
- **Optional hardening (defense-in-depth, not required):** the app never calls the four pure helpers directly (they run only inside policies / other DEFINER bodies), so `REVOKE EXECUTE ... FROM authenticated` on `is_member_of`/`is_staff_of`/`has_role`/`staff_gym` would clear 4 of 6 WARNs with zero app impact. Left as a suggestion.

### F4 — Advisor (performance): unindexed foreign keys — perf floor, inert at scale
- **Detail:** `clientes_auth_user_id_fkey`, `ventas_cliente_id_fkey`, `gym_owner_user_id_fkey` lack covering indexes.
- **Severity:** Low (INFO) · **Blocks #28:** No.
- **Recommended action:** none now — negligible at single-gym volume (35 clientes / 32 ventas). Two are worth watching as data grows: `ventas.cliente_id` (the ficha "ventas by client" read) and `clientes.auth_user_id` (the `clientes_member_select` predicate, once members exist — the `clientes_auth_user_id_per_gym` partial index leads with `gym_id` so it does not cover a bare `auth_user_id` lookup). Consistent with the existing read-amplification accepted-debt ledger (L-005 etc.).

### F5 — `staff_gym()` / per-gym cap resolve "the caller's gym" by `LIMIT 1` — latent multi-gym-operator debt
- **Detail:** `staff_gym()` returns `... limit 1` across the caller's staff memberships; `registrar_venta` (fresh-create path), `crear_plantilla`, and `sembrar_plantillas_default` derive gym from it, and `crear_plantilla`'s 4-template cap is now per-gym.
- **Severity:** Low/informational · **Blocks #28:** No. **Inert today** (one operator = one gym). If a single `auth.users` ever becomes staff of two gyms, these pick an arbitrary gym. Already anticipated in ADR-0009 Amendment ("per-gym cap … diverges when a gym has a second operator"). Recorded so the assumption is visible; no action while the one-operator-per-gym invariant holds.

### F6 — Advisor INFO noise (expected, no action)
- `gym_folio_counter` `rls_enabled_no_policy`: **by design** — deny-all counter reached only via the `is_staff_of`-guarded `next_folio` DEFINER; direct PostgREST access is correctly impossible.
- `unused_index` ×5 (the `*_gym_id_idx`): expected — tiny single-gym tables, planner prefers seq scan; the indexes are **required at all-Mexico scale** (ADR-0013 §2). Keep.
- `multiple_permissive_policies` ×2 (`clientes` member+staff SELECT, `gym_membership` self+staff SELECT): the by-design read pairs; the cutover **collapsed** these from 30+ to 2 (evidence log). Acceptable.
- `auth_leaked_password_protection` disabled: pre-existing auth-project setting, unrelated to #28; enable at leisure.

---

## Accepted-debt reconciliation
- **ADR-0009 I1 (open enrollment)** — present, matches ledger, not re-litigated (F1).
- **ADR-0009 I1 "unpaged clientes readers" / read-amplification ledger (L-001…L-008)** — out of scope of a schema/RLS audit; untouched by the cutover; F4 notes are consistent with it.
- **New surface not yet in `accepted-debt.md`:** F2 (`plantillas` member-read) — recommend a ledger entry or a one-line fix.

## No BLOCKING findings — rationale
No illegal row can physically exist that the pre-cutover schema forbade; no tenant can read/write across the gym boundary (every predicate resolves `gym_membership` under the caller's own JWT, no header trust); every schema delta reached prod as a committed, replayable migration. The single genuine access-widening vector (F1) is pre-accepted, bounded to self-row CRM pollution, and gated by a named un-defer trigger. **Issue #28 is clear to close.**
