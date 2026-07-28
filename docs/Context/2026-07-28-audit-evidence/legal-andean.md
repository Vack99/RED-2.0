# Legal: Andean bloc (Colombia, Argentina, Chile) — data-protection compliance audit for RED 2.0 LatAm expansion

Agent: legal:andean. All web sources fetched 2026-07-28. RED's architecture facts (Supabase in us-west-2/Oregon,
one shared Postgres project, no data residency controls, member PII = name/phone/email/photos/attendance/payment
status) are taken as given from the session brief; this file does not re-verify them.

---

## 0. Executive framing

RED is a single Postgres project in Oregon, USA, serving every tenant regardless of the tenant's country. Every
finding below has to be read against that fact: **the transfer question ("can member data legally leave the
member's country and sit in Oregon?") is not hypothetical — it is RED's actual architecture today**, and the three
countries in this mandate answer that question three different ways.

---

## 1. COLOMBIA — Ley 1581 de 2012 + Decreto 1377/2013 (now Decreto 1074/2015, Título 2, Capítulo 26) + Decreto 90/2018

### 1.1 Does Ley 1581 still apply, and to whom

Yes — it is the live general regime, administered by the **Superintendencia de Industria y Comercio (SIC)**,
Delegatura de Protección de Datos Personales. It grants habeas data rights (conocer, actualizar, rectificar,
suprimir) to every "titular" whose data is processed by a "Responsable del Tratamiento" (the party that decides
the purpose/means — in RED's model, **each gym**) or an "Encargado del Tratamiento" (the party that processes on
the Responsable's behalf — **RED itself**, as SaaS vendor).
Source: [Ley 1581 de 2012, Función Pública gestor normativo](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981), fetched 2026-07-28.

### 1.2 The Registro Nacional de Bases de Datos (RNBD) — who actually has to register

This is the finding that most changes the shape of the risk. RNBD registration is **not** universal — it is
gated by an asset threshold set in Decreto 90 de 2018 (amending Decreto 1074/2015): obligated parties are (a)
companies with **total assets exceeding 100,000 UVT**, (b) non-profits (ESAL) with total assets exceeding 100,000
UVT, and (c) public legal entities. Commercial establishments and company branches are explicitly **not**
obligated to register.
Source: [SIC — "Cuáles personas están obligadas a realizar el registro de bases de datos personales en el RNBD"](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cuales-personas-estan-obligadas-realizar-el-registro-de-bases-de-datos-personales-en-el-rnbd), fetched 2026-07-28.

100,000 UVT for 2026 is quoted at **≈ COP $5,237,400,000** (≈ USD $1.2–1.3M at a ~4,200 COP/USD rate — I did not
independently verify the 2026 UVT value against DIAN, so treat the USD conversion as approximate).
Source: [Nomikos S.A.S. — "RNBD: obligaciones clave para 2026 en Colombia"](https://nomikos.com.co/registro-nacional-de-bases-de-datos-rnbd-obligaciones-clave-para-2026-en-colombia/), fetched 2026-07-28.

**What this means for "registering 3,000 gyms' databases":** a standalone 150–300-member gym in Colombia is very
unlikely to individually cross ~USD $1.2M in *total assets* (not revenue). Most of RED's Colombian gym clients
would likely be **exempt from the formal RNBD filing** — but every one of them, exempt or not, still owes the full
*substantive* Ley 1581 stack regardless of registration status: privacy policy, informed consent language,
security measures, and response SLAs (below). Registration exemption is not compliance exemption.

The open question RED cannot dodge with this exemption: **does RED itself**, as the platform operator potentially
crossing 100,000 UVT in assets as it scales toward 3,000 gyms, become independently obligated to register as
Responsable for whatever purposes RED defines outside a gym's instructions (e.g., product analytics, cross-gym
benchmarking)? I found no source resolving this for a SaaS processor specifically — flagged as unresolved, not
asserted either way.

### 1.3 RNBD mechanics for those who ARE obligated

- Annual update window for non-substantial changes: **Jan 2 – Mar 31, 2026**.
- Substantial modifications: report within **10 business days**.
- New databases: report within **2 months** of creation.
- Security incidents: report within **15 business days** of detection — this incident-reporting duty runs through
  the RNBD channel and is the closest thing Colombia has to a breach-notification SLA.
- Non-registration/non-update penalty: up to **2,000 SMMLV** (see §1.5 for the general SIC fine cap, which is the
  same ceiling).
Source: [tusdatos.co — "RNBD: aspectos importantes para 2026"](https://www.tusdatos.co/blog/registro-nacional-de-bases-de-datos-rnbd-aspectos-importantes-para-este-2026), fetched 2026-07-28.

### 1.4 Habeas data rights and response SLAs

- **Consulta** (access/query): must be answered within **10 business days**; if impossible, the delay must be
  explained and the extended date given, capped at **5 additional business days**.
- **Reclamo** (correction/deletion/complaint): answered within **15 business days**, extendable and capped at
  **8 additional business days**.
- A titular can only escalate to the SIC after exhausting the consulta/reclamo process directly with the
  Responsable or Encargado (procedibilidad requirement) — i.e., RED/the gym is the first-line responder, not SIC.
Source: [WebSearch synthesis of Ley 1581 art. 14 text, Función Pública / SUIN-Juriscol](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981), fetched 2026-07-28.

### 1.5 SIC enforcement record — real fine sizes, not theoretical maximums

- Statutory cap under Ley 1581: fines up to **2,000 SMMLV** per infraction (personal/institutional), plus
  suspension of data-processing activities up to 6 months, plus closure of sensitive-data operations.
- **2025 enforcement volume**: SIC's Data Protection Division opened **101 investigations** in 2025 (up from 83 in
  2024, 55 in 2023) and issued **COP $5,157 million** in fines across the year (up from COP $4,932 million in
  2023) — that is the *aggregate* across all cases, not a per-case average.
- **Individual case sizes observed**: COP $214 million against an e-commerce company for requiring facial-biometric
  data to access an account; COP $190.547 million plus a temporary processing suspension against Risks
  International S.A.S.
Source: [Universidad Externado / SIC Sede Electrónica — "101 investigaciones e impuesto multas por $5.157 millones en 2025"](https://sedeelectronica.sic.gov.co/noticias/por-violacion-las-normas-de-proteccion-de-datos-personales-la-superintendencia-de-industria-y-comercio-ha-iniciado-101-investigaciones-e), fetched 2026-07-28.

**Read on this**: SIC enforcement is real but not existential at RED's likely scale — sub-$1M-USD fines against
identifiable, high-profile violations (biometrics, credit-bureau-adjacent data broker). This is not a GDPR-scale
enforcement regime yet.

### 1.6 Pending reform (August 2025 statutory law bill) — the single biggest live threat to this picture

The Colombian government filed a **Proyecto de Ley Estatutaria in August 2025** to update Ley 1581: strengthen SIC
supervision and raise the fine ceiling to **10,000 SMMLV or 5% of the infractor's operating revenue** — a 5x cap
increase plus a revenue-based alternative that did not exist before. As a *ley estatutaria* touching a fundamental
right (habeas data is constitutionally protected in Colombia), it requires automatic Constitutional Court review
before taking effect, which historically adds months-to-years of latency — so this is a real but not immediate
risk; treat its timeline as unresolved, not imminent.
Source: [Universidad Externado / SIC Sede Electrónica, same article as §1.5](https://sedeelectronica.sic.gov.co/noticias/por-violacion-las-normas-de-proteccion-de-datos-personales-la-superintendencia-de-industria-y-comercio-ha-iniciado-101-investigaciones-e), fetched 2026-07-28.

### 1.7 International transfers and the adequacy list — the load-bearing finding for RED's architecture

Ley 1581 prohibits transferring data to countries **without** an adequate protection level, as determined by SIC
(Circular Única, Título V, Capítulo 3, added by Circular Externa 5 de 2017). SIC's adequate-country list currently
includes (per an AsuntosLegales/Hunton report) **the United States (added August 14, 2017) and Mexico**, plus the
EU/EEA member states, the UK, Japan, South Korea, and every country the European Commission itself recognizes as
adequate (Switzerland, Canada, **Argentina**, Uruguay, Israel, New Zealand, etc.) — more than 37 countries in
total.
Sources: [Hunton — "Colombia Designates U.S. as 'Adequate' Data Transfer Nation"](https://www.hunton.com/privacy-and-cybersecurity-law-blog/colombia-designates-u-s-adequate-data-transfer-nation), fetched 2026-07-28; [AsuntosLegales — "La Superindustria avala el intercambio de datos personales con más de 37 países"](https://www.asuntoslegales.com.co/actualidad/la-superindustria-avala-el-intercambio-de-datos-personales-con-mas-de-37-paises-2613831), fetched 2026-07-28.

**This means: as of today, Colombia→Oregon (USA) is a legally clean transfer path with no SCCs required**, because
the US sits on SIC's 2017 adequacy list. This is the single most favorable fact in this entire audit for RED's
current architecture — and also the single most fragile one, because it rests on one circular from 2017 that
predates the entire modern US privacy-fragmentation debate (state comprehensive laws, no federal law, Schrems-style
EU scrutiny of US surveillance law). SIC issued **Circular Externa 002 de 2025** and **003 de 2025** in the interim
addressing technology-transfer processes and adopting Ibero-American Network model contractual clauses — these did
not revoke the US listing, but they show SIC is actively revisiting this file in 2025.
Source: [SIC Sede Electrónica — "Alcance de la Circular 002 de 2025 sobre transferencias internacionales de datos"](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/alcance-de-la-circular-002-de-2025-sobre-transferencias-internacionales-de-datos), fetched 2026-07-28.

---

## 2. ARGENTINA — Ley 25.326 (2000) + pending reform

### 2.1 Registration duty with the AAIP — the strictest, least exempted regime of the three

Articles 21 and 24 of Ley 25.326 require registration in the **Registro Nacional de Bases de Datos** (now
administered by the **Agencia de Acceso a la Información Pública, AAIP**, successor to the DNPDP) for (a) all
public databases, and (b) private files/registries/databanks **not for exclusively personal use**, with Article 21
specifically naming those "intended to provide reports." Legal commentary explicitly warns against reading this
narrowly: **internally-managed customer/supplier/employee databases may require registration if they enable
generating and sharing information about people**, and "the scope of this obligation depends on the type of base,
its purpose, and the uses that can be given to the information" — i.e., there is no bright-line exemption, and
**no asset/revenue threshold** analogous to Colombia's 100,000 UVT gate. A gym's member roster (name, phone,
attendance, payment status, class reservations) is a plausible fit for "private database … intended to provide
reports" under a broad reading, and I found no authoritative carve-out for small businesses.
Source: [JBB Abogados — "Registro de bases de datos personales en Argentina: cuándo corresponde inscribirlas ante la AAIP"](https://jbbabogados.com.ar/registro-de-bases-de-datos-personales-en-argentina-cuando-corresponde-inscribirlas-ante-la-aaip-y-como-hacerlo/), fetched 2026-07-28.

Mechanics: registration runs through the **TAD (Trámites a Distancia)** platform in two steps — register the
responsible party, then register each database, declaring name, purpose, data categories, subjects, collection
method, recipients, and security measures. Penalties for non-compliance: warnings, fines, or restriction/
suspension/closure/cancellation of the database itself. No registration fee or hard deadline was found in this
source; that absence should be verified directly with AAIP before treating it as "no cost."
Source: same JBB Abogados article, fetched 2026-07-28.

**What this means concretely: Argentina is the one country in this mandate where RED's exposure does not scale
with gym count in the way Colombia's does — it is arguably triggered by gym #1**, because there is no size
threshold shielding a small operator the way Colombia's UVT gate does. Whether a foreign SaaS processor (RED,
acting as Encargado, not Responsable) itself owes this registration, versus each Argentine gym owing it as
Responsable, was not resolved by any source I found — flagged as open.

### 2.2 Breach notification — a real regulatory gap, not a strict regime

Ley 25.326 (2000) has **no general breach-notification obligation** to the authority or to data subjects, except
in narrow sectoral cases. This is confirmed by a 2026 legal-press retrospective explicitly framing it as a gap
reformers want closed.
Source: [DiarioJudicial — "Protección de datos personales: ¿sigue siendo suficiente la Ley 25.326 en 2026?"](https://www.diariojudicial.com/news-103126-proteccion-de-datos-personales-sigue-siendo-suficiente-la-ley-25326-en-2026), fetched 2026-07-28.

This cuts the opposite direction from §2.1: Argentina is simultaneously the **strictest** on registration (no
threshold) and the **loosest** on breach response (no deadline at all, currently) — a country-specific
combination that a single "build to the strictest" posture cannot resolve, because the strictest answer on one
axis and the loosest on another live in the same law.

### 2.3 International transfers — no US adequacy, unlike Colombia

Under DNPDP Disposición 60-E/2016 and AAIP Resolución 34/2019, Argentina's adequate-country list covers the
EU/EEA, UK, Switzerland, Isle of Man, Faroe Islands, Canada (private sector only), Andorra, New Zealand, and
Uruguay. **The United States is explicitly not on this list.** There is a stated government commitment (within an
"ARTI" framework) to formally recognize the US, but formal implementation is described as still pending.
Source: [WebSearch synthesis citing Disposición 60-E/2016 and Resolución 34/2019](https://www.argentina.gob.ar/transferencias-internacionales), fetched 2026-07-28.

**Consequence for RED's architecture**: unlike Colombia, an Argentine gym's member data landing in Oregon does
**not** have a clean adequacy path — RED would need AAIP-sanctioned standard contractual clauses (Argentina
"implementa nuevas cláusulas contractuales modelo" per IAPP) executed and in force before onboarding the first
Argentine gym, not as a later fix.
Source: [IAPP — "Argentina implementa nuevas cláusulas contractuales modelo para la transferencia internacional de datos"](https://iapp.org/news/a/argentina-implementa-nuevas-clausulas-contractuales-modelo-para-la-transferencia-internacional-de-datos), fetched 2026-07-28.

### 2.4 EU adequacy — real but doesn't help RED directly

Argentina was the **first LatAm country** granted EU adequacy (June 2003, under the old Directive 95/46/EC), and
the European Commission **reconfirmed** this on **January 15, 2024** in its first-ever review of legacy adequacy
decisions, citing the AAIP's independence and Argentina's ratification of Council of Europe Convention 108 and
108+.
Source: [INPLP — "The European Commission confirms that Argentina has adequate legislation for the international transfer of personal data"](https://inplp.com/latest-news/article/the-european-commission-confirms-that-argentina-has-adequate-legislation-for-the-international-transfer-of-personal-data/), fetched 2026-07-28.

This is why Argentina appears on *Colombia's* adequacy list (§1.7) — Colombia imports the EU's adequacy
determinations. It does **not** help RED's US-hosted data at all; it only matters if RED ever needs to move
Argentine data *into* the EU, which is not part of RED's architecture.

### 2.5 Pending reform — real but stalled, not close to landing

Two bills were filed in 2026 (deputy Pablo Carro, senator Martín Doñate), both derived from an AAIP draft that
**lost parliamentary standing at the end of 2024** — meaning a prior, more advanced version of this reform already
expired once. A third bill (1751-D-2026, deputy Martín Yeza) was also filed. Both aim to import GDPR/LGPD-style
concepts: privacy by design/default, portability, and the right to opposition to automated decisions. I could not
find committee-status or vote-scheduling data for any of these bills as of the fetch date — treat "reform is
imminent" as false; treat "reform is repeatedly attempted and repeatedly stalls" as the accurate pattern (one
version already died from loss of parliamentary standing).
Sources: [DiarioJudicial](https://www.diariojudicial.com/news-103126-proteccion-de-datos-personales-sigue-siendo-suficiente-la-ley-25326-en-2026), [IAPP — "Novedades legislativas en Argentina sobre protección de datos personales e inteligencia artificial"](https://iapp.org/news/a/novedades-legislativas-en-argentina-sobre-protecci-n-de-datos-personales-e-inteligencia-artificial), both fetched 2026-07-28.

---

## 3. CHILE — Ley 19.628 (current) → Ley 21.719 (2024, not yet in force) — the biggest near-term change in the region

### 3.1 Status and timeline (verified current, not from memory)

**Ley 21.719** was approved by Chile's Congress on **August 26, 2024**, promulgated, and **published in the Diario
Oficial on December 13, 2024**. It carries a **24-month vacancia legal**, so it enters into **full force on
December 1, 2026**. Until then, the old, toothless **Ley 19.628** remains operative — a law with **no dedicated
data-protection authority and minimal enforcement mechanisms**.
Sources: [Recording Law — "Leyes de Privacidad de Datos de Chile"](https://www.recordinglaw.com/es/world-laws/world-data-privacy-laws/chile-data-privacy-laws/), fetched 2026-07-28; corroborated by [Asentic](https://www.asentic.cl/blog/ley-21719-datos-personales/) and [ACHIPI PDF of the law text](https://achipi.cl/wp-content/uploads/2025/06/Ley-21719-REGULA-LA-PROTECCION-Y-EL-TRATAMIENTO-DE-LOS-DATOS-PERSONALES-Y-CREA-LA-AGENCIA-DE-PROTECCION-DE-DATOS-PERSONALES.pdf), both fetched 2026-07-28.

**As of the fetch date (2026-07-28), Chile is ~4 months from a hard cutover from "no real regulator" to "GDPR-
style regulator with fining and suspension power."** This is a fixed calendar date, not a threshold that scales
with RED's gym count — every Chilean gym RED signs after Dec 1, 2026 lands directly under the new regime, and every
Chilean gym signed *before* that date needs to already be compliant by then.

### 3.2 What Ley 21.719 creates

A new **Agencia de Protección de Datos Personales** — Chile's first-ever autonomous public-law body for this,
with power to investigate ex officio, fine, order suspension of data processing, and publish a **Registro Nacional
de Sanciones** (public shame registry, unlike Colombia/Argentina).
Source: [Lawwwing — "La nueva era de la protección de datos en Chile"](https://lawwwing.com/la-nueva-era-de-la-proteccion-de-datos-en-chile-que-cambia-con-la-ley-21-719/), fetched 2026-07-28.

### 3.3 Fines — the highest ceiling of the three countries in absolute enforcement teeth

- Leve: warning or fine up to **5,000 UTM**.
- Grave: up to **10,000 UTM**.
- Gravísima: up to **20,000 UTM**.
- Alternative for large enterprises: **2–4% of annual sales/services revenue**.
- Reincidencia (repeat offense) can **triple** the fine.
Source: [Asentic](https://www.asentic.cl/blog/ley-21719-datos-personales/), fetched 2026-07-28. (I could not independently confirm the exact article numbers from the primary PDF text — the ACHIPI PDF's fine schedule was not machine-legible via WebFetch; treat the UTM figures as sourced from a secondary legal-practitioner summary, not the raw statute text.)

### 3.4 Breach notification — 72 hours, converging with Brazil

Sources describe a **72-hour** notification window to the new Agency and to affected titulares once the
organization becomes aware of an incident that compromises confidentiality/integrity/availability and poses a
"reasonable risk" to titulares' rights — notification "by the most expeditious means possible and without undue
delay," with a follow-up notification allowed if full information isn't available in time. One source attributes
the specific "72 hours" figure to a companion law, **Ley 21.663 (Cybersecurity)**, rather than to 21.719's own
text directly — the two laws appear to be read together in practitioner guidance, and I was not able to fully
disambiguate which law is the strict legal source of the 72-hour figure from the primary text. Flagged as a
verify-before-build item, not a confirmed fact.
Sources: [Confidata Chile — "Seguridad de Datos y Notificación de Brechas bajo la Ley 21.719: 72 Horas para Actuar"](https://confidata.cl/blog/seguridad-notificacion-incidentes-ley-21719); [Amsoft — "Gestión de incidentes de seguridad bajo la Ley 21.719"](https://www.amsoft.cl/gestion-incidentes-seguridad-datos-personales-ley-21719/), both fetched 2026-07-28.

### 3.5 DPO — not mandatory, but material for a company of RED's shape

A "Delegado de Protección de Datos" is **not legally mandatory** under 21.719, but is described as a
compliance-mitigating factor in enforcement, and can be filled by internal staff (no requirement for an external
appointee) — this is more lenient than GDPR's DPO trigger.
Source: [Asentic](https://www.asentic.cl/blog/ley-21719-datos-personales/), fetched 2026-07-28.

### 3.6 International transfers — Chile's rules are changing under RED's feet, and the new regime isn't published yet

Under the current, still-operative Ley 19.628, cross-border transfer rules are minimal — "sujetas a una regulación
muy limitada," with no adequacy framework at all. Ley 21.719 **replaces this with a GDPR-style regime**: transfers
are lawful only to (a) a country the new Agency has itself designated adequate, or (b) a transfer backed by a
contract providing adequate guarantees (SCC-equivalent).
Source: [Resguard Solutions — "Transferencias Internacionales de Datos desde Chile"](https://resguard-solutions.com/blog/en/chile-cross-border-data-transfers/), corroborated by the WebSearch synthesis of the same page, fetched 2026-07-28.

**The Agency does not exist yet** (it stands up alongside the law on Dec 1, 2026), so **there is no published
Chilean adequacy list today** — meaning RED has no clean transfer path to point to for Chile the way it does for
Colombia (§1.7), and cannot yet know whether the US will be on Chile's future adequate-country list. This is a
concrete, unresolved legal-basis gap for any Chilean gym RED signs, that closes only when the new Agency publishes
its list — an event with no confirmed date beyond "sometime after Dec 1, 2026."

### 3.7 PYME/small-business exemption

I found **no PYME carve-out** in Ley 21.719 comparable to Brazil's small-processing-agent regulation (§4). The law
is described as applying to "toda organización pública o privada que trate datos personales en Chile, sin importar
tamaño" (regardless of size).
Source: [Anami — "Ley 21719 Chile 2026: protección de datos personales"](https://anami.cl/blog/ley-21719-proteccion-datos-personales-chile), fetched 2026-07-28.

---

## 4. Cross-cutting comparison table

| Axis | Colombia (Ley 1581) | Argentina (Ley 25.326) | Chile (Ley 21.719, from Dec 1 2026) |
|---|---|---|---|
| Regulator | SIC (existing, active) | AAIP (existing, active) | New Agencia (does not exist yet) |
| DB registration duty | Yes, but gated at ~100,000 UVT total assets (~USD $1.2–1.3M) — most single gyms exempt | Yes, **no threshold** — plausibly triggered by gym #1 | None found (no registry regime in 21.719) |
| Breach notification | 15 business days (via RNBD incident channel) | **None** — acknowledged legal gap | 72 hours (converging w/ Brazil's 3 business days) |
| Access/correction SLA | 10 bus. days (consulta) / 15 bus. days (reclamo) | Not resolved in this research pass | Not resolved in this research pass |
| Fine ceiling | 2,000 SMMLV (reform bill pending: 10,000 SMMLV / 5% revenue) | Warnings/fines/DB suspension — no published ceiling found | 20,000 UTM or 2–4% revenue, ×3 on repeat |
| US on adequacy list? | **Yes**, since 2017 — clean transfer path today | **No** — SCCs required | **Unknown** — no list published yet |
| DPO mandatory? | Not found as a general requirement | Not found as a general requirement | No (recommended only) |
| PYME/small-business carve-out | Yes (asset threshold shields most gyms from registration only) | None found | None found |

---

## 5. Does one compliance posture cover Mexico + Brazil + Colombia + Argentina + Chile?

**Short answer: partially — a single strict *engineering/privacy* posture can absorb the substantive overlap
(consent capture, ARCO/DSAR fulfillment, a fast breach pipeline, data minimization, retention limits), but it
cannot absorb the *administrative/registration* layer, which is genuinely per-country and does not respond to
"build stricter."** This was checked with light supporting research on Mexico and Brazil (outside this mandate's
core three countries, but the question was explicitly asked):

- **Mexico's regulator was dissolved.** INAI was eliminated by a December 2024 constitutional reform; a new
  Federal Law for the Protection of Personal Data in Possession of Private Parties was published March 20, 2025
  and took effect March 21, 2025, with oversight moved to the **Secretaría de Anticorrupción y Buen Gobierno** — a
  body of the federal executive branch, not an independent authority — and legal challenges now go through
  amparo suits in specialized courts rather than the prior administrative-nullity process. More than a year later,
  **implementing regulations still have not been published**, per this source.
  Source: [Grupo Animal — "Protección de datos personales: ¿a qué institución le corresponde tras la desaparición del INAI?"](https://grupoanimal.mx/explicaciones/proteccion-datos-personales-inai), corroborated by [Garrigues](https://www.garrigues.com/es_ES/noticia/mexico-nueva-ley-federal-proteccion-datos-personales-posesion-particulares-introduce), both fetched 2026-07-28. This means RED's home market currently has the **weakest independent-oversight posture of all five countries** — building "to Mexico's standard" is not a ceiling worth building to.
- **Brazil (LGPD/ANPD)**: breach notification is **3 business days** to the ANPD and to data subjects (6 days for
  small agents) per Resolução CD/ANPD 15/2024 — the fastest SLA of any country checked here, faster than Chile's
  72 hours. Fines up to 2% of Brazil revenue, capped at R$50M per violation. Small processing agents (annual
  revenue ≤ BRL 4.8M, or ≤ BRL 360k for micro-enterprises) get a **DPO exemption** and other reduced duties — a
  real PYME carve-out, unlike Chile or Argentina. I could **not** confirm or deny a general ANPD registration duty
  from the sources gathered — flagged as unresolved, do not assume either way.
  Source: [Mayer Brown — "Regulation for the application of the LGPD for small business data processing agents"](https://www.mayerbrown.com/-/media/files/perspectives-events/publications/2022/02/regulation-for-the-application-of-the-general-data-protection-law-lgpd-for-small-business-data-processing-agents/legal-update--small-agents-regulation-en.pdf), fetched 2026-07-28.

**Why "build to Brazil, the strictest" does not fully close the gap:**

1. **Registration is not a strictness dial.** Argentina's AAIP database-registration duty and Colombia's RNBD
   filing are administrative paperwork obligations tied to that country's own registry, in that country's
   language, through that country's own portal (TAD for Argentina, the RNBD platform for Colombia). Over-engineering
   consent flows or breach-response speed to Brazil/Chile levels produces zero progress toward filing an Argentine
   AAIP registration or a Colombian RNBD entry — those are separate, recurring, per-country ops/legal tasks
   (initial filing + annual updates + 10-business-day amendment windows in Colombia alone) that scale with country
   count, not with engineering rigor.
2. **The international-transfer legal basis is different in every single country**, for the exact same physical
   fact (Supabase in Oregon): Colombia = adequate today (2017 list, includes both US and Mexico); Argentina =
   **not** adequate, SCCs required now; Chile = **no list exists yet**, resolves no earlier than Dec 2026; Mexico =
   moot (same country as the assumed home base, though its own weakened regulator raises separate questions);
   Brazil = not researched in this mandate, flagged as a gap. "Build the strictest privacy posture" does not
   generate the country-specific *legal instrument* (a signed SCC, a filed adequacy reliance, a future Chilean
   Agency ruling) that each transfer needs to be lawful.
3. **The stopwatch is genuinely different per country and some of it is a real engineering cost, not just a legal
   one**: Colombia effectively 15 business days, Argentina has no deadline at all today, Chile 72 hours from Dec
   2026, Brazil 3 business days already. If RED wants ONE breach pipeline instead of five, it has to build to the
   3-business-day Brazil figure — that IS a case where over-building beats under-building, because speed
   generalizes cleanly (a fast pipeline satisfies every slower deadline for free). This is the one axis where "build
   to the strictest" genuinely works with no gaps.

**Conclusion**: engineering substance (consent, rights-fulfillment, breach speed, minimization) can and should be
unified to the Brazil/Chile-2026 bar — that part is a real, achievable "build once." Administrative/registration
compliance (RNBD filings, AAIP registration, any future Chilean Agency filings, Mexico's now-murkier regulatory
contact point) and the country-by-country international-transfer legal basis are **not** solved by that
engineering posture and require ongoing, per-country legal/ops work that grows with the number of countries RED
operates in — this is a genuine "per-country engineering AND per-country legal" cost, not a one-time build.

---

## 6. Ranked: the 5 largest region-wide compliance risks, worst first

**1. Chile's Ley 21.719 full entry into force on 2026-12-01 lands with zero published transfer basis for RED's
Oregon-hosted architecture, and RED has ~4 months from this fetch date to close that gap.**
Breaking point: any Chilean gym still active — or newly signed — on/after Dec 1, 2026 without either (a) the new
Agency having published an adequacy list that includes the US, or (b) an SCC-equivalent contract in place. Given
the Agency doesn't exist yet, RED cannot even begin (a); it can only pursue (b) proactively, and no source
confirms what "adequate guarantees" contracts look like under this still-unimplemented regime. Severity: highest,
because it combines a hard calendar deadline, a brand-new regulator with real teeth (up to 20,000 UTM / 4%
revenue, suspension power, public sanctions registry), and zero currently-published legal basis to rely on.

**2. Argentina's AAIP database-registration duty has no size threshold and plausibly attaches at gym #1, with no
confirmed exemption for a SaaS processor's member roster.**
Breaking point: the first Argentine gym RED signs, not a growth milestone — this is qualitatively different from
Colombia's asset-gated RNBD duty. Compounded by Argentina requiring SCCs for the same Oregon-hosting fact pattern
that is adequacy-clean in Colombia (§1.7 vs §2.3), meaning Argentina needs bespoke legal work (registration filing
+ signed transfer contract) before or immediately after market entry, not after scale.

**3. Colombia's clean US-adequacy transfer path is a single 2017 circular that the SIC is actively revisiting
(Circulares 002/003 de 2025) while a pending statutory reform bill (filed Aug 2025) proposes a 5x fine-ceiling
increase.**
Breaking point: not a gym count — a regulatory event. If SIC narrows or revokes the US listing (plausible given
the circular activity already seen in 2025, and given the US's continuing lack of a federal comprehensive privacy
law), every Colombian gym's data instantly loses its adequacy basis and needs retroactive SCCs. Early-warning
signal to watch: any further SIC Circular Externa touching Título V Capítulo 3 of the Circular Única.

**4. Breach-notification asymmetry forces a choice RED hasn't made: build to Brazil's 3-business-day bar now (cost
today) or accumulate risk in Argentina, where there is currently no deadline at all but a live reform effort trying
to add one.**
Breaking point: whichever comes first — RED's first Argentine security incident (currently zero legal deadline,
but reputational/contractual exposure regardless), or passage of the reform bills in §2.5 (status: stalled twice
already, timeline unconfirmed).

**5. Mexico's regulatory vacuum (INAI dissolved, executive-branch successor, >1 year without implementing
regulations) removes RED's home-market anchor for "what does good compliance look like here" and means RED cannot
point to Mexican regulatory precedent as a floor when explaining its posture to Colombian/Argentine/Chilean
counsel or partners.**
Breaking point: not gym-count-driven — this is already true today (fetch date 2026-07-28). It becomes acutely
relevant the moment RED needs to represent, in any Colombian/Argentine/Chilean contract or DPA, what its "home
country" regulatory relationship looks like — and the honest answer is "an executive-branch secretariat operating
without published implementing rules," which is a materially weaker anchor than Brazil's ANPD or Chile's
forthcoming Agency.

---

## 7. Blind spots (this agent's own)

- I did not obtain the raw statutory text of Ley 21.719's fine and breach-notification articles directly (the
  ACHIPI PDF was not machine-legible via WebFetch); the UTM figures and the 72-hour figure come from secondary
  legal-practitioner summaries (Asentic, Confidata, Amsoft), not the primary Diario Oficial text. These are
  consistent across three independent secondary sources, which raises confidence, but is not the same as reading
  the statute.
- I did not resolve whether RED itself (as Encargado/processor) independently owes registration duties in Colombia
  or Argentina, versus that duty resting solely with each gym as Responsable — this matters enormously for whether
  the compliance burden is "3,000 small filings, mostly exempt" or "1 large filing, RED's problem."
- I did not verify Argentina's or Chile's access/correction-request SLA (the Colombia figures in §1.4 have no
  confirmed equivalent found for the other two countries in this pass).
- I did not verify whether Brazil requires ANPD registration — flagged as unresolved rather than asserted, but this
  gap weakens §5's cross-cutting conclusion somewhat, since "does the strictest country in the comparison also
  have a registration duty" is directly relevant to whether registration is a solvable-by-engineering problem
  region-wide or Colombia/Argentina-specific.
- I did not check whether any of the three countries' laws have specific provisions for **biometric or health
  data** (RED's attendance/photo data could plausibly qualify as sensitive data in some regimes, triggering
  stricter consent rules) — this is a gap that could change severity rankings if biometric attendance tracking is
  or becomes part of RED's product.
- The Colombia UVT-to-USD conversion and the SMMLV-based fine figures were not verified against DIAN or Ministerio
  del Trabajo primary sources — only against secondary legal-blog citations of the 2026 figures.
- I did not check Peru, Ecuador, Bolivia, or other Andean/Southern-Cone markets RED might plausibly enter next —
  this mandate was scoped to exactly Colombia, Argentina, Chile.
