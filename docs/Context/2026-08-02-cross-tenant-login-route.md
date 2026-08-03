# Route — cross-tenant login on branding

**Source:** `docs/Context/2026-08-02-cross-tenant-login-cross-examination.md`
**Charted:** 2026-08-02 · **Published:** GitHub issues `Vack99/RED-2.0`, epic **#203**, label `tenant-in-effect-2026-08`

This file is the index. The tracker is canonical — native sub-issue links to #203 and native blocking edges are live.

---

## Rulings taken 2026-08-02 (owner)

**R1 — On a host↔membership mismatch, the admin app auto-redirects to the correct host.**
Chosen over the recommended refuse-with-link. The tradeoffs were stated at decision time and stand: no vendor or standard recommends auto-redirect, and it discloses tenant membership across a host boundary. Two constraints carried into **#212** to make it safe — the redirect target is derived server-side from `gym_domain where app='admin'` (never a param, header, or cookie), and only the single-gym case redirects (0 and 2+ memberships get **#208**'s screens).

**R2 — ADR-0008's hinge is not overturned; its wording is amended.** → **#211**
It survived eight red-team chains. But "presentation-only" also forbids *narrowing*, which the code already violates twice for correctness and once outright (`auth/confirm/route.ts:52` mints a `gym_membership` row from the host). Amendment: *may only narrow to a tenant the caller already holds membership for, never widen.*

**R3 — All three live read exposures get addressed**, with `gym.legal_name` / `owner_user_id` (**#213**) as this cycle's priority. → **#213**, **#214**, **#215**, **#216**

---

## The units

Each row: the **question** the unit answers (the issue body opens with it), its **type**, and what **artifact** resolving it produces.

| # | Question | Type | Artifact | Label | Blocked by |
|---|---|---|---|---|---|
| **#204** | Has a crossing already happened in production, and how often? | measure | a structured log line when host-gym ≠ membership-gym; no behaviour change | `ready-for-agent` | — |
| **#205** | What does the defect actually look like end to end? | measure | screenshots of `/inicio`, `/cuenta`, a receipt email | `hitl` | — |
| **#206** | Does the live Auth Redirect-URL allow-list contain any entry broader than one host? | measure | the verified state + a dated note in `hitl-72-resend-live.md` | `hitl` | — |
| **#207** | Is `red-2-0-admin.vercel.app` still assigned, and are previews protected? | measure | the domain removed, or accepted in writing with the reason | `hitl` | — |
| **#208** | What does an operator see when no redirect target exists (0 gyms, 2+ gyms)? | prototype | the cheapest concrete screen, reusing the `SinGimnasio` shell | `ready-for-agent` | — |
| **#209** | What does one content injection under `ibookit.lat` buy an attacker? | ruling→impl | `__Host-` cookie names, `secure`, and a first `vercel.json` for HSTS | `ready-for-agent` | — |
| **#210** | How does an operator know which host is theirs? | task | an operator-facing page, delivered to the `forge` operator | `hitl` | — |
| **#211** | Should "presentation-only" become "may only narrow, never widen"? | ruling | ADR-0008 amended (not superseded) + `CONTEXT.md:66` corrected | `ready-for-agent` | — |
| **#212** | How does admin reconcile host↔membership without making the host authoritative? | impl | the reconciliation + auto-redirect, and the first test asserting the crossing | `ready-for-agent` | **#208** |
| **#213** | Why does `authenticated` still hold SELECT on `gym.legal_name` / `owner_user_id`? | impl | one migration + a suite assertion that a membership-less identity reads 0 owner UUIDs | `ready-for-agent` | — |
| **#214** | What fails a build when a table becomes anon-readable? | impl | a derived guard in `pnpm test` + a checked-in allow-file | `ready-for-agent` | — |
| **#215** | Why can an anonymous party read every gym's catalog in one call? | impl | per-gym scoping; marketing pages still render | `ready-for-agent` | — |
| **#216** | Should the platform's customer list be public? | impl | a narrowed grant that resolves one known hostname and cannot enumerate | `ready-for-agent` | — |
| **#217** | What happens when a minted auth link has an empty `redirect_to`? | impl | fail closed instead of defaulting to RED's Site URL | `ready-for-agent` | — (informed by #206) |
| **#218** | When an operator is removed, when does their session stop working? | impl | global sign-out on role removal + a session-lifetime decision | `ready-for-agent` | — |
| **#219** | How do `mi_membresia` / `toggle_favorito_tipo` learn which gym the caller is viewing? | impl | new signatures + the first suite vector seeding a two-membership actor | `ready-for-agent` | **#211** |

---

## Order

```
#204 ─────────────────────────► measures everything below, forever
#208 ──► #212
#211 ──► #219
#205, #206, #207, #209, #210, #213, #214, #215, #216, #217, #218 ── takeable now
```

**#204 first.** Every other unit changes behaviour; #204 is the only one that tells you what the behaviour *was*. `auth.audit_log_entries` is empty, no observability package is installed, and the hostname is never persisted — so "has this already happened?" is unanswerable today and unanswerable retroactively tomorrow.

**#213 is the cheapest live exposure to close** and the owner's nominated priority for this cycle: one migration.

---

## What was dropped

Recorded so truncation never reads as coverage.

- **Two RESEARCH angles not run:** compliance frameworks (NIST SP 800-series, ISO 27017, CSA CCM, SOC 2) and the AWS Tenant Isolation Strategies PDF — judged lower yield than the vendor and standards sources actually used.
- **Three MEASURE angles unreachable from the session that charted this**, and they are units above rather than silent gaps: everything behind the Supabase and Vercel dashboards (#206, #207), and any live HTTP request or reproduction (#205).
- **No unit covers** `service_role` key custody, the `activar-cuenta` edge-function body, `cancelar_reserva` / `pasar_lista_sesion` / `toggle_pase`, or DNS/registrar posture for `ibookit.lat`. See the audit's blind-spot list; #209 turns on the last of these.
- **Audit findings with no unit, deliberately.** Caught by the `/code-review` spec axis, which flagged them as silent truncation. Named here so they are dropped on the record rather than by omission:
  - **#9 — the receipt email painted by host, named by membership.** Closed as a consequence of #212: once a Forge operator cannot render on the RED host, `resolveBrand()` and `getOperatorGym()` can no longer disagree. If #212 ships and the split persists, file it then.
  - **#12 — host-wins fails open to `?gym=` on a transient DB error.** Self-heals within one request, and both host-authoritative writers pass `null`. `unmeasured — the PostgREST error rate on the `gym_domain` lookup; #204's logging is the instrument that would size it.` Revisit after #204 has data.
  - **#13 — `gym_domain.app` never filtered in the resolver.** Deliberately unfiled: filtering it **breaks the documented RED-admin dev workflow** (`docs/prds/prd-brand-system.md:71`), because `red` has no admin `.localhost` row. Fixing this requires seeding the missing rows first, which is its own decision. Named in #212's body as a trap, not scheduled.
  - **#14 — `actualizar_paquete` demotes `popular` across every gym the caller staffs.** Dormant at 0 multi-gym staff, same trigger as #219. Fold into #219 when a multi-location owner appears.
  - **Finding 15's smaller items** — `enviar_mensaje_contacto`'s opt-in rate limit, `reservation_member_select`'s missing gym predicate, `invitacion_info` as an unauthenticated oracle, `requireOperator` not being an operator check, gym deletion freeing a hostname. All confirmed, none scheduled. The first two are the cheapest and should be the next batch after this epic closes.
