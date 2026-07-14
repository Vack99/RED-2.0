import pg from "pg";

import {
  ADMIN_USER,
  FIXTURES,
  GYM_BRAND_NAME,
  GYM_SLUG,
  pointAtLocalDatabase,
} from "./config.mjs";

/**
 * Seed the LOCAL Supabase with a realistic single-gym dataset, so the perf harness
 * measures pages that render real content instead of empty states.
 *
 * Re-runnable: it purges everything scoped to the seeded gym and rebuilds from scratch,
 * so a run never depends on how many times it was seeded before.
 *
 *   pnpm perf:seed
 *
 * WHY THE ROW COUNTS ARE WHAT THEY ARE — production today is a demo-scale dataset
 * (48 clientes, 53 ventas, 285 asistencias). Mirroring it would seed a fixture so small
 * that a per-row cost is invisible on localhost, and the 50ms gate would pass while a
 * real gym crawls. `adr-0013-rls-per-row-claim-is-false` records that the gym RLS helper
 * is a correlated SubPlan evaluated PER ROW. Row count is the axis that exposes it, so we
 * seed one real operating gym (see VOLUMES). Any change here makes previous runs
 * incomparable — bump CONDITIONS_ID in config.mjs and take a fresh baseline.
 */

/** Frozen row volumes. Recorded in PERF-LOOP.md; every later result is read against these. */
const VOLUMES = {
  clientes: 500, // 1 fixture (the operator's own row) + 499 generated
  ventas: 3000,
  asistencias: 5000, // 4975 spread over 120d + 25 recent ones on the fixture cliente
  classSessionDays: 28, // 4 weeks, centred on the current gym-local week
  classSessionSlots: 7, // per day -> 196 grid sessions + 1 fixture = 197
  reservations: 1000, // 999 across the grid + 1 'reservada' on the fixture session
  paquetes: 8,
  classTypes: 8,
  coaches: 6,
};

/** Deterministic — the route table in config.mjs points at these literals. */
const GYM_ID = "33333333-3333-4333-8333-333333333333";
const TIMEZONE = "America/Chihuahua"; // matches the gyms the migrations seed

pointAtLocalDatabase(); // hard-refuses unless NEXT_PUBLIC_SUPABASE_URL is localhost

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;
const TENANT_KEY = process.env.TENANT_ASSERTION_KEY;

/**
 * Second, independent safety gate.
 *
 * pointAtLocalDatabase() already refuses a non-localhost API url, but this script writes
 * ~10k rows and creates auth users — it is the single most destructive thing in the repo
 * if aimed at the wrong database. The Postgres URL is a SEPARATE value from the API url,
 * so it gets its own check rather than riding on the other one's.
 */
for (const [name, value] of [
  ["NEXT_PUBLIC_SUPABASE_URL", API_URL],
  ["SUPABASE_DB_URL", DB_URL],
]) {
  const host = new URL(value ?? "").hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `REFUSING TO SEED: ${name} points at "${host}", not localhost.\n` +
        `  This script is destructive (it purges and rewrites a whole gym). It only ever runs against local Docker.`,
    );
  }
}
if (!SERVICE_KEY || !TENANT_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY / TENANT_ASSERTION_KEY missing — run `pnpm perf:env`.");
}

