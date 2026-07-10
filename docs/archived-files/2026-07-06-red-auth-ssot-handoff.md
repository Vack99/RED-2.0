# Handoff — RED auth lockout fix + the membership single-source-of-truth gap

**Date:** 2026-07-06 (late). **Branch:** `main`, **UNCOMMITTED working tree** (this session's work is not
committed — see "Working tree" below; commit on a branch per the solo-main workflow before deploying).
Continues the same-day bug-fix/auth-hardening session (see the `phase6-client-execution-progress` memory).

---

## 1. Admin lockout — DIAGNOSED + FIXED (code)

**Symptom:** "can't enter the admin app." Log (`docs/logs/errors1`): `Runtime Error: Sin gym asignado`
at `packages/data/src/server/gym.ts:40`, from `(app)/inicio/page.tsx`.

**Root cause:** a **fourth auth user, `ajtalaverapalos@gmail.com`, exists with NO `gym_membership` and NO
linked `clientes`** (the other 3 auth users are the forge / forge-demo / red-demo owners). `getOperatorGym`
resolves the operator's gym from `gym_membership` and `throw`s when there is none. `proxy.ts` only redirects
**anon** callers to `/login` (`decideRedirect`); a signed-in account with no membership passes that gate and
then white-screens on the first page's throw. Redirecting it to `/login` would loop (the proxy bounces authed
users back).

**Fix (this session):** the `(app)` layout (`apps/admin/src/app/(app)/layout.tsx`) is now an async Server
Component that resolves `getOperatorGym()` once (cache()-deduped with each page's own call) and, on failure,
renders a graceful **"Sin gimnasio asignado"** screen with a **Cerrar sesión** button
(`(app)/_components/sin-gimnasio.tsx`) instead of the shell — clearing the session is the only loop-free exit.
Verified: typecheck 0 / lint 0 (dep-cruiser clean) / 723 tests.

**Immediate unblock for you:** log into the admin as an **owner** — `demo@red-demo.test` (red-demo) or
`nahumtrevizo2@gmail.com` (forge). `ajtalaverapalos@gmail.com` is NOT an operator account (see §2).

**Console warning also in the log (NOT the blocker, pre-existing):** `providers.tsx:27` — next-themes'
`ThemeProvider` injects a no-flash `<script>`, which React 19/Next 16 warns about ("Scripts inside React
components are never executed…"). Benign (the script runs in the SSR'd HTML before hydration); a library-level
quirk, not a functional break. Leave unless it starts causing real FOUC.

---

## 2. THE REAL ISSUE — membership single source of truth

You created a client in the admin (name + phone, **no email**) and it "is not being registered for the client
app login at all." That is the crux. There are **three tables** and **two disconnected doors** into membership:

| Table | What it is |
|-------|------------|
| `auth.users` | Login identity (email + password). |
| `gym_membership(user_id, gym_id, role)` | Platform access for an auth user: `owner` / `operator` / `member`. Gates the **admin** app (`getOperatorGym`) and the **client** member screens (`resolverMiembroGym`). |
| `clientes(gym_id, auth_user_id?, nombre, tel, email?, clases_restantes, …)` | The **CRM / business record**. `auth_user_id` links it to a login; **NULL** for staff-created records. |

**Door 1 — Admin "add client":** an operator adds a walk-in/paying member → creates a `clientes` row with
**name + phone only, no email, no auth**. This person exists in the CRM but **cannot log into the client app**.

**Door 2 — Client-app "register":** self-service → `signUp` (auth.users) → `reclamar_o_crear_cliente` creates
`gym_membership(member)` **and** a `clientes` row **atomically**, matching an existing unclaimed cliente
**by verified email** (`lower(email)`), else minting a fresh one.

**The gap:** the claim's only join key is **email**, but Door 1 never captures it. So an admin-added client who
later self-registers is **NOT matched → a DUPLICATE `clientes` row is minted**, and their admin-side balance /
history does not carry over. Admin truth and app truth diverge. That is exactly what you hit.

### Fix options (OWNER DECISION — not yet made)
- **A (recommended): capture email in the admin add-client form.** `clientes.email` already exists; wire the
  form field + pass it on the create path. Then Door-1 clients are claimable by Door-2 registration exactly as
  designed (pre-create in admin → member self-registers → claims their own record, balance intact). Smallest
  change, closes the gap at the source.
- **B: admin-initiated invite** — creating a client sends an email magic-link that auto-links the auth user to
  that cliente. Better UX, more plumbing (email template + a claim-by-token path alongside claim-by-email).
- **C: accept two records + dedupe later.** Not recommended — silent divergence of the money-bearing record.

Recommend **A**. Whichever: the admin add-client form and `reclamar_o_crear_cliente` must share **email** as the
identity key, or the two doors never meet.

---

## 3. The orphaned account `ajtalaverapalos@gmail.com`

Auth user, email-confirmed, **no membership, no clientes** — a **client-app registration that failed to link**.
This is the *exact* bug fixed this session but **NOT yet deployed**: the live code only runs the claim in
`/auth/confirm` (the email link), so with email-confirmation OFF, `signUp` returns an immediate session, the
confirm route never fires, and no member rows are created. (Fix: `registro/actions.ts` now runs the claim inline
when there's no confirmation step — in the uncommitted working tree.)

**Recommended cleanup (owner):** once the registro fix is deployed, **delete** the orphaned
`ajtalaverapalos@gmail.com` auth user (Supabase dashboard → Auth → Users, or ask the agent to SQL it — it's a
destructive auth write, so confirm first), then re-test registration cleanly.

---

## 4. Working tree (uncommitted — commit on a branch before deploying)

This session (client bug-fixes + auth-hardening + admin fix). Gate GREEN (typecheck 0 / lint 0 / 723 tests):
- **Client:** Bug1 perfil nested-button (3-way `Row`); #4 `useActionState` `startTransition`; notifications
  toggle removed (UI + orphaned TS; DB column/RPC kept dormant); header hidden on `/reservar` `/clase`
  `/confirmada`; reserve-CTA gated on new `esMiembro` / `esClienteDelGym` / `getEsMiembro` (non-customer sees
  "Ver planes" → /precios, not the hard "No eres miembro" error); **registration hardened** to claim inline when
  email-confirmation is off.
- **Admin:** graceful "Sin gimnasio asignado" screen (`(app)/layout.tsx` + `_components/sin-gimnasio.tsx`).
- **DB (already live):** red-demo content seed (`supabase/migrations/20260706230000_seed_red_demo_remediation_content.sql`).

## 5. Owner steps still open for a green #63
1. Decide + build the **SSOT fix** (§2, recommend A: email on admin add-client).
2. Turn **OFF** "Confirm email" in Supabase (Auth → Providers → Email) — safe now that registration is hardened.
3. Delete the orphaned `ajtalaverapalos@gmail.com` (§3); re-register a clean red-demo **customer** to walk
   reserve → confirm.
4. Commit this working tree on a branch → fast-forward to main → deploy → re-walk #63 → close #49.
