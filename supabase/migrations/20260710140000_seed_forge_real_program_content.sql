-- Real forge seed — program, CLASE INDIVIDUAL, contact, marketing copy — slice #86 (PRD #83).
--
-- forge is the LIVE REAL gym (slug 'forge', seeded by 20260702150000). Until now its client-app
-- surface had a catalog but no program: no class_type, no schedule_template, no gym_contact, no
-- about copy. This seed gives forge its TRUE offering so a prospect sees the real program, prices,
-- and channels, and a member books real classes — one idempotent, self-asserting DATA migration
-- (the red-demo seed pattern, 20260706160100 / 20260706230000). NO RPC / policy / schema change.
--
-- WHAT LANDS (all scoped to the forge gym, resolved by slug — never a hardcoded uuid):
--   1. 4 class_type rows — LOWER BODY, UPPER BODY, FULL BODY, CORE — 60-min functional formats.
--   2. 21 schedule_template rows, cupo 15, 60 min, NO coach links: L–V at 06:00/07:00/18:00/19:00
--      with the day's focus (Lun/Jue LOWER, Mar/Vie UPPER, Mié FULL) + Sáb 08:00 CORE. NO sessions
--      are seeded — the existing ensure_week_materialized generates them at view time (ADR-0010).
--   3. A 4th paquete — CLASE INDIVIDUAL, $150, 1 clase, 30-día vigencia — beside the live 8/12/
--      Ilimitado. `nombre` stays the ADR-0007 grant label ('1 clase'); the marketing `name` field
--      carries the "CLASE INDIVIDUAL" display title (getPlanesPublicos maps `name ?? nombre`).
--   4. gym_contact — the single 1:1 row (gym_id is its PK) populated with EXACTLY the two direct
--      channels the owner confirmed: phone +52 614 370 4989 (whatsapp field, E.164 digits) and
--      Instagram @forge_trainingfunctional (handle only — the page derives the URL). email/address/
--      hours stay null so /contacto shows ONLY those two channels ("exactly two rows" = two channels;
--      the table is 1:1 and cannot hold two rows per gym).
--   5. about_story / about_pull_quote / about_tagline + about_value / facility / stat / faq —
--      agent-drafted in Forge's functional-bootcamp voice. Stats are PLAUSIBLE PLACEHOLDERS pending
--      owner correction (the founding year especially); everything is owner-correctable from admin.
--   NO coach rows on the real forge (the owner has not confirmed staff to publish).
--
-- GUARDED + IDEMPOTENT: the whole body RAISEs if the forge gym row is missing (it must exist — this
-- is the real gym, not a sandbox), then each block inserts only when its target is still empty for
-- forge (unique keys / not-exists guards / `where … is null`), so a re-run, an out-of-order apply,
-- or an apply after a manual/partial seed never duplicates and never clobbers an owner edit. NO
-- destructive SQL anywhere. Applied to live by the owner in the batched apply step, never by an agent.

do $$
declare
  v_gym uuid;
