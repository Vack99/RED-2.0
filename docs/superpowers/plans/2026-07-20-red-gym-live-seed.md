# RED gym live-seed — execution plan

> **Runbook, not a code plan.** Each "task" is a stage run through the Supabase MCP
> `execute_sql` against **live prod** (`hjppxawglmukfvsgmcog`). Every stage is one
> `BEGIN … COMMIT`, opens with a `gym_id` firewall, ends with a verification `SELECT`
> whose expected output is shown, and carries a rollback. Execute stage-by-stage with
> the owner's go-ahead between stages.

**Goal:** Seed the empty prod `red` tenant into a working gym for its real owner — owner login, plans, classes, schedule, config now; real member roster last (19 seedable now with contact info; 9 blocked on phone numbers, second pass).

**Architecture:** Data seed via `execute_sql` (never `apply_migration` — seeds stay out of migration history). All writes hard-scoped to `gym_id = ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9`. Sessions materialized by direct insert (the prod RPCs are `SECURITY INVOKER` and unusable without a JWT). No fabricated history.

**Spec:** `docs/superpowers/specs/2026-07-20-red-gym-live-seed-design.md`

## Global constants

| name | value |
|---|---|
| `GYM` (red) | `ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9` |
| `TZ` | `America/Chihuahua` |
| owner email | `narda_m11@hotmail.com` |
| owner password | `<<OWNER_PASSWORD>>` (in-session only — never written to this file) |
| capacity (all slots) | `8` |
| sale method (all) | `efectivo` |
| plan validity | `dias` / 30 (Ilimitado = `clases NULL`, matches red-demo) |
| session horizon | 6 weeks from the current gym-local Monday |

**Constraint floor (DB-enforced):** `tel` 10 digits · `clases` NULL or 1–30 · `vigencia_tipo='mes' ⇔ vigencia_dias NULL` · one `popular` per gym · `weekday` 0–5 · `duration_min ∈ {30,45,60,75,90}` · `capacity` 4–40 · `metodo ∈ {efectivo,transferencia,tarjeta}` · unique `(gym_id,folio)`, `(gym_id,nombre)` paquetes, `(gym_id,name)` class_type, `(template_id,starts_at)` session · `role ∈ {owner,operator,member}`.

**Pre-flight (once, before Stage 1):** confirm backup posture. Every Stage 1–4 write is a pure INSERT into an empty gym plus one `NULL→value` update on the `red` row — fully reversible via each stage's rollback. A `pg_dump` is belt-and-suspenders; run it if PITR isn't on.

---

### Stage 1 — Owner account

**Writes:** `auth.users` (1) + `auth.identities` (1) + `gym_membership` (1) + `gym.owner_user_id`.

```sql
begin;
do $$
declare
  v_gym   uuid := 'ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9';
  v_email text := 'narda_m11@hotmail.com';
  v_pass  text := '<<OWNER_PASSWORD>>';
  v_uid   uuid := gen_random_uuid();
begin
  -- FIREWALL
  if not exists (select 1 from gym where id=v_gym and slug='red' and brand_module_id='red')
    then raise exception 'FIREWALL: % is not the RED tenant', v_gym; end if;
  if exists (select 1 from gym where id=v_gym and owner_user_id is not null)
    then raise exception 'FIREWALL: RED already has an owner'; end if;
  if exists (select 1 from auth.users where email=v_email)
    then raise exception 'FIREWALL: user % already exists', v_email; end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    extensions.crypt(v_pass, extensions.gen_salt('bf', 10)),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"email_verified":true}'::jsonb,
    '', '', '', '',
    false, false
  );

  insert into auth.identities (
    id, user_id, provider, provider_id, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid, 'email', v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    now(), now(), now()
  );

  insert into gym_membership (user_id, gym_id, role) values (v_uid, v_gym, 'owner');
  update gym set owner_user_id = v_uid where id = v_gym;
end $$;
commit;
```

