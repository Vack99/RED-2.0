# Breaking-points pack — start here (2026-09-01)

Four documents came out of one session. Read this page, then open the one you need.
They overlap by ~0. The map is *what is worst*; the catalog is *what to re-check*;
the evidence is *citations the map compressed away*.

| doc | what it is | feed it to |
|---|---|---|
| **this page** | sequence + stop line | every later session |
| `2026-09-01-project-breaking-points.md` | ranked 8, five stresses, numbers, keep/exit, critic | any session that needs the verdict |
| `2026-09-01-breaking-points-catalog.md` | every claim as `F-NN` + how to validate it | the **validate** session |
| `2026-09-01-breaking-points-evidence.md` | file:line, incident unpack, one-liners 11–15, indexes | the validate session, per catalog row |

Method: `/cross-examine` tier 2, 2026-09-01. Seven territory agents + red team + coverage critic.
Read-only. No product code was changed.

---

## The one-line state

The tests that can see a write or a session failure are optional. Vitest mocks `.rpc()`.
`test:denial` and `test:e2e` are conventions. That hole already shipped #78, 465dcf4, and the
9h15m `registrar_venta` blackout. RPC bodies still do not tear mid-function. What pops is
after commit, anti-idempotent retry, and a second writer the repo may not see.

---

## Sequence — there are two later sessions, not one

**Session V — validate.** Walk the catalog. Every `F-NN` becomes `held` | `refuted` | `stale` | `unmeasured`.
Done when the catalog has no blank `status:`. Do not rank a fix. Do not open a PRD.

**Session S — scope, only if V is green enough.** Green means: every `held` row still matches HEAD,
every `refuted` row is struck with a cite, `unmeasured` rows are either probed or parked with an
owner trigger. Then, and only then, a structured fix plan. That plan is not in this pack.

A session that opens the map and starts slicing issues has skipped V. The catalog is the work list.

---

## Rulings already made (do not relitigate in V)

- SQL keeps the write contract. Exit: a second #78-class defect on `main` with `pnpm test` green, or a second PGRST203 sales blackout.
- Two apps, one Auth project. Exit: a third `proxy.ts` without the client fail-soft park and without cookie-option exhaustiveness — or member-removal must be durable and `/reservar` still remints.
- Fetch-shield leaves POSTs unbounded on purpose. Exit: a timed-out write duplicates a sale, or aborting refresh mass-signs-out (>1 device / 24h).
- D1 month-boundary is **not** a live dashboard bug (withdrawn). Residual: the next windowed money reader that compares `ventas.fecha` timestamptz to `'YYYY-MM-DD'`.
- Occupancy oversell among `reservar_clase` callers is **untested**, not a known oversell.
- `eliminar_venta` vs FULL RESET is real SQL, off the top-8 because it needs an operator to press Eliminar.

Owner-input still open (V may measure; it does not decide):

1. Is 901-member truncation a ship-blocker now?
2. Must member removal stay non-durable?
3. Is a ~7-day iOS logout acceptable against “longest period possible”?
4. PITR on or off?
5. When mobile is real, is a third `proxy.ts` allowed?

---

## How V validates a row

1. Open the catalog row.
2. Re-read the files it names at HEAD (lines drift; match by file + symbol).
3. If the row says **measured** — confirm the code still says that.
4. If the row says **asserted** (dated audit) — confirm the audit still describes HEAD, or mark `stale`.
5. If the row says **unmeasured** — run the named experiment or leave `unmeasured` with the experiment still attached.
6. Write `status:` on the catalog row. One of the four words. A sentence of cite.

Completion criterion: **every catalog `F-NN` has `status:` filled.** That is the whole of V.

---

## Three reviews after S, not during V

The owner will spin three reviews (shared / admin / client). Those consume the **catalog after V**.
Do not pre-split the validate session into three — several rows span all three, and #1 is the shared gate.

---

## Two things that will mislead you

- **The map is not the evidence pack.** Ranked 8 compressed seven reports. If a cite is missing, it is in `…-evidence.md`.
- **“Solid RPC” is not “safe retry.”** Transactional write ≠ idempotent retry. Toggle invert and sale remount live in that gap.

---

## What none of this is

A fix list, a ticket dump, a PRD, or permission to edit `apps/` / `packages/` / `supabase/`.
V writes catalog statuses. S, later, writes a plan.
