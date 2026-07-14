# Kickoff · The sale receipt: deliver it, de-Forge it, re-skin it

**Written** 2026-07-13, in a context-gathering session. **Nothing was implemented** — this file is the whole
input for the implementation session. It supersedes `2026-07-13-red-receipt-brand-handoff.md`, which is now
partly wrong (see §9).

**Workspace.** Worktree `.claude/worktrees/recibo-email-brand`, branch `recibo-email-brand`, based on
`9894cb7` (`red-brand-polish` — the RED login/mark work, **committed but NOT on `origin/main`**). Deps
installed, baseline gate green: **939 tests / 77 files pass**. Work here; fast-forward to `main` when green.

---

## 1. The four items, and what the owner already decided

| | Item | Decision (locked 2026-07-13) |
|---|---|---|
| **A** | **Email the ticket to the client** — the headline feature, new ground | **HTML email + PNG attached.** The body *is* the ticket (inline-CSS HTML, survives Gmail); a PNG of the same ticket rides along as an attachment so the member has a real image to keep. **Auto on every sale** (new *and* renewing) whenever an email is on file, best-effort, **plus a manual send/resend button** on the receipt card. |
| **B** | **The footer says FORGE on a RED gym** | The business name comes from **`gym.brand_name`**. Also: drop the DB's `DEFAULT 'FORGE'`, and scope the three `perfil` reads by `gym_id`. |
| **C** | **The receipt's lower half "feels Forge"** | In scope. Keep the cream paper; re-key the accent per brand. **Owner must see rendered candidates before anything is committed.** |
| **D** | **Remove the `ATIENDE · COACH` row** | In scope. Temporary — the owner will restore it later, so remove the *row only*. |

Order to build them: **B → D → A → C.** B is the smallest and unblocks the correct gym name that A's email
needs; D is one tuple; A is the bulk of the work; C is last because it needs the owner's eye and it churns the
same file A's ticket-twin mirrors.

---

## 2. Item B — the FORGE bug. Root cause is **proven**, not suspected.

### What is actually true (verified against the live DB, read-only, 2026-07-13)

```
slug        brand_name   legal_name      brand_module_id   perfil row?   negocio   coach
forge       Forge        null            forge             YES           FORGE     David
forge-demo  Forge Demo   null            forge             YES           FORGE     Coach JC
red         RED          null            red               NO  ←         —         —
red-demo    RED Demo     RED Demo Gym    red               NO  ←         —         —
```

**Neither RED gym has a `perfil` row at all.** So `ventas.ts:274` reads `null`, `ventas.ts:282` calls
`resolverIdentidad(perfil ?? { negocio: null, coach: null, ciudad: null })`, and `perfil.ts:33-34` returns the
hard-coded `'FORGE'` / `'Coach'`. That is the entire mechanism — and it also explains why the ATIENDE row says
"COACH" rather than a name. **It is not a cross-tenant read**: RED never touches Forge's row. Nothing leaks
across the seam; a competitor's brand is simply hard-coded as this platform's default.

`packages/data/src/server/perfil.ts:33`

```ts
negocio: p.negocio?.trim() || 'FORGE',   // ← a competitor's name, as the platform default
coach:   p.coach?.trim()   || 'Coach',
```

### But there are **three** ways this string reaches a RED customer, and fixing only the fallback cures one

1. **No `perfil` row** (what is live today) → the fallback fires. ✅ fixed by the change below.
2. **The DB column default.** `supabase/migrations/20260530004747_create_perfil.sql:7` is
   `negocio text not null default 'FORGE'`. Insert a `perfil` row for RED tomorrow without naming `negocio`
   and **Postgres itself writes "FORGE"** — `resolverIdentidad` then passes it through and the TS fallback
   never fires. ❌ *not* cured by the code fix. Needs DDL.
3. **The unscoped read.** `perfil.ts:51-54`, `ventas.ts:274` and `clientes.ts:272` all do
   `.from('perfil').select(...).maybeSingle()` with **no `.eq('gym_id', …)`**. RLS on `perfil` is
   `is_member_of(gym_id)`, so an operator with membership in two gyms sees two rows, `.maybeSingle()` errors,
   the error is **discarded** (only `data` is destructured), `data` is `null` → "FORGE" again. These are the
   **last three staff reads in `@gym/data` still missing the `gym_id` scope selector** — every other reader got
   it in the 2026-07-13 §1.1 pass. This is the real cross-tenant sharp edge, and it is worth closing.