**Verify** (expect one row: `confirmed=t`, `pw_ok=t`, `provider=email`, `role=owner`, `gym_owner_set=t`):
```sql
select u.email,
       u.email_confirmed_at is not null as confirmed,
       (u.encrypted_password = extensions.crypt('<<OWNER_PASSWORD>>', u.encrypted_password)) as pw_ok,
       i.provider, gm.role,
       (g.owner_user_id = u.id) as gym_owner_set
from auth.users u
join auth.identities i on i.user_id = u.id
join gym_membership gm on gm.user_id = u.id and gm.gym_id = 'ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9'
join gym g on g.id = gm.gym_id
where u.email = 'narda_m11@hotmail.com';
```
Then a real login smoke test on `red-admin.ibookit.lat` (owner-driven).

**Rollback:**
```sql
begin;
update gym set owner_user_id = null where id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9';
delete from gym_membership where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9'
  and user_id=(select id from auth.users where email='narda_m11@hotmail.com');
delete from auth.identities where user_id=(select id from auth.users where email='narda_m11@hotmail.com');
delete from auth.users where email='narda_m11@hotmail.com';
commit;
```

---

### Stage 2 — Catalog (plans · class types · coaches)

**Writes:** `paquetes` (4) + `class_type` (6) + `coach` (2). Later stages reference these by
their unique `(gym_id, name/nombre)` — no hardcoded uuids.

```sql
begin;
do $$ declare v_gym uuid := 'ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9';
begin
  if not exists (select 1 from gym where id=v_gym and slug='red') then raise exception 'FIREWALL: not RED'; end if;
  if exists (select 1 from paquetes where gym_id=v_gym)
     or exists (select 1 from class_type where gym_id=v_gym)
     or exists (select 1 from coach where gym_id=v_gym)
    then raise exception 'FIREWALL: catalog already seeded for RED'; end if;
end $$;

insert into paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio, popular, orden)
values
  ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9','Mensualidad ilimitada', null, 'dias', 30, 1200, true,  0),
  ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9','Paquete de 8 clases',   8,    'dias', 30,  850, false, 1),
  ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9','Paquete de 5 clases',   5,    'dias', 30,  550, false, 2),
  ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9','Clase individual',      1,    'dias', 30,  120, false, 3);

insert into class_type (gym_id, name, description, default_duration_min)
values
  ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9','Upper Body',   'Enfoque en la parte superior del cuerpo. Fuerza y tonificación.', 45),
  ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9','Lower Body',   'Trabajo de la parte inferior del cuerpo. Fuerza y potencia.', 45),
  ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9','Abs',          'Enfoque en el core. Fuerza, estabilidad y definición.', 45),
  ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9','Cardio HIIT',  'Entrenamiento de alta intensidad para mejorar resistencia y quema de calorías.', 45),
  ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9','Full Body',    'Entrenamiento completo que combina fuerza, cardio y funcionalidad.', 45),
  ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9','Circuito HIIT','Circuito funcional de alta intensidad. Fuerza, resistencia y agilidad.', 45);

insert into coach (gym_id, name, initials, role, is_active, sort_order)
values
  ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9','Narda',  'N', 'Coach', true, 0),
  ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9','Martin', 'M', 'Coach', true, 1);
commit;
```

**Verify** (expect `paquetes=4, popular=1, class_types=6, coaches=2`):
```sql
select
  (select count(*) from paquetes  where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as paquetes,
  (select count(*) from paquetes  where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9' and popular) as popular,
  (select count(*) from class_type where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as class_types,
  (select count(*) from coach     where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as coaches;
```

**Rollback:** `delete from coach; delete from class_type; delete from paquetes;` each `where gym_id='ca1954bc-…'`.

---

### Stage 3 — Schedule + sessions (6 weeks)

**Writes:** `schedule_template` (21) + `schedule_template_coach` (21) + `schedule_template_week` (126) + `class_session` (126) + `class_session_coach` (126). Each `(weekday, start_time)` is unique in this timetable, so the coach match is 1:1.