begin
  select id into v_gym from public.gym where slug = 'forge';
  if v_gym is null then
    raise exception 'forge gym (slug=''forge'') not found — real-forge seed cannot run without it';
  end if;

  -- ── 1. class_type — the four 60-minute functional formats ────────────────────────────────────────
  -- unique (gym_id, name) makes on-conflict a no-op on re-run; a partial pre-seed only fills the gap.
  insert into public.class_type (gym_id, name, level, description, default_duration_min) values
    (v_gym, 'LOWER BODY', 'Todos los niveles',
            'Tren inferior: sentadilla, peso muerto, zancadas y potencia de cadera. Fuerza y control de piernas y glúteos.', 60),
    (v_gym, 'UPPER BODY', 'Todos los niveles',
            'Tren superior: empujes, jalones y core. Pecho, espalda, hombros y brazos con técnica antes que carga.', 60),
    (v_gym, 'FULL BODY',  'Todos los niveles',
            'Cuerpo completo: fuerza y acondicionamiento en un solo bloque. El entrenamiento funcional más metabólico de la semana.', 60),
    (v_gym, 'CORE',       'Todos los niveles',
            'Core y estabilidad: abdomen, zona media y movilidad. El cierre del sábado para blindar todo lo de la semana.', 60)
  on conflict (gym_id, name) do nothing;

  -- ── 2. schedule_template — 21 recurring weekly slots, cupo 15, 60 min, no coach links ────────────
  -- weekday 0–5 = Lun–Sáb. L–V (0–4) each run 4 slots (06/07/18/19h) with the day's focus; Sáb (5) is
  -- one 08:00 CORE. Guarded on "forge has no templates yet" so a re-run never re-seeds the block.
  if not exists (select 1 from public.schedule_template where gym_id = v_gym) then
    insert into public.schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity)
    select v_gym, ct.id, d.weekday, t.start_time, 60, 15
    from (values
      (0, 'LOWER BODY'),   -- lunes
      (1, 'UPPER BODY'),   -- martes
      (2, 'FULL BODY'),    -- miércoles
      (3, 'LOWER BODY'),   -- jueves
      (4, 'UPPER BODY')    -- viernes
    ) as d(weekday, tipo)
    cross join (values ('06:00'::time), ('07:00'::time), ('18:00'::time), ('19:00'::time)) as t(start_time)
    join public.class_type ct on ct.gym_id = v_gym and ct.name = d.tipo
    union all
    select v_gym, ct.id, 5, '08:00'::time, 60, 15
    from public.class_type ct where ct.gym_id = v_gym and ct.name = 'CORE';
  end if;

  -- ── 3. 4th paquete — CLASE INDIVIDUAL ($150, 1 clase, 30-día vigencia) ───────────────────────────
  -- `nombre` is the ADR-0007 grant label ('1 clase', clases=1); the free-text marketing `name` carries
  -- the "CLASE INDIVIDUAL" title the Precios page shows (name ?? nombre). clases=1 also tiers the CTA to
  -- the drop-in "Reservar clase" variant. orden=4 places it after the live 8/12/Ilimitado (orden 1–3).
  -- unique (gym_id, nombre) → the on-conflict no-ops on re-run.
  insert into public.paquetes (gym_id, nombre, name, clases, vigencia_tipo, vigencia_dias, precio, popular, orden)
    values (v_gym, '1 clase', 'CLASE INDIVIDUAL', 1, 'dias', 30, 150, false, 4)
  on conflict (gym_id, nombre) do nothing;

  -- ── 4. gym_contact — the single 1:1 row, exactly two channels (phone + Instagram) ────────────────
  insert into public.gym_contact (gym_id, whatsapp, instagram)
    values (v_gym, '526143704989', 'forge_trainingfunctional')
  on conflict (gym_id) do nothing;

  -- ── 5a. Nosotros "la forja" — story (paragraphs split on blank lines), pull-quote, tagline ───────
  update public.gym set about_story = $md$Forge nació de una idea simple: entrenar en serio no tiene por qué complicarse. Montamos un espacio de entrenamiento funcional en Chihuahua donde la fuerza se forja a diario — con programación que sí tiene un plan detrás y coaches que te exigen sin dejarte solo.

Nuestra semana tiene estructura: lunes y jueves piernas, martes y viernes tren superior, miércoles cuerpo completo y sábado core. Grupos chicos, cupo de 15, técnica primero y carga después. Sabes exactamente qué vas a entrenar cada día que cruzas la puerta.

