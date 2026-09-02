# Señal gym — freshness spec (2026-09-01)

Source audit: `docs/FIndings/2026-09-01-freshness-audit-realtime-verdict.md`.
Plan: `docs/superpowers/plans/2026-09-01-senal-gym-freshness-plan.md`.

## Problem

Staff and members must reload the page to see anybody else's change. The member app has
zero in-place freshness (`router.refresh()` fires only after the user's OWN book/cancel);
the admin app has exactly one poll, on the door screen, every 5 minutes, which fires even
when the tab is hidden. A staff agenda card can read 8/12 while members book seats 9–12.

## Decision

**"Signal, not data", on the Supabase Free plan.** A Postgres AFTER-STATEMENT trigger on the
cross-user tables calls `realtime.send` to a private topic `gym:<gym_id>`, at most ONE message
per gym per transaction. Each browser tab holds one Realtime subscription and answers a signal
with a debounced `router.refresh()`. Beneath it ships the free floor: refetch on
`visibilitychange`, and gate the existing door poll on tab visibility.

The message carries no data (`{"t":"<tabla>"}`) — the refresh re-reads through the existing
`server-only` DAL, so RLS stays the boundary and no payload can leak across tenants.

## Facts established before writing this (verified against the live catalog or the repo)

| Fact | Evidence |
|---|---|
| `realtime.send(payload jsonb, event text, topic text, private boolean default true)` is SECURITY INVOKER and swallows every error (`WHEN OTHERS → RAISE WARNING`) | live `pg_get_functiondef`; owner `supabase_realtime_admin` |
| `realtime.topic()` exists (`select nullif(current_setting('realtime.topic', true), '')::text`), and `realtime.send` itself does `SET LOCAL realtime.topic` before inserting | live `pg_get_functiondef` |
| `realtime.messages` has RLS ON and **0 policies**; `authenticated` already holds `arw` on it and `USAGE` on schema `realtime` | live `pg_class.relacl`, `pg_namespace.nspacl`, `pg_policies` |
| `postgres` has `rolbypassrls = true`, is **not** superuser, and is **not** a member of `supabase_realtime_admin` | live `pg_roles`, `pg_auth_members` |
| The migration apply path runs as `postgres` (`current_user`), and `create policy … on realtime.messages` **succeeds** as `postgres` | probed live inside `begin … rollback` |
| `postgres` **cannot** `create table … partition of realtime.messages` — `42501 permission denied for schema realtime` | probed live inside `begin … rollback` |
| `realtime.messages` is RANGE-partitioned on `inserted_at` (`timestamp without time zone`) and **has 0 partitions today**, so `realtime.send` currently writes **0 rows** and swallows the failure | live `pg_get_partkeydef`, `pg_inherits`, probe |
| The Realtime **service**, not SQL, owns those partitions: it creates **yesterday..today+3** when it provisions a tenant's connection — i.e. on the **first client subscribe**. The Janitor only DELETES partitions older than 72h; it never extends the window | `supabase/realtime`: `lib/realtime/tenants/connect.ex`, `lib/realtime/tenants.ex` |
| Postgres refuses `after insert or update or delete … referencing …`: *"transition tables cannot be specified for triggers with more than one event"* | probed live on a temp table |
| One plpgsql function branching on `TG_OP` over `n`/`o` works under `set search_path = ''` — transition tables resolve from the query environment, and the untaken branch is never planned | probed live: 3 single-event triggers + GUC dedupe emitted exactly once per gym across insert+update+delete |
| An UPDATE trigger may take BOTH transition tables, and a `gym_id` move then signals the old gym and the new one | probed live: `referencing old table as o new table as n`, both GUCs set |
| `public.is_member_of(p_gym uuid)` is `security definer set search_path = ''`, EXECUTE revoked from `public, anon`, granted to `authenticated` | `supabase/migrations/20260702161010_create_gym_membership.sql:34,67,70` |
| `gym_id` is **NOT NULL** on all five signalled tables — `reservation` and `class_session` from creation, `clientes` / `ventas` / `asistencias` since the expand-backfill-enforce migration | `20260702161613_gym_id_expand_tenant_tables.sql:236-238` |
| Browser Supabase client is a singleton per tab; supabase-js pushes a refreshed JWT to open channels on `TOKEN_REFRESHED` | audit §"Main-session validation" |
| `realtime-js@2.106.2` exposes `setAuth(token?: string \| null): Promise<void>` and the string enum `REALTIME_SUBSCRIBE_STATES`, re-exported by `@supabase/supabase-js` | `node_modules/.pnpm/@supabase+realtime-js@2.106.2/.../RealtimeClient.d.ts:259`, `RealtimeChannel.d.ts:128` |
| Repo has **no** jsdom and **no** testing-library; every vitest project is `environment: "node"` | `vitest.config.ts` |

## Requirements

### R1 — Migration `senal_gym`

`supabase/migrations/20260901120000_senal_gym.sql`.

1. `public.senal_gym()` — `returns trigger`, `language plpgsql`, `security definer`,
   `set search_path = ''`. Collects the affected gyms by `TG_OP` — `INSERT` from `n`, `DELETE`
   from `o`, `UPDATE` from the **union of both** so a row whose `gym_id` moves signals the gym it
   left as well as the one it joined (the old gym's roster shrank, and no later write to that row
   will ever mention it again) — then, per distinct `gym_id`:
   - dedupe key `'senal.g_' || replace(gym_id::text, '-', '')`;
   - skip when `coalesce(current_setting(<key>, true), '') <> ''`;
   - else `perform set_config(<key>, '1', true)` (transaction-local) and
     `perform realtime.send(jsonb_build_object('t', tg_table_name), 'cambio', 'gym:' || gym_id::text, true)`.
   - `return null` — an AFTER STATEMENT trigger's return value is ignored.
   - `realtime.send` itself stamps its own `id` key into the row's `payload` (a `gen_random_uuid()`
     it generates, not one this migration sets), so the browser's `.on('broadcast', …)` handler and
     the R2 suite both see exactly two keys, `{"t", "id"}` — the suite asserts the payload minus
     `t` minus `id` is empty, not just that `t` is present.
