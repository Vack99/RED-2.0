# T1 — Catalogue of the shipped Foundation (Phases 1–7)

> **Wayfinder asset** · resolves [T1 · Catalogue the shipped Foundation](https://github.com/Vack99/RED-2.0/issues/106) (#106) on map [#105](https://github.com/Vack99/RED-2.0/issues/105) · 2026-07-14
>
> **What this is:** an honest, proof-backed inventory of RED 2.0's already-earned **🏗️ Foundation** world — the completed quests behind the roadmap's Phases 1–7 — plus the **natural schema shape** this inventory reveals (the deliverable that feeds [T2](https://github.com/Vack99/RED-2.0/issues/107), the schema-design ticket).
>
> **Capture, don't resolve.** Nothing here decides strategy. Where shipped work already fills a quest in an *ahead* world (2–7), it's flagged so T3/T4 mark it **earned**, not todo.

---

## Honest status in one line

**Phases 1–6 are shipped, merged, and live-verified.** The roadmap's **Phase 7 ("harden & launch") was never run as one discrete phase** — it's realized in practice by four post-Phase-6 efforts (member-registration completion, RPC/denial hardening, forge branding, respaldo/scaling, receipts). Most of Phase 7's intent shipped; a small **launch-hardening remainder** (observability, support-contact channel, BYO-domain onboarding queue, one open HITL walk) is *not* built — and much of that remainder actually belongs to ahead worlds 4/6, not to Foundation debt.

Source basis: `docs/archived-files/2026-06-29-multi-gym-platform-roadmap.md`, the auto-memory index (`memory/`), and GitHub issue state (`gh`, current as of 2026-07-14). Issue open/closed state is the ground truth used to reconcile the memory narratives.

---

## Phase 0 — Decide & record (the ADR spine)

Not a quest group with code, but the earned decisions everything rests on. Roadmap Phase 0 → **ADR-0008** (platform: shared-DB gym-tenant RLS + 2 multi-tenant deploys + brand modules), **ADR-0009** (member auth + member/CRM unification), **ADR-0010** (class-scheduling model). Later ADRs referenced below: **0011** (JIT packages / cross-package boundary), **0012** (host→brand resolution), **0013** (membership helpers — *note: its O(1)-per-statement RLS claim is false, see open threads*), **0014** (auth mail), **0015** (invite-token claim), amendments to **0003/0005/0006**.

---

## The Foundation catalogue

Each phase: a status, a proof line (label + epic/PRD + issue range), then completed quests grouped as they naturally fell out. **Proof** cites the load-bearing GitHub issue(s) — the engineering-derivable evidence — plus key migrations/commits/docs where they add signal.

### 🧱 Phase 1 — Monorepo refactor (behaviour-preserving) · `shipped`
`label monorepo-phase1-2026-06` · epic **#1** · slices **#2–#8** + HITL exit **#9** (closed) · audit-hardening commits `9e1eed6`/`bc1c8d5`

| Subgroup | Quest | What shipped | Proof |
|---|---|---|---|
| Workspace | Turborepo + pnpm workspace scaffold | Root Turborepo/pnpm workspace + catalog + base configs for the apps/packages layout | #2 |
| Shared core (`@gym/*`) | `@gym/domain` | Pure business rules + types, brand-neutral leaf | #3 |
| | `@gym/format` | es-MX / Chihuahua-tz formatters, pure leaf | #4 |
| | `@gym/data` | Server-only DAL; `./server`÷`./client`÷types exports; server-only poison-pill preserved | #5 |
| | `@gym/ui` | Brand-neutral UI kit extracted from the Forge app (nav-as-props TabBar) | #6 |
| App + boundary | Relocate app → `apps/admin` | App moved; `proxy.ts` auth gate unchanged; transpilePackages + Tailwind v4 `@source` wired | #7 |
| | Cross-package boundary cutover | `.dependency-cruiser.cjs` enforces pure/server ✗→ UI/app; `@/*` alias deleted; forbidden edges proven rejected | #8, ADR-0011 |
| | Deploy-verify (HITL) | Human confirmed Forge admin deploys identically from `apps/admin` | #9 (closed) |
| Hardening audit | Doc-drift repair | Rewrote ARCHITECTURE/CONTEXT/AGENTS/README off the deleted `src/` layout | `9e1eed6`, `docs/superpowers/audits/2026-06-30-monorepo-conversion-audit.md` |
| | `@gym/data` export narrowing + 3 machine guards | Explicit server export allow-list; server-only-coverage test; depcruise npm-boundary rule; ESLint client→server seam rule; shared-deps catalog + typedRoutes | `bc1c8d5`, `tools/guards/` |

### 🌐 Phase 2 — Multi-tenant tracer (the de-risker) · `shipped`
`label platform-phase2-tracer-2026-07` · epic **#10** · slices **#11–#15** + HITL exit **#16** (closed)

| Subgroup | Quest | What shipped | Proof |
|---|---|---|---|
| Design | ADR-0012 host→brand seam | Pure `resolveBrandId(host, override)`, host-wins precedence, SSR dark-safe `<style>` tokens (no FOUC), `*.localhost` local testing | ADR-0012, `c6e73e1` |
| | `@gym/brand` shared by both apps | Owner-approved pivot: Forge moved out of `apps/admin` into brand-neutral `@gym/brand`; per-deploy diff is host-map **data** only | ADR-0012, #10 |
| Mechanism (AFK chain) | `@gym/brand` scaffold + Forge relocation | Package created; Forge tokens/logo relocated | #11 |
| | `resolveBrandId` pure resolver | Host-wins resolver (TDD) | #12 |
| | `apps/client` skeleton + host→brand proof | New client app; SSR no-FOUC; **0 B** per-brand JS delta | #13 |
| | `apps/admin` symmetric adoption | Admin adopts the same seam (behaviour-preserving) | #14 |
| | Docs/shields refresh | Docs + CI shields updated to the new architecture | #15 |
| Live deploy (HITL) | 2-Vercel-project deploy-verify | 2 projects on `main`; **one** client deploy serves forge+red by host; curl+browser verified; host-wins + shared-Supabase confirmed | #16, host-map `2158646` |

### 🔐 Phase 3 — Tenant/identity foundation (gym-scoped RLS) · `shipped-with-open-threads`
`label platform-phase3-rls-2026-07` · PRD **#17** · slices **#18–#26** + HITL **#27** (SMTP, closed) + HITL **#28** (terminal cutover, closed)

| Subgroup | Quest | What shipped | Proof |
|---|---|---|---|
| Tenant spine | `gym` + `gym_domain` | Tables + forge/red seeds + anon-read policies (pre-auth host lookup) | #18 |
| | `gym_membership` + role model | `(user, gym, role)` table + ADR-0013 helpers + owner backfill | #19 |
| | `gym_id` expansion + member-evolution | `gym_id` across 7 tenant tables; `clientes` evolved additively (nullable `auth_user_id`, member fields) | #20 |
| | Per-gym timezone | tz column + per-call tz threaded through `@gym/format` (21 sites) | #25 |
| Resolver + RLS | `resolveTenant` host resolver | `host → x-gym/x-brand`; legacy `HOST_TO_BRAND` stub deleted | #22 |
| | Gym-scoped RLS policies | 22 gym-scoped + role policies (denial-test-first); `cobro` owner-only | #23 |
| | Mechanized cross-gym denial suite | Self-asserting SQL harness proving cross-tenant read/write denial | #21 |
| | C1 cross-tenant write hardening | Killed hardcoded `slug='forge'` in `registrar_venta`/plantillas via `staff_gym()` definer helper | `70a7f67` |
| Money-path rekey + self-serve | Per-gym folio + `registrar_venta` rewiring | Per-gym sale-folio sequence; 4 `user_id` re-keys to gym-scoped identity | #24 |
| | Member self-register + email-verified claim | Registration + atomic definer claim-by-verified-email RPC (phone never claims) | #26 |
| Live cutover | Terminal RLS cutover | Dropped 21 per-`auth.uid()` policies + 7 `user_id` columns **live, zero data loss**; tested rollback | #28, `docs/runbooks/hitl-28-evidence.md`, main `0442528` |
| | forge-demo split | Dev/test data moved off the real client's gym onto a twin gym, zero deletions | `demo-gym-testing-model.md` |
| | Scratch-project denial pattern | Replaced Pro-gated branching with a throwaway free-tier scratch project + `SUPABASE_TARGET_REF` | AGENTS.md |

### 🎨 Phase 4 — Brand system · `shipped`
`label platform-phase4-brand-2026-07` · PRD **#29** · slices **#30–#34** + HITL **#35** (closed) · merged main `a425dd0` (fix `3208322`)

| Subgroup | Quest | What shipped | Proof |
|---|---|---|---|
| Token/motion foundation | Structured brand tokens + serializer | Brand-keyed CSS-var token sets + serializer → `brandCss` | #30 |
| | Product-motion sheet + reduced-motion | Per-brand motion sheet honoring `prefers-reduced-motion` (real-device verified) | #31 |
| Brand-specific modules | Login animation modules | Per-brand login modules, module-optional contract; fixed RED formless-hero form-drop | #32 |
| | Admin shell de-brand | Removed hardcoded brand from the admin shell; composes from brand data | #33 |
| Base + override (brand-is-DATA) | Token-override zod schema + base module + `DEFAULT_BRAND='base'` | zod whitelist guarding the token sink; `base⊕overrides` merge; fixture exit demo; census base/forge/red; **0 B** delta | #34 |
| Sign-off | HITL fidelity sign-off + RED-admin go-live | 5 HITL criteria met; curl-verified all 4 prod hosts SSR-inline correct tokens, no FOUC | #35 (closed 2026-07-10) |

### 🗓️ Phase 5 — Admin reframe + Agenda · `shipped`
`label platform-phase5-agenda-2026-07` · PRD **#36** · slices **#37–#46** + HITL exit **#47** (passed) · merged main `b06e61a`

| Subgroup | Quest | What shipped | Proof |
|---|---|---|---|
| Data spine | Catalog schema spine | `class_type`, `coach` (+multi-coach join), `room`, branded ids, RLS denial-first | #37 |
| | Scheduling schema | `class_session` (absolute `starts_at`) + coach join + `schedule_template`; atomic+idempotent RPCs; append-only week ledger | #42 |
| | Plan/paquetes evolution | `paquetes` expanded in place (binding column map) + `plan_feature` child + cuenta editor | #38 |
| | Gym-content schema + authoring | `about_value`/`facility`/`stat`/`faq` tables + authoring UI (16 RLS policies live) | #39 |
| Domain + Agenda UI | Pure domain rules + agenda formatting | Scheduling/occupancy/estado-sesión rules + tz formatting in `@gym/domain` | #40 |
| | Agenda UI primitives | Day-grouped session list, wheel picker, date strip, editor sheet | #41 |
| | Agenda DAL | Day/week readers (ensure-materialized) | #44 |
| | Agenda page + nav restructure | Full Agenda page; AGENDA promoted to the vender tab; vender relocated to cliente-ficha | #46 |
| Authoring + env | Coach + class-type authoring | Operator CRUD under cuenta | #43 |
| | red-demo gym twin seed | Twin gym seeded live as the per-brand dev sandbox | #45 |
| Exit | HITL exit gate | Owner walked + PASSED (visual sign-off + live forge smoke + red-demo isolation) | #47, `docs/runbooks/red-demo-seed-evidence.md` |

### 📱 Phase 6 — Client app build (RED) · `shipped` (required a remediation + re-walk)
`label platform-phase6-client-2026-07` · PRD **#49** (closed) · slices **#50–#62** + HITL exit **#63** (closed) · main `9693a21`

| Subgroup | Quest | What shipped | Proof |
|---|---|---|---|
| Anon marketing | Precios (anon catalog) | Public pricing/catalog reading `paquetes`, no auth | #50 |
| | Comercial landing | Brand-tokenized landing + hero/tagline | #51 |
| | Nosotros | About page reading `gym.about_*` | #52 |
| | Contacto + `contact_message` | Contact form → new table via anon-intake RPC `enviar_mensaje_contacto` | #53 |
| Auth & onboarding | Entrar + restablecer | Login + password-reset | #54 |
| | Registro (self-registration) | Registration wired to `reclamar_o_crear_cliente` (email-claim; atomic clientes+membership) | #55 |
| | Cloudflare Turnstile anti-bot | Server-verified Turnstile on `/registro` + `/contacto` | `phase6-client-execution-progress.md` |
| Booking core | Reservar (read-only week) | Weekly class browse | #56 |
| | Booking core (`reservation` + `reservar_clase`) | New table + definer RPC consuming `clases_restantes` (Ilimitado exempt); free-booking RLS hole caught+fixed | #57 |
| | Mis reservas + `cancelar_reserva` | Own-reservations list + cancel (refunds the consumed class) | #58 |
| | Clase detail (confirmada + favorita) | Detail screen, confirmation flow, favorita | #59 |
| | Pasar lista, reservation-aware | Roster rewritten reservation-aware; fixed refund-without-revert seam bug | #60 |
| | `esClienteDelGym` reserve gate | Booking CTAs check membership before RPC (graceful "need a membership") | `phase6-client-execution-progress.md` |
| Membership & profile | Membresía plan card + change-plan | Plan card + confirm-sheet ("paga en tu gym", zero client entitlement writes); scalar `mi_membresia()` definer RPC | #61 |
| | Perfil hub | Consolidated profile overlay (reservas/plan/cuenta modes) | #62 |
| Design remediation (post-#63-fail) | Dark activation + RED exact-mock tokens | `defaultScheme:'dark'` + `.dark` on `<html>`; 30-key brand contract; curl-verified | main `9693a21` |
| | Self-hosted fonts · neon-ring logo · ~12 animations | Outfit/JetBrains via `next/font`; `RedRingMark` RSC; brand-scoped keyframes across all 12 screens | `9693a21` |
| | Auth/session fixes · all 12 screens to mock fidelity | Post-confirm redirect, distinct `email_not_confirmed`, SSR session refresh; token-only exact-mock parity | `9693a21` (4-dim adversarial review) |
| | red-demo content seed · admin lockout fix | Seeded red-demo about/nota/workblock; admin resolves `getOperatorGym` gracefully | migration `20260706230000` |
| Exit | HITL exit gate | Full member-journey walkthrough passed on re-walk after remediation | #63 (closed) |

### 🛡️ Phase 7a — Member-registration completion + auth/RPC hardening · `shipped-with-open-threads`
*(realizes part of roadmap Phase 7 "harden & launch")* · `label member-reg-invite-2026-07` · spec **#64** (closed) · issues **#65–#82**, **#48** · merged + live 2026-07-06 → 07-10

| Subgroup | Quest | What shipped | Proof |
|---|---|---|---|
| Invite/claim rail (ADR-0015) | Claim-by-code rail | `código de invitación` + `reclamar_por_codigo`; refuses codes on claimed rows | #65 |
| | Invite email auto-send on sale | Fires off an admin sale via Resend | #68 |
| | Email backfill + REENVIAR | Admin backfills a missing email + resends | #71 |
| | Staff visibility | Invite badges + NUEVO duplicate warning | #69 |
| | Client claim robustness · cross-tenant shields · residue cleanup | Edge-case hardening; cross-gym claim guards; dropped orphaned `set_notificaciones` | #66, #70, #67 |
| | Ilimitado free-booking hole closed | Create path stamps `clases_restantes=0` not NULL | migration `20260707030000`-series |
| | `registrar_venta` email capture | Nullable `p_email` (12-arg) so Door-1 sales write the join key | migration `20260707031000` |
| | ibookit.lat host map | Per-gym client/admin subdomains + fallback so invite links resolve | migration `20260709090000` |
| | Two-doors exit-gate walk | 5 claim/renewal journeys machine-verified live | #73 (closes #64) |
| | `reclamar_o_crear_cliente` email-drop fix | Create path writes the verified email instead of dropping it | #78, migration `20260710030000` |
| Gym-branded auth mail | Resend SMTP + DNS | Custom SMTP live; SPF/DKIM/DMARC pass; 50/hr limit | #72 (+#27) |
| | Send Email Hook | Edge fn renders ALL auth mail per-gym (link on gym host, per-gym From) | #75 (v5 live) |
| Admin desk flow | `esPrimeraCompra` + deep link | First-purchase from zero-ventas; `/vender?cliente=` lands on EXISTENTE not blank NUEVO | #76, #77, #79, #48 (main `1eef046`) |
| | Email visible in read mode | Ficha renders member email in read mode | #79 |
| Renewal-flow correctness | RENOVAR identity fix | Passes client identity into `/vender` → EXISTENTE, kills duplicate-producing blank form | `renewal-duplicate-rootcause.md` |
| | `registrar_venta` re-deriving + idempotent | Takes `paquete_id`, re-derives money server-side, `FOR UPDATE`, idempotency key, dup guard | 4 migrations, live 2026-07-10 |
| | Flat-30 monthly stacking + purchase-wins + vence-day-valid | Correct expiry math unified across all 4 surfaces | `renewal-flow-execution.md`, ADR-0003/0005 amended |
| | Unique email index + duplicate merge | Partial unique `(gym_id, lower(email))`; live dup pairs merged via runbook | `renewal-flow-execution.md` |
| | `pasar_lista`/`toggle_pase` double-consume fixes | Gauge anchored at venta instant; unified pase surfaces; walk-in no-reconsume | migration `20260710132000`, #82 |
| | Venta personalizada | PERSONALIZADO custom-package sale; `registrar_venta` v3 shared derivation, no paquetes row | `venta-personalizada-worktree.md`, main `724dc49` |
| RPC/denial hardening | `getSaldoMiembro`/`fetchFavoritoId` host-reconcile | Identity reads gym-scoped via `resolverMiembroGym` | #74 |
| | RPC write-coverage + drift guards | Derives 25 writer RPCs from migration replay; fails a new uncovered writer; catches orphaned suites | #80 (main `81454b3`→`c11aa14`) |
| | Quarantined suites rewritten | 3 suites rewritten to assert written rows per-gym; QUARANTINE emptied | #81 |
| | Scratch-project denial gate proven | `pnpm test:denial` green on scratch projects (32/32 → 36/36 as suites were added) | post-#80 audit, `fastfollow-81-82` |

### 🧰 Phase 7b — Scaling/backup + branding polish + receipts · `shipped-with-open-threads`
*(realizes the rest of Phase 7 + brand/polish)* · `label forge-client-branding-2026-07` PRD **#83** *(open)* · issues **#84–#88**, **#90–#95**, **#96–#103**

| Subgroup | Quest | What shipped | Proof |
|---|---|---|---|
| Forge branding + seed (PRD #83) | Forge dark scheme + brand-scoped glow | `defaultScheme:"dark"`; `data-brand` seam; 26 RED glow selectors re-scoped so RED stays byte-identical | #84 |
| | F-mark ignition + tagline | Shared `ForgeIgnitionMark` (login+landing), leaf `mark-geometry.ts`, "Aquí se forja tu mejor versión", 0 B delta | #85 |
| | Real Forge program seed | Program/CLASE INDIVIDUAL/contact/marketing copy live; decoupled 7 denial suites from the forge gym | #86, migration `20260710140000` |
| | Forge-demo mirror | 3 demo coaches; sandbox templates retired non-destructively; dev host wired to prod client row | #87, migration `20260710150000` |
| Multi-tenant scaling + tenant-scope | Multi-tenant scale audit (all-Mexico/10k) | 43-agent audit: host→brand scales to 10k; gym-count/geography (not member count) is the axis | `docs/superpowers/audits/2026-07-01-multitenant-branding-scale-audit.md`, main `237f364` |
| | Vercel domain scale verdict | Deep-research (21 sources): one-deploy host→brand scales to 5–10k gym domains on Pro/Enterprise | `vercel-domain-scale-verdict.md` |
| | Timezone two-pass `instanteEnZona` | Fixed Tijuana/Juárez DST in date-time conversion | #91 (main `393c394`) |
| | Tenant scope + scaling wall + ADR-0013 correction | `.eq(gym_id)` on staff reads (closed a cross-tenant leak); deterministic `getOperatorGym`; new indexes; ADR-0013 false-claim corrected | #92 |
| | Membership + anon surface hardening | `reclamar_o_crear_cliente` bound to tenant via Vault HMAC (`tenant_assertion_key`); anon GRANTs; `staff_gym` ORDER BY | #93 |
| | Month-scoped respaldo export | `?mes=`, 5-sheet workbook, `calcularCorteMes`, picker, 24-month cap (replaces unbounded export that OOM'd); ADR-0006 amended | #94 |
| | Pre-merge `test:denial` gate convention | Documented: green scratch-project denial run before any migration-bearing FF to main | #95 |
| Recibo (sale receipt) | Spec + de-Forge identity | Cycle spec; receipt identity from `gym.brand_name` via `resolverIdentidad`; 3 perfil reads gym-scoped | #96, #97 (migration `20260714050603`) |
| | Remove ATIENDE·COACH row | Dropped coach-attendance row (reversibly) | #98 |
| | Auto-email HTML ticket · PNG attach · manual resend | Ticket-twin HTML auto-sent on sale; `next/og` PNG twin attached; staff resend re-resolving negocio from caller gym | #99, #100, #101 |
| | De-inline colors → `--recibo-*` · RED re-skin | CSS custom properties; RED recibo Vino `#7e0d10` (owner-picked), `[data-brand=red]` cascade win; Forge invariance curl-verified | #102, #103 (main `dcfd9b3`) |

> **Note:** respaldo/scaling (#90–#95) is **shipped + live-applied** — main `c48644b`, vault key seeded, 4 migrations applied, brand hosts 200, scratch denial 36/36 green (`respaldo-mensual-planned.md`). *(An earlier branch state `a23f075` was file-only; the effort has since fast-forwarded and applied.)*

---

## Honest open threads (not yet earned)

The Foundation is ~95% earned. What remains, kept visible so the tracker never over-claims "done":

**Open GitHub issues (Foundation-adjacent):**
- **#88** — Forge branding HITL exit gate (Vercel forge-demo domain attach + member walkthrough) — *pending owner walk; PRD **#83** stays open until it closes.*
- **#89** — Attendance ledger: two-same-day-class mark-present entitlement — *needs an owner ruling before build.*
- **#104** — Recibo PNG attachment nulls under the real Next runtime (works unbundled) — *known bug, repro harness in #100's closing comment.*

**In-flight (worktrees started, loops not yet run — NOT shipped):**
- **coverage-100** — v8 coverage gate wired (branch `worktree-coverage-100` @ `a654b7a`); baseline 77.2% lines / 68.23% branches; loop not yet run.
- **perf-50ms** — perf harness + live baseline done (0/9, ~200 ms floor from uncached `resolveTenant` double query); loop pending local-Supabase seeding.

**Roadmap Phase-7 exit criteria that were never built** *(some belong to ahead worlds, not Foundation debt):*
- Error-tracking / observability / RPC-failure alerts — *→ maps to World 4 (Growth & Reach).*
- Per-gym support-contact channel — *→ maps to World 6 (Customer & Support).*
- Rate-limited BYO-domain onboarding queue (the one real remaining scaling-eng piece per the Vercel research; Vercel's own docs contradict on the throughput limit, 100/hr vs ~100/min — unverified) — *→ World 4.*

**Known-false / owner-pending doc state:**
- **ADR-0013 §2/§3** claim the gym-scoped RLS helper is O(1)-per-statement and forbid changing it — **false** (correlated SubPlan, per-row). The `.eq(gym_id)` fix shipped in #92, but *promoting/ADR-locking the predicate rewrite* is an owner-pending decision. Reviewers must not trust ADR-0013 here.
- **Migration version drift** — prod `schema_migrations` doesn't recognize 56 of 78 local filenames; `supabase link`/`db push` against prod is permanently unsafe (ops constraint, not a fix-it).
- Minor: `#82.4` message→error rename deferred (travels with next touch); root tsconfig `typedRoutes` client-route asymmetry; `#48`-adjacent legacy `cuenta_activa`/null-email rows need a backfill decision; orphaned test auth users pending destructive-delete confirmation; Forge `/nosotros` placeholder stats need owner correction.

---

## Ahead-world bleed — shipped work that already fills worlds 2–7

**This is a direct gift to T3/T4.** These quests shipped inside Foundation-labeled phases but their *capability* belongs to an ahead world. When T3/T4 decompose those worlds, mark these **earned**, not todo — and do not re-file them.

| Shipped quest | Ahead world | Why it belongs there |
|---|---|---|
| Member self-registration (registro #55, claim rail #65–#71/#73/#78, Turnstile, email-verified claim #26) | **2 · Sellable Product** | "Member self-registration completion" is named World-2 scope; it already shipped. |
| Contacto + `contact_message` intake (#53) | **6 · Customer & Support** | A working contact-intake channel = World-6 "contact channels." |
| Membership plan-change UI, "paga en tu gym" (#61) | **3 · Monetization** *(seam only)* | The plan-selection UI surface is built; the Stripe mechanism behind it is deliberately deferred — a clean seam World 3 plugs into. |
| Member-registration **payment strategy** (BYO-Stripe, no-cut, Phase-1 no-Stripe) | **3 · Monetization** | Strategy locked; the monetization *mechanism* (Stripe subs/Connect) is still ahead. |
| Multi-tenant scale audit + Vercel domain verdict + `.eq(gym_id)`/indexes (#92) + month-scoped export (#94) | **4 · Growth & Reach** | Scaling/performance headroom earned ahead of need. |
| RPC denial-test harness + scratch-project gate (#80/#81) | **4 · Growth & Reach** | Reliability safety-net that scales with write-RPC count. |
| RED brand identity — neon ring, exact-hex tokens, animations, marketing copy (Phase-6 remediation); Forge F-mark/tagline/seed (#85/#86); recibo re-skin (#97/#103) | **5 · Go-To-Market** | Brand identity, positioning, and marketing content = GTM collateral. |
| Gym-branded auth mail (Send Email Hook #75, per-gym host links) | **5/6** | Per-gym transactional-mail branding is a GTM-adjacent contact channel. |
| Custom SMTP / Resend delivery infra (#27/#72) | **6 · Customer & Support** | Outbound member-comms delivery infrastructure. |

---

## The natural schema shape (deliverable for T2)

Every reader independently reported the fields its quests *carried*. The union below is what the scope-model schema must hold — and, more importantly, the **structural revelations** the real data forces. **This is T1's core answer for T2; do not re-derive it, design against it.**

### Fields a quest naturally carries
- **`id` / `slug`** — stable handle.
- **`title`** — short quest name.
- **`what`** — one-line what-shipped / what-it-is.
- **`world`** (pillar) + **`subgroup`** — grouping showed up as **two levels** in every phase (world → subgroup → quest), not one.
- **`status`** — see revelation 2; not a boolean.
- **`derivation`** — `engineering` (auto: GitHub closed/total) **or** `business` (hand-set). Confirmed by real data — validates the map's hybrid-derivation decision.
- **`github`** — for engineering quests: issue #(s), label, and/or range (the bar's source).
- **`proof` / `evidence`** — heterogeneous free field: issue #, migration id, commit sha, branch, ADR ref, runbook/audit path, memory file. (See revelation 4.)
- **`depends_on`** — quest→quest edges, including cross-pillar (e.g. Stripe seam ⟶ payment-strategy decision; stacked-branch order was the recurring shape).
- **`owner_action`** — HITL gate pending / owner ruling pending (distinct from engineering status).
- **`dates`** — shipped / live-verified (distinct from merged/closed).

### Structural revelations (the load-bearing findings)
1. **Quests nest two levels deep** — world → subgroup → quest. A flat list loses the natural grain.
2. **Status is a ~6-value enum, not done/todo** — the real data needs: `shipped`, `shipped-with-open-threads`, `in-flight`, `deferred`, `needs-decision` (the map's own term), `open/todo`, and `blocked`. A binary check-off would lie about most of the arc.
3. **Two derivation sources are real, as designed** — engineering leaves derive from GitHub (closed/total → a free progress bar); business/owner leaves are hand-set. The schema must tag which, per quest.
4. **Evidence is heterogeneous** — a single `github:` link is insufficient. Real proof spans issues, migrations, commits, branches, ADRs, runbooks, audit docs, and memory files. Model `evidence` as a list of typed references, not one URL.
5. **Open threads / caveats are first-class** — nearly every shipped phase carries deferred, parked, or *known-false* threads. A quest (and a world) must be able to attach caveats, or the tracker over-claims "done."
6. **Ahead-world bleed must be representable** — a quest can live in an ahead world with `status: shipped` ("earned ahead"). The schema must allow shipped quests outside Foundation, so T3/T4 don't double-count or mislabel earned work as todo.
7. **HITL exit gates are a distinct quest kind** — #9/#16/#28/#35/#47/#63/#88 close GitHub issues but their status is *owner-set* (a walkthrough), not derived from child closure. Model gate-quests explicitly (or a `kind: gate` + `owner_action`).

---

## Coverage cross-check (completeness proof)

Every closed issue **#1–#103** is accounted for above; open Foundation-adjacent issues are in Open Threads.

| Range | Bucket | State |
|---|---|---|
| #1–#9 | Phase 1 (epic #1, slices #2–#8, HITL #9) | all closed |
| #10–#16 | Phase 2 (epic #10, slices #11–#15, HITL #16) | all closed |
| #17–#28 | Phase 3 (PRD #17, slices #18–#26, HITL #27/#28) | all closed |
| #29–#35 | Phase 4 (PRD #29, slices #30–#34, HITL #35) | all closed |
| #36–#47 | Phase 5 (PRD #36, slices #37–#46, HITL #47) | all closed |
| #48 | vender phone-validation delta | closed (fixed in 7a admin-desk pass) |
| #49–#63 | Phase 6 (PRD #49, slices #50–#62, HITL #63) | all closed |
| #64–#82 | Phase 7a member-reg + RPC hardening | all closed |
| #83–#88 | Phase 7b forge branding | #84–#87 closed; **#83, #88 open** |
| #89 | attendance ledger | **open** (owner ruling) |
| #90–#95 | Phase 7b respaldo/scaling | all closed (live-applied) |
| #96–#103 | Phase 7b recibo | all closed |
| #104 | recibo PNG runtime bug | **open** |

*(Issues #105–#111 are this wayfinder effort itself — the map and its tickets — not Foundation.)*
