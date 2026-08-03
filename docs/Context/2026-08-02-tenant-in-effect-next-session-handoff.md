# Next-session handoff — close epic #203 (tenant-in-effect + the anon-read exposures)

**Written:** 2026-08-02, end of the cross-examination session.
**Goal of the next session(s):** address and close **every** issue filed this session — **#203 and #204–#219, 17 issues.**
**Branch:** `main` @ `174809a`, pushed, clean gate (lint + typecheck + 1078 tests).

Read first, in this order:
1. `docs/Context/2026-08-02-cross-tenant-login-cross-examination.md` — the audit. Every finding, with citations, breaking points, and the confidence ledger.
2. `docs/Context/2026-08-02-cross-tenant-login-route.md` — the route. The issue table is the map; it carries the question, type, artifact and blocking edge for each unit.

---

## Where things stand

The owner reported that signing into the RED admin host with a Forge admin account renders Forge's real data under RED branding. A 7-agent cross-examination (3 analysts, red team, 2 research, coverage critic) plus the `finding-the-standard` RESEARCH act produced the audit above.

**The verdict, in one line:** nothing anywhere compares the gym a hostname belongs to against the gyms a session is a member of. `apps/admin/src/proxy.ts:71` gates on `decideRedirect(authed, pathname)` — a boolean — and `apps/admin` reads `x-gym` **zero** times.

**It is not a breach.** Eight red-team exploit chains all died at the read boundary; RLS is correct for the single-gym case; live counts are **0 multi-gym staff, 0 multi-gym members**. Cookies are host-only (`@supabase/ssr` sets no `domain`), so no session crossed — the Forge admin re-authenticated on RED's form and was accepted.

