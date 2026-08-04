# Handoff — 2026-08-04

Two things live here: **#235 is built and unmerged**, and the **7 open `hitl` issues** are queued for
owner rulings, with #233's grilling deferred to a dedicated session.

## 1. #235 — done on the branch, awaiting the owner

Worktree `.claude/worktrees/reserva-manual-agenda`, branch `worktree-reserva-manual-agenda`, 7 commits
past local `main`. Spec context stays in `2026-08-03-235-HANDOFF.md` — read it for the design; this
section is only the state.

| commit | what |
|---|---|
| `29e58bd` | #236 — class sheet in Spanish (AGREGAR VISITA / SIN RESERVA) + `CONTEXT.md` glossary |
| `1dfc03e` | #237 — `reservar_clase` + `cancelar_reserva` take an optional staff-gated `p_cliente_id` |
| `3224fbf` | #238 — tense predicate, two mutations, tense-derived button, operator cancel |
| `13e780d` | review fix — the cancel × now gates on `claseIniciada`, not the window's close |
| `faf40b0` | story 10 — blocked pick keeps a VENDER line into `/vender?cliente=<id>` |
| `1be1810`, `b95e79c` | handoff updates |

Green: `pnpm lint`, `pnpm typecheck`, `pnpm test` (1237), two-axis review (standards + spec), and
`pnpm test:denial` **41/41 on scratch `gyyujeguycxxoaqgdnjp`**.

**Remaining: the owner walk, then explicit push consent.** Walk = book a future class from the class
sheet, confirm it lands in LISTA/CUPO/the day header, cancel it and confirm the refund, then block a
member with no classes and tap VENDER. Issues #236–#238 close on merge.

### Denial-suite gotcha, for every future migration

The runner's `SUPABASE_TARGET_REF` path runs suites only — it **never applies migrations** (that
happens on the paywalled preview-branch path). Bring scratch forward first, or every new vector fails
against an old schema. Token: `docs/db-testing-throwaway-project/data` on `main`. What worked:

```
POST https://api.supabase.com/v1/projects/gyyujeguycxxoaqgdnjp/database/query   # body {"query": <the .sql>}
insert into supabase_migrations.schema_migrations (version, name) values (…)    # then stamp it
SUPABASE_TARGET_REF=gyyujeguycxxoaqgdnjp SUPABASE_ACCESS_TOKEN=<pat> pnpm test:denial
```

Scratch is current through `20260803140000`. Node's `fetch` for the payload — PowerShell's
`ConvertTo-Json` mangles the SQL, and `jq` is absent.

## 2. The 7 open `hitl` issues

| # | Needs |
|---|---|
| [#233](https://github.com/Vack99/RED-2.0/issues/233) | **The root.** Charge-at-booking vs settle-at-check-in. Governs #171, #172, half of #232; supersedes #167, absorbs #166. |
| [#232](https://github.com/Vack99/RED-2.0/issues/232) | Should the desk toast say what a tap charged — gratis / descontada / perdonada? Needs a widened toggle-pase return, so a migration + a denial run. |
| [#178](https://github.com/Vack99/RED-2.0/issues/178) | Two class visits on one day render identically on the ficha. Ledger is correct, display isn't. Fix and copy are specced; only the taste call is open. |
| [#172](https://github.com/Vack99/RED-2.0/issues/172) | `cancel_class_session` strands consumed credits — no refund, and the "Se avisó a los reservados" toast is a lie (no notification writer exists). |
| [#171](https://github.com/Vack99/RED-2.0/issues/171) | No-show consequences once classes fill. Ilimitado members flake free today. |
| [#152](https://github.com/Vack99/RED-2.0/issues/152) | LatAm scale (~3k gyms): Resend tier, Supabase Pro, auth ceilings, domains. Billing decisions with named triggers. |
| [#136](https://github.com/Vack99/RED-2.0/issues/136) | Class sessions don't auto-roll — the bookable horizon shrinks unless staff browse the Agenda. RED was seeded 6 weeks; that buffer is finite. |

Off-tracker owner TODOs: `TENANT_ASSERTION_KEY` in the Vercel env; the 9 contactless RED members have
no email and can't be invited.

## 3. The deferred grilling — start here

A `/grilling` run over these seven was one question in when the owner deferred it to a dedicated
session. Resume there.

**Order is forced by dependency, not preference: #233 first.** Under settle-at-check-in a no-show
costs nothing, so #171 stops being optional; and nothing is charged at booking, so #172's stranded
credits largely evaporate and only the notification question survives.

**The reframe that was on the table when we stopped — do not lose it.** #233 is filed as needing a
published-Terms change, which is what has deferred it twice. That is only true if a no-show
**releases** the credit. If a no-show **forfeits** it, the member's economics are byte-identical to
today — same money, same class gone — while the internal record becomes truthful. Hold-at-booking /
capture-at-check-in / forfeit-on-no-show plausibly buys the whole truthfulness win (killing #166,
#167, the closed-window pardon, and the desk chip's promises at the root) **without touching the
Terms**. The Terms change belongs to the release variant, not to settlement itself.

The four options put to the owner, unanswered: (a) hold/capture with forfeit — recommended, and
cheapest now, since production has taken zero bookings ever; (b) keep charge-at-booking and close
#233 wontfix, which reopens #166 and #167 and makes the pardon permanent; (c) settle with release,
which needs #171's strikes and a Terms change; (d) defer again.

Whichever wins rewrites #235's charging on both paths and takes the operator-cancel refund with it —
so **merge #235 first**, then run #233 against the merged code.