> Also stale: `perfil.ts:40-42`'s doc comment claims "RLS scopes the row to `(select auth.uid())`". Wrong —
> `perfil` is gym-scoped now. Fix the comment while you are in there.

### The fix (decided: `gym.brand_name`)

`gym.brand_name` is `NOT NULL`, per-tenant, and **already correct** — `'RED'`, `'Forge'`. The clincher:
`preparar_invitacion` (`20260708210000:75`) already returns `g.brand_name`, so `enviarInvitacion` already
sends RED's members email correctly branded **"RED"** — *while the ticket in front of the operator says
"FORGE."* The right value was one join away the whole time, and it lives inside `@gym/data` already. No
dependency-cruiser edge is crossed; `@gym/brand` is not involved.

1. `gym.ts:52` → `.select("timezone, slug, brand_name")`; add `brandName` to `OperatorGym` (`gym.ts:8-13`).
   It is `cache()`d per request, so this costs nothing.
2. `perfil.ts:27` → `resolverIdentidad(p, fallbackNegocio: string)`; `negocio: p.negocio?.trim() || fallbackNegocio`.
   Keeps the function pure — the caller injects the name.
3. Pass `gym.brandName` at all **three** call sites: `perfil.ts:58` (`getPerfil` — needs `getOperatorGym`),
   `ventas.ts:282` (already holds `gym`), `clientes.ts:278` (already holds `gym`).
4. Add `.eq("gym_id", gym.id)` to the three `perfil` reads (mechanism 3).
5. **Migration**: drop the column default (`alter table public.perfil alter column negocio drop default`).
   DDL → the `pnpm test:denial`-against-a-scratch-project convention applies before it fast-forwards to `main`
   (`AGENTS.md`). No RPC writes `perfil`, so there is **no** `rpc-coverage.json` obligation.
6. **Two tests pin the literal string and will fail the pre-commit gate** — change them in the same diff:
   `packages/data/src/server/perfil.test.ts` (asserts the exact `FORGE`/`Coach`/`null` triple) and
   `packages/domain/src/rules.test.ts:202-206` (`{negocio}` → `"FORGE"`).

### Blast radius — this is not a receipt-only fix

`negocio` is also the `{negocio}` **WhatsApp template token** (`ventas.ts:305` builds the `PlantillaContext`;
`renderPlantilla` in `@gym/domain`). Every WhatsApp message a RED operator sends today says **FORGE**. It is
also read for the cliente ficha (`clientes.ts:272-282`). Fixing the fallback fixes all three surfaces at once —
which is exactly why it must be fixed in `@gym/data`, not in the receipt component.