```sql
begin;
do $$ declare v_gym uuid := 'ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9';
begin
  if not exists (select 1 from gym where id=v_gym and slug='red') then raise exception 'FIREWALL: not RED'; end if;
  if exists (select 1 from schedule_template where gym_id=v_gym) then raise exception 'FIREWALL: schedule already seeded'; end if;
end $$;

-- 3a. templates (weekday 0=Mon … 5=Sat; all 45 min, capacity 8)
insert into schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, is_active)
select 'ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9', ct.id, v.weekday, v.start_time, 45, 8, true
from (values
  ('Upper Body',   0,'08:15'::time),('Upper Body',   0,'09:15'),('Upper Body',   0,'19:15'),
  ('Lower Body',   1,'07:15'),       ('Lower Body',   1,'08:15'),('Lower Body',   1,'09:15'),('Lower Body',1,'19:15'),
  ('Abs',          2,'07:15'),       ('Abs',          2,'08:15'),('Abs',          2,'09:15'),('Abs',       2,'19:15'),
  ('Cardio HIIT',  3,'07:15'),       ('Cardio HIIT',  3,'08:15'),('Cardio HIIT',  3,'09:15'),('Cardio HIIT',3,'19:15'),
  ('Full Body',    4,'08:15'),       ('Full Body',    4,'09:15'),('Full Body',    4,'19:15'),
  ('Circuito HIIT',5,'08:15'),       ('Circuito HIIT',5,'09:15'),('Circuito HIIT',5,'19:15')
) v(class_name, weekday, start_time)
join class_type ct on ct.gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9' and ct.name=v.class_name;

-- 3b. template coaches (match by weekday+start_time)
insert into schedule_template_coach (gym_id, template_id, coach_id)
select 'ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9', st.id, co.id
from (values
  (0,'08:15'::time,'Narda'),(0,'09:15','Narda'),(0,'19:15','Narda'),
  (1,'07:15','Martin'),(1,'08:15','Narda'),(1,'09:15','Narda'),(1,'19:15','Narda'),
  (2,'07:15','Martin'),(2,'08:15','Narda'),(2,'09:15','Narda'),(2,'19:15','Narda'),
  (3,'07:15','Martin'),(3,'08:15','Narda'),(3,'09:15','Narda'),(3,'19:15','Narda'),
  (4,'08:15','Narda'),(4,'09:15','Narda'),(4,'19:15','Narda'),
  (5,'08:15','Narda'),(5,'09:15','Narda'),(5,'19:15','Narda')
) v(weekday, start_time, coach_name)
join schedule_template st on st.gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9' and st.weekday=v.weekday and st.start_time=v.start_time
join coach co on co.gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9' and co.name=v.coach_name;

-- 3c/3d/3e. weeks + sessions + session coaches, 6 weeks from this gym-local Monday
with wk as (
  select ((now() at time zone 'America/Chihuahua')::date
          - (extract(isodow from (now() at time zone 'America/Chihuahua')::date)::int - 1)
          + 7*w)::date as monday
  from generate_series(0,5) w
),
tw as (
  insert into schedule_template_week (gym_id, template_id, week_start)
  select 'ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9', st.id, wk.monday
  from schedule_template st cross join wk
  where st.gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9'
  returning 1
),
sess as (
  insert into class_session (gym_id, class_type_id, starts_at, duration_min, capacity, template_id)
  select 'ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9', st.class_type_id,
         ((wk.monday + st.weekday)::date + st.start_time) at time zone 'America/Chihuahua',
         st.duration_min, st.capacity, st.id
  from schedule_template st cross join wk
  where st.gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9'
  returning id, template_id
)
insert into class_session_coach (gym_id, session_id, coach_id)
select 'ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9', s.id, stc.coach_id
from sess s
join schedule_template_coach stc on stc.template_id = s.template_id
  and stc.gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9';
commit;
```

