# Handoff — after the #89 walk (2026-07-30)

Written at session end. The owner walked the reservation-truthfulness slice against live `red-demo`;
all five steps passed on the ledger, and the walk surfaced three new defects (two of them real, one
of them much bigger than it looked). One is already implemented and waiting to merge.

**Repo state at close:** `main` @ `4d06cab`, **1 commit ahead of `origin/main`** (last session's
handoff doc) — nothing pushed this session. One implementation branch, two mounted worktrees, one
stale branch. Details in §5.

---

## 0. What the walk proved — do not re-walk these

The owner ran the script from the previous handoff against live `red-demo` on 2026-07-29/30, using
seeded fixtures (§6). Results:

| step | result |
|---|---|
| (a) desk tap on an in-window booking → attributed, toast names the class, free | **PASS** |
| (b) same member again → `Ya marcada en la clase de HH:MM`, nothing written | **PASS** |
| (c) past roster → unmarked bookings read dimmed "No asistió"; tapping marks free | **PASS** |
| (d) two classes in one day → counts move by 2 | **PASS** (ledger verified below) |
| (e) client app cancel copy | **legal page PASS · booking sheet NOT WALKED** |

Step (d) was queried directly rather than trusted to the screen — Karla Domínguez, red-demo:

| session | clase | `hora` stamp | consumio | perdonada |
|---|---|---|---|---|
| `89…002` | 19:45 Metcon | 23:11:37 | false | false |
| `89…001` | 23:10 Funcional | 23:11:54 | false | false |

`asistencias_mes_por_cliente` moved **5 → 7**. The #169 fix is correct in production.

**The one unwalked assertion:** the booking sheet in the client app should say cancel is free *hasta
el inicio*. The legal page (Términos y Privacidad) was confirmed good; the sheet was not opened.
Two minutes of work, and it is the last piece of the #89 walk.

---

## 1. Execution order for the next session

Ordered by what unblocks the most, cheapest first. Deviate if the owner's priorities moved.

### 1. #177 — merge + HITL walk. **Do this first.**

Implementation is DONE and gate-green on branch `issue-177-perfil-nombre` @ `a55f44e`. This is the
only open item gating the RED invite run, so it leads.

The bug: `apps/client/src/app/reservar/page.tsx` derived the member's display name from
`claims.user_metadata.full_name`, which only self-signup (`registro.ts:91`) ever writes. `/activar`
— the sole invite door since the 2026-07-24 cutover — never writes it, so every invited member
opens the app and reads their own email address where their name belongs. All 19 RED members are
`sin_invitar` and will walk that path.

The fix reads `clientes.nombre` through `getPerfilResumenMiembro`'s existing host-reconciled,
RLS-scoped `fetchClienteRow` seam. 3 files, +34/−6, no migration. Gate: 84 test files / 1075 tests,
dependency-cruiser clean, both apps typecheck.

**§2 below is the HITL test script — it has four traps that will produce a false result.**

Merge when it passes: `git merge --ff-only issue-177-perfil-nombre`, then sweep per §5.

### 2. Walk step (e) — the booking-sheet line

Open a class in the client app, confirm the sheet says cancel is free *hasta el inicio*. Closes the
#89 walk. If it fails, that is a copy fix, not a logic one.

### 3. #179 — needs a RULING before it can be worked

Filed `ready-for-agent`, but its body contains an unanswered design question, which is a
contradiction the next session must resolve before dispatching anyone.

The defect is real and confirmed: the gold `RESERVA HH:MM` chip on the desk
(`marcadas.ts:118-133`, `reservaAtribuible`) filters on `status === "reservada"`, `!isWalkIn`, and
today — and **not** on the arrival window. So it promises attribution on both sides of the window:
pre-window the tap CHARGES a walk-in, closed-window the tap writes a free class-less row. The
function's own docstring asserts the invariant it fails to enforce. The missing predicate is
`ventana_arribo(...) @> now()` (`20260729120000_reservation_truthfulness.sql:481`).

**The open question:** what the desk shows for a booking that exists today but is out of window.
Two ways forward:

- **Scope it down** (recommended): no chip out of window — silence, which promises nothing — and
  file the pre-window / missed-class affordance separately as `hitl`. Then #179 is a clean sonnet
  slice: add the predicate, extract the shared range check into `@gym/domain/rules` beside
  `esNoAsistio` (`marcadas.ts:78` already imports `VENTANA_ARRIBO_PREVIA_MIN`), add three
  `marcadas.test.ts` vectors.
- **Or the owner rules on the affordance** and it ships in one pass.

