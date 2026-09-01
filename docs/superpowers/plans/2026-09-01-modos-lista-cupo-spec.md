# Modos Lista / Cupo — two doors on one product

Status: SPEC (grilled 2026-09-01, 3 rounds, owner-confirmed). Idea doc: the owner's
"Lista and Cupo — the idea, not the how" (2026-09-01). Research inputs: admin home-screen
route (`docs/research/admin-home-screen-route.md`), opus research on non-booking member
surfaces (in-session, cited), live counts 2026-09-01.

## Problem Statement

Two real gyms run the same product and neither feels it was built for them.

Forge (the "Lista" shape) has no capacity problem. The owner opens the app after class,
marks who came from the roster, and charges when a paquete runs out. He is shown a schedule
he does not maintain, a desk that preselects a class he did not pick, a member app that
invites people to book seats nobody fights over, and account settings for coaches and
plantillas he never touches. He rejected class-by-class attendance because it changed the
unit of his job, not because it was new.

RED (the "Cupo" shape) has classes that fill. The owner's first need at the desk is the
schedule with numbers on it, and her members' first need is a seat. Today her home screen
is a metrics dashboard with the schedule two taps away, and taking attendance means
landing on today's roster with a ±90-minute guess at which class is meant.

There is one flag in the database already (`gym.booking_enabled`, off for forge) but only
the member app reads it. The admin app has no notion of mode at all.

## Solution

One product, two doors. The roster, paquetes, ventas and the month's numbers are shared.
What changes is the door: on **Lista** you mark who arrived; on **Cupo** people take a place
before they arrive.

- The mode is the existing `booking_enabled` flag, derived once as `modo: 'lista' | 'cupo'`
  and read by both apps.
- **Admin home** is rebuilt on the current skin with the structure already proven in the
  mobile-admin lane: a day card whose hero is the class closest to now, with the count
  inside and the PASAR LISTA action attached, the classes still ahead listed under it, then
  the action pair, MEMBRESÍAS, and the online strip. On Lista the day card's hero is the
  standalone PASE DE LISTA action and "Apartar lugar" does not exist. Everything below the
  hero is identical in both modes.
- **Navigation** on Lista replaces AGENDA with VENDER. Cupo keeps today's five tabs.
- **Desk** on Lista is ACCESO LIBRE by mode: it never reads sessions, never shows class
  pills. Desk on Cupo opens with an entry step (which date, which class, or ACCESO LIBRE)
  that is skipped when the owner arrives from the home hero with a session already chosen.
- **Cuenta** on Lista hides Clases, Coaches, Plantillas and Horarios. Both modes get a
  "Reservas en línea" switch behind a confirm sheet that says in plain words what changes
  for the owner and for the members.
- **Member app** on Lista becomes a public page (prices, hours, location, WhatsApp) plus a
  single saldo screen behind the existing login. Booking routes do not exist on Lista.
  Cupo is unchanged.
- Forge's never-used schedule is retired (templates deactivated, future sessions deleted,
  history kept). Demo twins mirror their parent's mode.

Onboarding will later be the thing that segments a new gym into a door. Nothing in this
spec is a preference toggle; switching is a transition with consequences named out loud.

## User Stories

Lista owner (admin)

1. As a Lista owner, I want the home screen to lead with PASE DE LISTA, so that marking today is one tap from opening the app.
2. As a Lista owner, I want no schedule, no class pills and no "A CONTINUACIÓN" copy anywhere, so that the app does not talk as if my people book.
3. As a Lista owner, I want VENDER in the tab bar where AGENDA used to be, so that charging is as reachable as marking.
4. As a Lista owner, I want the desk to open straight on today's roster in ACCESO LIBRE, so that I mark names like a notebook without picking a class first.
5. As a Lista owner, I want the desk to keep past-day capture (captura tardía) exactly as it works today, so that transcribing after class still works.
6. As a Lista owner, I want Cuenta to show only paquetes, contenido, identidad legal, mensajes and respaldo, so that I am not configuring coaches and plantillas I do not have.
7. As a Lista owner, I want a "Reservas en línea" row in Cuenta that I can turn on, so that when classes start filling I can open the agenda and let members book, without asking anyone.
8. As a Lista owner turning bookings on, I want the sheet to tell me the agenda will appear and members will be able to reserve, so that I know what changes before I confirm.
9. As a Lista owner who just turned bookings on, I want the agenda to open empty with "toca + para crear una", so that nothing hollow is seeded on my behalf.
10. As a Lista owner, I want MEMBRESÍAS, por renovar, aún a tiempo and registros en línea to keep working exactly as on Cupo, so that the money side of my day is untouched.
11. As a Lista owner, I want my paquetes to keep saying "clases", so that the app uses the words on my real price list.

