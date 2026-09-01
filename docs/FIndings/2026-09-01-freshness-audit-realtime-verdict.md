# Freshness audit: why users refresh, and what to build (2026-09-01)

Cross-examination, tier 2 (run here). Roster: 5 sonnet sweeps, 1 sonnet verifier, 1 sonnet gatherer, opus red team, opus analyst, opus referee, opus coverage critic. No fable seat used: every dispute closed on primary source and the recommended change is reversible.

## Verdict

**Build "signal, not data": a Postgres statement-level trigger on the cross-user tables calls `realtime.send` to a private topic `gym:<gym_id>`; each browser tab holds one Realtime subscription and answers a signal with a debounced `router.refresh()` (web) or `queryClient.invalidateQueries` (mobile lane). Ship the free floor first: refetch on `visibilitychange`, and gate the existing 5-minute door poll on tab visibility.**

Rejected: Postgres Changes (payload is useless because occupancy is derived per ADR-0010 and `@gym/data` is `server-only`; per-subscriber RLS per message), Vercel SSE/WebSocket (no `LISTEN` through the pooler, so it degrades to server-side polling billed per instance-second, and a held route handler cannot rotate the session cookie), and a bare short interval (17 round trips per `/reservar` render, 5,760 renders/day/tab at 15 s).

Nothing here changes the fact that no mechanism fixes a back-button restore from bfcache or the Router Cache. That question is owner-owed (below) and, if it is the actual complaint, the whole menu is wrong.

## What is established (measured in this audit)

