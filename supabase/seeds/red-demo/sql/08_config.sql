-- red-demo config gaps that make screens read "empty" or "Forge".
-- gym: daa1c888-192b-4cf6-9fc0-023e314a803f

-- 1. perfil — 0 rows today ⇒ Cuenta header reads "Coach" + blank phone, and the
--    (patched) Inicio greeting reads its name from here.
insert into perfil (id, gym_id, negocio, coach, tel, ciudad)
values ('5eed0000-0000-4000-8000-000000090001', 'daa1c888-192b-4cf6-9fc0-023e314a803f', 'RED', 'Coach', '811 234 5678', 'MTY')
on conflict (gym_id) do nothing;

-- 2. cobro — 0 rows today ⇒ "DATOS DE COBRO" reads "Próximamente" and the recibo's
--    {datos_pago} token renders blank. Fake-but-well-formed CLABE (owner-only).
insert into cobro (id, gym_id, titular, banco, clabe, acepta_efectivo, acepta_transferencia, acepta_tarjeta)
values ('5eed0000-0000-4000-8000-000000090002', 'daa1c888-192b-4cf6-9fc0-023e314a803f', 'RED Studio SA de CV', 'BBVA', '012580001234567897', true, true, true)
on conflict (gym_id) do nothing;

-- 3. salas — strip the FORGE vocabulary (Yunque/Forja/Brasa) out of a RED demo,
--    and give each tipo a description (NULL ⇒ /clase silently drops "La sesión").
update class_type set sala = 'Sala Roja', description = 'Trabajo de fuerza con barra y mancuernas. Series pesadas, técnica cuidada y progresión semana a semana. Sales con más fuerza real, no con más cansancio.'
  where id = '8d781a85-8384-46a4-b393-62e5ee10b59f';
update class_type set sala = 'Zona Funcional', description = 'Circuitos de movimiento completo: empujar, jalar, cargar y desplazarte. Bajo impacto, mucha coordinación. Ideal si vuelves después de una pausa.'
  where id = '70b8bc52-cd56-41ed-ac3c-863000076b08';
update class_type set sala = 'Sala Central', description = 'Acondicionamiento metabólico de alta intensidad. Bloques cortos, descansos medidos y un cierre que se siente. Nivel intermedio y avanzado.'
  where id = '205d967f-6f0f-4e2d-8973-74f8cd27c5b0';
update class_type set sala = 'Sala Central', description = 'Sesión abierta con acompañamiento del coach. Trabajas tu propio plan con supervisión y correcciones en el momento. Perfecta para complementar tu semana.'
  where id = '3b1f31bb-254f-423a-904e-3a5f7c784b81';

-- 4. qué traer — 0 rows today ⇒ /clase silently drops the whole section.
insert into class_type_bring_item (id, gym_id, class_type_id, label, sort_order) values
('5eed0000-0000-4000-8000-000000091001','daa1c888-192b-4cf6-9fc0-023e314a803f','8d781a85-8384-46a4-b393-62e5ee10b59f','Toalla',0),
('5eed0000-0000-4000-8000-000000091002','daa1c888-192b-4cf6-9fc0-023e314a803f','8d781a85-8384-46a4-b393-62e5ee10b59f','Botella de agua',1),
('5eed0000-0000-4000-8000-000000091003','daa1c888-192b-4cf6-9fc0-023e314a803f','8d781a85-8384-46a4-b393-62e5ee10b59f','Calzado plano',2),
('5eed0000-0000-4000-8000-000000091004','daa1c888-192b-4cf6-9fc0-023e314a803f','70b8bc52-cd56-41ed-ac3c-863000076b08','Toalla',0),
('5eed0000-0000-4000-8000-000000091005','daa1c888-192b-4cf6-9fc0-023e314a803f','70b8bc52-cd56-41ed-ac3c-863000076b08','Botella de agua',1),
('5eed0000-0000-4000-8000-000000091006','daa1c888-192b-4cf6-9fc0-023e314a803f','70b8bc52-cd56-41ed-ac3c-863000076b08','Ropa cómoda',2),
('5eed0000-0000-4000-8000-000000091007','daa1c888-192b-4cf6-9fc0-023e314a803f','205d967f-6f0f-4e2d-8973-74f8cd27c5b0','Toalla',0),
('5eed0000-0000-4000-8000-000000091008','daa1c888-192b-4cf6-9fc0-023e314a803f','205d967f-6f0f-4e2d-8973-74f8cd27c5b0','Botella de agua',1),
('5eed0000-0000-4000-8000-000000091009','daa1c888-192b-4cf6-9fc0-023e314a803f','205d967f-6f0f-4e2d-8973-74f8cd27c5b0','Cambio de playera',2),
('5eed0000-0000-4000-8000-000000091010','daa1c888-192b-4cf6-9fc0-023e314a803f','3b1f31bb-254f-423a-904e-3a5f7c784b81','Toalla',0),
('5eed0000-0000-4000-8000-000000091011','daa1c888-192b-4cf6-9fc0-023e314a803f','3b1f31bb-254f-423a-904e-3a5f7c784b81','Botella de agua',1),
('5eed0000-0000-4000-8000-000000091012','daa1c888-192b-4cf6-9fc0-023e314a803f','3b1f31bb-254f-423a-904e-3a5f7c784b81','Tu rutina',2);

