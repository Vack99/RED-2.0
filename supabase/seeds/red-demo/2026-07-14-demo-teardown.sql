-- ============================================================================
-- TEARDOWN — showcase seed for gym `red-demo` (daa1c888-192b-4cf6-9fc0-023e314a803f)
-- Seeded 2026-07-14 for the RED owner demo. Run this to put the gym back.
--
-- Every row the seed CREATED carries an id in the 5eed0000-… namespace, so it
-- deletes by prefix. Rows the seed MODIFIED are restored below from a snapshot
-- taken immediately before the seed ran.
--
-- Scope: this gym only. forge, forge-demo and red are never touched.
-- Run via the Supabase MCP (execute_sql). Safe to run twice.
-- ============================================================================

-- 1. Drop everything the seed created (children first) ------------------------
delete from asistencias           where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f' and id::text like '5eed0000-%';
delete from reservation           where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f' and id::text like '5eed0000-%';
delete from ventas                where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f' and id::text like '5eed0000-%';
delete from class_session         where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f' and id::text like '5eed0000-%'; -- cascades class_session_coach
delete from schedule_template_week  where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f'
  and week_start between '2026-06-01' and '2026-08-10';  -- unclaim, so the app can re-materialise normally
delete from schedule_template_coach where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f' and template_id::text like '5eed0000-%';
delete from schedule_template     where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f' and id::text like '5eed0000-%';
delete from clientes              where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f' and id::text like '5eed0000-%';
delete from class_type_bring_item where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f' and id::text like '5eed0000-%';
delete from contact_message       where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f' and id::text like '5eed0000-%';
delete from perfil                where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f' and id::text like '5eed0000-%';
delete from cobro                 where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f' and id::text like '5eed0000-%';

-- 2. Restore the 4 pre-existing clientes (the seed renamed them into personas).
--    auth_user_id / claim_code / phone_e164 were never touched — the logins hold.
update clientes set nombre='Testing for client app email access', created_at='2026-07-09T07:58:46.594997+00'::timestamptz,
       paquete_nombre='8 clases', clases_restantes=19, vence='2026-09-07', birthday=null, favorite_class_type_id=null
 where id='a1a27405-119b-4164-9321-e68dbe769d6c';
update clientes set nombre='Testing1D3', created_at='2026-07-10T07:12:18.660007+00'::timestamptz,
       paquete_nombre='Ilimitado', clases_restantes=null, vence='2026-11-07', birthday=null, favorite_class_type_id=null
 where id='dca112e6-e6dd-4ace-8da6-2f83218051af';
update clientes set nombre='Testing Ticket Logo imp', created_at='2026-07-14T01:47:37.749789+00'::timestamptz,
       paquete_nombre='Personalizado', clases_restantes=null, vence='2026-08-12', birthday=null, favorite_class_type_id=null
 where id='1dcedae7-126f-4a48-aab9-ee72509440a7';
update clientes set nombre='Testing email registration', created_at='2026-07-14T02:17:52.579772+00'::timestamptz,
       paquete_nombre='Ilimitado', clases_restantes=null, vence='2026-08-12', birthday=null, favorite_class_type_id=null
 where id='e3503dab-ffa1-40d6-b113-3d4ec7be68b1';

