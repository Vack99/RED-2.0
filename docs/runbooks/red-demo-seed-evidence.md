# red-demo gym twin — seed evidence (slice #45)

Companion evidence log to `docs/runbooks/hitl-28-evidence.md`'s pattern. Records the seed of the
`red-demo` gym twin — the per-brand demo sandbox mirroring the live `forge-demo` precedent — on the
live Supabase project (`hjppxawglmukfvsgmcog`), so Phase-5 verification and future RED work never
touch live `forge` rows.

## Pre-write dump

Manual backup taken BEFORE any live write: `C:\Users\Aaron\Documents\RED-2.0-backups\2026-07-05-slice-45-red-demo-twin\`
— 21 public tables + `auth_users.json` (id/email/created_at only — no secrets) + `_manifest.json`.
Baseline counts (pre-seed): `gym` 3, `gym_domain` 6, `gym_membership` 2, `gym_folio_counter` 3,
`paquetes` 6, `clientes` 36, `ventas` 32, `asistencias` 199, `perfil` 2, `plantillas` 8, `cobro` 2,
`auth.users` 2; every Phase-5 catalog/scheduling/plan-feature table present but empty (0 rows) —
confirming #37/#42/#38's migrations were already live and this slice ships zero new DDL.

## No-seam raw inserts (gym, auth user, membership)

Per the issue's explicit carve-out (`gym`, `gym_membership`, `auth.users` have no write seam):

- `auth.users` + `auth.identities`: `demo@red-demo.test`, bcrypt password via `pgcrypto`
  (`extensions.crypt(..., extensions.gen_salt('bf'))`), `email_confirmed_at` set directly (no
  interactive signup flow needed for an agent-created sandbox account) — id `10517230-0452-4612-a949-76b9abd99d4a`.
- `gym`: `slug='red-demo'`, `brand_name='RED Demo'`, `brand_module_id='red'`,
  `timezone='America/Chihuahua'` (mirrors the live `red` gym's brand + tz, exactly as `forge-demo`
  mirrors `forge`), `owner_user_id` = the demo user — id `daa1c888-192b-4cf6-9fc0-023e314a803f`.
- `gym_membership`: role `owner` (satisfies `is_staff_of`/`staff_gym()` — verified against the live
  helper definitions before writing).
- `gym_domain`: one admin-only host row `red-demo.localhost` → `app='admin'`, mirroring
  `forge-demo`'s single admin-host row (demo gyms are operator-testing sandboxes; no client-app host
  needed until a client-side demo flow exists).

## Catalog / plan / schedule — seeded via the shipped write paths

Every write below ran impersonating the demo operator via the header-sanctioned
`select set_config('request.jwt.claims', json_build_object('sub', <uid>, 'role','authenticated')::text, true); set local role authenticated;`
mechanism (the same one `supabase/tests/rls_cross_tenant_denial.sql` uses to assert as a specific
user) — committed for real, not rolled back.

- **`class_type`** (raw insert; no create-RPC exists — RLS `class_type_staff_insert` is the seam):
  the four locked base types (`docs/planning/2026-06-29-target-data-model-and-decisions.md` §4) —
  Fuerza (Sala Yunque, 60 min), Funcional (Sala Forja, 45 min), Metcon (Sala Brasa, 45 min),
  Open (Sala Brasa, 60 min).
- **`coach`** (raw insert; `coach_staff_insert` is the seam): 3 active coaches — Marisa Peña,
  Paty Ruiz, Iván Duarte.
- **`paquetes`** (raw insert; no create-RPC exists — mirrors forge's live 3-plan shape): 8 clases
  ($799), 12 clases ($1199, popular), Ilimitado ($1350).
- **Plan marketing + features** — through the SHIPPED #38 RPCs (`actualizar_paquete_marketing`,
  `set_plan_features`): codes `ocho`/`doce`/`abierta`, display names/subtitles/badge/cadence, and
  2–3 feature bullets each. Verified read-back: all 3 plans carry their marketing fields + ordered
  feature lists (8 `plan_feature` rows total).
- **Scheduling** — through the SHIPPED #42 RPCs:
  - `create_recurring_schedule` — one Metcon template, Mar/Jue 07:00, 45 min, cupo 20, coaches
    Marisa + Paty, 2-week horizon → 2 `schedule_template` rows + 4 materialized `class_session` rows.
  - `create_class_session` — one evento especial ("Reto RED", Open, coach Iván), then rescheduled
    via `edit_class_session` to an upcoming date (today + 3 days, 18:00 local) after the first
    attempt landed on an already-past day within the current ISO week.
  - Final week: 2 past + 2 future recurring Metcon sessions + 1 upcoming ★ evento especial —
    a realistic week, verified by reading back `class_session` joined to `class_type`/`coach`.

**Gym content** (`about_value`/`facility`/`stat`/`faq`): checked at seed time —
**none of the four tables exist yet on live** (slice #39 concurrent, not yet applied). Per the
issue's explicit instruction, this is deferred rather than blocking: **gym content seed deferred —
#39 tables not yet live at seed time.**

## Cross-tenant isolation check

`supabase/tests/rls_cross_tenant_denial.sql` (the checked-in suite) could not be run ad hoc against
live as-is: its fixture inserts a synthetic `paquetes` row named `'8 clases'` for gym A (`forge`),
which collides with `forge`'s REAL live paquete of that name (`paquetes_nombre_gym_uq`) — a
pre-existing condition unrelated to `red-demo` (the file's own header notes it is meant to run via
a scratch/preview branch, `node supabase/tests/run-denial-suite.mjs`, not raw against a live project
carrying real named catalog rows). Not this slice's scope to fix.

Instead, ran a direct, non-mutating (`begin;...rollback;`) isolation check using the REAL
`red-demo` operator and the REAL `forge` owner, both directions:

- **red-demo operator vs forge**: 0 rows read from forge's `coach`/`class_type`/`paquetes`/
  `class_session`/`clientes`; an attempted `update paquetes set precio=1 where gym_id=forge` affects
  0 rows. Positive control: the same operator reads exactly its own 3 coach / 4 class_type / 3
  paquetes / 5 class_session rows.
- **forge owner vs red-demo**: 0 rows read from red-demo's `coach`/`paquetes`/`class_session`; an
  attempted `update coach set is_active=false where gym_id=red-demo` affects 0 rows.

Result: `red-demo cross-tenant isolation check: OK` — both directions denied, positive control
non-vacuous.

## Advisors

`get_advisors(security)` after the seed matches the pre-existing by-design baseline exactly (the
REST-exposed definer helpers `has_role`/`is_member_of`/`is_staff_of`/`staff_gym`/`next_folio`/
`reclamar_o_crear_cliente`, the `gym_folio_counter` deny-all INFO, the pre-existing HaveIBeenPwned
WARN) — nothing new introduced by this seed.

## Final row counts (red-demo)

| table | rows |
|---|---|
| gym | 1 |
| gym_membership | 1 |
| gym_domain | 1 |
| coach | 3 |
| class_type | 4 |
| paquetes | 3 |
| plan_feature | 8 |
| schedule_template | 2 |
| class_session | 5 |

## Acceptance criteria

- [x] `red-demo` gym + demo membership exist (`daa1c888-192b-4cf6-9fc0-023e314a803f`, owner
  `10517230-0452-4612-a949-76b9abd99d4a`); RLS scopes the demo operator to red-demo-only data
  (verified above).
- [x] Seeded agenda renders a realistic week: 2 past + 2 future recurring Metcon sessions + 1
  upcoming ★ evento especial.
- [x] Cross-tenant denial holds with red-demo present (direct check, both directions, OK).
- [x] Evidence doc committed; pre-write dump recorded above.