-- 5. coach bios — NULL ⇒ the /clase coach card renders a name with no substance.
update coach set bio = 'Entrenadora de fuerza con ocho años en piso. Le obsesiona la técnica: prefiere una repetición perfecta a diez apuradas.' where id = '57e35af8-dce8-411d-82fe-80ea37f85522';
update coach set bio = 'Especialista en movimiento funcional. Trabaja con quienes vuelven al gimnasio después de una lesión o una pausa larga.' where id = '0f332962-2757-44c9-82ba-67074fb1e006';
update coach set bio = 'Viene del atletismo. Diseña los metcon de la semana y lleva el ritmo de la clase de principio a fin.' where id = 'b84ebc0f-63e1-41a5-8592-04cdd155c0d0';

-- 6. mensajes de contacto — 0 rows ⇒ Cuenta reads "Sin mensajes". 2 unread.
insert into contact_message (id, gym_id, nombre, correo, mensaje, read_at, created_at) values
('5eed0000-0000-4000-8000-000000092001','daa1c888-192b-4cf6-9fc0-023e314a803f','Lorena Sáenz','lorena.saenz@red-demo.test','Hola, ¿tienen clase de funcional los sábados por la mañana? Me interesa empezar este mes.', null, (timestamp '2026-07-13 21:14' at time zone 'America/Chihuahua')),
('5eed0000-0000-4000-8000-000000092002','daa1c888-192b-4cf6-9fc0-023e314a803f','Jorge Medina','jorge.medina@red-demo.test','Buenas, quiero información de precios para dos personas. ¿Manejan algún plan de pareja?', null, (timestamp '2026-07-12 10:02' at time zone 'America/Chihuahua')),
('5eed0000-0000-4000-8000-000000092003','daa1c888-192b-4cf6-9fc0-023e314a803f','Cecilia Ramos','cecilia.ramos@red-demo.test','¿Cuál es el horario de la clase de Metcon? Trabajo hasta las 6 y quiero alcanzarla.', (timestamp '2026-07-10 09:30' at time zone 'America/Chihuahua'), (timestamp '2026-07-09 19:47' at time zone 'America/Chihuahua')),
('5eed0000-0000-4000-8000-000000092004','daa1c888-192b-4cf6-9fc0-023e314a803f','Andrés Beltrán','andres.beltran@red-demo.test','Me recomendó una amiga. ¿Puedo ir a una clase de prueba antes de comprar paquete?', (timestamp '2026-07-07 08:15' at time zone 'America/Chihuahua'), (timestamp '2026-07-06 22:31' at time zone 'America/Chihuahua')),
('5eed0000-0000-4000-8000-000000092005','daa1c888-192b-4cf6-9fc0-023e314a803f','Paulina Ibarra','paulina.ibarra@red-demo.test','¿Tienen estacionamiento? Vengo desde el otro lado de la ciudad y quiero llegar a la de 7am.', (timestamp '2026-07-02 11:05' at time zone 'America/Chihuahua'), (timestamp '2026-07-01 18:22' at time zone 'America/Chihuahua'));

-- 7. the member app's Perfil name comes from the JWT, NOT clientes.nombre.
update auth.users set raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data,'{}'::jsonb), '{full_name}', '"Aarón Talavera"')
  where id = 'd7164b62-11aa-422b-ad5d-a8e92f5dc971';
update auth.users set raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data,'{}'::jsonb), '{full_name}', '"Daniel Bustamante"')
  where id = '0112b173-7465-417b-90d5-f313652473c8';
