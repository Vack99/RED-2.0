# legal:mx — LFPDPPP compliance audit of RED 2.0 (Mexico, primary market)

Date of research: 2026-07-28. All web sources fetched/searched on this date; see inline URLs.
DB facts queried live against prod (hjppxawglmukfvsgmcog), read-only, same date.

## 0. Confirming the current state of the law (do not use pre-2025 memory)

- **New law is in force.** The Ley Federal de Protección de Datos Personales en Posesión de los
  Particulares (LFPDPPP) was republished in the DOF on **20 March 2025**, effective **21 March 2025**,
  repealing the 2010 law. Primary text: `https://www.diputados.gob.mx/LeyesBiblio/ref/lfpdppp/LFPDPPP_orig_20mar25.pdf`
  (fetched 2026-07-28 — PDF is a scanned/FlateDecode stream my tooling could not render to text;
  `pdftoppm`/poppler-utils unavailable in this environment, so article-level quotes below are drawn
  from law-firm secondary sources that cite article numbers, not from the DOF text itself. Flagging
  this explicitly per the "no claim without evidence" rule — treat article numbers below as
  **secondary-sourced, not primary-verified**).
  Secondary confirmation: Basham (`https://basham.com.mx/en/nueva-ley-federal-de-proteccion-de-datos-personales-en-posesion-de-los-particulares-publicada-en-el-diario-oficial-de-la-federacion/`, fetched 2026-07-28).
