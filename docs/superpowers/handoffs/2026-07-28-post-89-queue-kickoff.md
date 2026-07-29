# Handoff — post-#89 queue: #169 ruling + the reservation-truthfulness slice (#162+#164+#165)

Written 2026-07-28, right after #89 slice 1 shipped. The ORDER below was analyzed and agreed with
the owner in the shipping session — do not re-derive it.

---

## 0. What just shipped (context, do not redo)

#89 slice 1 is LIVE and CLOSED (main @ `1058911`, both `20260728*` migrations applied to prod and
catalog-verified BEFORE the push). Attendance is a per-visit ledger: context = `class_session_id`
or NULL (ACCESO LIBRE, stated via nullable `origen`); two partial unique indexes; a 15-minute
cooldown (`visita_reciente`, the constant's single home) pardons libre↔clase pairs only; 3-arg
`toggle_pase` delegates class contexts to `pasar_lista_sesion`; both RPCs share one per-member
advisory lock taken BEFORE the balance read; the C9 vence gate now covers the walk-in branch of
both surfaces (#163 closed). **The current truth of both RPC bodies is
`supabase/migrations/20260728121000_cooldown_unifies_surfaces.sql` — read it before touching
either function.** Full design record: `docs/superpowers/handoffs/2026-07-28-issue-89-design-locked.md`
+ `docs/superpowers/plans/2026-07-28-issue-89-slice1-spec.md`.

Do NOT: re-review the #89 diff (two adversarial reviews already ran to CONFIRMED-CLEAN),
re-survey the industry, or touch #166/#167/#168 beyond §5's one comment.

---

## 1. The agreed order

1. **Housekeeping** (§2) — sweep the merged #89 worktree, stamp triage labels.
2. **#169** — owner ruling, then a tiny diff (§3).
3. **The reservation-truthfulness slice: #162 + #164 + #165 as ONE slice** (§4) — same seam
   (does `reservation.status` tell the truth), same RPCs, same suites; #162 MUST land before
   #164's sweep or the sweep stamps `no_show` on members who actually attended.
4. **Not this session:** #167 (entitlement ledger — its own future design cycle; #166 folds into
   it as an acceptance criterion), #168 (parked until a real gym produces a same-day repeat).

The owner is walking the new desk (Forge no-schedule case + RED class pills) in parallel — walk
findings PREEMPT the bundle.

---

## 2. Housekeeping (first, mechanical)

- Remove the fully-merged worktree `.claude/worktrees/issue-89-attendance-ledger` and its branch
  `worktree-issue-89-attendance-ledger` (verify merged into main first).
- Labels (`docs/agents/triage-labels.md`: `hitl` / `ready-for-agent`): #169 → `hitl`;
  #162, #164, #165 → `ready-for-agent`.
- Comment on #166: it rides #167 as an acceptance criterion (a correct "charge as of the
  session's instant" needs a balance timeline, which IS the ledger); no standalone fix.

---

## 3. #169 — reporting unit (owner ruling, then minutes of work)

The ledger charges per CLASS (R1); every aggregate reports member-DAYS: `asistencias_mes_por_cliente`
(`count(distinct fecha)`, re-emitted in `20260728120000` §5), `resumen.ts` (dedupes on
`(cliente_id, fecha)`), `marcadas_presencia` (already distinct). A RED member taking the 18:00 +
19:00 classes loses 2 clases while roster/dashboard/strip all say 1 — the shape of a support call.

**Ask the owner: member-days (status quo), visits, or both?** Notes:
- "Visits" must count `consumio = true` rows only (or distinct arrivals), else a cooldown-pardoned
  pair re-inflates one arrival to 2 — the exact thing the distinct-day choice was made to prevent.
- "Both" is the industry shape (accesos totales vs únicos) but is a UI change on three surfaces —
  spec it before building; the other two answers are a count-expression swap + label check.
- Any change to `asistencias_mes_por_cliente` re-emits it in a migration (CREATE OR REPLACE
  preserves ACLs — see `20260728120000:100`-ish for the precedent and the grant history).

---

## 4. The reservation-truthfulness slice (#162 + #164 + #165)

### 4a. #162 (remaining half) — LIBRE-context desk mark on a booked member

The class-context case was dissolved by #89's delegation. What remains: `toggle_pase`'s LIBRE ON
path, the active-`reservada`-booking branch (sets `consumio := false`, comment "the reservation
itself is untouched") — the member is marked at the door but their booking stays `reservada`:
class roster shows them absent, the "N presentes" headline is wrong, and the seat stays occupied
in `contarActivos`.

**Recommended fix — auto-attribution (ASK the owner before SQL, it's a behavior change):** when a
desk 2-arg tap lands on a member holding a `reservada` booking for TODAY, treat it as an arrival
for that class — delegate to `pasar_lista_sesion(booked_session, cliente)` exactly like the 3-arg
path. The booking is the member's own statement of why they came. Open sub-questions for the owner:
- Tiebreak when they hold 2+ bookings today (rare): session nearest now, or refuse to LIBRE?
- A booking for a session that already ENDED (they missed it, now doing open gym): attribute
  anyway, or fall through to a normal LIBRE mark (leaving the booking for #164's sweep)?
  Falling through is more honest; recommend it.
- Note the ficha's 2-arg call inherits auto-attribution — that is correct (a booked member marked
  from the ficha attended their class) but say it out loud.

Alternative if the owner dislikes attribution: UI-only routing (in LIBRE ctx, a booked member's
tap switches to their class context). Weaker — leaves the ficha and any future 2-arg caller broken.

### 4b. #164 — write `no_show` (AFTER 4a lands, same slice)

`no_show` is in the status CHECK (`20260706170000:55`) with zero writers; flaked bookings stay
`reservada` forever and inflate occupancy. Fix lazily at read (house pattern — forfeit is lazy,
no cron on free tier): when a roster/occupancy read touches a session whose end has passed by a
grace window, flip its stale `reservada` rows to `no_show`. Slice-minimal policy: **stamp only —
no money movement** (the booking's `consumio` stays as booked; refunds/strike policy are the §4
gap list's separate product decisions, out of scope). Ordering hazard this bundle exists to
avoid: without 4a, a desk-marked booked member still reads `reservada` and would be stamped
`no_show` despite attending.

Mechanics: a small write RPC (or an `ensure_*`-style side effect à la `ensure_week_materialized` —
`getAgendaDia` is the precedent for a read path that writes). If it's a new write-bearing RPC, the
`rpc-write-coverage` guard will demand a `supabase/tests/rpc-coverage.json` entry + suite.
`roster_clase` and `contarActivos` already count only `('reservada','asistida')`, so `no_show`
drops out of occupancy with no reader changes — verify, don't assume.

### 4c. #165 — server gate on booking past sessions (rider)

`reservar_clase` has no `starts_at > now()` gate (only the client UI blocks it,
`reservar-semana.tsx`); `cancelar_reserva` DOES gate (`20260710123000:186-188` precedent). One
`if` + one denial vector in `reservar_clase_rules.sql`. Belongs in this slice because past-session
bookings are instant fake flakes for 4b's sweep.

### Gates (unchanged from #89 — they worked)

- AGENTS.md: written-row assertions (balances, `reservation.status`/`is_walk_in`, `consumio`,
  `origen`, `gym_id`), never return values. Suites to extend: `toggle_pase_rules.sql`,
  `pasar_lista_sesion_rules.sql` (attribution vectors), `reservar_clase_rules.sql` (past-session),
  plus whatever 4b's writer needs. `QUARANTINE` stays empty.
- Suite quirk: all vectors share one frozen transaction `now()` — to get outside the cooldown or
  past a session end, backdate `created_at`/`starts_at` with a privileged UPDATE between
  `reset role` / `set local role authenticated` (house pattern: `cancelar_reserva_rules.sql:224`).
- `pnpm test:denial` green on scratch before fast-forward:
  `SUPABASE_TARGET_REF=gyyujeguycxxoaqgdnjp SUPABASE_ACCESS_TOKEN=<PAT> pnpm test:denial` — PAT in
  gitignored `docs/db-testing-throwaway-project/data`. Scratch holds ALL 89 migrations as of
  2026-07-28 (synced + firma stamp repaired this session). New migrations must be applied to
  scratch first (the TARGET_REF path does NOT provision) — apply the file bytes via the Management
  API `database/query` endpoint, then stamp `supabase_migrations.schema_migrations`.
- The Supabase MCP is bound to LIVE (`hjppxawglmukfvsgmcog`); `apply_migration` hits prod. NEVER
  `supabase link`/`db push` to prod (56-filename drift → re-applies seeds).
- Ship order that worked for #89: migrations to live FIRST (via `apply_migration`; keep the query
  to executable statements — the auto-permission classifier balked at a 400-line commented blob),
  THEN push main (Vercel deploys on push). Expand-only DDL keeps old code safe in the gap.
- Worktree needs `apps/admin/.env.local` copied from the primary checkout; run the dev server FROM
  the worktree.

---

## 5. Owner questions to ask BEFORE writing SQL (mirror #89's flow — it worked)

1. **#169:** member-days, visits, or both? (§3)
2. **#162:** auto-attribution yes/no; multi-booking tiebreak; ended-session fall-through. (§4a)
3. **#164 grace window:** how long after session end does `reservada` become `no_show`?
   (Recommend: end of the gym-local day — simple, matches the mental model "didn't show that day".)
