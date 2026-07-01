# HITL Runbook — Slice #16: Vercel deploy-verify (Phase-2 tracer exit gate)

**Issue:** https://github.com/Vack99/RED-2.0/issues/16 · **Parent PRD:** #10 · **Label:** `platform-phase2-tracer-2026-07` (`hitl`)

This is the **single terminal step the AFK agent could not do** — it needs your Vercel account, your
domains, and your human eyes on "renders its brand live." The AFK chain #11→#15 is already **shipped and
merged to `main`** (`origin/main @ ef05c4c`): `packages/brand` + `apps/client` + the admin adoption are live
on `main`. This step confirms, on real deploys, what the S1 unit test and the S2 full local run already proved.

**The model:** 2 Vercel projects against **one shared Supabase** (ADR-0008). `apps/admin` = project 1 (Phase-1,
already exists, Forge). `apps/client` = project 2 (new here) — and it serves **both** brands: you attach **two
domains** to that one project, and the `proxy.ts` seam picks the brand from the request `host`.

---

## Prerequisites (already done — just confirm)

- [x] `main` = `ef05c4c`, `apps/client` + `packages/brand` present (`git ls-tree --name-only main apps/ packages/`).
- [x] `apps/client/turbo.json` already declares `env: ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]` on `build` — **the "output-affecting env in turbo.json" AC is satisfied; no edit needed.**
- [x] Single root `pnpm-lock.yaml` + `pnpm-workspace.yaml` with a `packages:` key (Phase-1 monorepo) — confirm both exist.
- [ ] You know the two production hostnames you'll use (see Step 1).

---

## Step 1 — Decide the two production hostnames, then add them to the host-map

`packages/brand/src/host-map.ts` currently maps **only** `*.localhost`. Live domains are **not** in it yet, so a
live `red.*` host would fall through to `DEFAULT_BRAND` (`forge`). Add your two production hosts:

```ts
// packages/brand/src/host-map.ts
export const HOST_TO_BRAND: Record<string, BrandId> = {
  "forge.localhost": "forge",
  "red.localhost": "red",
  "<forge-host>": "forge",   // e.g. app.forgegym.com  (or a Vercel domain you attach)
  "<red-host>": "red",       // e.g. app.redgym.com
};
```

- Use custom subdomains you control, or two domains you attach to the client project. You need **two distinct
  hostnames** because one hostname resolves to exactly one brand.
- **Strictly**, only the **RED** host *must* be added (forge is the default fallback), but add both for clarity.
- Commit straight to `main` (solo-main workflow) and push — this triggers the client redeploy:

```bash
git add packages/brand/src/host-map.ts
git commit -m "feat(brand): register forge + red production hosts in HOST_TO_BRAND — #16"
# pre-commit runs pnpm lint && typecheck && test; must stay green
git push origin main
```

---

## Step 2 — Create the 2nd Vercel project for `apps/client`

In the Vercel dashboard → **Add New → Project** → import the `Vack99/RED-2.0` repo again (second project on the
same repo):

- **Root Directory:** `apps/client`
- **Install Command:** leave on **auto-detect** — do **NOT** override it, or `workspace:*` deps fail with
  *"unsupported workspace protocol"*. Vercel installs from the repo root using the root lockfile + workspace.
- **Framework:** Next.js (auto-detected). Build/output defaults are fine (`.next`).
- **Production branch:** `main`.

