# Cross-examination — the admin CLIENTES directory, at 30 members and at 500

Issue #184, part of map #180. Method: `/cross-examine`, tier 2 (run here) — four
territory agents (domain / data / render / red team) plus a mandatory coverage critic,
then every load-bearing claim re-verified in this session against the source and against
the **live production database** (read-only `SELECT`, `gym.slug = 'red'`, 2026-08-02).

**Findings only. No fix is proposed anywhere in this document** — the doctrine ticket rules
on that. Each entry is labelled **DEFECT** (it is wrong) or **TENSION** (a tradeoff someone
chose), and carries a `file:line` that was opened and read.

---

## 0. The brief's live shape is stale — measured

The ticket says 21 clients / 9 vigentes / 13 por renovar. Live, today:

| measured (prod, 2026-08-02) | value |
|---|---|
| total clientes | **30** |
| already expired (`vence < hoy`) | **13** (−44 … −8 días) |
| on `MENSUALIDAD ILIMITADA` (`clases_restantes is null`) | **25** |
| with no phone (`tel is null`) | **9** |
| names containing an accented character | **13** |
| `vigentes` (`derivarEstado === activo`) | **10** |
| `por renovar` (`urgencia critico|urgente`) | **22** |
| **header therefore renders** | **30 total · 10 vigentes · 22 por renovar = 32 of 30** |
| rows with no package at all (`pendienteOnline` candidates) | **0** |

The header over-count is **live in production right now**, and it is larger than the brief
recorded (k = 2, not 1). Every ratio below is computed on these measured rows.

**The decomposition that matters.** Of the 22 rows in "Por renovar":

| group | n | días | what it actually is |
|---|---|---|---|
| already expired | **13** | −44 … −8 | gone; nothing to renew *on time* |
| spent one-off pass | **5** | 18 | bought one $120 `Clase individual`, used it; never members |
| **live package inside the window** | **4** | 0 … 7 | **the real queue** |

**The owner's weekly work queue is 4. The page tells him it is 22.**

---

## Ranked findings — by what each costs the owner per week

### 1. DEFECT — Search cannot find 43% of the gym by name, and the failure mode is a duplicate row

`apps/admin/src/app/(app)/clientes/_components/clientes.tsx:62-65`

```ts
const q = query.toLowerCase();
list = list.filter((x) => x.c.nombre.toLowerCase().includes(q) || !!x.c.tel?.includes(query));
```

`toLowerCase()` only — no Unicode normalisation, no diacritic folding, no digit stripping.

