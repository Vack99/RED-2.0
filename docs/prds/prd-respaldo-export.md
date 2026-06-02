> **Tracked locally** — no issue tracker / git remote exists (local-only repo, by decision 2026-05-29). This markdown is the source of record; `/to-issues` and `/to-goal` consume it directly. Intended triage: **ready-for-agent**. If a GitHub/Linear tracker is provisioned later, replace this line with `> Tracked in: <issue-url>`.

# PRD — Respaldo: weekly operational export to Excel

Give the operator a way to get their gym's record **out** of Forge — a single,
formatted Excel **respaldo** they can download anytime. **Phase 1 (on-demand
download) is the shippable scope of this PRD.** Phase 2 (the automated weekly
email) is designed and explicitly **deferred** to a follow-up handoff. The
load-bearing decisions are locked in [`docs/adr/0006-respaldo-operational-export.md`](../adr/0006-respaldo-operational-export.md)
and the **respaldo** glossary entry in `CONTEXT.md`.

## Problem Statement

The operator runs their entire gym inside Forge — every **cliente**, every
**venta**, every **pase de lista** — but there is no way to get any of it back
out. They cannot review the full register away from the app, hand month figures
to an accountant, or keep a personal copy. Most pressingly: if they ever lose
access to the platform, they lose their clients' contact details and current
standing with no fallback — they could neither reach their members nor
re-register them. Everything lives in Supabase behind a login; there is no export.

## Solution