**Verify** (expect `templates=21, tmpl_coach=21, weeks=126, sessions=126, sess_coach=126, bad_dur=0, bad_cap=0`):
```sql
select
  (select count(*) from schedule_template      where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as templates,
  (select count(*) from schedule_template_coach where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as tmpl_coach,
  (select count(*) from schedule_template_week  where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as weeks,
  (select count(*) from class_session          where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as sessions,
  (select count(*) from class_session_coach    where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as sess_coach,
  (select count(*) from class_session where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9' and duration_min not in (30,45,60,75,90)) as bad_dur,
  (select count(*) from class_session where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9' and (capacity<4 or capacity>40)) as bad_cap;
```

**Rollback** (child→parent): `class_session_coach`, `class_session`, `schedule_template_week`, `schedule_template_coach`, `schedule_template`, each `where gym_id='ca1954bc-…'`.

---

### Stage 4 — Config (perfil · WhatsApp templates)

**Writes:** `perfil` (1) + `plantillas` (4, the product defaults). `tel`/`ciudad` left null until the owner gives a phone + city.

```sql
begin;
do $$ declare v_gym uuid := 'ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9';
begin
  if not exists (select 1 from gym where id=v_gym and slug='red') then raise exception 'FIREWALL: not RED'; end if;
  if exists (select 1 from perfil where gym_id=v_gym) or exists (select 1 from plantillas where gym_id=v_gym)
    then raise exception 'FIREWALL: config already seeded'; end if;
end $$;

insert into perfil (gym_id, negocio, coach)
values ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9', 'RED Functional Training', 'Narda');

insert into plantillas (gym_id, nombre, body) values
  ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9','Recordatorio', $body$Hola {nombre} 👋

Aún te quedan {clases} de tu paquete (*{paquete}*), vence el {vence}.

¡Te esperamos en RED! 💪🔥
— {negocio}$body$),
  ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9','Recibo', $body$Hola {nombre} 👋

¡Gracias por tu compra en {negocio}! Tu paquete *{paquete}* queda activo hasta el {vence}.

Nos vemos en RED. 💪🔥$body$),
  ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9','Renovación', $body$Hola {nombre}, soy del coach de {negocio}.

Tu paquete vence en {dias} — ¿lo renovamos? 🔥

📦 *Paquetes disponibles:*
{precios}

Avísame cuál te conviene y te lo apartamos. 💪$body$),
  ('ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9','Última llamada', $body$Hola {nombre} 👋

Te aviso que solo te queda *1 clase* de tu paquete y vence el {vence}.

Si quieres seguir entrenando con nosotros, renovamos después de la próxima clase. 💪
— {negocio}$body$);
commit;
```
*(Default copy verbatim except "bootcamp" → "RED"; owner can edit any template in-app.)*

**Verify** (expect `perfil=1, plantillas=4`):
```sql
select (select count(*) from perfil where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as perfil,
       (select count(*) from plantillas where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as plantillas;
```

**Rollback:** `delete from plantillas; delete from perfil;` each `where gym_id='ca1954bc-…'`.

---

### Stage 5 — Members + sales  ✅ 19 SEEDABLE NOW · 9 SECOND-PASS

**Source of truth:** `docs/supabase/seeding-contacts.json` (reconciled with the owner 2026-07-24). It encodes every decision below — read it before running.

**Seedable now (19):** 13 Mensualidad ilimitada (the `mensualidad` array — includes Elsa María "Sama" Rodríguez) + 5 Clase individual (the `clase_individual` array — everyone with contact info who is NOT on the Inscritos list bought a single class and already attended it) + 1 test member (Aaron Talavera — folio LAST so his post-test removal leaves the gap at the tail; teardown below).

**Second pass — 9 BLOCKED (do NOT seed here):** the `roster_without_contact` array (Fer la mexicana, Bibi, Brenda Chávez, Dulce Chávez, Alva Valles, Karen Lara, Gaby Bustillos, Diana Hernández, Abrham Lara). `clientes.tel` is `NOT NULL` / 10 digits — they cannot seed until phones arrive. Abrham's package is now resolved (Mensualidad ilimitada, Ago 2026 → Ene 2027, vence 2027-01-07, venta fecha 2026-07-07); he is *additionally* pending only the **monto** he actually paid for the prepay (see open items). They seed in a later run once phones land, folios continuing from the counter (`next_folio` → 1020+; Aaron's 1019 gap stays reserved).