**Three live read exposures surfaced that are NOT the login defect** and the owner ruled all three in scope: `gym.legal_name`/`owner_user_id` readable by any authenticated identity (#213), 15 catalog tables `USING(true)` to anon (#215), `gym_domain` fully anon-readable (#216). Root cause shared by all three: **the anon-read axis is the one axis with no machine guard** (#214) — a health audit was falsified the next day and went unnoticed for 27 days.

### Owner rulings already taken — do not relitigate

| Ruling | Where it lands |
|---|---|
| On mismatch: **auto-redirect to the correct host** (chosen over the recommended refuse-with-link, tradeoffs stated) | #212 |
| **All three** read exposures get addressed; `gym.legal_name`/`owner_user_id` is this cycle's priority | #213 first, then #214–#216 |
| ADR-0008's hinge **stands**; only its wording is amended | #211 |

---

## THE FULL INVENTORY — all 17 issues, all OPEN, none closed

**The next session addresses every one of these if at all possible.** Verified open at handoff time. Label `tenant-in-effect-2026-08`. **12 are takeable immediately** — only #212 and #219 carry an open blocker, and #203 closes last.

### Ship first — recovers the past, changes no behaviour
| # | Title | Label |
|---|---|---|
| **#204** | Instrument the crossing: log host-gym vs membership-gym disagreement | `ready-for-agent` |

### Owner-only (HITL) — no agent can do these
| # | Title |
|---|---|
| **#205** | Reproduce the cross-tenant login end to end on the live RED admin host |
| **#206** | Verify the live Supabase Auth Redirect-URL allow-list is host-scoped *(dashboard state, not in git — sizes #217)* |
| **#207** | Decide the fate of `red-2-0-admin.vercel.app` and preview deployment protection |
| **#210** | Write the operator-facing doc that says which URL is theirs |

### The reported defect
| # | Title | Blocked by |
|---|---|---|
| **#208** | Prototype: what an operator sees when no redirect target exists (0 gyms, 2+ gyms) | — |
| **#212** | Reconcile host/membership in the admin app and auto-redirect on mismatch | **#208** |

### The three read exposures + the guard that stops the class recurring
*(owner's nominated priority for this cycle is #213)*
| # | Title |
|---|---|
| **#213** | Close the `authenticated` column grant on `gym.legal_name` / `owner_user_id` / `created_at` |
| **#214** | Machine guard: fail the build when a table becomes anon-readable |
| **#215** | Scope the 15 anon catalog policies so one request cannot enumerate every gym |
| **#216** | `gym_domain` is anon-readable in full, exposing the complete customer census |

### The rest
| # | Title | Blocked by |
|---|---|---|
| **#211** | Amend ADR-0008 — the tenant may only NARROW, never widen | — |
| **#219** | `mi_membresia` and `toggle_favorito_tipo` pick a tenant with a bare `LIMIT 1` and no `ORDER BY` | **#211** |
| **#217** | send-email `correo.ts` falls back to the global Site URL, auto-enrolling users into RED | — |
| **#218** | Sessions never expire and nothing revokes on role removal | — |
| **#209** | Harden cookie and transport posture on the shared `ibookit.lat` registrable domain *(lowest — defence in depth)* | — |

### The epic
| # | Title |
|---|---|
| **#203** | Tenant-in-effect: reconcile host↔membership, and close the anon-read exposures — **close last**, with a comment summarising what shipped and what was deliberately dropped |

**Re-verify state before starting** — this snapshot is from 2026-08-02:
```
gh issue list --label tenant-in-effect-2026-08 --state all \
  --json number,title,state,labels \
  --jq '.[] | "\(.state) #\(.number) \(.title)"' | sort -t'#' -k2 -n
```

---

## Work queue, in dependency order

**Start with #204.** It is the only unit that can still recover the past — `auth.audit_log_entries` is empty, no observability package is installed, and the hostname is never persisted anywhere, so *"has this already happened?"* becomes permanently unanswerable the moment behaviour changes. It ships ahead of every ruling because it changes no behaviour.

```
#204 ──────────────────────────► ship first, measures everything else
#208 ──► #212      (prototype the no-target screens, then reconcile+redirect)
#211 ──► #219      (amend the ADR, then change the RPC signatures)
#213, #214, #215, #216, #217, #218, #209, #210 ── independent
#205, #206, #207 ── HITL, owner-only, takeable any time
```

### The four HITL units the owner must do personally
Nothing an agent can do. Surface them early so they are not the tail:
- **#205** — reproduce on `red-admin.ibookit.lat` with the Forge staff account. Needs real credentials.
- **#206** — read the live Auth Redirect-URL allow-list. **Dashboard state, not in git.** It is the sole control behind the send-email hook's brand pinning, and it gates the *sizing* of #217.
- **#207** — decide the fate of `red-2-0-admin.vercel.app` and preview protection.
- **#210** — write the operator-facing page. The control currently preventing this defect in production is an operator remembering the correct hostname.

### Suggested batching
1. **#204** alone, ship it, let it run.
2. **#213 + #214** together — one migration plus the guard that stops the class recurring. Cheapest real win.
3. **#208 → #212** — the actual fix for the reported defect.
4. **#211 → #219**, then **#215 + #216 + #217 + #218**, then **#209**.
5. Close **#203** last, with a comment summarising what shipped and what was deliberately dropped.

---

## Traps for the next session

1. **#212 must branch on tenant-*absent* vs tenant-*mismatched*.** `resolveTenant` returns `null` for `red-2-0-admin.vercel.app`, every preview deployment, and plain `pnpm dev` — `apps/*/package.json` runs bare `next dev` on `localhost:3000` and **there is no bare `localhost` row in `gym_domain`**. Absent must still render. Getting this wrong locks the owner out of local dev.
2. **Do not "fix" `gym_domain.app` by filtering it in the resolver.** `red` has no admin `.localhost` row and `forge` has no client `.localhost` row; RED-admin dev works *only* because `resolve-tenant.ts:121-125` never filters that column, and `docs/prds/prd-brand-system.md:71` relies on it in writing. Deliberately unfiled — see the route's dropped list.
3. **#212's redirect target must be server-derived** from `gym_domain where app='admin'`, never from a param, header, or cookie. The inverse-map query already exists for the client side at `packages/data/src/server/invitaciones.ts:86-112`. Anything else is an open redirect, and the audit's counter-evidence section documents Microsoft's dangling-DNS scenario where a domain mapping *becomes* the privilege grant.
4. **#212 breaks exactly two tests** — `packages/data/src/server/agenda-miembro.test.ts:524` and `:574`, which currently *assert the silent fallback is acceptable*. Update them; don't delete them.
5. **#219 is a signature change, not an app fix.** `mi_membresia()` and `toggle_favorito_tipo()` take **zero arguments**, so no app-layer channel exists. `reservar_clase` is the correct in-repo pattern; the HMAC firma (`20260713190000_reclamar_tenant_binding.sql:51-64`) is the template for accepting a caller-supplied gym without trusting it.
6. **Migration-bearing units (#213, #215, #216, #219) owe `pnpm test:denial` green against a scratch project before fast-forwarding** — `SUPABASE_TARGET_REF=<scratch-ref> SUPABASE_ACCESS_TOKEN=<pat> pnpm test:denial`. The runner refuses the live ref. Scratch project `gyyujeguycxxoaqgdnjp` is kept as the test bed. Per AGENTS.md, a migration that changes what an RPC *writes* ships with a suite assertion on the **written rows**, not the return value.
7. **The Supabase MCP is bound to LIVE production.** Everything this session did against it was read-only. Keep it that way.
8. **No suite fixture anywhere seeds a two-membership actor** — not one of the 41 `supabase/tests/*.sql` files inserts two `gym_membership` rows for one user, or two `clientes` rows for one `auth.users` id. That missing vector is why #219 and the `staff_gym()` UUID-sort finding survived. #219 should add it.
9. **Pushing needs fresh consent.** The push in this session was authorized for this session only.

---

## Live reference

- **4 gyms**, 14 `gym_domain` rows, 4 production admin hosts, **10 accounts, every one single-gym.**
- **12 of 16** (production admin host × operator) pairs cross — 75%.
- `red-admin.ibookit.lat` is a live production row (`supabase/migrations/20260709090000_ibookit_host_map.sql:20`). The defect is reachable in production, not on a dev surface.
- All 7 non-localhost hosts share `ibookit.lat`, so `SameSite=Lax` is a no-op between tenants (#209).
- Live `auth.sessions`: all rows `not_after: null`; one observed alive **21 days** (#218).

---

## Session hygiene notes

- **Working tree carries pre-existing dirt that is not mine and was not touched:** `docs/superpowers/plans/2026-07-20-red-gym-live-seed.md` (modified) and ~16 untracked `docs/Context/` files from earlier sessions.
- **`apps/admin/src/app/proto/` is untracked WIP** (wayfinder #189). One mechanical change was made to it: `_shell.tsx` → `_components/shell.tsx` with six import sites updated, because `tools/guards/client-seam.test.ts` failed on it and blocked every commit. That is what the guard's own error message asks for, and it makes the ESLint seam rule *cover* the file rather than exempt it. Nothing else in `proto/` was touched.
- **`apps/admin/src/proxy.ts` was reverted to HEAD mid-session** by something outside this session. An analyst had read an uncommitted `/proto` auth-bypass in it and the audit reported it; that finding is now **retracted in the audit's draft-audit section**, with the retraction left visible rather than deleted.
- **A `/code-review` pass caught five miscitations and the wrong route issue-map** (the issue-creation loop globbed `iss-1, iss-10, iss-11, iss-12, iss-2…` lexicographically). All fixed in `174809a`; the two blocking edges were re-pointed on the tracker. Both fix commits are pushed.
