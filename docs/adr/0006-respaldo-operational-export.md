# ADR-0006 — Respaldo: an operational export, not a disaster-recovery backup

**Status:** Accepted · **Date:** 2026-06-01 · **Amended:** 2026-07-02 (mail-provider clause — see [ADR-0014](0014-custom-smtp-platform-sender.md)) · **Builds on:** [ADR-0001](0001-supabase-rls-no-orm.md) (RLS, no ORM), [ADR-0002](0002-derived-not-stored.md) (derived-at-read)

## Context

The operator wants to **download their gym's record as an Excel file weekly**, and (later)
receive it by email automatically. The request arrived as "a weekly backup," but the word
**respaldo/backup** is overloaded and pulls the design in two incompatible directions:

- A **disaster-recovery backup** is complete and machine-faithful: every row of every table,
  raw IDs, soft-deleted attendances, bank details — enough to *reconstruct the database*.
- An **operational report** is curated and human-readable: formatted money/dates, derived
  `estado`/`urgencia`, the config and secrets omitted — enough for the operator to *read,
  keep, and re-contact/re-register clients* if they ever lose platform access.

One file cannot be good at both. And Forge already has real DR: Supabase owns point-in-time
recovery of the database. An emailed `.xlsx` is a poor DR mechanism regardless.

## Decision

**`respaldo` is the operational export, explicitly NOT a DR backup.** (Glossary entry +
flagged-tension note in `CONTEXT.md`.) Concretely:

- **Scope = the operational record, four sheets:** **Clientes** (nombre, tel, email, birthday,
  paquete, clases restantes, vence, derived estado/urgencia, alta), **Ventas** (the sales
  ledger), **Asistencias** (the attendance log, **excluding `deleted_at` rows** — a soft-deleted
  attendance is an *un-mark*, it didn't happen), and a **Paquetes** read-only reference so
  `monto` figures have context. The Clientes sheet carries the re-registration-to-standing
  fields, so it doubles as the operator's re-contact list — the continuity need is met without a
  separate sheet.
- **Hard exclusions:** `cobro` (holds the CLABE / bank account — a secret, and this file gets
  emailed), `perfil` (brand config), `plantillas` (message templates). These are *settings*, not
  *what happened at the gym*, and keeping secrets out is what makes the file safe to auto-email
  (Phase 2).
- **Full snapshot, no delta.** Each export is the complete current picture: roster as-of-now +
  full ledger history. Each file stands alone. Volume is trivial (one operator, thousands of
  rows/year), so windowing earns nothing.
- **Formatted display values, Spanish (es-MX):** pesos for `monto`, Chihuahua-local dates,
  "Ilimitado"/"N clases" labels, derived `estado`/`urgencia` as text columns. The export
  *reuses* the read-side DTOs/derivations (ADR-0002) — it does not re-derive in a second place.
- **ExcelJS, not SheetJS.** Actively maintained, MIT, supports styling + streaming; SheetJS's
  free build has had maintenance/security friction. The xlsx dependency lives in `src/lib`,
  **never `src/domain`** — serialization is I/O, and the domain core must import nothing inward
  (the dependency-cruiser boundary).
- **Generation split into three pieces, so Phase 2 reuses Phase 1 verbatim:**
  1. **Gather** → `src/lib/data/respaldo.ts`: one RLS-scoped DAL reader returning the rows for
     all sheets (reusing existing `cache`d readers where possible).
  2. **Build** → `src/lib/export/workbook.ts`: takes the DTOs, emits the `.xlsx` buffer via
     ExcelJS. Pure-ish, unit-testable, depends only on domain types + ExcelJS.
  3. **Deliver** → a **Route Handler** (`src/app/(app)/cuenta/respaldo/route.ts`) that calls
     gather + build and streams the buffer with `Content-Disposition: attachment`. A Route
     Handler, **not a server action** — actions can't cleanly push a binary download. The
     download is operator-authed; RLS is the hard boundary (ADR-0001).

### Phasing

- **Phase 1 (this build): on-demand download.** Fully shippable today; delivers the core value.
- **Phase 2 (deferred — designed, not built): weekly email.** Has nowhere to fire until there's
  a deploy target. Intended stack on record: scheduler (Vercel Cron, or Supabase `pg_cron` +
  `pg_net`) → a secret-guarded Route Handler that **reuses gather + build** → email via an
  external provider (Resend — the platform's one mail vendor, which [ADR-0014](0014-custom-smtp-platform-sender.md)
  also wires into Supabase Auth as custom SMTP because the built-in auth mailer is dev-only) → recipient = operator's
  `auth.users.email` → opt-in via a `respaldo_semanal` toggle on `perfil`. **Not** a Deno edge
  function — that can't reuse the Node ExcelJS builder, forcing a rewrite. The Phase 1 split
  exists precisely so Phase 2 wires a trigger to existing code, not a second implementation.

## Consequences

- The "build" step is a pure-ish, testable unit decoupled from delivery; Phase 2 adds a trigger
  and an email send, reusing gather + build with zero duplication.
- `src/domain` stays free of ExcelJS — the boundary holds, and "how the gym works" never imports
  a spreadsheet library.
- Excluding `cobro`/CLABE from the file is a **decision, not an omission**: it is what makes the
  Phase 2 auto-email safe. A future reader who wants "everything in the backup" must reckon with
  this ADR before adding bank details to an emailed attachment.
- "Backup" expectations are explicitly *not* met: if someone needs true DB recovery, the answer
  is Supabase PITR, not this file. Recorded here so nobody "fixes" the respaldo into a raw dump.
- Trade-off: the export re-states sheet shape/labels close to the screens'. Mitigated by reusing
  the ADR-0002 read-side derivations rather than re-deriving estado/urgencia in the exporter.
