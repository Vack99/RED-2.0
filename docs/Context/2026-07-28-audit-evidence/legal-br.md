# legal:br — LGPD exposure for RED 2.0 in Brazil

**Agent:** `legal:br` · **Date:** 2026-07-27/28 · **Subject:** Lei nº 13.709/2018 (LGPD) obligations if RED 2.0 (Mexican SaaS,
one shared multi-tenant Supabase/AWS-us-west-2 Postgres project, ≥3,000 gyms target) onboards Brazilian gym clients.

**Method note (rule 6):** primary-source fetches (`planalto.gov.br`) were blocked twice (`ECONNRESET`) and a secondary
aggregator (`confidata.com.br`) returned HTTP 403 both times WebFetch tried it directly. Every legal claim below is
therefore sourced either to a **direct WebFetch quote of the article text** (`lgpd-brasil.info`, a maintained
article-by-article mirror of the official text, cross-checked against the numbering `planalto.gov.br` search snippets
confirm independently) or to **named secondary legal/compliance sources with fetch dates**, and I flag the one place
(Lei 15.352/2026's exact provisions) I only have secondary corroboration, not the statute text itself.

---

## 0. Who is the controller here — the load-bearing question every section depends on

Before the eight questions: LGPD splits roles into **controlador** (decides purposes/means) and **operador**
(processes on the controller's instructions, Art. 5 VI/VII, `lgpd-brasil.info/capitulo_01/artigo_05` fetched
2026-07-28 pattern, cross-referenced via search). `CONTEXT.md:372` already states the platform's own legal model for
Mexico: *"cada gym es un responsable distinto bajo LFPDPPP"* — each gym is a separate controller. That is the
intended posture for Brazil too: **the gym is `controlador`, RED 2.0 is `operador`.**

**That posture does not survive contact with this codebase.** An operador's defining trait is that it processes
*on the controller's instructions* — the controller decides retention, deletion, consent scope, security measures.
Here:
- Every deletion/retention/consent decision is **hard-coded once for all 3,000 tenants**, not configurable per gym:
  `clientes` has no delete path at all (`arch-datamodel.md` §1 #3, verified live: `pg_policies` has no DELETE row for
  `clientes`, and grep of the whole repo found zero delete/void code path for a roster row).
  no retention/purge job exists, and the single privacy notice text (`apps/client/src/app/legal/page.tsx:67-83`) is
  **one static Spanish string shipped platform-wide** — a gym cannot write its own privacy notice, name its own DPO,
  or set its own retention period even if it wanted to.
- RED 2.0, not the gym, chose the sub-processor (Supabase → AWS us-west-2), the schema, the security controls, and
  the consent-capture mechanism (`terms_accepted_at`/`privacy_accepted_at` booleans stamped by a platform RPC).

Under ANPD's own guidance the test for controller-vs-operator is *who determines the means*, not the contract label.
**RED 2.0 is functionally a joint/co-controller (`controlador em conjunto`) for every Brazilian gym on the
platform, whatever a Terms-of-Service PDF says.** This is the frame the other seven questions sit inside: it is not
one Brazilian gym's compliance problem 3,000 times over, it is RED 2.0's compliance problem once, at platform scale.

---

## 1. Legal bases (Art. 7 + Art. 11) — which apply here

**Art. 7 (ordinary personal data — nombre, tel, email, birthday, attendance timestamps, sale/plan history)** lists
ten closed hypotheses (search-confirmed against `lgpd-brasil.info/capitulo_02/artigo_07`, fetched 2026-07-28):
consent; legal/regulatory obligation; public-policy execution; anonymized research; **contract performance**;
exercise of rights in judicial/administrative proceedings; life/physical-integrity protection; health protection by
professionals; **legitimate interest**; credit protection.

**What actually fits RED 2.0's gym-membership relationship:** Art. 7 V, **contract execution** ("execução de
contrato... do qual seja parte o titular, a pedido do titular"), is the correct primary basis for the roster/sale/
attendance data — a member joins a gym and buys a package, and processing that data is necessary to run the
membership. This is a better fit than consent: consent under LGPD must be **specific, informed, unambiguous** and
freely revocable at any time (Art. 5 XII inference from the definition), and revoking it would have to stop
processing — which cannot happen mid-membership without breaking the product. The codebase currently treats it as
consent anyway: `clientes.terms_accepted_at` / `privacy_accepted_at` are captured as an acceptance checkbox at
signup (confirmed by `CONTEXT.md`'s glossary entry and the legal-page copy: *"Al crear una cuenta... aceptas estos
términos"*). **Basing an ongoing service relationship on Art. 7 I consent, when Art. 7 V contract-performance is the
correct fit, creates unforced revocation risk** — a member can withdraw "consent" at any time under LGPD and the
platform has no code path that handles what happens to their balance/history if they do (this is the same gap
`arch-datamodel.md` §1 flags for Art. 18 VI below, from a different angle).

**Art. 11 (sensitive data)** only matters **if** attendance/fitness data is classified as `dado sobre saúde` — see
§6. If it is not (my working read, see §6), Art. 11 is not triggered by anything currently in the schema, and Art. 7
alone governs. If a gym later adds a free-text health/injury field (no schema guard against this — see §6), Art. 11
I requires **"consentimento específico e destacado, para finalidades específicas"** — a separate, highlighted
consent, not bundled into the general terms checkbox that exists today.

---

## 2. Data subject rights, the 15-day rule, and whether this codebase can execute deletion/portability — NO

**Art. 18** (confirmed via WebSearch of the article, cross-checked against the Art. 19 quote below) enumerates:
confirmation of processing; access; correction; anonymization/blocking/**elimination** of unnecessary/excessive
data; **portability** to another provider; information on shared-with third parties; information on consequences
of refusing consent; **revogação do consentimento**; and eliminação of data processed under consent (Art. 18 VI,
subject to the Art. 16 retention exceptions).

**Art. 19** (direct quote, `lgpd-brasil.info/capitulo_03/artigo_19`, fetched 2026-07-28): simplified confirmation-of-
existence responses must be **"immediately"**; a **complete declaration must be provided within up to 15 (fifteen)
days** from the request date. §3 additionally lets the subject request, for consent/contract-based processing, **"an
integral electronic copy of their personal data... in a format that permits its subsequent use"** — the actual
statutory portability/export right.

**Can this codebase execute it? No, on every axis, verified against the code, not inferred:**

| Right | Mechanism today | Verdict |
|---|---|---|
| Access / 15-day complete declaration | None. `arch-datamodel.md` confirms the roster reader is a plain `.select().eq("gym_id",…)` with no per-member export; the only export tool is `respaldo` (ADR-0006) — a **whole-gym operational Excel**, 4 of **29** tables (`clientes`,`ventas`,`asistencias`,`paquetes` — table count is my own live `list_tables` count, 2026-07-28), explicitly excluding `cobro`/`perfil`/`plantillas`, and **not filterable to one data subject** — staff would hand-grep a spreadsheet | **Not implemented.** Fulfillment is 100% manual `service_role` SQL by whoever holds the one production credential. |
| Portability (Art. 18 V / 19 §3, "integral electronic copy… reusable") | Same `respaldo` tool — wrong shape twice over: (a) gym-scoped not subject-scoped, (b) a formatted `.xlsx` report with derived/display strings (`ESTADO_LABEL`, peso-formatted `monto`, Spanish month names) — not a portable structured extract of the *subject's own* raw data | **Not implemented.** |
| Elimination (Art. 18 VI) | **No DELETE policy on `clientes`, no delete RPC** (`arch-datamodel.md` §1 #3, live `pg_policies` query). The *only* delete-adjacent path in the whole system is deleting the `auth.users` row, which `ON DELETE SET NULL`s `clientes.auth_user_id` — it does **not** touch `nombre`/`tel`/`email`/`birthday`/`ventas`/`asistencias`. **The PII survives an "account deletion" completely intact, just unlinked from login.** | **Not implemented, and the one path that looks like it satisfies this right does not.** |
| Revocation of consent (Art. 18 IX) | No code path distinguishes "consent revoked, stop processing" from any other state. `terms_accepted_at`/`privacy_accepted_at` are write-once timestamps with no corresponding revoke action anywhere in `apps/client` or `apps/admin` (grep of both apps for a revoke/cancel-consent action: no hits) | **Not implemented.** |
| Where the member is told this exists | `apps/client/src/app/legal/page.tsx:78-81`: *"Puedes acceder, rectificar o cancelar tus datos... escribiendo al estudio por los canales de la sección Ayuda y contacto"* | The **only** channel offered is emailing/messaging the gym operator by hand — who then has no tool to do any of it either. |

**Falsification I ran (rule 3):** *"maybe the 15-day obligation doesn't bind RED 2.0 directly since the gym is
controller."* Checked: even under the intended controller/operator split, **Art. 39** (LGPD, referenced by multiple
secondary sources on the operator's duties, not separately re-fetched here — flagged as such) obliges the operador
to act per the controller's instructions **and assist the controller in complying with Chapter III rights** — and
§0 above already shows the "gym decides" framing is fictional. Either read, the 15-day clock is a real obligation
resting on a system with **zero** machinery to meet it.

**Where it breaks, in numbers.** At 3,000 gyms × 200 members = 600,000 Brazilian data subjects if BR were fully
rolled out (MODELLED, not measured — no BR gyms exist today). Even a conservative 0.1%/yr access-request rate
(LGPD/ANPD awareness is climbing, not falling — see §7) is **600 requests/yr ≈ 1.6/day**, each currently a bespoke
manual SQL task for the single person holding `service_role` — the same person `arch-datamodel.md` independently
found saturates at **~1.5 unrelated money-correction tasks/day around gym #40**. Two independently-discovered
obligations collide on the identical unscaled bottleneck resource. **The 15-day SLA is not a scale problem — it
fails on data-subject-request #1 in the first Brazilian gym**, because no tooling exists at any volume.

---

## 3. DPO / encarregado — required at this size? What does it involve for a Mexican company?

**Art. 41** (WebSearch-confirmed, cross-source): the controller **must** appoint an encarregado; identity + contact
must be **publicly disclosed**, preferably on the controller's website; duties = receive complaints/communications
from titulares, receive/act on ANPD communications, orient staff, other duties per regulation. No general small-size
exemption in Art. 41 itself.

**The exemption lives in ANPD Resolution CD/ANPD nº 2/2022** ("agentes de tratamento de pequeno porte" —
[lrilaw.com.br summary](https://lrilaw.com.br/2022/02/08/resolucao-anpd-no-2-de-27-de-janeiro-de-2022-aplicacao-da-lei-geral-de-protecao-de-dados-pessoais-para-agentes-de-pequeno-porte/),
fetched via WebSearch 2026-07-28; PDF confirmed at
[gov.br/palmares mirror](https://www.gov.br/palmares/pt-br/midias/arquivos-menu-acesso-a-informacao/legislacao/resolucao-cd-anpd-n2-2022.pdf)):
qualifying agents (microempresa ≤ R$360k/yr, empresa de pequeno porte R$360k–4.8M/yr per LC 123/2006, or a startup
under LC 182/2021) get, **cumulatively conditioned on the treatment NOT being high-risk or large-scale**: DPO
nomination waived **if** a communication channel to titulares still exists; **doubled** response deadlines; a
simplified processing registry; simplified impact reports.

**Applying this to RED 2.0's actual shape (§0), the exemption helps the wrong entity:**
- **A single Brazilian gym client** (a few hundred members, plausibly under R$4.8M/yr revenue) would likely qualify
  for the small-agent regime *if it were the sole controller of an isolated system* — **doubled deadlines (30 days,
  not 15)** and no DPO requirement would genuinely reduce its burden.
- **RED 2.0 the platform does not get to inherit that exemption.** Resolution 2/2022's own carve-out excludes
  **"tratamento de alto risco ou em larga escala"** regardless of revenue. One shared multi-tenant Postgres project
  holding member PII for (at target) 3,000 tenants and 600,000+ data subjects, under one shared set of RLS policies
  and one `service_role` credential, is squarely the shape ANPD's own 2026–2027 enforcement plan is built to catch
  (§7) — "large-scale" is exactly the axis that disqualifies aggregation platforms from small-business relief, even
  when every individual customer is tiny. **RED 2.0 needs a real, named, publicly-disclosed encarregado — not an
  exemption — the moment it has one Brazilian gym on shared infrastructure with the other 2,999.**

**What appointment involves for a foreign (Mexican) controller/operator, concretely:**
1. A named individual (can be an employee, contractor, or Article-consistent third-party service — LGPD, unlike
   GDPR's Art. 27, does not mandate the DPO be **located in Brazil**, but does mandate public, working contact
   information reachable by Brazilian titulares and by ANPD).
2. Public disclosure — a page, not a filing: name + contact "preferably on the controller's website" (Art. 41 §1,
   WebSearch-confirmed). RED 2.0's `apps/client/src/app/legal/page.tsx` today names **no one** — no encarregado
   name, no contact channel dedicated to privacy requests, only "escribiendo al estudio."
3. Fielding both title­holder rights (§2) and ANPD communications — which, given §0's actual control structure,
   means RED 2.0's encarregado is the one who would field a request against *any* of the 3,000 gyms' data, because
   the gym itself has no product surface to do so.

**Exit trigger:** appoint before, not after, the first Brazilian gym signs — this is a Day-Zero obligation, not a
scale threshold (see the parallel "breaks at gym #1" framing across §2/§4/§6).

---

## 4. International data transfer — is US hosting permissible, and under what instrument?

**ANPD's transfer regime (Resolução CD/ANPD nº 19/2024,** confirmed via WebFetch of
[gov.br/anpd's own transfer page](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados),
fetched 2026-07-28) recognizes five instruments: **(1) adequacy decision** — as of the fetch, **only the European
Union has one** (Resolução 32/2026, 2026-01-26, per the same page); **(2) ANPD's own Standard Contractual Clauses**
(Annex II of Res. 19/2024) — mandatory-text clauses agents had **until 2025-08-23** (12 months from the 2024-08-23
publication) to incorporate into existing contracts
([Mayer Brown](https://www.mayerbrown.com/pt/insights/publications/2025/08/end-of-grace-period-implementation-of-brazils-standard-contractual-clauses-in-international-transfers-of-personal-data),
fetched via WebFetch 2026-07-28, confirms the grace period **has already lapsed**); **(3) recognized-equivalent
foreign SCCs** — none approved yet; **(4) specific contractual clauses** needing prior ANPD approval — none
approved; **(5) global corporate rules** — none approved.

**Applying this to the live baseline (orchestrator-verified: DB in AWS us-west-2/Oregon):** the **United States has
no ANPD adequacy decision.** A transfer of a Brazilian gym member's data into that Oregon Postgres instance —
which happens on every write, unconditionally, the moment one Brazilian gym signs — is only lawful under
**instrument (2), the Brazilian SCCs**, since (3)/(4)/(5) have no approved instances to invoke and Brazil-US has no
adequacy path today. **Two independent things are simultaneously true and both are gaps:**
1. **No SCC exists.** `grep -i "Brasil\|LGPD\|Brazil"` across the entire repo returns exactly four hits, all recent
   planning docs *about auditing this question* — zero contracts, zero DPA references naming Supabase or AWS, zero
   mention of a transfer instrument anywhere in the codebase or its docs.
2. **The privacy notice doesn't disclose the transfer at all.** `legal/page.tsx:74-77` says only "no los
   compartimos con terceros... solo con los proveedores que hacen funcionar la plataforma" — it never names
   Supabase, AWS, the US, or "transferencia internacional," which LGPD's transparency principle (Art. 6 VI) and the
   Art. 9 information-at-collection duty both require be disclosed, not merely implied by a vague vendor clause.

**Supabase's own DPA** ([supabase.com/downloads/docs/Supabase+DPA+250314.pdf](https://supabase.com/downloads/docs/Supabase+DPA+250314.pdf),
found via WebSearch 2026-07-28, not independently re-fetched to confirm it references the Brazilian SCCs
specifically — flagged as **unverified** whether it satisfies Res. 19/2024's mandatory clause *text*, only that
Supabase has *a* DPA) is the instrument RED 2.0 would need to check or supplement — a DPA silent on Brazil's
specific Annex II text does not by itself satisfy Res. 19/2024.

**Where it breaks:** Day Zero, gym #1. This is not a scale finding — it is a missing-instrument finding that exists
the moment the first Brazilian member's row is written to a US-region database, which happens on this schema
today with zero code change.

---

## 5. Breach notification — timelines and to whom

**Art. 48** (WebSearch-confirmed across multiple sources) requires the controller to communicate to **ANPD and the
data subject** the occurrence of a security incident that may cause relevant risk or damage.

**The "reasonable time" was made concrete by Resolução CD/ANPD nº 15/2024:** **3 business days** from the
controller's knowledge of the incident, when no sector-specific rule applies; **up to 6 business days if the
controller is a "small-size" agent** (the same small-agent category from §3 — again the wrong entity for RED 2.0 to
lean on, per §0/§3's argument). Mandatory content of the notice: nature of the affected data, the titulares
involved, technical/security measures in place, risks, reasons for any delay, and mitigation measures taken/planned.
**Relevance criteria** explicitly named (WebSearch, `compliance.mspa.com.br` + `mavima.com.br` sources cross-
checked, fetched 2026-07-28): sensitive data, children/adolescent/elderly data, **financial data**, authentication
data, legally-privileged data, or **large-scale** processing.

**Applied here:** `ventas`/`cobro` carry payment-adjacent data and the platform is large-scale by construction
(§3). A breach of the shared Postgres project — one instance for all 3,000 tenants — would very plausibly need
notification to **every affected gym's titulares simultaneously**, within **3 business days of RED 2.0 (the
platform operator) learning of it**, and the codebase has: no incident-detection process referenced anywhere in
`docs/`, no breach-notification runbook (`docs/runbooks/` was not found to contain one), and (per the sibling
`arch-authz.md`/security audits already on disk from Workflow 1) a single `service_role` key model where a leak of
that one credential is a platform-wide incident, not a per-gym one — meaning a single breach event could trigger
3,000 simultaneous 72-hour-class notification obligations with zero existing tooling to identify which rows/gyms
were exposed, since there is no audit log (`arch-datamodel.md` §0 confirms **zero non-internal triggers in the
entire public schema** — nothing is instrumented to answer "what did the attacker actually read").

---

## 6. Health/biometric data classification — attendance and fitness records

**Art. 5 II** (WebSearch-confirmed quote): sensitive personal data = data on racial/ethnic origin, religious belief,
political opinion, union/religious/philosophical/political-organization affiliation, **"dado referente à saúde ou à
vida sexual"**, and **genetic or biometric data** "quando vinculado a uma pessoa natural." This is a **closed
(exhaustive) list** — a datum only enters the sensitive-data regime if it factually reveals one of those named
dimensions, per the legal commentary cross-checked above.

**What this schema actually stores, verified against `arch-datamodel.md`'s live audit + my own `list_tables` pass:**
`asistencias` is `(gym_id, cliente_id, fecha, hora, deleted_at)` — a bare check-in timestamp. No weight, no health
condition, no injury note, no biometric template (fingerprint/face) anywhere in the schema I could find (grep for
`peso|altura|salud|lesion|biometric|huella|weight|height` across `supabase/migrations/` returned only unrelated
seed-content false positives — no schema column matched).

**My working read: bare gym check-in data, as currently modeled, does not meet Art. 5 II's closed list** — it is
not itself information about health status, a medical condition, or a biometric identifier; it is presence data.
This contradicts the gym-industry compliance commentary I found (e.g.
[lgpdbrasil.com.br](https://lgpdbrasil.com.br/lgpd-nas-academias-como-lidar-com-os-dados/), WebSearch 2026-07-28),
which treats "measurements, weight, and activity history" as sensitive **because those specific gyms collect
measurements and weight** — data this schema does not have a column for. **I flag this as my own inference, not a
sourced legal conclusion** (falsification per rule 3: *if attendance-frequency-alone were ever authoritatively
classified as health-adjacent sensitive data by ANPD, this conclusion reverses* — I did not find a primary ANPD
statement settling this specific fact pattern, and none of my sources cite one either).

**Why this doesn't end the question, and is itself a gap:** the schema has **no sensitivity flag or column-level
classification anywhere** — nothing distinguishes "this field, if ever populated, is Art. 11 territory" from
ordinary data. `class_type_bring_item`, `perfil`, and the free-text `paquete_nombre`/`monto`-adjacent fields are all
open text with no guard. The moment any gym operator adds "alergias," "lesión previa," or a biometric check-in
method (fingerprint scanners are common at LatAm gyms) — a purely product decision, zero schema change required for
a free-text field — **Art. 11's "consentimento específico e destacado"** requirement silently attaches to a system
that only ever captured one bundled Art. 7-style consent checkbox at signup. Nothing would alert anyone this
happened.

---

## 7. ANPD enforcement posture — real fine ranges, not theoretical maxima

**The statutory ceiling** (Art. 52, WebSearch-confirmed, cross-source): warning; simple fine **up to 2% of the
private-law entity's revenue, capped at R$50,000,000 per infraction**; daily fine within that cap; publication of
the infraction; blocking; deletion of the data involved; partial suspension of the database; suspension of the
processing activity tied to the infraction. Applied per Light/Medium/Serious classification.

**What has actually been collected, cross-checked across two independent secondary sources**
([turivius.com/portal/multas-da-lgpd](https://turivius.com/portal/multas-da-lgpd/), WebFetch 2026-07-28, article
dated 2026-07-06; corroborated by a WebSearch summary of
[confidata.com.br's sanctions map](https://confidata.com.br/blog/mapa-sancoes-anpd-todos-casos-2026)):
- **Total monetary fines collected to date: R$14,400** — a single case (a telemarketing microenterprise, 2023),
  penalized for processing without a legal basis (Art. 7) **and** failing to appoint an encarregado (Art. 41) **and**
  non-cooperation with the inspection.
- The other ~8 concluded sanction proceedings are against **public-sector bodies** (state health/education/social
  agencies, federal benefits/health autarquias) — Art. 52 §3 exempts public entities from monetary fines, so those
  closed as warnings/publication orders, not money.
- **Real exposure to date, five-plus years into the law: R$14,400 total, one paying defendant.** Compared to the
  R$50M statutory cap, actual enforcement has been essentially nominal.

**But the trend line, not the snapshot, is what matters for a multi-year platform bet — and it is turning, on two
independently-sourced, dated facts:**
1. **Lei nº 15.352/2026** (sanctioned by President Lula, published DOU **2026-02-25**, per
   [Senado Notícias](https://www12.senado.leg.br/noticias/materias/2026/02/26/sancionada-lei-que-cria-a-agencia-nacional-de-protecao-de-dados)
   and corroborated by four other outlets found via WebSearch 2026-07-28 — I did not independently pull the statute
   text, so treat the exact provisions as **secondary-sourced, not primary-verified**) converts ANPD from an
   authority into a full regulatory **agência** (autarquia) with functional/financial autonomy, creates 200 new
   specialist posts filled by public exam, and — per the same sources — grants inspectors power to **interdict
   establishments, seize assets, and request police backup** to enforce compliance, comparable to ANVISA/ANATEL.
2. **ANPD's own published 2026–2027 inspection plan** (Resolução CD/ANPD nº 30/2025, per
   [TELETIME](https://teletime.com.br/23/01/2026/anpd-define-75-fiscalizacoes-para-bienio-2026-2027-confira-prioridades/),
   WebSearch 2026-07-28) commits to **at least 75 inspection actions** over the biennium, with **25 of them
   specifically on data-subject rights with named attention to biometric, health, and financial data** — precisely
   the fact pattern in §6 (attendance data adjacency) and the payment ledger.

**Falsification I ran (rule 3):** *"maybe R$14,400 total means Brazil enforcement risk is negligible for a company
this size, full stop."* Checked against both the historical number **and** the two dated, sourced structural
changes above — the historical number describes an authority that, by its own account and a freshly-sanctioned
statute, is actively being re-armed specifically to stop looking like this. **A platform onboarding its first
Brazilian gyms in 2026–2027 is not benchmarking against 2019-2025 ANPD; it is the first cohort to meet the newly-
funded one**, with an inspection plan that names the exact two things this codebase is thinnest on: data-subject
rights execution (§2) and health/biometric-adjacent data handling (§6).

---

## 8. Local legal entity or representative — is one required?

**No explicit statutory requirement**, and this is a genuine, sourced difference from GDPR: unlike GDPR Art. 27
(which mandates a named EU representative for non-EU controllers targeting EU data subjects), **LGPD currently has
no equivalent representative-appointment article** — confirmed via WebSearch of legal commentary specifically
comparing the two regimes
([conjur.com.br](https://www.conjur.com.br/2023-abr-01/opiniao-lgpd-ausencia-figura-representante/), 2026-07-28),
which frames this as a known, discussed gap in the Brazilian statute, not an oversight on my part.

**But practical/procedural pressure exists without a standalone article:** **Art. 3** gives LGPD extraterritorial
reach — it applies whenever the processing targets offering goods/services to, or processing data of, individuals
**located in Brazil**, regardless of where the controller is headquartered or where the processing occurs (Art. 3,
II — WebSearch-confirmed). **Art. 61** (cited via the same comparative-law source) requires that a foreign company
be **served with process through "seu agente ou representante ou pessoa responsável pela filial, agência, sucursal,
estabelecimento ou escritório no Brasil"** — meaning a foreign company with **no** Brazilian presence at all creates
a practical enforcement gap on ANPD's side, not a compliance out on RED 2.0's side: it does not need a Brazilian
entity to be *bound* by LGPD, but ANPD's own commentary-sourced practice (§8 first citation) is that foreign
controllers **without** local presence increasingly nominate a local representative or an encarregado with a
Brazil-reachable channel voluntarily, precisely because it is the only clean way to *be reachable* under Art. 61 and
avoid default/contumacy postures in enforcement proceedings.

**Net: RED 2.0 does not need to incorporate in Brazil to be legally bound, but operating with zero Brazilian
presence and zero named local/reachable contact is an unforced posture that works against it the moment ANPD (now
armed per §7) opens a proceeding** — there would be no one in Brazil to serve, and the statute's own service
mechanism assumes there is.

---

## 9. Ranked — the 5 largest LGPD gaps for a Brazilian launch, worst first

### #1 — There is no deletion capability, at all, for any data subject, and the one path that looks like deletion silently fails to delete
`arch-datamodel.md`'s live-verified finding (no DELETE policy on `clientes`, `ON DELETE SET NULL` on
`auth.users`→`clientes.auth_user_id` only unlinks login, never removes nombre/tel/email/birthday/history) means
**Art. 18 VI cannot be honored on day one, for the first Brazilian member who asks, at any scale.** This isn't a
"breaks at gym #N" finding — it breaks at **request #1**. **Falsification:** *maybe Art. 16's retention exceptions
cover this* — checked: Art. 16 permits retention for legal/regulatory-compliance or contract-performance reasons,
but that requires an *articulated* retention policy and purpose, which does not exist anywhere in this codebase
(no retention column, no purge job, no documented justification) — so there is no live decision to point to, only
an absence.

### #2 — No portability/export mechanism is scoped to a data subject; the only export tool is the wrong shape twice over
`respaldo` (ADR-0006) is a deliberate, well-designed *gym-operator* report — and by its own ADR is explicitly **not**
meant to be a complete record (it hard-excludes `cobro`/`perfil`/`plantillas`, and only touches 4 of 29 tables).
Repurposing it for Art. 18 V / Art. 19 §3 portability would require both a new per-subject filter and a rewrite from
"formatted display strings" back to "raw reusable data" — the exact inverse of what ADR-0006 optimized for. **Zero
code today answers "give this one member everything you hold on them."**

### #3 — The 15-day access SLA (Art. 19) has no supporting tooling and collides with an already-saturated bottleneck
Every fulfillment path funnels through the single `service_role` credential-holder, the same person
`arch-datamodel.md` independently found saturates on unrelated money-correction work around gym #40. Two unrelated
LGPD/product obligations stack on one unscaled human. **Breaks in the first weeks of the first Brazilian gym**, not
at a growth milestone — DSAR volume doesn't need to be high to blow a 15-day SLA when the fulfillment cost per
request is "write custom SQL by hand."

### #4 — No international-transfer instrument exists for the US-hosted database, and the privacy notice doesn't disclose the transfer
Brazil→US has no adequacy decision (only the EU does, as of Res. 32/2026); Res. 19/2024's SCC grace period **already
expired 2025-08-23**; and the repo contains zero SCC, zero DPA reference naming Supabase/AWS, and zero mention of
international transfer in the one shipped privacy notice. This is a Day-Zero gap, live the instant one Brazilian
row is written to the Oregon database — no code change needed to trigger it, only a Brazilian sign-up.

### #5 — No encarregado is named, and the platform's aggregation model disqualifies it from the small-business relief the individual gyms could otherwise claim
Res. 2/2022's DPO waiver + doubled deadlines exist for small agents **not** doing large-scale processing — and one
shared Postgres project for 3,000 tenants / 600k+ subjects is the textbook shape that carve-out excludes, regardless
of any single gym's tiny revenue. RED 2.0 needs a real, publicly-disclosed encarregado before, not after, gym #1 —
today `legal/page.tsx` names no one and offers only "escribiendo al estudio," which routes to an operator with no
tooling and no legal authority to be the encarregado of a platform they didn't build.

---

## 10. Verdict — early market or late market?

**Late, deliberately, and not for cost reasons.** Every other jurisdiction question in this workflow (pricing,
capacity, region) is a scaling problem — it degrades gracefully and the fix gets cheaper the earlier it's made.
**Brazil is not that shape.** Four of the five gaps above (#1, #2, #4, #5) are **Day-Zero absolutes** — they are
fully triggered by the *first* Brazilian gym's *first* member, not by volume, and #3 (the 15-day SLA) breaks within
the first few weeks on trivial request volume because there is no tooling at all, not because the tooling doesn't
scale. Brazil is also the one jurisdiction in this workflow with a **freshly-armed, newly-funded regulator**
(Lei 15.352/2026, R$0 in ANPD's enforcement history five years in but now converted into an autarquia with
inspection/seizure powers and a published 2026–2027 plan that names exactly this app's weakest points —
data-subject rights and health-adjacent data) — meaning the "it's fine, nobody's watching yet" argument that might
be defensible for a smaller/quieter regulator is actively expiring in real time, not holding steady.

**What would have to be true for "late" to be wrong:** if RED 2.0's actual near-term expansion plan is Mexico-only
or Mexico+one lighter-regime LatAm market for the next 12-18 months, none of this is urgent *today* — build the
deletion/export/DPO/transfer-instrument machinery as ordinary product debt on its own timeline, and revisit Brazil
specifically once it's built, since #1/#2 (deletion, portability) are good product features everywhere, not
Brazil-specific asks. **The reversal condition is concrete and cheap to watch:** the moment a Brazilian gym is even
being *sales-conversation-considered*, this ranking inverts from "someday" to "blocking" — because unlike the
capacity findings elsewhere in this workflow, none of these five gaps have a "scale into it gradually" path.

---

## 11. My own blind spots (rule 8)

1. **I could not fetch `planalto.gov.br` directly** (twice `ECONNRESET`) — every LGPD article quote here is sourced
   to `lgpd-brasil.info` (a maintained mirror, cross-checked against independent search snippets that cite the
   official numbering) or to WebSearch summaries of secondary legal commentary, never to the Diário Oficial text
   itself. I did not verify there is no post-publication amendment to Arts. 7/11/18/19/33/41/48/52 that these
   mirrors have missed.
2. **Lei nº 15.352/2026's actual text is unverified by me** — every claim about it (interdiction/seizure powers, 200
   posts, autarquia status) is secondary-sourced across five outlets that agree with each other, which is
   corroboration, not primary verification. I did not read the statute.
3. **I did not check whether RED 2.0's Terms of Service (if one exists beyond `legal/page.tsx`) says anything
   different about controller/operator roles** — my §0 argument that RED 2.0 is functionally a joint controller is
   built from code behavior, not from reading a contract that might exist outside this repo.
4. **I did not model Mexico↔Brazil transfer separately from US↔Brazil** — if RED 2.0 staff in Mexico ever pull
   Brazilian member data into a local tool (support, debugging, analytics), that is a second, distinct international
   transfer under Art. 33 that I did not evaluate; I only addressed the always-on Postgres-storage transfer to AWS
   us-west-2.
5. **The Art. 5 II health-data question (§6) is my own legal inference from the schema, not a sourced ANPD ruling**
   — I found no primary ANPD guidance settling whether bare attendance/check-in timestamps (no biometric, no health
   detail) cross into "dado sobre saúde." If ANPD or a court takes a broader view than I did, Art. 11's stricter
   consent regime attaches retroactively to data already being collected, and my ranking under-weights that risk.
6. **I did not investigate Mexican outbound-transfer rules (LFPDPPP) for the Mexico-leg of the chain**, i.e.
   whether RED 2.0 as a Mexican company has its own outbound-transfer obligations moving Brazilian-collected data
   through Mexican systems — out of scope for this mandate (Brazil-only) but adjacent enough to flag.