From the operator's perspective: a **"Descargar respaldo"** action in **cuenta**
produces one formatted Excel workbook — the complete operational record **as of
now** — that downloads instantly and stands on its own. It has four sheets:
**Clientes** (the roster, including each member's contact info, current
**paquete**, **clases restantes**, **vence**, and derived **estado**/**urgencia**),
**Ventas** (the full sales ledger), **Asistencias** (the full attendance log),
and a **Paquetes** reference so the amounts have context. Because the Clientes
sheet carries both contact details and standing, that one file doubles as the
operator's re-contact / re-registration list if they ever lose the platform.
Everything is in Spanish (es-MX), with money as pesos and dates in Chihuahua
local time. They can pull it weekly, or whenever they want.

(Phase 2, deferred: the same workbook delivered to the operator's email
automatically each week, opt-in — see *Out of Scope*.)

## User Stories

1. As an operator, I want to download my whole gym's record as one Excel file, so that I have a copy I control outside the platform.
2. As an operator, I want the download to be a single click from my account screen, so that I don't have to assemble anything by hand.
3. As an operator, I want the file to be the complete current picture every time, so that each download stands alone without stitching files together.
4. As an operator, I want a **Clientes** sheet with every member's name, phone, email and birthday, so that I can reach all my members even if I lose access to Forge.
5. As an operator, I want each client's current **paquete**, **clases restantes** and **vence** in that same sheet, so that I could re-register them at their correct standing, not just contact them.
6. As an operator, I want each client's derived **estado** and **urgencia** shown as readable columns, so that I can see who is active, expiring, or out of classes at a glance in the sheet.
7. As an operator, I want a **Ventas** sheet with the full sales ledger (**folio**, fecha, **cliente**, **paquete**, **monto**, **metodo**, **vigencia**), so that I have a complete income record for accounting.
8. As an operator, I want an **Asistencias** sheet with the full attendance log (fecha, hora, **cliente**), so that I have a complete record of who came and when.
9. As an operator, I want unmarked (soft-deleted) attendances left out of the file, so that the log reflects what actually happened, not corrections.
10. As an operator, I want a **Paquetes** reference sheet (name, price, classes, vigencia), so that the **monto** figures in Ventas have context.
11. As an operator, I want money shown as pesos and dates in my local (Chihuahua) time, so that the file reads naturally without conversion.
12. As an operator, I want classes shown as "Ilimitado" or "N clases" rather than raw nulls/numbers, so that the sheet is human-readable.
13. As an operator, I want every header and label in Spanish, so that the file matches how I run the business.
14. As an operator, I want the file named with my brand and the date (e.g. `forge-respaldo-2026-06-01.xlsx`), so that I can tell my weekly copies apart.
15. As an operator, I want the download to only ever contain *my* data, so that I trust the export respects my account boundary.
16. As an operator, I do NOT want my bank details (**cobro**/CLABE) in the file, so that a copy I keep or later email cannot leak my payment account.
17. As an operator, I want the export to work even when a sheet is empty (no ventas yet, no asistencias yet), so that I still get a valid file with headers early on.
18. As an operator, I want the download to be reasonably quick, so that pulling my register weekly is frictionless.
19. As a developer, I want the file-building logic separated from the spreadsheet library, so that the formatting and derived columns are unit-testable without ExcelJS.
20. As a developer, I want the data-gathering, file-building, and delivery to be three reusable pieces, so that Phase 2's weekly email reuses Phase 1 with no rewrite.
21. As a developer, I want the export to reuse the existing derived-at-read logic (ADR-0002), so that **estado**/**urgencia** are never computed in a second place that can drift.

## Implementation Decisions

- **`respaldo` is an operational export, NOT a disaster-recovery backup** (ADR-0006). It is curated and human-readable; Supabase PITR owns true DR. This is the decision the whole design hangs on.
- **Scope = four worksheets in one workbook:** **Clientes**, **Ventas**, **Asistencias**, and a read-only **Paquetes** reference. Hard-excluded: **cobro** (holds CLABE/bank details — a secret, and the Phase 2 file is emailed), **perfil**, **plantillas**. These are *config*, not *what happened at the gym*. Excluding secrets is what makes the file safe to auto-email later.
- **Full snapshot, no delta.** Roster as-of-now + full **ventas**/**asistencias** history. Each file is self-contained. Data volume is trivial (single operator), so windowing earns nothing.
- **`deleted_at` asistencias are excluded** — a soft-deleted attendance is an un-mark; it didn't happen.
- **Three-piece generation split** (so Phase 2 reuses it verbatim): a **pure row-shaping module** (`RespaldoData` → formatted, Spanish-headed rows per sheet — all formatting + derived columns live here, no I/O), a **thin workbook builder** on top of **ExcelJS** (rows → `.xlsx` Buffer, four worksheets), and an **RLS-scoped DAL gather reader** (`getRespaldoData(client?)` returning `RespaldoData`; queries **ventas**/**asistencias** over *full* history, not month-scoped like the ficha). Concrete paths are in ADR-0006.
- **Delivery is a Route Handler in the cuenta sector, not a Server Action** — actions can't cleanly stream a binary download. The handler auth-checks the operator, calls gather → build, and returns the buffer with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment`. RLS is the hard authorization boundary (ADR-0001).
- **UI:** a "Descargar respaldo" control in the **cuenta** screen that hits the route.
- **Library: ExcelJS** (MIT, maintained, styling + streaming) over SheetJS. The xlsx dependency lives in `src/lib` only — **never `src/domain`**; the dependency-cruiser boundary stays green.
- **Formatting:** pesos for **monto**, Chihuahua-local dates (reusing `src/lib/fecha`/`date`), "Ilimitado"/"N clases" labels, **estado**/**urgencia** as Spanish text columns — reusing the ADR-0002 read-side derivations rather than re-deriving.
- **Filename:** brand + ISO date (e.g. `forge-respaldo-2026-06-01.xlsx`).

## Testing Decisions

- **What makes a good test here:** assert *external behavior* of a module given known inputs — the shape and content of the produced rows — never ExcelJS internals or private helpers.
- **Pure row-shaping module — tested hard (unit).** Given a fixed `RespaldoData`: correct Spanish headers per sheet; **monto** formatted as pesos; dates in Chihuahua local; "Ilimitado"/"N clases" labels; derived **estado**/**urgencia** columns present and correct; soft-deleted asistencias absent; empty-state yields header-only rows. This module holds all the logic that can actually be wrong, and tests run without ExcelJS.
- **DAL gather reader — tested via the injectable client seam.** Following the existing `client?: SupabaseServer` injection pattern, feed a fake client and assert: query scope is *full* history (not month-scoped), the returned `RespaldoData` shape is correct, and only the operator's rows are requested.
- **Not unit-tested:** the Route Handler and the cuenta UI button (verified manually / by integration) and the thin ExcelJS assembly (its logic is in the row-shaper).
- **Prior art:** `src/domain/rules.test.ts` and `src/lib/data/derive.test.ts` (pure logic tested directly); `src/lib/data/ventas.test.ts` and `src/lib/data/roster-nav.test.ts` (DAL tested via an injected client). Vitest throughout.

## Out of Scope

- **Phase 2 — the automated weekly email** (deferred to a dedicated handoff): the scheduler (Vercel Cron, or Supabase `pg_cron` + `pg_net`), a secret-guarded cron Route Handler reusing gather + build, email via an external provider (Resend), recipient = operator's `auth.users.email`, and the opt-in `respaldo_semanal` toggle on **perfil**. Phase 1's split is built precisely so Phase 2 only wires a trigger — but none of that infra is in this PRD, and it has nowhere to fire until there's a deploy target.
- **Anything from cobro / perfil / plantillas** in the file.
- **A true DR / raw dump** (raw IDs, soft-deleted rows, full schema) — that's not what `respaldo` means; use Supabase PITR.
- **Delta / windowed ("this week only") exports** — full snapshot only.
- **Other formats** (CSV, PDF, Google Sheets) — Excel only.
- **Multi-operator / sharing** — Forge is single-operator (ADR-0001).

## Further Notes

- Decisions captured this session: the **respaldo** glossary entry + flagged-tension note in `CONTEXT.md`, and `docs/adr/0006-respaldo-operational-export.md`.
- **Install note:** this repo's vendored Next sometimes 404s a bare `pnpm add`; add ExcelJS with `--prefer-offline`.
- The pure-vs-I/O split (row-shaper separate from the ExcelJS builder) mirrors the house pattern of splitting `derive.ts` out of `clientes.ts` — it keeps the logic-bearing code testable in isolation and `src/domain` free of the spreadsheet library.
- A Phase 2 handoff will be prepared at the end of the Phase 1 build; Phase 2 is noted as crucial for the project.
