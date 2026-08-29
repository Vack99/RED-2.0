# Un-claiming `atp404951@gmail.com` on RED to re-walk the invite flow

**Date:** 2026-08-28
**Type:** Live prod data change (2 writes) + a code/schema map. No repo code changed, nothing committed, nothing pushed.
**Trigger:** RED's custom domain `www.redfunctionaltraining.com` went live 2026-08-28 06:10Z (step 3 of `docs/runbooks/red-custom-domain-cutover.md`). Step 4 is the owner's auth walk. The owner wanted to re-use `atp404951@gmail.com` to re-test the invite link and the post-activation redirects on the new host.

---

## TL;DR

1. **Clearing `clientes.email` is impossible from the app and insufficient on its own.** Four independent layers stop the UI from ever unsetting an email, and `actualizar_cliente` hard-raises on an email edit to a claimed row. The reset had to be raw SQL, and it had to null `auth_user_id` too.
2. **Write 1** un-claimed cliente `1e3cdbfe` ("Aaron Test Dos", gym `red`): `auth_user_id`, `email`, `claim_code`, `invitacion_enviada_at`, `terms_accepted_at`, `privacy_accepted_at`, `privacy_aviso_version` → NULL. Row went to `sin_email`.
3. **That was not enough for what he was actually testing.** The activation *rail* is decided by `auth.users`, not by the cliente row. With the address still in `auth.users`, `/activar` can only ever reach the `cuenta_existente` magic-link rail — `/activar/contrasena` is structurally unreachable. He wanted the password-setting flow.
4. **Write 2** (owner-approved, overriding his own standing "never delete an auth.users row" rule): `delete from auth.users where id='2474beed-…'`. The address is now virgin and walks fresh-provision.
5. **The trap that actually bit him** was not SQL. He opened the invite link in a window that still held his 2026-08-27 session, and `activar/page.tsx` short-circuited to a one-click **VINCULAR** bind. Nulling `auth_user_id` does not log anyone out.

---

## Live state before any write

| Surface | Value |
|---|---|
| `auth.users` | `2474beed-86f1-4d3a-b085-c392591c63a3` · `atp404951@gmail.com` · created 2026-08-04 22:57:09Z · confirmed · last sign-in **2026-08-27 03:20Z** |
| `auth.identities` | `1b7594ce-…` provider `email`, same address |
| `auth.sessions` / `refresh_tokens` / `one_time_tokens` | 1 / 1 / 0 |
| `public.clientes` | `1e3cdbfe-5921-4f0b-abae-c360b9a06a9d` · "Aaron Test Dos" · gym `red` (`ca1954bc-…`) · tel `6140000002` · vence `2026-08-31` · Mensualidad ilimitada |
| `public.gym_membership` | (`2474beed`, `red`) role `member`, created 2026-08-04 22:57:28Z |
| child rows | `ventas` 1 · `reservation` 1 (already `cancelada`, class 2026-08-05, past) · `asistencias` 0 |

The other Aaron row in RED — `dc5dd784` "Aaron Talavera" / `aaron.talavera6@gmail.com`, unclaimed, `claim_code` `QGEB8RJS`, vence 2026-08-23 (expired) — was **not touched**.

---

## What was written

### Write 1 — un-claim the cliente row

```sql
update public.clientes
   set auth_user_id=null, email=null, claim_code=null, invitacion_enviada_at=null,
       terms_accepted_at=null, privacy_accepted_at=null, privacy_aviso_version=null
 where id='1e3cdbfe-5921-4f0b-abae-c360b9a06a9d'
   and gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9';
```

Run as `postgres` via MCP `execute_sql`. **No `set local role authenticated`** — that re-arms RLS and silently no-ops the write (the trap from `docs/runbooks/venta-correction.md`).

Prior values, for rollback:

| column | before |
|---|---|
| `email` | `atp404951@gmail.com` |
| `auth_user_id` | `2474beed-86f1-4d3a-b085-c392591c63a3` |
| `claim_code` | `null` |
| `invitacion_enviada_at` | `2026-08-04 22:56:26.71302+00` |
| `terms_accepted_at` | `2026-08-04 22:57:28.112982+00` |
| `privacy_accepted_at` | `2026-08-04 22:57:28.112982+00` |
| `privacy_aviso_version` | `null` |

### Write 2 — delete the auth account

```sql
delete from auth.users where id='2474beed-86f1-4d3a-b085-c392591c63a3';
```

Pre-checked FK map — the account **owned nothing**: no `gym.owner_user_id`, no `acuerdo_aceptacion.accepted_by`, only `gym_membership red:member`.

Cascades taken: `auth.identities` 1 · `auth.sessions` 1 · `auth.refresh_tokens` 1 · `gym_membership` 1.
`SET NULL` targets: `clientes.auth_user_id` (already null) · `gym.owner_user_id` · `acuerdo_aceptacion.accepted_by`.

