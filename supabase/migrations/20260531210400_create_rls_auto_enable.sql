-- Mirror of the out-of-band `rls_auto_enable` event-trigger guard.
--
-- This SECURITY DEFINER function + its `ddl_command_end` event trigger were created directly on
-- project hjppxawglmukfvsgmcog (dashboard / manual setup) and were NEVER mirrored into the repo —
-- yet migration 20260531210445 *revokes* EXECUTE on the function. So the repo migration set could
-- NOT build from scratch: 20260531210445 would fail on a missing function. This is the canonical-
-- provisioner gap from finding #7 of the architecture audit, surfaced by the from-scratch rebuild
-- proof. Reconstructed verbatim from pg_get_functiondef + pg_event_trigger on the live DB (2026-06-01).
--
-- Versioned just before 20260531210445 so a fresh build creates the function/trigger, then the
-- revoke locks it down — reproducing production's end state. Fully idempotent (CREATE OR REPLACE +
-- DROP ... IF EXISTS) so it is also safe if `supabase db push` applies it out of order on the
-- already-provisioned production DB.
--
-- The trigger auto-enables RLS on any new public table as a belt-and-suspenders guard (every table
-- migration also enables RLS explicitly, ADR-0001). search_path is pinned to pg_catalog and EXECUTE
-- is later revoked from anon/authenticated/public (20260531210445) — a SECURITY DEFINER function
-- should never be directly callable by clients.

create or replace function public.rls_auto_enable()
 returns event_trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- Trigger name matches production's (`ensure_rls`). drop-if-exists + create makes this idempotent
-- both ways: on a fresh build it creates the trigger; on a push to the already-provisioned prod it
-- cleanly replaces the identical trigger instead of creating a duplicate that fires twice.
drop event trigger if exists ensure_rls;
create event trigger ensure_rls on ddl_command_end execute function public.rls_auto_enable();
