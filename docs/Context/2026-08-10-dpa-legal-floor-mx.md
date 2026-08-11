# DPA legal floor under the reformed LFPDPPP (DOF 20-Mar-2025) — research notes

Date of research: 2026-08-10. Scope: what formalizes the responsable (gym) ↔ encargado
(platform) relationship under the **current** Ley Federal de Protección de Datos
Personales en Posesión de los Particulares (nueva LFPDPPP, published DOF 20-Mar-2025,
in force 21-Mar-2025, which **abrogated** the 2010 law — Transitorio Segundo, fracción I),
and whether Terms-of-Service incorporation suffices, or a separately click-wrapped/signed
annex is required.

Primary sources used:
- Official law text (mirror of the DOF-published decree): https://www.ordenjuridico.gob.mx/Documentos/Federal/html/wo125102.html
- DOF nota (edición vespertina, 20-Mar-2025): https://www.dof.gob.mx/nota_detalle.php?codigo=5752569&fecha=20/03/2025
- Diputados (current codification, .doc confirmed as "Nueva Ley publicada... 20 de marzo de 2025"): https://www.diputados.gob.mx/LeyesBiblio/doc/LFPDPPP.doc
- 2011 Reglamento (still-applicable implementing regulation, see Q1/Q2): https://www.diputados.gob.mx/LeyesBiblio/regley/Reg_LFPDPPP.doc and https://www.diputados.gob.mx/LeyesBiblio/regley/Reg_LFPDPPP.pdf
- INAI transparency-portal criteria (Apartado PDP): https://home.inai.org.mx/?page_id=8107
- Law-firm client alerts (secondary, corroborating only): BASHAM (https://basham.com.mx/en/nueva-ley-federal-de-proteccion-de-datos-personales-en-posesion-de-los-particulares-publicada-en-el-diario-oficial-de-la-federacion/), AE Abogados (https://aeabogados.com/proteccion-datos-personales-mexico-lfpdppp/), sharkit.mx (https://sharkit.mx/nueva-lfpdppp-reglamento-pendiente/ — fetch blocked 403, cited via search snippet only, see caveat below)

---

## Q1 — Which article(s) govern the encargado relationship now, and what they require

**Finding: the new LAW itself does not re-enact a dedicated "encargado contract" article.**
I read the full text (12 chapters, arts. 1–64 + transitorios) at ordenjuridico.gob.mx and
confirmed the table of contents directly:

- Cap. I Disposiciones Generales (1–4)
- Cap. II De los Principios (5–20)
- Cap. III De los Derechos de las Personas Titulares (21–26)
- Cap. IV Del Ejercicio de los Derechos ARCO (27–34)
- Cap. V De la Transferencia de Datos (35–36)
- Cap. VI–XII (autorregulación, Secretaría, procedimientos, infracciones, delitos)

There is **no chapter titled "Del Encargado."** The word "encargada/encargado" appears only in:
- **Art. 2, fracción XII** (definition): *"Persona encargada: Persona física o jurídica que
  sola o conjuntamente con otras trate datos personales por cuenta del responsable."*
- **Art. 2, fracción VIII**: *"Días: Días hábiles"* — establishes that all day-counts in the
  law (including ARCO deadlines, Q4) are business days.
- **Art. 35** (Cap. V, Transferencia de Datos), which — mirroring old art. 36 — carves the
  encargado out of the "tercero" transfer/consent regime: *"Cuando el responsable pretenda
  transferir los datos personales a terceros nacionales o extranjeros, **distintos de la
  persona encargada**, deberá comunicar a éstos el aviso de privacidad y las finalidades..."*
  (i.e., communicating data to your own encargado is not a "transferencia" requiring the
  titular's transfer consent — same structural carve-out as the old regime).
- Art. 20 (confidentiality) binds "todas aquellas personas que intervengan en cualquier fase
  del tratamiento," which covers encargados but sets no contract-content requirement.

**The actual "what must the contract contain" rule still lives in the 2011 Reglamento**
(arts. 49–52), which I confirmed remains the operative text because:
1. The new law's Transitorio Segundo abrogates only the *2010 law*, not the Reglamento.
2. Transitorio Décimo Segundo gives the Executive **90 calendar days** from entry into force
   to issue "las adecuaciones correspondientes a los reglamentos y demás disposiciones
   aplicables" — i.e., it orders the *existing* reglamentos adjusted, which presupposes they
   remain in force until then.
3. Multiple practitioner sources (BASHAM; AE Abogados: *"El Reglamento de la LFPDPPP 2025 no
   ha sido publicado en el DOF a la fecha de este artículo"*; sharkit.mx, blocked by
   robots/403 for direct fetch but corroborated via search-result snippet) independently say
   the 90-day deadline lapsed with no new Reglamento published, and that the 2011 Reglamento
   continues to apply suppletoriamente for everything that doesn't conflict with the new law.
   **I could not find an explicit, single transitory article that says in so many words "the
   2011 Reglamento remains in force" — this is the practitioner-consensus reading of
   Transitorio Segundo (silent on the Reglamento) + Transitorio Décimo Segundo (orders it
   adjusted, not replaced) + general Mexican administrative-law doctrine that a reglamento
   survives its parent law's re-enactment until superseded. Treat "Reglamento 2011 still
   binding" as HIGH-CONFIDENCE BUT NOT TEXTUALLY EXPLICIT.**

**Reglamento arts. 49–52 (2011, still operative) — the actual floor:**
- **Art. 49**: defines encargado (persona física o moral, pública o privada, ajena a la
  organización del responsable, que trata datos por cuenta de éste) — carried into new
  law art. 2(XII) almost verbatim.
- **Art. 50**: encargado's duties — treat data only per the responsable's instructions,
  maintain confidentiality, implement the responsable's security measures, delete/return
  data at the end of the relationship, not transfer data without authorization; obligations
  of the Ley/Reglamento imposed on the responsable become enforceable against the encargado
  "en cuanto tenga la naturaleza de tal."
- **Art. 51 — the formalization article**: *"La relación entre el responsable y el encargado
  deberá estar establecida mediante cláusulas contractuales u otro instrumento jurídico que
  decida el responsable, que permita acreditar su existencia, alcance y contenido."*
- **Art. 52**: cloud-computing/SaaS-specific carve-out — a responsable may adhere to a
  provider's **standard/general contracting conditions** (i.e., non-negotiated adhesion
  terms) provided the provider's terms cover: data-protection policies consistent with the
  Ley, transparency about subcontracting, no ownership claim over the data, confidentiality,
  and mechanisms for policy-change notice, treatment limitation, security, data deletion at
  service end, and no third-party access absent a competent-authority order.

---

## Q2 — Do adhesion terms / standard ToS clauses satisfy the requirement?

**Yes — confirmed by the text itself, not just inference.** Reglamento art. 51 explicitly
says the instrument can be "**cláusulas contractuales u otro instrumento jurídico que decida
el responsable**" — i.e., the responsable's unilateral choice of legal form, so long as it
"permita acreditar su existencia, alcance y contenido" (lets the relationship's existence,
scope, and content be evidenced). Art. 52 goes further and names **standard/adhesion
contracting conditions** as an acceptable vehicle specifically for cloud/SaaS-style services
— which is the closest on-point analogue to a booking platform serving a gym.

**This is the same conclusion the old regime reached (art. 36–37 of the 2010 law + Reglamento
49–51 used near-identical "cláusulas contractuales, convenios o cualquier otro instrumento
jurídico" language)** — the new law did not tighten this; it simply didn't re-legislate it
at the statute level and left it to the (still-pending) Reglamento update.

**Caveat / floor, not ceiling:** "adhesion terms suffice" answers the *form* question. It does
not relax the *substance* requirement — the ToS/annex actually has to contain the Reglamento
art. 50/51/52 content (scope of treatment, the responsable's instructions, security measures,
confidentiality, return/deletion at termination, no unauthorized sub-transfer). A ToS clause
that merely says "we may process your members' data" without those elements would satisfy the
*form* (no separate signed document needed) but arguably not the *content* mandate. **A
click-wrapped or separately-signed annex is not legally required** — but if it exists, it's an
easy way to consolidate that mandatory content in one place for evidentiary purposes (Q3).

---

## Q3 — Evidence of acceptance expected in practice

**No INAI/SABG criterion or published sanction was found that rules explicitly on
click-wrap-vs-signed-contract sufficiency for the encargado relationship.** I attempted to
pull a concrete resolution (PPD.0057-21.pdf) but the PDF was not machine-parseable through
available tooling, and general search did not surface a sanction turning on this specific
point. **Mark this sub-question UNVERIFIED as to a specific named precedent.**

What I *did* confirm, as circumstantial evidence of practice/expectation:
- INAI's own transparency-obligations criteria (Apartado PDP, home.inai.org.mx/?page_id=8107,
  "Formato 2.2 — Deber de confidencialidad y comunicaciones de datos personales") require
  publishing a **hyperlink to a document listing the legal instruments that regulate the
  relationship with each encargado** (a spreadsheet, "Encargados.xlsx"), with a **separate,
  named category for cloud-computing providers** ("Nube.xlsx") calling out "condiciones o
  cláusulas generales de contratación." This is a *documentation/inventory* obligation for
  regulated entities under INAI's own transparency framework (not squarely proven to bind
  private LFPDPPP responsables generally — it reads as an accountability-portal format), but
  it signals the regulator's expectation: **keep a retrievable, dated record identifying which
  legal instrument governs each encargado relationship**, standard-terms or not.
