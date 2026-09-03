# RED TEAM — "one identity key = verified email" (candidate new-member flow)

Adversary seat, 2026-09-03. HEAD `6937aa7e`. Live project `hjppxawglmukfvsgmcog`, **SELECT-only**;
emails masked. Every number below was run live at write time. Companion to
`2026-09-02-new-user-VERDICT.md` (which this does not contradict; it attacks the *proposed cure*).

## 0. The design under attack

> ONE identity key = verified email. Desk records the email on the `cliente` row. Every session
> mint (password login, signup confirm, magic link, password reset) runs an idempotent
> claim-by-email for the gym in effect. `/activar` with an existing account → "Inicia sesión", no
> second mail. Invite mail = "crea tu cuenta con este correo", deep-linking `/registro` with the
> email **prefilled and locked**. Claim codes (`reclamar_por_codigo`, `/codigo`, VINCULAR) kept
> only for email-less members **or deleted**.

## 1. Live baseline (the numbers the design has to survive)

| gym | clientes | email NULL | sin cuenta | **sin cuenta ∧ sin email ∧ vigente** | códigos armados | nuevos 30d | nuevos 30d sin email |
|---|---|---|---|---|---|---|---|
| red | 67 | 15 | 23 | **8** | 26 | 37 | 8 |
| forge | 50 | **44 (88%)** | 48 | **23** | 28 | 16 | **11 (69%)** |
| red-demo | 43 | 11 | 37 | 1 | 17 | 2 | 1 |
| forge-demo | 24 | 21 | 23 | 6 | 6 | 2 | 2 |
| **total** | **184** | **91 (49.5%)** | **131** | **38** | **77** | 57 | 22 (39%) |

`auth.users`: **63** total · 5 unconfirmed · **10 with no `clientes` row anywhere** · 5 with no
`gym_membership` · **29 (46%) with no `phone_e164` in `raw_user_meta_data`** · 0 with a `+` alias ·
**14 gmail addresses whose local part contains a dot** · providers = `email` only (no OAuth today).

Claimed accounts: **53**, *all single-gym*. `gym_membership` = 59 rows, of which **6 have no
`clientes` row in that gym**. Zero-balance twins already live (claimed row, 0 ventas, 0 saldo):
**3** — 2 `red`, 1 `red-demo` = **5.7% of every claimed account**.

Unclaimed rows that carry an email and are therefore *auto-claimable by whoever verifies that
address*: red-demo 26 (19 with balance, **115 clases**), red 8, forge 4 (**18 clases**),
forge-demo 2 (7 clases).

Measured cost of the claim RPC's unavoidable step, live `EXPLAIN (ANALYZE)`:
`vault.decrypted_secrets` firma read = **10.6 ms execution** (2.5 ms planning); the email probe
itself is **0.17 ms** on `clientes_email_gym_uq`. The vault read, not the lookup, is the cost.

---

## 2. Attacks, worst first

### A1 — The invite loses its only server-side binding. "Prefilled and locked" is not a control. **NEW · CRITICAL**

**Sequence.** Desk sells → invite mail deep-links `/registro?email=socia@x.com`. The form field is
`readOnly`. The member (or anyone) POSTs `registrarAction` directly with a different `email`.

**Evidence.** `apps/client/src/app/registro/actions.ts:34-71` reads `formData.get("email")` and hands
it to `registrarSocio`; the only server-side gates are `resolveTenant(host)` and Turnstile. There is
**no invite token, no firma, no lookup of what the invite was for** — the file's own docstring
(`:15-19`) says "Server Functions are reachable by direct POST, so this re-resolution is the
authoritative gate", and the only thing it re-resolves is the *gym*, never the invitee. Binding then
happens at `apps/client/src/app/auth/confirm/route.ts:95` →
`reclamar_o_crear_cliente.sql:39-47`, i.e. **"lower(email) matches an unclaimed row in this gym"**.

Today the invite rail is not that. It is `reclamar_por_codigo.sql:26-29`:

```sql
if p_firma is distinct from
   encode(extensions.hmac('activar:v1:' || p_codigo, v_key, 'sha256'), 'hex') then
  raise exception 'Firma de activación inválida';
```

— an 8-char code that resolves *the exact paid row id* (`:43-48`), plus a server-only HMAC. The
candidate deletes both. **Net: the binding of a paid asset drops from (row-bound code ∧ server HMAC ∧
inbox) to (inbox alone).** That is one factor removed, and the removed factor is the only one that
proves *the gym meant this row for this person*.

**Severity.** Critical — it is the load-bearing change, not a side effect.
**Mitigation.** Put a server-minted, row-bound token back in the invite link and verify it at the
door. That is `claim_code` + `firmaCodigo`, i.e. **the exact mechanism the design deletes** — the
mitigation re-adds the complexity the design's headline removes.

---

### A2 — Auto-claim on every session mint provisions phantom members into any gym the URL names. **AMPLIFIED (partly today) · CRITICAL**

**Sequence.** Any confirmed user, logged in, opens `https://<client>.vercel.app/?gym=forge`
(or a preview URL, or `localhost`), then does anything that mints/refreshes a session. Claim runs
against gym `forge`. If their email matches nothing there, `reclamar_o_crear_cliente.sql:78-86`
takes the **INSERT branch** and creates a fresh `clientes` row **plus a `gym_membership` row**
(`:88-89`) in a gym they never joined.

**Evidence.** `packages/data/src/server/resolve-tenant.ts:196-212`: host wins, but when
`hostResolution.matched` is false, `if (override) return overrideTenant` — the `?gym=` slug is an
**open set validated only against the DB**. `apps/client/src/proxy.ts` then persists the resolved
slug as the `gym` cookie, so the choice sticks. `.vercel.app` and every preview deployment resolve
no `gym_domain` row (the no-tenant branch of `tenantHeaders`, `resolve-tenant.ts:280-289`, exists
precisely for them).

**Already true today, at two URLs**: `apps/client/src/app/reservar/page.tsx:65` and
`apps/client/src/app/saldo/page.tsx:41` both run `intentarReclamoPorEmail(tenant.id, …)` on the
host-resolved tenant whenever membership is missing. The design's change is *surface*: from two
pages to every door, on every navigation that mints or refreshes a session.

The membership matters: `gym_membership` is the authz row. Live, **6 `(user,gym)` pairs already hold
a membership with no `clientes` row in that gym** (red 1, red-demo 2, forge 1, forge-demo 2) — the
drift this mechanism produces, already observable.

**Severity.** Critical (roster pollution + an authz row granted by a query string).
**Mitigation.** Refuse the claim's INSERT branch entirely — claim may only *link* an existing
unclaimed row, never mint one; and gate the claim on a mapped host. Cheap, and it does **not**
re-add complexity. This is the one mitigation I would gate the ship on (§4).

---

### A3 — Deleting codes strands the email-less majority. forge is 88% email-less. **NEW · CRITICAL**

**Sequence.** Codes are deleted. A member whose row has no email has no door at all.

**Evidence.** Live: **91 of 184 `clientes` rows (49.5%) have `email IS NULL`**; **forge, the only
real operator, is 44 of 50 (88%)**, and **23 of those are `vence >= current_date`** — paying, today,
uninvitable. In the last 30 days forge created 16 clients and **11 (69%) with no email**, so this is
current desk behaviour, not legacy. Platform-wide, **38 rows are vigente ∧ accountless ∧ email-less**.

`77` claim codes are armed right now (forge 28, red 26, red-demo 17, forge-demo 6). The repo's own
exit criterion for this is already written: `docs/FIndings/new-user-xe/T4-write-path.md:772` —
"rows with a live code and no email cross **60** (today: 47)". It is **77** as of this run.

**Severity.** Critical. The "or deleted" arm of the design is not shippable against forge's roster.
**Mitigation.** Keep codes for email-less rows — which the design already concedes as an option. But
then the design does **not** simplify: both rails stay, and the desk gains a *third* state
("has email / has code / has neither") to reason about.

---