Cupo owner (admin)

12. As a Cupo owner, I want the home to open on the class closest to now with "N/M dentro" and a PASAR LISTA button on it, so that the schedule with numbers is the first thing I see.
13. As a Cupo owner, I want the classes still ahead today listed under the hero with their counts, so that I can see which one is filling without opening the agenda.
14. As a Cupo owner, I want the hero to say EN CURSO, A CONTINUACIÓN or TERMINÓ by the clock, so that the card never asserts a state it cannot know.
15. As a Cupo owner, I want tapping a class row to open that session in the agenda, so that the peek list is also navigation.
16. As a Cupo owner, I want "Apartar lugar" next to "+ Nuevo cliente", so that a walk-in reservation is one tap from home.
17. As a Cupo owner, I want the AGENDA tab and every agenda flow (crear, series, horario, reserva manual, cancelar) unchanged, so that nothing I already use moves.
18. As a Cupo owner opening the desk from the tab bar, I want to be asked which date and which class before I see names, so that the roster I mark is the one I meant.
19. As a Cupo owner, I want the entry step to offer ACCESO LIBRE as the last option, so that a walk-in without a class is still markable at the door.
20. As a Cupo owner, I want the entry step to allow today and past days only, so that attendance can never be stamped on a date that has not happened.
21. As a Cupo owner arriving at the desk from the home hero, I want the entry step skipped and that class already chosen, so that the common path stays one tap.
22. As a Cupo owner, I want a "Reservas en línea" row in Cuenta that I can turn off, so that I can stop bookings if I stop needing them.
23. As a Cupo owner turning bookings off, I want the sheet to tell me the agenda disappears, members stop reserving, and exactly how many future reservations will be cancelled, so that nobody is surprised.
24. As a Cupo owner turning bookings off, I want those future reservations cancelled through the same path a member cancellation uses, so that balances come back the way they always do.
25. As a Cupo owner, I want the home's day card to fall back to a standalone PASE DE LISTA when the day is over, has no classes, or the schedule read failed, so that an unmaintained schedule never costs me the desk.

Members

26. As a member of a Lista gym, I want the gym's public page to show prices, hours, location and a WhatsApp button, so that I can find what I need without an account.
27. As a member of a Lista gym, I want no "Reservar", no schedule teaser and no class list anywhere, so that I am never asked to book a seat.
28. As a member of a Lista gym with an account, I want to log in and land on one screen with my plan, clases restantes, vence date and a WhatsApp "renovar" button, so that I can check where I stand.
29. As a member of a Lista gym, I want the drawer to point at that saldo screen instead of "Reservar clase", so that the navigation matches what the gym does.
30. As a member of a Lista gym, I want any old booking link (`/reservar`, `/clase/…`, `/confirmada/…`) to send me to the saldo screen, so that stale links do not open a door that does not exist.
31. As a member of a Cupo gym, I want everything to stay exactly as it is today, so that my booking routine is not disturbed.
32. As a member of a gym that just switched from Cupo to Lista, I want my future reservation cancelled with the class returned to my balance, so that I lose nothing.
33. As a member of a gym that just switched from Lista to Cupo, I want the booking surface to appear at my next visit, so that I can start taking places.

Owner of the platform / operator of tenants

34. As the platform owner, I want the mode to be the existing `booking_enabled` flag and nothing else, so that there is one fact and it cannot drift.
35. As the platform owner, I want forge's plantillas deactivated and its future sessions deleted while its history stays, so that the weekly horizon cron stops growing a schedule nobody uses and forge's monthly analysis is untouched.
36. As the platform owner, I want forge-demo and red-demo to carry their parent's mode, so that rehearsing a tester's screens is faithful.
37. As the platform owner, I want the hours text editable from Cuenta like the rest of the gym content, so that no Lista gym needs me to publish its opening hours.
38. As a future onboarding flow, I want the mode to be one column I set at provisioning, so that segmenting a new gym is a write, not a feature.

