# Next-session handoff — admin desk flow, then the auth-mail hook

**Written:** 2026-07-09, at the close of the session that finished spec #64.
**Read first:** [`docs/planning/2026-07-09-admin-desk-flow-first-purchase-and-member-visibility.md`](../planning/2026-07-09-admin-desk-flow-first-purchase-and-member-visibility.md) — the problem context. This file is the *operational* handoff: state, order, and traps.

---

## Where things stand

**Spec #64 (member registration, invite-token claim) is CLOSED.** All nine slices shipped, deployed, and walked end to end on live (`red-demo`). **Phase 6 (#49) is CLOSED** — all 14 slices, exit gate walked, `red-demo` content seeds verified in production.

`main` is clean and pushed. Live DB matches `main`; migrations applied through `20260710030000`.

Closed this session: **#72** (Resend SMTP live, headers recorded), **#27** (subsumed by #72), **#78** (fixed + applied), **#73** (exit gate), **#64**, **#49**.

Live auth mail now delivers from `Notificaciones <no-reply@ibookit.lat>` with **SPF PASS, DKIM PASS (`d=ibookit.lat`), DMARC PASS**.

---

## Work queue, in the owner's chosen order

### 1. The desk-flow design problem — #76 + #77 + #79 (+ fold in #48)

**Treat these as ONE design problem across two screens** (the cliente ficha and Vender), not four patches. Four separate fixes will produce four visual languages on the same screen.

| # | what |
|---|---|
| #77 | First purchase ≠ renewal. A never-paid member's only affordance is `RENOVAR`, which routes to `/vender` and **drops their identity** — the operator must then pick EXISTENTE and search for the person whose ficha they just left. |
| #79 | The admin never renders a member's email in read mode. Once claimed, it is visible nowhere but inside the EDITAR sheet. |
| #76 | Vender NUEVO auto-advances the section on the phone's 10th digit, **before the operator reaches the email field**. Email is the invite trigger. |
| #48 | Vender: a phone number exceeding max digits fails silently, with no validation message. Same form as #76. |

