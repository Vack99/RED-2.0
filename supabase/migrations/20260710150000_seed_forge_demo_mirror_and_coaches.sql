-- forge-demo mirror — real-forge program + demo coaches + client host — slice #87 (PRD #83).
--
-- forge-demo is the LIVE operator-testing sandbox twin (slug 'forge-demo', seeded AD HOC in slice #5 /
-- 20260702231021, NOT by migrations — so it does NOT exist on a fresh scratch project). This seed makes
-- the whole Forge client experience walkable end-to-end on the twin WITHOUT touching the real gym:
--   1. mirrors everything real forge got in #86 (20260710140000) — the 4 functional class_types, the 21
--      recurring templates, the CLASE INDIVIDUAL paquete, the two gym_contact channels, and the Forge-voice
--      Nosotros content — reusing #86's copy and conventions verbatim (do not re-derive);
--   2. adds what real forge deliberately LACKS — 3 agent-drafted demo coaches (red-demo roster pattern,
--      20260706160100) — so the coach-roster screen is walkable on the twin only;
--   3. retires forge-demo's pre-existing sandbox templates (Crossfit / Testing Classes) NON-destructively —
--      is_active=false, the mechanism ensure_week_materialized (20260706130000) already reads — so the demo
--      surfaces the REAL program going forward while every historical session/asistencia stays untouched
--      (class_session rows are independent once written, §5.3; nothing is deleted);
--   4. maps a forge-demo CLIENT host for dev (forge-demo-client.localhost), mirroring red-demo's
--      red-demo-client.localhost (20260706160100). The prod client host (forge-demo.ibookit.lat) already
--      exists from the ibookit host-map (20260709090000); its Vercel domain attach is the HITL gate's step.
--
-- GUARDED + IDEMPOTENT (red-demo seed pattern): the whole body no-ops unless the forge-demo gym row exists
-- (RAISE NOTICE + RETURN — so it is INERT on scratch and on any fresh clone, unlike #86's real-forge seed
-- which RAISEs because forge must exist), then each block inserts only when its target is still empty for
-- forge-demo (unique keys / not-exists guards / `where … is null`) and the retirement flips only rows still
-- active, so a re-run, an out-of-order apply, or an apply after a manual/partial seed never duplicates and
-- never clobbers an owner edit. NO destructive SQL anywhere — no row is ever DELETEd. Applied to live by the
-- owner in the batched apply step, never by an agent. No RPC / policy / schema change → the denial suite
-- proves regression, no new suite.

do $$
declare
  v_gym uuid;
