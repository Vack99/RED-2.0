# R2-E2 — independent re-derivation of the coverage critic's numbers + cheap live checks

Scope: `docs/FIndings/2026-09-02-new-user-cross-examine.md`, § "Blind spots — coverage critic"
(lines 709-1060). Read-only. Supabase MCP = LIVE prod (`hjppxawglmukfvsgmcog`). All queries run
2026-09-02 ~18:35-19:10 UTC. Emails masked (first 4 chars + domain) except the owner-named
exception, which never appeared in any result set.

---

## (a) Platform-wide WEDGE query, rooted in `clientes`

### a.1 — main wedge (auth_user_id null, claim_code set, email set, invitacion_enviada_at < now()-48h)

```sql
select g.slug, count(*), round(max(extract(epoch from (now()-c.invitacion_enviada_at))/3600))
from public.clientes c join public.gym g on g.id=c.gym_id
where c.auth_user_id is null and c.claim_code is not null and c.email is not null
  and c.invitacion_enviada_at < now() - interval '48 hours'
group by g.slug;
```

Output:

| gym | n | max_hours | min_hours |
|---|---|---|---|
| forge-demo | 2 | 1271 | 1004 |
| forge | 4 | 1218 | 329 |
| red-demo | 1 | 965 | 965 |
| red | 7 | 691 | 66 |

