# Handoff — Member Registration Remediation (from the 2026-07-08 gap audit)

**Authored:** 2026-07-08. **For:** a fresh execution session (the owner will run it on **fable-5**). **State:** analysis complete, **NO remediation started** — no code, no DB, no migrations touched this session. Your job is to turn the findings into a decision + a plan + shipped fixes.

> The `no-fable` rule was a **constraint of the audit session only** (owner's instruction for 2026-07-08). It does **not** apply to you — you are the intended fable-5 remediation session.

---

## Read these first (in order)

1. **The findings register (your worklist):** `docs/Context/2026-07-08-red-member-registration-gap-audit-findings.md` — every gap with scenario, verified behavior, consequence, file:line evidence, severity, and analysis-only fix direction. This is the authoritative output of the audit.
2. **Memory:** `member-registration-phase1-gap-audit` (the audit summary) + `member-registration-payment-strategy` (the wider strategy Phase 1 sits inside). Read both — don't re-derive.
3. **Spec (the why + the Stripe/tiering strategy):** `docs/superpowers/specs/2026-07-06-member-registration-payment-strategy-design.md` (§1–§3).
4. **Plan (what Phase 1 actually shipped):** `docs/superpowers/plans/2026-07-06-member-registration-phase1.md`.
5. **Prior handoffs:** `docs/Context/2026-07-07-red-member-registration-phase1-shipped-handoff.md` and `…-phase1-execution-handoff.md`.

---

## What the 2026-07-08 session did

- **Verified Phase 1 landed on live prod** (facts below) — the shipped code is correct and complete; the migrations are applied.
- **Ran a 5-dimension adversarial audit** (opus-4.8 throughout; investigate → independent per-finding skeptic verify) over the three owner questions (walk-in-adds-email-later; password/auth linkage; self-registered member experience + admin visibility) plus a broad adversarial gap-hunt → **22 findings, 19 confirmed gaps, 3 confirmed working-as-intended**.
- **Wrote the findings register + this handoff.** Nothing else changed.

## Verified live facts (do NOT re-verify — confirmed via Supabase MCP against prod)

- Both Phase 1 migrations are **applied live**: `20260707074144_reclamar_create_zero_saldo`, `20260707074214_registrar_venta_capture_email`.
- `registrar_venta` live signature is the **12-arg** version (`…, p_email text`); the old 11-arg overload was dropped (only one signature exists).
- `reclamar_o_crear_cliente` create-path **inserts `clases_restantes = 0`** (the Ilimitado free-booking hole is closed and stays closed).
- **Live data: 39 clientes, `0` have `auth_user_id` (nobody has self-registered yet), `8` have an email** → ~**31 paid rows already have no email** and are therefore structurally unclaimable. Every gap is **latent** today but certain to bite once self-registration is used.
- **The Supabase MCP is bound to LIVE prod** (`hjppxawglmukfvsgmcog`) — `apply_migration` / `execute_sql` hit production. There is **no scratch project by default** (memory `supabase-mcp-bound-to-live`). Use `BEGIN/ROLLBACK` for any exploratory SQL; treat `apply_migration` as a deploy.

---

## The core finding (one sentence)

> **Email is the only join key between the two "doors" (admin sale ↔ client self-register); it is optional, never validated, and matched by exact case-sensitive string — and there is no backfill, no merge, and no dedup anywhere — so the join breaks in many ordinary ways, each producing a duplicate `clientes` row and a paid balance orphaned on a row the member's app can never see, recoverable only by manual DB surgery or double-charging.**

Everything in Cluster A below is a different trigger of that one defect.

---

## The work, organized into clusters

### Cluster A — the two-doors join (HIGH; **blocked on an owner decision**)
Findings: no-email-backfill, self-register-duplicate/orphan, emailless-rows-unclaimable (31/39), no-merge/idempotency-forecloses-recovery, duplicate-on-NUEVO-sale, claim-ambiguity, email-mismatch-non-canonical.
**Do not start coding this until the reconciliation strategy is decided (see "Open decision" below).** It is a product/data-model fork, not a mechanical fix.

### Cluster B — onboarding & visibility (mostly self-contained)
- **No invite / onboarding comms** (HIGH): nothing tells an admin-registered member their account exists or to self-register (no invite email, magic link, SMS, or app URL on the receipt). A true invite needs Supabase invite/magic-link wiring, which is **gated behind #27 / ADR-0014 custom SMTP** — a lighter option is a registration-URL token on the WhatsApp receipt template (note the 4-template-per-gym cap).
- **No owner notification** of a self-registration (MED): no dashboard tile/badge/count/trigger.
- **No "online/app account" badge** in the roster & Vender picker (MED): self-registered members are indistinguishable from package-less desk/legacy clients (queries never select `auth_user_id`/`email`). Fixing this also helps operators avoid the duplicate-on-sale gap.

### Cluster C — client robustness & UX (shippable now, low-risk, no owner decision needed)
- **`/reservar` hard-crashes (500)** when a signed-in account has no `gym_membership` row — reachable via (a) a swallowed claim failure and (b) a password-reset-first session that never runs the claim. `apps/client` has **no `error.tsx`/`global-error.tsx`**. Fix: make `resolverMiembroGym`'s no-membership case a graceful state (like `getSaldoMiembro` already is) and/or re-run the idempotent claim on `/reservar` entry.
- **0-balance member is shown an enabled "Reservar lugar" + "usa 1 de tus 0 clases"** that dead-ends in a red server error, instead of being routed to `/precios` like a non-member. Add the missing CTA branch in `reservar-semana.tsx` + `clase-detalle.tsx`.
- **Login-before-self-register** shows a misleading "wrong password" (LOW, copy-only; keep it anti-enumeration-safe).
- **Member logging into the admin app** gets the full empty/erroring shell instead of `SinGimnasio` (LOW; **no data leak — RLS holds**). Tighten `getOperatorGym` to require a staff role.

### Cluster D — trivial cleanup (optional)
The deleted `notificaciones.ts` was the member preference toggle (not an admin alert); its removal is import-clean. Residue only: an orphaned `set_notificaciones` RPC + generated type + two stale `perfil-overlay` comments.

---

## The open decision (resolve BEFORE writing Cluster A code)

**How should the two doors reconcile when the email join key is absent, wrong, or ambiguous?** The audit surfaced three (non-exclusive) directions — this is a brainstorm/grill topic, not yet decided:

- **(a) Require + validate email at sale** *when app access is intended*, and add an **email-backfill/edit surface** on the existing row. — Caveat: email must still **never gate a plain cash sale** (spec §3.4, owner-locked; `crearVentaSchema.parse` is unguarded, so a format throw would reject the sale). Any requirement must be conditional/soft.
- **(b) Phone-based claim fallback.** `phone_e164` is already captured on **both** doors but is deliberately never a claim key today. Making it a secondary match key could reconcile most no-email rows without new data entry.
- **(c) Operator merge/relink tool.** Let staff pick the self-created row + the paid row and move balance + `auth_user_id`.

Whichever is chosen must also decide: **what to do with the ~31 already-orphaned no-email rows**; how to handle an **already-minted duplicate**; and how it interacts with the **one-claim-per-gym partial unique index** (`clientes_auth_user_id_per_gym … WHERE auth_user_id IS NOT NULL`) and the **claim's idempotency short-circuit** (which returns the caller-owned row before re-scanning by email).

---

## Constraints / guardrails to preserve (from Phase 1 + the repo)

- **Never block a cash sale on email** (spec §3.4). `nuevoEmail` is a normalizer (`z.string().trim().optional()`), not a validator — keep it that way for the plain-sale path.
- **Contract-B (`20260705082018`) dropped `perfil.user_id`.** Resolve the operator from `gym_membership` (owner/operator). `staff_gym()` keys on `role in ('owner','operator')`; `member` role grants no staff capability.
- **Posture:** `reclamar_o_crear_cliente` stays `SECURITY DEFINER, search_path=''`; `registrar_venta` stays `SECURITY INVOKER, search_path=''`. No `user_id` in any INSERT.
- **Migrations:** additive, forge-safe/expand-only, out-of-order-safe, timestamp after the latest (`20260707074214`). `create or replace` or drop+immediately-recreate + re-grant EXECUTE.
- **Green gate (pre-commit):** `pnpm lint && pnpm typecheck && pnpm test` + `pnpm test:denial`. SQL suites are `BEGIN/ROLLBACK`. Money-path SQL tests bootstrap the operator from `gym_membership`, never `perfil.user_id`.
- **Solo-main workflow:** branch → implement → fast-forward to `main` → apply migrations to live (owner-gated) → verify.
- **`keep-it-lean`** on every diff; **`architecture` boundary** enforced by dependency-cruiser (`pnpm lint`).

---

## Suggested first moves for the fable session

1. **`superpowers:brainstorming` + `grill-me` / `grill-with-docs`** on the **Open decision** (Cluster A reconciliation). This is the fork everything else depends on — do it first.
2. **`to-prd` → `to-issues` / `superpowers:writing-plans`** for the chosen strategy + the shippable Cluster B/C items (they can proceed in parallel; Cluster C needs no decision).
3. **`superpowers:test-driven-development` + `subagent-driven-development`** for execution; Supabase MCP tools for migrations/tests/types regen.
4. **`superpowers:verification-before-completion`** — real command output before claiming any fix green.

## Gotchas

- **You cannot reproduce the member-first flow with live data** (0/39 self-registered). You'll have to drive it yourself on **red-demo**, and the still-open **#63 Slice-0 owner items** (Supabase Auth URL config; red-demo `about_story`/`nota`/`workblock.value` seed; reach red-demo via `?gym=`) may gate a real e2e — see memory `phase6-client-execution-progress`.
- The **working tree still holds the prior auth-hardening session's uncommitted edits** plus the deleted `notificaciones.ts`. **Branch off `main`** and don't sweep those into remediation commits.
- **`fable-5` credit** was exhausted during an earlier session (per the shipped handoff). Confirm credit before relying on it for reviews.