**The load-bearing find, and the reason this is smaller than it looks:** `esRegistroOnlinePendiente` (`packages/data/src/server/derive.ts:163-168`) already computes exactly the state — `invitacion === "cuenta_activa" && estado === "sin_clases"`. It already drives the dashboard tile and roster filter (S4, #69). **The ficha and Vender simply never call it.** The concept is named, tested, and shipped; only its surfacing is missing.

**Why it is not cosmetic:** this is the same identity-drop that produced the original duplicate bug (see memory `renewal-duplicate-rootcause`: RENOVAR drops client identity → blank NUEVO form → duplicate INSERT). An operator who hesitates at "RENOVAR" on a stranger reaches for NUEVO and mints a duplicate, stranding the member's paid balance on a row their app can never see. The S4 duplicate warning is a backstop that fires *after* the mistake is in motion.

**Six open questions are listed in the planning doc.** The sharpest: does "first purchase" mean *no `ventas` row ever* (what the copy implies) or *no active package* (what `esRegistroOnlinePendiente` computes)? They diverge for a lapsed member, who should see "renovar", not "primera compra".

**Owner's explicit instruction:** the planning doc is context only. Do **not** open a PRD from it without discussing scope first. `taste >= 7` per `CLAUDE.md` — this wants a design pass, not a badge bolted onto the current layout.

### 2. #75 — Send Email Hook

Gym-branded auth mail via Resend, retiring Supabase's built-in templates.

- **Availability confirmed from Supabase docs: plans `Free, Pro`.** We qualify today.
- The hook payload's `email_data.redirect_to` already carries the **gym's own client host** (set by `registro/actions.ts:45,51` and `entrar/actions.ts:34,38`), so the hook can resolve host → `gym_domain` → gym and brand the mail per gym.
- It also **fixes the spam driver**: today `{{ .ConfirmationURL }}` points at `hjppxawglmukfvsgmcog.supabase.co` while the `From:` is `ibookit.lat`. That mismatch is why the confirmation mail landed in Gmail spam while the invite mail (whose link is on the gym's host) landed in the inbox.
- **It amends ADR-0014.** That ADR calls per-gym auth mail a "permanent, structural consequence" of one shared Supabase project. That reasoning holds *only for custom SMTP*, which is project-wide. The hook replaces the mailer entirely. Amend the ADR; do not quietly contradict it.
- Scope boundary: the sending **domain** stays `ibookit.lat` (Resend only sends from verified domains). Per-gym *display name* is free; per-gym *address* would need per-gym domain verification.
- Once it lands, **#72 §B3's dashboard templates become dead config** — delete them and note it in `docs/runbooks/hitl-72-resend-live.md`.

### 3. #74 — `getSaldoMiembro` / `fetchFavoritoId` `limit(1)`

Not host-reconciled, unlike the S6 readers. **Latent, verified:** only one member has ever claimed an account, in a single gym. `limit(1)` can only misfire for a member holding `clientes` rows in 2+ gyms. Safe to leave until a member joins two gyms — but it is a silent wrong-answer bug, not a crash, so it will not announce itself.

### 4. #80 — RPC test coverage

Independent of the queue above. **Take it before the next migration-bearing slice**, because its drift guard is what stops the next #78. Three concrete gaps, all evidenced in the issue: 9 of 32 suite files never run; `registro_claim.sql` asserts control flow but not written rows; `pnpm test:denial` is in no gate. The single highest-value item is the drift guard — a test that fails when a `.sql` file is missing from the runner's `SUITE` array.

---

## Traps for the next session

- **The client app has no `/membresia` and no `/perfil`.** Real routes: `/`, `/reservar`, `/precios`, `/clase/[sessionId]`, `/confirmada/[sessionId]`, `/nosotros`, `/contacto`, `/legal`. (A prior walk wasted a cycle 404-ing on invented route names.)
- **The Supabase MCP points at LIVE prod.** `apply_migration` and `execute_sql` hit production. There is no scratch project by default. Free tier has no PITR — capture affected row ids before any data migration.
- **A DB-level RPC harness DOES exist** — `supabase/tests/` (32 self-asserting SQL suites) + `pnpm test:denial` → `run-denial-suite.mjs`, run against a throwaway scratch project via the Management API. Do not build a second one; the runner's own comment says *"a future slice adds a vector to a file here — not a second harness."* But it is mis-wired, which is why #78 shipped: **9 of the 32 files are absent from the runner's `SUITE` array and execute nowhere** (including `reclamar_por_codigo.sql` and `registrar_venta_email.sql`); `registro_claim.sql` calls `reclamar_o_crear_cliente` 8× but asserts *which row is claimed*, never *what the created row contains*; and `test:denial` is in neither CI nor the pre-commit hook. Tracked as **#80**. The general lesson: **an RPC's return value is not its contract — the rows it writes are.**
- **Supabase auth template subjects go in the "Subject heading" *field*, not the body.** Pasting the subject into the HTML body ships Supabase's English default subject over Spanish copy.
- Auth rate limit is **50/hour**; Resend's free tier ceiling is **100/day, 3,000/month**. A `429 over_email_send_rate_limit` on `/recover` within a minute of a prior request is the per-user 60-second cooldown, not the hourly cap.
- `red-demo` now holds 4 `clientes` rows, all claimed, all with emails, all with one sale. Any future walk needs fresh state — a 0-balance member no longer exists there.

---

## Live reference

| | |
|---|---|
| Supabase project | `hjppxawglmukfvsgmcog` |
| Sending domain | `ibookit.lat` (SPF/DKIM/DMARC verified) |
| Auth + invite sender | `Notificaciones <no-reply@ibookit.lat>` |
| Client hosts | `red` · `forge` · `red-demo` · `forge-demo` `.ibookit.lat` |
| Admin hosts | `{gym}-admin.ibookit.lat` |
| Unmapped fallback (`?gym=` resolves here) | `app.ibookit.lat` |
| Tenant precedence | host → `?gym=` → null (`packages/data/src/server/resolve-tenant.ts`) |