2. `alter function public.senal_gym() owner to postgres;` — the insert into `realtime.messages`
   only lands because the definer is a `rolbypassrls` role. It is a no-op on the apply path
   (already `postgres`) and an assertion for every other path.
3. **Three** triggers per table — `after insert … referencing new table as n`,
   `after update … referencing old table as o new table as n`,
   `after delete … referencing old table as o`, each `for each statement` — because Postgres
   refuses transition tables on a multi-event trigger. Emitted from one `do` loop over the table
   list, `drop trigger if exists` first so the migration is re-runnable.
   Tables: `reservation`, `class_session`, `clientes`, `ventas`, `asistencias`.
   `class_session_coach` is **skipped**: it carries no `gym_id`, and every write to it rides in a
   transaction that also writes `class_session`, which sends the message anyway.
   `gym_id` is NOT NULL on all five, so the `where gym_id is not null` filter is belt-and-braces
   and is stated as such in the migration: it exists so a future expand-only migration that adds
   a sixth table ahead of its backfill skips the unscoped rows rather than broadcasting to the
   literal topic `gym:` and poisoning the dedupe GUC.
4. `public.senal_topic_gym(p_topic text) returns uuid` — `immutable strict`, plpgsql, returns
   `substring(p_topic from 5)::uuid`, and `null` on any exception. Guards the policy against a
   topic that is not `gym:<uuid>`: a `22P02` raised inside a policy breaks the subscribe instead
   of denying it.
5. One policy on `realtime.messages`:

   ```sql
   create policy senal_gym_select on realtime.messages
     for select to authenticated
     using (
       realtime.topic() like 'gym:%'
       and public.is_member_of(public.senal_topic_gym(realtime.topic()))
     );
   ```

   `is_member_of(null)` is false, so a malformed topic denies rather than errors.
6. **No `grant select on realtime.messages to authenticated`** — it already holds `arw`
   (verified above). **No `grant usage on schema realtime`** — it already holds `USAGE`. Stated
   here so their absence reads as a decision, not an omission.
7. EXECUTE hygiene, house style (mirrors `20260702161010`): revoke from `public, anon` on both
   new functions; grant `public.senal_topic_gym(text)` to `authenticated`, because the policy
   expression is evaluated as that role. `public.senal_gym()` is granted to nobody — a trigger
   function's EXECUTE is checked at `create trigger` time, never at fire time, and the R2 suite
   proves it by firing the trigger from an `authenticated` session.

**The migration must NOT create partitions, and cannot.** `realtime.messages` has zero partitions
today; `postgres` has no CREATE on schema `realtime` (42501, verified). The Realtime service
creates yesterday..today+3 when it provisions the tenant connection — on the first client
subscribe — so the correct order is *subscribe, then verify*, and R7 makes that a named step
rather than an assumption. Until one tab subscribes, every `realtime.send` writes 0 rows and
swallows the failure.

### R2 — SQL suite `supabase/tests/senal_gym.sql`

