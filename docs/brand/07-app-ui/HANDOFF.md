# Handoff — iBookit app UI (worktree `ibookit-app-ui`)

**This worktree was prepped, not worked.** Zero code changed. Next session does the analysis,
the planning and the decomposition. Read this first, then the prototype.

Branch `ibookit-app-ui`, based on `main` @ `3f54ec3`. Deps installed. Baseline green at base
commit: lint + depcruise (325 modules, 0 violations), typecheck, 1652 tests / 93 files.

## 0 · Files that matter

| Path | What |
|---|---|
| `docs/brand/07-app-ui/prototipo-admin-v1.dc.html` | **The new admin UX** — 10 screens, live state. Source of truth for this work. |
| `docs/brand/06-house-theme/CLAUDE-DESIGN-BRIEF.md` | The 33-token iBookit contract, light + dark, contrast measured. |
| `docs/brand/06-house-theme/login-mark.html` | Animated login mark, liftable snippet. |
| `docs/brand/03-visual-identity/IDENTITY.md` + `final/` | Locked mark, wordmark, palette. |
| `docs/brand/06-house-theme-handoff.md` | Why the house brand exists at all (marketing needs real product captures). |

⚠️ The `.dc.html` is a Claude artifact export: it needs a `./support.js` that we don't have, so
**it will not render in a browser**. Read it as markup. `data-screen-label` marks each screen;
`<sc-if>` / `<sc-for>` are conditionals/loops; `{{ x }}` binds to the `class Component extends
DCLogic` block at the bottom (line 428+) — that block is where the real interaction rules live
(what "Marcar" does, late-capture, cupo edits, scope hoy/serie).

The four `ibookit*.png` in Downloads are a generic AI clock-and-calendar logo. **Not our mark.**
Ignore them — the locked identity is the plum 3×3 grid.

## 1 · The prototype at a glance

Mobile, 390×844, **light only**, plum `#8A4A6C`, Hanken Grotesk 600/400, tabular-nums on every
number. Ten screens + a persistent dock + three bottom sheets + a toast.

| Screen | Contents |
|---|---|
| `/login` | ~3.1s choreography: 8 cells stroke-draw → wordmark letters fade → the plum cell flies in and becomes the `i` dot → lockup lifts → `ADMINISTRADOR` → form rises. Correo + contraseña + olvidé. |
| `/inicio` | EN CURSO card (live class, N/12 dentro, "Pasar lista →") · two quick actions (Nuevo cliente / Apartar lugar) · MEMBRESÍAS card: "Por renovar" with a 6-bucket strip (HOY/MAÑ/2–3D/4–5D/6–10D/CLASES) + "Aún a tiempo" (vencidas 1–15 d) + "Ver los 22 en Clientes →" · footer link to Agenda. |
| `/agenda` | Week strip with ‹ › paging + HOY pill · day class list (hora, nombre, coach, right-side figure, occupancy hairline bar) · "+ Nueva clase". |
| `/asistencia` | "Pase de lista" · date stepper with a tag pill · filter chips · search · **CON RESERVA** roster · **TODOS** (walk-ins) · Marcar ⇄ ✓ hh:mm toggle · late-capture warning line. |
| `/clientes` | Search · filter chips · rows (nombre / sub / status tag) · empty state. |
| `/clientes/[id]` | Ficha: nombre, status dot + plan line + alert · big "días restantes" + expiry + bar · **✓ Asistencia** / **Renovar** · Contactar row · inline HISTORIAL preview · "Ver todo el historial →". |
| `/clientes/[id]/historial` | **NEW ROUTE.** Year tabs · month-grouped rows (fecha, concepto, monto) · "socio desde" footer. |
| `/clientes/[id]/mensaje` | **NEW ROUTE.** WhatsApp template picker · live bubble preview in authentic WA green · "Enviar por WhatsApp" (green button) · points at Cuenta → Plantillas. |
| `/clientes/nuevo` | **NEW ROUTE.** NUEVO ⇄ EXISTENTE toggle · nombre / teléfono (opcional) / correo (opcional) · plan tiles · INICIO date row ("Cambiar") · PAGO chips · **Cobrar** + "VENCE 7 SEP · RECIBO E INVITACIÓN POR CORREO". |
| `/cuenta` | COBRADO EN AGOSTO figure + ventas count · settings rows with badges · Cerrar sesión. |

Chrome: **dock** (INICIO · AGENDA · PASE · CLIENTES · CUENTA) with a dark pill that slides
between slots (220 ms) · **sheets** (clase, editar clase, contactar) sliding up over a scrim ·
**toast** pill above the dock.

## 2 · Delta vs the app today

**Good news first: the shell is already right.** `apps/admin/src/app/(app)/layout.tsx` is already
a mobile-first phone-width column with a pinned bottom `TabBar` from `@gym/ui/forge/tab-bar`, and
`@gym/ui/src/forge/` already ships `sheet.tsx`, `toaster.tsx`, `input.tsx`, `icon.tsx`,
`skeleton.tsx`, `count-up.tsx`, `whatsapp-bubble.tsx`, `use-flip.ts`, `motion.ts`. This is **not**
a from-scratch restructure. Confirm that before planning like it is.

### Routes