Admin (project 1) stays as-is; it re-deploys **unchanged** from the new `main` (behaviour-preserving per #14).

---

## Step 3 — Set env vars (per project, same shared Supabase)

On the **client** project → Settings → Environment Variables (Production + Preview):

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://hjppxawglmukfvsgmcog.supabase.co` (the shared project — same one admin uses) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the shared **publishable / anon** key (safe to expose; grab it from the admin project's env, or Supabase → Project Settings → API) |

Confirm the **admin** project already has the same two vars (it does, from Phase 1). Both projects point at the
**same** Supabase — that shared-DB reach is the whole point of the tracer.

**Region co-location (5-minute check, do it while you're in both dashboards):** look up the Supabase project's
region (Supabase → Project Settings → General) and set **both** Vercel projects' function region to the matching
one (Vercel → Settings → Functions). A mismatch taxes every SSR render ~60–70ms × each sequential PostgREST
call — permanently, for every gym. Record the pair here once confirmed: `Supabase: ____ · Vercel: ____`.

---

## Step 4 — Attach both domains to the client project

On the **client** project → Settings → Domains, add **both** `<forge-host>` and `<red-host>` (the exact strings
you put in `HOST_TO_BRAND`). Both point at this one client deployment; the proxy differentiates by `host`.
Follow Vercel's DNS instructions for each. Assign the admin host to the admin project if not already.

---

## Step 5 — Deploy & verify live (the acceptance judgment)

Trigger a client deploy (the Step-1 push may have already). Then verify:

1. **Build/install is green** — the deploy log shows install resolving `workspace:*` with **no** *"unsupported
   workspace protocol"* error.
2. **Brand-correct chrome, live:**
   - Visit `https://<forge-host>` → **Forge** brand.
   - Visit `https://<red-host>` → **RED** brand (incl. its bespoke login animation).
3. **No FOUC (server-rendered tokens):** the brand `:root`/`.dark` token block is in the **first-byte HTML**,
   not painted after hydration. Confirm from a terminal (headers/HTML come pre-branded):
   ```bash
   curl -s https://<red-host>   | grep -o '<style[^>]*>[^<]*--[^<]*' | head -1   # token <style> present in <head>
   curl -s https://<forge-host> | grep -o '<style[^>]*>[^<]*--[^<]*' | head -1
   ```
   Or View-Source and confirm the `<style>` sits in `<head>` before `<body>`. No flash on hard reload.
4. **Host wins over override:** `https://<red-host>/?gym=forge` still renders **RED** (mapped host is
   authoritative; the override is inert on a mapped host).
5. **Shared DB reached:** the client deploy's `@gym/data` factory instantiates against the shared Supabase
   (Phase-2 is instantiation-only, no query) — no client-side "missing env"/factory error in the console.
6. **Admin unchanged:** admin's host still renders Forge exactly as before (no vanished `@gym/ui` styles, auth
   + WhatsApp/recibo formatting intact).

---

## Acceptance checklist (mirror of issue #16 — tick then close)

- [ ] 2nd Vercel project for `apps/client` (Root Directory `apps/client`, Install Command auto-detected; root lockfile + `pnpm-workspace.yaml` `packages:` present); admin re-deploys unchanged
- [ ] `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set per project (same shared Supabase); env declared in `turbo.json` *(already true)*
- [ ] A deploy succeeds; install resolves `workspace:*` (no "unsupported workspace protocol")
- [ ] Supabase + Vercel function regions confirmed co-located and recorded (Step 3)
- [ ] **forge host renders Forge, red host renders RED** — one deployment per app, shared Supabase; brand-correct chrome + no FOUC confirmed live
- [ ] Phase-2 exit met: host→brand proven **end-to-end on live deploys**; `@gym/data` factory reaches the shared DB from the client deploy

**On all green:**
```bash
gh issue close 16 --repo Vack99/RED-2.0 \
  --comment "Live host→brand verified: <forge-host>→Forge, <red-host>→RED, one deploy per app on the shared Supabase, no FOUC. Phase-2 tracer exit gate met."
```
That closes the Phase-2 tracer. Next phases: Phase 3 (tenancy/RLS) then Phase 4 (RED admin surface).

---

## Gotchas

- **Do NOT override the Install Command** on Vercel — auto-detect is what lets `workspace:*` resolve from the root.
- **Two hostnames, one client project** — both `<forge-host>` and `<red-host>` attach to the *same* `apps/client`
  project; the seam reads `host` to brand. Don't create a third project for RED.
- **`HOST_TO_BRAND` must contain the live RED host** or RED falls back to Forge — that's Step 1, easy to forget.
- Read `host`, never `x-forwarded-host` (already coded in `proxy.ts`); if a proxy/CDN sits in front, make sure
  the `host` Vercel sees is the branded hostname.
- The publishable/anon key is **safe** in `NEXT_PUBLIC_*`; never put a service-role/secret there.