Note for whoever implements: align the chip to the **window**, not to the pill. The two intervals
diverge at the close on purpose, and the migration header documents why.

### 4. #173 — plan card counts only `consumio=true`

Was next in the previous queue and is still unblocked (`perdonada` shipped). Member-facing:
`mi_membresia.attended_since_purchase` counts only consumed rows, so booked class visits never
count — "0 de 4" under a full bar. Re-emit counting visits (`deleted_at is null and not perdonada`
in the window) and fix the "este mes" caption (anchored to last purchase).

**This one ships a migration**, so the AGENTS.md written-row gate applies: suites green on scratch
`gyyujeguycxxoaqgdnjp` via `SUPABASE_TARGET_REF=… SUPABASE_ACCESS_TOKEN=… pnpm test:denial` before
it goes near live. Scratch has every migration through `20260729120000` applied and stamped; the PAT
is in gitignored `docs/db-testing-throwaway-project/data`.

### 5. Housekeeping (batch it, it is all mechanical)

- Sweep the two worktrees and the stale branch — §5.
- The unrun **types-regen check** carried from last session: `mcp generate_typescript_types` against
  live, diff the `asistencias` Row + both RPC Returns against the committed hand-edit. Expected
  identical. If it diffs, fix the checked-in file and commit.

### 6. #178 — its own session. Do not fold it into anything else.

See §3. The owner explicitly ruled that this gets a dedicated session with proper attention.

### Beyond that

`#172` (hitl — cancelled sessions strand consumed credits), `#171` (hitl — no-show consequences,
triggered when RED classes actually fill), `#167` (entitlement ledger, own design cycle, `#166`
rides inside it), `#168` parked. Older untouched: `#149`, `#150`, `#151`, `#152`, `#136`, and the
arcade pair `#175`/`#176`.

---

## 2. HITL script for #177 — and the four ways it will lie to you

The change is invisible unless tested exactly right. Each of these produces a confident false
result.

### Trap 1 — testing against the live URL proves nothing

`issue-177-perfil-nombre` is **unpushed and undeployed**. `red-demo.ibookit.lat` runs the old code
and will keep showing the email. This must be tested locally.

### Trap 2 — the worktree has no environment files

`.env.local` is gitignored, so it does **not** exist in `.claude/worktrees/agent-a7fe192645b2f2536`.
Running `pnpm dev` from the worktree fails or silently points at nothing.

Two options, in order of preference:

1. **Merge first, test from the primary checkout** (which has both `.env.local` files):
   `git merge --ff-only issue-177-perfil-nombre` → `pnpm dev`. Reverting is one `git reset --hard`
   if it fails, and nothing is pushed either way.
2. Or copy `apps/client/.env.local` and `apps/admin/.env.local` into the worktree first.

### Trap 3 — testing with Aarón Talavera proves nothing

That account has `full_name` seeded as "Aarón Talavera"
(`supabase/seeds/red-demo/sql/08_config.sql:56`) **and** a matching `clientes.nombre`. Before and
after the fix render identically.

**Use `aarontalavera.271099@gmail.com`** — auth user `4279afaf…`, cliente `testing magic link2`
(`c036f76c…`) in red-demo, created 2026-07-24 with no `full_name`. It is the account that exposed
the bug.

| | before (live today) | after (the fix) |
|---|---|---|
| name | `aarontalavera.271099@gmail.com` | `testing magic link2` |
| avatar | `A` | `TL` |

`TL` because `iniciales()` takes first + last word: `t` + `l`, uppercased (`page.tsx:25-31`).

### Trap 4 — local host resolution

On an unmapped local host the tenant seam needs `?gym=red-demo` to reach the right gym, the same
pattern used for every previous local walk of the client app.

### One judgment call to sanity-check while you are in there

A member with **no cliente row in the resolved gym** now gets `nombre: ""` — blank name, blank
initials — instead of their email. The agent chose that to match the function's own existing no-data
convention (`marca: ""`, `desde: null`) rather than invent a placeholder like "Socio". The
`SinMembresia` screen should catch that path before perfil ever renders, so it ought to be
unreachable. If the owner would rather see a placeholder than a blank, say so — it is a one-line
change and this is the moment to make it.

---

## 3. #178 — everything this session learned

Full write-up is on the issue:
<https://github.com/Vack99/RED-2.0/issues/178#issuecomment-5127197818>. Re-labeled
`ready-for-agent` → **`hitl`**, because it now turns on decisions only the owner can make.

### What it looked like when filed

The ficha rendered two class visits on one day as two identical lines — `HOY · Clase · 23:11`
twice. The owner read it as a double-count bug, which is exactly what #169 had just fixed. Small
display issue.

