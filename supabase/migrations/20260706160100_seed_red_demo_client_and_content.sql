-- red-demo client host + gym-content seed — slice #50 (PRD #49 S1; red-demo-seed-evidence.md continuation).
--
-- red-demo is the LIVE RED sandbox gym (id daa1c888-…, seeded ad hoc in slice #45, NOT by migrations —
-- so it does NOT exist on a fresh scratch project). This seed:
--   1. gives red-demo a client-app host row (its #45 seed left only the admin host), so the client app
--      resolves red-demo by host in dev; the prod client surface is reached via the `?gym=red-demo`
--      override (resolveTenant's override arm validates real slugs), matching how the RED-admin prod host
--      was left to a human insert;
--   2. seeds the four gym-content sections #45 explicitly DEFERRED (the #39 tables went live after that
--      seed) — copy drawn from the approved RED mock's Nosotros + Precios slots — so the sandbox exercises
--      every marketing page. paquetes marketing + plan_feature already live on red-demo (#45), so the
--      Precios plans + features are already present; this file adds only what is missing.
--
-- GUARDED + IDEMPOTENT: the whole body no-ops unless a gym with slug 'red-demo' exists (so it is inert on
-- scratch and on any fresh clone), and each content block inserts only when that table is still empty for
-- red-demo (so re-applying, or applying after a manual seed, never duplicates). The host row uses
-- on-conflict(hostname) do nothing. NO destructive SQL; safe to re-apply and safe out-of-order on live.
-- Applied to live by the owner in the batched apply step (goal file), never by this agent.

do $$
declare
  v_gym uuid;
begin
  select id into v_gym from public.gym where slug = 'red-demo';
  if v_gym is null then
    raise notice 'red-demo not present — client/content seed skipped (expected on scratch/fresh clones)';
    return;
  end if;

  -- 1. Client-app host row (dev). on-conflict keeps re-apply and a pre-existing row safe.
  insert into public.gym_domain (gym_id, hostname, app)
    values (v_gym, 'red-demo-client.localhost', 'client')
    on conflict (hostname) do nothing;

  -- 2a. about_value — the three RED values (mock Nosotros "Lo que nos mueve").
  if not exists (select 1 from public.about_value where gym_id = v_gym) then
    insert into public.about_value (gym_id, title, description, sort_order) values
      (v_gym, 'Fuerza',     'La base de todo lo demás. Te enseñamos técnica antes que carga, y carga antes que ego.', 0),
      (v_gym, 'Disciplina', 'La motivación se acaba a media semana; la disciplina te trae a las 05:30 aunque no tengas ganas.', 1),
      (v_gym, 'Resultado',  'Medimos pesos, repeticiones, tiempos y rachas. Si no mejora, lo cambiamos.', 2);
  end if;

  -- 2b. facility — the space + equipment (mock Nosotros "El equipo y el espacio").
  if not exists (select 1 from public.facility where gym_id = v_gym) then
    insert into public.facility (gym_id, name, description, sort_order) values
      (v_gym, 'Racks y barras olímpicas',    '12 estaciones con discos calibrados', 0),
      (v_gym, 'Plataformas de levantamiento', 'Piso reforzado',                      1),
      (v_gym, 'Rig funcional',                'Dominadas, anillas y cuerdas',        2),
      (v_gym, 'Cardio',                       'Remos, assault bikes y skiergs',      3),
      (v_gym, 'Material funcional',           'Kettlebells, sleds y cajones',        4),
      (v_gym, 'Vestidores',                   'Regaderas con agua caliente',         5);
  end if;

  -- 2c. stat — marketing stat pairs (mock Nosotros "La fragua"), coaches count kept honest to red-demo's 3.
  if not exists (select 1 from public.stat where gym_id = v_gym) then
    insert into public.stat (gym_id, label, value, sort_order) values
      (v_gym, 'Prendimos la fragua', '2019',   0),
      (v_gym, 'Taller',              '320 m²', 1),
      (v_gym, 'Coaches',             '3',      2);
  end if;

  -- 2d. faq — the six Precios FAQs (mock "Preguntas frecuentes"), rendered by the Precios page.
  if not exists (select 1 from public.faq where gym_id = v_gym) then
    insert into public.faq (gym_id, question, answer, sort_order) values
      (v_gym, '¿Puedo congelar mi membresía?',
              'Sí. Puedes congelar la Membresía abierta o el plan Ocho clases hasta 15 días al mes por viaje, lesión o tiempo fuera. Lo activas desde tu Plan en la app o por WhatsApp.', 0),
      (v_gym, '¿Cómo cancelo una reserva?',
              'Entra a Reservas y cancela hasta 2 horas antes de la clase. Si cancelas a tiempo, tu clase regresa a tu plan. No presentarte descuenta la clase en el plan Ocho clases.', 1),
      (v_gym, '¿Qué pasa si llego tarde?',
              'Puedes integrarte hasta 5 minutos después de iniciada la clase. Pasado ese tiempo, el coach puede no dejarte entrar para cuidar tu desempeño. Llega 10 minutos antes.', 2),
      (v_gym, '¿La primera clase es gratis?',
              'Tu primera vez la vives con una Clase suelta a $120, y si te quedas con un plan ese mismo día te la bonificamos del primer mes.', 3),
      (v_gym, '¿Qué llevo a mi primera clase?',
              'Ropa cómoda, tenis de suela firme, una toalla y tu botella de agua. El equipo y el material los pones de nuestra cuenta.', 4),
      (v_gym, '¿Qué métodos de pago aceptan?',
              'Tarjeta de débito o crédito, transferencia SPEI y efectivo en recepción. Los planes mensuales se renuevan con cargo automático desde la app. Facturamos si lo necesitas.', 5);
  end if;
end $$;