No somos máquinas y espejos. Somos barras, kettlebells, sleds y sudor. Cada clase tiene un propósito, cada semana te deja algo, y cada persona que entrena aquí sale más fuerte de lo que entró.$md$
    where id = v_gym and about_story is null;
  update public.gym set about_pull_quote = 'Aquí no entrenas para verte fuerte. Entrenas para serlo.'
    where id = v_gym and about_pull_quote is null;
  update public.gym set about_tagline = 'Fuerza · Función · Comunidad'
    where id = v_gym and about_tagline is null;

  -- ── 5b. about_value — lo que nos mueve (functional-bootcamp voice) ────────────────────────────────
  if not exists (select 1 from public.about_value where gym_id = v_gym) then
    insert into public.about_value (gym_id, title, description, sort_order) values
      (v_gym, 'Función',    'Entrenamos movimientos, no músculos sueltos. Empujar, jalar, cargar, saltar: fuerza que se nota fuera del gym.', 0),
      (v_gym, 'Constancia', 'La motivación se acaba a media semana; el hábito te trae a las 6:00 aunque no tengas ganas. Por eso la semana ya está planeada por ti.', 1),
      (v_gym, 'Comunidad',  'Grupos chicos donde el coach sabe tu nombre y tus compañeros te esperan. Se entrena mejor acompañado.', 2);
  end if;

  -- ── 5c. facility — el espacio y el material (functional gym) ──────────────────────────────────────
  if not exists (select 1 from public.facility where gym_id = v_gym) then
    insert into public.facility (gym_id, name, description, sort_order) values
      (v_gym, 'Rig funcional',        'Dominadas, anillas y suspensión',    0),
      (v_gym, 'Barras y discos',      'Peso libre para fuerza pesada',      1),
      (v_gym, 'Kettlebells y mancuernas', 'Rango completo para todos los niveles', 2),
      (v_gym, 'Sleds y material',     'Trineos, cuerdas, cajones y balones', 3),
      (v_gym, 'Zona de piso',         'Espacio abierto para core y movilidad', 4);
  end if;

  -- ── 5d. stat — la forja (PLACEHOLDER stats; owner corrects the year, keeps the real ones) ────────
  -- "Clases a la semana"=21 and "Cupo por clase"=15 are REAL (they equal the seeded program above);
  -- the founding year is a plausible placeholder pending the owner's correction.
  if not exists (select 1 from public.stat where gym_id = v_gym) then
    insert into public.stat (gym_id, label, value, sort_order) values
      (v_gym, 'En la forja desde',  '2021', 0),
      (v_gym, 'Clases a la semana', '21',   1),
      (v_gym, 'Cupo por clase',     '15',   2);
  end if;

  -- ── 5e. faq — Forge-specific (program, single class, first visit, schedule) ──────────────────────
  if not exists (select 1 from public.faq where gym_id = v_gym) then
    insert into public.faq (gym_id, question, answer, sort_order) values
      (v_gym, '¿Cómo funciona el programa de la semana?',
              'Cada día tiene un enfoque: lunes y jueves LOWER BODY (piernas), martes y viernes UPPER BODY (tren superior), miércoles FULL BODY (cuerpo completo) y sábado CORE. Puedes venir a las que quieras según tu plan — la programación ya está armada para que avances parejo.', 0),
      (v_gym, '¿Puedo tomar una sola clase sin plan?',
              'Sí. La CLASE INDIVIDUAL cuesta $150 e incluye una clase con 30 días para usarla. Es la mejor forma de probar Forge; si te quedas con un plan ese mismo día, platícalo con tu coach.', 1),
      (v_gym, '¿Necesito experiencia o buena condición para empezar?',
              'No. Todas las clases son para todos los niveles y el coach escala cada ejercicio a tu punto de partida. Enseñamos técnica antes que carga: llegas como estés y avanzas desde ahí.', 2),
      (v_gym, '¿A qué horas hay clases?',
              'Lunes a viernes a las 6:00, 7:00, 18:00 y 19:00; sábado a las 8:00. Cada clase dura 60 minutos.', 3),
      (v_gym, '¿Cuántas personas hay por clase?',
              'El cupo es de 15 personas por clase, para que el coach te vea y te corrija. Reserva desde la app para apartar tu lugar.', 4),
      (v_gym, '¿Qué llevo a mi primera clase?',
              'Ropa cómoda, tenis de suela firme, una toalla y tu botella de agua. El equipo y el material los ponemos nosotros. Llega 10 minutos antes para conocer el espacio.', 5);
  end if;

  -- ── 6. Self-assert the seed landed (idempotent-safe: existence + >= thresholds, never exact =) ───
  -- These prove the migration did its job on a fresh apply and stay true on a re-run or after owner
  -- edits (a later 5th class type / faq must not fail this). The 4 named formats + 21 templates are
  -- the load-bearing program facts /reservar depends on, so they are asserted precisely.
  if (select count(*) from public.class_type
        where gym_id = v_gym and name in ('LOWER BODY', 'UPPER BODY', 'FULL BODY', 'CORE')) <> 4 then
    raise exception 'forge seed: expected the 4 named class_type formats, found a different set';
  end if;
  if (select count(*) from public.schedule_template where gym_id = v_gym) < 21 then
    raise exception 'forge seed: expected >= 21 schedule_template rows, found fewer';
  end if;
  if not exists (select 1 from public.paquetes where gym_id = v_gym and nombre = '1 clase' and precio = 150) then
    raise exception 'forge seed: CLASE INDIVIDUAL paquete ($150 / 1 clase) missing';
  end if;
  if not exists (select 1 from public.gym_contact
        where gym_id = v_gym and whatsapp = '526143704989' and instagram = 'forge_trainingfunctional') then
    raise exception 'forge seed: gym_contact row with the two confirmed channels missing';
  end if;
  if not exists (select 1 from public.about_value where gym_id = v_gym)
     or not exists (select 1 from public.facility where gym_id = v_gym)
     or not exists (select 1 from public.stat where gym_id = v_gym)
     or not exists (select 1 from public.faq where gym_id = v_gym) then
    raise exception 'forge seed: about content (values/facilities/stats/faqs) did not populate';
  end if;
end $$;