### What it actually is

**Three things, in ascending order of importance.**

**(1) The historial is worse than today's rows.** `derive.ts:320-331` builds every non-today row and
drops `class_session_id` entirely; `FichaAsistencia` has no `etiqueta` field at all. Today's rows at
least get a "Clase" label (`cliente-detalle.tsx:173`); past rows get nothing. So in the 30-day
history a class visit and an ACCESO LIBRE visit are **indistinguishable**. The column is read from
the DB (`clientes.ts:318`) and then discarded. The issue as originally filed named only
`clasesHoy` — the real surface is larger.

Root cause of the identical horas: `asistencias.hora` is the **arrival stamp** (`now()` at mark
time), not the class hour. Two marks 17 seconds apart both stamp `23:11`. The stamp is correct and
should stay; it is simply not an identifier.

**(2) No data was lost — this is a read defect, not a capture defect.** The owner's fear ("the
actual registry of class attendance is not in the project") is not what is happening. Verified live
2026-07-30:

| gym | filas | con clase | libre | más antigua |
|---|---|---|---|---|
| forge | 308 | 3 | 305 | 2026-06-09 |
| forge-demo | 72 | 10 | 62 | 2026-05-01 |
| red-demo | 369 | 349 | 20 | 2026-06-01 |

All **362** class-linked rows resolve to a live `class_session` — zero orphans — and there is no
purge, archive, or retention job anywhere in the repo. The planned analytics page could query the
complete history today. The ficha simply refuses to display it.

**(3) NEW RISK — the retention guarantee is one DELETE away.**

```
asistencias_class_session_id_fkey  FOREIGN KEY (class_session_id) REFERENCES class_session(id) ON DELETE CASCADE
asistencias_reservation_id_fkey    FOREIGN KEY (reservation_id)   REFERENCES reservation(id)   ON DELETE CASCADE
```

Deleting a class session **cascade-deletes its attendance rows** — the visit records themselves, not
just the link. Latent today: no code path hard-deletes a session (cancel sets `cancelled_at`, and
the only delete in the scheduling RPCs is `class_session_coach`, `20260706120100:222`). It becomes
real the instant an "eliminar clase" affordance ships or an operator cleans up by hand.

