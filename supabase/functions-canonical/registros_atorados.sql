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