- The new law's general "Responsabilidad"/accountability principle (Cap. II, arts. 5–20)
  requires responsables to be able to demonstrate compliance measures — which in practice
  means retaining acceptance evidence (timestamp, version of the terms accepted, IP/account
  identifier) even where no wet-ink signature exists, consistent with the new law's general
  embrace of valid tacit consent ("como regla general, el consentimiento tácito será válido"
  — noted across multiple client alerts, e.g. EY México, GT Law).
- **Practical recommendation (not a legal citation):** log acceptance the same way any
  click-wrap consent is logged elsewhere in the product — timestamp + version identifier tied
  to the accepting account — so the "instrumento jurídico" and the proof it was adopted are
  both retrievable if a verificación proceeding asks for them.

---

## Q4 — ARCO response deadlines under the new law

**Confirmed directly from the primary text, and unchanged in business-day count from the old
law.** New law **Article 31** (Cap. IV, Del Ejercicio de los Derechos ARCO):

> "El responsable comunicará a la persona titular, en un plazo máximo de **veinte días**,
> contados desde la fecha en que se recibió la solicitud para el ejercicio de los derechos
> ARCO, la determinación adoptada, a efecto de que, si resulta procedente, se haga efectiva
> la misma dentro de los **quince días** siguientes..."

- **20 días** (business days — Art. 2, fracción VIII defines "Días" as "Días hábiles"
  throughout the law) to communicate the determination on the request.
