-- Revoke a user's sessions when their `gym_membership` row is removed — issue #218 (epic #203).
-- Decision + the session-lifetime half: docs/adr/0016-session-revocation-and-lifetime.md.
--
-- THE GAP. Deleting a `gym_membership` row cuts DATA access at the very next query — RLS
-- re-evaluates per request (ADR-0001) — but leaves the SESSION alive. Measured on live 2026-08-02:
-- every `auth.sessions` row carried `not_after = null`, and one session created 2026-07-11 was
-- still refreshing 21 days later. Role removal left a removed operator holding a live, renewing
-- session against a hollow app. Durability gap, not an open data hole — and this closes it.
--
-- MECHANISM: an `after delete` ROW trigger that deletes the user's `auth.sessions` rows.
-- Not an app-side `auth.admin.signOut()`, for two independent reasons:
--
--   1. There is no app-side removal path to hook. `gym_membership` carries NO INSERT/UPDATE/DELETE
--      policy (ADR-0013 §4), so every direct client write is default-denied — proven by
--      `supabase/tests/gym_membership_rls.sql`. A row is removed by `postgres` (dashboard / SQL
--      editor / a migration) or from inside a SECURITY DEFINER RPC. A hook in `apps/*` would
--      never fire, because `apps/*` never deletes a membership row.
--   2. `auth.admin.signOut()` needs THE REMOVED USER'S JWT — "you can revoke all refresh tokens
--      for a user by passing a user's JWT through to auth.api.signOut(JWT: string)"
--      (supabase.com/docs/reference/javascript/auth-signout). The remover does not hold it, and
--      Supabase publishes no revoke-by-user-id admin endpoint.
--
-- Deleting the row IS the documented server-side equivalent. Supabase's own auth error catalogue
-- defines `session_not_found` as: "Session to which the API request relates no longer exists. This
-- can occur if the user has signed out, OR THE SESSION ENTRY IN THE DATABASE WAS DELETED IN SOME
-- OTHER WAY." (mcp search_docs → error(code:"session_not_found", service:AUTH)). And the sign-out
-- guide: "Upon sign out, all refresh tokens and potentially other database objects related to the
-- affected sessions are destroyed" — which is exactly the three deletes below.
--
-- GLOBAL, never scoped — and that is a choice, not an oversight. `auth.sessions` is keyed on
-- `user_id` alone; a session carries no gym. A multi-gym operator browsing gym B's admin host uses
-- the SAME session row as gym A's, so "revoke only gym A's session" is not expressible. The two
-- available levers are per-session-id and per-user. We take per-user: a multi-gym operator removed
-- from gym A is signed out everywhere and signs straight back in (their gym B membership is
-- untouched — the trigger deletes sessions, never memberships). One re-login on a rare, deliberate
-- admin action, against a removed operator keeping a live session. The session is the smaller cost.
--
-- BOUND ON DELETE, deliberately: role DEMOTION (`update … set role = 'member'`) does NOT revoke.
-- The issue's acceptance criterion is row removal, and a demoted operator already loses every
-- staff read at the next query for the same RLS reason. Asserted as a limit, not left to guesswork
-- (`revocacion_sesion_membresia.sql`, vector 6).
--
-- Idempotent (create-or-replace + drop-trigger-if-exists) so it is safe to replay.

create or replace function public.revocar_sesiones_al_quitar_membresia()
  returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  -- Deleted in FK dependency order rather than leaning on the auth schema's ON DELETE actions:
  -- GoTrue owns those constraints and may change them between releases, and an unexpected
  -- RESTRICT would turn every membership removal into an error. This order needs no cascade.
  delete from auth.mfa_amr_claims
    where session_id in (select id from auth.sessions where user_id = old.user_id);
  delete from auth.refresh_tokens
    where session_id in (select id from auth.sessions where user_id = old.user_id);
  delete from auth.sessions where user_id = old.user_id;
  return null;  -- after-trigger: the return value is ignored
end;
$function$;

-- EXECUTE lockdown, same posture as every other definer primitive here (ADR-0013 §1; mirrors
-- 20260531210445 for `rls_auto_enable`). Postgres checks EXECUTE on a trigger function at CREATE
-- TRIGGER time, not on each fire, so the revoke hardens the PostgREST surface without disarming
-- the trigger — `rls_auto_enable` has run this way since 20260531210445.
revoke execute on function public.revocar_sesiones_al_quitar_membresia() from anon, authenticated, public;

drop trigger if exists revocar_sesiones on public.gym_membership;
create trigger revocar_sesiones
  after delete on public.gym_membership
  for each row execute function public.revocar_sesiones_al_quitar_membresia();
