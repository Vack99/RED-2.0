# HANDOFF — anexo restart (written 2026-08-10, after the forge/red-demo incident)

Owner ruling, verbatim in spirit: **the standalone anexo click-wrap should never have existed.
Mimic the competitors.** 11/11 surveyed incorporate the DPA into the ToS accepted once at signup;
none show a dedicated legal surface or block a logged-in customer. MX law's floor is ToS
incorporation (Reglamento 2011 arts. 51-52, operative under the 2025 LFPDPPP). Both researched and
sourced: `docs/Context/2026-08-10-dpa-acceptance-competitor-norms.md` +
`docs/Context/2026-08-10-dpa-legal-floor-mx.md`. This session ships the deletion and the naming
audit. Owner is angry about the last outputs — zero tolerance for agent-looking text, walls,
scroll-bibles, or "RED" appearing as the platform name on any gym.

## Mission (in order)

1. **DELETE the standalone anexo surface from the admin app.** Deployed today @ `9b5afba`: an
   owner-only banner ("Anexo de Tratamiento de Datos pendiente") + `/cuenta/anexo` screen that
   renders the RAW borrador constant — BORRADOR banner, "Notas de redacción", `{{merge}}` table,
   "Plataforma RED" — plus checkbox + ACEPTAR. All of it goes. Files: `apps/admin/src/app/(app)/layout.tsx`
   (banner), `(app)/_components/aceptar-anexo.tsx`, `(app)/cuenta/anexo/page.tsx`,
   `aceptarAnexoAction` in `(app)/actions.ts`, the demote comment in `cuenta/respaldo/route.ts`.
   Also delete `ANEXO_TRATAMIENTO_DATOS_TEXTO`/`_VERSION`/`_DOCUMENTO` from
   `packages/domain/src/legal.ts` and `tools/guards/anexo-legal-drift.test.ts` (the constant dies
   with its guard). Update every covering test. The borrador `.md` STAYS in
   `docs/legal/gate0-borradores/` — it is input for the abogado, not product content.
2. **KEEP the DB evidence spine untouched.** `acuerdo_aceptacion` + `aceptar_acuerdo` RPC +
   `supabase/tests/aceptar_acuerdo.sql` + DAL (`getAcuerdoAceptado`/`aceptarAcuerdo` in
   packages/data) stay: expand-only, harmless unused, and exactly the machinery a future signup
   checkbox stamps into. No migration this session (ponytail: delete UI, keep spine). If the DAL
   fns lose their last caller, keeping them + tests is fine — do NOT drop the suite
   (rpc-write-coverage guard requires it while the RPC exists). Forge's one live acceptance row
   (0.1-borrador, 2026-08-11 UTC) stays — historical evidence, never delete or backfill.
3. **Naming audit ("RED" as platform name).** Owner demand: nothing user-visible may name the
   platform "RED" — it collides with the red gym brand and read to a forge owner as the rival gym
   receiving his data. Platform name is **iBookit** (locked 2026-08-08; legal entity pending
   Gate 1). Sweep: `docs/legal/gate0-borradores/*` (~40+ "RED" refs in the anexo, check both aviso
   templates + brief-abogado), domain legal constants, email templates (`send-email` edge fn),
   any admin/client copy, README-class docs that leak into product. Deliverable: inventory with
   file:line + a fix commit for everything user-visible today (docs borradores can be batch-renamed
   to iBookit now — the abogado rewrites over them anyway). Audit = Explore agents; fixes = one
   implementer.
4. **Update #258's scope** (comment on the issue): abogado deliverable is now a single Términos de
   la Plataforma document with the DPA obligations INCORPORATED (iBookit-named, arts. 51-52
   content: scope, instructions, security, confidentiality, deletion-on-termination) — not a
   standalone anexo + separate acceptance. Acceptance model when real text lands: ToS link in the
   admin footer + continued-use clause; a one-time dismissible "términos actualizados" banner at
   most; a signup checkbox wired to `aceptar_acuerdo` only when self-serve gym onboarding exists
   (today gyms are provisioned manually by the owner — there is no gym signup surface, which is
   how the wall got invented; do not reinvent it).

## Scope guards

- Member-facing aviso surfaces (#256: /legal, inline simplificado, consent checkboxes) are NOT in
  scope — public-by-law content, matches the norm, owner has not objected. Touch nothing there
  except items the naming audit flags.
- Consent-stamp semantics stay settled (version only when rendered-complete; nulls never
  backfilled).
- No DB changes. No denial run needed unless a migration appears (it should not).

## Process (owner restated + new standing rule)

- Orchestration scope: controller coordinates only; subagent per unit; briefs/reports as files;
  ONE implementer at a time, foreground (SendMessage resumes die on app restarts — fresh
  dispatches only). Models: sonnet build/verify, opus review. `/ponytail` `/keep-it-lean`
  `/caveman` active.
- **New rule (memory `ship-consent-blast-radius`, born from this incident): before any ship
  consent, state in one line what USERS see change at next login. Any user-facing surface with
  legal text or a modal/wall gets a competitor-norm check BEFORE tickets. Borrador text never
  fronts customers.** The owner said: "for once in this scope, think what you do." Honor it —
  question the need before building the thing.
- Deletion-heavy session: prefer removing over reshaping. Review the deletion diff like any other
  (opus), but do not manufacture structure.

## State pointers

- main = origin/main = `9b5afba` (demote + research docs + post-gate0 handoff). Live DB has the 4
  gate0 migrations; scratch `gyyujeguycxxoaqgdnjp` current; denial 47/47 at last run.
- Open queue after this restart: #258 (rescoped), #262 gym_contact editor, #263 /legal headings,
  Mon cron check, member-removal ruling #221/#251.
