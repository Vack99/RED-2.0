# HANDOFF — Gate 0.1 execution (written 2026-08-08)

Next session executes the Gate 0.1 slices. This file carries everything that session needs; do not re-run the research or the codebase sweep.

## What the previous session produced (all committed locally on `main`, NOT pushed)

| Commit | What |
|---|---|
| `161f996` | docs batch incl. `docs/gates/gates-0-to-5` (the gate ladder) |
| `b169d50` | `docs/Context/2026-08-07-gate0-privacy-pure-online-research.md` — 12-agent verified research |
| `7aedec7` | `docs/legal/gate0-borradores/` — anexo + 2 aviso templates + brief-abogado (all "BORRADOR, pendiente de abogado") |

Research verdict in one line: the reformed LFPDPPP has **no written-encargado duty** in its text (lived in the 2011 Reglamento, survival = abogado question), Art. 16-II expressly allows the electronic simplified aviso → integral link, Art. 2-XX excludes the encargada from "transferencia" — so pure-online click-wrap + generated avisos is viable, and **no competitor offers its gyms an aviso generator** (greenfield).

## The issue set (initiative label `gate0-privacy-2026-08`)

- **#252** epic (`prd`) — holds the slice task list and done-when.
- **#253** DB spine: `acuerdo_aceptacion` evidence table + `gym_legal` satellite + `aceptar_acuerdo` RPC. **No blockers — start here.**
- **#254** admin blocking click-wrap gate (blocked by #253)
- **#255** admin CUENTA legal-identity editor + aviso preview (blocked by #253)
- **#256** client per-tenant aviso + real links from consent checkboxes (blocked by #253)
- **#257** member consent stamps carry document version (blocked by #256)
- **#258** HITL (`hitl`) — owner reviews borradores, engages abogado, rules on borrador-text rollout. Parallel; gates the epic's done-when, not the builds.

Blocking edges are native GitHub dependencies (visible in UI). After #253, #254/#255/#256 are parallelizable.

## Codebase intel (from this session's explorers — verified 2026-08-08)

**Mount point for the #254 gate:** `apps/admin/src/app/(app)/layout.tsx` — documented as "The ONE staff gate for the whole (app) group". It already swaps `children` for full-screen states by decision: `SinGimnasio` (`_components/sin-gimnasio.tsx`) and `VariosGimnasios`. Add the acceptance check there, new sibling component. Auth chain: `apps/admin/src/proxy.ts` → `lib/auth.ts` (`decideRedirect`) → `lib/tenant.ts` (`decideTenant`/`auditTenantInEffect`) → `packages/data/src/server/gym.ts` (`getOperatorGyms`, React-cached; its `OperatorGym` has no acceptance field yet).

**Schema facts (#253):** tenant table is `gym` (singular). `gym.legal_name` exists, nullable, **unused** — reuse for razón social. No domicilio/ARCO fields anywhere; `gym_contact` is the *marketing* contact satellite — do NOT conflate, create a new `gym_legal` satellite. RLS template to copy: `supabase/migrations/20260706165900_create_gym_contact.sql:41-55` (policy naming `<table>_<class>_<command>`, `(select public.is_staff_of(gym_id))` initplan idiom, explicit `enable row level security`). Membership: `gym_membership` with roles `owner|operator|member`; helpers `is_member_of` / `is_staff_of` / `has_role` — owner-gating uses `has_role(gym,'owner')`.

**Consent-stamp precedent (#257):** `clientes.terms_accepted_at` / `privacy_accepted_at` — bare `now()` timestamps written by `reclamar_o_crear_cliente` + `reclamar_por_codigo` (latest versions: `20260713190000_reclamar_tenant_binding.sql`, `20260722120000_reclamar_por_codigo_firma.sql`). Suite assertion shape to replicate: `supabase/tests/reclamar_por_codigo.sql:132,140-141`.

**Test wiring (#253/#257):** new write RPC → entry in `supabase/tests/rpc-coverage.json`; new suite file → add to `SUITE` in `supabase/tests/run-denial-suite.mjs` (drift guard fails otherwise). Suite shape: header naming vectors, `begin;` + fixture `do $$` block (all `gen_random_uuid()`, values via `set_config('t.xxx',...)`), per-vector JWT impersonation + `raise exception ... FAIL`, assert the WRITTEN rows, `rollback;`. Migration naming: `YYYYMMDDHHMMSS_snake_case.sql`, expand-only, idempotent.

**Member-facing surfaces (#256):** the hardcoded notice is `apps/client/src/app/legal/page.tsx` (says "el estudio"; its "Términos y condiciones" section STAYS — member ToS out of scope). Only link to it today: `reservar/_components/perfil-overlay.tsx` (post-login) — add a pre-login footer link. Checkbox forms: `registro/_components/registro-form.tsx:235-247` and `activar/contrasena/_components/activar-contrasena-form.tsx:130-142` — labels are deliberately plain text today; make them links + inline simplified aviso. Per-tenant render pattern to copy: `x-gym` header → `getMarketingGym(slug)` → gym-scoped anon DAL reader (`packages/data/src/server/marketing.ts`, consumed by `apps/client/src/app/contacto/page.tsx:94-97`).

**CUENTA editor pattern (#255):** `apps/admin/src/app/(app)/cuenta/` — copy the `*-sheet.tsx` + `actions.ts` pattern (e.g. `gym-content-sheet.tsx`).

**Aviso templates:** `docs/legal/gate0-borradores/aviso-privacidad-{integral,simplificado}-template.md`, merge fields `{{snake_case}}`. The anexo text for #254 is `anexo-tratamiento-datos.md`.

## House gates & traps (bite hard, all have burned us before)

- `pnpm test:denial` needs a scratch project: `SUPABASE_TARGET_REF=<scratch> SUPABASE_ACCESS_TOKEN=<pat> pnpm test:denial`. PAT + refs live at `docs/db-testing-throwaway-project/data`. Runner refuses the live ref. Green on scratch is the pre-merge gate for every migration-bearing slice.
- **Scratch-green ≠ live-current**: scratch replays migrations from scratch; live has drift history. Apply to LIVE only via MCP `apply_migration` (MCP is bound to PROD — never assume scratch). NEVER `supabase link`/`db push` to prod (56/78 filenames unrecognized → would re-apply seeds).
- Import-union trap: when editing barrel/import lists, don't resurrect deleted symbols.
- Pre-commit runs lint+typecheck+vitest (slow, ~1-2 min). Never run `husky` with an argument.
- **No push without explicit owner consent in-conversation.** Local commits + fast-forward are fine; batch everything for one consented push.
- Slices ship on a branch/worktree, then fast-forward `main` (solo workflow, no PRs).

## Decisions already made (don't re-litigate)

- Acceptance is **owner-only**; operators of an unaccepted gym are blocked with "pídele al dueño".
- Evidence row: append-only, unique `(gym, documento, version)`; hash/version/IP/user-agent computed **server-side**.
- Gyms without legal identity keep the current generic text as fallback.
- Member ToS is out of Gate 0.1 scope; only the aviso side changes in #256.
- Demo twins may accept borrador text; real-gym (forge) acceptance timing = owner call in #258.

## Owner queue (not for the agent)

- #258: borrador decisions, infra rows (Supabase region, Vercel, email provider), send brief-abogado + drafts to abogado, rollout ruling, Reglamento watch.
- Gate 0.2 (Supabase Pro + PITR + one test restore) untouched — collides with the #152 "Pro at 4th gym" ruling; owner reconciles.
- 4 local commits (`161f996` onward, this handoff commit included) await a consented push.