- **15 días hábiles** thereafter to make an approved request effective.
- Both periods extendable once, per the pattern carried from the old law (corroborated by
  kyc-systems.com's read-through, which cites "20 días (extendable 20 more)" — treat the
  exact extension mechanics as the same as pre-2025 practice; I did not find the extension
  sub-clause of Art. 31 quoted verbatim, so **the precise extension wording is UNVERIFIED**,
  only the base 20/15 numbers and the "días hábiles" definition are directly quote-verified).
- Downstream procedure (new, useful context): if the titular disagrees with the responsable's
  answer, Art. 40 gives **15 días** to file a "procedimiento de protección de derechos" with
  the new authority (Secretaría Anticorrupción y Buen Gobierno, SABG — replacing INAI per
  Transitorios Quinto–Décimo), and Art. 42 gives SABG **50 días** (extendable 50 more) to
  resolve it.

**Bottom line for Q4: the 20/15-business-day ARCO plazos are the SAME under the new law as
under the old one — they were not shortened or lengthened.** Your shipped draft's 20/15 can be
marked verified-current, not stale, sourced to new-law Art. 31 rather than old-law Art. 32.

---

## Bottom-line summary

1. **Governing articles today:** new-law Art. 2(XII) (definition), Art. 20 (confidentiality),
   Art. 35 (encargado excluded from transfer-consent regime) — but the substantive
   "what the contract must contain" rule is still **2011 Reglamento arts. 49–52**, not a
   new-law article, because the Reglamento hasn't been reissued yet (90-day deadline in
   Transitorio Décimo Segundo has lapsed per secondary sources) and nothing abrogates it.
2. **Adhesion/ToS sufficiency:** **Yes.** Reglamento art. 51 lets the responsable pick any
   instrument ("cláusulas contractuales u otro instrumento jurídico que decida el
   responsable") as long as it evidences existence/scope/content; art. 52 explicitly blesses
   standard/adhesion cloud-service terms. No separately-signed or separately-click-wrapped
   annex is legally mandated — but the ToS text itself must carry the required substantive
   content (scope, instructions, security, deletion-on-termination, confidentiality,
   no unauthorized sub-transfer).
3. **Evidence of acceptance in practice:** no specific INAI/SABG sanction or criterion found
   ruling click-wrap insufficient — UNVERIFIED as a named precedent. INAI's own transparency
   criteria expect a documented, listable "instrumento jurídico" per encargado (including a
   cloud-specific category), which is best satisfied by retaining a timestamped,
   versioned acceptance record.
4. **ARCO plazos:** confirmed unchanged — **20 días hábiles** to respond + **15 días hábiles**
   to make an approved request effective (new-law Art. 31, business days per Art. 2(VIII)).
   Extension-once mechanics corroborated by secondary source only (UNVERIFIED verbatim).