Same self-asserting idiom as the existing suites: one `begin … rollback`, transaction-local
fixtures, zero hardcoded prod UUIDs, `raise exception` on every mismatch, one `select 'OK'` row at
the end. Role/claims switching uses the established pattern
(`supabase/tests/reservar_clase_rules.sql`, tail):

```sql
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.m_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
…
reset role;
```

Vectors:

1. **Partition precondition.** Create today's partition
   (`realtime.messages_YYYY_MM_DD`, `for values from (current_date) to (current_date + 1)`) if
   absent. On `insufficient_privilege`, `raise exception` naming the local-docker requirement —
   this suite needs a superuser DB, and the cloud scratch path (role `postgres`) is not one.
2. **Emits once.** The seed's own writes already fired the rail, so first clear both sides —
   `delete from realtime.messages where topic like 'gym:%'` and reset gym A's dedupe GUC to `''`
   — then a member of gym A calls `reservar_clase(session)` **once**. Read back as `postgres`:
   the written rows moved (one `reservada` row, balance 5→4 — asserted on the rows, not on the
   RPC's return value, per #78/#80), and there is exactly **1** row in `realtime.messages` with
   `topic = 'gym:<A>'`, `event = 'cambio'`, `private = true`. Measured before/after that one call,
   which is the production shape — one HTTP request is one transaction — and which is what makes
   "two triggered tables, one message" a real assertion rather than an artefact of the seed.
3. **Dedupe.** A second booking in the same transaction (another session) adds **0** rows for
   gym A.
4. **Policy grants.** `set_config('realtime.topic', 'gym:<A>', true)`, claims of gym A's member,
   `set local role authenticated` → the count for `topic = 'gym:<A>'` is 1.
5. **Policy denies.** Same GUC (`gym:<A>`), claims of a member of gym B → 0 rows.
6. **Malformed topic denies, never errors.** GUC `'gym:no-soy-uuid'`, claims of gym A's member →
   0 rows and no exception.

The count is always filtered on the `topic` column, because the policy's `USING` is
row-independent — it authorizes a whole topic subscription, not individual rows, which is how
Supabase Realtime evaluates it.

**Registration.** Added to `run-denial-suite.mjs`'s `SUITE` — required, because
`tools/guards/denial-suite-drift.test.ts` fails on any `.sql` in neither `SUITE` nor `QUARANTINE`.
**Not** added to `supabase/tests/rpc-coverage.json`: `tools/guards/denial-suite.ts` derives the
obligation set from the migrations and classifies a body as a writer only on
`insert into` / `delete from` / `merge into` / `update … set`, or transitively through another
`public` writer. `senal_gym()`'s body has none — its only write goes through `realtime.send`,
which is not in the `public` census — so it derives as a pure reader, and the coverage guard's
*"the coverage map lists no pure reader and no phantom function"* test would FAIL if it were
listed.

**Also required by the guards:** `pnpm gen:rpc-canon`, because `tools/guards/rpc-canon-drift.test.ts`
demands a committed `supabase/functions-canonical/<name>.sql` for every surviving `public`
function — two new files, `senal_gym.sql` and `senal_topic_gym.sql`.

### R3 — Hook + busy set: `packages/data/src/client-senal.ts`

New subpath export `"./client-senal": "./src/client-senal.ts"` in `packages/data/package.json`.
`tools/guards/manifests.test.ts` forbids only wildcards in that map, so an explicit entry is fine.
No `server-only` import — this module is browser code, and it sits beside `client.ts` for exactly
that reason.

Exports:

```ts
export type MotivoSenal = "senal" | "visible" | "rejoin";
export const senalBusy: Set<string>;
export function ocuparSenal(key: string): void;
export function liberarSenal(key: string): void;
export interface Regulador { pedir(m: MotivoSenal): void; destruir(): void }
export function crearRegulador(onSenal: (m: MotivoSenal) => void, debounceMs: number): Regulador;
export function useSenalGym(opts: {
  gymId: string | null | undefined;
  onSenal: (m: MotivoSenal) => void;
  debounceMs?: number;   // default 600
}): void;
```

Behaviour:

- `crearRegulador` holds the whole decision, and it is plain TypeScript with no React and no DOM
  — that is what makes R3 testable at all in a repo with no jsdom. `pedir` records the motive and
  (re)arms a trailing `setTimeout`. On fire: if `senalBusy.size > 0` the motive stays pending and
  nothing runs; else it fires `onSenal(motivo)`. `liberarSenal(key)` deletes the key and, when the
  set is empty, calls an internal `vaciar()` on every live regulador — **not** on the exported
  `Regulador`, since nothing outside this module has a reason to call it — which re-requests any
  pending motive through the SAME trailing debounce via `pedir`, rather than flushing it
  synchronously: a burst of releases (twenty door taps closing in quick succession) must still
  collapse into one refresh, `debounceMs` after the LAST release, exactly like a burst of `pedir()`
  calls does. `destruir` clears the timer, drops the pending motive, and unregisters.
- `useSenalGym` no-ops when `gymId` is falsy. Inside one effect keyed on `[gymId, debounceMs]`:
  `await supabase.auth.getSession()` first, and **return without subscribing when there is no
  session** — an unauthenticated visitor must not open a socket; then
  `await supabase.realtime.setAuth()`; then
  `.channel('gym:' + gymId, { config: { private: true } })`
  `.on('broadcast', { event: 'cambio' }, …)` → `pedir("senal")`;
  `.subscribe(estado => …)` → on `SUBSCRIBED` *after a prior* `SUBSCRIBED` (a rejoin following a
  close), `pedir("rejoin")`; on `CHANNEL_ERROR` or `TIMED_OUT`, one
  `console.warn("[senal] canal", estado)` — otherwise a denied policy, a missing partition and a
  dropped socket are all indistinguishable from "nobody wrote anything".
- A `visibilitychange` listener calls `pedir("visible")` whenever the document becomes visible.
  It is attached **inside the session guard**, after `getSession` returns a session — a signed-out
  tab must not fire `onSenal` either, and a `router.refresh()` on a public route buys nothing.
- Cleanup removes the listener, destroys the regulador, and `supabase.removeChannel(canal)`.
- `onSenal` is held in a ref so a caller passing an inline arrow does not re-subscribe per render.

Unit test `packages/data/src/client-senal.test.ts` (vitest `data` project, node env, fake timers,
`vi.mock("./client")`): a burst collapses into one call; a call while busy stays pending and fires
on release; `destruir` cancels a pending fire; the last motive wins.

### R4 — Admin mount

`apps/admin/src/app/(app)/_components/senal-gym.tsx` — `"use client"`, renders `null`, calls
`useSenalGym({ gymId, onSenal })` where `onSenal` returns early unless
`document.visibilityState === "visible"`, else `router.refresh()`.

Mounted in `apps/admin/src/app/(app)/layout.tsx` with the gym the layout ALREADY resolves —
`gymEnEfecto` (`decision.kind === "render" ? gyms.find(g => g.slug === decision.gym) : undefined`).
No new server read. Rendered only when `gymEnEfecto` is defined, so the `none` / `choose` /
`redirect` arms never mount it.

It lives under `_components/` because `tools/guards/client-seam.test.ts` fails any app
`"use client"` file outside `_components/` or its two-entry allow-list.

### R5 — Door poll gate + busy wiring

- `apps/admin/src/app/(app)/asistencia/_components/asistencia.tsx:135-140` — the interval callback
  returns early unless `document.visibilityState === "visible"`, keeping the existing
  `inFlight.current.size === 0` guard. A staff phone returning from the lock screen is then
  freshened by the hook's `visible` motive instead of by a blind timer.
- Same file, `onTap`: `ocuparSenal(key)` beside `inFlight.current.add(key)`, `liberarSenal(key)`
  beside the `finally` delete — reusing the existing `` `${selIso}:${c.id}` `` key
  (`asistencia.tsx:335`), one shared key space.
- `apps/admin/src/app/(app)/agenda/_components/agenda.tsx` — one effect: busy while
  `glance.open || editor.open`, released on close. This is what keeps a `router.refresh()` from
  yanking the glance sheet's roster or an unsaved editor draft out from under the operator.
  The effect depends on the **collapsed boolean**, never on `[glance.open, editor.open]`: EDITAR
  hands off from the glance sheet to the editor, and a two-value dep would release and re-acquire
  across that handoff — flushing a pending refresh into the editor as it opens.
- `apps/client/src/app/reservar/_components/reservar-semana.tsx` — one effect: busy while the
  sheet is open. Closes weakness 5 of the audit (the confirmation sheet holds a snapshot).
  The dep is `sheet !== null`, **never the `sheet` object**: `book()` replaces it with
  `{ sesion, mode: "confirmed" }` while the sheet is still on screen (`reservar-semana.tsx:511`),
  so an identity dep would tear the hold down and re-acquire it right there, releasing a pending
  refresh into the confirmation the member is reading.

### R6 — Member mount

`apps/client/src/app/_components/senal-gym.tsx` — the client-app twin of R4.

Two server layouts, **not** one shared parent: `reservar/` and `clase/` are siblings at the app
root, and folding them into a route group would move
`apps/client/src/app/reservar/loading.tsx` and `apps/client/src/app/clase/[sessionId]/loading.tsx`,
both pinned by path in `tools/guards/loading-coverage.test.ts`.

- `apps/client/src/app/reservar/layout.tsx`
- `apps/client/src/app/clase/layout.tsx`

Each resolves the tenant the way `reservar/page.tsx:60` already does —
`resolveTenant((await headers()).get("host"), null)` — and renders
`{tenant && <SenalGym gymId={tenant.id} />}` beside `{children}`. `resolveTenant` sits behind a
60 s in-process TTL cache, so this is not a per-render round trip.

An unauthenticated visitor is safe twice over: the layout renders around a `page.tsx` that
already `redirect`s to `/entrar`, and the hook's `getSession()` check means no socket opens
regardless.

### R7 — Gates

1. `pnpm lint && pnpm typecheck && pnpm test` (the pre-commit hook) after every task.
2. `pnpm test:denial` via the **local docker** path — the scratch PAT is dead and
   `run-denial-suite.mjs` has no local mode. Reuse the running `supabase_db_red-2-0` container,
   apply the new migration with `docker cp` + in-container `psql -f` (never a PowerShell pipe —
   it mojibakes the suites' UTF-8 Spanish literals into false failures), then run every file of
   `SUITE` in order the same way. Never `db reset` casually: it drops the ambient-grant bootstrap
   the repo's migrations treat as ambient truth.
3. `pnpm test:e2e` with the red-demo sandbox credentials from `AGENTS.md`. This change touches the
   auth/session surface (`realtime.setAuth`), which is exactly what that gate exists for.
4. **Owner consent gate before the live apply.** After 2 and 3 are green, report both results and
   ask for consent to apply `senal_gym` to LIVE. The Supabase MCP is bound to production, so
   `apply_migration` writes to the database four real gyms run on, and no earlier "go ahead"
   covers it. Then apply, and verify in this order: triggers/policy/owner → **subscribe one tab**
   → partitions ≥ 1 → one write → a `cambio` row on the right topic.
5. **A rollback is specified and rehearsable**: drop the 15 triggers, the 2 functions and the
   policy, which returns `realtime.messages` to RLS-on-with-zero-policies (its state until today)
   and restores the exact pre-migration write path. The apps need no revert or redeploy — with no
   signal the browser degrades to the free floor, which is the shipped behaviour anyway.
6. **No `git push`.** Owner-gated. One local commit per task.

## Known gaps (accepted, no code)

- **A tab connected continuously for more than three days outlives its partitions.** The Realtime
  service creates yesterday..today+3 at connection time and the Janitor only deletes; nothing
  extends the window for a session that never reconnects. Such a tab's writes would land in no
  partition and be swallowed. Three backstops already cover it and none is new work: the
  `visibilitychange` refetch, the `rejoin` motive (a reconnect re-provisions the tenant and
  therefore the partitions), and the door's 5-minute poll. A phone or laptop that stays awake,
  foregrounded and unslept for 72 hours is not a shape this product has.
- **The rail is inert until the first subscribe of the day-window.** By construction, above. It
  fails safe: no message means no refresh, which is exactly today's behaviour.

## Out of scope — PHASE 2, deferred by owner decision

The main-session validation appended to the audit (2026-09-01) argues for split topics
(`gym:<id>:staff`, `gym:<id>:agenda`, `gym:<id>:cliente:<cid>`) with occupancy counts in the
payload, patched locally for zero reads, sized for 1,000 concurrent users on Pro. **That is not a
contradiction of what ships here; it is the next phase.** The platform today is 4 gyms, 53
memberships and 283 reservations in 30 days, on the Free plan. At that size a whole-route refresh
costs less than the machinery to avoid it, and split topics would be three subscriptions and a
payload contract maintained for a load that does not exist. Deferred deliberately, with a numeral
to come back on: the audit's exit trigger, >80 msg/s over any 5-minute window on Free.

Also out:

- Local count patching of agenda cards from the message payload (the audit's step 4) — the same
  Phase 2 decision. This ships as whole-route refresh; the payload stays `{"t":"<tabla>"}`.
- A version check on `edit_class_session` (audit weakness 4). Filed as a follow-up note in T6 — a
  push rail makes that lost update more frequent, not less, but it is a separate migration.
- The mobile lane (#296) — same signal, different consumer.
- Realtime observability (a staleness metric, messages/s dashboards). There is none today; adding
  it is what the exit trigger will need, and it belongs with Phase 2.