| Fact | Evidence |
|---|---|
| Member app has zero in-place freshness. `router.refresh()` fires only after the user's own book/cancel/favorite. | `apps/client/src/app/reservar/_components/reservar-semana.tsx:512,532`; grep for setInterval/useSWR/.channel(/visibilitychange over `apps/client/src` = 0 hits |
| Admin app has exactly one poll: door screen, 5 min, fires even when the tab is hidden. Agenda has none by design. | `apps/admin/src/app/(app)/asistencia/_components/asistencia.tsx:36,135-140`; `agenda/_components/agenda.tsx:279` |
| 19 of 33 write RPCs are cross-user, over 11 tables that all carry `gym_id` and RLS. | `supabase/tests/rpc-coverage.json`; matrix in agent output, tables: clientes, ventas, asistencias, reservation, class_session, class_session_coach, schedule_template, contact_message, gym_membership, paquetes, plan_feature |
| Nothing is wired to Realtime. `realtime.messages` has RLS on and 0 policies; `realtime.send` is SECURITY INVOKER. | grep over `supabase/migrations` = 0 hits; live `pg_get_functiondef` + catalog read by referee |
| Render cost: `/reservar` ≈ 17 PostgREST round trips, admin `/agenda` 9–10, `/asistencia` 13, `getSesionRoster` 4. | analyst count over `packages/data/src/server/agenda-miembro.ts`, `agenda.ts`, `asistencia.ts` |
| Browser Supabase client is a singleton per tab (`@supabase/ssr` default in browser). One socket per tab. | `node_modules/@supabase/ssr/dist/main/createBrowserClient.js:12-16` |
| supabase-js pushes a refreshed JWT to open channels on `TOKEN_REFRESHED`. | `node_modules/@supabase/supabase-js/src/SupabaseClient.ts:635-655`; `realtime-js/src/RealtimeClient.ts:600-665` |
| `getClaims()` in the proxy rotates only inside a 90 s pre-expiry margin. A 15 s refresh loop causes ≈24 rotations/day, same as an hourly navigator. | `@supabase/auth-js@2.106.2/dist/main/GoTrueClient.js:2353-2381`, `lib/constants.js:6-13` |
| `realtime.send` swallows every error (`WHEN OTHERS → RAISE WARNING`). A Realtime outage cannot abort a sale; a misconfigured trigger fails silently. | live function body = upstream `supabase/realtime .../functions/send.sql` |
| `edit_class_session` writes every column blind, no lock, no version check. | `supabase/functions-canonical/edit_class_session.sql:63-73` |
| No complaint is recorded in any issue or doc. Marketing copy promises "cupos en vivo". | `gh issue list` search; `docs/brand/05-marketing/candidates/*` |
| Mobile admin lane (#296) already chose TanStack Query with AppState focus refetch. | `.claude/worktrees/mobile-admin/apps/mobile/src/data/`, issue #296 |

## Ranked weaknesses of the current structure, worst first

1. **Staff agenda never updates while open.** A card can read 8/12 while members book seats 9–12 from their phones. Only a navigation or the operator's own write repaints it. `agenda.tsx:279`.
2. **Member saldo and week view never update while open.** A sale, a venta edit, a class cancellation, or a pasar-lista all change what the member sees and none reach an open `/reservar`. 19 cross-user RPCs, 0 delivery paths.
3. **The one poll that exists runs blind.** The door screen refreshes hidden tabs every 5 min and has no `visibilitychange` handler, so a staff phone returning from the lock screen shows up to 5 min of stale reservas. `asistencia.tsx:135-140`.
4. **Lost update on session edit.** Two staff devices editing one session overwrite each other silently. Any auto-refresh makes the window continuous. `edit_class_session.sql:63-73`.
5. **The confirmation sheet holds a snapshot.** `sheet.sesion` is captured state; a refresh under it leaves "3 lugares" on the sheet while the list says LLENO. `reservar-semana.tsx:475,505-506,637`.
6. **`revalidatePath` cannot cross apps.** Admin server actions revalidate admin routes; the member app is a separate deploy. Harmless today only because every route is dynamic. `apps/admin/src/app/(app)/vender/actions.ts:68-69`.
7. **A far-week agenda tab calls a write RPC per render.** `ensure_week_materialized` fires for weeks +6..+26; an auto-refresh parked there writes on every tick. `packages/data/src/server/agenda.ts:300-310`.
8. **No observability.** No analytics, no staleness metric, no way to size the complaint before or prove the fix after. `grep @vercel/analytics` = 0.
9. **Sales copy outruns the product.** "Cupos en vivo" is promised in 5 landing candidates; nothing in code or ADR backs it.

## Breaking points

| Component | Breaks at | Bound by |
|---|---|---|
| Bare 15 s interval on `/reservar` | ~50 idle tabs ≈ 40 PostgREST q/s of waste (`modelled — 17 RT × 1/15 s × 50`) | Postgres CPU / pooler, not any Supabase quota |
| Option B, Free plan | 200 concurrent connections ≈ **20 gyms** at 10 open screens/gym (`modelled`) | included-connection quota; hard refusal on Free |
| Option B, Pro plan | 500 included, then $10/1,000; **not a wall**. Real limit = 500 msg/s and 500 joins/s, enforced by refusal | per-second rate, then cost |
| Per-row trigger on series retire | worst case 986 messages in one commit vs 100 msg/s Free (`measured — live max 29 sessions × 17 reservas`) | msg/s rate |
| Statement-level trigger on series retire | worst case 89 messages, typical 28 (`measured — 2–3 statements/session`) | under Free rate, not by much |
| Postgres Changes | single-threaded per-subscriber RLS; vendor says move to Broadcast by ~3,000 subscribers; here the payload is unusable at any scale | `@gym/data` `server-only` |
| Vercel SSE | maxDuration 300 s Hobby → forced reconnect + re-auth every ≤5 min per tab; no `LISTEN` through pooler | instance lifetime billing × gym count |
| Refresh-loop token rotation | ≈24/day/tab regardless of interval (`measured — 90 s margin`) | multi-tab races in the margin, not the interval |

## Recommended build, in order

1. **Free floor (1 file each, no migration).** Add a `visibilitychange` → `router.refresh()` handler behind the same `inFlight`/open-sheet guard; gate the door poll on `document.visibilityState === "visible"`. Ship this alone first and ask whether the complaint survives. If the complaint is the door screen (forge is 8:1 pasa-lista:ventas), this closes it.
2. **Signal rail, admin first.** One migration: `public.senal_gym()` as `SECURITY DEFINER SET search_path = ''` owned by `postgres` (must be a `rolbypassrls` role, or the insert is silently denied), AFTER STATEMENT triggers with transition tables on `reservation` and `class_session`, `select distinct gym_id` → `realtime.send(jsonb_build_object('t', tg_table_name), 'cambio', 'gym:'||gym_id, true)`. One SELECT policy on `realtime.messages`: `realtime.topic() like 'gym:%' and public.is_member_of(substring(realtime.topic() from 5)::uuid)`. Dashboard: turn off "Allow public access to channels". Hook lives in `@gym/data/client` (boundary allows it), mounts in `apps/admin/src/app/(app)/layout.tsx`, topic keyed on the tenant in effect (`x-gym`), not the membership set. Debounce 600 ms trailing, skip when a sheet or dirty draft is open, flush on close, never refresh outside the current week window on agenda.
3. **Member side.** New `apps/client/src/app/reservar/layout.tsx` hosting the same hook; add triggers on `clientes` (saldo) and `ventas`. Keep the door poll only as a midnight-rollover timer (#231).
4. **Targeted refetch on agenda's open sheet.** Swap whole-route refresh for `rosterSesionAction` (4 RT vs 9–10) when the glance sheet is open.
5. **Separate ticket:** version check on `edit_class_session` (pass `updated_at`/`xmin`, refuse stale draft). A push rail without this makes the lost update more frequent, not less.
6. **Gate:** `pnpm test:e2e` green before merge; the hook touches the auth surface. Add one `supabase/tests/` suite asserting a `reservation` insert lands one row in `realtime.messages` with the right topic, since `rpc-coverage.json` cannot see this policy.

**Exit trigger for the signal rail:** leave it when the Supabase Realtime dashboard shows messages/s above 80 per second for any 5-minute window on Free, or 400/s on Pro, or when monthly Realtime overage exceeds `undecided — the owner sets the MXN/month line`. Connections are a billing line on Pro, not a trigger.

**Exit trigger for the free floor alone:** if, 14 days after step 1 ships, a staff or member reports needing a manual refresh while the tab stayed in the foreground, proceed to step 2.

## Confidence ledger

| Claim | Basis |
|---|---|
| Zero in-place freshness in client app; one blind poll in admin | measured (grep + file reads, verified by a second agent) |
| 17 / 9–10 / 13 round trips per render | measured (call-by-call count) |
| Singleton browser client, one socket per tab | measured (library source) |
| `getClaims()` rotates only in the 90 s margin | measured (auth-js source) |
| `realtime.send` swallows errors; `realtime.messages` has 0 policies; `realtime.send` is invoker | measured (live catalog) |
| Series retire worst case 986 row events, 89 statement events | measured (live data max) + modelled (statement count) |
| Free plan breaks at ~20 gyms on connections | modelled — 10 open screens/gym, Free 200 |
| 10 open screens per gym at peak | asserted — no measurement exists |
| Complaint is about foreground staleness, not back-navigation | asserted — unverified with the complainers |
| Supabase plan is Free | asserted — memory says the free tier fits one scratch beside live |

## Could not determine

| Question | Experiment that settles it |
|---|---|
| Is the complaint a foreground-stale tab or a bfcache/back-button restore? | Ask each complainer: "did you press back, or was the screen open?" |
| Which screen hurts: door, agenda, or member reservar/saldo? | Same conversation; forge's 8:1 ratio suggests the door |
| Peak concurrent open screens per gym | Vercel invocation counts per route for one forge week |
| Realtime latency in pdx1 → Mexico | one browser subscribed, one `reservar_clase`, stopwatch |
| iOS Safari PWA socket survival on background | one iPhone, background 60 s, foreground, watch the channel rejoin |
| Whether `shieldedFetch`'s 8 s timeout + one retry trips under a refresh burst | 20 tabs subscribed, one pasar-lista of 20 members, watch PostgREST logs |

## Owner-owed inputs

1. Supabase plan (Free or Pro) and Vercel plan (Hobby or Pro).
2. The two answers above: back-button vs open tab, and which screen.
3. Was "webhooks" in the question about UI freshness, or about the Resend email-event webhook already researched in `docs/Context/2026-09-01-email-deliverability-HANDOFF.md` item 6?
4. Acceptable staleness in seconds for staff agenda cupo and for member saldo (sets the debounce and whether step 1 alone is enough).
5. MXN/month ceiling for Realtime overage (the exit-trigger numeral left `undecided`).

## Dissent log

| Dispute | Red team | Referee ruling |
|---|---|---|
| Every refresh rotates the token | 5,760 rotations/day at 15 s | OVERRULED: ≈24/day; rotation gated on a 90 s margin |
| New client per call → many sockets | yes | OVERRULED: `@supabase/ssr` singleton by default in browser. Coverage critic repeated the claim; same ruling |
| Trigger failure aborts a sale | yes | OVERRULED: `realtime.send` catches everything. Inverse hazard upheld: silent loss |
| Series retire floods 100 msg/s | ~1,000 events | PARTIAL: reachable per-row (986 live worst case); 89 with statement triggers |
| 10,000 connections is a wall | analyst | OVERRULED: Pro is metered overage; rate per second is the enforced limit |
| Trigger needs SECURITY DEFINER | red team | UPHELD, and stronger: without it the insert is RLS-denied and swallowed |
| Option B is RSC-only, mobile can't consume it | coverage critic | PARTIAL: the signal is consumable from React Native via supabase-js; only the consumer differs |

## Blind spots

- The mobile worktrees' actual data layer was not read; only its plan (#296).
- Realtime latency from pdx1 to Mexican carriers: unmeasured.
- Vercel per-invocation cost of a `router.refresh()` storm: unmeasured.
- `clase/[sessionId]` and `confirmada` screens were mapped but not examined as complaint sources.
- The Supabase MCP is bound to LIVE; the referee's catalog reads were read-only, but no scratch replay of the proposed migration was done.
- Whether the `x-gym` tenant-in-effect is available as a prop at the admin (app) layout without a new server read.

## Draft audit

- Cut "Option B is the standard shape Supabase recommends" from the verdict: survives substitution, true of any Broadcast user (Rule 4). Kept the vendor's 3,000-subscriber number where it applies to Postgres Changes.
- Replaced the analyst's exit trigger "400 connections" with msg/s thresholds after the referee showed connections are metered on Pro (Rule 3).
- Tagged "10 open screens per gym" as asserted; every breaking point derived from it reads `modelled` (Rule 5).
- Cut the red team's "5,760 rotation attempts/day" from the weaknesses list; kept the corrected 24/day in the ledger (M2, cuts both ways).
- Cut the coverage critic's "no browser-client singleton" finding; the library source refutes it (M2).
- Added the free-floor exit trigger with a numeral (14 days) after the first draft read "if complaints continue" (Rule 3).
- Left the MXN ceiling as `undecided` with the owner named rather than inventing a number (Rule 3).
- Swept for adequacy-without-a-number: "harmless today" in weakness 6 is bounded by "every route is dynamic", which is measured (P10). Kept.

## Main-session validation (fable, 2026-09-01, after the owner questioned the agents' output)

Checked directly, not via agents:

| Fact | Result | Where |
|---|---|---|
| `@gym/data` server DAL is `server-only` | confirmed | `packages/data/src/server/supabase.ts:1` |
| Browser client is a singleton per tab | confirmed | `@supabase/ssr/dist/main/createBrowserClient.js:12-14` |
| supabase-js pushes refreshed JWT to Realtime | confirmed | `@supabase/supabase-js@2.106.2/dist/index.cjs:1427-1431` |
| Heartbeat 25 s | confirmed | `@supabase/realtime-js/dist/main/RealtimeClient.js:12` |
| Live: `realtime.messages` RLS on, 0 policies; `realtime.send` invoker; `realtime.topic`+`broadcast_changes` exist; 0 publication tables | confirmed | live catalog, read-only |
| Live scale: 4 gyms, 53 memberships, 283 reservations in 30 days | measured | live |
| Quotas: Free 200 conn / 100 msg/s; Pro 500 / 500, $10 per 1,000 conns, $2.50 per M msgs; Team 10,000 / 2,500 | confirmed | supabase.com/docs/guides/realtime/quotas, /pricing |
| Broadcast counts 1 + one per subscriber; over-rate = `tenant_events` disconnect with auto-reconnect | confirmed | docs/guides/platform/manage-your-usage/realtime-messages, quotas |

**Revision to the verdict for a 1,000-concurrent-user shield:** the agents' "signal → whole-route refresh" fans out 17 reads per subscriber per write. Fine per gym, wrong as the platform rule. Replace with: one message per gym per transaction (statement trigger deduped by a transaction-local GUC), topics split `gym:<id>:staff`, `gym:<id>:agenda` (payload carries session_id + both occupancy counts, patched locally, zero reads), `gym:<id>:cliente:<cid>` (saldo, targeted refresh). Reconcile on channel rejoin and on `visibilitychange`. Cost at 1,000 concurrent: Pro $25 + $5 connections; messages a rounding error.
