# ADR-0016 — Session revocation on membership removal; session lifetime is a plan + dashboard action, not a repo artifact

**Status:** Accepted · **Date:** 2026-08-02 · **Builds on:** [ADR-0001](0001-supabase-rls-no-orm.md) (RLS is the boundary, re-evaluated per request), [ADR-0009](0009-identity-two-tier-auth-member-claim.md) (`gym_membership` is the one role map), [ADR-0013](0013-gym-scoped-rls-mechanism.md) §4 (no direct client writes to `gym_membership`) · **Trigger:** issue [#218](https://github.com/Vack99/RED-2.0/issues/218) of epic #203 · **Realizes:** `supabase/migrations/20260802160000_revocar_sesiones_al_quitar_membresia.sql`

## Context

Measured on live, 2026-08-02 (#218): **all six `auth.sessions` rows carried `not_after = null`**, and a session created 2026-07-11 was still refreshing on 2026-08-01 — **21 days of continuous life**. `jwt_expiry = 3600` bounds the access token, not the session; `enable_refresh_token_rotation = true` renews it forever. `signOut` appears in exactly two places in the repo, both plain client-side `supabase.auth.signOut()`. Nothing revoked anything on role removal.

RLS already made this a *durability* gap rather than an open data hole: deleting a `gym_membership` row cuts data access at the next query, so a removed operator sits in a hollow app. But "hollow" is not "out", and the session renews indefinitely.

## Decision

### 1. Revocation is a database trigger on `gym_membership` DELETE

`public.revocar_sesiones_al_quitar_membresia()` — `after delete … for each row`, `security definer`, `search_path = ''`, `EXECUTE` revoked from `anon`/`authenticated`/`public` (the ADR-0013 §1 posture; Postgres checks a trigger function's `EXECUTE` at `CREATE TRIGGER` time, not on each fire — `rls_auto_enable` has run this way since `20260531210445`). It deletes the user's `auth.mfa_amr_claims`, `auth.refresh_tokens` and `auth.sessions` rows, in that order.

**Why not app-side.** Two independent reasons, either sufficient:

1. **There is no app-side removal path to hook.** `gym_membership` carries no INSERT/UPDATE/DELETE policy (ADR-0013 §4), so direct client writes are default-denied — proven by `supabase/tests/gym_membership_rls.sql`. Removal happens as `postgres` (dashboard / SQL editor / migration) or inside a definer RPC. Nothing in `apps/*` deletes a membership row, so a hook there would never fire.
2. **`auth.admin.signOut()` needs the removed user's JWT.** Per the [signOut reference](https://supabase.com/docs/reference/javascript/auth-signout): *"For server-side management, you can revoke all refresh tokens for a user by passing a user's JWT through to `auth.api.signOut(JWT: string)`."* The remover does not hold the removed user's JWT, and Supabase publishes no revoke-by-user-id admin endpoint.

**Why deleting the row is the supported equivalent, not a hack.** Supabase's auth error catalogue defines `session_not_found` as *"Session to which the API request relates no longer exists. This can occur if the user has signed out, **or the session entry in the database was deleted in some other way**."* And the [sign-out guide](https://supabase.com/docs/guides/auth/signout): *"Upon sign out, all refresh tokens and potentially other database objects related to the affected sessions are destroyed."* The trigger performs exactly that set of deletes. The FK-ordered delete is deliberate: GoTrue owns those constraints and may change their `ON DELETE` actions between releases, and an unexpected `RESTRICT` would turn every membership removal into an error.

**DELETE only.** Role *demotion* (`update … set role`) does not revoke. #218's acceptance criterion is row removal, and a demoted operator loses every staff read at the next query for the same RLS reason. The limit is asserted as a fact in the suite, not assumed.

### 2. Revocation is global (all of that identity's sessions), never per-gym

`auth.sessions` is keyed on `user_id` and carries **no gym**. A multi-gym operator on gym B's admin host uses the *same* session row as on gym A's. "Revoke only gym A's session" is therefore not expressible — the only levers are per-session-id and per-user.

We take per-user. A multi-gym operator removed from gym A is signed out everywhere and signs straight back in; their gym B membership is untouched (the trigger revokes sessions, it never removes memberships). The cost is one re-login on a rare, deliberate admin action. The alternative cost is a removed operator holding a live, self-renewing session. The session is the smaller loss.

Consequence worth naming: `gym_membership` cascades from both `auth.users` and `gym`, and row triggers fire on cascaded deletes — so deleting a gym signs out everyone in it. That is correct, and it is a large blast radius on an already-catastrophic action.

### 3. `not_after` — the posture, and who can actually set it

**The repo cannot enforce this and will not pretend to.** Time-boxed sessions, inactivity timeout and single-session-per-user are **Supabase Auth settings, and [Pro plan and up only](https://supabase.com/docs/guides/auth/sessions)**. This project is on the free tier. `supabase/config.toml`'s `[auth.sessions]` block configures a *local* stack; reaching the hosted project from it needs `supabase link` + a config push, which this repo forbids outright (prod migration-version drift). Uncommenting it would be theatre, so it stays commented with a pointer to this ADR.

The posture, to be applied the day the project moves to Pro:

| Setting | Value | Why |
|---|---|---|
| **Time-box user sessions** | `30d` | A session may not outlive a month. Bounds the measured 21-day session without touching a working day. |
| **Inactivity timeout** | `14d` | An abandoned front-desk device stops working within two weeks. This is the control that matches the real risk (a forgotten session), not the imagined one. |
| **Single session per user** | **off** | The owner legitimately uses a desk and a phone; enabling it would sign the desk out whenever they open the app elsewhere. |
| **`jwt_expiry`** | keep `3600` | Docs: *"Most applications should use the default expiration time of 1 hour"*; below 5 minutes is discouraged (clock skew, refresh load). |

Two properties of these settings that change how they should be read: they are enforced **at the next refresh**, so effective session life is `timeout + jwt_expiry`; and expired sessions are cleaned from the database progressively **24 hours later**, so `auth.sessions` will not look empty the moment a timeout passes.

**Owner action (blocked on the Pro plan): set Time-box `30d` and Inactivity timeout `14d` at Auth → Sessions; leave single-session off.** Until then, §1's trigger plus a manual `delete from auth.sessions where user_id = …` are the only bounds that exist.

## Consequences

- Removing an operator now ends their session. In *this* app the effect is immediate rather than bounded by `jwt_expiry`: the admin proxy calls `supabase.auth.getClaims()` on every request, and on the legacy HS256 signing secret `getClaims()` falls back to a `getUser()` round trip (`GoTrueClient.js`: *"If symmetric algorithm or WebCrypto API is unavailable, fallback to getUser()"*), which returns `session_not_found` once the row is gone → `decideRedirect` sends them to `/entrar`.
- **That immediacy is contingent, and it is a trap for the pending JWT-signing-keys migration.** Moving to asymmetric signing keys makes `getClaims()` verify locally with no network call, restoring the documented behaviour: *"Access Tokens of revoked sessions remain valid until their expiry time."* Revocation would then take effect within `jwt_expiry` (≤ 1 hour) instead of on the next request. Acceptable, but decide it knowingly.
- Revocation does not make role removal durable for **members**. `apps/client/src/app/reservar/page.tsx` calls `reclamarCliente` when membership is missing, so a removed member who signs in again re-mints their own `gym_membership(member)` row on the next page load. #217 closed the *cross-tenant* half of that path (auth mail without `redirect_to` no longer mints a link on RED's host); the self-heal at `/reservar` is untouched and needs its own decision. Operator/owner rows are never self-minted, so operator removal *is* durable.