### A4 — Desk typo silently transfers a paid balance, with no second factor and no audit trail. **AMPLIFIED · HIGH**

**Sequence.** Desk types `maria@gmial.com`. Row is paid. Whoever owns that inbox eventually mints a
session on that host → auto-claim binds the paid row to them. The real María self-registers →
`reclamar_o_crear_cliente.sql:78-86` mints her a **zero-balance twin**.

**Evidence.** There is **no typo detection anywhere**: the vender email field is
`apps/admin/src/app/(app)/vender/_components/vender.tsx:659-669`, a single optional input with
`inputMode="email"` and **no `type="email"`**; validation is
`apps/admin/src/app/(app)/vender/_components/vender-vm.ts:33-39` + `:52-66` — shape only, and
`clienteListo` explicitly lets a blank email pass. No confirm field, no MX check, no did-you-mean.
The only near-check (`vender.tsx:130-147`) warns on *collision*, not typo.

`public.clientes` has **no `updated_at` column** (confirmed against
`information_schema.columns`: 19 columns, `created_at` only) and the repo's audit table holds 0 rows
(VERDICT §Q5). A wrong bind leaves no trace.

Assets currently exposed to this: **19 red-demo rows carrying 115 clases**, 1 forge row carrying
**18 clases**, plus 8 red and 2 forge-demo rows. Twins already live: **3 of 53 claimed accounts
(5.7%)**.

Today's flow has the same email rail at `/auth/confirm`, so this is **not purely new** — but today
it is the *fallback* and the code is the *primary* (ADR-0015; `auth/confirm/route.ts:78-85` runs the
code arm first). The design **inverts** that, making the un-second-factored rail the only one.

**Severity.** High. **Mitigation.** A confirm-email field + a "¿eres tú? [masked email]" interstitial
before the bind. Both re-add UI the design was meant to delete.

---

### A5 — Claim-on-login is a silent no-op for 46% of live users. **NEW · HIGH**

**Sequence.** Member registered outside `/registro` (activation rail, or any future door) logs in
with a password. The design says: claim. The RPC refuses.

**Evidence.** `reclamar_o_crear_cliente.sql:70-77`:

```sql
if v_cli is null then
  if v_phone is null then
    raise exception 'Teléfono requerido';
```

`v_phone` is `raw_user_meta_data->>'phone_e164'` (`:36`), which is only ever set by `/registro`'s
`signUp`. Live: **29 of 63 auth users (46%) have no `phone_e164` in metadata**. For every one of
them, any claim that reaches the INSERT branch **raises**. The app swallows it — `intentarReclamo`
(`packages/data/src/server/registro.ts`, the `intentar*` ceremony) returns `{ok:false}` as a value —
so the member simply keeps seeing `SinMembresia` with no error anywhere. The design's headline
promise ("every session mint claims") is false for nearly half the user base, and fails invisibly.

**Severity.** High (silent). **Mitigation.** Drop the phone requirement — which is safe only if A2's
"never mint, only link" fix lands first, since the phone check is currently the *accidental* brake on
phantom-row creation.

---

### A6 — Claim on every session mint puts an RPC on the request path. **NEW · MEDIUM-HIGH**

**Sequence.** "Every session mint" includes token *refresh*, and the only seam that sees every
refresh is `apps/client/src/proxy.ts`, whose matcher (`:192-200`) is every non-static request.

**Evidence / cost.** The floor is measured, not guessed: `vault.decrypted_secrets` decrypt =
**10.6 ms** execution (live `EXPLAIN ANALYZE`), unavoidable because *both* claim RPCs read it for
firma verification (`reclamar_o_crear_cliente.sql:21-29`); the email probe adds 0.17 ms; plus one
pdx1→us-west-2 PostgREST round trip (region pinned per ADR-0017). Call it **≈25–45 ms per
navigation — modelled; the end-to-end number is unmeasured (experiment: time one `/auth/confirm`).**