| Prototype | Today | Verdict |
|---|---|---|
| `/login` | `(auth)/login` | exists — animation is the change |
| `/inicio` `/agenda` `/asistencia` `/clientes` `/clientes/[id]` `/cuenta` | same | exist — restyle + content deltas |
| `/clientes/[id]/historial` | — | **new route** |
| `/clientes/[id]/mensaje` | — | **new route** (today: `mensaje-picker.tsx` + `mensajes-sheet.tsx`) |
| `/clientes/nuevo` | — | **new route** |
| — | `(app)/vender` (+ `_components/recibo.tsx`) | **has no prototype counterpart** |

`/clientes/nuevo` in the prototype *is* today's sell flow — nombre/tel/correo + plan + fecha de
inicio + método de pago + Cobrar + recibo. So `/vender` isn't missing by accident; the prototype
folds it into a client-first screen. **That is the single biggest structural question in this
work** (§3, Q1) — `/vender` carries the paquete swap, personalizado, backdated fecha, recibo and
the whole payment-correction surface shipped through #266.

### Dock

Today: `INICIO · CLIENTES · ASIST(primary, raised) · AGENDA · CUENTA`.
Prototype: `INICIO · AGENDA · PASE · CLIENTES · CUENTA`, no raised slot, sliding dark pill.
Order changed, the primary treatment is gone, `ASIST` renamed `PASE`.

### Theme

RED is dark-only crimson. iBookit is **light-first with a first-class dark scheme** — and the
prototype ships **light only**, every hex inline. The dark half exists solely in
`06-house-theme/CLAUDE-DESIGN-BRIEF.md` §1 and has never been seen on a screen. Someone has to
derive dark for every new surface (sheets, dock pill, WA bubble, toast) from the token roles.

### Naming wart

The whole UI kit lives under `packages/ui/src/forge/` and the admin imports `@gym/ui/forge/*` —
a brand name on the brand-neutral kit. It predates the house brand. Renaming it is a wide
mechanical diff that touches both apps; decide deliberately (§3, Q4), don't drift into it.

## 3 · What the next session must settle (before any plan)

1. **Does `/vender` survive?** Merged into `/clientes/nuevo`, kept as the renewal/correction path,
   or both (nuevo = happy path, vender = everything else)? Every other decision hangs off this.
   Trace `RENOVAR` on the ficha and the `/vender?cliente=` deep link before answering.
2. **Is the prototype a re-skin or a re-flow?** Screen by screen: which deltas are visual
   (tokens/type/spacing) and which change what an operator can *do*. The `/inicio` renewal
   bucket strip and the `/asistencia` CON RESERVA / TODOS split look like real behaviour, not paint.
3. **Where does the house theme live?** New `ibookit` brand module in `packages/brand/src/`, or
   does it become the `base` module (the "no brand of their own" default)? `base/` already exists.
   The registry contract (`tokens` + `css` + `copy` + lockup + optional `loginAnimation`) is the seam.
4. **Rename `@gym/ui/forge/*`?** Yes/no/later — decide once, in writing.
5. **What of this is already built?** The prototype's sheets, chips, toasts and pickers have real
   counterparts in `@gym/ui/src/forge/` and in the admin's `_components`. Inventory first, build
   second. The lazy version of this work is mostly tokens + three routes + a dock restyle.
6. **Dark scheme sign-off.** The owner has never seen iBookit dark. Get it on a screen early.
7. **Scope of the client app** — see §4.

## 4 · The client app

In scope for this worktree, **second**. Facts:

- `apps/client` is 19 routes: `(home)`, `activar`, `activar/contrasena`, `auth/confirm`, `clase/[sessionId]`,
  `confirmada/[sessionId]`, `contacto`, `entrar`, `legal`, `nosotros`, `precios`, `registro`,
  `reservar`, `restablecer`.
- It barely uses the shared kit — only 5 `@gym/ui/forge/*` imports, all `skeleton` in `loading.tsx`.
  Its UI is bespoke. A shared-kit restyle will **not** carry over to it for free.
- There is **no client prototype**. Don't invent one. Either the owner produces one, or the client
  app gets tokens + lockup + type only (a true re-skin) and its flows stay as they are.

Both apps share one tenant seam (`resolveTenant` → `x-gym` + `x-brand`, ADR-0012), so a house brand
module lights up both at once. That part is free; the layout work is not.

## 5 · Rails (do not trip these)

- **No push without the owner asking for that specific push.** Every push to `main` deploys both
  Vercel apps. Local commits are always fine.
- Pre-commit runs `pnpm lint && pnpm typecheck && pnpm test`. Budget ~80 s per commit.
- Cross-package boundary is machine-enforced: `@gym/domain` / `@gym/format` / `@gym/data` ✗→
  `@gym/ui` / `apps/*`, and `@gym/ui` ✗→ `@gym/data`, `@gym/brand` ✗→ `@gym/data` + `@gym/domain`.
- Brand modules are **presentation only** — never data, rules or authz (ADR-0008).
- If anything here needs a migration: `pnpm test:denial` green against a **scratch** project before
  it fast-forwards. Supabase MCP is bound to **LIVE**.
- Read `node_modules/next/dist/docs/` before writing Next.js code — this is not the Next.js in
  your training data.

## 6 · Suggested order for the next session

1. Read the prototype end to end, **including the `DCLogic` block** (line 428+).
2. Screen-by-screen delta table: prototype vs the real component that renders it today. Mark each
   row `paint` / `behaviour` / `new`.
3. Answer Q1–Q4 above; take Q1 and Q6 to the owner as a picker, not as prose.
4. Only then plan. One AC issue if it ships as one session; `/to-spec` → `/to-tickets` only if the
   pieces genuinely ship and verify independently.