The `gym_membership` cascade fires the `revocar_sesiones` AFTER DELETE trigger (`20260802160000`). It is harmless here — the body only deletes `mfa_amr_claims`/`refresh_tokens`/`sessions` for `old.user_id`, the same user already being cascaded.

**This is self-healing**, which is why it was the right call over a `+alias`: completing the fresh-provision walk mints a new `auth.users` row for the address, returning it to `cuenta_existente` state for future tests. Nothing is permanently burnt.

### Verification after both writes

```
auth.users like 'atp404951%'        0
auth.identities  (2474beed)         0
auth.sessions    (2474beed)         0
auth.refresh_tokens (2474beed)      0
gym_membership   (2474beed)         0
gym_membership   (red total)       34   <- unchanged
clientes         (red total)       56   <- unchanged
clientes         (red claimed)     33
ventas de 1e3cdbfe                  1   <- survived (FK is to clientes.id, never to auth)
estado de la fila            sin_email
colisiones del email en red         0
```

---

## Why the obvious fix would not have worked

Five independent blocks on "just clear the email":

| # | Block | Evidence |
|---|---|---|
| 1 | The email input is not rendered on a claimed row | `editar-cliente-sheet.tsx:141` — `{!cliente.cuentaActiva && (` |
| 2 | A blank email never counts as dirty, so GUARDAR stays disabled | `editar-cliente-sheet.tsx:51-55` |
| 3 | The zod schema coerces `''` → `undefined` | `packages/data/src/server/clientes.ts:516` |
| 4 | The DAL only spreads `p_email` when truthy | `clientes.ts:554` |
| 5 | The RPC uses `email = coalesce(p_email, email)` and raises on a claimed row | `20260710131000_actualizar_cliente_email_en_uso.sql:39,47` |

Net: **the app can SET an email, never UNSET one.** And `preparar_invitacion` independently raises `'La cuenta ya está activa'` when `auth_user_id is not null`, so re-sending the invite required nulling it regardless.

---

## The three traps

### 1. The vincular short-circuit — this is the one that bit

`apps/client/src/app/activar/page.tsx:79-88` reads `getClaims()`. If `sesionActiva && codigo && invitacion`, it renders `<VincularForm>` — a one-click bind → `vincularAction` → `intentarReclamoPorCodigo(codigo, null)` → `redirect("/reservar")`. No edge function, no magic link, no `/auth/confirm`.

**Nulling `auth_user_id` does not log anyone out.** Only a `gym_membership` DELETE revokes sessions. The owner's 2026-08-27 session survived write 1, so the invite link opened straight onto VINCULAR and the walk proved nothing.

Mitigation: private window, or the in-page escape hatch `noSoyYo()` (`vincular-form.tsx:43-52` — `signOut({scope:"local"})` + `router.refresh()`, which re-renders the same route as the email-gated `ActivarForm`).

### 2. Invite mail holds on the OLD host, by design

`construirUrlInvitacion` (`packages/data/src/server/invitaciones.ts:98-124`) picks the gym's client host by `created_at ASC`, excluding `%localhost`. RED's `gym_domain` rows:

| hostname | app | created |
|---|---|---|
| `red.localhost` | client | 2026-07-02 — excluded by the `%localhost` filter |
| `red.ibookit.lat` | client | 2026-07-09 — **wins** |
| `red-admin.ibookit.lat` | admin | 2026-07-09 |
| `www.redfunctionaltraining.com` | client | 2026-08-28 |

`20260827210000_red_custom_domain_client_host.sql` says so in its own header: *"Do NOT backdate it — that would encode a lie in a column three surfaces tie-break on."*

Only this one rail holds. Password reset, the `cuenta_existente` magic link, and plain-signup confirm all build `origin` from `x-forwarded-proto` + `host`, so they follow whichever door the member walked in through. To exercise the new domain, hand-swap the host — `codigo`/`correo` carry no host component, and the cross-tenant shield compares `x-gym` (both RED hosts stamp `red`), so it is inert:

```
https://www.redfunctionaltraining.com/activar?codigo=<code>&correo=atp404951%40gmail.com
```

### 3. The rail is decided by `auth.users`, not by the cliente row

| | fresh-provision | `cuenta_existente` |
|---|---|---|
| precondition | address absent from `auth.users` | address present |
| branch | `admin.createUser` succeeds | fails `email_exists` → `nucleo.ts:133` → 409 |
| emails sent | **1** (Resend invite only — `email_confirm:true` queues no GoTrue mail) | **2**, from two different systems |
| password screen | `/activar/contrasena` | **structurally unreachable** — `iniciarActivacion` returns `ok:false`, so `activar/actions.ts:66` never runs |

---

## Errors and corrections made during the session

