# How ToS actually get written — production routes for a bootstrap SaaS (2026-08-10)

**Question behind this doc:** iBookit has zero platform↔gimnasio Terms of Service
(`docs/Context/2026-08-10-tos-gap-analysis.md`: **HAVE = 0**). The ruled model is ONE document,
DPA obligations incorporated, accepted at alta + continued use, published at a public URL
(`docs/Context/2026-08-10-dpa-acceptance-competitor-norms.md`: 11/11 competitors do it this way).
"Wait for a lawyer" is being treated as a blocker. This doc asks what companies **actually do**.

**Method:** WebSearch + WebFetch against primary sources (statute text on `leyes-mx.com` /
`mley.mx` / diputados, licence files on GitHub, vendors' live legal pages, published fee data).
Every claim carries a URL. Anything not confirmed from a fetched source is marked **UNVERIFIED** —
including several places where the *absence* of evidence is itself the finding.

**This is research, not legal advice.** It reports what sources say.

---

## Q1(a) — Template / standard-form routes

### The three that matter

| Route | B2B SaaS? | Cost | Reuse licence | Verdict |
|---|---|---|---|---|
| **Common Paper — Terms of Service standard** | Yes, purpose-built | Free | **CC BY 4.0** — modify freely, attribute | **Best starting text** |
| **Bonterms — Standard Online Cloud Terms** | Yes, purpose-built | Free | **CC BY-ND** — body may NOT be edited | Strong, but locked |
| **Basecamp / 37signals policies** | Partially (prosumer-shaped) | Free | **CC BY 4.0** — "Steal These Policies" | Ancillary docs only |

#### Common Paper (`commonpaper.com`) — the primary recommendation

The relevant artefact is **not** the Cloud Service Agreement (CSA, designed to be *signed*) but the
**Terms of Service** standard, which is explicitly *"a customized version of the Common Paper Cloud
Service Agreement (CSA)… The default version of the CSA is structured to be signed… These Terms of
Service are structured to be **posted online by a vendor and for customers to click-to-accept**."*
That is exactly iBookit's ruled surface. Current CSA version: **2.1**.

- Drafted by *"a committee of over 40 attorneys representing technology vendors, procurement teams,
  boutique firms, and Big Law."*
- Licence, verbatim from the repo README: *"Common Paper agreements are free to use and modify
  under [CC BY 4.0]."* Attribution is the only condition.
- **Two-layer architecture:** a **Cover Page** carrying the business terms (fees, subscription
  period, **governing law**) that *"incorporates the Standard Terms by reference."* Governing law is
  a Cover Page variable, not immutable body text — so Mexican law/venue is a fill-in, not a rewrite.
- Standard Terms live at a **version-pinned immutable URL**
  (`commonpaper.com/standards/cloud-service-agreement/2.1`).
- **A DPA module exists**, alongside MNDA, SLA, BAA, PSA, Software Licence, AI Addendum, Pilot
  Agreement. That is the piece that lets the ruled "one document, DPA incorporated" model work.
- Free guided configurator ("Configure Your TOS") emits a postable document.

Sources: https://commonpaper.com/standards/terms-of-service/ ·
https://commonpaper.com/standards/cloud-service-agreement/ · https://github.com/CommonPaper/CSA ·
https://commonpaper.com/standards/

#### Bonterms (`bonterms.com`) — strong, but read the licence carefully

*"Lawyer-led and funded by XYZ Capital and Wilson Sonsini"*; the terms *"went through six major
drafts, three sub-committees (Data, Risk and General Terms) and multiple meetings, surveys and
discussions over seven months."*

**Two products, two different licences — this trips people up:**

- **Cloud Terms** (signed/enterprise): **CC BY 4.0**, modifiable.
  https://github.com/Bonterms/Cloud-Terms
- **Standard Online Cloud Terms** (the posted click-accept form — i.e. iBookit's actual shape):
  **CC BY-ND, NOT modifiable.** Verbatim: *"You may use and display the Standard Online Cloud Terms
  on your website without charge, but you **may not change the text in any way** (except through
  Provider-Specific Terms)."* And: *"Changing any element of the text… is strictly prohibited. If
  you do change any element… you will be in violation of the license… and you must remove all
  references to 'Bonterms'…"*

  **The escape hatch is real and sufficient.** Customisation happens in a sanctioned
  **Provider-Specific Terms** layer, and governing law is parameterised there — § 19.2 verbatim:
  *"Unless otherwise specified in the Provider-Specific Terms, the **Governing Law** is the laws of
  the State of California…"* So a Mexican provider CAN override to Mexican law/courts without
  breaching the ND licence.

  Bonterms disclaims: *"Bonterms does not provide legal advice, does not guarantee the
  enforceability of the Standard Online Cloud Terms…"*

Sources: https://github.com/Bonterms/Online-Cloud-Terms ·
https://bonterms.com/standard/online-cloud-terms/ ·
https://bonterms.com/standard/online-cloud-terms/copy-code/

#### Y Combinator — the brief's premise was half wrong; corrected

`ycombinator.com/documents` is **SAFEs only** (Safe cap/discount/MFN variants, Pro Rata Side
Letter, user guide, Canada/Cayman/Singapore versions). No SaaS agreement there.

**But** a separate, less-publicised page exists: **`ycombinator.com/sales_agreement`** ("Template
Sales Contracts"), offering two free Word documents: (1) **the YC Sales Agreement, drafted by
Goodwin Procter**, and (2) **the Common Paper Cloud Service Agreement** (Common Paper is YC W23).
YC's framing: *"consider the Sales Agreement as a starting point and customize it to meet your
needs."* Disclaimer: *"Neither YC, Goodwin Proctor nor Common Paper assume responsibility for any
consequences of using the Sales Agreement or the Cloud Service Agreement."*

This is a **signed** enterprise-deal shape, not a posted click-accept ToS — so it's the wrong
artefact for iBookit's ruled model, but the YC co-hosting is a meaningful endorsement of Common
Paper. **UNVERIFIED:** no explicit open licence found on the YC Sales Agreement itself.

Sources: https://www.ycombinator.com/sales_agreement · https://www.ycombinator.com/documents

#### Basecamp / 37signals (`github.com/basecamp/policies`) — ancillary layer only

Repo is **archived** (Dec 2023, now → 37signals.com/policies) but content and licence stand.
Contains ToS, Privacy policy, **Cancellation policy, Refund policy, Use Restrictions policy,
Security overview**, SLA for Basecamp Big, Taxes, Account ownership, HEY policies.

Under a heading literally called **"Steal These Policies"**: *"You're free to use these policies in
your own organization under the [Creative Commons Attribution] license. Edit them. Adapt them to
your needs. Share them. Put them to work."* They even supply the attribution string.

**Fit:** their **Cancellation / Refund / Use Restrictions / SLA / Security** docs are excellent,
plain-language and directly reusable — they map onto gap-analysis items B4, B5, B7, B8, B9. Their
**ToS is not a substitute** for a platform agreement: it is prosumer/low-touch shaped and thin on
the commercial machinery (liability caps tied to fees paid, indemnification, warranty framework).

**UNVERIFIED:** the README names **no companies** that have reused them. There is no adopter roster.

Source: https://raw.githubusercontent.com/basecamp/policies/master/README.md

#### Automattic "legalmattic" — a fourth open source, with a licence catch

WordPress.com's real legal docs, open-sourced. **Licence is CC BY-SA 4.0 — ShareAlike**, which is
stickier: derivatives must be re-licensed under the same terms. *"please feel free to re-use and
edit these terms to fit your own use. We do ask for a link back…"* Same limitation as Basecamp:
consumer/hosting-shaped, not a B2B subscription agreement.
Source: https://github.com/Automattic/legalmattic

### The commercial generators — all dominated, two dead

| Product | Price | Licence to you |
|---|---|---|
| **TermsFeed** | Base free; premium clauses one-time: GDPR/CCPA **$82**, COPPA **$34**, user accounts / subscription plans **$24 ea**, IP/payments **$14 ea**; cookie banner $10/mo | **UNVERIFIED** — no ownership/licence clause found anywhere on site |
| **Termly** | Free (1 basic policy); Starter $10/site/mo; Pro+ $15/site/mo | *"The Forms… are **licensed, not sold**, and you receive **no title to or ownership** of the Forms"* |
| **GetTerms** | $5–8/mo, or $199/$249 lifetime, **per website** | *"**If your subscription lapses, generated products may become invalid or cease to function**"*; resale prohibited; branding may not be removed |
| **Avodocs** | — | **DEAD.** Domain registered, no A/AAAA record, nothing served. Search snippets (unverified) say service ended 2024-10-31 |
| **Docracy** | — | **DEAD.** Serves a shutdown page: *"Docracy is no longer available."* Footer © 2019 |
| **termsandconditionsgenerator.com** | Free | Lead-gen wrapper: *"You will be redirected to TermsFeed…"*; `/terms-of-use` returns 502 |

The GetTerms property is disqualifying on its own: **your foundational contract ceasing to be valid
because a subscription lapsed** is not an acceptable dependency. All three produce website-Terms-of-Use
shaped output, not a subscription agreement.

Sources: https://www.termsfeed.com/pricing/ · https://www.termsfeed.com/legal/terms-of-use/ ·
https://termly.io/pricing/ · https://termly.io/our-terms-of-use/ · https://getterms.io/pricing ·
https://getterms.io/our-terms-of-service · https://www.docracy.com/

### Mexico / LatAm-specific standard forms — **there are none**

- **CANIETI — verified negative.** Fetched homepage and `/otros-recursos`: boletines, convenios,
  SIEM, Talent Hub, general advisory on request. **No contratos modelo, no template library, no
  SaaS contract resource.** https://canieti.org · https://canieti.org/otros-recursos
- **AMITI — UNVERIFIED.** Site 403s to fetchers. Public surface shows no template library; member-gated
  areas not inspectable. Zero positive evidence, not a hard negative.
- **PROFECO** maintains contrato-de-adhesión registries (`rpca.profeco.gob.mx`,
  `rcal.profeco.gob.mx`) distinguishing *Contrato Tipo* from *Contrato No Tipo* — but that is a
  consumer regime, and see Q1(d): software/SaaS is not on the mandatory list.
- **Spanish-language SaaS templates:** none credible for Mexico. `contrato-experto.com` offers a free
  "Modelo Contrato SaaS" but it is jurisdiction-agnostic with `[País o Estado]` placeholders and
  Spain-flavoured (references DNI).
- **Mexican legal-tech subscriptions** (drafting-adjacent, see Q1(c) for prices): **LEX-IA**
  $99.90 MXN/mo (480+ contracts incl. T&C), **ContratosMX** $499 MXN per custom contract,
  **EasyLex** $799/mo + IVA, **Legalario** $700–$3,000 MXN/mo (**but Legalario is e-signature SaaS,
  not drafting**). **UNVERIFIED** whether any carries a real SaaS-ToS form.
- **Spanish translations of Common Paper / Bonterms: not found.** No "English only" statement either
  — treat as *not found*, not *confirmed absent*.

### Formation-doc providers — verified negative

- **Stripe Atlas**: fetched the exhaustive document list (Certificate of Incorporation, Bylaws,
  83(b), CIIAA, Restricted Stock Purchase Agreement, IRS forms…). **No customer ToS, no SaaS
  agreement, no privacy policy.** https://docs.stripe.com/atlas/incorporation-documents
- **Clerky**: Formation, Fundraising, Hiring, Maintenance, Commercial — **Commercial is NDAs only**.
  https://www.clerky.com/
- **Cooley GO — UNVERIFIED** (403 to fetchers). A "Terms of Use Generator" page reportedly exists at
  `cooleygo.com/documents/terms-use/`; whether it emits a full SaaS agreement or a lightweight
  website ToU could not be confirmed. A "Cooley SaaS Agreement" form PDF is distributed via the ACC:
  https://www.acc.com/sites/default/files/program-materials/upload/Cooley%20SaaS%20Agreement%20ACC%20Form.pdf

---

## Q1(b) — Copying / adapting a competitor's ToS

### The documented incident: Eco v. Pebble (May 2022)

Eco CEO Andy Bromberg publicly accused YC W22 company Pebble: ***"They copy/pasted our T&Cs and
Privacy Policy. They copied our funnel questions. They stole our blog posts."*** — plus copied
marketing copy, business-model components, KYC onboarding, and alias accounts.

**The load-bearing fact is the outcome: no legal action was pursued.** Pebble's founders called it a
*"difference of opinion."* Eco decided against litigation. The entire consequence was
**reputational** — a TechCrunch story and two front-page HN threads.

Sources: https://techcrunch.com/2022/05/23/ceo-of-fintech-app-eco-alleges-that-y-combinator-backed-pebble-copied-its-business-model-materials/ ·
https://news.ycombinator.com/item?id=31489465 ·
https://www.inc.com/joe-procopio/when-is-it-theft-breaking-down-eco-versus-pebble-startup-copycat-incident.html

### Are ToS copyrightable? The honest answer

**No reported case was found of anyone successfully suing over a copied Terms of Service.** Multiple
search angles, case law, legal blogs, tech press — not one. That absence is the finding.

**Discount the scare content.** Every top result asserting serious danger ("up to $150,000 per
copied part") is published by a company that **sells ToS generators** — TermsFeed, Termly,
PrivacyPolicies.com, WebsitePolicies. None cites a case. Direct conflict of interest.

**What the actual authority says.** Kenneth Adams (*A Manual of Style for Contract Drafting*, the
leading reference on contract language):

> *"If I copy someone else's contract verbatim, changing only the party names, dates, and other
> factual information, a court would likely find the contract **insufficiently original and
> creative** to support a claim of copyright violation…"*

> *"So you should feel free to copy a run-of-the-mill compilation contract, not because doing so
> constitutes fair use, but because the likelihood of someone knowing of that copying and having any
> interest in preventing it are exceedingly remote."*

> *"**In mainstream drafting, copying-and-pasting from other contracts is certainly no sin.**…
> everyone is copying from a common pool of contract verbiage that they tweak to suit their own
> purposes."*

His one carve-out: genuinely novel drafting that improves on mainstream dysfunction *would* be
protectable. Boilerplate isn't.
Sources: https://www.adamsdrafting.com/the-contract-drafter-as-copyright-violator/ ·
https://www.adamsdrafting.com/contract-drafting-and-plagiarism/

**Supporting case law.** *Continental Casualty Co. v. Beardsley*, 253 F.2d 702 (2d Cir. 1958) — the
leading authority on copyright in commercial/legal forms. Nothing per se prevents copyrighting
forms, but where specific language is essential to accomplish a commercial result, infringement must
be construed so narrowly as to leave the underlying thought free. Protection is real but extremely
thin (cf. the blank-forms doctrine).
https://law.justia.com/cases/federal/appellate-courts/F2/253/702/145613/

**The gate almost nobody clears.** Under *Fourth Estate v. Wall-Street.com* (SCOTUS), the US
Copyright Office must **actually grant registration before you can sue**; registration is also the
prerequisite for statutory damages and fees. Essentially no SaaS company registers its ToS. The
much-quoted $150,000 figure is unavailable without it.
https://www.americanbar.org/groups/litigation/resources/newsletters/intellectual-property/scotus-fourth-estate-v-wall-street-dotcom/

**UNVERIFIED:** all of the above is US law. Mexican treatment of contract text under the Ley Federal
del Derecho de Autor was not researched.

### The distinction that actually matters

- **Using the clause inventory / structure as a checklist** — reading five competitors to learn what
  sections a gym-booking platform agreement must address — is **universally done and carries no
  risk.** It is what `docs/Context/2026-08-10-tos-gap-analysis.md` already is.
- **Copying verbatim** carries negligible *copyright* risk but two real ones:
  1. **Wrong-facts risk.** A copied document describes someone else's business — their entity, their
     jurisdiction, their SLA, their sub-processors. A document that says you do things you don't do
     is a manufactured misrepresentation. The FTC's OkCupid/Match settlement is the live demo: the
     theory was that the published policy didn't match actual practice — deception under Section 5,
     entirely independent of copyright.
     https://www.koleyjessen.com/insights/publications/when-privacy-policies-dont-match-reality-lessons-from-the-ftcs-okcupid-settlement
     **This is exactly the failure mode the gap analysis already flags as F1–F5** (promising PITR,
     audit logs and structured export that don't exist).
  2. **Reputational risk** — the only consequence that materialised in Eco/Pebble.

**And it's moot anyway:** Common Paper and Bonterms are free, better-drafted than nearly any
competitor ToS you'd copy, and *explicitly licence you to use them*. Copying a competitor is
strictly dominated.

---

## Q1(c) — Lawyer cost + turnaround in Mexico

### Review of a self-assembled draft (revisión)

| Source | Price | Type |
|---|---|---|
| [Prolancer — "Revisión y Elaboración de Contrato"](https://www.prolancer.com.mx/DanielaM/13674/) | **$1,100 MXN** | Real listing (price string verified via search; page render **UNVERIFIED**, DNS failed) |
| [dedinero.com.mx](https://www.dedinero.com.mx/gasto/cuanto-cuesta-contratar-a-un-abogado-en-mexico/) | $500–$1,500 MXN simple doc review | Blog **estimate** |
| [aegi.es fee table](https://aegi.es/tabla-de-honorarios-de-abogados-en-mexico-2025/) | $800–$3,000 MXN/hr general; $1,500–$3,000+/hr corporate; CDMX avg ~$2,000/hr | Blog **estimate** |
| [Cronoshare — iguala legal](https://www.cronoshare.com.mx/cuanto-cuesta/servicio-iguala-legal) | Retainer $2,500–$25,000 MXN/mo; SME band $3,000–$9,000 | Aggregated real quote requests |

### Drafting from scratch

- Real marketplace listings: [Elaboración de Contratos **$1,500**](https://www.prolancer.com.mx/RobertoSandoval/3004/) ·
  [Redacción de documentos legales **$3,000** — explicitly covers *términos y condiciones* + *avisos de privacidad*](https://www.prolancer.com.mx/Abogado/680/) ·
  [Contrato de Adhesión ante PROFECO **$4,200**](https://www.prolancer.com.mx/SolucionesJDC/83/)
- Bufete estimates: simple $1,500–$4,000; CDMX average $3,000–$10,000; complex $20,000+ —
  [bufeteabogadoscdmx.com](https://bufeteabogadoscdmx.com/cuanto-se-cobra-por-la-redaccion-de-un-contrato/)
  (**blog estimates, not price lists**).
- **Turnaround: no Mexican source publishes one.** Genuine gap.

### Productized fixed-fee (all fetched directly)

- [ContratosMX](https://contratosmx.com) — custom contract **$499 MXN**
- [LEX-IA](https://lexia.one) — **$99.90 MXN/mo**, 5 downloads/mo, 480+ contracts incl. T&C;
  disclaims *"no sustituye asesoría legal personalizada"*
- [EasyLex](https://easylex.com/contratos/) — **$799/mo + IVA**, 35+ templates
- [Legalario](https://legalario.com/landings/nuevos-planes) — $700 / $1,600 / $3,000 MXN/mo + IVA —
  **e-signature SaaS, not drafting**
- **Kubo Legal / Tu Abogado en Línea: not found as Mexican legal storefronts — UNVERIFIED.**
  Vexi is a fintech, not legal services.

### Bar / state fee schedules (aranceles)

- **Barra Mexicana (BMA) publishes NO numeric arancel** — only [ethical principles on honorarios](https://www.bma.org.mx/wp-content/uploads/2024/05/Codigo-de-Etica-XII-2016-.pdf).
  Confirmed by direct fetch.
- **Jalisco** (Decreto 21881/LVIII/07) is real and indexed: art. 25 contract drafting = **5% del
  valor del negocio**; art. 20.V written consultation = **10–30 días SMGV**. Denominated in
  **SMGV, not UMA** (verified in art. 6 — contradicts the AI-blog summaries). At 2026 SMGV
  $315.04/día → written-review band **$3,150–$9,451 MXN**. Arts. 1/28 make it a *default absent a
  written fee agreement*, i.e. a ceiling you negotiate below.
- **Estado de México** arancel (Decreto 55, **1962**) is in 1962 nominal pesos ($100 flat for a
  written consultation), never re-indexed — dead letter.
- A widely-cited *"Encuesta Nacional de Servicios Profesionales Jurídicos 2025"* ($5,000–$150,000)
  traces to a single SEO blog with no primary source — **UNVERIFIED, possibly fabricated. Do not
  quote it.**
- UMA 2026 (INEGI, DOF 9-ene-2026): **$117.31/día, $3,566.22/mes**.

### US anchor for sanity-checking (USD/MXN ≈ 17.2, Banxico FIX 6-ago-2026)

- [ContractsCounsel — ToS](https://www.contractscounsel.com/b/terms-of-service-agreement-cost) (n=73):
  drafting avg **$1,020 USD** (~$17.5k MXN), review avg **$630 USD** (~$10.8k MXN)
- [ContractsCounsel — SaaS agreement](https://www.contractscounsel.com/b/saas-agreement-cost) (n=103):
  drafting avg **$1,180**, review avg **$850**
- [Bosin LLC published flat fee](https://www.njbusiness-attorney.com/saas-legal-package-pricing/):
  SaaS package (ToS + privacy + subscription agreement) **$4,500–5,500 USD** (~$77k–95k MXN)

**Bottom line:** a Mexican lawyer **reviewing** a strong self-assembled draft ≈ **$1,000–$10,000
MXN**. A bespoke **draft from zero** ≈ $1,500–$5,000 MXN (marketplace) to $10,000–$30,000+ MXN
(bufete). Mexican review runs roughly **one-half to one-fifth** of the US equivalent.

---

## Q1(d) — Is a lawyer legally REQUIRED in Mexico? **No.**

Nothing conditions contract validity on a lawyer, a notary, or registration.

### Consensualidad / libertad de forma (verbatim)

- **CCF 1794**: *"Para la existencia del contrato se requiere: I. Consentimiento; II. Objeto que
  pueda ser materia del contrato."* — a lawyer is not among the requisites.
  https://leyes-mx.com/codigo_civil_federal/1794.htm
- **CCF 1796**: *"Los contratos se perfeccionan por el mero consentimiento, excepto aquellos que
  deben revestir una forma establecida por la ley…"*
  https://leyes-mx.com/codigo_civil_federal/1796.htm
- **CCF 1832**: *"En los contratos civiles cada uno se obliga en la manera y términos que aparezca
  que quiso obligarse, **sin que para la validez del contrato se requieran formalidades
  determinadas**, fuera de los casos expresamente designados por la ley."*
  https://leyes-mx.com/codigo_civil_federal/1832.htm
- **CCom 78**: *"En las convenciones mercantiles cada uno se obliga en la manera y términos que
  aparezca que quiso obligarse, **sin que la validez del acto comercial dependa de la observancia de
  formalidades o requisitos determinados**."* https://leyes-mx.com/codigo_de_comercio/78.htm
- **CCom 79** carves out only contracts another law requires in escritura/solemn form — SaaS is not
  one. https://leyes-mx.com/codigo_de_comercio/79.htm
- **Ley Reglamentaria del Art. 5º Const. art. 24** defines *ejercicio profesional* as rendering
  services **to others** — drafting your own contract for your own business is not covered.
  https://leyes-mx.com/ley_reglamentaria_del_articulo_5o_constitucional_relativo_al_ejercicio_de_las_profesiones_en_el_distrito_federal/24.htm

### Electronic acceptance is fully valid (verbatim)

- **CCom 80**: *"Los convenios y contratos mercantiles que se celebren por correspondencia,
  telégrafo, o mediante el uso de medios electrónicos… **quedarán perfeccionados desde que se reciba
  la aceptación de la propuesta** o las condiciones con que ésta fuere modificada."*
  https://leyes-mx.com/codigo_de_comercio/80.htm
- **CCom 89**: *"…los principios de neutralidad tecnológica, autonomía de la voluntad, compatibilidad
  internacional y **equivalencia funcional del Mensaje de Datos**…"* https://mley.mx/CCom/articulo/89/
- **CCom 89 bis**: *"**No se negarán efectos jurídicos, validez o fuerza obligatoria** a cualquier
  tipo de información por la sola razón de que esté contenida en un Mensaje de Datos."*
  https://sdv.com.mx/compendio/codigo-comercio/articulo-89-bis/
- **CCom 90 / 90 bis** — attribution to the Emisor, incl. via *"medios de identificación, tales como
  claves o contraseñas"* or an automated system he programmed.
  https://leyes-mx.com/codigo_de_comercio/90.htm
- **CCom 93**: written-form requirements are met by a Mensaje de Datos *"siempre que la información
  en él contenida se mantenga íntegra y sea accesible para su ulterior consulta."*
  https://leyes-mx.com/codigo_de_comercio/93.htm
- **CCom 97**: a Firma requirement is met by *"una Firma Electrónica que resulte apropiada para los
  fines para los cuales se generó."* https://leyes-mx.com/codigo_de_comercio/97.htm
- **CCF 1803-I**: consent is express *"cuando la voluntad se manifiesta… por medios electrónicos,
  ópticos o por cualquier otra tecnología, o por signos inequívocos."*
- **CCF 1811 ¶2**: *"Tratándose de la propuesta y aceptación hechas a través de medios electrónicos…
  **no se requerirá de estipulación previa** entre los contratantes para que produzca efectos."*
- **CCF 1834 bis**: written-form requirements met electronically where the information is íntegra,
  *"atribuible a las personas obligadas y accesible para su ulterior consulta."*

This confirms cl. 16.1–16.5 of the existing borrador (gap analysis A20) against primary sources —
that item was flagged *"pendiente de verificación contra fuente primaria."* **It now checks out.**

### ⚠ The one finding that changes behaviour: SCJN 1a./J. 112/2025

**Jurisprudencia obligatoria desde 7-jul-2025** (Primera Sala, ADR 2558/2024, resuelto 15-ene-2025;
aprobada 25-jun-2025, publicada 4-jul-2025; registro digital **2030673**):

> *"**La sola publicación de las políticas** de compra y entrega de boletos en alguna sección de la
> página de Internet del vendedor **no resulta suficiente** para considerar que el consumidor
> expresó su conformidad con ellas al realizar una compra, pues para ello es necesario que cumpla
> con el requisito de los contratos de adhesión consistente en que **el consumidor tenga a la vista
> las cláusulas del contrato al momento de manifestar su consentimiento**."*

Practical rule commentators draw: **an affirmative act (checkbox / botón "Acepto") plus retained
evidence of it.** Sources:
[BASHAM](https://basham.com.mx/la-publicacion-de-las-politicas-de-compra-en-los-sitios-web-no-prueba-que-el-comprador-acepte-su-contenido/) ·
[Nader Hayaux & Goebel](https://www.nhg.mx/comercio-electronico-criterio-de-la-scjn-en-proteccion-de-los-usuarios/) ·
[KPMG](https://kpmg.com/mx/es/tendencias/2025/01/flash-nuevo-precedente-para-empresas-de-comercio-electronico.html) ·
[SCJN tesis PDF](https://www.scjn.gob.mx/sites/default/files/comunicacion_digital/2025-07/Tesis_publicacion_semanal_04_07_2025.pdf)

NHG confirms the reasoning is **framed in consumer/adhesion terms with no B2B discussion** — but it
rests partly on CCF 1794/1796, which are not consumer-specific. `sjf2` returns 403 → **full verbatim
texto UNVERIFIED**; rubro and criterio above are from secondary legal sources.

**What this means for iBookit:** "publish the ToS at a URL and rely on continued use" is the exact
posture this criterion attacks. It does **not** invalidate the ruled model — it makes the
*affirmative acceptance act plus stored evidence* the load-bearing half of it. The `acuerdo_aceptacion`
machinery (usuario, fecha, IP, versión, SHA-256) that survived the anexo deletion is precisely the
right answer; what's missing is a surface that invokes it (gap analysis A20: *"Sin superficie que lo
invoque"*).

### Contratos de adhesión / PROFECO registration — **not required for this product**

- **LFPC 85** defines contrato de adhesión as *"el documento elaborado unilateralmente por el
  proveedor, para establecer en formatos uniformes los términos y condiciones…"*, requiring Spanish,
  legible characters, uniform font, and no *"prestaciones desproporcionadas… obligaciones inequitativas
  o abusivas."* https://leyes-mx.com/ley_federal_de_proteccion_al_consumidor/85.htm
- **LFPC 86**: registration is required **only where the Secretaría, via a NOM**, subjects a contract
  type to it. Not a blanket rule.
- **LFPC 87**: unregistered contracts *where registration is required* "no producirán efectos contra
  el consumidor."
- **LFPC 90** voids six clause types in adhesion contracts — notably **I. unilateral modification by
  the provider**, **II. liability disclaimers**, **VI. waiver of the law / foreign forum**.
  https://leyes-mx.com/ley_federal_de_proteccion_al_consumidor/90.htm
- **DECISIVE:** PROFECO's own mandatory list has **exactly 14 sectors** — tiempo compartido,
  funerarios, atención médica, muebles, vehículo usado/nuevo, materiales de construcción, animales,
  extintores, tintorerías, reparación de vehículos, electrodomésticos, mutuo prendario, casa
  habitación. **No software, SaaS, cloud, apps, digital platforms, or gyms.**
  https://rcal.profeco.gob.mx/ContratosObligatorios.jsp → **no PROFECO registration obligation.**
  Voluntary registration exists (https://rcal.profeco.gob.mx/rcal.jsp).

This answers the gap analysis's "Pregunta adicional 1" to the abogado.

### The B2B carve-out — LFPC art. 2 fracc. I (verbatim)

> **I. Consumidor:** la persona física o moral que adquiere, realiza o disfruta **como destinatario
> final** bienes, productos o servicios. Se entiende también por consumidor a la persona física o
> moral que adquiera, almacene, utilice o consuma bienes o servicios con objeto de **integrarlos en
> procesos de producción, transformación, comercialización o prestación de servicios a terceros,
> únicamente para los casos a que se refieren los artículos 99 y 117 de esta ley.**
>
> Tratándose de **personas morales** que adquieran bienes o servicios para integrarlos en procesos de
> producción o de servicios a terceros, **sólo podrán ejercer las acciones** a que se refieren los
> referidos preceptos **cuando estén acreditadas como microempresas o microindustrias**…

https://mley.mx/LFPC/articulo/2/

**Reading for this product:** a gym buying booking software uses it *to provide services to third
parties (its members)* → it is **not** a "destinatario final". LFPC therefore reaches it **only** for
arts. 99 (queja) and 117 (PROFECO as árbitro) — and, **if the gym is a persona moral**, only when
accredited as microempresa. **Note the asymmetry: that microempresa condition is written only for
personas morales**, so a gym that is a *persona física con actividad empresarial* arguably keeps
arts. 99/117 standing without accreditation. Either way both routes are capped at operations not
exceeding **$760,889.82 MXN** for 2026 (up 3.8% from $733,040.22; indexed per LFPC 129 BIS, DOF
23-dic-2025 — [IDC](https://idconline.mx/corporativo/2026/01/08/multas-profeco-2026-nuevos-montos-y-sanciones),
[CEG Legal](https://ceglegal.mx/nuevos-montos-legales-2026-ley-federal-de-proteccion-al-consumidor-y-codigo-de-comercio/)).

**UNVERIFIED:** no Mexican tesis was found squarely holding that a business buying software for its
operations is not a "consumidor." The analysis rests on statutory text. **Practical consequence:**
because the carve-out isn't fully settled, do **not** draft as if LFPC 90 could never bite — write
the modification clause with notice + a termination right (see Q4) rather than as a bare unilateral
reservation. That costs nothing and removes the argument.

**LFPC 76 bis** is expressly limited to *"las relaciones entre proveedores y consumidores"* in
electronic transactions → does not bind this B2B contract. (Correction to a common premise: the
identity/domicile duty is **fracc. III**, not I. And **fracciones VIII and IX are brand new** —
decree DOF 12-dic-2025, in force 13-dic-2025: recurring-charge disclosure, express informed consent,
5-day pre-renewal notice, immediate-cancellation mechanism.
[DOF](https://www.dof.gob.mx/nota_detalle.php?codigo=5775999&fecha=12%2F12%2F2025) ·
[Greenberg Traurig](https://www.gtlaw.com/en/insights/2025/12/reformas-a-la-ley-federal-de-proteccion-al-consumidor).
GT confirms scope is consumer-only. **These are directly relevant to any member-facing surface
iBookit renders for gyms** — i.e. the gimnasio↔miembro layer, not this document.)

**No SaaS/cloud-specific contract-form obligation exists in Mexico.** Obligations are tax (RFC, CFDI,
16% IVA) and data protection, not contract form.

---

## Q2 — Persona física con actividad empresarial as the provider

### Lawful: yes

- **CCom art. 3**: *"Se reputan en derecho comerciantes: I.- Las personas que teniendo capacidad
  legal para ejercer el comercio, hacen de él su ocupación ordinaria…"*
  https://sdv.com.mx/compendio/codigo-comercio/articulo-3/
- **CCom art. 19** (verbatim): *"La inscripción o matrícula en el registro mercantil será
  **potestativa** para los individuos que se dediquen al comercio y obligatoria para todas las
  sociedades mercantiles…"* → **no Registro Público de Comercio filing needed.**
  https://leyes-mx.com/codigo_de_comercio/19.htm
- CCom art. 75 lists actos de comercio incl. fracc. V *empresas de abastecimientos y suministros*
  and a catch-all in XXV.

### Tax

Régimen de Actividades Empresariales y Profesionales = SAT clave **612**; **RESICO** = clave **626**.
RESICO ceiling **confirmed at $3,500,000 MXN/año**, LISR art. 113-E: *"…siempre que la totalidad de
sus ingresos propios de la actividad… no hubieran excedido de la cantidad de $3,500,000.00"*
(https://sdv.com.mx/compendio/ley-isr/articulo-113-e/) — **unchanged for 2026**
([Fiscaly](https://fiscaly.mx/blog/resico-personas-fisicas-2026-guia-completa)); only a *proposed*
rate bump (2.5%→2.75% on the $2.5M–$3.5M band). RESICO ISR is 1.00%–2.50% on gross, no deductions.
Requires RFC + e.firma + CFDI + 16% IVA on services. (SAT's own regime page 403'd → **UNVERIFIED
beyond snippets**.)

### Common in practice: yes — and the trigger to incorporate is *investors*, not contract validity

[Delvy](https://delvy.es/sapi-o-delaware-tech-founder-mexico/): *"el capital tech sofisticado rara
vez invierte directamente en sociedades mexicanas"* — local funds want a SAPI de C.V., institutional
VCs want Delaware/Cayman; **absent a term sheet, staying persona física for 2–3 years is described as
reasonable.** See also [Klar](https://www.klar.mx/post/persona-fisica-o-persona-moral-en-mexico-cual-elegir).

### The honest tradeoff: unlimited personal liability

- **CCF art. 2964** (verbatim): *"El deudor responde del cumplimiento de sus obligaciones con **todos
  sus bienes**, con excepción de aquellos que, conforme a la ley, son inalienables o no
  embargables."* https://leyes-mx.com/codigo_civil_federal/2964.htm
- vs **LGSM art. 58** (S. de R.L., *"socios que solamente están obligados al pago de sus
  aportaciones"*) and **art. 87** (S.A., *"socios cuya obligación se limita al pago de sus
  acciones"*).
- Narrow shields: patrimonio de familia (CCF 727 — **exact wording UNVERIFIED**) plus local
  civil-procedure bienes inembargables lists. (Correction: the bienes-exceptuados-de-embargo list at
  art. 544 is in the **Código de Procedimientos Civiles de la CDMX**, not the CCF.)

**Crucially: enforceability of the ToS is unaffected by entity choice.** This is purely risk
allocation. That reframes the constitution of the persona moral (Gate 1) from a *blocker* on
publishing terms to a *risk-reduction* item that can proceed in parallel — and it makes **B1 (tope de
responsabilidad)** in the gap analysis materially more urgent, because with no cap and no corporate
veil, exposure runs to the founder's personal patrimonio.

### Identifying the provider in the text

No LFPC obligation reaches this B2B ToS (76 bis is consumer-scoped). The drivers are (a) general
contract law — identify the contracting party (nombre, RFC, domicilio) — and (b) the paired **aviso
de privacidad**, which must state *identidad y domicilio del responsable* (gap analysis C3, still
MISSING).

⚠ **The LFPDPPP was REPLACED**: new law published **DOF 20-mar-2025, in force 21-mar-2025**; INAI
extinguished, authority now the **Secretaría Anticorrupción y Buen Gobierno**
([Garrigues](https://www.garrigues.com/es_ES/noticia/mexico-nueva-ley-federal-proteccion-datos-personales-posesion-particulares-introduce),
[BASHAM](https://basham.com.mx/en/nueva-ley-federal-de-proteccion-de-datos-personales-en-posesion-de-los-particulares-publicada-en-el-diario-oficial-de-la-federacion/)).
The *requirement* is confirmed; **the article number under the new law is UNVERIFIED** (art. 15-I was
old numbering; arts. 21–23 in the new law are ARCO rights, so the aviso-contents article sits
elsewhere). Verify against the DOF text before shipping C3.

---

## Q3 — Assignment / novation to a future persona moral

This answers gap-analysis item **B17** and "Pregunta adicional 3" to the abogado.

### Real clauses from live SaaS ToS (verbatim)

- **[Stripe SSA §11.10](https://stripe.com/legal/ssa)**: *"…Stripe podrá ceder y transferir sus
  derechos y obligaciones en virtud del presente Contrato (en su totalidad o en parte) **sin el
  consentimiento del Usuario**."*
- **[Atlassian §20.3](https://www.atlassian.com/legal/cloud-terms-of-service)** — the most complete
  template: customer needs consent **but** may assign *"to its successor resulting from a merger,
  acquisition, or sale of all or substantially all of Customer's assets… provided that Customer
  provides Atlassian with prompt written notice… and the assignee agrees in writing to assume all of
  Customer's obligations"*; unauthorised attempts are *"null and void"*; *"Atlassian may assign its
  rights and obligations under this Agreement (in whole or in part) without Customer's consent."*
- **[GitHub ToS §S.2](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service)**
  — broadest: *"GitHub may assign or delegate these Terms of Service… to any person or entity at any
  time **with or without your consent**…"*
- **[Vercel §21](https://vercel.com/legal/terms)**: *"…Vercel may assign or transfer this Agreement,
  in whole or in part, without restriction."*
- **[Linear §11.9](https://linear.app/terms)**: mutual consent with a carve-out for Linear *"in
  connection with a merger, acquisition, corporate reorganization, or sale of all or substantially
  all Linear's assets."*
- **Spanish-language and structurally closest to iBookit's fact pattern — [Jüsto, Cláusula XV
  CESIÓN](https://faq.justo.mx/hc/es-419/articles/4405741100052-T%C3%A9rminos-y-Condiciones)**:
  *"…la Empresa podrá ceder los presentes Términos y Condiciones a cualquier tercero que le suceda en
  el ejercicio de su negocio o en que asuma la titularidad de los Medios Digitales, por cualquier
  título posible, **previa notificación a los Usuarios** para tal efecto."* — provider assigns to a
  business successor **on notice only, no re-acceptance**. (**UNVERIFIED-by-direct-fetch**, 403;
  snippet-sourced.)

### Mexican law — with three corrections to commonly-cited article numbers

**Cesión de derechos (CCF 2029–2050 — range confirmed):**
- **2029**: *"Habrá cesión de derechos cuando el acreedor transfiere a otro los que tenga contra su
  deudor."*
- **2030 — this is the article that answers the consent question, not 2031**: *"El acreedor puede
  ceder su derecho a un tercero **sin el consentimiento del deudor**, a menos que la cesión esté
  prohibida por la ley, se haya convenido no hacerla o no le permita la naturaleza del derecho."*
- **Corrections:** 2031 is about the originating act, not prohibition-by-agreement. **2033** is
  **form** (*"puede hacerse en escrito privado que firmarán cedente, cesionario y dos testigos"*).
  **2036** is the **notice** article: *"…para que el cesionario pueda ejercitar sus derechos contra
  el deudor, deberá hacer a éste la notificación de la cesión…"* **2034** governs effect against
  third parties via fecha cierta.

**Cesión de deudas (CCF 2051–2057 — range confirmed):**
- **2051**: *"Para que haya sustitución de deudor es necesario que el acreedor consienta **expresa o
  tácitamente**."*
- **2052**: tacit consent presumed *"cuando permite que el sustituto ejecute actos que debía ejecutar
  el deudor… siempre que lo haga en nombre propio."*
- **2054 — the cautionary one**: *"…pasado ese plazo sin que el acreedor haya hecho conocer su
  determinación, **se presume que rehúsa**."* **Silence = refusal.**
- **2055**: third-party guarantees cease on debtor substitution unless the third party consents.

**Does advance ToS consent satisfy 2051? — GENUINE OPEN QUESTION.** No Mexican statute, SCJN
criterion or law-firm article was found either way despite targeted searching. The only support
located is **Spanish (not Mexican) civil doctrine**
([noticias.juridicas.com](https://noticias.juridicas.com/conocimiento/articulos-doctrinales/4588-la-cesion-del-contrato-en-la-doctrina-civil/),
**UNVERIFIED-by-direct-fetch**): *"Cuando uno de los contratantes se reserva desde el primer momento
el derecho de ceder su posición en el contrato, el consentimiento inicial de la otra parte no tiene
que ser reiterado, pues es forzosa la aceptación de la cesión ya prevista."* Note 2051 expressly
admits **tacit** consent — textually friendlier to advance consent than a strict-writing rule — but
2054's silence-equals-refusal default cuts the other way.

**Cesión de posición contractual is not expressly codified** in the CCF (only the two separate
chapters). Doctrinal basis is autonomía de la voluntad + **CCF 1858** (verified verbatim): *"Los
contratos que no están especialmente reglamentados en este Código, se regirán por las reglas
generales de los contratos; por las estipulaciones de las partes…"*
https://leyes-mx.com/codigo_civil_federal/1858.htm. Recognised in **SCJN Tesis 271459 "CESION DE
CONTRATOS"** (Sexta Época, Tercera Sala) — **full text UNVERIFIED**, sjf2 403s.

**Novación (CCF 2213 / 2215):** *"La novación nunca se presume, debe constar expresamente."* Because
novación **extinguishes** the old obligation (wiping accrued rights and history), **cesión — not
novación — is the right tool** for the incorporation transfer.

**⚠ Correction — CCom arts. 389–391** (mercantile credits; a B2B SaaS contract is mercantile).
**Art. 390 does NOT relax the notice rule — it tightens it**: *"La cesión producirá sus efectos
legales con respecto al deudor, desde que le sea notificada **ante dos testigos** y contra terceros a
partir de su inscripción en… el Registro Único de Garantías Mobiliarias…"*

**Practical synthesis (what the sources support):** the rights side is easy (CCF 2030 — no debtor
consent needed). The obligations side is exposed, and the sources do not settle whether an advance
ToS clause discharges 2051. The pattern matching both the statutes and the real-world clause corpus
is the **Jüsto/Atlassian shape**: express advance consent in the ToS **plus** actual written notice
to each gym at the moment of transfer **plus** the new entity's written assumption of all
obligations — belt-and-braces across 2036, 2051 and 2054, rather than relying on advance consent
alone.

**Gap:** no Mexico-specific law-firm authority on SaaS assignment-on-incorporation surfaced. If this
becomes load-bearing, it needs vLex México / IDC or a Mexican tech-transactions boutique.

---

## Q4 — How gym/booking SaaS bind sales-led customers

### Acceptance clauses, verbatim

| Vendor | Enumerated triggers | Status |
|---|---|---|
| **ABC Glofox** | click box **OR** execute Order Form **OR** access platform | VERIFIED |
| **Zen Planner / Daxko** | click accept **OR** sign (electronically or otherwise) **OR** actually access/use | VERIFIED |
| **Xplor** | execute the Order Form (no use-based fallback at all) | VERIFIED |
| **ABC Trainerize** | access/use **OR** click "I ACCEPT" | VERIFIED |
| **PushPress** | access/use/upload **OR** create account / click "Sign Up" | VERIFIED |
| **Mindbody** | access or use (Order Forms exist but are NOT an acceptance trigger) | VERIFIED |
| **Wodify** | use only | VERIFIED |
| **Gymdesk** | use only | VERIFIED |
| **Perfect Gym** | sign the MSA by e-signature | VERIFIED |
| **LegitFit** | no explicit clause found; refs "the Subscription Agreement" | PARTIAL |
| **Virtuagym** | — | **UNVERIFIED** (no live page fetched) |
| **TeamUp** | — | **UNVERIFIED** — naming trap, see below |

**ABC Glofox** — https://www.glofox.com/legal/terms-of-use/ — the three-prong pattern, exactly:

> "BY ACCEPTING THESE TERMS, EITHER BY **CLICKING A BOX** INDICATING YOUR ACCEPTANCE OR BY
> **EXECUTING AN ORDER FORM THAT REFERENCES THESE TERMS** OR BY **ACCESSING ANY PORTION** OF THE
> GLOFOX PLATFORM, YOU CONSENT TO THE TERMS OF THE AGREEMENT."

Order Form definition: *"Glofox's quote or ordering document (including online versions) accepted by
a subscriber via purchase order or other ordering document submitted to Glofox… Upon execution by
the parties or confirmation and placement of the order, each Order Form will be subject to the terms
and conditions of the Agreement."*

**Zen Planner / Daxko** — https://www.daxko.com/service-agreement (extracted via pdftotext):

> "The services provided to the Customer identified in the Order Form are subject to Customer's
> assent to the terms and conditions contained in or incorporated by reference in the Order Form…
> CONTACT ACCEPTS THESE TERMS AND CONDITIONS ON BEHALF OF THE ENTITY BY (1) CLICKING ACCEPT OR
> OTHERWISE SIGNING (ELECTRONICALLY OR OTHERWISE) OR (2) ACTUALLY ACCESSING OR USING THE SERVICES."

**Xplor** — https://xplor.com/wp-content/uploads/sites/23/2024/05/231026-Xplor-US-SaaS-Terms-Online-v1-2.pdf
— the purest Order-Form-only model, and its definition is the one to copy: *"Order Form means the
order form (**in whatever form**) signed by **or otherwise accepted** by the parties **in which these
Terms of Service are referenced**, including any and all Annexes."* That language is deliberately
built to cover an emailed PDF or a confirmed quote, not just a wet signature.

**Mindbody** — https://www.mindbodyonline.com/company/legal/terms-of-service — *"By accessing or
using the Services… you are indicating that you have read this Agreement and agree to be bound by its
terms."* Order Forms govern precedence only: *"In the event of a conflict between an Order Form and
this Agreement, the Order Form will control."*

**ABC Trainerize** — https://www.trainerize.com/businessTerms/ — *"BY ACCESSING OR USING THE SITE OR
SERVICE, OR BY CLICKING ON THE 'I ACCEPT'… BUTTON…"* Its update clause is the best in the scan (see
Q5).

**Naming trap worth recording:** `teamup.com` is **Teamup Calendar**, a different company from the
gym vendor at `goteamup.com` (whose terms page does not resolve). The earlier competitor scan
(`docs/Context/2026-08-10-dpa-acceptance-competitor-norms.md`) quotes `teamup.com` for "TeamUp" —
**that row may be attributing the wrong company's terms.** Worth a correction pass if TeamUp is ever
cited as evidence.

### (a) The Order Form route is the B2B standard

Common Paper's own guidance names iBookit's exact situation: *"This also enables **hybrid models,
where you sign an order form with custom business terms that reference the legal terms in your TOS
posted online**"* (https://commonpaper.com/blog/saas-contracts/). Bonterms uses the identical
architecture — *"Cover Page means a Bonterms cover page or other document that (a) incorporates these
Bonterms Cloud Terms by reference…"* (https://bonterms.com/forms/bonterms-cloud-terms-v1). Bonterms'
*online* variant drops the signature: binding *"effective upon the earlier to occur of Customer's
first access to the Cloud Service or entry into an Order"*
(https://bonterms.com/standard/online-cloud-terms).

**But incorporation-by-URL has sharp drafting requirements.** Mintz: *"courts have held that such
language lacks the parties' specific intent to incorporate the terms found at the URL"* when the
contract merely says terms are "found at" or "subject to" a webpage — and *"If a contract links to a
general webpage ending in '/legal/', you cannot rely on terms that may be posted to other URLs from
the same root unless the contract specifically references those terms **by URL and by name**."*
https://www.mintz.com/insights-center/viewpoints/2866/2021-03-30-enforcing-click-through-and-url-terms

Brooks Pierce reports courts enforcing online terms incorporated into purchase orders, invoices,
order confirmations and signed agreements — with failures where the reference was weak (*Affinity
Internet*: "subject to" instead of "incorporated by reference"; *Manasher v. NECC Telecom*: reference
buried at the bottom of page two). Their drafting checklist: conspicuous (caps/bold) incorporation
language, the literal words *"incorporated by reference"*, exact document title matching the website,
the full web address, hard copies on request, reference in the entire-agreement clause, and
**maintain archives of all terms versions with effective dates**.
https://www.brookspierce.com/publication-Enforceability-of-Online-Terms-and-Conditions-Incorporated-into-a-Written-Contract

**Upshot:** `"Esta Orden de Servicio incorpora por referencia los Términos de la Plataforma iBookit,
versión 2026-08-10, publicados en https://…/terminos/2026-08-10"` — named, versioned, pinned — is
enforceable. `"Sujeto a los términos en ibooki.lat/legal"` is the formulation courts have rejected.

### (b) Use-based acceptance — common, but the weakest prong

Verified vendors relying on use **alone**: Mindbody, Wodify, Gymdesk. Common ≠ safe:

- **Clickwrap is the enforceable one.** *Meyer v. Uber* enforced it: an affirmative click on a button
  whose text tied the click to the terms, with adjacent hyperlinks.
- **Browsewrap generally fails.** *Nguyen v. Barnes & Noble* (9th Cir.): a conspicuous hyperlink on
  every page, with no prompt to take any affirmative action, gives **no constructive notice** even
  when the link sits close to the button the user must click.
- *Specht v. Netscape*: terms on a submerged screen below the download button are not notice.
- **Berkson v. Gogo** (E.D.N.Y. 2015) coined "sign-in wrap" and held Gogo's **unenforceable** —
  worth flagging because it's often misremembered as an enforcement win.
  https://www.cooley.com/news/insight/2015/new-york-district-court-articulates-new-test-for-assessing-the-validity-and-enforceability-of-online-agreements
- **Current 9th Cir. test** (*Berman v. Freedom Financial*; *Chabolla v. ClassPass*, Feb 2025, 2-1):
  (1) reasonably conspicuous notice, (2) an action that **unambiguously manifests assent**. ClassPass
  failed both — notice too far from the action, font *"timid in both size and color"*, button said
  "Continue" while the notice said "by signing up."
  https://www.hunton.com/privacy-and-cybersecurity-law-blog/its-a-wrap-the-latest-from-the-ninth-circuit-on-sign-in-wrap-agreements

**Does B2B sophistication help?** Modestly. Browsewrap has been enforced *"only against 'knowledgeable
accessors, such as corporations, not against individuals'"*, and a Jan-2026 decision (*OCLC v. Anna's
Archive*) upheld one against a sophisticated party with an extensive pattern of use. Courts also
weigh long-term relationships more favourably than one-off purchases.
https://www.mondaq.com/unitedstates/contracts-and-commercial-law/1669006/the-enforceability-of-online-wrap-agreements-across-key-jurisdictions

**For iBookit:** a Mexican gym owner paying monthly for years, whose staff use the product daily, is
exactly the "knowledgeable accessor in a long-term relationship" profile where use-based acceptance
is at its strongest. It is still the prong that gets litigated, and it fails hardest on precisely the
clauses iBookit most needs (B1 liability cap, B19 jurisdiction, the DPA obligations) — because those
are the "provisions that altered default rights" courts scrutinise hardest. **Use it as a fallback
prong, never as the primary.** And note this doubles down with SCJN 1a./J. 112/2025 above: two
independent authorities pointing the same way.

### (c) Invoice / email route — and the Mexican statute that settles it

Invoice-referenced terms are enforceable in principle (Brooks Pierce, above), subject to the same
tests. Caveat: an invoice arriving *after* the deal is struck is a battle-of-forms problem — it binds
only when it is the offer/order document the customer accepts, not a later confirmation.

**What the gym vendors actually make a new gym sign:**
- **Mindbody**: an **Order Form**, emailed, executed via **DocuSign**. Their own guidance: *"Your
  Order Form outlines your specific contract length, renewal terms, and notice requirements"*, and if
  you no longer have a copy *"you can request one."*
  https://www.mindbodyonline.com/business/education/blog/mindbody-contracts-cancellation-data
  (The DocuSign detail specifically is search-sourced — **UNVERIFIED** against a Mindbody support page.)
- **Glofox**: cancellation terms are *"defined in the service agreement signed with the vendor"* —
  a signed per-customer agreement exists. Onboarding support article 403'd — **UNVERIFIED**.
- **Daxko/Zen Planner and Xplor**: their MSAs structurally presuppose a per-customer Order Form ("the
  Customer identified in the Order Form", Launch Date, Exhibit B pricing) — documentary evidence of a
  sales-led order-form workflow.
- **PushPress / Gymdesk**: month-to-month, self-serve, no contract — consistent with their
  use-based-only clauses.

**Is an emailed acceptance credible for a B2B customer? In Mexico, yes — and the statute is
unambiguous.** **CCom art. 80**: the contract *"quedará perfeccionado desde que se reciba la
aceptación de la propuesta."* Combined with CCom 89 (equivalencia funcional) and 89 bis (no denial of
effect for being a Mensaje de Datos): **a B2B contract is perfected the moment you receive the
acceptance by email.** No click-wrap surface required, no FIEL required for validity between
merchants. So:

> *"Confirmo que acepto los Términos de la Plataforma iBookit, versión 2026-08-10, publicados en
> https://…"*

sent from the gym owner's own address, in reply to a quoted proposal, **is contract formation**. The
residual risk is **evidentiary** (proving the message and its integrity), not validity — which is
what NOM-151 conservation/timestamping addresses if it ever needs hardening.

US equivalent for completeness: ESIGN/UETA — email exchanges can satisfy signed-writing
requirements; the controlling element is **demonstrable intent to sign**. Best practice: state in the
sending email that the parties agree to transact electronically, and **retain the entire thread with
timestamps**. https://ironcladapp.com/journal/contract-management/electronic-signature-law

### (d) First-login in-app acceptance for a sales-provisioned account

**Documented — and Google is the cleanest reference implementation** for exactly iBookit's shape
(partner provisions the account; the customer never touched a signup form). Google Partner Sales
Console (https://support.google.com/channelservices/answer/9548324):

> "the super administrator in the customer's organization must sign a new Google Terms of Service."
> "**the customer's account stays in a suspended state until they accept the TOS.**"
> "Billing starts immediately after you add a subscription, whether or not the customer has signed the TOS."

Plus the partner instruction: *"Follow up with your customer to make sure they sign in to the Admin
console and accept the TOS."*

**No gym/fitness vendor in this scan is documented as doing this** — a gap in the sample, not proof
none do. Closest adjacent evidence: these vendors ship first-acceptance gating **one layer down**,
for their gyms' members (LegitFit: clients must accept before booking, and *"when changes are made,
existing clients are prompted to reaccept terms the next time they book"*).

**Reconciling with the ruled model:** this is *not* the deleted anexo wall. The prior ruling
(`docs/Context/2026-08-10-dpa-acceptance-competitor-norms.md`) is that nobody blocks an
**already-onboarded, logged-in** customer with a **re-acceptance** wall for a *later update*. Google's
pattern is **first-ever acceptance on a brand-new provisioned account** — the alta itself, which is
precisely where the ruled model already puts the checkbox. Those are different surfaces and the
distinction is the one the earlier doc itself drew ("a first-open/first-install acceptance gate, not
a forced re-acceptance interruption sprung on an existing logged-in customer").

---

## Q5 — Update mechanics: what actually holds up

### The clause spectrum among verified vendors

Worst → best: **Gymdesk** (*"changes will be effective upon posting"* + *"It is your obligation to
check our current Terms & Conditions for any changes"*) → **Glofox / Daxko** (post + continued use,
30-day backstop) → **Mindbody** (in-app or email notice for material changes, expressly
non-retroactive) → **ABC Trainerize** (*"The amendments will take effect **30 days after** the date on
which the amended version is posted. **Prior to that date, the previous version of this Agreement
will continue to apply**"* + penalty-free termination during the window + 15 days' advance notice for
UK/EU) — **the best drafting model in the scan.**

### The doctrine that constrains it — three cases

- **Douglas v. U.S. District Court ex rel Talk America**, 495 F.3d 1062 (9th Cir. 2007): posting a
  revised contract without notifying the counterparty does not bind. The revised contract *"is merely
  an offer"* until accepted, and *"**parties to a contract have no obligation to check the terms on a
  periodic basis** to learn whether they have been changed by the other side."*
  https://blog.ericgoldman.org/archives/2007/07/ninth_circuit_s_1.htm
  **This is the case that kills Gymdesk's posture** — and it is the same failure mode as SCJN
  1a./J. 112/2025. Two jurisdictions, same conclusion: passive posting is not acceptance.
- **Harris v. Blockbuster** (N.D. Tex. 2009): a clause allowing modification *"at any time, with or
  without notice, effective immediately upon posting"* rendered the promise **illusory**, taking the
  arbitration clause down with it.
  https://en.wikipedia.org/wiki/Harris_v._Blockbuster,_Inc.
- **Badie v. Bank of America**, 67 Cal. App. 4th 779 (1998): a change-of-terms clause did not let the
  bank add an **entirely new material term** outside the scope of the original bargain; notice via an
  unremarkable bill insert was inadequate.
  https://law.justia.com/cases/california/court-of-appeal/4th/67/779.html

Note **Douglas** and **Harris** are two *different* failure modes — Douglas is a **notice** failure
(the change never became an accepted offer); Harris is a **consideration** failure (the whole promise
was illusory). A clause can survive one and die on the other. And **LFPC 90 fracc. I** (voiding
unilateral-modification clauses in adhesion contracts) is the Mexican analogue waiting if the B2B
carve-out is ever read narrowly.

### What makes a modification clause hold up

Per https://www.psh.com/online-contracts-we-may-modify-these-terms-at-any-time-right/ and Mintz:

1. **Advance notice through a targeted channel** — the source specifically names *"email to
   registered users"*, not passive posting.
2. **A rejection right** — the customer can quit or discontinue use **without penalty**.
3. **Affirmative assent where it matters** — re-acceptance for substantial modifications.
4. **Avoid absolute unilateral language** with no procedural safeguards.
5. **Materiality split** — housekeeping edits by posting, material edits by notice. Mindbody,
   PushPress and Bonterms all encode this (Bonterms: updates *"may not be retroactive or materially
   decrease Provider's overall obligations during a Subscription Term"*).

### Notice channel verdict

**Just updating the page and bumping "last updated" is NOT sufficient** — that is the Douglas fact
pattern and the Gymdesk posture. Email to the account contact is the channel practitioners name
explicitly; in-app notice is what Mindbody actually uses (*"we'll also notify you within the Software
Service or by sending you an email"*).

**For iBookit** — a sales-led B2B relationship where a verified admin email already exists for every
gym — the defensible configuration is **email to the account contact + an in-app banner, with a
30-day delay and a penalty-free exit**, copying Trainerize's drafting. This is gap-analysis item
**A18**, currently *Producto: **No*** — no tenant-notice channel exists in the product at all.

---

## Recommended route for iBookit

**The cheapest credible path to a published, enforceable-enough ToS. Lawyer = review, not blocker —
with one honest exception, named at the end.**

### Step 1 — Take Common Paper's Terms of Service standard as the base text. Cost: $0.

CC BY 4.0, freely modifiable, purpose-built for **posted click-to-accept B2B SaaS**, drafted by 40+
attorneys, YC-co-hosted, with a **DPA module** that matches the ruled "one document, DPA
incorporated" model. The Cover Page / Standard Terms split means governing law and fees are fill-ins.
This single move closes most of gap-analysis **Section B** — B1 liability cap, B2 indirect damages,
B3 warranties/"as is", B7 term & termination, B8 suspension, B9 acceptable use, B10/B11 IP and data
ownership, B13 confidentiality, B14 indemnity, B16 force majeure, B17 assignment, B20/B21 boilerplate
— which is *the entire reason the gap analysis reads HAVE = 0*. Do not draft these from scratch and
do not pay anyone to.

Pull the **ancillary** docs (cancellation, refund, use restrictions, security overview) from
Basecamp's CC BY 4.0 repo for B4/B5/B8/B9 tone.

Do **not** use a generator (Termly/GetTerms grant a revocable licence with no ownership, and
GetTerms' terms warn documents *"may become invalid"* if you stop paying). Do **not** copy a
competitor — negligible copyright risk, but it manufactures the exact wrong-facts problem the gap
analysis already flags as F1–F5.

### Step 2 — Merge the existing borrador as the Mexican data-protection layer. Cost: $0 (own time).

`docs/legal/gate0-borradores/anexo-tratamiento-datos.md` already contains A1–A20 mapped to
Reglamento 2011 arts. 50–52 — content Common Paper's GDPR-shaped DPA does not have. The merge is:
Common Paper for the commercial shield, the borrador for the LFPDPPP encargado obligations, with
RED→iBookit already done. **Clear the F-flags before publishing** (F1 PITR, F2 audit log, F4 export)
— publishing an unearned promise converts a technical gap into a breach of contract, which is
strictly worse than having no document.

### Step 3 — Publish at a version-pinned, immutable URL. Cost: $0.

`/terminos/2026-08-10` with content that never changes, plus a `latest` pointer and a public archive
of every prior version. Mintz and Brooks Pierce both make this non-negotiable: reference **by name
and specific URL**, never a `/legal/` root. This closes gap-analysis **A19** (*"Falta la URL pública
canónica"*).

### Step 4 — Bind the existing manually-onboarded gyms by email today. Cost: $0.

There is no self-serve signup and **you do not need one to be bound**. Under **CCom art. 80** the
contract is perfected the moment you receive the acceptance. Send each gym a one-page **carta de
aceptación / orden de servicio** naming the legal entity, plan, price and term, with a conspicuous
clause using the literal words *"incorpora por referencia"* (not "sujeto a") plus the named, versioned
URL. Ask for a reply from the owner's own address: *"Confirmo que acepto los Términos de la
Plataforma iBookit, versión 2026-08-10, publicados en <URL>."* Retain the full thread, **and** write
the assent into `acuerdo_aceptacion` (who, when, version, SHA-256, IP) — the machinery already
exists and survived the anexo deletion.

### Step 5 — Write the acceptance clause with all three prongs. Cost: $0.

Copy Glofox's shape verbatim in structure: **click box OR execute an order form referencing these
terms OR access the platform.** Three independent theories instead of one, for zero effort. Then wire
the checkbox at alta when the signup surface exists (ruled model), and the fallback prong covers the
gap in between.

### Step 6 — Modification clause: notice + 30 days + penalty-free exit. Cost: $0.

Copy Trainerize's drafting. Do **not** copy Gymdesk's "effective upon posting / your obligation to
check" — it is the Douglas fact pattern, the Harris illusoriness problem, and LFPC 90-I all at once.
Requires building the tenant-notice channel (**A18**, currently absent).

### Step 7 — THEN pay for a review. **$1,000–$10,000 MXN**, not $30,000.

A review of a strong, complete draft — not a drafting engagement from zero. The scope is narrow and
nameable: (i) governing law/venue and the Mexican-law fit of the Common Paper commercial clauses,
(ii) the liability cap against art. 53 solidaridad, (iii) the LFPC B2B carve-out conclusion below,
(iv) the assignment clause under CCF 2051. Anchor for negotiation: Prolancer listings at
$1,100–$3,000 MXN; the Jalisco arancel written-consultation band is $3,150–$9,451 MXN and is a
**ceiling** absent a written fee agreement.

### What the research says is genuinely load-bearing (i.e. where "review" is understating it)

Three items. Everything else is a formality.

1. **The assignment-to-persona-moral clause (B17).** Whether an advance ToS consent discharges **CCF
   2051** is a *genuine open question* — no Mexican authority found either way, and **CCF 2054 makes
   silence a refusal**. Getting this wrong means re-papering every gym at incorporation. Mitigation
   that costs nothing: draft the **Jüsto/Atlassian shape** — advance consent **+** written notice at
   the moment of transfer **+** the new entity's written assumption. Belt-and-braces across 2036,
   2051 and 2054. Ask counsel about this one specifically.
2. **The liability cap (B1) against art. 53 solidaridad.** Currently **there is no cap at all**, and
   because the provider is a persona física, **CCF 2964** puts the founder's entire personal
   patrimonio behind it. This is the most expensive open item in the gap analysis and the one where a
   lawyer's judgement earns its fee.
3. **The LFPC B2B carve-out.** The statutory reading is strong (art. 2-I: a gym is not a *destinatario
   final*; PROFECO's mandatory list has 14 sectors and software is not one) — but **no Mexican tesis
   was found holding that a business buying software is not a consumidor**. Mitigation that costs
   nothing: draft as if LFPC 90 *might* apply — notice + termination right on modification, no bare
   unilateral reservation, no naked exclusion of all liability. Then the question stops mattering.

### And one thing that is NOT the lawyer's to unblock

**SCJN 1a./J. 112/2025 (binding since 7-jul-2025)** holds that publishing terms on a page is not by
itself acceptance — the counterparty must have the clauses **in view at the moment of consent**, with
evidence of the affirmative act. No lawyer can supply that; it is a **product** obligation.
`acuerdo_aceptacion` already stores usuario/fecha/IP/versión/SHA-256. What's missing is the surface
that invokes it (**A20**) and the update-notice channel (**A18**). Those two engineering items are a
larger share of real enforceability than the entire drafting question — and both are already on the
board.

**Verdict:** persona física can sign this today (**CCom 3**; registration **potestativa** under CCom
19; entity choice affects *risk allocation*, **not enforceability**). Nothing in Mexican law requires
a lawyer, a notary, or PROFECO registration for this document. The path is **free text (Common Paper
+ the existing borrador) → published at a pinned URL → bound by emailed order form under CCom 80 →
reviewed for ~$1,000–$10,000 MXN**. Waiting for a lawyer to write from zero buys nothing that Common
Paper doesn't already give away under CC BY 4.0.
