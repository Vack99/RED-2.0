-- red-demo contact-details seed — slice #53 (PRD #49 S1; continuation of 20260706160100).
--
-- Seeds the single gym_contact row for the RED sandbox gym so the Contacto page renders real data on
-- red-demo — copy + coordinates drawn from the approved RED mock's Contacto slot (address, locator note,
-- map pin, the three direct channels, and the Lun–Sáb 05:30–22:00 / Domingo cerrado hours).
--
-- GUARDED + IDEMPOTENT: no-ops unless a gym with slug 'red-demo' exists (inert on scratch/fresh clones)
-- and only when gym_contact is still empty for red-demo (re-apply / apply-after-manual-seed never
-- duplicates). NO destructive SQL; safe to re-apply and safe out-of-order on live. Applied to live by the
-- owner in the batched apply step, never by this agent.

do $$
declare
  v_gym uuid;
begin
  select id into v_gym from public.gym where slug = 'red-demo';
  if v_gym is null then
    raise notice 'red-demo not present — contact seed skipped (expected on scratch/fresh clones)';
    return;
  end if;

  if not exists (select 1 from public.gym_contact where gym_id = v_gym) then
    insert into public.gym_contact
      (gym_id, address_line, address_note, latitude, longitude, whatsapp, email, instagram, hours)
    values (
      v_gym,
      'Av. de la Fragua 124, Col. Acero, Monterrey, N.L.',
      'Estacionamiento sobre la avenida · entrada por el portón de acero. A 5 min del centro de Monterrey.',
      25.6866, -100.3161,
      '528112345678',
      'hola@red-demo.mx',
      'red.demo',
      jsonb_build_array(
        jsonb_build_object('day', 'Lunes',     'opens', '05:30', 'closes', '22:00'),
        jsonb_build_object('day', 'Martes',    'opens', '05:30', 'closes', '22:00'),
        jsonb_build_object('day', 'Miércoles', 'opens', '05:30', 'closes', '22:00'),
        jsonb_build_object('day', 'Jueves',    'opens', '05:30', 'closes', '22:00'),
        jsonb_build_object('day', 'Viernes',   'opens', '05:30', 'closes', '22:00'),
        jsonb_build_object('day', 'Sábado',    'opens', '05:30', 'closes', '22:00'),
        jsonb_build_object('day', 'Domingo',   'closed', true)
      )
    );
  end if;
end $$;
