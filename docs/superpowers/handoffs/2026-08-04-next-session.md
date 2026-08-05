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

**2026-08-04 update: the whole table below is DONE**, on branch `post-89-followups` (unmerged to
main). The first wave (`#179` `9b4c151` · `#178` `0bd81ae` · `#173` `cfc66ad` · CASCADE `bdbb630` ·
`#177` `0125365`) was pushed + deployed; #173/#177/#179 CLOSED, #178 open awaiting the owner walk.

| id | what happened | commit |
|---|---|---|
| **desk 0-balance gap** | **Ruled (owner, 2026-08-04): hard refuse + sale bridge** — same as #235's Agenda ruling (`2026-08-03-235-HANDOFF.md:49`, found by search, NOT re-invented). Gate at the 2 charge sites only (`Sin clases disponibles`, verbatim #237 wording); Ilimitado + pardon/booked arms exempt. VENDER banner → `/vender?cliente=` on refusal, predicate duplicated from unmerged `session-vm.ts` by design. | `94e87e8` |
| **D1** | dissolved going forward by the gate (no new silent free rows). Historical `consumio=false, perdonada=false` rows still count in the gauge — residual, accepted, not worth a slice. | — |
| **D2 + #178 copy** | `perdonada` + `origen` typed through; label = clase / `ACCESO LIBRE` only when `origen='libre'` / `—` when origen NULL | `99cbc8e` |
| **D3** | plain index on `asistencias(class_session_id)` | `9371aeb` |
| **capacity reader** | REAL BUG confirmed: `contar_reservas_activas` counts walk-ins → staff marks could show members LLENO. New member-only sibling RPC `contar_reservas_activas_miembro` (`is_walk_in=false`); staff/roster count untouched. | `9371aeb` |

**Gates on the branch:** hook green every commit (final: 89 files / 1256 tests) · `test:denial`
**42/42 green** on scratch (4 migrations applied + stamped there, incl. #226's
`20260804090000` which rode the ff). Scratch also carries unmerged #235's `20260803140000` —
residue from that session, harmless.

**Left:** owner walks (#178 ficha; desk refuse+VENDER banner on a 0-balance member) →
`/code-review` on the branch diff → merge `post-89-followups` → main → #235 merge decision → push
(owner-gated). D4 (`NO ACTION` vs `RESTRICT`) stays wontfix-unless-bitten.

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