The failure mode is worse than the cost. The proxy's client *is* shielded
(`proxy.ts:160  global: { fetch: shieldedFetch }`), so `READ_TIMEOUT_MS = 8_000`
(`packages/data/src/server/fetch-shield.ts:84`) applies — meaning a Supabase degradation of the
2026-08-29 shape (40–260 s stalls, per that file's own docstring `:26`) would add **up to 8 s to
every navigation**, on top of the 8 s the JWKS path can already spend. Fail-open: `intentarReclamo`
swallows, the member proceeds without a membership and lands on `SinMembresia`.

**Severity.** Medium-high. **Mitigation.** Run the claim only at the 3–4 real mint events (confirm
route, post-login action, post-reset), never in the proxy — i.e. **the design must name its call
sites**, which is exactly the discipline today's code already has (2 pages + 1 route).

---

### A7 — `registrar_venta`'s C7 backfill can overwrite a *claimed* member's email. **TODAY · HIGH under this design**

**Evidence.** `supabase/functions-canonical/registrar_venta.sql` (C7 arm, ~`:173-184`):

```sql
update public.clientes c
  set clases_restantes = v_new_clases, vence = v_new_vence,
      paquete_nombre = v_pk_nombre,
      email = coalesce(p_email, c.email)
  where c.id = p_cliente_id;
```

— **no `auth_user_id` check**. The guard is UI-only (`vender.tsx:745` renders the input only when
`!existing.email`). Contrast `actualizar_cliente.sql:16-18`, which *does* refuse:
`raise exception 'No se puede editar el correo de una cuenta activa'`.

Today this is a contact-data bug. Under "email IS the identity key" it becomes an identity write on a
trust boundary: a crafted `mode:"existing"` payload desyncs `clientes.email` from `auth.users.email`
on a claimed row, and every future recibo/invite for that member routes to the attacker's inbox.
**Severity: high, and it is a today-defect the design promotes.**
**Mitigation.** Port `actualizar_cliente`'s guard into `registrar_venta`. One migration, no
complexity added. Should ship regardless of this design.

---

### A8 — Three live definitions of "valid email", and the design routes 100% of invites through the weakest one. **TODAY code · NEW exposure · MEDIUM**

**Evidence.**
- Admin intake: `packages/format/src/format.ts:80-82` — `/^[!-?A-~]+@[!-?A-~]+\.[!-?A-~]+$/`, the
  ASCII gate added after the 2026-08-29 `Ivanmontañez77@…` Resend-422 incident.
- `actualizar_cliente` + `/registro` server: `z.string().trim().email()` (zod v4 default) —
  ASCII-only *incidentally*, and it disagrees with `isEmailValido` on real inputs.
- Client app browser (`apps/client/src/lib/auth-validacion.ts:14`):
  `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — **accepts `ñ` and accents**.

The design makes `/registro` the sole invite door. Live non-ASCII emails today: **0** — the gate
holds *because admin intake is the only writer*. Moving the invite onto the client door widens the
crack the 08-29 fix closed. **Mitigation.** One shared validator; delete the other two. Genuinely
simplifying — worth doing either way.

---

### A9 — Gmail dot/plus aliases defeat `lower(email)` matching. **TODAY · MEDIUM**

**Evidence.** The match key is `lower(email)` (`reclamar_o_crear_cliente.sql:48-52`, index
`clientes_email_gym_uq on (gym_id, lower(email)) where email is not null`,
`supabase/migrations/20260710120000_renewal_schema_prep.sql:46-48`). No dot-folding, no `+`-stripping,
and — note — **no `btrim`** in either the index or any RPC (only the TS zod layer trims, i.e. app
discipline, not a DB guarantee). Live: **14 of 63 auth users** have a dot in a gmail local part;
`+` aliases: 0. Desk types `juanperez@gmail.com`, member signs up `juan.perez@gmail.com`: same
inbox, different key, no match → paid row stranded + zero-balance twin (A4's mechanism).
**Mitigation.** Provider-aware normalisation — new complexity, and provider-specific rules rot.

---

### A10 — Unverified-session takeover: **refuted at HEAD, but the design removes the reason it holds.** **LOW today**

I attacked this hard and it holds. Both claim RPCs check the flag:
`reclamar_o_crear_cliente.sql:31-38` and `reclamar_por_codigo.sql:32-36` both do
`select u.email, u.email_confirmed_at … if v_conf is null then raise exception 'Correo no verificado'`.
Password login on an unconfirmed account is refused by GoTrue and surfaced as `email_not_confirmed`
(`packages/data/src/server/sesion.ts:64-71`). Magic link uses `shouldCreateUser: false`
(`sesion.ts:185-187`) so it cannot provision an account for an arbitrary address.
`enable_anonymous_sign_ins = false`, `enable_manual_linking = false` (`supabase/config.toml`).
Live: **providers = `email` only**; 5 unconfirmed users, none claimed.

**The residual risk is forward-looking and real:** the moment a social provider is enabled, Supabase
stamps `email_confirmed_at` from the provider's assertion, and "verified" silently comes to mean
"some IdP said so". Today that only affects a fallback rail; under this design it is the *whole*
identity system. If the design ships, `email_confirmed_at` alone stops being an adequate definition
of "verified" and must be narrowed to `identities.provider = 'email'`.

---

### A11–A13 — Attacks I could not make land (stated so the record is honest)

- **`mi_membresia` roulette is FIXED at HEAD.** `mi_membresia.sql:19-23` selects
  `where c.auth_user_id = v_uid and c.gym_id = p_gym_id`. The 2026-08 wrong-gym-view memory no
  longer applies. The multi-gym attack has to run through A2's phantom-membership path, not this one.
- **Two `clientes` rows cannot share a non-null email in one gym.** `clientes_email_gym_uq` is a
  genuine engine-enforced property; `v_n > 1` in the claim RPC is unreachable. *But* the index is
  `where email is not null` and **49.5% of live rows are NULL-email**, so it constrains half the
  roster; `tel`/`phone_e164` carry no unique constraint at all.
- **A claimed row's email is immutable via the ficha.** `actualizar_cliente.sql:16-18` refuses,
  three layers deep (UI hide, payload omission, RPC raise). Only `registrar_venta` is open (A7).
- **One thing the design genuinely fixes:** VERDICT row #15 is live —
  `reclamar_o_crear_cliente` never nulls `claim_code`, and **10 RED rows carry an armed code on an
  already-claimed row**. Deleting codes retires that class of defect outright.

---

## 3. New vs. already-true

**NEW (regressions this design would introduce):** A1 (invite binding loses its second factor),
A3 (deleting codes strands 38 vigente email-less rows / forge's 88%), A5 (silent no-op for 46% of
users), A6 (claim on the request path), and the *inversion* in A4 that makes the un-second-factored
rail primary.

**ALREADY TRUE TODAY (not a regression — the design inherits, and in most cases magnifies, them):**
A2's mechanism (`reservar/page.tsx:65`, `saldo/page.tsx:41` already claim-or-create against a
host-chosen gym; 6 orphan memberships, 3 twins live), A4's typo surface (zero detection at the desk,
no `updated_at`), A7 (`registrar_venta` backfill unguarded), A8 (three validators), A9 (no
alias/whitespace normalisation), A10's `email_confirmed_at` definition.

## 4. The one mitigation without which this must not ship

**Kill the claim RPC's INSERT branch.** A claim must be allowed to *link* an existing unclaimed
`clientes` row and nothing else — never to mint a row, and never to insert a `gym_membership` for a
gym where no row matched. Everything else on this list is survivable or fixable in a follow-up; this
one turns "every session mint runs a claim" from a convenience into a mechanism that writes an authz
row into any gym a query string names, on a surface about to grow from two pages to every door. It
is a ~10-line change to `reclamar_o_crear_cliente.sql:70-89`, it adds no complexity, and it is the
difference between the design being aggressive and the design being unsafe.

Runner-up, and the one that decides whether the design is *worth* shipping rather than whether it is
safe: **A1's server-side invite binding.** If the answer is "keep `claim_code` for that", the design
has not removed a rail — it has renamed one.
