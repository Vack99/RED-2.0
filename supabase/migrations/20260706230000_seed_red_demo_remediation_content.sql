-- red-demo remediation content seed — RED client design-fidelity follow-up
-- (docs/planning/2026-07-06-red-client-design-remediation.md §4; continues
-- 20260706160100_seed_red_demo_client_and_content). The 20260706220000 schema touch added
-- three display-only homes — gym.about_story/about_pull_quote/about_tagline, paquetes.nota,
-- class_type_workblock.value — but left them empty, so red-demo's Nosotros story, Precios
-- per-plan notes, and Clase "Qué trabajamos" segments fell back to their empty states. This
-- fills them for the LIVE red-demo sandbox. Copy in RED brand voice, matching the approved mock.
--
-- GUARDED + IDEMPOTENT: no-ops unless a gym with slug 'red-demo' exists (inert on scratch +
-- fresh clones). about_*/nota fill only when still null (never clobber operator edits); the
-- workblocks insert only when red-demo has none. NO destructive SQL; safe to re-apply and safe
-- out-of-order on live. (Already applied to live in the 2026-07-06 interactive session; this
-- file captures it so a fresh scratch/clone reproduces the same sandbox content.)

do $$
declare
  v_gym uuid;
begin
  select id into v_gym from public.gym where slug = 'red-demo';
  if v_gym is null then
    raise notice 'red-demo not present — remediation content seed skipped (expected on scratch/fresh clones)';
    return;
  end if;

  -- Nosotros "la fragua" — story (paragraphs split on blank lines), pull-quote, neon tagline.
  update public.gym set about_story = $md$RED nació de una idea simple: entrenar en serio no tiene por qué ser aburrido. Montamos un estudio funcional donde la fuerza se forja a diario, con programación que sí tiene un plan detrás y coaches que te exigen sin dejarte solo.

No somos máquinas y espejos. Somos barras, anillos, cuerda y sudor — grupos chicos, técnica primero y una comunidad que llega temprano y se queda hasta apagar la última brasa.

Cada clase tiene un propósito. Cada semana te deja algo. Y cada socio que cruza la puerta sale más fuerte de lo que entró.$md$
    where id = v_gym and about_story is null;
  update public.gym set about_pull_quote = 'Aquí no entrenas para verte fuerte. Entrenas para serlo.'
    where id = v_gym and about_pull_quote is null;
  update public.gym set about_tagline = 'Fuerza · Disciplina · Comunidad'
    where id = v_gym and about_tagline is null;

  -- Precios per-plan notes (paquetes.nota), matched by the plan's display order.
  update public.paquetes set nota = 'Ideal para 2 sesiones por semana.'   where gym_id = v_gym and orden = 1 and nota is null;
  update public.paquetes set nota = 'Tu mejor ritmo: 3 clases por semana.' where gym_id = v_gym and orden = 2 and nota is null;
  update public.paquetes set nota = 'Sin límites. Entrena todos los días.' where gym_id = v_gym and orden = 3 and nota is null;

  -- Clase "Qué trabajamos" — ordered label + value segments per class type (insert only if none).
  if not exists (select 1 from public.class_type_workblock where gym_id = v_gym) then
    insert into public.class_type_workblock (gym_id, class_type_id, label, value, sort_order)
    select v_gym, ct.id, b.label, b.value, b.sort_order
    from public.class_type ct
    join (values
      ('Fuerza',   'Calentamiento',      '10 min movilidad',          0),
      ('Fuerza',   'Fuerza principal',   'Sentadilla / Peso muerto',  1),
      ('Fuerza',   'Trabajo accesorio',  '3–4 series',                2),
      ('Fuerza',   'Core y cierre',      '8 min',                     3),
      ('Funcional','Calentamiento',      '8 min',                     0),
      ('Funcional','Circuito funcional', '4 estaciones',              1),
      ('Funcional','Fuerza + cardio',    'AMRAP 12',                  2),
      ('Funcional','Estiramiento',       '5 min',                     3),
      ('Metcon',   'Activación',         '8 min',                     0),
      ('Metcon',   'Fuerza rápida',      'EMOM 10',                   1),
      ('Metcon',   'Metcon',             'AMRAP 15',                  2),
      ('Metcon',   'Cierre',             '5 min quema',               3),
      ('Open',     'Calentamiento libre','10 min',                    0),
      ('Open',     'Trabajo guiado',     'A tu ritmo',                1),
      ('Open',     'WOD del día',        '20 min',                    2),
      ('Open',     'Movilidad',          '8 min',                     3)
    ) as b(tipo, label, value, sort_order) on b.tipo = ct.name
    where ct.gym_id = v_gym;
  end if;
end $$;