const admin = (path, init) =>
  fetch(`${API_URL}/auth/v1/admin/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
    },
  });

/**
 * Recreate the operator through the GoTrue admin API rather than inserting into
 * auth.users by hand: GoTrue owns the password hashing and the `identities` row, and a
 * hand-rolled user cannot actually log in through the form the harness drives.
 *
 * Delete-then-create (rather than upsert) so the password is always the one in config.
 */
async function recreateOperator() {
  const list = await admin("users?per_page=200");
  if (!list.ok) throw new Error(`admin list users failed: ${list.status} ${await list.text()}`);
  const existing = (await list.json()).users?.find((u) => u.email === ADMIN_USER.email);
  if (existing) {
    const del = await admin(`users/${existing.id}`, { method: "DELETE" });
    if (!del.ok) throw new Error(`admin delete user failed: ${del.status} ${await del.text()}`);
  }

  const created = await admin("users", {
    method: "POST",
    body: JSON.stringify({
      email: ADMIN_USER.email,
      password: ADMIN_USER.password,
      email_confirm: true, // no inbox locally; an unconfirmed user cannot sign in
    }),
  });
  if (!created.ok) {
    throw new Error(`admin create user failed: ${created.status} ${await created.text()}`);
  }
  return (await created.json()).id;
}

/**
 * Make the LOCAL stack's table privileges match the hosted platform's.
 *
 * WITHOUT THIS, EVERY PAGE SILENTLY RENDERS AN EMPTY STATE AND THE WHOLE HARNESS MEASURES
 * NOTHING. It cost us a full baseline run to notice, because the pages still return 200.
 *
 * The migrations assume Supabase's platform default privileges, which grant table-level
 * SELECT to `anon`/`authenticated` on every new table in `public` — an assumption several
 * of them state out loud, and which holds on prod (verified: every table there carries
 * `anon=arwdDxtm`). It does NOT hold in the local Docker stack: there, migrations run as
 * `postgres`, whose default ACL grants only `Dxtm` (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN)
 * — no SELECT. So PostgREST, which connects as anon/authenticated, can read nothing:
 * `resolveTenant`'s `gym_domain` lookup returns null, no tenant resolves, and every page
 * falls back to its "no gym" copy while still answering 200 in ~10ms.
 *
 * This is local-only on purpose. It is NOT a migration: prod already has these grants, and
 * a migration that re-granted them would BROADEN anon's surface on prod, undoing the
 * deliberate #93/D3 narrowing below. Function EXECUTE grants need no fixup — the migrations
 * grant those explicitly, and local already matches prod.
 */
const GRANTS = [
  "grant all on all tables in schema public to anon, authenticated, service_role",
  "grant all on all sequences in schema public to anon, authenticated, service_role",
  // Restore the deliberate anon narrowing of `gym` (migration 20260713190100, issue #93
  // ruling D3) that the blanket grant above would otherwise undo. anon gets column-level
  // SELECT on the brand-seam columns only — never legal_name or owner_user_id.
  "revoke select on table public.gym from anon",
  `grant select (id, slug, brand_name, timezone, brand_module_id, token_overrides,
                 about_story, about_pull_quote, about_tagline) on public.gym to anon`,
];

/**
 * Everything scoped to this gym, in FK order (children first). The gym row goes last, so
 * a re-run leaves no orphans behind and the seed is a true rebuild rather than a top-up.
 *
 * One statement per entry: Postgres refuses to prepare a multi-command string, and these
 * are parameterised on the gym id rather than interpolated.
 */
const PURGE = [
  "delete from asistencias            where gym_id = $1",
  "delete from reservation            where gym_id = $1",
  "delete from class_session_coach    where gym_id = $1",
  "delete from schedule_template_week where gym_id = $1",
  "delete from class_session          where gym_id = $1",
  "delete from schedule_template      where gym_id = $1",
  "delete from ventas                 where gym_id = $1",
  "update clientes set favorite_class_type_id = null where gym_id = $1",
  "delete from clientes               where gym_id = $1",
  "delete from class_type_workblock   where gym_id = $1",
  "delete from class_type_bring_item  where gym_id = $1",
  "delete from plan_feature           where gym_id = $1",
  "delete from paquetes               where gym_id = $1",
  "delete from class_type             where gym_id = $1",
  "delete from coach                  where gym_id = $1",
  "delete from room                   where gym_id = $1",
  "delete from about_value            where gym_id = $1",
  "delete from facility               where gym_id = $1",
  "delete from stat                   where gym_id = $1",
  "delete from faq                    where gym_id = $1",
  "delete from gym_contact            where gym_id = $1",
  "delete from contact_message        where gym_id = $1",
  "delete from plantillas             where gym_id = $1",
  "delete from cobro                  where gym_id = $1",
  "delete from perfil                 where gym_id = $1",
  "delete from gym_membership         where gym_id = $1",
  "delete from gym_domain             where gym_id = $1 or hostname = 'localhost'",
  "delete from gym                    where id = $1 or slug = $2",
];

async function main() {
  const uid = await recreateOperator();
  console.log(`operator recreated: ${ADMIN_USER.email} (${uid})`);

  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();

  try {
    await db.query("begin");
    for (const statement of GRANTS) await db.query(statement);
    for (const statement of PURGE) {
      // Postgres rejects a bind that supplies more parameters than the statement declares.
      await db.query(statement, statement.includes("$2") ? [GYM_ID, GYM_SLUG] : [GYM_ID]);
    }

    // ---- tenant ------------------------------------------------------------------
    // brand_name comes from config.mjs because run.mjs preflights the client home for it —
    // the two must not drift, or a healthy run would fail the preflight (or worse, a hollow
    // one would pass it).
    await db.query(
      `insert into gym (id, slug, brand_name, legal_name, timezone, brand_module_id, owner_user_id,
                        about_story, about_pull_quote, about_tagline)
       values ($1, $2, $3, $4, $5, 'forge', $6,
               'Abrimos en 2019 con una barra, dos racks y la idea de que entrenar en serio no tiene que ser intimidante.',
               'Nadie entrena solo aquí.',
               'Fuerza real, en comunidad.')`,
      [GYM_ID, GYM_SLUG, GYM_BRAND_NAME, `${GYM_BRAND_NAME} SA de CV`, TIMEZONE, uid],
    );

    // resolveTenant matches on the port-stripped host, so ONE row for `localhost` serves
    // both apps (client :3100 and admin :3200) and makes host resolution — not the ?gym=
    // fallback — the path under test, exactly as in production. The `app` column is not
    // read by resolveTenant; the unique index is on hostname alone, so there can only be one.
    await db.query(
      `insert into gym_domain (gym_id, hostname, app) values ($1, 'localhost', 'client')`,
      [GYM_ID],
    );

    // The operator is BOTH staff and member: 'owner' (not 'operator') because /cuenta's
    // cobro read is gated on has_role(gym_id,'owner'), and a plain operator sees null there.
    await db.query(
      `insert into gym_membership (user_id, gym_id, role) values ($1, $2, 'owner')`,
      [uid, GYM_ID],
    );

    // The Vault secret the D2 tenant binding verifies (#93). Without it,
    // reclamar_o_crear_cliente raises and /reservar renders <SinMembresia/> forever.
    await db.query(`delete from vault.secrets where name = 'tenant_assertion_key'`);
    await db.query(`select vault.create_secret($1, 'tenant_assertion_key')`, [TENANT_KEY]);

    // ---- catalog -----------------------------------------------------------------
    await db.query(
      `insert into class_type (gym_id, name, sala, level, description, default_duration_min)
       select $1, n.name, 'Sala Principal', n.level, n.description, 60
       from (values
         ('Fuerza',      'Intermedio', 'Trabajo de barra: sentadilla, peso muerto, press.'),
         ('Metcon',      'Todos',      'Acondicionamiento metabólico de alta intensidad.'),
         ('Halterofilia','Avanzado',   'Arranque y envión, técnica olímpica.'),
         ('Movilidad',   'Todos',      'Rango de movimiento y trabajo articular.'),
         ('Resistencia', 'Intermedio', 'Remo, bici y carrera en intervalos.'),
         ('Core',        'Todos',      'Estabilidad de tronco y anti-rotación.'),
         ('Kettlebell',  'Intermedio', 'Swing, clean y snatch con pesa rusa.'),
         ('Recuperación','Todos',      'Sesión ligera de descarga y respiración.')
       ) as n(name, level, description)`,
      [GYM_ID],
    );

    await db.query(
      `insert into coach (gym_id, name, initials, role, specialty, bio, is_active, sort_order)
       select $1, c.name, c.initials, c.role, c.specialty, c.bio, true, c.ord
       from (values
         ('Ana Rivera',    'AR', 'Head Coach', 'Halterofilia', 'Seleccionada nacional, 8 años entrenando atletas.', 1),
         ('Beto Salas',    'BS', 'Coach',      'Fuerza',       'Powerlifter, especialista en sentadilla y peso muerto.', 2),
         ('Carla Nieto',   'CN', 'Coach',      'Metcon',       'Maratonista, obsesionada con el trabajo de motor.', 3),
         ('Diego Ortiz',   'DO', 'Coach',      'Movilidad',    'Fisioterapeuta, enfoque en prevención de lesiones.', 4),
         ('Elena Vargas',  'EV', 'Coach',      'Kettlebell',   'Instructora certificada StrongFirst.', 5),
         ('Fernando Lira', 'FL', 'Coach',      'Resistencia',  'Ex ciclista de ruta, trabaja umbral y ritmo.', 6)
       ) as c(name, initials, role, specialty, bio, ord)`,
      [GYM_ID],
    );

    await db.query(
      `insert into room (gym_id, name, capacity)
       values ($1, 'Sala Principal', 30), ($1, 'Sala 2', 16)`,
      [GYM_ID],
    );

    // vigencia_tipo='mes' REQUIRES vigencia_dias IS NULL (and vice versa); clases is 1..30 or null;
    // and `paquetes_one_popular` is a partial unique index — exactly ONE popular plan per gym.
    await db.query(
      `insert into paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio, popular, orden)
       select $1, p.nombre, p.clases, p.vt, p.vd, p.precio, p.popular, p.orden
       from (values
         ('Clase Individual',  1,    'dias', 7,    150,  false, 0),
         ('Paquete 4 Clases',  4,    'dias', 30,   550,  false, 1),
         ('Paquete 8 Clases',  8,    'dias', 45,   980,  true,  2),
         ('Paquete 12 Clases', 12,   'dias', 60,   1350, false, 3),
         ('Paquete 20 Clases', 20,   'dias', 90,   2100, false, 4),
         ('Mensual Ilimitado', null, 'mes',  null, 1600, false, 5),
         ('Trimestral',        null, 'mes',  null, 4300, false, 6),
         ('Anual',             null, 'mes',  null, 15000,false, 7)
       ) as p(nombre, clases, vt, vd, precio, popular, orden)`,
      [GYM_ID],
    );

    await db.query(
      `insert into plan_feature (gym_id, plan_id, label, orden)
       select $1, p.id, f.label, f.orden
       from paquetes p
       cross join (values
         ('Acceso a todas las clases', 0),
         ('Reserva desde la app', 1),
         ('Sin inscripción', 2)
       ) as f(label, orden)
       where p.gym_id = $1`,
      [GYM_ID],
    );

    // ---- clientes ----------------------------------------------------------------
    // The fixture cliente IS the operator's own member row: it satisfies /clientes/[id]
    // (staff view) and the member reads on /reservar in one row. Active + unexpired so
    // the member routes render a real balance rather than a blocked state.
    await db.query(
      `insert into clientes (id, gym_id, nombre, tel, email, clases_restantes, vence, paquete_nombre,
                             auth_user_id, notificaciones_activadas, created_at)
       values ($1, $2, 'Perf Operator', '5550000001', $3, 24, current_date + 45, 'Paquete 20 Clases',
               $4, true, now() - interval '400 days')`,
      [FIXTURES.clienteId, GYM_ID, ADMIN_USER.email, uid],
    );

    // tel must be exactly 10 digits (CHECK on clientes).
    await db.query(
      `insert into clientes (gym_id, nombre, tel, email, clases_restantes, vence, paquete_nombre, created_at)
       select $1,
              'Cliente Perf ' || i,
              (5510000000 + i)::text,
              'cliente' || i || '@perf.local',
              case when i % 7 = 0 then null else 1 + (i % 20) end,   -- every 7th is Ilimitado (null balance)
              current_date + ((i % 60) - 20),                          -- ~1/3 expired, like a real roster
              case when i % 7 = 0 then 'Mensual Ilimitado' else 'Paquete ' || (1 + i % 5) || ' Clases' end,
              now() - ((i % 365) || ' days')::interval
       from generate_series(1, $2::int) i`,
      [GYM_ID, VOLUMES.clientes - 1],
    );

    // ---- ventas ------------------------------------------------------------------
    // folio is UNIQUE per (gym_id, folio). Spread over 120 days so getResumenMes's
    // "previous month start -> now" window has real volume to aggregate.
    await db.query(
      `with c as (
         select id, row_number() over (order by created_at, id) rn
         from clientes where gym_id = $1
       )
       insert into ventas (gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo,
                           vigencia_dias, monto, metodo, fecha)
       select $1, c.id, i,
              'Paquete ' || (1 + i % 5) || ' Clases',
              1 + (i % 20),
              'dias', 30,
              150 + (i % 12) * 150,
              (array['efectivo','transferencia','tarjeta'])[1 + i % 3],
              now() - ((i % 120) || ' days')::interval - ((i % 24) || ' hours')::interval
       from generate_series(1, $2::int) i
       join c on c.rn = 1 + (i % $3::int)`,
      [GYM_ID, VOLUMES.ventas, VOLUMES.clientes],
    );

    // ---- schedule + sessions ------------------------------------------------------
    // weekday is 0..5 (Mon..Sat) per schedule_template_weekday_check — not 1..7.
    await db.query(
      `insert into schedule_template (gym_id, class_type_id, weekday, start_time, duration_min, capacity, is_active)
       select $1, ct.id, w.weekday, t.start_time, 60, 20, true
       from (select id, row_number() over (order by name) rn from class_type where gym_id = $1) ct
       join (select generate_series(0, 5) as weekday) w on true
       join lateral (select (array['07:00','12:00','19:00'])[1 + (w.weekday + ct.rn) % 3]::time as start_time) t on true
       where ct.rn <= 4`,
      [GYM_ID],
    );

    // The session grid: 4 weeks x 7 slots/day, centred on the CURRENT gym-local week.
    // This is what makes `/` (today), `/reservar` (this week) and `/agenda` (this week)
    // render real rows — all three window on gym-local time, not UTC and not the machine clock.
    // duration_min must be one of (30,45,60,75,90); capacity 4..40.
    await db.query(
      `with g as (select timezone as tz from gym where id = $1),
       anchor as (
         select tz,
                (now() at time zone tz)::date
                  - ((extract(isodow from (now() at time zone tz)::date)::int) - 1) as week_start
         from g
       ),
       ct as (select id, row_number() over (order by name) rn from class_type where gym_id = $1),
       grid as (
         select a.tz,
                (a.week_start - 14 + d) as day,
                (array['06:00','08:00','10:00','12:00','17:00','19:00','21:00'])[s]::time as slot,
                d, s
         from anchor a
         cross join generate_series(0, $2::int - 1) d
         cross join generate_series(1, $3::int) s
       )
       insert into class_session (gym_id, class_type_id, starts_at, duration_min, capacity, is_special)
       select $1,
              ct.id,
              ((grid.day + grid.slot) at time zone grid.tz),
              (array[45, 60, 60, 60, 75])[1 + (grid.d + grid.s) % 5],
              12 + ((grid.d + grid.s) % 3) * 4,
              false
       from grid
       join ct on ct.rn = 1 + (grid.d + grid.s) % $4::int`,
      [GYM_ID, VOLUMES.classSessionDays, VOLUMES.classSessionSlots, VOLUMES.classTypes],
    );

    // The fixture session, addressed by /clase/[id] and /confirmada/[id]. Deliberately
    // +2 days rather than later-today: /confirmada requires starts_at >= now(), and a
    // fixture pinned to today would silently start FAILING mid-run once the clock passed it.
    await db.query(
      `insert into class_session (id, gym_id, class_type_id, starts_at, duration_min, capacity, is_special, special_name)
       select $1, $2, (select id from class_type where gym_id = $2 order by name limit 1),
              now() + interval '2 days', 60, 20, true, 'Sesión Fixture'`,
      [FIXTURES.sessionId, GYM_ID],
    );

    await db.query(
      `insert into class_session_coach (gym_id, session_id, coach_id)
       select $1, cs.id, c.id
       from (select id, row_number() over (order by starts_at, id) rn from class_session where gym_id = $1) cs
       join (select id, row_number() over (order by sort_order) rn from coach where gym_id = $1) c
         on c.rn = 1 + (cs.rn % $2::int)`,
      [GYM_ID, VOLUMES.coaches],
    );

    // ---- reservations -------------------------------------------------------------
    // UNIQUE (member_id, class_session_id). Striding members and sessions by different
    // moduli (500 vs 196) keeps every generated pair distinct for the first lcm(500,196)
    // rows, which is far more than we generate.
    await db.query(
      `with c as (
         select id, row_number() over (order by created_at, id) rn
         from clientes where gym_id = $1
       ),
       s as (
         select id, starts_at, row_number() over (order by starts_at, id) rn
         from class_session where gym_id = $1 and id <> $4
       ),
       n as (select count(*)::int as total from s)
       insert into reservation (gym_id, class_session_id, member_id, status, consumio, created_at)
       select $1, s.id, c.id,
              case when s.starts_at > now() then 'reservada' else 'asistida' end,
              s.starts_at <= now(),
              s.starts_at - interval '2 days'
       from generate_series(1, $2::int) i
       cross join n
       join s on s.rn = 1 + (i % n.total)
       join c on c.rn = 1 + (i % $3::int)`,
      [GYM_ID, VOLUMES.reservations - 1, VOLUMES.clientes, FIXTURES.sessionId],
    );

    // EXACTLY ONE 'reservada' row on the fixture session. /confirmada/[id] does
    // .eq(status,'reservada').maybeSingle() WITHOUT a member filter, leaning on RLS — and
    // our operator is staff, so RLS shows them every reservation on that session. A second
    // one here would make maybeSingle() return multiple rows, the reader return null, and
    // the page redirect to /reservar — a 3xx that the harness would score as BROKEN.
    await db.query(
      `insert into reservation (gym_id, class_session_id, member_id, status, consumio, created_at)
       values ($1, $2, $3, 'reservada', false, now() - interval '1 day')`,
      [GYM_ID, FIXTURES.sessionId, FIXTURES.clienteId],
    );

    // ---- asistencias ---------------------------------------------------------------
    // fecha is a DATE in gym-local terms. `/inicio` shows only fecha = today, `/clientes`
    // counts from the 1st of this month, and `/clientes/[id]` shows a rolling 30 days — so
    // the spread has to reach all three windows or those pages render empty.
    await db.query(
      `with g as (select timezone as tz from gym where id = $1),
       today as (select (now() at time zone tz)::date as d from g),
       c as (
         select id, row_number() over (order by created_at, id) rn
         from clientes where gym_id = $1
       )
       insert into asistencias (gym_id, cliente_id, fecha, hora, consumio, created_at)
       select $1, c.id,
              today.d - (i % 120),
              (time '06:00' + ((i % 14) || ' hours')::interval)::time,
              true,
              now() - ((i % 120) || ' days')::interval
       from generate_series(1, $2::int) i
       cross join today
       join c on c.rn = 1 + (i % $3::int)`,
      [GYM_ID, VOLUMES.asistencias - 25, VOLUMES.clientes],
    );

    // 25 recent ones on the fixture cliente, so /clientes/[id]'s rolling-30-day attendance
    // list is genuinely populated rather than technically non-empty.
    await db.query(
      `with g as (select timezone as tz from gym where id = $1),
       today as (select (now() at time zone tz)::date as d from g)
       insert into asistencias (gym_id, cliente_id, fecha, hora, consumio, created_at)
       select $1, $2, today.d - i, (time '07:00' + ((i % 6) || ' hours')::interval)::time, true, now() - (i || ' days')::interval
       from generate_series(0, 24) i
       cross join today`,
      [GYM_ID, FIXTURES.clienteId],
    );

    await db.query(
      `update clientes set favorite_class_type_id = (select id from class_type where gym_id = $1 order by name limit 1)
       where id = $2`,
      [GYM_ID, FIXTURES.clienteId],
    );

    // ---- public content ------------------------------------------------------------
    // /nosotros, /precios and /contacto each read specific content tables. A page that
    // renders an empty state is a page whose real cost we did NOT measure.
    await db.query(
      `insert into about_value (gym_id, title, description, sort_order)
       select $1, v.title, v.description, v.ord
       from (values
         ('Técnica primero',   'Nadie carga peso que no puede mover bien. La progresión se gana.', 0),
         ('Comunidad real',    'Entrenas al lado de gente que se sabe tu nombre.', 1),
         ('Sin ego',           'El único marcador que importa es el tuyo de la semana pasada.', 2),
         ('Coaching cercano',  'Grupos chicos. Siempre hay un coach viéndote levantar.', 3),
         ('Constancia',        'Tres días a la semana, todo el año, le gana a un mes perfecto.', 4),
         ('Datos, no humo',    'Medimos cargas y asistencia. Lo que no se mide, no mejora.', 5)
       ) as v(title, description, ord)`,
      [GYM_ID],
    );

    await db.query(
      `insert into facility (gym_id, name, description, sort_order)
       select $1, f.name, f.description, f.ord
       from (values
         ('Zona de barras',     '8 racks con plataforma, barras olímpicas y discos de goma.', 0),
         ('Área de metcon',     'Remos, bicicletas de aire y espacio abierto para circuitos.', 1),
         ('Pesas rusas',        'Juego completo de 8 a 48 kg.', 2),
         ('Zona de movilidad',  'Rodillos, bandas y espacio para trabajo articular.', 3),
         ('Regaderas',          'Vestidores con lockers y regaderas de agua caliente.', 4),
         ('Estacionamiento',    'Cajones gratuitos para socios.', 5)
       ) as f(name, description, ord)`,
      [GYM_ID],
    );

    await db.query(
      `insert into stat (gym_id, label, value, sort_order)
       select $1, s.label, s.value, s.ord
       from (values
         ('Socios activos', '480', 0),
         ('Coaches',        '6',   1),
         ('Clases/semana',  '49',  2),
         ('Años abiertos',  '7',   3)
       ) as s(label, value, ord)`,
      [GYM_ID],
    );

    await db.query(
      `insert into faq (gym_id, question, answer, sort_order)
       select $1, f.q, f.a, f.ord
       from (values
         ('¿Necesito experiencia previa?', 'No. Cada clase tiene escalas y un coach que te las ajusta.', 0),
         ('¿Cuántas veces por semana debo venir?', 'Tres sesiones semanales es el punto donde la mayoría ve progreso sostenido.', 1),
         ('¿Puedo congelar mi paquete?', 'Sí, hasta 15 días al año avisando con 48 horas.', 2),
         ('¿Hay contrato forzoso?', 'No. Todos los planes son sin permanencia.', 3),
         ('¿Qué llevo a mi primera clase?', 'Ropa deportiva, agua y tenis planos si tienes.', 4),
         ('¿Tienen regaderas?', 'Sí, en ambos vestidores, con lockers.', 5),
         ('¿Puedo pagar en el gimnasio?', 'Sí. Aceptamos efectivo, transferencia y tarjeta.', 6),
         ('¿Cómo reservo una clase?', 'Desde la app, en la pestaña Reservar. Los lugares se liberan 7 días antes.', 7)
       ) as f(q, a, ord)`,
      [GYM_ID],
    );

    await db.query(
      `insert into gym_contact (gym_id, address_line, address_note, latitude, longitude, whatsapp, email, instagram, hours)
       values ($1, 'Av. Tecnológico 1234, Col. Centro, Chihuahua', 'Entrada por la calle lateral, junto a la cafetería.',
               28.6353, -106.0889, '5215550000001', 'hola@forgedemo.local', 'forgedemo',
               $2::jsonb)`,
      [
        GYM_ID,
        JSON.stringify({
          lunes: "06:00-21:00",
          martes: "06:00-21:00",
          miercoles: "06:00-21:00",
          jueves: "06:00-21:00",
          viernes: "06:00-21:00",
          sabado: "08:00-14:00",
          domingo: "cerrado",
        }),
      ],
    );

    await db.query(
      `insert into contact_message (gym_id, nombre, correo, mensaje, created_at)
       select $1, 'Prospecto ' || i, 'prospecto' || i || '@perf.local',
              'Hola, quiero información sobre los paquetes y horarios de la mañana.',
              now() - (i || ' days')::interval
       from generate_series(1, 20) i`,
      [GYM_ID],
    );

    await db.query(
      `insert into perfil (gym_id, negocio, coach, tel, ciudad)
       values ($1, 'Forge Demo', 'Ana Rivera', '5550000001', 'Chihuahua')`,
      [GYM_ID],
    );

    await db.query(
      `insert into cobro (gym_id, titular, banco, clabe, acepta_efectivo, acepta_transferencia, acepta_tarjeta)
       values ($1, 'Forge Demo SA de CV', 'BBVA', '012345678901234567', true, true, true)`,
      [GYM_ID],
    );

    await db.query(
      `insert into plantillas (gym_id, nombre, body)
       select $1, p.nombre, p.body
       from (values
         ('Bienvenida',   'Hola {{nombre}}, ¡bienvenido a Forge! Tu paquete queda activo hoy.'),
         ('Por vencer',   'Hola {{nombre}}, tu paquete vence el {{vence}}. ¿Lo renovamos?'),
         ('Te extrañamos','Hola {{nombre}}, hace rato no te vemos. Tu lugar sigue aquí.')
       ) as p(nombre, body)`,
      [GYM_ID],
    );

    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }

  const { rows } = await db.query(
    `select
       (select count(*) from clientes      where gym_id = $1) as clientes,
       (select count(*) from ventas        where gym_id = $1) as ventas,
       (select count(*) from asistencias   where gym_id = $1) as asistencias,
       (select count(*) from class_session where gym_id = $1) as class_session,
       (select count(*) from reservation   where gym_id = $1) as reservation,
       (select count(*) from paquetes      where gym_id = $1) as paquetes,
       (select count(*) from class_type    where gym_id = $1) as class_type,
       (select count(*) from coach         where gym_id = $1) as coach,
       (select count(*) from asistencias   where gym_id = $1
          and fecha = (now() at time zone (select timezone from gym where id = $1))::date) as asistencias_hoy,
       (select count(*) from class_session where gym_id = $1
          and (starts_at at time zone (select timezone from gym where id = $1))::date
              = (now() at time zone (select timezone from gym where id = $1))::date) as sesiones_hoy`,
    [GYM_ID],
  );

  await db.end();

  console.log(`\nseeded gym "${GYM_SLUG}" (${GYM_ID}):`);
  for (const [table, count] of Object.entries(rows[0])) {
    console.log(`  ${table.padEnd(16)} ${count}`);
  }
  console.log(
    `\n  fixture cliente ${FIXTURES.clienteId}\n  fixture session ${FIXTURES.sessionId}\n`,
  );
}

await main();
