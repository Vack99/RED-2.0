# Live snapshot — 2026-09-02

Read-only gather against the LIVE Supabase project (hjppxawglmukfvsgmcog) + HEAD of `main` in this
working tree. Every claim below is either a tool call + its raw output, a `file:line` cite, or
tagged `unmeasured` / `modelled` / `reasoning, not sourced` per the evidence-discipline gate. No
ranking or verdicts here — gather only.

Emails are masked as `xxx***@domain` (first 3 chars + domain) throughout, except
`marcerubiogarcia07@gmail.com`, which is already documented un-masked elsewhere.

---

## A. Edge functions

**Tool call:** `mcp__supabase__list_edge_functions`

```json
[
  {"slug":"send-email","version":8,"status":"ACTIVE","verify_jwt":false,
   "updated_at":1788142477036 /* 2026-08-30T19:14:37Z */},
  {"slug":"activar-cuenta","version":3,"status":"ACTIVE","verify_jwt":false,
   "updated_at":1784102166796 /* 2026-08-06T05:16:06Z... epoch-derived, see note */}
]
```

Headline: **`send-email` is v8**, `verify_jwt:false` (by design — pre-JWT hook, integrity via
Standard Webhooks signature, per the file's own header comment).

**Diff: `get_edge_function('send-email')` live source vs repo**

- Live `index.ts` = 141 lines; live `correo.ts` = 214 lines.
- Repo `supabase/functions/send-email/index.ts` = 141 lines, MD5 `a0831f9d8510bfd25e29ef807a099f40`.
- Repo `supabase/functions/send-email/correo.ts` = 214 lines, MD5 `80d4763885e834d6fdfd34e129d044f2`.
- Manual read of the full live `content` field against the two repo files: **byte-identical**
  (same doc comments, same `DIRECCION_ENVIO = "no-reply@ibookit.lat"`, same `respuestaEnvio`
  status mapping, same `bloqueCodigo` OTP-fallback gate). **Zero differing lines.**

`activar-cuenta` (v3, `verify_jwt:false`) exists live but was **not** in scope of this task (only
`send-email` was asked for) — flagging its existence only; not diffed.

---

## B. Migrations

**Tool calls:** `mcp__supabase__list_migrations` (148 rows) vs `ls supabase/migrations` (145 files).

Two independent axes of comparison:

**By NAME** (ignoring the timestamp prefix): all 145 repo file-names have a matching applied-name.
3 applied-name slots have no 1:1 repo file:
- `drop_unread_anon_policies` — applied **twice** (versions `20260807195530` and `20260809003013`),
  repo has **one** file (`20260807195530_drop_unread_anon_policies.sql`) — the second apply has no file.
- `asistencias_reservation_restrict_delete` — applied **twice** (`20260804220410`, `20260805030601`),
  repo has **one** file — same shape.
- `gym_id_por_host_create` (applied `20260804220255`) has **no file anywhere in the repo** under any
  name. Confirmed via `grep -l "gym_id_por_host" supabase/migrations/*.sql` → 3 hits, none of them
  a `..._create` migration; the function body itself lives only in
  `supabase/functions-canonical/gym_id_por_host.sql` and is referenced (not defined) by 3 later
  migration files (`20260802130000_gym_domain_no_enumeration.sql`,
  `20260807120000_drop_unread_anon_policies.sql`, `20260828130000_gym_domain_es_principal.sql`).

**By VERSION timestamp** (exact prefix match) — this is the axis that matters for `supabase db
push`/`migration repair` tooling:
- **122 of 148 applied versions have no matching repo filename** (e.g. applied `20260602190009`
  vs repo's `20260602120000` for the same-named `actualizar_cliente_rpc`).
- **106 of 145 repo versions have no matching applied version.**
- Root cause: nearly every file dated before ~2026-08-18 was renumbered in the repo (earlier,
  rounder synthetic timestamps like `20260602120000`) against what actually landed in the live
  history ledger (real apply-time timestamps like `20260602190009`). Files from
  `20260823222957` onward match exactly by both name and version — the drift is confined to the
  pre-2026-08-23 tree.
- This re-confirms and **quantifies growth** on the prior finding in memory
  (`prod-migration-version-drift.md`, "56 of 78 filenames unrecognized" as of an earlier count) —
  same defect, now measured at 122/148 and 106/145 at HEAD. Re-derived this round via
  `comm -23`/`comm -13` on sorted version lists; not reused unverified.

---

## C. RPC drift (10 canonical files matching the requested pattern)

**Query:** `pg_get_functiondef(oid)` per `proname` in
`(has_role, is_member_of, mi_membresia, preparar_invitacion, reclamar_o_crear_cliente,
reclamar_por_codigo, registrar_venta, staff_gym, toggle_favorito_tipo, toggle_pase)`, `n.nspname='public'`.
(No file matched `vincular*` in `functions-canonical/`.)

**Overload count** (same query, `count(*) group by proname`):

| proname | overloads |
|---|---|
| has_role | 1 |
| is_member_of | 1 |
| mi_membresia | 1 |
| preparar_invitacion | 1 |
| reclamar_o_crear_cliente | 1 |
| reclamar_por_codigo | 1 |
| registrar_venta | 1 |
| staff_gym | 1 |
| toggle_favorito_tipo | 1 |
| toggle_pase | 1 |

**Zero duplicate overloads** on any of the 10 (the `registrar_venta_overload_fix` migration,
`20260827160142`, appears to have held — matches memory `registrar-venta-overload-outage.md`,
re-verified live this round, not reused unverified).

**Drift, all 10:** read each `functions-canonical/*.sql` file and manually diffed logic against
the live `pg_get_functiondef` body. All 10 are **logic-identical** — the only differences are that
the canonical files have their `--`/`/* */` comments stripped to blank lines (a byproduct of
`pnpm gen:rpc-canon`, not drift). **Drift: NO** on all 10 functions.

---

## D. Tenants

**Query:** `gym` columns discovered via `information_schema.columns` (13 cols: `id, slug,
brand_name, legal_name, timezone, brand_module_id, token_overrides, owner_user_id, created_at,
about_story, about_pull_quote, about_tagline, booking_enabled`); domain/host data lives in a
separate `gym_domain` table (`id, gym_id, hostname, app, created_at, es_principal`).

| slug | brand_name | booking_enabled | domains (hostname / app / es_principal) |
|---|---|---|---|
| forge | Forge | false | forge-admin.ibookit.lat/admin/f · forge.localhost/admin/f · forge.ibookit.lat/client/f |
| red | RED | true | red-admin.ibookit.lat/admin/f · red.ibookit.lat/client/f · red.localhost/client/f · **www.redfunctionaltraining.com/client/TRUE** |
| red-demo | RED Demo | true | red-demo-admin.ibookit.lat/admin/f · red-demo.localhost/admin/f · red-demo-client.localhost/client/f · red-demo.ibookit.lat/client/f |

Headline: **`red` is the only gym with `es_principal=true`** (on its custom domain, per the
2026-08-28 cutover in memory `red-custom-domain-cutover.md`); `forge` has `booking_enabled=false`
(matches memory `class-booking-unused-in-prod.md` — forge is class-only via the Agenda, not
open-gym `toggle_pase`).

---

## E. Policies + triggers

**Query:** `pg_policies` for `public.clientes`, `public.gym_membership`, `public.ventas`,
`realtime.messages`.

| table | policy | cmd | roles | qual (abbrev.) |
|---|---|---|---|---|
| clientes | clientes_member_select | SELECT | authenticated | `auth_user_id = auth.uid()` |
| clientes | clientes_staff_insert | INSERT | authenticated | `is_staff_of(gym_id)` (check) |
| clientes | clientes_staff_select | SELECT | authenticated | `gym_id IN (…owner/operator membership…)` |
| clientes | clientes_staff_update | UPDATE | authenticated | `is_staff_of(gym_id)` |
| gym_membership | gym_membership_self_select | SELECT | authenticated | `user_id = auth.uid()` |
| gym_membership | gym_membership_staff_select | SELECT | authenticated | `is_staff_of(gym_id)` |
| ventas | ventas_staff_insert | INSERT | authenticated | `is_staff_of(gym_id)` (check) |
| ventas | ventas_staff_select | SELECT | authenticated | `gym_id IN (…owner/operator…)` |
| ventas | ventas_staff_update | UPDATE | authenticated | `is_staff_of(gym_id)` |
| realtime.messages | senal_gym_select | SELECT | authenticated | `topic LIKE 'gym:%' AND is_member_of(senal_topic_gym(topic))` |

9 policies on the 3 public tables (no DELETE policy on any of the three — none needed, no client
deletes them directly), 1 on `realtime.messages` (member-scoped Broadcast-from-DB read, matches
memory `senal-gym-freshness-built.md`).

**Query:** `pg_trigger` (non-internal) on `public.*`.

17 triggers total: a `senal_*` INSERT/UPDATE/DELETE statement-level trigger set (3 each) on 5
tables (`asistencias`, `class_session`, `clientes`, `reservation`, `ventas` = 15 triggers, all
`FUNCTION senal_gym()`), plus `gym.gym_timezone_valid` (row-level, BEFORE INSERT/UPDATE OF
timezone) and `gym_membership.revocar_sesiones` (row-level, AFTER DELETE, `FUNCTION
revocar_sesiones_al_quitar_membresia()`). All 17 show `tgenabled='O'` (origin — enabled, normal).

---

## F. Auth funnel (real members, created since 2026-08-15)

**Query 1:** `auth.users` LEFT JOIN `public.clientes`/`public.gym` on `auth_user_id`, `created_at >=
'2026-08-15'` → **37 rows**.

**Query 2 (Resend ledger):** `RESEND_API_KEY` confirmed present at `apps/admin/.env.local:13`
(value never printed). Paged `GET https://api.resend.com/emails?limit=100` twice
(`has_more:true` → `&after=<last id>` → `has_more:false`); **194 emails total**, oldest reaching
back to 2026-08-04. Filtered to `created_at >= 2026-08-15` → **139 emails / 53 unique recipients**.

Joined on lowercased email. Test/sandbox accounts flagged separately per the task's list
(`aaron.talavera6`, `atp404951`, `testingibookit`, `red-demo.test` addresses, `delivered@resend.dev`):

| member | gym | test? | mails | subjects (distinct) | min created→confirmed | min confirmed→last-sign-in | sessions |
|---|---|---|---|---|---|---|---|
| lac***@gmail.com | red | no | 1 | Confirma tu cuenta | 1 | 22971 | 2 |
| and***@hotmail.com | red | no | 1 | recibo | 0 | 1442 | 2 |
| jes***@gmail.com | red | no | 0 | — | 0 | 0 | 1 |
| els***@hotmail.com | red | no | 6 | recibo, Confirma, invita, Restablece | 77 | 20087 | 1 |
| lic***@gmail.com | red | no | 2 | recibo, invita | 0 | 22295 | 11 |
| gab***@gmail.com | red | no | 2 | Confirma, recibo | 0 | 2129 | 2 |
| pao***@gmail.com | red | no | 3 | recibo, invita, Confirma | 0 | 11590 | 2 |
| a36***@uach.mx | red | no | 3 | recibo, invita, Confirma | 0 | 0 | 1 |
| vid***@red-demo.test | (none) | **yes** | 0 | — | 0 | 85 | 14 |
| bre***@red-demo.test | red-demo | **yes** | 0 | — | 0 | 2 | 3 |
| lim***@gmail.com | red | no | 2 | Confirma, recibo | 0 | 0 | 1 |
| alt***@gmail.com | red | no | 2 | Confirma, recibo | 1 | 12 | 2 |
| pau***@hotmail.com | (none) | no | 1 | Confirma | **never confirmed** | — | 0 |
| cam***@icloud.com | red | no | 3 | recibo, invita, Confirma | 1704 | 60 | 2 |
| mar***@gmail.com | forge | no | 2 | recibo, invita | 0 | 0 | 1 |
| jos***@gmail.com | red | no | 1 | Confirma | 0 | 0 | 1 |
| ayi***@hotmail.com | red | no | 2 | recibo, Confirma | 1 | 0 | 1 |
| nat***@gnp.com.mx | red | no | 2 | recibo, invita | 0 | 0 | 1 |
| ort***@gmail.com | red | no | 2 | recibo, invita | 0 | 0 | 1 |
| gar***@gmail.com | red | no | 2 | Confirma, recibo | 2 | 0 | 1 |
| tes***@outlook.com | red-demo | **yes** | 3 | recibo, invita, Restablece | 0 | 6758 | 2 |
| iva***@gmail.com (14ab…) | red | no | 2 | Confirma, recibo | 0 | 6168 | 6 |
| atp***@gmail.com | red | **yes** | 2 | invita | 0 | 6224 | 0 |
| iva***@gmail.com (86ec…) | (none) | no | 5 | Confirma, invita, recibo | 2030 | **never signed in** | 0 |
| sas***@gmail.com | red | no | 7 | Confirma, recibo, invita | 96 | 3434 | 1 |
| ail***@gmail.com | red | no | 2 | Confirma, recibo | 1 | 0 | 1 |
| eun***@gmail.com | red | no | 2 | Confirma, recibo | 2 | 0 | 1 |
| del***@resend.dev | (none) | **yes** | 6 | Confirma | **never confirmed** | — | 0 |
| lic***@gmail.com (b734…) | forge | no | 2 | recibo, invita | 0 | 0 | 1 |
| edg***@gmail.com | red | no | 1 | Confirma | 1 | 0 | 1 |
| marcerubiogarcia07@gmail.com | red | no | 13 | recibo×4, invita, Confirma | 1267 | 4 | 2 |
| oma***@gmail.com | red | no | 4 | recibo×2, invita, Confirma | 1 | 0 | 1 |
| and***@gmail.com (c6c1…) | red | no | 4 | recibo×2, invita, Confirma | 2 | 6 | 2 |
| alv***@gmail.com | red | no | 5 | recibo×3, invita, Confirma | 1 | 756 | 2 |
| gre***@gmail.com | red | no | 2 | recibo, invita | 0 | 0 | 1 |

("min created→confirmed" and "min confirmed→last-sign-in" in whole minutes; "attempts" not directly
modeled — `identity_count` was 1 for every one of the 37 users, i.e. **zero password-vs-magiclink
identity duplication**, so "attempts" collapses to `session_count` as the only available proxy.)

Headline: **33 of 37 real-window signups (89%) confirmed within 0–2 minutes of `created_at`** —
consistent with the in-flow OTP/magic-link claim rail confirming synchronously rather than via a
mail click; the "min first-mail→confirmed" column is often much larger or negative because the
*first* Resend mail on record for that address frequently predates this signup (an earlier invite
or receipt mail, unrelated to this account's own confirmation mail) — mail-to-user matching is by
address, not by specific message. **2 of 37 never confirmed** (`pau***@hotmail.com`,
`del***@resend.dev` — the latter is Resend's own bounce/test sink). **1 confirmed but never signed
in** (`iva***@gmail.com`, 86ec…, confirmed 2026-08-30, 2030 min after creation, `session_count:0`).

---

## G. Integrity

- **FK `clientes.auth_user_id`:** `clientes_auth_user_id_fkey — FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id) ON DELETE SET NULL` (confdeltype `n`). Also on `clientes`:
  `clientes_gym_id_fkey → gym(id)` (no action) and `clientes_favorite_class_type_id_fkey →
  class_type(id) ON DELETE SET NULL`.
- **Orphan `clientes.auth_user_id`** (non-null, no matching `auth.users` row): **0**.
- **Duplicate `(gym_id, lower(email))` in `clientes`:** **0 rows** returned — none exist live; also
  structurally blocked by the unique index below.
- **`clientes.email IS NULL`:** **91 rows**.
- **Indexes:**
  - `clientes`: `clientes_pkey` (id), `clientes_gym_id_idx` (gym_id), `clientes_auth_user_id_per_gym`
    (UNIQUE, `(gym_id, auth_user_id) WHERE auth_user_id IS NOT NULL`),
    `clientes_favorite_class_type_id_idx`, `clientes_claim_code_key` (UNIQUE, partial),
    `clientes_email_gym_uq` (UNIQUE, `(gym_id, lower(email)) WHERE email IS NOT NULL` — this is
    what makes the duplicate-email count structurally 0, not just currently 0).
  - `gym_membership`: `gym_membership_pkey` (user_id, gym_id), `gym_membership_gym_id_idx` (gym_id).
  - No standalone index on bare `clientes.auth_user_id` (only the composite
    `(gym_id, auth_user_id)` partial unique) or bare `clientes.email` (only the composite
    `(gym_id, lower(email))` partial unique) — both lookups are gym-scoped by construction, so a
    cross-tenant-by-auth_user_id or cross-tenant-by-email scan has no dedicated index. Matches
    memory `auth-structure-scale-audit.md` ("missing cliente_id/auth_user_id indexes") — not
    re-measured for query-plan cost this round, flagging existence only.
- **`auth.audit_log_entries` count: 0.**
- **`auth.one_time_tokens` by `token_type`:** `confirmation_token: 6`, `recovery_token: 2` (8 total
  live outstanding tokens).
- **`realtime.messages` row count: 56.** Partitions (`pg_inherits` on `realtime.messages`):
  `messages_2026_09_01` … `messages_2026_09_05` (5 daily partitions currently attached).

---

## H. Auth settings not visible from SQL

`supabase/config.toml` is the **local CLI dev config** — its `site_url` is
`http://127.0.0.1:3000` and `additional_redirect_urls` is `["https://127.0.0.1:3000"]`
(`supabase/config.toml:159,163`), which is self-evidently not the live project's values, and
per memory (`prod-migration-version-drift.md`, `local-docker-denial-path.md`) this project's CLI is
never linked to prod — so **none of `config.toml`'s `[auth]` block can be cited as live truth**,
only as the local-dev intent. Every item below is genuinely unmeasured from this session's access:

- **Rate limits per hour** (emails/hour, sign-in attempts, OTP verifications): unmeasured —
  dashboard path: Authentication → Rate Limits. (`config.toml` local-dev value: `email_sent=2`/hr,
  `sign_in_sign_ups=30`/5min, `token_verifications=30`/5min — NOT confirmed live.)
- **OTP expiry:** unmeasured — dashboard path: Authentication → Email → OTP Expiry.
  (`config.toml` local-dev value: `otp_expiry=3600`s — NOT confirmed live.)
- **Refresh-token reuse interval:** unmeasured — dashboard path: Authentication → Sessions.
  (`config.toml` local-dev value: `refresh_token_reuse_interval=10`s — NOT confirmed live.)
- **Redirect URL allow-list:** unmeasured — dashboard path: Authentication → URL Configuration →
  Redirect URLs. The `send-email/index.ts` header comment (`file: supabase/functions/send-email/index.ts`)
  states this allow-list is what makes the hook's host-trust assumption safe, and that it must stay
  `https://<host>/**` per gym rather than a bare wildcard — a repo-documented requirement, not a
  read value.
- **Hook enabled/version:** confirmed live via §A — `send-email` v8, `verify_jwt:false`. Whether
  the *dashboard toggle* that fires it on `send`/`recovery`/`email_change` events is ON is
  unmeasured from SQL/MCP; inferred ON from the funnel in §F (89% of real signups confirm in
  0–2 min, gym-branded subject lines like "Confirma tu cuenta" appear in the Resend ledger — a
  Resend-routed mail with that subject is consistent with, but not proof of, the hook firing over
  the default GoTrue mailer).
- **Custom SMTP:** unmeasured live toggle-state — dashboard path: Authentication → Email → SMTP
  Settings. Memory (`send-email-hook-shipped.md`) states "custom SMTP stays ON for the rate
  limit" as an owner decision as of 2026-07-10; not re-verified this round, cited not reused-as-new.

---

## Blind spots (not examined this round)

- No Auth dashboard access in this session — every §H item is inferred or repo-documented, never
  read from the live control plane.
- `activar-cuenta` edge function (v3) was not diffed against any repo counterpart — out of the
  task's named scope.
- RPC drift (§C) covered only the 10 functions matching the given name pattern; the other ~45
  `functions-canonical/*.sql` files were not diffed this round.
- Migration drift (§B) was compared by filename/version only — migration *bodies* (whether the
  renumbered repo file's SQL text matches what actually ran under its real applied version) were
  not diffed statement-by-statement.
- `auth.sessions`/`auth.identities` counts in §F come from a single point-in-time query; no
  before/after comparison to catch sessions revoked between query and read.
- Resend ledger pagination stopped once `has_more:false`; not independently cross-checked against
  Resend's dashboard UI for the same window.