## Implementation Decisions

Mode

- The mode is `gym.booking_enabled`. No new column. `@gym/domain` exposes one derivation
  `modo(booking_enabled) → 'lista' | 'cupo'` and every surface branches on that value, never
  on the raw boolean or on "does this day have sessions".
- Admin reads it by adding the column to the operator-gym read; the value rides through the
  app layout to the tab bar and to each page. The member app already receives it as
  `reservasHabilitadas`; that stays.
- The `x-gym` / `x-brand` tenant seam (ADR-0012) is untouched. Mode is a property of the
  resolved gym, not of the host.

Admin home

- Rebuilt on main's current skin, taking the structure (not the visuals) of the
  mobile-admin lane's inicio: header (date, gym name, account initial) → day card → 50/50
  action pair → MEMBRESÍAS merged renewal card with the cubo row → registros-online strip
  (hidden at 0). The old hero/sparkline, VIGENTES and SEMANA·INGRESOS tiles, and the
  "últimas asistencias" list are removed from home (the desk rows already carry today's
  check-ins; the month view lives in Cuenta).
- The day-card view-model is the lane's ladder: live → ±90-nearest → next-upcoming, one hero,
  only classes still ahead beneath it, tense by the clock, `null` when nothing is left. It
  is built from the existing day-agenda read and today's visits. It reuses `enCurso` and
  `sesionMasCercana`, which move into `@gym/domain` (the lane already extracted them for this
  exact second caller; the desk's `sesionCercana` wrapper becomes a consumer). `nombreSesion`
  and the day-header formatter move into the shared packages the same way. These four are
  the only pieces lifted from the lane; nothing else from the reskin lands.
- On Lista the day card is forced to its no-hero arm: standalone PASE DE LISTA; the action
  pair collapses to "+ Nuevo cliente" full width; the agenda read is not made at all.
- On Cupo the standalone PASE DE LISTA arm survives for day-over / no-classes / failed-read.

Navigation

- The tab list becomes a function of mode. Cupo: INICIO, CLIENTES, ASIST (primary), AGENDA,
  CUENTA. Lista: INICIO, CLIENTES, ASIST (primary), VENDER, CUENTA. The `/agenda` route
  itself redirects to `/inicio` on Lista so a typed or stale URL cannot open it.

Desk

- Lista: the desk never issues the day-agenda or reservations reads; context is ACCESO
  LIBRE for every visit. Past-day capture, cooldown, pardon and the zero-balance gate are
  unchanged (#89, #237).
- Cupo: a new entry step precedes the roster when the desk is opened without a session:
  date (today, or a past day through the existing date control; future days are not
  offered), then the sessions of that date with their counts, then ACCESO LIBRE last.
  Choosing writes nothing; it only fixes the roster's context. Opening the desk with
  `?sesion=` (from the home hero or a peek row) skips the step. The write path is untouched:
  the same three-argument toggle delegating to `pasar_lista_sesion`.

Cuenta

- Lista hides the Clases, Coaches, Plantillas and Horarios entries. Paquetes, contenido,
  identidad legal, mensajes and respaldo stay.
- New "Reservas en línea" row in both modes, showing state, opening a confirm sheet whose
  copy is a pure function of the direction and the count of future reservations:
  - Lista → Cupo: agenda appears, members can reserve from the app. No seeding.
  - Cupo → Lista: agenda disappears, members stop reserving, "se cancelarán N reservas
    futuras". Zero N still shows the sheet.
- The switch is ONE write RPC (`cambiar_modo_reservas` or similar; final name at build):
  in a single transaction it flips `booking_enabled` and, when turning off, cancels every
  future non-cancelled reservation of the gym through the same state the member cancel
  path produces (balance returned, cancellation reason recorded as the mode change). It is
  staff-only, gym-scoped through the caller's membership, idempotent on the target state,
  and returns the number cancelled. It follows ADR-0005 (one atomic write RPC per
  transition) and lives in the canonical function set with a denial suite.
- Gym content gains one text field for opening hours, edited in the existing contenido
  sheet, shown on the Lista public page. Cupo may fill it too; it is content, not mode.

Member app

- New route `/saldo`: plan name, clases restantes (∞ for ilimitado), vence date, and a
  WhatsApp "renovar" deep link to the gym's number. Built from the existing saldo and
  membership reads; no new RPC. Auth-gated like `/reservar`.
- On Lista: login lands on `/saldo`; the drawer's "Clases" entry and the footer CTA point at
  `/saldo` ("Mi saldo"); `/reservar`, `/clase/[id]`, `/confirmada/[id]` redirect to `/saldo`;
  the public landing drops the schedule teaser and shows hours, prices, location, WhatsApp.
  The server-side booking refusal already in `reservar_clase` remains the last line.
- On Cupo: nothing changes. `/saldo` exists but nothing links to it (the overlay stays).

Data

- Forge: hand-run SQL, not a migration: set `is_active = false` on forge's plantillas;
  delete forge's sessions with `starts_at > now()` (cascading their walk-in reservation
  rows); keep every past session, attendance link and reservation. forge-demo the same.
- Demo twins: `forge-demo.booking_enabled = false`; `red-demo` stays true.
- The weekly horizon cron needs no change: inactive plantillas materialise nothing.

## Testing Decisions

A good test here asserts what an owner or member sees or what rows exist afterwards, never
which component or helper produced it.

Seams (all existing, none new):

1. **Pure view-models under vitest**: `modo` derivation; the tab list by mode; the home
   day-card ladder (hero choice, tense, ahead-only rows, null arms, Lista forcing); the desk
   entry-step state (date bounds, session list, LIBRE last, skip on `?sesion=`); the
   switch-sheet copy by direction and count; the Lista public-landing composition. Prior
   art: the lane's `inicio-vm.test.ts`, the desk's `marcadas.test.ts`, `clientes-vm.test.ts`.
2. **The switch RPC in `test:denial`**: a suite in `supabase/tests/` that seeds a gym with
   future and past reservations, calls the RPC both ways, and asserts the written rows:
   `booking_enabled` flipped, future reservations in the cancelled state with balance
   returned, past ones untouched, other gyms untouched, non-staff refused, second call a
   no-op. Registered in `rpc-coverage.json` (the write-coverage guard demands it). Run green
   on scratch or the local docker path before fast-forward.
3. **Member routing** through the existing `reserva-vista` tests extended for the Lista
   landing and CTA targets.
4. **`test:e2e`** on red-demo, unchanged: a Cupo member still logs in and lands on
   `/reservar`.

Owner walk on both tester gyms after deploy (forge on Lista, red on Cupo) is the acceptance
gate for "feels built for me"; it cannot be automated.

## Out of Scope

- Onboarding's mode question (epic #309 lane) — this spec only makes the column the thing
  it will write.
- Schedule import from image/spreadsheet/PDF and the agenda walkthrough after switching to
  Cupo (owner ruling Q23: own spec later, no placeholder button).
- A low-balance / expiry notification for Lista members (follow-up ticket; research says
  the balance reaches members by push channel, not by a screen).
- Any visual reskin. The mobile-admin worktree does not merge; only the four helpers named
  above are lifted.
- Renaming "clases" to "visitas" (owner ruling Q5: forge's real price list says clases).
- Changing the desk's write semantics, cooldown, or past-day rules (#89, #168, #234, #278).
- A third mode or per-day mixing. "Both, depends on the day" starts on Lista.
- Halting or altering the horizon cron.

## Further Notes

- Live counts 2026-09-01 that justify the member-side call: forge 50 clientes, 2 accounts,
  0 member bookings ever; red 66 clientes, 38 accounts, 179 reservations in 30 days. The
  Cupo overlay went unnoticed by daily bookers; a Lista status screen would be read by
  roughly nobody, so the public page is the deliverable and `/saldo` is the cheap door.
- forge's 67 "reservations" in the last 30 days are walk-in rows the class-aware desk
  creates on class-linked marks, not member bookings. They are exactly the rows the
  future-session delete removes.
- The home research (2026-08-16) ended on "R1: does home adapt per gym?". This spec is
  the R1 ruling: yes, by mode, and only the hero adapts.
- Initiative label: `modos-lista-cupo-2026-09`.
