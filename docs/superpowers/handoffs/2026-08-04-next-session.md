# NEXT SESSION — start here (post-#89 map, 2026-08-04)

**First two commands: `/ponytail` then `/caveman`.** Owner's standing instruction.

## Where to work

```
.claude/worktrees/post-89-followups     branch: post-89-followups
git -C .claude/worktrees/post-89-followups merge --ff-only main    # it is stale, ff first
```

Both `.env.local` files are already copied in, so `pnpm dev` works from it. **Do not work in the
primary checkout** — a second session owns `main` there (VENTANA #222–#230) and the two collided
repeatedly on 2026-08-03. **Never push.** `main` is **33 commits ahead of origin**, all unpushed.

## Read these, do not re-derive them

| doc | holds |
|---|---|
| `docs/superpowers/handoffs/2026-08-03-post-89-wave-handoff.md` | every ruling taken, the 5 shipped slices, the corrected forge misread, the D1–D4 defect detail |
| `docs/Context/2026-08-03-gym-checkin-prior-art.md` | 9-platform sweep with URLs; why #179 is silence; why #233 is the nail |

Three things in there that will otherwise be rediscovered the hard way:

1. **forge is class-ONLY.** An earlier pass concluded "pure open-gym" — wrong, retracted. Unlinked
   attendance is a batch-entry artifact (transcribed 1.5–2.5 h after class, past `sesionCercana`'s
   ±90 min preselect at `marcadas.ts:78`). **Do not fix it by widening that constant** — that was
   recommended and retracted; it would mis-attribute genuine late walk-ins.
2. **`worktree-reserva-manual-agenda` is unmerged and already rules on zero balance**
   (`20260803140000:154-157` — blocks finite plans, Ilimitado exempt) and ships the class-first
   Agenda surface. Merge it before touching #233 — it rewrites charging on both paths.
3. **Live measurement exists** — do not re-query it. Zero non-walk-in bookings at both paying gyms;
   340/340 class-linked rows carry their `reservation_id`.

## Pending work — this map and this session

**Shipped locally, unpushed, issues still OPEN** (GitHub has not seen the commits):
`#179` `9b4c151` · `#178` `0bd81ae` · `#173` `cfc66ad` · CASCADE `bdbb630` · `#177` `0125365`

| id | what | blocked by | size |
|---|---|---|---|
| **desk 0-balance gap** | `toggle_pase` / `pasar_lista_sesion` have no zero-balance check — only `Paquete vencido` (`20260729120000:270`/`:552`). `reservar_clase` **does** raise `Sin clases disponibles`. **App says no, desk says yes.** Unruled — the one thing #237 did not close. | owner ruling | small |
| **D1** | plan-card counts VISITS against a CHARGE denominator (`derive.ts:234`) → "13 de 13" on a 12-class package | ↑ dissolves it | — |
| **D2** | `FichaAsistRow` (`derive.ts:279`) missing `perdonada`; typechecks by accident | — | 1 line |
| **D3** | `asistencias.class_session_id` has only a *partial* index; RESTRICT made the FK probe hot | — | 1 line |
| **#178 copy** | renders `ACCESO LIBRE` for `origen IS NULL` rows — 189 of 206 forge rows, all actually classes. Render `—` (as `export/rows.ts:122-127` does). Needs `origen` on `FichaAsistencia` — bundle with D2 | — | small |
| **capacity reader** | forge's 19:00 recorded **17/15**. **Ruled: let staff exceed, fix the READER** — stop staff marks driving member-facing LLENO, so RED members aren't locked out | — | small |

**Filed 2026-08-03, untouched:** `#231` desk has no clock (owns the tick for the desk *and* Agenda) ·
`#232` tap discloses nothing (`hitl`) · `#233` charge-at-booking (`hitl`, **supersedes #167, absorbs
#166**) · `#234` 90-min lead hard-coded.

**Parked, with reasons on the issues:** `#166` `#167` (both → #233) · `#168` no demand · `#171` one
session has ever hit capacity · `#172` zero cancelled sessions with bookings have ever existed ·
`#136` explains 24 historical rows, moves 0 of 45 misfiles.

**Unmerged branches:** `worktree-reserva-manual-agenda` (#235–#238, 8 commits, denial green) ·
`issue-177-perfil-nombre` (**redundant** — cherry-picked as `0125365`, sweep it) · `slice-229`
`slice-230` `improving-client-page` (other sessions).

## The owner's queue

1. **Rule the desk 0-balance gap** — unblocks D1.
2. **Three HITL walks** — `pnpm --filter @gym/client dev`:
   - `#177` → `/reservar?gym=red-demo` as `aarontalavera.271099@gmail.com`. **Not his own account** —
     `seeds/red-demo/sql/08_config.sql:56` bakes `full_name` into it, so it passes either way.
   - `#178` → admin `/clientes/{id}`, red-demo member with two same-day classes. Two **separate**
     rows, each naming its class.
   - `#179` → admin `/asistencia`, LIBRE tab, member booked >90 min out. **No gold chip.**
3. **`/code-review` on the whole diff**, then his push call. A push deploys both apps to production.

## Gates and traps

- **Already green, do not re-run without a reason:** `test:denial` **41/41** on scratch
  `gyyujeguycxxoaqgdnjp` (verified real DDL, not stamps) · vitest **1218** · 0 dep violations.
- **Supabase MCP is bound to LIVE** (`hjppxawglmukfvsgmcog`). SELECT only. Never `apply_migration`,
  `supabase link`, or `db push`. Scratch is reached via the Management API; PAT in gitignored
  `docs/db-testing-throwaway-project/data`.
- **`--ff-only` fails on old branches** — `main` has diverged far past them. Cherry-pick.
- **A migration that changes what an RPC writes** ships with a suite assertion on the *written rows*
  (AGENTS.md). `mi_membresia` is a pure reader — adding it to `rpc-coverage.json` **fails** the
  no-pure-reader guard.