**Measured: 13 of 30 live names carry an accented character.** Typing `chavez` returns **0 of
4** Chávez members. Typing `hernandez` returns Jaime **Hernandez** and *not* Diana
**Hernández** — who is the one member whose package expires today. Separately, **9 of 30 have
`tel IS NULL`** (legal since #190), so for those members the name is the only handle, and for
the accented ones that handle is broken.

**Failure scenario.** Brenda Chávez is at the counter. Operator types `chavez` → the screen
renders "SIN CLIENTES — Ajusta los filtros o agrega un cliente" (`clientes.tsx:236-237`). The
operator now believes she is not in the system. The next plausible tap is **+ Nuevo cliente**
(`clientes.tsx:103-112`) — creating a duplicate, in a directory with **no name dedup and no
delete affordance anywhere** (verified: no `eliminar|borrar|delete|archivar` under
`apps/admin/src/app/(app)/clientes/`).

Two aggravations. The same file gets accents **right** three lines later —
`clientes.tsx:68` uses `localeCompare`, so the page **sorts** accent-correctly and **searches**
accent-blind. And `telDigits()` already exists in `packages/format/src/format.ts:48-50`,
documented as "the single home for 'what is a valid tel'" — unused by this search box, so
`614 123 4567` pasted from a WhatsApp contact card matches nothing (all 21 non-null tels are
stored as bare 10 digits, measured).

**Cost:** per-lookup, every shift — the highest-frequency failure on the page.
**At 30:** recoverable by scrolling. **At 500: catastrophic** — search is the only door.

---

### 2. DEFECT — The red is anti-informative, and the one perfectly-predictive signal is rendered at 1.84:1 contrast

`clientes.tsx:23-28` (`urgencyColor`), `:241-242`, `:252`; `packages/brand/src/red/tokens.ts:32,39,56`

This answers surface 8 of the ticket directly: **what is the red actually buying him?**

Measured tier distribution on the live 30, with the count in each tier that has a live package
with time and classes left:

| tier | colour | rows | actionable | precision |
|---|---|---|---|---|
| `critico` | `--red` #ff5a5a | **19** (63%) | **1** | **5.3%** |
| `urgente` | `--gold` #7e0d10 | **3** | **3** | **100%** |
| `pronto` | `--fg` | 4 | 4 | 100% |
| `ok` | `--muted` | 4 | 4 | — |

Three candidate hypotheses for what he gets from the red:

- **(a) "this person owes me money."** False for 19 of 19. Sales are paid at point of sale;
  there is no balance column on `clientes` (verified against `information_schema`).
- **(b) "this person is slipping away."** True for **1 of 19**. Thirteen have already gone —
  that is not slipping. Five were never members.
- **(c) "this row is different from the others."** This is what he is getting — and **it has
  stopped being true**, because 19 of 30 rows are red. Figure and ground are inverted: the
  marked set is the majority, so the 11 *unmarked* rows are now the distinguished ones.

`P(actionable | red) = 1/19 = 5.3%` against a base rate of `4/30 = 13%`. **Seeing red makes a
row *less* likely to be actionable than not looking at all.**

**And the tier that is a perfect classifier is the one he cannot see.** Contrast computed from
the verified RED tokens (`tokens.ts:39` `gold: "#7e0d10"`, `:32` `canvas: "#0a0a0a"`):

- `critico` #ff5a5a on #0a0a0a → **6.47:1** (fine)
- `urgente` #7e0d10 on #0a0a0a → **1.84:1** — fails WCAG 1.4.11 (3:1 for non-text graphics)
  and 1.4.3 outright

The 3px bar (`clientes.tsx:252`) and the 17px day count (`:304`) for the *only 100%-precise
tier on the page* are effectively invisible on the brand the app is named after. The same
1.84:1 gold also carries the header's "22 por renovar" numeral (`:122`), the active-filter
indicator (`:142` — so "your list is filtered" is *less* visible than "it isn't"), and the
`Limpiar` escape hatch (`:211`, at 10px).

Colour is the **sole** carrier: the bar is a bare `<span>` with no text, no `role`, no `aria`;
`Icon` is `aria-hidden` (`packages/ui/src/forge/icon.tsx:81`). Nothing renders the word.

**The correct two-colour distinction already exists one level deeper.**
`packages/ui/src/forge/ui.tsx:112-114` maps `sin_clases → red "SIN CLASES"` and
`por_vencer → gold "POR VENCER"`, and the ficha renders it (`cliente-detalle.tsx:244`). On the
detail screen a lapsed member and an expiring one look different. **On the list — the only
screen that ranks people — they are identical.**

**Cost:** misdirects the entire weekly retention sweep.
**Structural at every scale**, and monotonically worsening: `P(actionable | red) → 0` as the
lapsed block grows (finding 9).

---

### 3. DEFECT — The default sort is monotonically inverted against the value of acting

`clientes.tsx:46` (`useState<Sort>("dias")`), `:67` (`dias: (a, b) => a.c.diasRest - b.c.diasRest`)

Ascending on a signed number with no floor, so the longest-dead member is permanently row 1.

Row height is 71px (`:268` 14px padding ×2 + `:270` 42px Avatar + `:250` 1px border); chrome
above row 1 is ≈250px. On a ~712px phone viewport that is **≈6.5 visible rows**.

**Measured, today: rows 1–6 are members gone 21 to 44 days. The entire first screenful is
ex-members, at 100%.**

Diana Hernández — `dias = 0`, today is her last valid training day (ruling C9,
`packages/domain/src/rules.ts:87-88`), package `Mensualidad ilimitada` at **$1,200/mo measured
from her own ledger row** — is **row 14**, behind `13 × 71 = 923px` of scroll, and rendered in
exactly the same red as a member gone 44 days.

**On the money claim, stated honestly.** I could not source a renewal-conversion rate by
recency and did not invent one — `unmeasured — log outreach date and outcome per member, compare
conversion at day −2 vs day +20`. What the ledger supports without any benchmark: 13 lapsed
members × $1,200 list = **$15,600/month of the roster not billing**, against a ceiling of
25 × $1,200 = $30,000. **52% of potential monthly revenue sits in the block the page ranks
first and colours identically to the block it should rank first.**

**Structural now, not at 500.** At 500 members / 24 months / 80% monthly renewal
(`modelled — flat 30-day vigencia per rules.ts:69, uniform expiry phase, permanent directory`):
2,400 lapsed rows ≈ 170,000px ≈ **240 screenfuls** before the first actionable row.

---

### 4. DEFECT — "Por renovar" is 82% non-actionable, and `urgenciaCliente` is the one lifecycle function that skips the floor

`packages/domain/src/rules.ts:149-162`; consumed at `clientes.tsx:52` (count), `:58` (filter),
`:181` (chip), `packages/data/src/server/export/rows.ts:200` (xlsx)

`rules.ts:154` — `if (dias <= URGENCIA_DIAS.critico || clases <= URGENCIA_CLASES.critico)` with
`critico = 3` (`:138`). Fires identically at `dias = 2` and `dias = −44`. There is no lapsed
tier in the domain at all.

Measured pollution: **22 flagged, 4 actionable — 82%.** He scrolls 22 rows reading 22 signed
integers to recover the 4 that matter. The page did the filtering and handed back the
arithmetic of who is still a customer.

**Read the comment that lets this survive review.** `rules.ts:83-91`, on `estaVencido`:

> "The single home for the 'expired by date' boundary — forfeit, baseParaStack, derivarEstado,
> and **every read-side 'vencido' signal route through here** instead of re-coining `dias < 0`."

**That invariant is false in its own file.** `urgenciaCliente` sits 57 lines below it, is a
read-side signal, drives the roster accent, the count, the filter and the accountant's export
— and never calls `estaVencido`. `derivarEstado` (`rules.ts:106`) does. A reviewer reading
`rules.ts` top-to-bottom is told lapsed is handled.

**And nobody chose this.** `packages/domain/src/rules.test.ts:175-198` is the entire
`urgenciaCliente` suite — verified, every vector is non-negative (`dias ∈ {20,3,7,14,2}`).
Meanwhile `estaVencido`, `forfeit`, `baseParaStack` and `derivarEstado` all explicitly test
`dias = −1`/`−2`. **The one function with no lower bound is the one function nobody probed
below zero.**

Worse — `packages/data/src/server/export/rows.test.ts:169-174` **pins the defect as the
spec**. Verified verbatim:

```ts
it('"Crítico" when the package is expired (días <= 3)', () => {
  const r = buildRespaldoRows(data({ clientes: [cliente({ vence: "2026-05-20", … })] }));
  expect(r.clientes.rows[0][8]).toBe("Crítico");
});
```

The title names the input **"expired"** and then asserts the **not-expired** tier. Any future
lapsed tier breaks this test, so the guard currently points the wrong way.

---

### 5. DEFECT — Four threshold engines answer "how is this member doing", with three different bands

The domain sweep reported "only 2 consumers of `urgenciaCliente`", which is true and
misleading. The question is answered independently in four places:

| engine | bands | drives | anchor |
|---|---|---|---|
| `urgenciaCliente` | 3 / 7 / 14 días, 1 / 3 / 5 clases | roster accent, sort's partner, "por renovar", xlsx | `rules.ts:138-139` |
| `derivarEstado` | 5 días, 2 clases | header `vigentes`, desk pill | `rules.ts:111-112` |
| `getRosterResumen` SQL | restates `derivarEstado` in raw predicates | **dashboard** counts | `packages/data/src/server/clientes.ts:239-245` |
| **inline `<= 5` on the ficha** | 5 días | the number, the gauge, the "Vence" label | `cliente-detalle.tsx:337, :340, :344` |

The fourth is the one nobody had found, and it is forbidden by name.
`rules.ts:136-137` states: *"the directory roster, its sort, and **any future ficha treatment**
consume `urgenciaCliente`, never re-coin these numbers."* The ficha treatment landed and
re-coined — verified, three times on three adjacent lines — and inherits the identical missing
floor: a 400-day-expired member renders `−400` in `var(--yellow)` under "DÍAS RESTANTES" with a
gold "Vence".

Consequence for the ruling: **fixing `rules.ts:149` fixes one engine of four.**

Related, same class: `packages/data/src/server/plantilla-ctx.ts:23-24` re-coins the expiry
boundary at `<= 0` instead of `< 0`, drifting from ruling C9 — so on the vence day itself (a
valid training day, admitted by the desk) the WhatsApp `{dias}` token already reads
**"vencido"**. The seeded "Renovación" template (`supabase/migrations/20260705082018_…sql:181-207`)
is `"Tu paquete vence en {dias}"`, so a lapsed member receives **"Tu paquete vence en vencido."**

---

### 6. DEFECT — 13 of 30 rows tell the owner an ex-member has unlimited classes left

`rules.ts:185-188` (`forfeit`), `packages/data/src/server/derive.ts:45-47, :63`, `clientes.tsx:307`

`forfeit` returns `"ilimitado"` unchanged regardless of expiry — correct in isolation (there is
no count to forfeit), but `clasesRestLabel` then renders `∞`.

**Measured: all 13 expired members are on `Mensualidad ilimitada`** (25 of 30 overall). Every
one renders `−44 días` over `∞ cl`. A member who left six weeks ago is described as having
unlimited classes remaining.

**This exact reading was already found wrong and already fixed — in the other app.**
`packages/data/src/server/derive.ts:448-452` carries a dedicated `vencido` flag, derived
*independently of* `forfeit`, with the comment: *"so an expired ILIMITADO reads as vencido too
(#118 E3) — the plan card renders its expired state instead of a full ∞ bar + 'activo'."*
The member-facing app got it. **The admin roster — the screen where the money decision is made
— never did.** The member sees the truth; the owner sees ∞.

---

### 7. DEFECT — Acting on a row does not change the list

`clientes.tsx` contains **no `router.refresh()`** — verified, its `router` is used at exactly one
place, `:295`, to push `/vender?cliente=`. The ficha returns via
`cliente-detalle.tsx:190` `router.back()`.

So: roster → row → ficha → renew / mark attendance → back = **the same stale roster and the
same stale header counts**. The row he just fixed does not move, and the count he was working
down does not decrease. Next.js 16.2.6's own docs state `staleTimes` "doesn't change back/forward
caching behavior" (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/staleTimes.md:33`).

For a page whose stated job is a work queue, the queue does not empty as it is worked.

---

### 8. DEFECT — The header is not a partition, always over-counts, and the error is intermittent

`clientes.tsx:52, :54, :118-122`

Proof it can never sum correctly and never *under*-counts:

1. `derivarEstado` partitions `{activo, por_vencer, sin_clases}` (`rules.ts:106-116`, exhaustive).
2. `por_vencer` ⟹ `dias ≤ 5 ∨ clases ≤ 2` ⟹ urgencia ∈ {critico, urgente}.
3. `sin_clases` ⟹ `dias < 0 ∨ clases ≤ 0` ⟹ `critico`.
4. ∴ `porRenovar = (total − vigentes) + k`, so **`vigentes + porRenovar = total + k`, `k ≥ 0` always**.
5. `k = |activo ∧ (dias ∈ {6,7} ∨ clases = 3)|` — the complete overlap band.

**Live `k = 2`** (measured) — two members are simultaneously "vigente" and "por renovar", so
the header renders **32 of 30**.

The second-order damage is worse than the arithmetic. On a flat 30-day cycle (`rules.ts:69`),
each active member spends 2 of every 30 days inside the 6–7 band, so `E[k] ≈ 0.067 × activos`
(`modelled — flat 30-day vigencia, uniform expiry phase`). At 10 active, `E[k] ≈ 0.67`: **the
header sums correctly on roughly a third of days and is wrong on the rest.** An error that is
small and intermittent cannot be learned as a rule — only as *"sometimes the numbers on this
page don't add up"*, which is the belief that generalises to every other number on the screen.

**The path to distrusting a correct number runs through the export.** `export/rows.ts:192-193`
writes `Estado` and `Urgencia` as **adjacent columns**; for the 13 lapsed members the
accountant's sheet reads `Sin clases | Crítico`. The left column is right, the right column is
the defect, and the Ventas money columns ship in the same workbook. The sheet's own header
(`rows.ts:197-198`) states the reuse decision — the *right* architecture faithfully propagating
the *wrong* rule into the artifact he sends outside the business.

**Cosmetic at 30 (32 of 30 is catchable) — and worse at 500**, where `E[k] ≈ 13` renders
something like `580 · 200 · 393` and the error stops being checkable by eye at all.

---

### 9. DEFECT (structural) — Nothing ever leaves, so the flagged list goes majority-dead in under two months at any churn rate

`clientes` has **no `baja`, `archivado`, `estado` or `deleted_at` column** (verified against
`information_schema.columns`), and there is no archive or delete affordance anywhere under
`apps/admin/src/app/(app)/clientes/`.

Let `A` = steady active members, `r` = monthly renewal rate, `M` = months of operation. The
lapsed population is cumulative and permanent (`A(1−r)M`); the flagged-but-alive population is
roughly constant (`7/30 ≈ 0.23A`). Dead share of the flagged list is

`(1−r)M / ((1−r)M + 0.23)` — **independent of `A`.**

Majority-dead at `M > 0.23/(1−r)`: **2.3 months** at r=0.9, **1.2 months** at r=0.8, **0.5
months** at r=0.5. `modelled — flat 30-day vigencia (rules.ts:69), uniform expiry phase, steady A,
permanent directory. r is a free parameter — I have no sourced renewal rate and did not invent one.`

**The model is calibrated by the live gym.** RED is at M ≈ 2.4 and measures **82%
non-actionable** — inside the band the model predicts. This is not a projection; it already
happened.

At 500 / 24 months / r=0.8: ~2,400 lapsed rows, first screenful still 100% ex-members, ~2 hours
to scan the flagged list at 3s/row (`modelled`). **The real failure at 500 is not wasted time —
it is that he abandons the page.** That is the cost: not minutes, but the loss of the tool.

---

### 10. DEFECT — The `Días` facet is labelled as a forecast and behaves as a graveyard; the `Clases` facet cannot match 25 of 30 members

`clientes.tsx:60` (`x.c.diasRest <= diasMax`), `:61` (`clasesNum(x.c) <= clasesMax`), `:200-201`, `:18-20`

Two facets, one visual grammar (`FacetRow`, `:327-358`), failing in **opposite** directions.

**`Días` has no floor.** "≤3" reads as *"expiring within three days"* and means *"expiring
within three days, **or gone, ever**."* **Measured: tapping `Días ≤3` returns 14 rows, of which
13 are ex-members — a 93%-dead result set.** Because the lapsed block is in the result of all
three options, tightening ≤14 → ≤3 never removes it; the buttons differ only by a thin live
band layered on a shared permanent base.

**`Clases` has an unreachable ceiling.** `clasesNum` maps `"ilimitado" → Infinity` (`:18-20`),
and `Infinity <= 5` is false. **No ilimitado member can ever match any `Clases` option — that
is 25 of 30 live members, permanently invisible to the facet**, expired or not.

**This one is more misleading at 30 than at 500.** At 500 `Días ≤3` returns ~200 rows and is
self-evidently useless. At 30 it returns 14 of 30, which *looks* plausible — so he acts on the
wrong 14 without noticing.

---

### 11. DEFECT — "Todo al día" is dead in its intended meaning and alive in a wrong one

`clientes.tsx:233-239` — the branch keys on `renovar` **alone** (`:236`), guarded by
`list.length === 0`, ignoring `query`, `diasMax`, `clasesMax` and `online`.

**Dead in its intended meaning:** nothing ever leaves `renovarCount`, so for any gym that has
ever had a member expire, the `Por renovar` filter can never return zero. Unreachable by its own
filter.

**Alive in the wrong one:** turn `Por renovar` on, type a name that matches nobody, and the
screen renders a check icon and a bold **"TODO AL DÍA — Nadie en riesgo con estos filtros."**
**A failed search is rendered as a clean bill of health for the gym.** Reachable and
demonstrable today. The same false all-clear fires via `renovar` + `Clases ≤1` on an
all-ilimitado roster, which finding 10 guarantees is empty.

---

### 12. DEFECT — The accent is not monotonic in the sort, so the red block cannot be scanned

`clientes.tsx:67` sorts on `diasRest`; `:49`/`:241` colours on `urgenciaCliente`, which is
`max(días-pressure, clases-pressure)` (`rules.ts:154-156`). Two functions of two different
variables; they disagree.

Measured, scrolling top to bottom today: **red ×14, gold ×3, neutral ×4, red ×5, grey ×4.**
The five spent `Clase individual` passes (`0 clases`, 18 días left) are full `critico` red and
sort *below* four neutral rows. **The red block is interrupted and then resumes.**

Failure scenario: he scrolls until the red stops, concludes he has seen the urgent set, and
stops at row 17 — missing five red rows. Or, more likely, he learns the red doesn't run in a
block and stops using it as a scan target at all.

*Credit where due:* the `vinculante` logic that puts `0 clases` in the big slot for those rows
and `18 d` in the small one is **correct** (`rules.ts:158-160`). The bug is that the list then
orders itself by the dimension that logic just rejected.

---

### 13. DEFECT — A failed roster read renders as an empty gym

`packages/data/src/server/clientes.ts:179-180` — `const clientes = clientesRes.data; if (!clientes) return [];`
The error object is discarded. Same at `:264-266` and `:82`.

The screen then paints `0 total · 0 vigentes · 0 por renovar` and "SIN CLIENTES". **A database
outage is indistinguishable from a brand-new gym**, and any doctrine that puts a count in the
header asserts something the read layer cannot currently guarantee.

---

### 14. DEFECT (scale-only) — The roster read silently truncates at 1000 while every sibling read paginates

`packages/data/src/server/clientes.ts:165-177` — no `.limit()`, no `.range()`.
`supabase/config.toml:18` — `max_rows = 1000`.

The repo paginates against this cap **everywhere except here**: `roster-nav.ts:52-63` (the
ficha's *swipe-neighbour* read, whose own comment says an un-paginated read "silently truncates
the roster… with no error"), and `respaldo.ts:49-76, :92-118`. The derived nav is protected;
the primary list is not.

At 1001 clientes, the tail of the alphabet vanishes with no error, while the dashboard's
`{ count: "exact", head: true }` (`clientes.ts:231-238`) is **not** row-capped — so the
dashboard reports 1,240 and the directory shows 1,000, and nothing logs.

The export is worse: it runs its **own** unbounded `clientes` read (`respaldo.ts:182-186`), and
`rows.ts:172-173` builds `nombrePorId` from it — so past 1000, **every venta and asistencia
belonging to the truncated clients renders "—" in the Cliente column**. Silent anonymisation
inside the artifact whose purpose is being the record of last resort.

Logged as accepted debt (`docs/health/accepted-debt.md:23-29`, L-003, trigger at 900) — but the
trigger is a manual re-run, not a machine guard.

---

### 15. DEFECT (scale-only) — Every search keystroke re-measures and re-animates the entire mounted list

`packages/ui/src/forge/use-flip.ts:94-115`, called at `clientes.tsx:96` with `query` in the deps

`clientes.tsx:129` fires per `input` event — no debounce, no `useDeferredValue`, no
`startTransition` anywhere. So one keystroke = one new list + one full FLIP pass.

The pass iterates `nodes.current` — **every mounted row, not the window** — and is a read/write
interleave: `getBoundingClientRect()` at `:100`, then `playFlip` at `:109` which writes
`style.transition` and `style.transform` (`:54-55`) inside the same iteration. Each write
dirties style; each subsequent rect read forces a fresh layout flush. Plus one `requestAnimationFrame`
per moving row (`:56`) and a 220ms transition each (`:43`).

At ~16 elements/row: 21 rows ≈ invisible; 500 rows ≈ 500 rects + ~500 forced reflows + 500 rAFs
+ 500 concurrent transitions per keystroke. `unmeasured — seed 500 clientes on a scratch gym and
read long-task duration while typing on a mid-range Android.` The structural facts (unbounded N,
interleaved forced reflow, per-row rAF, no debounce) are verified from source; the ms figure is not.

Not the cost, and not worth touching: `toLowerCase()` per row and `toSorted` are sub-millisecond
even at 500.

---

### 16. DEFECT (scale-only) — The server-painted window is 100% ex-members at 200 and 500

`packages/ui/src/forge/use-revealed-window.ts:33` (`size = 50`), `:43`; `clientes.tsx:85` passes no override

Verified: `revealAll` starts `false` (`:35`), one rAF flips it true (`:36-42`), and there is **no
dep on `list`** — so it never re-windows. It is an SSR-payload trim, not virtualization.

**At 30 members it is a total no-op** (`slice(0,50)` of a 30-item array), costing one extra
render and a wasted measure pass. The windowing branch has never executed in this gym's
production.

At 200/500, under the default sort, those first 50 rows are **the 50 longest-dead members**.
The server-rendered HTML of the directory becomes 100% ex-members. Then the reveal commit mounts
all remaining rows in one go (450 subtrees ≈ 7,200 elements at 500).

The hook's own comment (`:11-13`) claims it "halves the initial HTML/SSR cost" — true at exactly
100 rows, 0% at 30, 90% at 500.

---

## Tensions — deliberate tradeoffs, not defects

**T1 — The expiry clock is the only clock with any data in it.** Absence is computable in
principle (the `asistencias` per-visit ledger, #89), but **measured: RED has 0 asistencias and 0
reservations.** A days-since-last-visit tier has *no data at this gym today*. This constrains
any alternative and must not be waved away. `unmeasured — whether attendance marking gets adopted
once invites land; experiment: re-measure asistencias 30 days after the first invite batch.`

**T2 — Outreach machinery is deliberately out of scope** (map #180). But the absence is
load-bearing: there is no last-contacted field, no note, no "known moved away". Message a lapsed
member and the page looks identical afterwards — he cannot avoid messaging the same person twice.
The seeded templates confirm the gap is total: all four
(`supabase/migrations/20260705082018_contract_b_drop_user_id_columns.sql:181-207`) address a
**current** member. No win-back, no reactivation, no ADR. **This is evidence, not opinion, that
the product has never had a lapsed concept anywhere** — so a lapsed tier implies a new outbound
template, not just a new sort.

**T3 — The dashboard's one retention CTA lands on the worst screen state.**
`inicio.tsx:179-184` — a tile labelled "POR VENCER · Revisar roster" pushes to `/clientes` with
**no filter**, landing on row 1, the longest-dead member. The deep-link precedent exists and was
built for the *other* tile (`/clientes?online=1`, honoured at `page.tsx:8-11`) — which fires on
**0 of 30 live rows**. And `renovar` is `useState(false)` (`clientes.tsx:42`) with no URL param,
so it resets on every navigation: three taps plus a 240ms animation, every time.

**T4 — `getRosterResumen`'s SQL restatement is correct but hand-maintained.**
`clientes.ts:210-222` carries a written equivalence proof against the pure path, and I traced
both against the live rows — **they agree at 10**. Deliberate duplication for query performance.
The tension: a lapsed tier would have to be re-coined a second time, in SQL, held in lockstep by
a prose comment.

**T5 — `size = 50` is a magic constant invisible from the screen that depends on it**
(`use-revealed-window.ts:33`), justified in its comment, with no test pinning it.

**T6 — `baseParaStack`/`stackPaquete` have zero production call sites** (tests only), while
`rules.ts:196-200` states the write path "MUST call this". The write path re-derives in PL/pgSQL
(`20260710121000_registrar_venta_rederive.sql:106`). A documented ruling (ADR-0005), so a tension
— but any lapsed-tier change to the domain would silently not reach the money path.

---

## What is genuinely well built

Stating this plainly, because an audit that reports 100% failure is not credible.

- **The roster read is the right shape.** Exactly 2 parallel round trips (`clientes.ts:165-177`),
  **not N+1** — `hoy` computed once at `:160`, zero `await` in the map at `:185-193`, attendance
  as a grouped DB-side count. The migration header
  (`20260714070000_ventas_count_por_cliente_rpc.sql:1-10`) shows it deliberately replaced a
  correlated per-row embed.
- **Indexes cover this read's actual access path**: `clientes_gym_id_idx`
  (`20260702161613_gym_id_expand_tenant_tables.sql:245`) and an exact partial-predicate match on
  `asistencias_gym_fecha_idx` (`20260713180000_respaldo_base_indexes.sql:13-15`). The repo memory's
  two flagged criticals (`ventas.cliente_id`, `clientes.auth_user_id`) do **not** touch this page.
- **The ADR-0013 correlated-SubPlan hazard is already retired for this read** —
  `20260714080000_rls_uncorrelated_predicates.sql:48-51` rewrote the SELECT policy to the
  uncorrelated set-membership shape, with live proof in its header (42ms → ~3ms).
- **The write side is completely clean of these thresholds.** Nothing in `registrar_venta`,
  `toggle_pase` or the renewal flow reads `urgenciaCliente` or its 3/7/14 bands; they gate on the
  bounded C9 `vence` boundary. **The bands are purely display/ranking — the ruling can retier them
  with no migration, no `test:denial` obligation, and no deploy-window risk.** This materially widens
  the option space and no territory agent said it out loud.
- **`estaVencido` has a correct SQL mirror.** `rules.ts:92-93` (`dias < 0`) vs `reservar_clase`
  (`20260729120000_reservation_truthfulness.sql:666`) — algebraically identical at day granularity,
  both resolving "today" in the gym's zone.
- **`vinculante` is correct under every reachable input**, including negatives (proof:
  `clasesN < diasN` with `diasN < 0` requires `clases < 0`, and `forfeit` floors at 0).
- **`useFlip`'s enter/leave handling and reduced-motion path are correct and honestly documented**
  (`use-flip.ts:106-107`, `:112`, `:95`), and its pure helpers are properly unit-tested.
- **Windowing gates painting only** — filtering, sorting and search run over the full dataset from
  the first keystroke and `list.length` stays exact (`clientes.tsx:79-84`). A tempting attack that
  is simply false.
- **Declining `prefetch` on row links** (`clientes.tsx:258-263`) correctly avoids an N× 7-call ficha
  fan-out, and **COBRAR as a sibling of the `<a>`** (`:264-266`) is correct HTML and correct for AT.
- **The `asistencias` aggregate sweep** (`20260728120000_asistencias_visit_invariants.sql:81-113`)
  enumerates every aggregate reader post-#89, names the one hole, and states the change and its cost
  rather than deciding silently. Model work; it killed an attack outright.

---

## Breaking-point table

| component | breaks at | bound by |
|---|---|---|
| Red-accent signal value | **already broken** — 19/30 red, precision 5.3% | `P(actionable\|red) → 0` as the permanent lapsed block grows |
| Default `dias`-sorted first screenful | **already 100% ex-members** at 30 | unclamped negative `diasRest` sorted ascending (`clientes.tsx:67`) |
| "Por renovar" majority-dead | **M > 0.23/(1−r)** → ~1.2 months at r=0.8; RED is past it | nothing ever leaves the directory |
| Header partition arithmetic | wrong on ~2/3 of days at 10 active; **uncheckable** past ~100 | `E[k] ≈ 0.067 × activos` (`modelled`) |
| `Días ≤3` facet | **already 93% dead** (14 returned, 13 gone) | no lower bound at `clientes.tsx:60` |
| `Clases` facet | **already excludes 25 of 30** | `"ilimitado" → Infinity` (`clientes.tsx:18-20`) |
| Search by name | **already fails 13 of 30** | no diacritic folding (`clientes.tsx:64`) |
| Browser filter/sort/search responsiveness | ~300–600 revealed rows | interleaved forced reflow per row per keystroke (`use-flip.ts:99-110`) — `unmeasured` |
| SSR window usefulness | inert below 50; **100% graveyard at 200+** | `size = 50` (`use-revealed-window.ts:33`) under the default sort |
| Roster completeness | **1001 clientes in one gym** | PostgREST `max_rows = 1000`, no `.range()` (`clientes.ts:165-177`) |
| Export cliente names in ledger sheets | **1001 clientes** | unbounded read → `EM_DASH` (`rows.ts:173`) |
| Payload over the wire | **never binds** — ~173 KB raw / ~25 KB brotli at 500 | `modelled — 355 B/row` |
| Postgres roster leg | **fine past 10k rows/gym** | index scan + ~0.2 ms sort at 500 |
| Server render (SSR HTML) | **constant in roster size** | 50 rows painted regardless |
| Round trips | **constant: 2** | not N+1 |

---

## Confidence ledger

| claim | basis |
|---|---|
| 30 clientes, 13 expired, 25 ilimitado, 9 no-tel, 13 accented names | **measured** — live prod SELECT, 2026-08-02 |
| Header renders 32 of 30 (k=2) | **measured** — live, replicating both domain predicates in SQL |
| "Por renovar" = 22 → 13 dead + 5 spent passes + 4 live | **measured** — live, grouped |
| Tier precision: red 1/19, gold 3/3 | **measured** — live, replicating `urgenciaCliente` in SQL |
| `Días ≤3` returns 14, 13 dead | **measured** — live |
| gold #7e0d10 on #0a0a0a = 1.84:1; red #ff5a5a = 6.47:1 | **measured** — WCAG relative-luminance computed from `tokens.ts:32,39,56` |
| `urgenciaCliente` never calls `estaVencido`; no floor anywhere | **measured** — `rules.ts:149-162` read in full |
| Overlap band `dias ∈ {6,7} ∨ clases = 3` | **modelled** — set algebra over `rules.ts:106-116` vs `:154-156`; confirmed live at k=2 |
| Four threshold engines, incl. inline `<=5` at `cliente-detalle.tsx:337/340/344` | **measured** — read directly |
| Zero negative-`dias` vectors in `rules.test.ts`; `rows.test.ts` pins "Crítico" for an expired fixture | **measured** — read directly |
| No `router.refresh()` in `clientes.tsx` | **measured** — grep, one `router.push` at `:295` |
| Write side never reads these bands | **measured** — migrations read |
| $15,600/mo lapsed at list price | **modelled** — 13 lapsed × $1,200 measured from the ledger |
| Majority-dead at `M > 0.23/(1−r)` | **modelled** — flat 30-day vigencia, uniform phase, steady A; `r` is a free parameter |
| FLIP cost in ms at 500 rows | **asserted** — structure verified, timing not |
| Renewal conversion at day −2 vs day +20 | **asserted — no source, deliberately not invented** |

---

## Could not determine — and the experiment that settles each

1. **Whether the owner has ever noticed the buried expiring member.** *Experiment: watch one
   Tuesday sweep over his shoulder, or ask which row he opens first.*
2. **Renewal conversion by recency.** *Experiment: log outreach date + outcome per member; compare
   day −2 against day +20.* Until then, no lapsed-horizon boundary can be set on evidence.
3. **Whether attendance data will ever exist here.** RED has **0 asistencias** (measured).
   *Experiment: re-measure 30 days after the first invite batch lands.*
4. **FLIP/reveal cost at 500 on real hardware.** *Experiment: seed a scratch gym to 500 clientes,
   profile the reveal commit and a search keystroke on a mid-range Android.*
5. **Whether PostgREST's `max_rows` applies to the set-returning attendance RPC.** *Experiment:
   expose a function returning 1,500 rows on the scratch project and count the response length.*

---

## Owner-input list — facts no agent can derive

1. **Is a lapsed member a prospect or a record?** Decides whether they stay in the default view.
2. **At what horizon does he stop wanting to see someone?** (30 / 60 / 90 days). Nobody has drawn
   this line; it is `undecided`, not unmeasured.
3. **Does the front desk share his default view, or is find-and-charge a different screen?**
4. **Does he want a declared "gone" state** (a human fact) as distinct from a computed one — the
   ADR-0002 question the map flags.
5. **What did he mean by "the red is useful"?** The measured answer is that it marks 63% of rows at
   5.3% precision; his felt answer may be about something else entirely, and finding 2 should be
   put to him directly.

---

## Dissent log

- **"21 members" (brief) vs 30 (measured).** Resolved in favour of the live DB. Every ratio in
  this report is recomputed on 30; the defects are all *larger* than the brief recorded.
- **"82% non-actionable / queue is 4" (red team) vs "9 actionable" (my SQL).** Both correct,
  different lines. 22 − 13 dead = 9 with a non-negative clock; 5 of those 9 are spent one-off
  passes with 0 classes. **The queue with a live package and time left is 4.** Recorded as the
  decomposition table in §0 so no reader has to pick.
- **"Only 2 consumers of `urgenciaCliente`" (domain sweep) vs "four threshold engines" (coverage
  critic).** Both true; the *framing* was wrong. Two literal call sites, four independent answers
  to the same question. Finding 5 states it the second way because that is what the ruling needs.
- **`useFlip` deps omitting `list` — DEFECT (render agent) vs no reachable trigger (coverage
  critic).** Resolved **in favour of the coverage critic**: `ClientesScreen` cannot receive new
  props while mounted (server component, no refresh on this route). **Downgraded to latent** and
  deliberately not ranked — it arms the moment a `router.refresh()` is added, which finding 7 says
  is missing.
- **`getClienteFicha` missing its `gym_id` scope** (`clientes.ts:297-303`, verified — unlike every
  sibling read). Raised by the coverage critic as a tenancy defect. **Verified latent, not live:**
  0 users hold `owner|operator` in more than one gym across all 4 gyms. Recorded here rather than
  ranked, because it is off this page's critical path — but it is real, and the demo-twin model
  exists to create exactly that operator.

---

## Blind spots — what this audit did not examine

1. **No runtime measurement of any kind.** No profiler, no Lighthouse, no device testing. Every
   render-cost claim is structural, read from source.
2. **The owner was never observed or interviewed.** The two-persona model comes from map #180's
   notes, not from watching anyone work.
3. **No competitor comparison.** Map #180 requires the doctrine to cite what established systems do;
   this audit examined only the incumbent, and deliberately so. That research is a separate ticket
   and this report does not substitute for it.
4. **`clientes.tsx` has zero tests, and there is no way to add one today.** Verified: the
   `_components/` directory holds exactly one file; every sibling screen extracted a testable
   view-model (`vender-vm.ts`, `marcadas.ts`, `session-vm.ts`, each with a test) and this one did
   not; `vitest.config.ts:26-29` states there is no DOM test infra (no jsdom, no testing-library),
   and there is no Playwright/Cypress config. **The header counts, all four filter predicates, all
   three sorters, the accent-blind search and the empty-state branch are unverified and currently
   unverifiable** — which is why nothing above is asserted from tests, and why "extract a view-model
   first" may belong *inside* the ruling rather than after it.
5. **Not examined: the `[id]` ficha as a whole** (only its threshold re-coining), `/vender`,
   `/agenda`, the client-facing app's lapsed rendering beyond confirming it exists, and any
   notification path.
6. **Timezone/DST edge cases were checked server-side only.** `hoyEnZona` is per-request and
   Chihuahua has had no DST since 2022; but the mounted client page holds one snapshot for its whole
   life with **no `visibilitychange` or `focus` listener anywhere** — a front-desk tablet left open
   overnight renders yesterday's numbers. Not ranked; flagged for the ruling.
7. **Duplicate names are already live** (two `Joel Trevizo` in `forge`, different tels and vence
   dates) and the row offers no disambiguator beyond tel and an invite badge. Not pursued.

---

## Draft audit

Sentences changed or cut before this document was returned, and the rule that caught each.

- **Cut** *"the roster read is well-architected and should scale fine"* (from the data territory's
  framing) — adequacy claim with no number (Rule 7). Replaced with the breaking-point row: constant
  2 round trips, index-covered, **binds at 1001 on `max_rows`**, and the separate observation that
  the *default view* degrades at ~50 lapsed rows, not at 500 total.
- **Cut** *"this is a standard windowed-list pattern"* — survives the substitution test; true of any
  windowed list, says nothing about this one (Rule 4). Replaced with the measured fact that
  `size = 50` makes the hook **inert at 30** and a **100% graveyard at 200+** under this page's
  default sort.
- **Rewrote** the red team's *"the page costs him $15,600/month"* → *"$15,600/month of the roster is
  not billing; the page ranks that block first"* (Rule 5). The peso figure is measured; the causal
  claim was not, and would not survive a challenge.
- **Cut** an industry renewal-conversion benchmark that appeared in an early draft of finding 3. No
  source existed. Replaced with `unmeasured` and the experiment (Rule 5) — the rationalization table's
  "in my experience" row, caught in my own draft.
- **Downgraded** *"`useFlip`'s deps omit `list` — every data refresh corrupts the animation"* from a
  ranked defect to a dissent-log entry, after the coverage critic showed there is no reachable
  trigger (Rule 1 / M2). A criticism I could not support gets cut exactly as an unsupported
  reassurance would.
- **Downgraded** the `getClienteFicha` tenancy gap from ranked to recorded, after a live query
  returned 0 multi-gym operators (Rule 5) — real, verified latent, off this page's path.
- **Corrected** *"only 2 consumers, so this is a one-function fix"* — the count was right and the
  implication was wrong (Rule 4/5). Finding 5 now names four engines with three band sets.
- **Corrected** the brief's "21 members / 13 por renovar" everywhere to the measured 30 / 22 rather
  than reasoning on supplied numbers (Rule 5, and the rationalization table's "re-serving a prior
  finding as newly verified").
- **Added, against my own case:** the write side is clean, `vinculante` is correct under every
  reachable input, `estaVencido`'s SQL mirror agrees, and windowing does not gate search. Rule 7's
  sixth shape — an output where every claim is a criticism establishes nothing. The first of these
  materially widens the ruling's options and was nearly left out because it weakened the report.
- **Added** the T1 tension (RED has 0 asistencias, measured) — the strongest single constraint
  *against* the obvious alternative to the expiry clock, and it belongs in an honest report (M2).
- **Swept** for all six Rule-7 shapes. Two further hits, both fixed: an "it mostly works, just fix
  the sort" summary line in the first outline (Rule 1 — replaced by the 16-item ranking), and three
  keep-verdicts with no numeral, now carrying either a measured threshold or an explicit
  `undecided`/`unmeasured` tag with the person or experiment named.
