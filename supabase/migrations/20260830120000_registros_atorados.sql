-- `registros_atorados()`: the wedge detector — shield plan §3(d)
-- (docs/superpowers/plans/2026-08-30-auth-door-shield-plan.md).
--
-- FC-04: a member stuck between the two doors is invisible to EVERYONE. No code anywhere reads
-- `auth.users`, `reclamar_o_crear_cliente` refuses while `email_confirmed_at is null`, and the
-- admin "Registrados online" tile keys on `clientes.auth_user_id`, so it can never fire for a
-- row that never got linked. Live on 2026-08-30: two members wedged, one for 17 days, found only
-- because a third complained at the counter. This function is the query that would have paged
-- someone on day one; `apps/admin/src/app/api/cron/alertas` runs it hourly.
--
-- TWO SHAPES, one per arm — they are different failures with different repairs:
--   `sin-confirmar`  the account exists but the confirmation never landed (the Sarahí wedge).
--                    `filas_roster` counts the `clientes` rows carrying the same address, so the
--                    alert says at a glance whether the desk already has a parallel identity for
--                    this person (FC-06) or whether nobody has met them yet.
--   `sin-vincular`   confirmed, yet no `clientes` row points at the user. Invisible even AFTER a
--                    manual repair: confirming the email does not perform the claim, so the
--                    member logs in and finds no gym. This is the shape the 2026-08-30 repair
--                    left behind on both victims.
--
-- SUPPRESSIONS. Arm 2 is permanently populated by sandbox accounts (the `red-demo` twin logs in
-- but never claims a roster row) and by long-abandoned signups, so shipping it bare would rebuild
-- FC-05 — the alert nobody reads — inside its own fix. Two exclusions, both stated rather than
-- discovered later:
--   • the dev/sandbox address patterns below, matched on `lower(email)`. `red-demo.test` and
--     `forge-demo` are the committed demo twins (docs/superpowers/plans/2026-07-05-slice-45-
--     red-demo-twin.md); `test.local` / `mock.test` / `example.mx` are denial-suite and seed
--     fixtures, which persist on a scratch project even though they roll back here;
--     `resend.dev` and `testingibookit` are mail-rail probes.
--   • an ACTIONABILITY CEILING of 30 days on BOTH arms (arm 1: 2h–30d, arm 2: 24h–30d). A wedge
--     is a STATE, so every run re-reports it; at an hourly cadence a month-old row has already
--     said so ~700 times, and an un-actioned month-old row is a decision, not a discovery.
--     Arm 1 needs the ceiling most: self-registration is open to the public, so ABANDONED signups
--     accrete monotonically, and without a ceiling the alert becomes a permanent, growing list of
--     strangers' addresses that nobody reads — FC-05 rebuilt inside its own fix.
--     RESIDUAL, stated rather than discovered later: one abandoned signup still pages hourly for
--     up to 30 days. Bounding that properly needs first-seen/last-alerted STATE (page on the
--     transition, not on the tick), i.e. a table and a write path; this function writes nothing
--     and stays that way. If the baseline is not silent in practice, shorten this window first.
-- Verified against LIVE (SELECT-only, 2026-08-30): arm 1 returns exactly the two wedges the plan
-- owes a repair (B1) and arm 2 returns zero, i.e. the healthy baseline is silence.
--
-- GRANTS: NOBODY. Supabase's default privileges hand EXECUTE to PUBLIC + anon + authenticated +
-- service_role on every new `public` function (live `pg_default_acl`:
-- `{postgres,anon,authenticated,service_role}=X`), so all four are revoked and none is re-granted.
-- What remains is
-- the owner (`postgres`), which is exactly and only the role the Management API `database/query`
-- endpoint connects as — the same endpoint, and the same `SUPABASE_ACCESS_TOKEN`, the cron's two
-- existing log queries already use. No member-facing role can reach this, and PostgREST cannot
-- expose it: an unauthenticated caller would be `anon` and a signed-in member `authenticated`.
--
-- SECURITY DEFINER because `auth.users` is owned by `supabase_auth_admin` and no app role holds a
-- SELECT grant on it (registro_claim.sql:210-212 records exactly that). The usual DEFINER safety
-- applies — `set search_path to ''`, every name schema-qualified. It is a documented exception to
-- ADR-0005's INVOKER default for the same reason `enviar_mensaje_contacto` is: an INVOKER function
-- here would read zero rows and report all-clear forever.
--
-- Writes nothing, so the AGENTS.md write-coverage rule does not apply and `rpc-coverage.json` is
-- untouched (the guard DERIVES that from this body — there is no flag to set). It is still covered
-- by a denial suite, `supabase/tests/registros_atorados.sql`, because the suppression list is the
-- part that can silently stop detecting.

create or replace function public.registros_atorados()
returns table (
  correo       text,
  motivo       text,
  desde        timestamptz,
  horas        integer,
  filas_roster integer
)
language sql
stable
security definer
set search_path to ''
as $$
  with candidatos as (
    select u.id, lower(u.email) as correo, u.email_confirmed_at, u.created_at
      from auth.users u
     where u.email is not null
       and u.deleted_at is null
       and coalesce(u.is_anonymous, false) = false
       and lower(u.email) not like all (array[
             '%@red-demo.test',
             '%@forge-demo%',
             '%@resend.dev',
             'testingibookit%',
             '%@test.local',
             '%@mock.test',
             '%@example.mx'])
  ), atorados as (
    select c.correo,
           'sin-confirmar'::text as motivo,
           c.created_at          as desde,
           (extract(epoch from now() - c.created_at) / 3600)::integer as horas,
           (select count(*) from public.clientes r where lower(r.email) = c.correo)::integer
             as filas_roster
      from candidatos c
     where c.email_confirmed_at is null
       and c.created_at < now() - interval '2 hours'
       and c.created_at > now() - interval '30 days'
    union all
    select c.correo,
           'sin-vincular'::text,
           c.email_confirmed_at,
           (extract(epoch from now() - c.email_confirmed_at) / 3600)::integer,
           0
      from candidatos c
     where c.email_confirmed_at < now() - interval '24 hours'
       and c.email_confirmed_at > now() - interval '30 days'
       and not exists (select 1 from public.clientes r where r.auth_user_id = c.id)
  )
  select a.correo, a.motivo, a.desde, a.horas, a.filas_roster
    from atorados a
   order by a.desde;
$$;

revoke all on function public.registros_atorados() from public;
revoke all on function public.registros_atorados() from anon;
revoke all on function public.registros_atorados() from authenticated;
revoke all on function public.registros_atorados() from service_role;
