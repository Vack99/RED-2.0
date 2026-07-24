# Seed the live `red` gym for its real owner — design

**Date:** 2026-07-20 · **Status:** design approved (scope locked), awaiting owner's real data + spec review · **Target:** live prod `hjppxawglmukfvsgmcog`

## Objective

Turn the empty prod `red` tenant into a working gym the real RED owner logs into on
`red-admin.ibookit.lat`: a real owner account, the real member roster (with a real
purchase each), the real plans, the real class catalog + weekly schedule + coaches.

## The tenant landscape (verified 2026-07-20)

| gym | id | brand | owner | data | role |
|---|---|---|---|---|---|
| **`red`** | `ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9` | red | **NULL** | **all zeros** | ← seed target |
| `forge` | `d5f81022-0f3d-48ac-96b9-5e32a5214285` | forge | nahumtrevizo2 | 23 members, real | **REAL — never touch** |
| `forge-demo` | `968bafb0-…` | forge | forge-1.0 | demo | sandbox |
| `red-demo` | `daa1c888-…` | red | demo@red-demo.test | demo | dev twin / precedent |

The `red` gym row + its hosts (`red-admin.ibookit.lat` admin, `red.ibookit.lat` +
`red.localhost` client) already exist. **We seed into it; we do not create it.**

## The one rule that dominates everything

Every write is hard-scoped to `gym_id = ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9`. Forge's
real data lives one id away. A wrong `gym_id` is the only move that causes real harm, so
the plan is engineered to make that impossible (preflight assertions + per-stage verify).

## Scope (locked by owner)

**In:** owner account · members (+ one **real** venta each) · plans · classes · schedule · coaches.
**Out (for now):** client-site marketing content (about/values/facilities/stats/faqs/contact) · bank details (`cobro`).
**No fabricated history** — no invented attendance, occupancy, or extra sales. Only true current state.

## Safety model (non-negotiables)

- **`execute_sql`, never `apply_migration`.** Seeds are data, not schema — keeping them out
  of the migration history avoids the known prod migration-drift trap (`prod-migration-version-drift`).
- **Transactional, in stages.** Each stage is one `BEGIN … COMMIT`; a failure rolls the whole stage back.
- **`gym_id` firewall** at the top of every stage: assert the target is `red`/brand `red`, and
  refuse to run if that stage's tables already hold `red` rows (no double-insert on re-run).
  Any DELETE is guarded to refuse any id but the red one.
- **Pre-write backup checkpoint** — confirm current backup posture, dump before the first write
  (this project has historically been on the free tier with no PITR).
- **Verify after every stage** — row counts scoped to red, zero rows with a wrong gym_id,
  balances reconcile, owner resolves, constraints hold.

## Owner account — the proven SQL recipe

Confirmed working via the `red-demo` owner (`demo@red-demo.test`, a SQL-minted login), same
method used for the Forge owner:

1. `auth.users`: `aud='authenticated'`, `role='authenticated'`,
   `encrypted_password = crypt(<pw>, gen_salt('bf'))`, `email_confirmed_at = now()`,
   `raw_app_meta_data = '{"provider":"email","providers":["email"]}'`,
   `raw_user_meta_data = '{"email_verified":true}'`,
   and the token columns (`confirmation_token`, `recovery_token`, `email_change`,
   `email_change_token_new`) set to `''` (empty string, **not** NULL — GoTrue's login errors on NULL).
2. `auth.identities`: `provider='email'`, `provider_id = user_id::text`,
   `identity_data = '{"sub":<user_id>,"email":<email>,"email_verified":true,"phone_verified":false}'`.
3. `gym_membership (user_id, gym_id=red, role='owner')`.
4. `update gym set owner_user_id = <user_id> where id = red`.

Owner is staff only — no `clientes` row needed. Verify: the owner resolves for the admin host
and `/cuenta`'s owner-gated cobro read works.

## Sessions materialize by direct insert (not RPC)

Prod's `create_recurring_schedule` / `ensure_week_materialized` are `SECURITY INVOKER` and derive
the gym from `auth.uid()` — unusable through the MCP (no JWT). So schedule + sessions are seeded by
**direct insert**, following the `red-demo` generator's proven shapes:
`schedule_template` → `schedule_template_coach` → `schedule_template_week` (one row per template×week) →
`class_session` (`starts_at = (day time)::timestamp at time zone 'America/Chihuahua'`, `template_id` set) →
`class_session_coach`. Horizon: **6 weeks forward** from the current gym-local week (matches the RPC default).

## Execution stages (FK order)

1. **Owner** — `auth.users` + `auth.identities` → `gym_membership(owner)` → `gym.owner_user_id`.
2. **Catalog** — `paquetes` (+ `plan_feature`, marketing cols) · `class_type` (+ bring-items/workblocks) · `coach`.
3. **Schedule** — `schedule_template` (+ `_coach`, `_week`) → materialized `class_session` (+ `_coach`), 6 weeks.
4. **Members** — `clientes` snapshot (current balance) + one real `venta` each → set `gym_folio_counter.last_folio`.
5. **Config (minimal)** — `perfil` (business name/coach/phone/city, drives admin header + greeting) + default WhatsApp `plantillas` (`sembrar_plantillas_default` equivalent).

## DB constraint cheat-sheet (verified 2026-07-20)

- `clientes`: `tel` = exactly 10 digits after stripping non-digits · `clases_restantes` NULL = **Ilimitado** (never set by accident).
- `paquetes`: `clases` NULL or 1–30 · `vigencia_tipo='mes'` ⇔ `vigencia_dias` NULL (else `'dias'` + a day count) · unique `(gym_id,nombre)` & `(gym_id,code)` · exactly one `popular=true` per gym (partial unique index).
- `class_type`: unique `(gym_id,name)`.
- `coach`: `name`/`initials`/`role` NOT NULL.
- `schedule_template`: `weekday` 0–5 (0=Mon … 5=Sat) · `duration_min ∈ {30,45,60,75,90}` · `capacity` 4–40.
- `class_session`: same duration/capacity rules · unique `(template_id, starts_at)`.
- `ventas`: `metodo ∈ {efectivo,transferencia,tarjeta}` · unique `(gym_id, folio)` · `monto` integer (MXN) · `vigencia_tipo ∈ {dias,mes}`.
- `gym_membership`: `role ∈ {owner,operator,member}`.

## Data I need from the owner (the capture template)

Fill or paste RED's real data in this shape. `tel` = 10 digits (I strip formatting).

### Owner
- desired email · desired password (client's choice) · display name · phone · city

### Plans (`paquetes`) — one row each
| nombre | clases (or `Ilimitado`) | validity (`N días` or `mensual`) | precio (MXN) | popular? | orden |
|---|---|---|---|---|---|

Optional per plan: `/precios` card copy (code, subtitle, badge, cadence, nota) + feature bullet list.

### Coaches — one row each
| nombre | initials | role | specialty | bio |
|---|---|---|---|---|

### Classes (`class_type`) — one row each
| nombre | sala | nivel | descripción | duración (min) |
|---|---|---|---|---|

Optional per class: "qué traer" items + workout blocks.

### Weekly schedule — one row per recurring class
| día (Lun–Sáb) | hora | clase | duración | capacidad | coach(es) |
|---|---|---|---|---|---|

### Members (`clientes` + one real venta each) — one row each
| nombre | tel (10 díg) | email (opc) | plan | clases restantes (o `Ilimitado`) | vence (fecha) | cumple (opc) | **última compra: fecha** | **monto** | **método** (efectivo/transferencia/tarjeta) |
|---|---|---|---|---|---|---|---|---|---|

The last three columns feed the one real venta per member. If a member's real purchase
numbers aren't available, say so and that member gets a clean snapshot with no venta
(rather than a fabricated one).

## Verification (run after each stage, all scoped to red)

- No row anywhere with `gym_id <> red` introduced by this seed.
- Owner: exactly one `gym_membership(owner)` on red + `gym.owner_user_id` set + login resolves.
- Members: each `clases_restantes` matches source; Ilimitado ⇔ NULL; every `tel` passes the 10-digit CHECK.
- Ventas: folio contiguous & unique; `gym_folio_counter.last_folio` = max seeded folio; `monto`/`metodo`/plan match source.
- Schedule: every `class_session` inside the 6-week horizon; weekday/duration/capacity within CHECKs; coaches linked.

## Deliverable

Staged SQL committed under `supabase/seeds/red/` (mirroring `red-demo`'s layout) + a short runbook,
executed against live stage-by-stage with the owner's go-ahead at each step.
