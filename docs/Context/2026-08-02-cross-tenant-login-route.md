# Route — cross-tenant login on branding

**Source:** `docs/Context/2026-08-02-cross-tenant-login-cross-examination.md`
**Charted:** 2026-08-02 · **Published:** GitHub issues `Vack99/RED-2.0`, epic **#203**, label `tenant-in-effect-2026-08`

This file is the index. The tracker is canonical — native sub-issue links to #203 and native blocking edges are live.

---

## Rulings taken 2026-08-02 (owner)

**R1 — On a host↔membership mismatch, the admin app auto-redirects to the correct host.**
Chosen over the recommended refuse-with-link. The tradeoffs were stated at decision time and stand: no vendor or standard recommends auto-redirect, and it discloses tenant membership across a host boundary. Two constraints carried into **#209** to make it safe — the redirect target is derived server-side from `gym_domain where app='admin'` (never a param, header, or cookie), and only the single-gym case redirects (0 and 2+ memberships get **#208**'s screens).

**R2 — ADR-0008's hinge is not overturned; its wording is amended.** → **#219**
It survived eight red-team chains. But "presentation-only" also forbids *narrowing*, which the code already violates twice for correctness and once outright (`auth/confirm/route.ts:52` mints a `gym_membership` row from the host). Amendment: *may only narrow to a tenant the caller already holds membership for, never widen.*

**R3 — All three live read exposures get addressed**, with `gym.legal_name` / `owner_user_id` (**#210**) as this cycle's priority. → **#210**, **#211**, **#212**, **#213**

---

## The units

| # | Unit | Type | Label | Blocked by |
|---|---|---|---|---|
| **#204** | Instrument the crossing — log host-gym vs membership-gym disagreement | measure | `ready-for-agent` | — |
| **#205** | Reproduce the defect end to end on the live RED admin host | measure | `hitl` | — |
| **#206** | Verify the live Auth Redirect-URL allow-list is host-scoped | measure | `hitl` | — |
| **#207** | Decide the fate of `red-2-0-admin.vercel.app` + preview protection | measure | `hitl` | — |
| **#208** | Prototype: the 0-gym and 2+-gym screens (no redirect target) | prototype | `ready-for-agent` | — |
| **#209** | Reconcile host↔membership in admin, auto-redirect on mismatch | implementation | `ready-for-agent` | **#208** |
| **#210** | Close the `authenticated` column grant on `gym` | implementation | `ready-for-agent` | — |
| **#211** | Machine guard: fail the build when a table becomes anon-readable | implementation | `ready-for-agent` | — |
| **#212** | Scope the 15 anon catalog policies | implementation | `ready-for-agent` | — |
| **#213** | `gym_domain` anon-readable in full — the customer census | implementation | `ready-for-agent` | — |
| **#214** | `correo.ts` Site-URL fallback auto-enrolls users into RED | implementation | `ready-for-agent` | — (informed by #206) |
| **#215** | Sessions never expire and nothing revokes on role removal | implementation | `ready-for-agent` | — |
| **#216** | `mi_membresia` / `toggle_favorito_tipo` bare `LIMIT 1`, no `ORDER BY` | implementation | `ready-for-agent` | **#219** |
| **#217** | Cookie + transport hardening on the shared `ibookit.lat` domain | implementation | `ready-for-agent` | — |
| **#218** | Write the operator-facing doc that says which URL is theirs | task | `hitl` | — |
| **#219** | Amend ADR-0008 — the tenant may only NARROW, never widen | task | `ready-for-agent` | — |

---

## Order

```
#204 ─────────────────────────► measures everything below, forever
#208 ──► #209
#219 ──► #216
#205, #206, #207, #210, #211, #212, #213, #214, #215, #217, #218 ── takeable now
```

**#204 first.** Every other unit changes behaviour; #204 is the only one that tells you what the behaviour *was*. `auth.audit_log_entries` is empty, no observability package is installed, and the hostname is never persisted — so "has this already happened?" is unanswerable today and unanswerable retroactively tomorrow.

**#210 is the cheapest live exposure to close** and the owner's nominated priority for this cycle: one migration.

---

## What was dropped

Recorded so truncation never reads as coverage.

- **Two RESEARCH angles not run:** compliance frameworks (NIST SP 800-series, ISO 27017, CSA CCM, SOC 2) and the AWS Tenant Isolation Strategies PDF — judged lower yield than the vendor and standards sources actually used.
- **Three MEASURE angles unreachable from the session that charted this**, and they are units above rather than silent gaps: everything behind the Supabase and Vercel dashboards (#206, #207), and any live HTTP request or reproduction (#205).
- **No unit covers** `service_role` key custody, the `activar-cuenta` edge-function body, `cancelar_reserva` / `pasar_lista_sesion` / `toggle_pase`, or DNS/registrar posture for `ibookit.lat`. See the audit's blind-spot list; #217 turns on the last of these.