-- 3. Restore the 8 test ventas the seed deleted (verbatim: ids, folios, amounts,
--    timestamps, idempotency keys).
insert into ventas (id, gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at, idempotency_key, personalizado) values
('8d2fc991-0e3c-4c9e-9aa0-3ec74905a14e','daa1c888-192b-4cf6-9fc0-023e314a803f','a1a27405-119b-4164-9321-e68dbe769d6c',1002,'12 clases',12,'dias',30,1199,'efectivo','2026-07-09T07:58:46.594997+00','2026-07-09T07:58:46.594997+00',null,false),
('72af729b-e8a1-48ed-a5bf-4002911481e3','daa1c888-192b-4cf6-9fc0-023e314a803f','dca112e6-e6dd-4ace-8da6-2f83218051af',1005,'8 clases',8,'dias',30,799,'efectivo','2026-07-10T07:32:02.283746+00','2026-07-10T07:32:02.283746+00',null,false),
('ffeaacf0-732a-4ff0-a2aa-b36b444e1ca6','daa1c888-192b-4cf6-9fc0-023e314a803f','dca112e6-e6dd-4ace-8da6-2f83218051af',1006,'8 clases',8,'dias',30,799,'efectivo','2026-07-10T20:53:56.913434+00','2026-07-10T20:53:56.913434+00','e3de6cad-dada-4b3f-a793-9848234b0a55',false),
('1393c484-efe9-48c2-9c2e-360196c955a7','daa1c888-192b-4cf6-9fc0-023e314a803f','1dcedae7-126f-4a48-aab9-ee72509440a7',1008,'Personalizado',null,'dias',30,3000,'transferencia','2026-07-14T01:47:37.749789+00','2026-07-14T01:47:37.749789+00','a9b89dd6-41fb-4e2c-888e-1e6ee7cdab7d',true),
('8a6d9a16-4eb3-4aa0-b9bf-e6e2f5dc3184','daa1c888-192b-4cf6-9fc0-023e314a803f','e3503dab-ffa1-40d6-b113-3d4ec7be68b1',1009,'Ilimitado',null,'dias',30,1350,'efectivo','2026-07-14T02:17:52.579772+00','2026-07-14T02:17:52.579772+00','59090929-5f3e-4fb7-a2dc-b2958a58736f',false),
('346b8694-976f-4ae4-87b7-0a9b2f30114d','daa1c888-192b-4cf6-9fc0-023e314a803f','dca112e6-e6dd-4ace-8da6-2f83218051af',1010,'Ilimitado',null,'dias',30,1350,'tarjeta','2026-07-14T06:14:59.960681+00','2026-07-14T06:14:59.960681+00','ebf6b291-f8fe-4195-9448-96ff6a3082e1',false),
('1b1d4e28-a479-4207-b437-704860f3deb9','daa1c888-192b-4cf6-9fc0-023e314a803f','dca112e6-e6dd-4ace-8da6-2f83218051af',1011,'Ilimitado',null,'dias',30,1350,'efectivo','2026-07-14T06:22:26.029177+00','2026-07-14T06:22:26.029177+00','11ae0c7f-f415-486f-8573-23e6e6d1605f',false),
('e759fe64-1049-4994-9c8a-0516b3d35806','daa1c888-192b-4cf6-9fc0-023e314a803f','a1a27405-119b-4164-9321-e68dbe769d6c',1012,'8 clases',8,'dias',30,799,'efectivo','2026-07-14T06:47:16.839728+00','2026-07-14T06:47:16.839728+00','548dc022-1677-4f1a-aee9-8f74a7d8badb',false)
on conflict (id) do nothing;

update gym_folio_counter set last_folio = 1012 where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f';

-- NOT restored, deliberately: the 1 stale `reservada` row on a past session and
-- the 1 already-soft-deleted asistencia. Both hung off a class_session that the
-- seed replaced, and both were junk (a never-marked ghost booking + a deleted
-- attendance). Say so rather than resurrect them.

-- 4. Restore config the seed overwrote --------------------------------------
update class_type set sala='Sala Yunque', description=null where id='8d781a85-8384-46a4-b393-62e5ee10b59f';
update class_type set sala='Sala Forja',  description=null where id='70b8bc52-cd56-41ed-ac3c-863000076b08';
update class_type set sala='Sala Brasa',  description=null where id='205d967f-6f0f-4e2d-8973-74f8cd27c5b0';
update class_type set sala='Sala Brasa',  description=null where id='3b1f31bb-254f-423a-904e-3a5f7c784b81';

update coach set bio=null where id in (
  '57e35af8-dce8-411d-82fe-80ea37f85522',
  '0f332962-2757-44c9-82ba-67074fb1e006',
  'b84ebc0f-63e1-41a5-8592-04cdd155c0d0');

update auth.users set raw_user_meta_data = jsonb_set(raw_user_meta_data,'{full_name}','"Testing for client app email access"')
 where id='d7164b62-11aa-422b-ad5d-a8e92f5dc971';
update auth.users set raw_user_meta_data = jsonb_set(raw_user_meta_data,'{full_name}','"Testing1D3"')
 where id='0112b173-7465-417b-90d5-f313652473c8';

-- 5. Check: everything below must be 0 except clientes=4 / ventas=8 -----------
select
 (select count(*) from clientes    where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f') clientes,        -- 4
 (select count(*) from ventas      where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f') ventas,          -- 8
 (select count(*) from asistencias where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f') asistencias,     -- 0
 (select count(*) from reservation where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f') reservas,        -- 0
 (select count(*) from class_session     where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f') sesiones,  -- 1 (Reto RED)
 (select count(*) from schedule_template where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f') plantillas,-- 5
 (select count(*) from perfil      where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f') perfil,          -- 0
 (select count(*) from cobro       where gym_id='daa1c888-192b-4cf6-9fc0-023e314a803f') cobro;           -- 0