**Total 14. Exact match to the critic's "red 7 (max 691 h) · forge 4 (max 1218 h) · forge-demo 2
(max 1271 h) · red-demo 1 (965 h)."** Re-derivation **confirms** critic finding #1's headline
number and the corrected worst-case (1,218 h / 51 days, on forge, not RED's 475 h).

Per-row detail (masked emails), joined age-ascending:

| gym | email (masked) | wedge_hours |
|---|---|---|
| forge-demo | no.w...@gmail.com | 1271 |
| forge | aztr...@hotmail.com | 1218 |
| forge-demo | d3bi...@gmail.com | 1004 |
| red-demo | nutr...@gmail.com | 965 |
| red | alea...@gmail.com | 691 |
| red | hann...@gmail.com | 477 |
| red | giov...@gmail.com | 476 |
| red | yaah...@live.com.mx | 475 |
| forge | dra....@gmail.com | 389 |
| forge | anas...@gmail.com | 364 |
| forge | vict...@gmail.com | 329 |
| red | cami...@gmail.com | 242 |
| red | luis...@gmail.com | 66 |
| red | ivan...@gmail.com | 66 |

### a.2 — code-only risk (claim_code + email, invitacion_enviada_at NULL)

```sql
select g.slug, count(*), array_agg(c.id order by c.created_at) as ids,
       array_agg(c.created_at order by c.created_at) as created
from public.clientes c join public.gym g on g.id=c.gym_id
where c.auth_user_id is null and c.claim_code is not null and c.email is not null
  and c.invitacion_enviada_at is null
group by g.slug;
```

Output: **`red-demo` only, n=4**. `created_at`: 2025-12-26, 2026-02-02, 2026-06-18, 2026-07-02
(all predate 08-04). Zero rows on `red`, `forge`, or `forge-demo`.

**This is a correction to critic finding #1's third bullet.** The critic reports "4 rows carry a
`claim_code` + an email with `invitacion_enviada_at` NULL," matching §8's `enviarInvitacion`
code-only-risk shape, and calls the cause "unmeasured." True on the count, but the critic does not
say *which gym* — all 4 are in **`red-demo`**, a dev sandbox (memory `demo-gym-testing-model`), not
a live gym. The row IDs (`5eed0000-0000-4000-8000-0000000002xx`) are seed-pattern UUIDs
("5eed"="seed"), consistent with fixture data, not a live abort mid-invite. **This is not a live
occurrence of the risk shape on a real gym** — it changes the critic's own finding: the shape is
real and code-reachable, but the only 4 live instances of it are sandbox fixtures, so the "cause
unmeasured" question (Resend-accept-then-crash vs. code minted and never sent) has **zero real
instances to resolve it against today.**

### a.3 — state detector coverage: which of these the admin desk surfaces

Read at HEAD, `packages/data/src/server/derive.ts:132-182` — the ONE pure invite-state machine
(ADR-0015), derived from exactly `email` / `invitacion_enviada_at` / `auth_user_id` (never
`claim_code`, by design comment at `:135`):

```
estadoInvitacion(f): auth_user_id!=null → cuenta_activa
                      email==null       → sin_email
                      invitacion_enviada_at==null → sin_invitar
                      else              → invitacion_enviada
```

Call sites (desk-facing, cited file:line):
- `packages/data/src/server/clientes.ts:91` — `getClientesLite` (roster/venta picker)
- `packages/data/src/server/clientes.ts:222` — pase-de-lista roster
- `packages/data/src/server/clientes.ts:506` — ficha (client detail)
- Rendered: `apps/admin/src/app/(app)/clientes/_components/clientes.tsx:343-346` (roster badge),
  `apps/admin/src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx:297-298,488,500` (ficha),
  `apps/admin/src/app/(app)/vender/_components/vender.tsx:475-478` (client picker)

**Finding: all 14 §a.1 wedge rows have `invitacion_enviada_at` set and `auth_user_id` null, so
every one of them derives to `invitacion_enviada` and IS surfaced** — a staffer looking at any of
these 3 admin screens sees "Invitada {fecha}" for every stuck row. **The badge carries no age/
urgency signal** — a 66-hour wait and a 1,271-hour wait render identically ("Invitada" + the send
date, which the staffer must mentally subtract from today). The a.2 red-demo rows (code, no stamp)
would derive to `sin_invitar` ("Sin invitar") — actively misleading, since a code already exists.

**This is a different "detector" than the one row #10 / critic finding #1 discuss.** Row #10 and
the critic's "3 of 14 / 21%" both refer to `registros_atorados()`, the DB function behind the
alert cron — see §a.4, which finds the critic's own recomputation does not hold up under a direct
join.

### a.4 — re-deriving "detector coverage 3 of 14 = 21%" (critic finding #1)

`registros_atorados()` body (`supabase/functions-canonical/registros_atorados.sql`) is rooted in
`auth.users`, not `clientes`, and excludes `%@red-demo.test`, `%@forge-demo%`, `%@resend.dev`, and
three other synthetic patterns — i.e. it is already platform-wide, filtering only fixture/test
emails, not filtering by gym.

```sql
select * from public.registros_atorados();
```

Output (3 rows, masked):

| correo | motivo | horas |
|---|---|---|
| jess...@hotmail.com | sin-confirmar | 476 |
| pauc...@hotmail.com | sin-confirmar | 233 |
| ivan...@gmail.com | sin-vincular | 67 |

Direct join of the §a.1 14-row wedge set against this output, by lower(email):

```sql
with wedge as (...), atorados as (select lower(correo) as correo, motivo, horas
  from public.registros_atorados())
select w.slug, w.correo, w.wedge_hours, a.motivo, a.horas
from wedge w left join atorados a on a.correo = w.correo
order by w.wedge_hours desc;
```

**Result: exactly 1 of 14 wedge rows matches an `registros_atorados()` row** — `ivan...@gmail.com`
(sin-vincular, 66h in the wedge query vs. 67h in `registros_atorados()` — same clock, 1h query-time
skew). `jess...@hotmail.com` and `pauc...@hotmail.com` have **no `clientes` row at all** (verified
by direct lookup — 0 rows for those two emails in `public.clientes`), so they cannot be part of the
`clientes`-rooted wedge domain; they are self-registration (`/registro`) accounts that never
confirmed, a different rail entirely from the staff-invite wedge row #10 targets.

**This CHANGES critic finding #1 / blind-spot #1's own headline number.** The critic states
"Detector coverage is 3 of 14 = 21% platform-wide, not row #10's '14%, 1 of 7'" — but a direct
email join gives **1 of 14 = 7%**, not 3 of 14. The critic appears to have equated
"`registros_atorados()` returns 3 rows total, platform-wide" with "3 of the 14 wedge rows are
detected," without running the join. That equation is false: 2 of the 3 `registros_atorados()`
rows are on a different rail (self-registration, `sin-confirmar`) and don't correspond to any
`clientes` wedge row. **Correct statement: `registros_atorados()` detects 1 of the 14 live
`clientes`-rooted wedge rows (7%), plus 2 more stuck members on a rail row #10's fix doesn't touch
(self-registration non-confirmers).** Row #10's fix hint (add a `clientes`-rooted arm) is still
right, and coverage is still badly short of 50% either way — but the number itself was asserted,
not measured, by the seat that flagged everyone else for the same thing.

---

## (b) `get_advisors` — security and performance, verbatim

### Security (7 distinct lint types, 27 total findings)

| level | name | detail |
|---|---|---|
| INFO | rls_enabled_no_policy | `public.cron_run_log` has RLS enabled, no policies |
| INFO | rls_enabled_no_policy | `public.gym_folio_counter` has RLS enabled, no policies |
| WARN | anon_security_definer_function_executable | `enviar_mensaje_contacto(p_gym_slug,...)` — anon-executable SECURITY DEFINER |
| WARN | anon_security_definer_function_executable | `gym_id_por_host(p_hostname,p_app)` — anon-executable SECURITY DEFINER |
| WARN | anon_security_definer_function_executable | `invitacion_info(p_codigo)` — anon-executable SECURITY DEFINER |
| WARN | authenticated_security_definer_function_executable | **21 functions** — `aceptar_acuerdo`, `cancelar_reserva`, `contar_reservas_activas`, `contar_reservas_activas_miembro`, `editar_venta`, `eliminar_venta`, `gym_id_por_host`, `has_role`, `invitacion_info`, `is_member_of`, `is_staff_of`, `marcar_invitacion_enviada`, `mi_membresia`, `next_folio`, `obtener_identidad_legal`, `preparar_invitacion`, `reclamar_o_crear_cliente`, `reclamar_por_codigo`, `reservar_clase`, `roster_clase`, `senal_gym`, `staff_gym`, `toggle_favorito_tipo` — callable by any signed-in user as SECURITY DEFINER |
| WARN | **auth_leaked_password_protection** | **DISABLED** — "Supabase Auth prevents the use of compromised passwords by checking against HaveIBeenPwned.org. Enable this feature." |

**Confirms** critic finding #6's 2 INFO rows, 3 anon-executable WARNs, and the leaked-password
WARN — all reproduced exactly.

**Correction to critic finding #6:** the critic's write-up lists 6 total advisory items ("Zero of
the 30 ranked rows says anything about password policy... The only related item is... T7-10"). The
live advisor call actually returns **27 security findings**, of which **21 —
`authenticated_security_definer_function_executable` — are never mentioned at all.** Most are very
likely by-design (every RPC in this list gates internally on `has_role`/`is_member_of`/etc. per
ADR-0005's SECURITY-DEFINER-by-default convention), and none touches `clientes`,
`gym_membership`, or `reservation` directly by table name — but the critic's own claim to have run
`get_advisors` and reported it undercounts its own tool's output by 21 items. **Unmeasured — new
finding, not in critic's list: whether any of the 21 has a caller-supplied `p_gym_id`/`p_cliente_id`
that bypasses its internal gate — memory `multigym-rpc-roulette` already flags `mi_membresia` and
`toggle_favorito_tipo` by name, both on this list, as having exactly that shape.**

### Performance (4 lint types, 15 total findings)

| level | name | detail |
|---|---|---|
| INFO x4 | unindexed_foreign_keys | `acuerdo_aceptacion.accepted_by`, `clientes.auth_user_id`, `gym.owner_user_id`, `ventas.cliente_id` |
| INFO x6 | unused_index | `paquetes_gym_id_idx`, `perfil_gym_id_idx`, `cobro_gym_id_idx`, `schedule_template_class_type_id_idx`, `class_session_coach_coach_id_idx`, `schedule_template_coach_coach_id_idx`, `contact_message_gym_id_idx` |
| **WARN** | **multiple_permissive_policies** | **`public.clientes`** — 2 permissive SELECT policies for `authenticated` (`clientes_member_select`, `clientes_staff_select`) |
| **WARN** | **multiple_permissive_policies** | **`public.gym_membership`** — 2 permissive SELECT policies for `authenticated` (`gym_membership_self_select`, `gym_membership_staff_select`) |
| **WARN** | **multiple_permissive_policies** | **`public.reservation`** — 2 permissive SELECT policies for `authenticated` (`reservation_member_select`, `reservation_staff_select`) |

**Not run by the critic (or any round-1 seat) — `grep -ril advisors docs/FIndings/new-user-xe/`
returns 0 files, and the critic's own finding #6 only quotes the security lint type.** These 3 WARN
rows are exactly the ask in this task ("anything touching auth/RLS on `clientes`/
`gym_membership`/`reservation`"), and they **confirm and add mechanism to** the ranked-table's
`gym_membership` RLS-cost row ("36.6 us/row measured, times **2 unpredicated reads per render**") —
the "2 reads" is not a client-side double-fetch, it is Postgres evaluating **2 separate permissive
policies** (member_select + staff_select) on every SELECT against all three tables, confirmed
live for the first time. **Tag: measured — new, extends an existing ranked row rather than
contradicting it.**

---

## (c) `query_logs` — edge functions + auth, last 24 h, by status

### Edge functions (`function_edge_logs`)

```sql
select log_attributes['function_id'] as fid, log_attributes['response.status_code'] as status,
       count(*) as n
from logs where source = 'function_edge_logs' group by fid, status order by fid, status;
```

| function | status | n |
|---|---|---|
| send-email (45070cf2…) | 200 | 9 |
| send-email (45070cf2…) | 400 | 6 |
| activar-cuenta (4769f738…) | 200 | 1 |
| activar-cuenta (4769f738…) | 409 | 5 |

**activar-cuenta: 1x200, 5x409, 0x500, 0x422 — exact match to critic finding #4's live count**
("6 invocations: five 409, one 200, zero 500, zero 422"). **Confirms.** send-email: 9x200, 6x400,
**0x500/503 in this specific 24h window** — no 5xx to quote from send-email in this window (row
#14's 503/2,594ms finding is about a historical/worst-case pass, not a live occurrence right now).

### Auth (`auth_logs`), by path + status

```sql
select log_attributes['path'] as path, log_attributes['status'] as status, count(*) as n
from logs where source = 'auth_logs' group by path, status order by path, status;
```

| path | status | n |
|---|---|---|
| /admin/generate_link | 200 | 1 |
| /admin/users | 200 | 1 |
| /admin/users | 422 | 5 |
| /logout | 204 | 12 |
| /otp | (blank) | 3 |
| /otp | 200 | 3 |
| /otp | 429 | 2 |
| /recover | 200 | 2 |
| /signup | (blank) | 11 |
| /signup | 200 | 6 |
| **/signup** | **500** | **6** |
| /token | 200 | 120 |
| /token | 400 | 38 |
| /user | 200 | 4 |
| /verify | 200 | 6 |
| /verify | 403 | 4 |

**Live 5xx found — not in the critic's document at all** (the critic only pulled
`activar-cuenta`'s 24h window, never `auth_logs`). Quoted, all 6 identical shape:

```
error: "500: Invalid payload sent to hook"
error_code: "unexpected_failure"
path: "/signup"
actor_username: "delivered@resend.dev"   (Resend's public sandbox test inbox, not a real member)
actor_name: "Prueba E2E"
referer: "https://red.ibookit.lat"
time: 2026-09-01T21:40:14Z, 2026-09-02T00:24:43Z, 2026-09-02T00:25:18Z,
      2026-09-02T04:17:44Z, 2026-09-02T08:24:28Z, 2026-09-02T08:53:20Z
```

All 6 fire on `user_confirmation_requested`, all against `delivered@resend.dev` (a synthetic
Resend test address, matching memory `senal-gym-freshness-built.md`'s "live signup 500 open").
**Reasoning, not sourced — what would confirm:** an automated process (not the local
`pnpm test:e2e`, which targets `red-demo`/`E2E_EMAIL`) is repeatedly POSTing real signups against
**production** `red.ibookit.lat` over an 11-hour span and getting a `send-email`-hook rejection
every time; identifying that process (cron? external monitor? a stale manual test loop?) needs the
caller, which these logs don't carry. This traffic is excluded from `registros_atorados()` by its
own `%@resend.dev` filter, so it would never wedge-alert even if it succeeded.

---

## (d) Real-member funnel, two proxies, per week since 2026-08-10, per gym

### Code read: which `options.data` keys each door sets

- `/registro` → `packages/data/src/server/registro.ts:153-160` — `supabase.auth.signUp({...
  options: { data: { full_name: input.nombre, phone_e164: telefonoAE164(input.telefono) } } })`.
  **Sets both `full_name` and `phone_e164`.**
- `/activar` → `supabase/functions/activar-cuenta/index.ts:92-95` — `admin.auth.admin.createUser({
  email: decision.email, email_confirm: true })`. **Sets no `options`/metadata at all.**
- Repo-wide grep (`full_name|createUser(|auth.signUp(`, excluding tests) finds **exactly these two
  call sites** — no third door writes `full_name`. Round-1's proxy (`raw_user_meta_data ?
  'full_name'`) and a second proxy derived from code (`raw_user_meta_data ? 'phone_e164'`) are
  therefore reading the same two mutually-exclusive writers.

### Live split (both proxies run side by side)

```sql
with users as (
  select u.id, u.created_at, u.email_confirmed_at,
         (u.raw_user_meta_data ? 'full_name') as has_full_name,
         (u.raw_user_meta_data ? 'phone_e164') as has_phone_e164
  from auth.users u
  where u.created_at >= '2026-08-10' and u.deleted_at is null
    and coalesce(u.is_anonymous,false) = false
), joined as (
  select us.*, g.slug as gym_slug from users us
  left join public.clientes c on c.auth_user_id = us.id
  left join public.gym g on g.id = c.gym_id
)
select date_trunc('week', created_at)::date as week, coalesce(gym_slug,'(unlinked)') as gym,
       count(*) filter (where has_full_name) as n_registro_p1,
       count(*) filter (where not has_full_name) as n_activar_p1,
       count(*) filter (where has_phone_e164) as n_registro_p2,
       count(*) filter (where not has_phone_e164) as n_activar_p2,
       count(*) filter (where email_confirmed_at is null) as n_unconfirmed,
       round((percentile_cont(0.5) within group (order by extract(epoch from
             (email_confirmed_at-created_at))/60) filter (where email_confirmed_at is not null))::numeric,1)
         as median_min_to_confirm
from joined group by 1,2 order by 1,2;
```

| week | gym | n /registro (p1=p2) | n /activar (p1=p2) | n unconfirmed | median min created→confirmed |
|---|---|---|---|---|---|
| 08-10 | (unlinked) | 1 | 0 | 1 | null |
| 08-10 | red | 6 | 12 | 0 | 0.0 |
| 08-17 | (unlinked) | 0 | 1 | 0 | 0.0 |
| 08-17 | red | 6 | 2 | 0 | 0.4 |
| 08-17 | red-demo | 0 | 1 | 0 | 0.0 |
| 08-24 | (unlinked) | 2 | 0 | 1 | 2030.1 |
| 08-24 | forge | 0 | 1 | 0 | 0.0 |
| 08-24 | red | 8 | 3 | 0 | 0.8 |
| 08-24 | red-demo | 0 | 1 | 0 | 0.0 |
| 08-31 | (unlinked) | 2 | 0 | 2 | null |
| 08-31 | forge | 0 | 1 | 0 | 0.0 |
| 08-31 | red | 5 | 1 | 0 | 1.3 |

**Both proxies agree on every row (n_registro_p1 == n_registro_p2 in all 12 rows) — the second,
code-derived proxy does not contradict round 1's proxy; it confirms it exactly**, consistent with
the code read above (the two writers are mutually exclusive and there is no third writer).

Real-gym-only (red + forge, excluding sandboxes and `(unlinked)`) totals since 08-10:
**/registro = 25 (all red, forge=0), /activar = 20 (red=18, forge=2).** Registro share on real gyms
= 25/45 = **56%**, not the ~89% the document's §0 item 5 asserts platform-wide — but §0 item 5 is
already struck by critic finding #11d for a different, textual reason (it conflates "every failure
lives on /registro" with "89% of members take /registro"), and this experiment did not re-derive
where the 89% figure itself came from (likely a `clientes`-wide historical claim-rail count, not
this 08-10-forward `auth.users` window) — **unmeasured — which query produced "~89%", cross-check
against this window's ratio.**

**`(unlinked)` rows** (auth.users with no matching `clientes.auth_user_id`) are 100% `/registro`
signups (has_full_name=true in every unlinked row) that have not yet claimed a `clientes` row —
consistent with row #26/§1-row-#10's "verified-email claim only runs in one code arm" mechanism.
One unlinked row from the week of 08-24 took **2,030 minutes (33.8 hours)** to confirm — an outlier
worth flagging but n=1, **unmeasured — single occurrence, not a distribution.**

---

## (e) Table counts: `auth.audit_log_entries`, `realtime.messages`

```sql
select (select count(*) from auth.audit_log_entries) as audit_log_entries,
       (select count(*) from realtime.messages) as realtime_messages,
       (select min(inserted_at) from realtime.messages) as realtime_oldest;
```

| audit_log_entries | realtime_messages | realtime_oldest |
|---|---|---|
| **0** | **58** | 2026-09-02 05:53:13.935 |

**`auth.audit_log_entries` = 0 confirms** row #20 / critic finding 11a's claim ("the reason the
whole document had to be reconstructed from a mail ledger"). **`realtime.messages` = 58 rows,
oldest ~13 hours before this query ran** (query ran ~18:50 UTC 09-02) — retention is same-day only,
consistent with memory `senal-gym-freshness-built.md` shipping the Broadcast-from-DB rail earlier
today (09-02). **Not previously measured by any seat** (`grep -ril "realtime.messages"
docs/FIndings/new-user-xe/` = 0 files) — new number, no round-1 row to compare it against; recorded
for the next round's freshness-retention question.

---

## Summary table — what changed vs. what confirmed

| # | Critic claim | This experiment | Verdict |
|---|---|---|---|
| 1 | 14-row platform wedge (red 7/forge 4/forge-demo 2/red-demo 1), max 1218h forge | Exact match | **CONFIRMED** |
| 2 | "4 code-only-risk rows, cause unmeasured" | Count=4 confirmed, but **all 4 are red-demo sandbox fixtures**, zero on live gyms | **CHANGED** (same count, different — much lower — stakes) |
| 3 | "Detector coverage 3 of 14 = 21%" | Direct email join: **1 of 14 = 7%** (2 of the 3 `registros_atorados()` rows are on the unrelated self-registration rail, no `clientes` row at all) | **CHANGED** (critic's own headline number) |
| 4 | get_advisors security: 6 items (2 INFO + 3 anon WARN + leaked-password) | Confirmed, but **21 more WARN items** (`authenticated_security_definer_function_executable`) went unreported | **CHANGED** (undercount, likely mostly noise but unaudited) |
| 5 | get_advisors performance: never run by critic | **3 WARN `multiple_permissive_policies` on exactly clientes/gym_membership/reservation** — extends the ranked-table's "2 unpredicated reads per render" mechanism | **NEW, extends a confirmed row** |
| 6 | activar-cuenta 24h: 1x200/5x409/0x500/0x422 | Exact match | **CONFIRMED** |
| 7 | (not in critic doc) auth /signup 24h | **6x500** ("Invalid payload sent to hook"), all synthetic `delivered@resend.dev` traffic against production over 11h | **NEW** live 5xx, unrelated to any ranked row |
| 8 | round-1 door proxy (`? 'full_name'`) | Second code-derived proxy (`? 'phone_e164'`) agrees on all 12 week×gym cells | **CONFIRMED** |
| 9 | `auth.audit_log_entries` empty (row #20) | count=0 | **CONFIRMED** |
| 10 | (not in critic doc) `realtime.messages` retention | 58 rows, oldest ~13h | **NEW**, no prior row to compare |