**Shape.** Per member: one `clientes` row + one `ventas` row, linked by `tel` (unique in the batch). Emails **are** carried now (this reverses the old "email = NULL" rule) and are lowercased on insert. Rows land in the **`sin_invitar`** invitation state — email set, `invitacion_enviada_at` NULL, `auth_user_id` NULL, **no `claim_code`** (the code is minted only by `preparar_invitacion` at send time; the seed must not set it). See the in-class invite section below.
- **Mensualidad ilimitada (13 + Aaron):** `clientes.clases_restantes = NULL`, `paquete_nombre='Mensualidad ilimitada'`, `vence = venta fecha + 30`; `ventas` `monto=1200`, `clases=NULL`, `vigencia_tipo='dias'`, `vigencia_dias=30`, `metodo='efectivo'`, `fecha = last_payment_date` (Aaron = seed-execution day).
- **Clase individual (5):** paquete sold 1 class, already attended → `clientes.clases_restantes = 0`, `paquete_nombre='Clase individual'`, `vence = fecha + 30 (= 2026-08-20)`; `ventas` `monto=120`, `clases=1` (the sale granted one), `vigencia_tipo='dias'`, `vigencia_dias=30`, `metodo='efectivo'`, `fecha=2026-07-21` (approximate — owner may correct later).

