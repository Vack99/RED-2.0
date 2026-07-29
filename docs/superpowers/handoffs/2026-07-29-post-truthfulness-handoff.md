# Handoff — after the reservation-truthfulness ship (2026-07-29)

Written at session end, right after #162+#164+#165+#169 shipped. State at close: **main == origin/main
@ `b16c950`**, migration `20260729120000` applied to LIVE and catalog-verified, both Vercel apps
deployed from that push, all four issues closed, 38/38 denial suites green on scratch (twice).

## 0. What shipped and is SETTLED — do not re-derive

The full design record is `docs/superpowers/handoffs/2026-07-29-cross-examine-reservation-truthfulness.md`
(read its **Final rulings** section) and the implementation spec
`docs/superpowers/plans/2026-07-29-reservation-truthfulness-spec.md`. The RPC truth is now
`supabase/migrations/20260729120000_reservation_truthfulness.sql` — read it before touching
`toggle_pase` / `pasar_lista_sesion` / `reservar_clase` / `asistencias_mes_por_cliente`.

Locked, with the owner's re-rulings on record:
- **`no_show` is DERIVED, never written.** The owner-ordered cross-examination overturned the stored
  sweep (irreversible mass-stamp via unguarded `edit_class_session`, read-is-write, order-dependent
  occupancy history). Roster "NO ASISTIÓ" = `reservada` + arrival window closed, computed at read.
  Do NOT re-introduce a sweep/stamp/cron; the enum value stays for a future SQL-side consumer only.
- **Arrival window** `[starts_at − 90, starts_at + duration + 15)`: SQL home `ventana_arribo`,
  TS twin `VENTANA_ARRIBO_*` + `esNoAsistio` in `@gym/domain/rules`. Attribution is **arm-only**
  (2-arg tap delegates only on `reservada`; `asistida` in-window raises 'Ya marcada en la clase de
  HH:MM'; toggle-OFF of a real libre row stays first — the ORDER NOTE in the migration).
- **C15 split** (money): pre-window tap charges (Ana); closed-window `reservada` pardons
  `consumio=false` (Luis — the Terms cap a no-show at ONE class); a pardoned door row pardons
  nothing further (the chain-breaker in `pasar_lista_sesion`'s cooldown — exact, not heuristic).
- **`perdonada`** stamps the cooldown pardon at write; visits = active non-pardoned rows
  (`asistencias_mes_por_cliente`, `resumen.ts`). Day strip stays a PEOPLE count on purpose.
  Accepted edge: the orphaned pardon undercounts one visit; verification query in §3.
- Follow-up issues filed by the examination: **#171** (hitl), **#172** (hitl), **#173**
  (ready-for-agent). #166 rides #167 (commented); #167 is its own future design cycle; #168 parked.

## 1. Immediate next steps, in order

1. **Owner walks the slice** (walk findings PREEMPT everything else). Script:
   (a) Desk, ACCESO LIBRE tab, tap a member booked within ±90 min → gold `RESERVA HH:MM` chip
   already visible, toast names "CLASE HH:MM", class-pill dot lights, class count repaints live.
   (b) Same member again → warning 'Ya marcada en la clase de HH:MM', nothing changes.
   (c) Past class roster → unmarked bookings read dimmed "No asistió"; tapping one marks free.
   (d) Two classes in one day → clientes roster + dashboard move by 2.
   (e) Client app booking sheet + legal page say cancel is free "hasta el inicio".
   Note: red-demo is the only gym with bookings; the ficha toast deliberately says "Marcada en su
   clase de hoy · HH:MM" where HH:MM is the ARRIVAL stamp (adjudicated deviation — the ficha has no
   session hora).
2. **After the walk passes: sweep the worktree** `.claude/worktrees/reservation-truthfulness`
   (branch `worktree-reservation-truthfulness` is merged into main): verify-then-remove + branch -d.
3. **Types-regen check** (spec §7.4, low risk, unrun): `mcp generate_typescript_types` against live,
   diff the `asistencias` Row + both RPC Returns against the committed hand-edit. Expected identical
   (the generator emits non-null for set-returning columns — precedent verified in-file). If it
   diffs, fix the checked-in file, commit; it rides the next consented push.

## 2. The queue after that

- **#173** (ready-for-agent, now UNBLOCKED — `perdonada` exists): `mi_membresia.attended_since_purchase`
  counts only `consumio=true` → booked visits never count ("0 de 4" with a full bar). Re-emit
  counting visits (`deleted_at is null and not perdonada` in the window) + fix the "este mes"
  caption (anchored to last purchase). Small slice: one migration + suite vectors + maybe
  `derive.ts`/`perfil-overlay` caption. AGENTS.md written-row gate applies; scratch first.
- **#171** (hitl): no-show consequences when classes fill — strikes / ilimitado no-show fee /
  waitlist revisit. Trigger: RED classes actually filling (live 2026-07-29: one full session ever,
  demo only). Prerequisites (visibility + honest cancel copy) shipped this session.
- **#172** (hitl): `cancel_class_session` strands consumed credits (no refund, no notification —
  the 'Se avisó a los reservados' toast is hardcoded). Decide before real booking traffic; the
  closed-window pardon currently softens same-day impact only.
- **#167** entitlement ledger (own design cycle; #166 is an AC inside it). **#168** stays parked.
- **Month-close ritual** (one line, add to whatever respaldo routine): the orphaned-pardon /
  pair-existence check — `select count(*) from (select cliente_id, fecha from asistencias where
  deleted_at is null group by 1,2 having count(*) > 1) t;` — first non-zero month, revisit the
  respaldo export columns (it still ships raw rows incl. pardons; deliberate, documented in the
  cross-exam report F-item on count units).

## 3. Operational notes for the next session

- **Scratch** `gyyujeguycxxoaqgdnjp` (KEPT): has all migrations through `20260729120000` applied +
  stamped. PAT in gitignored `docs/db-testing-throwaway-project/data`. New migrations: apply file
  bytes via Management API `database/query` (node fetch — `jq` does not exist on this box), stamp
  `supabase_migrations.schema_migrations`, then `SUPABASE_TARGET_REF=... SUPABASE_ACCESS_TOKEN=...
  pnpm test:denial`. The runner refuses the live ref.
- **Supabase MCP is bound to LIVE** (`hjppxawglmukfvsgmcog`); `apply_migration` hits prod and
  restamps versions (known drift — never `supabase link`/`db push`).
- **Ship order that worked twice now**: suites green on scratch → `apply_migration` to live
  (comment-stripped executable, the classifier balks at big commented blobs) → catalog-verify →
  ff main → push, apply+push in ONE sitting (the RPC semantics go live at apply; the UI that
  explains them arrives with the push). Pushing needs explicit owner consent per CLAUDE.md —
  and mind the bash session's persistent cwd: this session's push initially went out one commit
  short because the shell was still inside the worktree (caught and completed within a minute).
- **Cross-examination pattern paid for itself** (two locked decisions overturned pre-SQL, two money
  bugs caught pre-ship by the adversarial review). For money-path slices: design panel → owner
  rulings → /cross-examine with disjoint seats + coverage critic + live counts → spec → parallel
  implementation agents (SQL / TS / copy, disjoint files, one worktree) → adversarial review →
  fixes routed BACK to the original seats (context reuse) → denial gate → ship. Model split per
  CLAUDE.md: opus for design/review/UI seats, sonnet for mechanical; no fable was needed.
