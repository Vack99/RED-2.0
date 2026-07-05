# HITL Runbook — Slice #28: Live RLS-cutover deploy-verify (terminal gate)

**Issue:** https://github.com/Vack99/RED-2.0/issues/28 · **Parent PRD:** #17 · **Plan:** `docs/superpowers/plans/2026-07-05-issue28-live-cutover.md` · **Label:** `hitl`

This is the terminal step of the two-stage ADR-0013 §5 contract cutover: with Migrations A+B already applied live, a human walks real prod deploys and confirms the RLS surface still serves every gym correctly. The agent watches; you are the only executor. Clones the hitl-16 pattern, but the static host-map leg is gone — hosts now resolve from the `gym_domain` table (`resolveTenant`, ADR-0012 §5 amended 2026-07-02), so **do not** edit any in-code host map.

**Live refs (recorded 2026-07-05, read-only).** Every gym is `America/Chihuahua`.

| gym | slug | brand | gym_id |
|-----|------|-------|--------|
| Forge | `forge` | forge | `d5f81022-0f3d-48ac-96b9-5e32a5214285` |
| RED | `red` | red | `ca1954bc-6b40-4ab1-bb45-1ce4d58ab5f9` |
| Forge Demo | `forge-demo` | forge | `968bafb0-36d0-40ce-813c-d5cb1668dd39` |

**Live production hosts** (the `gym_domain` rows that are not `*.localhost` dev entries):

| hostname | app | resolves to |
|----------|-----|-------------|
| `red-2-0-admin.vercel.app` | admin | Forge |
| `red-2-0-client.vercel.app` | client | RED |
| `forge-red-2-0-client.vercel.app` | client | Forge |

All hosts are Vercel-assigned `*.vercel.app`; no BYO custom domains exist yet. No host-provisioning pre-step is needed — the rows above are already live.

---

## Preconditions (gate — do not start until every box is true)

Evidence lives in the plan doc (`…/2026-07-05-issue28-live-cutover.md`, Tasks 5–7) and the session records referenced there.

- [ ] **Migration A applied live** (21 legacy per-`auth.uid()` policies dropped; 5 anon EXECUTE revokes). Catalog snapshot AFTER-A recorded (plan Task 7).
- [ ] **Migration B applied live** (7 `user_id` columns dropped; 5 RPCs + `next_folio` guard rewritten). Snapshot AFTER-B recorded: **zero per-`auth.uid()` policies, zero `user_id` columns**.
- [ ] **Claim RPC live** — `reclamar_o_crear_cliente` present in `pg_proc` (plan Task 4).
- [ ] **Denial suite green AFTER-B** — all suite files pass on the rehearsal branch (plan Task 6).
- [ ] **Synthetic gym-#2 probe green** on the branch (plan Task 6).

If any box is false, stop — this is the post-cutover walk, not the cutover itself.

---

## Step 1 — Real hosts resolve from `gym_domain`

Visit each live host; confirm brand chrome + tenant. `resolveTenant` lower-cases and port-strips the request `host`, looks it up in `gym_domain`, and stamps `x-gym`/`x-brand` from the matched gym.

1. `https://red-2-0-admin.vercel.app` → **Forge** admin chrome (login screen).
2. `https://red-2-0-client.vercel.app` → **RED** brand (incl. its bespoke login animation).
3. `https://forge-red-2-0-client.vercel.app` → **Forge** brand.

**First-byte brand tokens (no FOUC)** — the brand `:root`/`.dark` token block must be in the first-byte HTML, server-rendered:

```bash
curl -s https://red-2-0-client.vercel.app       | grep -o '<style[^>]*>[^<]*--[^<]*' | head -1   # RED tokens in <head>
curl -s https://forge-red-2-0-client.vercel.app | grep -o '<style[^>]*>[^<]*--[^<]*' | head -1   # Forge tokens in <head>
```

**Host wins over override:** `https://red-2-0-client.vercel.app/?gym=forge` still renders **RED** — a mapped host is authoritative; the `?gym=` arm only fires when no `gym_domain` row matches.

**Unknown-host probe (ADR-0012 fallback):** visit a client-app deploy URL with **no** `gym_domain` row (e.g. a preview alias `red-2-0-client-<hash>.vercel.app`). `resolveTenant` returns `null` → `DEFAULT_BRAND` (forge) chrome, **no `x-gym` header**, and tenant-requiring writes refuse rather than silently defaulting.

---

## Step 2 — Forge admin ops green in prod (post-cutover)

