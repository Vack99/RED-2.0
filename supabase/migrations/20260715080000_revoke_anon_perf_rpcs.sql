-- Close the anon EXECUTE gap on the four perf RPCs, found by live probe after deploy.
--
-- On the hosted platform, ALTER DEFAULT PRIVILEGES grants EXECUTE on new functions to
-- anon/authenticated/service_role as ROLE-SPECIFIC grants. The perf migrations revoked
-- from PUBLIC and granted to authenticated — but a revoke from PUBLIC does not remove
-- anon's direct default grant, so anon kept EXECUTE on all four (local Docker never had
-- the default grant, which is why the local/scratch denial checks couldn't see this).
-- No data was exposed: every underlying policy is `to authenticated`, so anon execution
-- returned empty maps — this revoke is the defense-in-depth fence the function comments
-- already claim, and matches contar_reservas_activas' actual prod ACL (no anon).
revoke execute on function public.marcadas_por_gym(uuid, date, date) from anon;
revoke execute on function public.marcadas_presencia(uuid, date, date) from anon;
revoke execute on function public.ventas_count_por_cliente(uuid) from anon;
revoke execute on function public.asistencias_mes_por_cliente(uuid, date) from anon;