This directly contradicts the owner's retention intent. Options for the session: `ON DELETE
RESTRICT`, or `SET NULL` plus **denormalized snapshot columns** (class name + start instant) on
`asistencias`. The snapshot option has a second benefit a join can never give: it survives a class
being renamed, which matters for year-over-year analytics.

### Owner intent, stated 2026-07-30

- The ficha display window stays ~30 days; that is the right showcase.
- The **complete member history must be retained for future analysis** — target horizon 1–2 years
  before anything moves to an archive.
- This sits upstream of a planned **analytics page**, so whatever naming and shape is decided here
  becomes the analytics read model, not merely a label.
- The owner's stated intuition on naming: show the specific class — "Metcon", possibly "Metcon
  17:00".

### Open design questions — grilling stopped at Q1

1. **Q1, unanswered:** today's rows only, or the whole 30-day historial? Recommendation on file:
   the whole historial — same defect, same single read, and the history list is the part operators
   actually use.
2. What identifies a class: tipo alone, or tipo + class hora?
3. What happens to the arrival stamp — keep both, or show it only when it diverges from the class
   hour?
4. Do ACCESO LIBRE rows get an explicit label now that class rows have one?
5. Especiales: `is_special` / `special_name` — reuse the desk's `topTag`, or diverge?
6. A visit whose session was later cancelled — what does it name?
7. Retention/archive horizon, and where the boundary lives (query window vs a physical archive
   table).
8. The CASCADE decision from (3) above.

### One implementation constraint, so it is not rediscovered

The ficha read (`clientes.ts:311`) is a parallel `Promise.all` of plain selects with no embedded
PostgREST joins, by DAL convention. The added session read must go **inside** that `Promise.all`,
not sequenced after `asistRes` — otherwise it adds a round trip to a screen that was tuned in the
50ms loop. Today's sessions are bounded (~4–8/day); a 30-day window is ~30–60 for a frequent member.

---

## 4. The other two issues filed this session

- **#177** — implemented, see §1.1 and §2.
- **#179** — real, confirmed, needs a ruling. See §1.3.

Both were found by the walk, not by the review that preceded it — worth noting that the walk earned
its keep even though every shipped assertion passed.

---

## 5. Repo state and the sweep

**CORRECTED 2026-07-30** after an independent reconstruction agent caught this section being stale.
An earlier draft listed two mounted worktrees and four branches; a process restart mid-session pruned
the `reservation-truthfulness` worktree registration and deleted both `worktree-*` branches. Nothing
was lost — both sat at `b16c950`, already an ancestor of `main`. **Verify with `git worktree list`
before acting on any of this; it has moved once already.**

Actual state at close:

```
main                     b1e3696   [ahead 2, UNPUSHED]
issue-177-perfil-nombre  a55f44e   ← the #177 fix, gate-green, unmerged
```

Registered worktrees — only two:

```
<repo root>                                    [main]
.claude/worktrees/agent-a7fe192645b2f2536      [issue-177-perfil-nombre]
```

`.claude/worktrees/reservation-truthfulness` still exists **on disk** but has no `.git` entry — git
has already forgotten it. It is an orphaned directory, not a worktree: `rm -rf` it, do NOT try
`git worktree remove`. The same is true of ~14 other leftovers in `.claude/worktrees/`
(`backdate-sold-date`, `coverage-100`, `perf-50ms`, `recibo-email-brand`, `venta-personalizada`,
`wayfinder-tracker`, and eight `agent-*` dirs) — all from closed cycles, each carrying its own
`node_modules`. Bulk deletion is safe once `git worktree list` confirms they are unregistered, and
it will reclaim real disk.

Sweep order: merge #177 (`git merge --ff-only issue-177-perfil-nombre`) → `git worktree remove
.claude/worktrees/agent-a7fe192645b2f2536` → `git branch -d issue-177-perfil-nombre` → delete the
orphaned directories.

**Push gate:** `main` is one commit ahead of `origin/main` and nothing was pushed this session.
Per CLAUDE.md a push needs explicit owner consent for *that* push; the pending commits ride along
on the next consented one. Note that pushing deploys both apps to Vercel production — which is also
what makes the #177 fix reach real members, so the merge and the push are separate decisions.

Untracked, deliberately: `docs/Context/2026-07-29-competitor-scan-global.md` and
`…-latam.md`.

---

## 6. The walk fixtures — and a correction

`docs/supabase/walk-89-fixtures.sql` is a re-runnable seeder that produces the one thing the walk
cannot get from the UI: a class whose **arrival window contains now()**, with a member holding a
`reservada` booking in it. (Booking a member normally requires `reservar_clase`, a member-only
definer RPC keyed to `auth.uid()` — i.e. an account and a login. The script inserts the reservation
rows directly instead.)

It creates two ad-hoc sessions relative to `now()` (`+25 min` = in-window, `−3 h` = closed-window)
and five bookings across four red-demo members, with fixed UUIDs so a re-run resets everything to
virgin state — bookings back to `reservada`, walk attendance deleted, charged classes refunded. It
raises rather than run between roughly 22:30 and 04:00 gym time, because attribution keys on the
session's gym-local **date** and a session across midnight silently fails to attribute. Teardown is
three commented DELETEs at the bottom.

**Correction to what was said in-session:** this file was described as "uncommitted, awaiting your
green light." That was wrong — `/docs/supabase/` is **gitignored** (`.gitignore:71`), so it can
never be committed at that path. If it should be tracked, move it to `supabase/seeds/red-demo/`,
which is a tracked directory already holding this gym's seed SQL. Otherwise it lives on disk only
and will not survive a fresh clone.

**Steps (a)–(d) need it re-run before any further walking** — the fixtures expired at local
midnight on 2026-07-29.

Steps (c), (d) and (e) needed no seeding at all, which is worth remembering: past sessions with
`reservada` bookings already exist, and Pasar lista can add any gym cliente to any session as a
walk-in.

---

## 7. Operational notes carried forward

- **Supabase MCP is bound to LIVE** (`hjppxawglmukfvsgmcog`). `apply_migration` hits prod and
  restamps versions — never `supabase link` / `db push`.
- **Scratch** `gyyujeguycxxoaqgdnjp` (kept) has every migration through `20260729120000`. New
  migrations: apply file bytes via Management API `database/query` (node fetch — `jq` does not
  exist on this box), stamp `supabase_migrations.schema_migrations`, then run `pnpm test:denial`.
  The runner refuses the live ref.
- **Model policy held this session:** sonnet for the mechanical #177 slice (clear spec, no taste
  call), main-session opus for the analysis and the grilling. No fable needed. A three-issue filing
  run is faster inline than as a fan-out — do not reach for agents on work that is under ten direct
  tool calls.
- **Agent output is not evidence.** The #177 agent's report was verified independently against git
  (`git log`, `git diff --stat`, then the diff itself) before being relayed. Keep doing that.