**Casing, decide once:** `gym.brand_name` is mixed-case (`"Forge"`, `"RED"`). The receipt footer is
`className="uppercase"` (`recibo.tsx:134`) so it renders `FORGE`/`RED` either way — but the same value goes
into WhatsApp copy and email `From:` lines **unuppercased**. Recommendation: store/pass mixed-case, let the
render site uppercase (that is already the file's convention, and `resolverIdentidad`'s own doc says "casing
stays at the render site").

**No product surface can write a `perfil` row.** No migration inserts one, no RPC writes one, and "EDITAR
PERFIL" is a `proximamente()` stub (`cuenta.tsx:188`). Every live `perfil` row was hand-inserted. That is the
argument for not treating `perfil.negocio` as the source of truth — and it means **RED needs no perfil row at
all** once the fallback derives from `gym`.

---

## 3. Item A — email the ticket

### The pipe already exists. Do not build a new one.

`packages/data/src/server/invitaciones.ts` is a live, gate-tested, **injectable** mail rail:

- `MailTransport` interface (`:35-37`) + `resendTransport()` (`:46-71`) — a plain `fetch` to
  `https://api.resend.com/emails`, no SDK, reading `RESEND_API_KEY` / `RESEND_FROM` from env.
- `remitenteConNombre(gymNombre, from)` (`:154-160`) — per-gym **`From:` display name** over one shared
  platform sending address (`no-reply@ibookit.lat`; one sender for every gym is permanent by ADR-0014).
- `mensajeInvitacion()` (`:110-144`) — the template convention: **inline-CSS HTML + a plain-text twin, no
  `<style>` block** (Gmail strips it). Copy this shape exactly.
- `enviarInvitacion()` — **best-effort by contract: it can never throw into the sale path.** Keep that
  contract for the receipt mail. A failed email must never fail a sale (ADR-0005: the money RPC is atomic;
  mail lives outside it).

It is **already wired into the sale action**: `vender/actions.ts:47-54` (`resolverInvitacion`) fires after a
NEW-client sale and surfaces the outcome on the receipt as `InviteNote` (`recibo.tsx:77, 168-196`). **The
receipt email is a sibling of that call, and `InviteNote` is the UI precedent for "Enviado a x@y".**

Env is already provisioned on the **admin** Vercel project, Production (`docs/runbooks/hitl-72-resend-live.md`
§D1: `RESEND_API_KEY`, `RESEND_FROM`, `PLATFORM_CLIENT_FALLBACK_HOST`), and present in `apps/admin/.env.local`.
**Zero new infrastructure is needed to send.**

### The gotcha that will bite you: on a renewal, there is no email in hand

- `ReciboResult.emailIngresado` is `isNew ? (input.email || null) : null` (`ventas.ts:328`) — **null for every
  renewal**, even when the client has an email on file.
- The existing-client read at `ventas.ts:193-198` selects only `"nombre, tel"` — **no `email`**.
- And you cannot simply add `email` to that select: it runs in the `Promise.all` at `:182`, **before** the RPC
  at `:233`, while the operator's freshly-typed C7 backfill email is coalesced onto the row **inside** the RPC.
  The pre-RPC read returns the stale `null`.

**Correct value: `input.email ?? cli.email ?? null`** (add `email` to the `:195` select *and* prefer the typed
input). Put it on `ReciboResult` as something like `emailCliente`, distinct from `emailIngresado`, which the
invite rail still owns.

### The PNG

`next/og`'s `ImageResponse` is **already installed** — vendored inside Next 16.2.6
(`node_modules/next/dist/compiled/@vercel/og/`, both Node and Edge builds). No `pnpm add`. Its constraints are
hard, and they dictate the design:

- **Flexbox only.** No `display: grid`. 500KB total bundle cap (JSX + CSS + fonts + images).
- **No CSS custom properties.** Satori has no cascade — `var(--yellow)` will not resolve. The brand `<Lockup>`
  paints through `<linearGradient><stop stopColor="var(--yellow)">`, so **the lockup as authored today will not
  render in an image**. It needs literal, per-brand hex values.
- **Fonts must be bytes.** `next/font/google` (both apps use `Outfit`) self-hosts at build time and does **not**
  expose an `ArrayBuffer`. `ImageResponse` needs `fonts: [{ name, data: ArrayBuffer, weight, style }]` and
  supports **`ttf`/`otf`/`woff` only — not woff2**. So: **commit an Outfit `.ttf`** and `readFile` it at
  request time (Node runtime). No font binary exists in the repo today.
- `recibo.tsx` is `"use client"` with `useState`/`useEffect` and click handlers — **it cannot be reused as-is.**

**Therefore: build a presentational "ticket twin"** — one hook-free, `var()`-free, literal-color component that
is the single source for *both* the PNG and the HTML email body. Do not fork the ticket three ways.

**Precedent to copy for the route:** `apps/admin/src/app/(app)/cuenta/respaldo/route.ts` — an authenticated
binary Route Handler (`requireOperator` → `getOperatorGym` → build → stream with `Content-Disposition`,
`runtime = "nodejs"`). Same shape works for a receipt PNG.

**One wrapper gap:** `MailMessage` (`invitaciones.ts:22-28`) carries only `to/subject/html/text/from` — **no
`attachments`**. Resend's REST API supports attachments; `resendTransport()`'s fetch body (`:56-62`) needs one
field added to pass them through.

### Things to know before you promise this feature

- **Quota.** Resend free tier is **100 emails/day, 3,000/month**, and it is already shared by auth mail
  (Supabase rate limit raised to 50/hr) and invite mail. ADR-0015 already calls Resend "load-bearing twice… a
  shared blast radius"; a receipt-per-sale makes it three. Current volume is tiny (**48 ventas total, ever**),
  so this is not a today problem — but it *is* a launch problem, and nothing in code enforces the cap.
- **Email coverage is thin.** Only **6 of 46** clients have an email on file (red-demo 3/4, forge 1/21,
  forge-demo 2/21). Most sales will have nothing to send to — which is exactly why the manual
  send/resend button matters: it is the operator's prompt to capture the address.
- **No consent column exists.** `terms_accepted_at` / `privacy_accepted_at` are stamped only by the member's own
  self-registration, never by desk capture; `notificaciones_activadas` is explicitly inert. A transactional
  receipt to an address the member handed the desk is a defensible send — but there is no opt-in flag, and the
  sale-path email is deliberately **not** `.email()`-validated (`ventas.ts:59-62`: "the sale must complete even
  with a garbage/typo'd email"). Expect bounces; keep the send best-effort.
- **A "resend this receipt next week" feature is NOT a small extension** — do not let it creep in.
  `registrar_venta` never returns `ventas.id`, and `ventas` snapshots what was *sold* but not the resulting
  `vence`/`clases_restantes` (those live on the mutable `clientes` row). A later re-render would show *current*
  balance, not as-sold. **Sending synchronously at sale time, from the RPC's own return values, is the only
  faithful path that needs no schema change.** The manual button is a *retry of this sale's send*, in-session —
  not a receipt archive.

---

## 4. Item C — the RED re-skin (and why it is bigger than it looks)

**A `[data-brand="red"]` stylesheet alone cannot do this.** Every color on the card is an **inline** `style={{}}`
(`recibo.tsx:82, 89, 97, 98, 101, 105, 110, 120, 122, 126, 130, 134`) — and an inline declaration beats a class
selector. **The prerequisite work is de-inlining the card** into receipt-scoped custom properties
(`--recibo-paper`, `--recibo-ink`, `--recibo-label`, `--recibo-rule`, `--recibo-badge`) whose defaults reproduce
today's Forge card **byte-for-byte**. *That conversion is the job;* the brand override is the easy part.

The hard-coded inventory:

- cream paper `#f5f1ea`, ink `#1c1917` (`:82`)
- gold-brown `#7a5a26` on **8 lines** — every label, the phone, the Vigencia line, the metadata rows, the `MXN`
  suffix, the footer (`:89, 97, 101, 105, 110, 120, 130, 134`)
- `NUEVO` badge wash `rgba(199,149,69,0.18)` (`:98`)
- `TOTAL` rule `2px solid #1c1917` (`:126`)
- the perforation bars `perf` (`:45`) — the one token-aware value on the card (it punches holes the color of
  `var(--canvas)`, so the notches follow the theme)

Then override under `[data-brand="red"]` in a **literal stylesheet shipped from `packages/brand`** and
`@import`ed by `apps/admin/src/app/globals.css` — exactly the `packages/brand/src/red/neon.css` precedent.
**Why not Tailwind classes:** admin's `globals.css` `@source`s only `packages/ui/src`, **not**
`packages/brand/src`, so a new Tailwind class authored in the brand package tree-shakes to nothing **in admin**.
The client app *does* `@source` it, so it will look like it works there. **Test in admin.**
`<html data-brand={brand.id}>` is already stamped (`layout.tsx:69-75`), so the hook is live on `/vender`.

**Do this before writing the palette:** RED crimson on cream has **no vetted contrast pairing anywhere in the
repo** — every RED token contrast in `packages/brand/src/red/tokens.ts` was computed against RED's near-black
canvas. Render candidates at true size on the real cream card and **let the owner pick** (this is exactly how
the mark got fixed last session). Build the comparison first, ask second.

**Forge must not change.** Verify by `curl`ing the running admin and diffing the surfaces you touched — not by
eye, and not by "the tests pass."

---

## 5. Item D — the ATIENDE row

Delete the one tuple at `recibo.tsx:118`:

```tsx
["ATIENDE", coach.toUpperCase()],   // ← delete this line only
```

**Keep `coach` in `VentaResult` (`ventas.ts:93`), in `resolverIdentidad`, in the data reads, and in the tests** —
the owner is putting this row back, and it should be a one-line revert, not a re-implementation.

**Lint trap:** once the tuple is gone, `coach` is an unused binding in the destructure at `recibo.tsx:33` and
`pnpm lint` (which runs pre-commit) will fail. **Drop `coach` from the destructure only** — leave it flowing
through the DTO.

---

## 6. Gates and constraints (all machine-enforced unless noted)

- **Pre-commit** (Husky v9): `pnpm lint && pnpm typecheck && pnpm test`. Never run `husky` with an argument.
- **`pnpm test` cannot see the database** — `packages/data` mocks the RPC boundary. Item B's migration is DDL,
  so the real gate is **`pnpm test:denial` green against a scratch project** before fast-forwarding to `main`
  (`AGENTS.md`; the runner refuses the live ref). The scratch project from the respaldo work is kept and
  documented at `docs/db-testing-throwaway-project` (gitignored creds).
- **Cross-package boundary** (`.dependency-cruiser.cjs`, runs in `pnpm lint`): `@gym/domain` + `@gym/format` +
  `@gym/data` ✗→ `@gym/ui` + `apps/*`; `@gym/ui` ✗→ `@gym/data`; `@gym/brand` ✗→ `@gym/data` + `@gym/domain`.
  None of the decided fixes cross it.
- **Supabase MCP is bound to LIVE PRODUCTION.** Read-only `SELECT`s were owner-authorized for this
  investigation. Do not write, and do not `apply_migration` against it without asking.
- **Models:** opus / sonnet only. **No Fable** (owner, explicit).
- **Solo-main workflow:** ship on this branch, fast-forward to `main` when green. No PR.
- **Keep it lean:** no speculative flags. Two flags shipped last session (`glow`, `tagline`), each with two real
  consumers on day one.

---

## 7. Suggested first 30 minutes

1. `pnpm dev` → admin (the two apps race for port 3000; admin usually lands on **3001**) →
   `http://localhost:3001/login?gym=red-demo` → sign in → **VENDER** → complete a sale → the receipt renders,
   footer says FORGE. That is your repro.
2. Do **B** (§2). Re-run the same sale: the footer should read **RED**, and the WhatsApp picker's message copy
   should stop saying FORGE too. That single change fixes three surfaces.
3. Do **D** (§5) — one tuple, one destructure.
4. Then **A** (§3), then **C** (§4).

No GitHub issue exists for any of this yet (the four open issues are #83, #88, #89, #90 — none touch the
receipt). The repo's convention is issue-driven; consider filing one issue per item before you start.

---

## 8. Open questions only the owner can answer

1. **The RED palette on cream** (Item C) — needs rendered candidates, not prose.
2. **`brand_name` vs `legal_name` for a fiscal-looking document.** We chose `brand_name`. A gym whose legal/DBA
   name differs from its brand will print its brand on the receipt. `legal_name` exists but is null for every
   gym except red-demo. Revisit if/when receipts need to be fiscally valid (they are not today — no RFC, no
   folio fiscal, no CFDI).
3. **Resend plan.** Free tier (100/day) is fine at 48 sales *ever*, but it is now carrying auth + invite +
   receipt mail. Upgrade before launch or accept the cap.
4. **WhatsApp** already sends a text template and the operator uses it. Should the ticket image go there too
   (`wa.me` cannot attach files — it would need a hosted URL, which means Supabase Storage, which does not
   exist here)? Deliberately **out of scope** for this cycle.

---

## 9. Corrections to the previous handoff (`2026-07-13-red-receipt-brand-handoff.md`)

Read that file for the receipt's visual inventory, which is good. But it is wrong on four points:

- **"The tree is uncommitted"** — it has since been committed as `9894cb7`. Not on `origin/main` yet.
- **"Fork (b) is blocked by the dependency-cruiser boundary"** — false. The rule forbids
  `brand → data|domain`, not `data → brand`. (It is still the wrong fix, for a better reason: `brand.copy.name`
  is host-derived presentation, and the correct value was in the `gym` row all along.)
- **"Root cause is the `|| 'FORGE'` fallback"** — true but incomplete. There are three mechanisms (§2); the DB
  column default survives a pure code fix.
- **"ADR-0002 is why this default lives in one place"** — a loose analogy. ADR-0002 is about `estado`/`vence`
  projections; it says nothing about the `negocio` fallback. Don't cite it as binding.