On `https://red-2-0-admin.vercel.app`, exercise every rewritten RPC once with your own eyes. This is the proof that Migration B's `create or replace` bodies work live.

1. **Login** — sign in as a Forge staff member.
2. **Read paths** — `/inicio` (agenda) and `/clientes` (client list) load with real Forge rows.
3. **One real sale** — `/vender`: register a genuine sale (`registrar_venta`). Confirm the **folio increments by exactly one** vs. the prior sale (proves `next_folio`'s staff guard + per-gym sequence).
4. **Plantillas render** — `/cuenta`: the WhatsApp template editor lists Forge's plantillas (`crear_plantilla`/`sembrar_plantillas_default` per-gym paths).
5. **One check-in** — `/asistencia`: toggle a client's pass (`toggle_pase`); the attendance row lands and dates render in **`America/Chihuahua`**.

Any RPC raising a NULL/permission error here means a rewritten body regressed — stop and escalate before Step 3.

---

## Step 3 — Register → claim live on a real host

Exercise the open-enrollment path end-to-end on a real inbox. **Auth mail rides Supabase's default sender** (#27 SMTP is owner-deferred) — budget **≤2 emails/hr** and check the spam folder; one clean manual pass suffices.

1. On `https://red-2-0-client.vercel.app` → `/registro`, self-register with a real email you control.
2. Confirm via the email link (check spam; wait out the rate limit if a resend is needed).
3. The claim lands (`reclamar_o_crear_cliente`) and the member sees the **RED** gym catalog — scoped to RED only, no cross-tenant rows.

---

## Step 4 — Advisors, evidence, and the acceptance checklist

- **Advisors:** confirm `get_advisors` (security + performance) is clean — the AFTER-B snapshot should already show the `multiple_permissive` WARNs and the 6 unindexed-FK INFOs cleared (plan Task 7). Record the result.
- **Region co-location:** set during #16 — confirm the Supabase/Vercel region pair recorded in `hitl-16-vercel-deploy-verify.md` Step 3 still holds. Verify, do not re-tune.
- Record each step's outcome (screenshots or a one-line pass note) alongside the plan-doc Task-7 snapshots.

### Acceptance checklist (mirror of issue #28 — tick then close)

- [ ] Denial suite green BEFORE and AFTER the cutover (both runs recorded — plan Tasks 5–6)
- [ ] Zero per-`auth.uid()` policies and zero redundant `user_id` columns remain (AFTER-B catalog query recorded)
- [ ] Synthetic gym-#2 probe passed end-to-end (register, claim, scoped read, sale; independent folios; gym timezone rendering)
- [ ] Real hosts resolve from `gym_domain` (Step 1); Forge admin ops green in prod (Step 2); register→claim live (Step 3)
- [ ] ~~Auth mail from the custom sender~~ — **WAIVED** (#27 SMTP owner-deferred; verified on the default sender per the 2026-07-03 ordering relaxation on #28)
- [ ] Post-cutover `improve-database-architecture` audit run; findings recorded/triaged (plan Task 9)
- [ ] Forge test suite green; advisors clean

**On all green:**

```bash
gh issue close 28 --repo Vack99/RED-2.0 \
  --comment "Live cutover verified: A+B applied, zero per-auth.uid() policies + zero user_id columns; real hosts resolve from gym_domain (red-2-0-admin→Forge, red-2-0-client→RED, forge-red-2-0-client→Forge); Forge admin ops + register→claim green in prod; advisors clean. Custom-sender AC WAIVED (#27 deferred)."
```

---

## Gotchas

- **No in-code host map to edit.** Hosts resolve from the `gym_domain` table, not the deleted static `HOST_TO_BRAND`. hitl-16 Step 1 (host-map edit) is obsolete — do not clone it. New live hosts are added by inserting a `gym_domain` row, not by code.
- **Migration B is irreversible.** The `user_id` column drops are committed live; recovery is **PITR-only**. Do not treat Step 2 as a place to "undo" — if an RPC regressed, escalate, don't re-drop.
- **Auth-mail rate limit.** Default sender is ~2 emails/hr and may spam-folder. Don't burn retries during Step 3 — one confirmed pass is enough.
- **Read `host`, never `x-forwarded-host`.** If a proxy/CDN ever fronts these hosts, ensure the `host` Vercel sees is the branded hostname, or resolution falls through to no-tenant.
- **Vercel install command:** leave on auto-detect (root lockfile + workspace) — overriding it breaks `workspace:*` resolution. Only relevant if a redeploy is triggered during the walk.