**Folios** run contiguous **1001..1019**, chronological by venta `fecha` (single-class 07-21 ventas fall near the end; Aaron's seed-day venta is last). Afterward `gym_folio_counter.last_folio = 1019` (direct inserts bypass `next_folio()`).

**Pre-flight — run IMMEDIATELY before the insert** (no unique constraint on `tel`/`email` exists, so a mid-wait manual add would duplicate). Expect `clientes=0`, `ventas=0`, `last_folio=1000`; any other value → stop and reconcile (match existing rows by name, UPDATE those, INSERT only the missing, start folios at `last_folio+1`):
```sql
select
  (select count(*) from clientes where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as clientes,
  (select count(*) from ventas   where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as ventas,
  (select last_folio from gym_folio_counter where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as last_folio;
```

```sql
begin;
do $$
declare
  v_gym  uuid := 'ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9';
  v_seed date := (now() at time zone 'America/Chihuahua')::date;  -- Aaron's venta fecha = seed-execution day
begin
  -- FIREWALL
  if not exists (select 1 from gym where id=v_gym and slug='red' and brand_module_id='red')
    then raise exception 'FIREWALL: % is not the RED tenant', v_gym; end if;
  -- Refuse if the gym already has members — a mid-wait manual add would duplicate (no unique key on tel/email).
  if exists (select 1 from clientes where gym_id=v_gym)
    then raise exception 'FIREWALL: RED already has clientes — reconcile per pre-flight, do NOT bulk-insert'; end if;
  if (select last_folio from gym_folio_counter where gym_id=v_gym) is distinct from 1000
    then raise exception 'FIREWALL: last_folio is not 1000 — reconcile before seeding'; end if;

  -- One VALUES list → clientes then ventas, joined by tel. folio = chronological by venta fecha, 1001..1019.
  -- vence = fecha + 30 for every row. Ilimitado: clases_restantes NULL / venta.clases NULL. Clase individual:
  -- attended → clases_restantes 0, venta.clases 1. Emails lowercased; claim_code left NULL ⇒ 'sin_invitar'.
  with seed(folio, nombre, tel, email, paquete, monto, venta_clases, cli_clases, fecha) as (
    values
    -- 13 Mensualidad ilimitada (venta fecha = last payment date)
    (1001,'Marina Fernanda Olivas Palacios','6141321409','olivasf1511@gmail.com',       'Mensualidad ilimitada',1200, null::int, null::int, date '2026-06-12'),
    (1002,'Giovanna Estrada Rodarte',        '6142550087','giovanna.estrada.r@gmail.com','Mensualidad ilimitada',1200, null,      null,      date '2026-06-19'),
    (1003,'Elsa María Rodríguez González',   '6142897877','elsa.72@hotmail.com',         'Mensualidad ilimitada',1200, null,      null,      date '2026-06-20'),  -- roster "Sama"
    (1004,'Estefanía González Ruíz',         '6141767348','stepany_gr@hotmail.com',      'Mensualidad ilimitada',1200, null,      null,      date '2026-06-23'),
    (1005,'Sandra Báez Lopez',               '3323485678','sandynuta93@gmail.com',       'Mensualidad ilimitada',1200, null,      null,      date '2026-06-25'),  -- 332 (GDL) LADA — owner-confirmed 2026-07-24
    (1006,'Yeira Alejandra Valles Peña',     '6141549650','vallesyeira@gmail.com',       'Mensualidad ilimitada',1200, null,      null,      date '2026-06-25'),
    (1007,'Alejandra Alvarado Rojas',        '6143634022','alealvaradorv@gmail.com',     'Mensualidad ilimitada',1200, null,      null,      date '2026-07-07'),
    (1008,'Ayin Natalie Vázquez Garay',      '6144734284','ayinvg@hotmail.com',          'Mensualidad ilimitada',1200, null,      null,      date '2026-07-09'),
    (1009,'Danna Paola Pérez Mata',          '6142795829','perezmatadanna@gmail.com',    'Mensualidad ilimitada',1200, null,      null,      date '2026-07-10'),
    (1010,'Katya Jauregui Lerma',            '6145355506','katya_jauregui@hotmail.com',  'Mensualidad ilimitada',1200, null,      null,      date '2026-07-14'),
    (1011,'Camila Rodríguez Parra',          '6145224206','camilitarguez@icloud.com',    'Mensualidad ilimitada',1200, null,      null,      date '2026-07-14'),
    (1012,'Jessica Valdez Chávez',           '6144478661','jessica.valdezch@gmail.com',  'Mensualidad ilimitada',1200, null,      null,      date '2026-07-15'),  -- roster "Jess Valdés"
    (1013,'Paulina Pérez Mata',              '6143384030','paulinaperezmt@gmail.com',    'Mensualidad ilimitada',1200, null,      null,      date '2026-07-15'),  -- roster "Paulina box"
    -- 5 Clase individual (venta fecha 2026-07-21 approx; sold 1, already attended → 0 left)
    (1014,'Oscar Anchondo Neri',             '6141691009','dr.anchondoneri@gmail.com',        'Clase individual', 120, 1, 0, date '2026-07-21'),
    (1015,'Yolanda Araly Paez Robles',       '6141848503','yolandaaraly.pr@gmail.com',        'Clase individual', 120, 1, 0, date '2026-07-21'),
    (1016,'Andrea Alvarado Rojas',           '6143627524','andrea_alvarado.rojas@hotmail.com','Clase individual', 120, 1, 0, date '2026-07-21'),  -- sister of Alejandra, distinct
    (1017,'Hanna Minjarez Gonzalez',         '6141653141','hannaminjarez03@gmail.com',        'Clase individual', 120, 1, 0, date '2026-07-21'),
    (1018,'Jaime Hernandez',                 '6141201424','jaimehdzh04@gmail.com',            'Clase individual', 120, 1, 0, date '2026-07-21'),  -- PROVISIONAL name — confirm w/ owner
    -- 1 test member (Aaron) — venta fecha = seed-execution day; folio LAST so teardown leaves the tail gap
    (1019,'Aaron Talavera',                  '6141419504','aaron.talavera6@gmail.com',   'Mensualidad ilimitada',1200, null,      null,      v_seed)
  ),
  ins_cli as (
    insert into clientes (gym_id, nombre, tel, email, paquete_nombre, clases_restantes, vence, created_at)
    select v_gym, s.nombre, s.tel, lower(s.email), s.paquete, s.cli_clases,
           s.fecha + 30,
           (s.fecha::timestamp at time zone 'America/Chihuahua')
    from seed s
    returning id, tel
  )
  insert into ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at)
  select v_gym, c.id, s.folio, s.paquete, s.venta_clases, 'dias', 30, s.monto, 'efectivo',
         (s.fecha::timestamp at time zone 'America/Chihuahua'),
         (s.fecha::timestamp at time zone 'America/Chihuahua')
  from seed s join ins_cli c on c.tel = s.tel;

  -- Direct inserts bypass next_folio(); bump the per-gym counter past the highest seeded folio.
  update gym_folio_counter set last_folio = 1019 where gym_id = v_gym;
end $$;
commit;
```

**Verify** (expect `clientes=19, ventas=19, ilimitado=14, clase_indiv=5, bad_tel=0, sin_invitar=19, folio_min=1001, folio_max=1019, folio_distinct=19, counter=1019`):
```sql
select
  (select count(*) from clientes where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as clientes,
  (select count(*) from ventas   where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as ventas,
  (select count(*) from clientes where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9' and clases_restantes is null) as ilimitado,
  (select count(*) from clientes where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9' and clases_restantes = 0) as clase_indiv,
  (select count(*) from clientes where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9' and tel !~ '^[0-9]{10}$') as bad_tel,
  (select count(*) from clientes where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9'
     and email is not null and claim_code is null and invitacion_enviada_at is null and auth_user_id is null) as sin_invitar,
  (select min(folio) from ventas where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as folio_min,
  (select max(folio) from ventas where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as folio_max,
  (select count(distinct folio) from ventas where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as folio_distinct,
  (select last_folio from gym_folio_counter where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9') as counter;
```
Every INSERT hard-codes the literal red `gym_id`, so cross-tenant leakage is structurally impossible — Forge (one gym_id away) is untouched by construction.

**Rollback** (safe to nuke wholesale — the refuse-if-clientes-exist firewall guaranteed the seed was the sole writer of red clientes/ventas; `ventas.cliente_id` also cascades on `clientes` delete):
```sql
begin;
delete from ventas   where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9';
delete from clientes where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9';
update gym_folio_counter set last_folio = 1000 where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9';
commit;
```

**Aaron test-member teardown** — run AFTER the activation/booking test. His gmail already holds an auth account (red-demo member), so activation links `auth_user_id` on the red cliente and mints a red `gym_membership(member)` row. Remove those two + the seed rows; leave `auth.users` (his red-demo login) and the counter (last_folio stays 1019 → the 1019 folio gap stays reserved at the tail, no real sale reuses it):
```sql
begin;
delete from ventas         where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9' and folio = 1019;
delete from gym_membership where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9'
  and user_id=(select id from auth.users where email='aaron.talavera6@gmail.com');
delete from clientes       where gym_id='ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9' and lower(email)='aaron.talavera6@gmail.com';
-- do NOT delete auth.users; do NOT decrement gym_folio_counter.
commit;
```

**Invite delivery — IN-CLASS, one by one (NEVER a batch send).** The seed only creates `sin_invitar` rows; it sends nothing. The owner opens each member's ficha in the admin app and presses **"Enviar invitación"** (the ficha's `sin_invitar` affordance, issue #71) at the moment she tells that member about the app in person.
- Live per-member verification kills the bounce-budget risk — this **supersedes** the two-wave bulk protocol from the 2026-07-22 email audit; there is no batch path.
- The invite's claim link **never expires** (only the on-demand magic link is 1-hour), so late openers lose nothing.
- Trickle sending doubles as sender-reputation warm-up.
- The lapsed / used-up members (~9: the 4 Mensualidad past `vence` + the 5 Clase individual at 0 classes) will **truthfully** show "Plan vencido" / "sin clases" on screen — the owner should expect that in front of the member (it is correct, not a bug).
- A member who later gives an email gets it added via the ficha edit (`actualizar_cliente` email arm), which **auto-fires the invite** on the unclaimed row (design §3) — desired, done in person.

**Seedable-now roster & computed vence** (vence = venta fecha + 30; est. state as of 2026-07-24, drifts with the calendar):
| folio | name | group | venta fecha | vence | est. state |
|---|---|---|---|---|---|
| 1001 | Marina Fernanda Olivas Palacios | Ilimitada | 2026-06-12 | 2026-07-12 | Plan vencido |
| 1002 | Giovanna Estrada Rodarte | Ilimitada | 2026-06-19 | 2026-07-19 | Plan vencido |
| 1003 | Elsa María Rodríguez González ("Sama") | Ilimitada | 2026-06-20 | 2026-07-20 | Plan vencido |
| 1004 | Estefanía González Ruíz | Ilimitada | 2026-06-23 | 2026-07-23 | Plan vencido |
| 1005 | Sandra Báez Lopez | Ilimitada | 2026-06-25 | 2026-07-25 | por vencer |
| 1006 | Yeira Alejandra Valles Peña | Ilimitada | 2026-06-25 | 2026-07-25 | por vencer |
| 1007 | Alejandra Alvarado Rojas | Ilimitada | 2026-07-07 | 2026-08-06 | activo |
| 1008 | Ayin Natalie Vázquez Garay | Ilimitada | 2026-07-09 | 2026-08-08 | activo |
| 1009 | Danna Paola Pérez Mata | Ilimitada | 2026-07-10 | 2026-08-09 | activo |
| 1010 | Katya Jauregui Lerma | Ilimitada | 2026-07-14 | 2026-08-13 | activo |
| 1011 | Camila Rodríguez Parra | Ilimitada | 2026-07-14 | 2026-08-13 | activo |
| 1012 | Jessica Valdez Chávez ("Jess Valdés") | Ilimitada | 2026-07-15 | 2026-08-14 | activo |
| 1013 | Paulina Pérez Mata ("Paulina box") | Ilimitada | 2026-07-15 | 2026-08-14 | activo |
| 1014 | Oscar Anchondo Neri | Clase individual | 2026-07-21 | 2026-08-20 | sin clases (0) |
| 1015 | Yolanda Araly Paez Robles | Clase individual | 2026-07-21 | 2026-08-20 | sin clases (0) |
| 1016 | Andrea Alvarado Rojas | Clase individual | 2026-07-21 | 2026-08-20 | sin clases (0) |
| 1017 | Hanna Minjarez Gonzalez | Clase individual | 2026-07-21 | 2026-08-20 | sin clases (0) |
| 1018 | Jaime Hernandez (provisional name) | Clase individual | 2026-07-21 | 2026-08-20 | sin clases (0) |
| 1019 | Aaron Talavera (test member) | Ilimitada | seed-day | seed-day +30 | activo |

**Open items (do not invent resolutions — owner decisions):**
- The **9** `roster_without_contact` members need real **phone numbers** before they can seed (second pass).
- **Abrham Lara** — package RESOLVED 2026-07-24: Mensualidad ilimitada prepaid Ago 2026 → Ene 2027 (from the roster's "Agosto a enero 7") → `vence` **2027-01-07**, `clases_restantes` NULL, venta `fecha` 2026-07-07. Still pending, like the other 8: his **phone number**, plus the **monto** actually paid for the prepay (pin both when the owner's WhatsApp round returns).
- **"Jaime Hernandez"** is a PROVISIONAL name for `jaimehdzh04@` — confirm with the owner.
- **Single-class venta dates** are approximated as 2026-07-21 — correct individually if the owner has real dates.

---

## Self-review

- **Spec coverage:** owner (S1), plans+classes+coaches (S2), schedule (S3), config (S4), members+ventas (S5). Client-site content + cobro deliberately out of scope. ✓
- **Ordering:** FK-safe (catalog before schedule before members; templates before their sessions). ✓
- **Firewall:** every stage asserts RED + "not already seeded"; every write carries the literal `gym_id`. ✓
- **No secrets:** owner password is `<<OWNER_PASSWORD>>` here, substituted only at execution time. ✓