- **INAI is gone.** INAI formally disappeared 9 May 2025; its data-protection functions (private-sector
  side) transferred to the **Secretaría Anticorrupción y Buen Gobierno** (SABG), per Art. 37 of the Ley
  Orgánica de la Administración Pública Federal. Source: Infobae `https://www.infobae.com/mexico/2025/05/10/inai-desaparece-secretaria-anticorrupcion-y-buen-gobierno-asume-funciones/`
  and gob.mx `https://www.gob.mx/buengobierno/prensa/la-secretaria-anticorrupcion-y-buen-gobierno-reafirma-su-compromiso-con-la-transparencia-y-la-proteccion-de-datos-personales`
  (both searched 2026-07-28). **The session brief's mention of this transfer is CURRENT, not stale.**
  Any RED document, contract, or in-app text that still names INAI as the enforcement authority is wrong
  today — I found none in-repo (grepped for "INAI" repo-wide, 0 hits in product code, only in this
  session's own audit docs).
- **Implementing regulations (reglamento) are NOT yet published.** Multiple 2025 sources (IDC, Sharkit,
  AE Abogados — searched 2026-07-28) note the law gave the Executive **90 days** to issue amended
  regulations and that, as of their publication dates, the reglamento was still pending. This matters
  directly for two of RED's obligations below (breach-notification mechanics, ARCO request forms):
  the *duty* exists in the statute now; the *procedural detail* (how to file with SABG, exact breach
  report format) is administratively unsettled. Do not treat "no reglamento yet" as "no obligation yet."

## 1. Aviso de privacidad

**Legal requirement (secondary sources, Art. 15 per IDC `https://idconline.mx/corporativo/2025/03/31/ajustes-en-el-aviso-de-privacidad-con-la-ley-de-proteccion-de-datos` and AE Abogados `https://aeabogados.com/proteccion-datos-personales-mexico-lfpdppp/`, searched 2026-07-28):**
the notice must state, at minimum: **(a) the identity and address of the responsable**, (b) what data
categories are processed (flagging which are sensitive), (c) the purposes, **distinguishing which
purposes require consent from which don't**, and (d) the means to limit use/disclosure. The 2025 law
*dropped* the requirement to disclose third-party transfers inside the notice text itself (that detail
moved to pending regulations), but if a transfer to third parties does happen, Art. 35 requires an
accept/reject clause in the notice (AE Abogados, same URL).

**Who must publish it — RED or the gym?** The gym is the **responsable** (it determines the purposes
and means of processing its members' data: who to admit, what to charge, when to lock them out). RED
is the **encargado** (it processes on the gym's instructions, per the contract that, per §6 below,
doesn't exist). Under LFPDPPP the *responsable* is who must publish the aviso — so architecturally,
RED shipping *a* notice is correct; it should not need its own separate notice for gym-member data
(it does still need one for RED's own direct data, e.g. gym owner accounts on the admin app — not
audited here, out of scope for member-facing legal:mx).

**What RED actually ships — verified defect.** `apps/client/src/app/legal/page.tsx` (read in full,
lines 67-83) renders a **single hardcoded, brand-neutral aviso de privacidad** identical across every
tenant: `"El estudio es responsable del tratamiento de tus datos personales."` — no gym legal name, no
address, no RFC, no contact channel other than a generic pointer to "la sección Ayuda y contacto." The
component takes no props and calls no data-fetching function; it does not read `resolveBrand()` (used
elsewhere in this same app, e.g. `apps/client/src/app/registro/page.tsx:32`) nor
`gym_contact` (table exists — `supabase/migrations/20260706165900_create_gym_contact.sql`, columns
`address_line`, `address_note`, `email`, `whatsapp`, verified live via
`select gym_id, address_line, address_note, email from public.gym_contact` — data that IS captured
per-gym for the marketing Contacto page but is never wired into the legal page).

**Verdict: the aviso de privacidad, as shipped, fails Art. 15's first requirement — it never names the
identity or address of the responsable, for any of the 4 live tenants.** It is legally a template, not
a notice. This is a one-file, low-effort fix (interpolate `gym_contact` + the gym's legal name into the
existing static text) but it is unfixed today.

**Secondary gap — the marketing contact form.** `apps/client/src/app/contacto/_components/contacto-form.tsx`
(read in full) collects `nombre`, `correo`, `mensaje` from an anonymous visitor with Turnstile
anti-bot but **no link to `/legal`, no consent checkbox, and no privacy-notice text anywhere on the
form** — Art. 15 requires the notice be "puesto a disposición" (made available) **at the moment of
collection**, and this collection point makes no notice available at all.

## 2. ARCO rights and response SLAs — and whether "cancelación" is executable today

**Legal SLA (secondary sources — multiple hits agree on 20+10/15 days, e.g. uplaw.com.mx and
kyc-systems.com, searched 2026-07-28, article cited as Art. 31):**
- Responsable must answer an ARCO request within **20 days** of receipt, extendable **once** by up to
  **10 more days** if circumstances justify it.
- If the request is granted, the responsable must **make the right effective within 15 more days**
  of notifying the requester it was granted.
- So worst case: **~45 calendar days from request to execution** (20 + 10 + 15) is the outer legal
  bound RED's product needs to support end-to-end for a gym operator handling a member's ARCO request.

**Cancelación specifically — checked against the schema, not assumed:**
- `SELECT policyname, cmd FROM pg_policies WHERE tablename IN ('clientes','ventas','asistencias')` (run
  live 2026-07-28) returns **zero DELETE policies on any of the three tables** — `clientes` has only
  `clientes_staff_insert` (INSERT), `clientes_staff_select`/`clientes_member_select` (SELECT),
  `clientes_staff_update` (UPDATE). `ventas` has only INSERT/SELECT. `asistencias` has
  INSERT/SELECT/UPDATE. **No role — not owner, not operator, not the member themself — can delete a
  `clientes`, `ventas`, or `asistencias` row through the API surface RLS governs.** Confirmed by
  grepping `packages/data/src/server/clientes.ts` exported functions: `getClientesLite`,
  `getClientesParaPase`, `getClientesRoster`, `getRosterResumen`, `getClienteFicha`,
  `actualizarCliente`, `reenviarInvitacion` — read and update only, no delete function exists in the
  DAL at all. Grepping `apps/admin/src` for `eliminar|borrar|delete.*cliente` finds only unrelated
  hits (content sections, plantillas) — no admin UI path either.
- **If a delete path were ever added** at the schema level, it would cascade destructively:
  `ventas.cliente_id references public.clientes (id) on delete cascade` and
  `asistencias.cliente_id references public.clientes (id) on delete cascade`
  (`supabase/migrations/20260530023224_create_ventas_core.sql:51`,
  `supabase/migrations/20260530031218_create_asistencias.sql:8`). Deleting a `clientes` row today
  would silently delete that member's entire purchase/revenue ledger and attendance history along
  with it — rows a gym separately needs to retain for Mexican fiscal/accounting purposes (CFF record
  retention), independent of LFPDPPP. **This is a genuine conflict RED has not resolved: "cancelación"
  under LFPDPPP wants personal-data erasure; fiscal law wants the sale record kept.** The correct
  answer is near-universally anonymization-in-place (null the PII columns, keep the numeric/ledger
  facts), not a hard DELETE — and RED has built neither.

**Verdict: the aviso de privacidad text RED ships (`apps/client/src/app/legal/page.tsx:78-82`)
explicitly promises the member "*Puedes acceder, rectificar o cancelar tus datos*" — a promise the
product cannot keep.** There is no cancelación mechanism, automated or manual-triggerable-by-support,
anywhere in the codebase. A member exercising a real ARCO cancelación right today would require an
engineer to hand-run SQL against production with no defined procedure, no anonymization routine, and
a live foreign-key cascade that would take the ledger with it if done naively via `clientes` delete.

Rectificación (correction) *does* exist — `actualizarCliente` (packages/data/src/server/clientes.ts:432)
lets staff edit `nombre`/`tel`/`email`/etc., and the member's own profile screen presumably allows some
self-edit (not separately audited here) — so rectificación and acceso are functionally coverable within
the 20/10/15-day SLA; cancelación and oposición are not.

## 3. Data residency — Mexican members' data stored in the US

- The orchestrator's baseline states the Supabase Postgres project runs in **us-west-2 (Oregon)** — I did
  not re-verify project region via a write-capable tool (out of scope, read-only mandate) but take it as
  given per instructions.
- LFPDPPP does **not categorically bar** storing Mexican personal data abroad. What it requires (per the
  2025 international-transfer provisions — AE Abogados `https://aeabogados.com/transferencias-internacionales-datos-personales-lfpdppp/`,
  searched 2026-07-28) is: (a) **consent** for any transfer, domestic or international, unless an Art.
  16/60/64 exception applies (contractual necessity between responsable and encargado to render the
  service is the standard, most-likely-applicable exception here — but this needs an actual legal
  opinion, not this audit, to confirm it covers RED↔Supabase specifically); (b) the transfer must be
  **formalized** via contractual clauses, a collaboration agreement, or another legal instrument that
  demonstrates the scope of processing and each party's obligations; (c) the receiving party must
  provide **"protección equivalente"** (equivalent protection) to what LFPDPPP requires domestically.
- **This means data residency itself is not the compliance gap — the missing contract is.** RED has no
  documented instrument with Supabase (or evidence one was reviewed for LFPDPPP-equivalence terms) that
  satisfies (b) and (c). This is the same defect as §6 below, just viewed from the transfer angle: a
  lawful international transfer needs paper RED does not appear to have, not a change of AWS region.
- Practically: Supabase Inc. is a global BaaS vendor that almost certainly has a standard DPA available
  (not fetched/verified in this audit — recommend RED request and review it, and confirm what regional
  guarantees, if any, it makes for Mexican-subject data specifically).

## 4. Breach notification

- Statutory duty confirmed to exist: security "vulneraciones" that **significantly affect the
  patrimonial or moral rights** of the data subject must be communicated, described across sources as
  **"de forma inmediata" (immediately)** once the responsable becomes aware (cited to Art. 19 by one
  secondary source, unverified against primary text per §0's caveat). Multiple 2025 sources agree the
  **specific procedure and timeline for notifying the authority (SABG)** is left to the pending
  reglamento (see §0) — so the standard today is "immediately" to the affected data subjects, with the
  regulator-facing mechanics still unsettled nationally, not just at RED.
- **RED's engineering posture for this duty: none exists.** Grepped the repo for any breach/incident
  runbook, alerting plan, or notification procedure — zero hits. `mcp__supabase__get_advisors` was in
  scope for this session but I did not have unique new findings to add beyond what price/arch agents
  likely already surfaced (RLS gaps, anon EXECUTE grants) — the relevant point for legal:mx is narrower:
  **even if a breach were detected, RED has no defined internal process to determine who's affected, no
  contact list wired to notify gym operators (who then owe their members notice), and no template**.
  Given the LIVE BASELINE facts already established elsewhere in this audit run (multiple permissive
  RLS policies, an RLS-enabled-zero-policy table, 5 anon-EXECUTE write RPCs), the probability this duty
  gets triggered is not theoretical.

## 5. Sensitive data (datos sensibles)

- Definition (secondary sources, "enunciativa mas no limitativa" per Basham, searched 2026-07-28):
  racial/ethnic origin, present/future health status, genetic information, religious/philosophical/moral
  beliefs, union affiliation, political opinions, sexual preference — and, per the 2025 law, explicitly
  **non-exhaustive**, so novel categories can qualify by analogy.
- **Checked the actual schema, not assumed.** `information_schema.columns` for `public.clientes`
  (queried live) has exactly: `id, nombre, tel, clases_restantes, vence, paquete_nombre, created_at,
  email, birthday, gym_id, auth_user_id, phone_e164, terms_accepted_at, privacy_accepted_at,
  favorite_class_type_id, notificaciones_activadas, claim_code, invitacion_enviada_at`. `public.asistencias`
  has `id, cliente_id, fecha, hora, consumio, created_at, deleted_at, gym_id, class_session_id,
  reservation_id`. **Neither table has a health/injury/medical/emergency-contact/biometric field.**
  Grepped all migrations for `salud|health|biometr|lesion|condicion|emergencia` — the only hits are
  unrelated (`paquetes.nota`, a pricing-page note field). **Verdict: RED does not structurally collect
  datos sensibles today.** Attendance timestamps and check-in counts are ordinary personal data, not
  sensitive data under the LFPDPPP definition (gym attendance is not health status).
- `birthday` (date of birth) is present, and the legal `/legal` page's terms text
  (`apps/client/src/app/legal/page.tsx:58-59`) tells members to "informar al estudio de cualquier
  condición de salud relevante" (inform the studio of any relevant health condition) — **this is a
  verbal/contractual invitation to submit sensitive data that the schema has nowhere to put**. If a
  gym operator later adds a free-text "notas" field to capture exactly that (an easy, likely future
  change given the terms text already promises the workflow), it becomes datos sensibles the instant
  it's typed, and the product has zero of the extra-consent, restricted-access, or encryption-at-rest-
  beyond-baseline machinery LFPDPPP requires for sensitive data. This is a designed-in future landmine,
  not a present violation — flagging it because the terms text already commits to collecting it.

## 6. Controller/processor (responsable/encargado) relationship

- LFPDPPP 2025 explicitly broadens the law to name encargados (processors) directly (HLC
  `https://www.hlc.com/es/publications/mexicos-new-federal-data-protection-law-what-it-means-for-companies`,
  searched 2026-07-28) and requires the processing contract to state the scope of treatment, the
  responsable's instructions, applicable security measures, and the conditions for returning/destroying
  data when the relationship ends (same source; Art. 20 separately imposes a **surviving-past-termination
  confidentiality duty** on everyone who touches the data).
- **Checked the repo for any such instrument. There is none.** Grepped every `*.md` in the repo for
  `encargado|responsable del tratamiento|DPA|data processing agreement|sub-?processor|LFPDPPP|INAI` —
  the only hits are this audit run's own scratch docs and one other 2026-07-27 audit doc; **zero repo-native
  legal or contract documentation of the RED↔gym processor relationship exists.** No `docs/legal/`, no
  ADR, no CONTEXT.md section, nothing in `apps/admin` onboarding flow that a gym owner signs. Every gym
  today is hand-provisioned via raw SQL against production (a fact already established by Workflow 1's
  price/arch agents) — with no accompanying paper trail establishing RED as encargado, what it's
  instructed to do, or what happens to a gym's member data if that gym stops paying RED.
- This is the precondition the international-transfer analysis in §3 depends on, and it does not exist.

## 7. Consent for marketing surfaces

- `apps/client/src/app/registro/_components/registro-form.tsx:238-245` — self-registration has an
  explicit checkbox gating submit: "Acepto los Términos y Condiciones y el Aviso de Privacidad" (one
  checkbox, verified in the read; comment at line 40 confirms "the terms+privacy checkbox gates the
  submit (one box → both timestamps)"). This writes `terms_accepted_at`/`privacy_accepted_at`. **Correctly
  implemented for the self-registration door.**
- **The staff-entered door has no consent capture at all — checked live, not assumed.**
  `select count(*) filter (where terms_accepted_at is not null) as with_terms, count(*) filter (where
  terms_accepted_at is null) as without_terms, count(*) as total from public.clientes` → **5 with_terms,
  111 without_terms, 116 total** (run 2026-07-28). **95.7% of the live roster has no recorded consent
  timestamp of any kind.** Tracing why: `terms_accepted_at`/`privacy_accepted_at` are only ever stamped
  inside the `reclamar_o_crear_cliente`/`reclamar_por_codigo` self-activation RPC family
  (`supabase/migrations/20260705070642_reclamar_o_crear_cliente_rpc.sql:86-87` and five later
  migrations that re-create the same RPC). The **staff-facing creation path** (`vender`/checkout,
  front-desk entry — the path that produced 111 of 116 rows) **never touches these columns.** This
  matches the known live-seed fact from memory (RED gym live-seed) that the 19 real RED members are all
  `sin_invitar` — hand-entered by staff, never having seen any notice through the product.
  This is not necessarily unlawful per se (Art. 8-type "tacit consent" / contractual-necessity
  exceptions likely cover most ordinary membership processing when the person walks in and pays), but
  it does mean RED's own aviso de privacidad text ("Puedes acceder, rectificar o cancelar...") has never
  been *shown* to 95.7% of the people whose data the platform holds — the notice-availability duty in
  §1 fails for this cohort specifically, independent of the aviso's content defect.
- `apps/client/src/app/contacto/_components/contacto-form.tsx` (marketing lead intake) — no consent
  checkbox, no privacy-notice link (see §1). Given Art. 15 requires the notice be made available "at
  the moment of collection," and this collection point offers none, this is the single cleanest,
  smallest LFPDPPP gap to close in the whole audit (one link, one form).

---

## RANKED — 5 largest LFPDPPP compliance gaps in this codebase today, worst first

1. **The product promises a right (cancelación) it structurally cannot deliver, and doing it naively
   would destroy the fiscal ledger.** Evidence: `apps/client/src/app/legal/page.tsx:78-82` tells every
   member "puedes... cancelar tus datos"; zero DELETE RLS policy exists on `clientes`/`ventas`/
   `asistencias` (live `pg_policies` query, 2026-07-28); the only cascade path that exists
   (`ventas.cliente_id ... on delete cascade`, `create_ventas_core.sql:51`) would delete the revenue
   ledger, not anonymize it. **Breaks at:** the first member who asks for cancelación in writing —
   there is no legal or engineering answer ready. **To close:** build an anonymization RPC (null PII
   columns on `clientes`, retain numeric ledger facts on `ventas`/`asistencias`) reachable inside the
   20+10+15-day statutory window, and rewrite the aviso text to match what's actually offered until
   that ships.

2. **The aviso de privacidad itself fails Art. 15's baseline content test for every tenant.**
   Evidence: `apps/client/src/app/legal/page.tsx` is one static, brand-neutral block ("el estudio") with
   no gym legal name, address, or RFC, despite `gym_contact.address_line` existing and being populated
   per-gym, and despite `resolveBrand()` being available and used elsewhere in the same app. **Breaks
   at:** any regulatory inquiry or member complaint that checks the notice against Art. 15 — it fails on
   its face, for all 4 live gyms simultaneously (one shared bug, not per-tenant risk). **To close:**
   interpolate `gym_contact` (and a legal-name field, which doesn't currently exist and would need to be
   added) into the existing template — a small, well-scoped fix given the data is mostly already there.

3. **95.7% of the live roster has never been shown a privacy notice or recorded any consent.**
   Evidence: live query — 111/116 `clientes` rows have `terms_accepted_at IS NULL`; the consent-stamping
   code only exists inside the self-activation RPC family, never in the staff/checkout creation path.
   **Breaks at:** it's already past the break point — this is the current, live state of production, not
   a future risk. **To close:** either capture consent at the point of staff entry (a checkbox on the
   `vender`/roster-add flow, stamped the same way) or establish and document that the exception RED is
   relying on (contractual necessity / tacit consent for non-sensitive data collected face-to-face) is
   deliberate and sufficient — right now it's neither designed nor documented, just absent.

4. **No controller/processor (responsable/encargado) instrument exists between RED and any gym.**
   Evidence: repo-wide grep for `encargado|DPA|processor agreement|LFPDPPP` returns zero product/legal
   docs; gyms are hand-provisioned via raw SQL (per Workflow 1's arch findings) with no onboarding
   contract step in `apps/admin`. **Breaks at:** it's already the live state for all 4 gyms — there is
   no paper defining what RED is instructed to do with member data, what happens on gym churn, or who's
   liable if RED (not the gym) causes a breach. This is also the precondition the lawful-international-
   transfer analysis in §3 depends on. **To close:** a standard encargado contract per Art. 20 terms
   (scope, instructions, security measures, data return/destruction on termination), executed before
   the next gym onboards — this is a business/legal artifact, not a code change, but the product has no
   surface that requires or records it either.

5. **The contact-marketing intake collects PII with no notice offered at the point of collection.**
   Evidence: `apps/client/src/app/contacto/_components/contacto-form.tsx` (full file read) has no link
   to `/legal` and no consent checkbox anywhere in the form; the only compliance control present is
   Turnstile anti-bot, which is unrelated. **Breaks at:** any regulatory sampling of the public marketing
   surfaces — this is the most visible, most anonymous-facing form in the product. **To close:** this is
   the cheapest fix in the list — add one line linking to `/legal` (which itself needs the fix in #2
   first to be worth linking to).

## Blind spots (mine, this audit)

- I could not render the primary DOF PDF text (`pdftoppm`/poppler-utils unavailable), so every article
  number cited above (15, 16, 19, 20, 31, 35) is **secondary-sourced from law-firm client alerts**, not
  independently verified against the statute's actual text. These firms largely agree with each other,
  which raises confidence, but a real compliance sign-off needs the primary text or outside counsel —
  treat the day-counts and article numbers here as "very likely correct, not verified."
- I did not review the **admin app's** own aviso/consent surfaces for gym-owner accounts (out of scope
  per the mandate's "member-facing" framing, but a gym owner is also a data subject whose account data
  RED processes as responsable, not encargado — worth a follow-up pass).
- I did not check whether Supabase Inc. actually offers a DPA/international-transfer instrument RED
  could sign — I asserted the gap (no evidence one exists in-repo) but did not attempt to verify
  Supabase's vendor-side paper trail, which is outside this repo entirely.
- The reglamento-pending status (§0) means some of today's "gaps" could partially resolve or newly
  tighten once the Executive publishes new regulations — this audit is a snapshot against the statute
  only, not against rules that don't exist yet.
- I did not attempt to determine whether any of RED's 4 live gyms are themselves already out of
  compliance independent of the product (e.g., a paper aviso posted at the front desk that the app
  doesn't need to duplicate) — the audit is scoped to what the codebase does and doesn't do, not to
  each gym's real-world practice, which the codebase can't see.