1. **The roster memory was stale and partly wrong.** `test-member-email-roster.md` said `atp404951@gmail.com` was folio 1020 "Aaron Test Uno" with zero auth rows. Live: it is on **"Aaron Test Dos"**, `clientes` has **no `folio` column at all**, and it had held an `auth.users` row since 2026-08-04. Corrected in memory with a dated addendum. The memory's own "re-verify before trusting this list" caveat was the thing that saved it.
2. **Schema was assumed instead of read.** Six queries failed on invented column names — `clientes.folio`, `clientes.estado_invitacion`, `reservation.session_id` (it is `class_session_id`), `gym_contact.id`, `gym_membership.id`, `acuerdo_aceptacion.created_at` (it is `accepted_at`). Cheap to recover from here, but reading `information_schema` first would have been faster.
3. **The first write solved the stated ask but not the goal.** "Clear the email so I can re-enter it and re-send the invite" was delivered exactly; what he was testing was the password-setting flow, which no amount of cliente-row surgery can reach. Needed a second, destructive write. The signal was there in the original message ("testing the invite link and the redirect links") and was not pushed on hard enough.
4. **The mapping fan-out was mostly wrong on the minimal reset.** Five of six mapper agents asserted `email` *must* be nulled; only the critic established that `auth_user_id` alone suffices for REENVIAR, and that nulling email carries its own hazard (it re-exposes the vender email-backfill box, and `registrar_venta` has no `auth_user_id` guard). Nulling email was still correct here because the owner explicitly wanted to re-type it — but the fan-out reached consensus on a claim that was false. **All six missed the vincular short-circuit**, the one trap that actually fired. The completeness critic, not the parallel breadth, produced every load-bearing correction.

---

## Learnings worth keeping

- **The activation rail is a property of `auth.users`, not of the cliente row.** Un-claiming a member never changes which rail fires. This is the single fact that decides what a test walk proves.
- **`/activar` has three rails, not two.** Fresh-provision, `cuenta_existente`, and the session-bearing **vincular** short-circuit that pre-empts both. Any activation test must specify the browser state, not just the data state.
- **Never delete `gym_membership` to reset a member.** Its AFTER DELETE trigger revokes that user's sessions globally. `reclamar_por_codigo` upserts it `on conflict (user_id, gym_id) do nothing`, so leaving it is both correct and required.
- **Deleting `auth.users` is safe *when the account owns nothing*, and it self-heals.** The standing "never delete to free an address" rule is about irreversibility and rail surprises; check `gym.owner_user_id` + `acuerdo_aceptacion.accepted_by` + roles first and it is a mapped, recoverable act.
- **All three relevant unique indexes on `clientes` are PARTIAL** (`clientes_email_gym_uq` on `(gym_id, lower(email)) where email is not null`, `clientes_auth_user_id_per_gym`, `clientes_claim_code_key`). Nulling removes the row from the index rather than colliding with it. `public.clientes` has **zero triggers**.
- **Check prod function bodies against `functions-canonical/` before any RPC-adjacent change.** Done here for `actualizar_cliente` / `preparar_invitacion` / `reclamar_por_codigo` / `marcar_invitacion_enviada` — all matched, one overload each. The 2026-08-27 sales outage came from exactly this drift.

---

## The walk, as handed over

1. Private window — the browser still holds a JWT for the deleted user until it expires.
2. Admin → Aaron Test Dos → EDITAR → type `atp404951@gmail.com` → GUARDAR. Badge `Sin email` → `Sin invitar`.
3. **Enviar invitación**.
4. Copy the `codigo` from the Resend mail (its link points at `red.ibookit.lat` — expected), then open on the new host:
   `https://www.redfunctionaltraining.com/activar?codigo=<code>&correo=atp404951%40gmail.com`
5. Turnstile → submit → `/activar/contrasena` → set password → row claims → `/reservar`.

Expected: **one** email. A second email, or a "Revisa tu correo" screen at step 5, means the address picked up an auth account again — wrong rail.

---

## Open items

- Owner's step-4 auth walk (this doc's walk) — not yet run.
- Two cutover facts are recorded as prose only, with no code or committed artifact behind them, and both fail **silently**: `https://www.redfunctionaltraining.com/**` in the Supabase Auth redirect allow-list (absent → GoTrue clamps the link to the Site URL with the path stripped, token burns, member lands somewhere that looks fine), and the new host on the Turnstile widget's hostname list (absent → the submit button is permanently dead with no error).
- Step 6 (announce to members) still owner-gated on FortiGuard categorization timing.
- **Owner-owed inputs:** SAT persona-física details (nombre, RFC, régimen, domicilio fiscal, correo); RED company name + public reply-to for web-filter categorization.

## Related

`docs/runbooks/red-custom-domain-cutover.md` · `docs/Context/2026-08-27-red-custom-domain-HANDOFF.md` · `docs/runbooks/venta-correction.md` · ADR-0016 (session revocation) · memories `unclaim-cliente-recipe`, `test-member-email-roster`, `activation-rails-two-paths`, `red-custom-domain-cutover`