begin
  select id into v_gym from public.gym where slug = 'forge-demo';
  if v_gym is null then
    raise notice 'forge-demo not present — mirror/coach seed skipped (expected on scratch/fresh clones)';
    return;
  end if;

  -- ── 1. class_type — the four 60-minute functional formats (mirror #86) ───────────────────────────────
  -- unique (gym_id, name) makes on-conflict a no-op on re-run; the pre-existing sandbox class_types
  -- (Crossfit / Testing Classes) are left in place — this ADDS the real program beside them.
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

  -- ── 2. Retire the pre-existing sandbox templates NON-destructively (is_active=false) ─────────────────
  -- The 9 sandbox templates (Crossfit / Testing Classes) stop materializing FUTURE sessions the instant
  -- is_active flips false (ensure_week_materialized filters `and is_active`), so the demo surfaces the
  -- real program going forward. The template ROWS survive (no DELETE), and every session/asistencia they
  -- already materialized is an independent row that is never touched. Scoped to templates NOT in the four
  -- mirror formats so it can never retire the program this same migration seeds; re-run flips nothing new.
  update public.schedule_template
    set is_active = false
    where gym_id = v_gym and is_active
      and class_type_id not in (
        select id from public.class_type
        where gym_id = v_gym and name in ('LOWER BODY', 'UPPER BODY', 'FULL BODY', 'CORE'));

  -- ── 3. schedule_template — 21 recurring weekly slots, cupo 15, 60 min, no coach links (mirror #86) ───
  -- weekday 0–5 = Lun–Sáb. L–V (0–4) each run 4 slots (06/07/18/19h) with the day's focus; Sáb (5) is one
  -- 08:00 CORE. Guarded on "forge-demo has no mirror templates yet" (join to the four named formats — NOT
  -- a bare `no templates` guard, since the retired sandbox rows still exist), so a re-run never re-seeds.
  if not exists (
    select 1 from public.schedule_template st
    join public.class_type ct on ct.id = st.class_type_id
    where st.gym_id = v_gym and ct.name in ('LOWER BODY', 'UPPER BODY', 'FULL BODY', 'CORE')
  ) then
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

  -- ── 4. 4th paquete — CLASE INDIVIDUAL ($150, 1 clase, 30-día vigencia) (mirror #86) ──────────────────
  -- `nombre` is the ADR-0007 grant label ('1 clase', clases=1); the marketing `name` carries the display
  -- title (name ?? nombre). unique (gym_id, nombre) → the on-conflict no-ops on re-run.
  insert into public.paquetes (gym_id, nombre, name, clases, vigencia_tipo, vigencia_dias, precio, popular, orden)
    values (v_gym, '1 clase', 'CLASE INDIVIDUAL', 1, 'dias', 30, 150, false, 4)
  on conflict (gym_id, nombre) do nothing;

  -- ── 5. gym_contact — the single 1:1 row, exactly two channels (phone + Instagram) (mirror #86) ───────
  insert into public.gym_contact (gym_id, whatsapp, instagram)
    values (v_gym, '526143704989', 'forge_trainingfunctional')
  on conflict (gym_id) do nothing;

  -- ── 6a. Nosotros "la forja" — story, pull-quote, tagline (mirror #86 copy) ───────────────────────────
  update public.gym set about_story = $md$Forge nació de una idea simple: entrenar en serio no tiene por qué complicarse. Montamos un espacio de entrenamiento funcional en Chihuahua donde la fuerza se forja a diario — con programación que sí tiene un plan detrás y coaches que te exigen sin dejarte solo.

Nuestra semana tiene estructura: lunes y jueves piernas, martes y viernes tren superior, miércoles cuerpo completo y sábado core. Grupos chicos, cupo de 15, técnica primero y carga después. Sabes exactamente qué vas a entrenar cada día que cruzas la puerta.

No somos máquinas y espejos. Somos barras, kettlebells, sleds y sudor. Cada clase tiene un propósito, cada semana te deja algo, y cada persona que entrena aquí sale más fuerte de lo que entró.$md$
    where id = v_gym and about_story is null;
  update public.gym set about_pull_quote = 'Aquí no entrenas para verte fuerte. Entrenas para serlo.'
    where id = v_gym and about_pull_quote is null;
  update public.gym set about_tagline = 'Fuerza · Función · Comunidad'
    where id = v_gym and about_tagline is null;

  -- ── 6b. about_value — lo que nos mueve (mirror #86 copy) ─────────────────────────────────────────────
  if not exists (select 1 from public.about_value where gym_id = v_gym) then
    insert into public.about_value (gym_id, title, description, sort_order) values
      (v_gym, 'Función',    'Entrenamos movimientos, no músculos sueltos. Empujar, jalar, cargar, saltar: fuerza que se nota fuera del gym.', 0),
      (v_gym, 'Constancia', 'La motivación se acaba a media semana; el hábito te trae a las 6:00 aunque no tengas ganas. Por eso la semana ya está planeada por ti.', 1),
      (v_gym, 'Comunidad',  'Grupos chicos donde el coach sabe tu nombre y tus compañeros te esperan. Se entrena mejor acompañado.', 2);
  end if;

  -- ── 6c. facility — el espacio y el material (mirror #86 copy) ────────────────────────────────────────
  if not exists (select 1 from public.facility where gym_id = v_gym) then
    insert into public.facility (gym_id, name, description, sort_order) values
      (v_gym, 'Rig funcional',        'Dominadas, anillas y suspensión',    0),
      (v_gym, 'Barras y discos',      'Peso libre para fuerza pesada',      1),
      (v_gym, 'Kettlebells y mancuernas', 'Rango completo para todos los niveles', 2),
      (v_gym, 'Sleds y material',     'Trineos, cuerdas, cajones y balones', 3),
      (v_gym, 'Zona de piso',         'Espacio abierto para core y movilidad', 4);
  end if;

  -- ── 6d. stat — la forja (PLACEHOLDER stats; owner corrects the year) (mirror #86 copy) ───────────────
  if not exists (select 1 from public.stat where gym_id = v_gym) then
    insert into public.stat (gym_id, label, value, sort_order) values
      (v_gym, 'En la forja desde',  '2021', 0),
      (v_gym, 'Clases a la semana', '21',   1),
      (v_gym, 'Cupo por clase',     '15',   2);
  end if;

  -- ── 6e. faq — Forge-specific (mirror #86 copy) ──────────────────────────────────────────────────────
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

  -- ── 7. Demo coaches — 3 roster rows, forge-demo ONLY (red-demo roster pattern; real forge has none) ──
  -- Agent-drafted, Forge functional-bootcamp voice. No template links (a roster, mirroring red-demo's
  -- coaches): the coach-roster screen becomes walkable on the twin without naming staff on the real gym.
  -- Guarded on "no coaches yet" so a re-run never duplicates.
  if not exists (select 1 from public.coach where gym_id = v_gym) then
    insert into public.coach (gym_id, name, initials, role, specialty, is_active, sort_order) values
      (v_gym, 'Diego Fuentes',  'DF', 'Head Coach', 'Fuerza',    true, 0),
      (v_gym, 'Renata Salas',   'RS', 'Coach',      'Funcional', true, 1),
      (v_gym, 'Emilio Cordero', 'EC', 'Coach',      'Metcon',    true, 2);
  end if;

  -- ── 8. Client-app host row (dev). Mirrors red-demo-client.localhost; the prod forge-demo.ibookit.lat ─
  -- client host already exists from the ibookit host-map (20260709090000). on-conflict(hostname) keeps a
  -- re-apply and any pre-existing row safe.
  insert into public.gym_domain (gym_id, hostname, app)
    values (v_gym, 'forge-demo-client.localhost', 'client')
    on conflict (hostname) do nothing;

  -- ── 9. Self-assert the mirror landed (idempotent-safe: existence + >= thresholds + retirement state) ─
  -- Runs ONLY on live (v_gym is not null past the early return). Stays true on a re-run and after owner
  -- edits (a later 5th format / faq must not fail these); the load-bearing program facts are asserted precisely.
  if (select count(*) from public.class_type
        where gym_id = v_gym and name in ('LOWER BODY', 'UPPER BODY', 'FULL BODY', 'CORE')) <> 4 then
    raise exception 'forge-demo seed: expected the 4 named class_type formats, found a different set';
  end if;
  if (select count(*) from public.schedule_template st
        join public.class_type ct on ct.id = st.class_type_id
        where st.gym_id = v_gym and st.is_active
          and ct.name in ('LOWER BODY', 'UPPER BODY', 'FULL BODY', 'CORE')) < 21 then
    raise exception 'forge-demo seed: expected >= 21 active mirror schedule_template rows, found fewer';
  end if;
  -- Retirement is NON-destructive: no sandbox template still materializes (0 active non-mirror), AND the
  -- retired rows still EXIST (were flipped, not deleted) so their historical sessions keep their provenance.
  if exists (select 1 from public.schedule_template st
        join public.class_type ct on ct.id = st.class_type_id
        where st.gym_id = v_gym and st.is_active
          and ct.name not in ('LOWER BODY', 'UPPER BODY', 'FULL BODY', 'CORE')) then
    raise exception 'forge-demo seed: a pre-existing sandbox template is still active (retirement failed)';
  end if;
  if not exists (select 1 from public.paquetes where gym_id = v_gym and nombre = '1 clase' and precio = 150) then
    raise exception 'forge-demo seed: CLASE INDIVIDUAL paquete ($150 / 1 clase) missing';
  end if;
  if not exists (select 1 from public.gym_contact
        where gym_id = v_gym and whatsapp = '526143704989' and instagram = 'forge_trainingfunctional') then
    raise exception 'forge-demo seed: gym_contact row with the two confirmed channels missing';
  end if;
  if (select count(*) from public.coach where gym_id = v_gym) < 3 then
    raise exception 'forge-demo seed: expected >= 3 demo coaches, found fewer';
  end if;
  if not exists (select 1 from public.about_value where gym_id = v_gym)
     or not exists (select 1 from public.facility where gym_id = v_gym)
     or not exists (select 1 from public.stat where gym_id = v_gym)
     or not exists (select 1 from public.faq where gym_id = v_gym) then
    raise exception 'forge-demo seed: about content (values/facilities/stats/faqs) did not populate';
  end if;
  if not exists (select 1 from public.gym_domain
        where gym_id = v_gym and hostname = 'forge-demo-client.localhost' and app = 'client') then
    raise exception 'forge-demo seed: client host row missing';
  end if;
end $$;
