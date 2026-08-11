# Who buys iBookit — a membership + class-booking + client-roster platform

**Date:** 2026-08-08
**Product:** **iBookit** (`ibooki.lat`) — the platform referred to throughout this file as "the product".
**Purpose:** positioning taxonomy for the shipped product (recurring memberships with expiry, capacity-limited class scheduling with reservations, pasar-lista attendance, per-client profile/history, simple POS for selling plans, member-facing mobile web, multi-tenant with a branded instance per business).
**Method:** 7 category-enumeration research agents + 1 market-sizing agent. Mexico-first sourcing, global structure. **Nothing in this file is asserted beyond what those agents returned; unverified claims are marked in line and are not upgraded.**

---

## The answer, up front

The buyable universe splits on **one axis, and it is not the industry** — it is the **booking unit**. Businesses that sell a *seat in a recurring group class against a named roster* are a near-perfect fit for the product as shipped; businesses that sell *an hour of a specific physical resource* (court, tank, chair, kart, bay) or *a slot on a specific named practitioner's calendar* are not, no matter how much "membresía" language appears in their marketing. That single distinction cuts through every genre below: swimming schools fit and swimming pools do not; ice-skating academies fit and open-skate rink time does not; group music classes fit and private piano lessons do not; bouldering gyms fit and padel clubs do not.

Twelve headline genres come out of the work. Roughly five of them are **STRONG** end-to-end (combat sports, group fitness, yoga/pilates/mind-body, class-based kids programs, group-class arts academies), three are **mixed by sub-niche** (facility sports — only the academy layer fits; skills academies — only the group tier; community/faith/leisure venues), and four are **traps that look adjacent**: appointment-based health and personal care, spa/recovery/body-work, dues-only private clubs and professional associations, and cohort-term education (bootcamps, driving schools, diplomados). The named missing features are consistent and few: **per-practitioner appointment calendars, per-resource/equipment inventory booking with hourly and peak/off-peak pricing, a guardian↔minor data model, and cohort/term enrollment with tuition installments.**

The quantitative backbone is the weakest part of this report and should be treated as such — see [Market sizing](#6-market-sizing-thin-and-contradictory) — three Mexico DENUE counts were obtained, most target categories returned **NO CREDIBLE SOURCE**, and the one big number that was found (beauty salons) is internally contradictory across three vintages.

---

## 1. How to read the fit verdicts

| Verdict | Meaning |
|---|---|
| **STRONG** | The business already runs on recurring membership + scheduled group classes with capacity + attendance. Product ships what it needs today. |
| **PARTIAL** | Revenue model or roster fits, but one named feature is missing. The gap is always named. |
| **POOR** | The core booking mechanic is structurally different (1:1 appointment book, resource inventory, or fixed cohort term). Do not put this on the marketing page. |

The four recurring gaps, named once so the tables can point at them:

- **GAP-A — per-practitioner appointment book**: a named staff member's calendar, variable-duration slots, room/chair assignment, no-show deposits. Blocks all 1:1 services.
- **GAP-B — resource inventory booking**: reserving *unit #3* (court, tank, kart, bay, 3D printer) for an hour, with hourly and peak/off-peak rates. Product capacity is a headcount on a class, not an inventory of units.
- **GAP-C — guardian ↔ minor model**: adult payer distinct from the enrolled child, plus emergency contact, authorized pickup, medical/allergy, photo consent.
- **GAP-D — cohort/term enrollment**: fixed start/end programs, level progression, gradebook/curriculum, tuition installments or ISA.

---

## 2. The twelve genres

### G1 — Artes Marciales y Deportes de Combate *(Martial Arts & Combat Sports)* — **STRONG**

Sub-niches: karate, BJJ/jiu-jitsu, muay thai, taekwondo, boxeo, judo, kickboxing, MMA, krav maga, lucha/wrestling, capoeira, kung fu/wushu, aikido, kendo, esgrima, defensa personal.

Booking unit: recurring class. Revenue: **mensualidad + inscripción**, tiered by weekly frequency. This is the cleanest fit in the entire taxonomy — the tiering *is* a membership plan with an expiry.

- Verified pattern: a krav maga school charges "inscripción de $600 pesos (anual) y mensualidades de $650 (una clase semanal), $750 (dos clases semanales) y $800 (3 clases semanales)" (https://www.superprof.mx/clases/krav-maga/mexico/); a boxing academy "inscripción de $500 y una mensualidad de $1400" (https://infoescuelas.com.mx/escuelas-de-boxeo-en-cdmx/); BJJ "un plan mensual usualmente ronda entre $1,200 y $2,500 pesos" (renzogracie.mx, cited via search summary — *unverified*).
- **Caveat carried forward from the agent:** wrestling, capoeira, kung fu, aikido, kendo, fencing and self-defense-only academies have **no dedicated Mexican pricing source** — their inclusion is pattern-matched from the verified combat rows above. *Unverified, low confidence.*

### G2 — Gimnasios y Entrenamiento Funcional *(Fitness & Strength Training)* — **STRONG / PARTIAL by sub-niche**

| Sub-niche | ES | Booking unit | Revenue | Fit |
|---|---|---|---|---|
| Gimnasio tradicional | gimnasio | open access + check-in | mensualidad | STRONG |
| CrossFit box | box de CrossFit | recurring class | mensualidad | STRONG |
| HYROX affiliate | gimnasio afiliado HYROX | recurring class / race simulation | mensualidad | STRONG |
| HIIT franchise (F45, Orangetheory) | estudio de HIIT | recurring class, fixed schedule | monthly membership + drop-in | STRONG |
| Spinning / indoor cycling | estudio de spinning / ciclismo indoor | recurring class (bike-capacity) | class pack / mensualidad | STRONG |
| Funcional, calistenia (paid gyms) | entrenamiento funcional / calistenia | recurring class | mensualidad | STRONG |
| 24/7 keycard gym | gimnasio 24 horas | open access + check-in | mensualidad + inscripción + llave | **PARTIAL — turnstile/keyfob access-control hardware integration** (not a scheduling gap) |
| EMS / electrofitness | electroestimulación / EMS | 20-min slot on a pod | *unclear* — pricing pages emphasize per-session/package | **PARTIAL — no monthly-membership evidence found; if pack-based, needs credit/punch-card balance** |
| Powerlifting / halterofilia | gimnasio de powerlifting | open access + check-in | *no data* | PARTIAL (verdict inferred by analogy, not sourced) |
| Calistenia comunitaria al aire libre | barras / street workout | free community group | none | POOR — not a paying business |
| Bootcamp al aire libre, running clubs, OCR clubs | bootcamp / club de corredores | recurring class | *no data* | inferred STRONG, **unverified** |

Scale anchors: HYROX has "2273 hand-verified Hyrox-affiliated gyms across 20 countries" (https://www.hyroxvault.com/gyms/) — *verified*. CrossFit: ~9,000–9,900 affiliates worldwide as of early 2025, down from a ~11,366 March-2024 peak, 150+ countries, 5,000 in the US (https://barbend.com/crossfits-explosive-affilaite-growth-by-the-numbers/) — *unverified, secondary aggregation, not CrossFit HQ*. Anytime Fitness MX: "mensualidades de $899 a $999, con inscripción de $1,500 y llave de acceso de $600" (https://payments.anytimefitness.com.mx/) — *inferred from pricing page*.

### G3 — Yoga, Pilates y Estudios de Movimiento *(Mind-Body Studios)* — **STRONG**

Sub-niches: yoga hatha/vinyasa/ashtanga, yoga caliente/Bikram, yoga aéreo, pilates mat, pilates reformer, barre, GYROTONIC (group tier), baño de sonido / meditación / respiración.

Booking unit: recurring class with room capacity. Revenue: **paquete de clases or mensualidad ilimitada**.

- Verified: "Ātma Yoga: $300 pesos la clase o $3,350 la mensualidad"; "Blanco Yoga: clase individual $340, 4 clases $1,250, mensualidad ilimitada $2,850" (https://atmayogamx.com/, https://www.superprof.mx/blog/estudios-yoga-mexico/). Bikram: "paquete mensual ilimitado con costo entre $500 y $1,200 pesos" (https://www.dondeir.com/...bikram-yoga.../14999/).
- Reformer pilates: "MindBody Pilates Studio Córdoba: 4 clases $1,200, 8 clases $2,200, 12 clases $2,400" (https://www.chilango.com/que-hacer/estudios-de-pilates-reformer-en-cdmx/). **Minor PARTIAL risk**: if a studio must guarantee the *same numbered reformer* to a member, that is GAP-B.
- Sound bath / meditation is structurally identical to yoga (fixed room, capacity, class cards, late-cancel fees) — "4-class cards for $135… monthly unlimited memberships at $188" (https://niajae.mykajabi.com/BlissBar) — **STRONG**.
- GYROTONIC and StretchLab-style assisted stretching are **PARTIAL — GAP-A**: the private-session tier books a named Flexologist/instructor ("one-on-one assisted stretching… led by certified Flexologists", https://www.stretchlab.com/franchise), even though the revenue model (recurring packages/memberships) fits.

### G4 — Spas, Recuperación y Terapias Corporales — **PARTIAL / POOR (trap genre)**

| Sub-niche | ES | Booking unit | Revenue | Fit |
|---|---|---|---|---|
| Crioterapia / recovery studio | estudio de crioterapia / centro de recuperación | per-equipment-unit appointment | tiered monthly membership w/ visit credits | **PARTIAL — GAP-B** (Restore tiers: https://www.restore.com/memberships) |
| Tanque de flotación | flotarium | one tank, one booking | membership w/ credits or drop-in | **PARTIAL — GAP-B**, no group concept at all (https://www.vesselfloats.com/pricing) |
| Temazcal | temazcal | scheduled group ceremony with capacity | per-session / package | **PARTIAL** — class-shaped but one-off/tourism, recurring half unused ("$100 pesos per person" nocturnal sessions, https://www.escapadah.com/...) |
| Sauna infrarrojo / baño ruso | banya / baños de vapor | open access or session slot | drop-in / membership | *unverified* — no source retrieved, inferred from day-spa adjacency |
| IV drip / biohacking lounge | clínica de hidratación IV | 1:1 appointment on a bay | tiered monthly membership | **PARTIAL/POOR — GAP-A + clinical record** ($129–$599/mo tiers, https://thedriplounge.com/membership/) |
| Day spa | spa / día de spa | 1:1 appointment, therapist + room | package/bundle | **POOR — GAP-A + retail stock** ("paquetes Day Spa desde $1,100 pesos", https://spacondesa.com/service/day-spa/) |
| Masaje deportivo / quiromasaje | masajista | 1:1 appointment | per-session / punch card | **PARTIAL — GAP-A** |

**Market-timing note (Mexico-specific, *unverified*):** Mexican cryotherapy currently sells through clinics/spas per-session via Doctoralia-style booking, not as a Restore-style membership chain — "El precio va entre $250 MXN y $4,500 MXN" (https://daypass.com/es/blog/crioterapia-cdmx-precio-beneficios). Weaker MX fit signal than the US model implies.

### G5 — Deportes de Cancha y Reserva de Recursos — **POOR for the facility, STRONG for the school on top**

This is the genre most likely to be mis-sold. **Padel, pickleball, futbol 5/7, squash, badminton, boliche, billar, karting, golf bays** all monetize an hourly resource slot with peak/off-peak differentials — **GAP-B**.

- Padel MX: "Courts are rented in 1.5-hour blocks, with rates between $600 and $800 pesos per session… 1,000 MXN for 1.5 hours during peak hours and 600 MXN during off-peak" (https://canchadepadel.mx/cuanto-cuesta-cancha-de-padel/) — *verified*.
- Futbol 5/7: "Las canchas de Fútbol 5 y Fútbol 7 son las más rentables… permiten alta rotación de partidos, renta por hora" (https://sportmaster.mx/precio-de-canchas-de-futbol/) — *verified*.
- Pickleball MX: memberships "$500-$1,500 MXN" exist but "members pay less and reserve courts first, though pay-to-play is always available" (https://canchaspickle.com.mx/precios-canchas-pickleball-mexico/) — a **discount layer riding on hourly billing**, not a replacement for it.
- The vertical's own tooling confirms the shape: Playtomic monetizes "a booking commission model of 5–15% per transaction" over "16,000 courts worldwide" (https://playtomic.com/pricing); MATCHi is "a complete booking system for racket-sports venues" (https://www.matchi.se/).
- Boliche/billar: pay-per-line/hour, "$105 to $129" per line, no membership model surfaced in any source (https://www.dondeir.com/ciudad/mejores-boliches-en-cdmx/2021/05/) — **POOR** on two counts.
- Karting: pay-per-race with a nominal annual license, "360 pesos [per race], plus an annual membership of 130 pesos" (https://www.elfinanciero.com.mx/entretenimiento/2023/04/08/...) — the "membership" is an access token, not revenue.

**The exceptions inside this genre are real and important:**
- **Rocódromos / escalada y boulder** — genuine monthly membership *is* the whole product, open access, no per-wall reservation: "Toka… membresías comienzan desde $1,250/mes… day pass por $190" (https://tokaclimbing.mx/); "ONIX… membresía mensual es de $580"; "Moonrock… $800.00 pesos con acceso libre todos los días" — **STRONG**.
- **Golf**: country-club membership golf sits in G11; **simuladores/driving-range bays** are per-bay hourly (GAP-B); the **academia de golf** lesson layer is a class product (https://pgamexico.com.mx/pages/academia-de-golf).

### G6 — Escuelas Acuáticas, de Invierno y Aventura — **STRONG (the academy layer)**

Split out from G5 deliberately: same venues, different product.

| Sub-niche | ES | Booking unit | Revenue | Fit |
|---|---|---|---|---|
| Swim school | escuela de natación | recurring class by level/age | mensualidad | **STRONG** — "$1,000 to $2,200 pesos depending on the number of classes"; Toluca "$328 to $340" (https://www.superprof.mx/blog/cursos-natacion-cdmx/) |
| Skating academy | academia de patinaje | recurring class | mensualidad or class pack | **STRONG** — "$1,500 pesos (1 clase de hielo y 1 de piso a la semana) hasta $1,950" (https://www.pistadehielolanoria.com/academia/); "$180 por clase individual o $1,300 por un paquete de 10 clases" |
| Riding lessons | clases de equitación / club hípico | recurring lesson | *no pricing found* | inferred STRONG, **unverified** (https://clasesdeequitacion.com.mx/) |
| Dive school | escuela de buceo | **cohort certification course** | per-course package ("Cursos desde $325 USD", https://www.sethdive.com/es/cursos-de-buceo) | **PARTIAL — GAP-D** |
| Sailing / kitesurf / surf | escuela de vela / kitesurf / surf | — | — | **no data found**; agent returned an explicit negative result |

### G7 — Academias de Habilidades y Artes — **STRONG group tier, POOR 1:1 and cohort tiers**

**STRONG (sell to these):**
- **Academia de baile para adultos** (salsa, bachata, cumbia, hip-hop, ballroom) — "un paquete mensual de $850.00, que incluye todas las clases de salsa y bachata en un mes (aproximadamente 24 clases)" (https://www.clasessalsa.com/) — *unverified, search-summary only*.
- **Pole / aéreo**, **taller de cerámica** ("Camposol: 2,000 pesos monthly, 500 pesos inscripción"; "Cerámica de México $3,000 per month" — https://www.superprof.mx/blog/talleres-ceramica-cdmx-mexico/, *unverified*), **taller de pintura y dibujo**, **taller de costura**, **escuela/taller de cocina y repostería**, **academia de música — clases grupales** ("~$1,000 MXN" monthly for a weekly group class, https://www.temdijalisco.com/..., *unverified*), **small independent language schools running open group classes**.

**PARTIAL — GAP-A (per-teacher calendars, make-up credits):** private instrument/voice lessons, private language conversation classes, advanced chess coaching. Music academies bill per-teacher-hour, "GMartell… monthly rate ranges between $5,000 and $6,000 pesos" and a Fermatta singing course "costs $60,000 pesos per semester" (https://www.upstage.com.mx/musica) — *unverified*.

**PARTIAL — GAP-D (cohort/term, level progression):** large leveled language chains (Harmon Hall "$2,000 and $3,000 pesos monthly"; Berlitz "2,843.00… 10,700.00 pesos monthly" — both *unverified*), test-prep academies, photography diplomados, acting schools ("2,299 pesos for registration plus 4 monthly payments for 16 sessions", https://lacuartapared.com.mx/curso/actuacion-adultos/, *unverified*), Kumon-style regularización (per-child worksheet leveling, no shared class concept at all).

**POOR — do not claim:**
- **Autoescuela / escuela de manejo** — 1:1 in-car per-instructor-per-vehicle; "prices starting from 1,799 pesos for basic standard courses" (https://escuelamexicanademanejo.mx/, *unverified*). No shared-capacity class exists in this business.
- **Bootcamp de programación** — fixed cohort, gradebook, tuition installments/ISA; "TripleTen… $41,999 MXN to $104,999 MXN"; "Bedu… from $20,000 MXN" (https://tripleten.mx/blog/costos-y-financiamiento-de-bootcamps/, *unverified*).
- **Escuela de estética/cosmetología (diplomado)**, **certificación de instructores de yoga 200h** ("$32,000 MXN if paid in full", https://www.yogazantory.com/, *unverified*), **capacitación en primeros auxilios** (one-off B2B session with a 1-year certificate, "El curso tiene un precio de 850 pesos… constancia digital con vigencia de un año", https://www.milenio.com/..., *unverified*).

### G8 — Actividades y Programas Infantiles y Familiares — **STRONG on booking, BLOCKED on data model**

Sub-niches: escuela de futbol infantil, natación para bebés y niños, gimnasia artística, ballet/danza infantil, porras/cheer, artes marciales infantiles, música y estimulación temprana, club de tareas / estancia infantil, guardería privada, campamentos de verano, robótica/STEM, talleres de arte infantil, scouts, ludotecas.

Booking and revenue fit well: youth soccer runs "monthly fee of 390 pesos and no registration cost" up to "registration at 2,320 pesos and monthly fees of 2,088 pesos" across 33 academies Profeco compared in 22 states (https://www.gob.mx/profeco/prensa/el-futbol-mas-alla-de-las-canchas-...) — *verified*. Gymnastics: "Podium Gymnastics: $2,100… Gimnasio Jahns: $2,400… Gimnaten: $2,050" monthly (http://fmgimnasia.org/clubes, https://www.gimnaten.com/) — *verified*. Cheer: "enrollment fee of $550 and monthly tuition of $850" (http://www.clubcoapa.com/...) — *verified*. Baby swim: "Clases para bebes con mama… desde los $1,250 pesos mxn mensuales" — *verified*. Estimulación temprana: "colegiatura de $1,200 M.N., con clases unicas a $165" (https://copan.education/mama-y-yo/) — *verified*.

**But the whole genre is gated on GAP-C.** IMSS-model daycare files legally require "datos de identificacion, contacto de emergencia, historial medico y registro de vacunacion" per child (https://mxtramites.net/imss/guarderias-imss-requisitos/) — *verified*. A flat client=payer record breaks for every scheduled-class niche here.

Sub-niches that additionally miss on revenue shape:
- **Campamentos de verano** — per-week/per-season session enrollment, not monthly ("$750 pesos por una semana"; "inscripcion de $700.00 que incluye playera, gorra y seguro"; a 7-day camp "por $12,300" — https://www.adn40.mx/..., https://mexicoverde.com/tours/campamento-de-verano-2026/) — GAP-D.
- **Robótica/STEM** — leveled multi-month blocks ("Robotix… 12 niveles agrupados en 3 bloques… 6 meses de duracion", https://www.soyrobotix.com/) — GAP-D.
- **Club de tareas / estancia infantil** — per-day/per-week pay-as-attended ("per day payment… weekly payment… payment due only for the days the child attends", https://www.padresehijos.com.mx/actualidad/4698.html) — not a monthly membership.
- **Scouts** — annual dues, "$810.00 MXN" ASMAC (https://scouts.org.mx/) — annual, not monthly.
- **Ludoteca / salón de fiestas** — per-visit drop-in, "$120.00 por nino por dos horas" (http://www.fantastickids.com.mx/) — POOR.

### G9 — Salud y Cuidado Personal por Cita — **POOR (the biggest trap genre)**

Physio/fisioterapia, quiropráctica, osteopatía, podología, consultorios médicos y especialistas, clínicas dentales y ortodoncia, óptica, psicología, terapia de lenguaje y ocupacional, veterinaria, estética canina, salones de belleza, barberías, uñas, pestañas/cejas, depilación láser, med-spa, tatuajes y perforaciones, acupuntura, centros auditivos.

Two blockers, not one:
1. **GAP-A** — the whole genre is a 1:1 appointment book.
2. **Clinical record** — NOM-004-SSA3-2012 is "of mandatory compliance for all healthcare service providers… including individual offices of any specialty. There is no exemption for offices that do not use digital systems", minimum 5-year retention (https://agendapro.com/blog/nom-004/) — *verified*.

**The named trap:** "membresía" is everywhere in this genre's marketing and is almost always a **prepaid discount wrapper**, not a recurring capacity-based booking product. Dentalia's is "$1,299 MXN/year individual" with "2 Limpiezas dentales incluidas al año" and percentage discounts (https://www.dentalia.com/membresias-dentales) — *verified*. Vet "planes de salud" bundle consults/vaccines/dental at Banfield and VetMe (https://banfield.com.mx/, https://vetme.com.mx/planes-de-salud/) — *unverified*. Med-spas advertise "annual unlimited packages" and "monthly subscriptions" with **no disclosed price or cancellation terms on any site checked** (https://dmedicspa.com/) — *unverified*. Physio is pay-per-session with prepaid packs, "−8% for 5–9 sessions and −15% for 10 or more" (https://www.cronoshare.com.mx/cuanto-cuesta/sesion-fisioterapia) — *unverified*.

**The four reachable pockets inside G9, all because they use a group-class mechanic instead of appointments:**
- **Barberías/salones on a true unlimited-visit monthly membership with walk-in (non-reserved) service** — real and reported growing: "Membresía Gold Mensual" with unlimited cuts (https://somosbarbers.mx/producto/membresia-gold-mensual/); Barberos sells unlimited visits across 5 branches by tier (https://barberosbarberias.com/barberosmembresia/); "el modelo de membresía mensual (cortes ilimitados) está creciendo en Guadalajara" — *verified*.
- **Clases de psicoprofilaxis / prenatales** — fixed-schedule recurring cohort, "consta de 6 clases, una por semana, con duración de 2 horas cada una"; MomCenter "10 classes for $900 and 5 classes for $500" (https://momcenter.com.mx/actividades-prenatales-curso-psicoprofilaxis/) — *unverified*.
- **Educación canina en grupo** — "paquetes que van desde $2,000 hasta $5,000 MXN por programas que incluyen de 6 a 10 sesiones"; Petco runs "una clase introductoria en grupo con duración de 6 semanas" (https://www.superprof.mx/clases/educacion-canina/mexico/) — *unverified*.
- **Estética canina on a monthly plan** — "1 bath and cut per month… plus a 10-15% discount"; some run "a bath every 3 weeks plus nail trimming" (https://www.zendpaw.com/es/blog/precios-de-estetica-canina-en-mexico-2026) — *unverified*; still GAP-A for the actual grooming slot.

### G10 — Espacios de Trabajo y Makerspaces — **PARTIAL**

- **Coworking** — "Monthly coworking memberships in CDMX range from approximately $750 to $3,700 pesos… Cardumen: $2,250 per month for one person or $1,900 per month for groups of 3 or more… approximately 287 coworking spaces in CDMX" (https://cardumen.mx/membresias-y-precios/) — *unverified*. Membership + check-in fits; **GAP-B** for meeting rooms and hot-desk allocation. The agent could not confirm whether Mexican coworking actually tracks per-visit check-in versus badge/door access — the STRONG-vs-PARTIAL call rests on an inference.
- **Makerspace / hackerspace / fablab** — "HackerGarage has a membership program for people who can contribute 500 pesos per month… Hacedores Makerspace… monthly membership payment or prepaid cards offering up to 7 accesses starting from 600 pesos" (https://hackergarage.mx/membresias, https://forbes.com.mx/hacedores-inaugura-su-primer-espacio-para-makers-en-el-df/) — *unverified*. Closest thing to STRONG in this genre; **GAP-B** only for machine reservation (laser cutter, 3D printer).

### G11 — Clubes Privados y Organizaciones de Socios — **POOR (dues without attendance)**

Club campestre/country club, club deportivo privado, club de tiro y caza, club náutico/de yates, clubes de autos y motos, colegios de profesionistas, asociaciones de exalumnos, sindicatos, clubes de servicio.

These are genuine "membresía" businesses with real Spanish-language dues, and that is exactly why they are dangerous to claim. They administer **dues and eligibility, not attendance** — the product's core strength goes unused, and they need household/family accounts, tiered dues plus joining fees, and guest passes.

- Country clubs run an accionista/usufructuario share model: a shareholder "transfers the rights to use the club's facilities… in exchange for paying monthly maintenance fees" (http://www.countryclubculiacan.com/) — *unverified*.
- Club náutico: "$10,000 for initial membership with annual maintenance of $3,000", admission by reviewed application (https://balneariosmexico.com/...) — *unverified*.
- Colegios: Contadores Públicos "$1,080" or "$6,371" annual by degree; CIME "$3,000 Mexican pesos… validity for one calendar year" (https://www.contadoresmexico.org.mx/membrecia/afiliacion, https://cime.org.mx/afiliacion/) — *unverified*.
- Shooting clubs gate on evaluation fees: "$4,050.00 for socioeconomic/psychological evaluation and shooting induction" (https://cinegeticojalisciense.com/) — *unverified*; recurring dues structures not published.
- Multi-sport "club deportivo" facilities are the hybrid: Club Monte Sur has "15 tennis courts, 3 volleyball courts… more than 50 activities each week, including swimming, crossfit, zumba, spinning, kickboxing, and tennis clinics" (https://clubmontesur.com.mx/collections/membresias) — *verified*. The **activity/clinic layer** is a G2/G3 product; the **membership share** is not.

### G12 — Centros Comunitarios, Fe y Ocio Recurrente — **mixed**

- **Iglesias / congregaciones — the strongest surprise in this genre.** Mexican church-management software already sells exactly this feature set, which proves the behavior exists: Adminfiel "permite definir grupos y asignar líderes, además de crear eventos en cada grupo y llevar estadísticas de asistencias"; Software Redil tracks "asistencia, crecimiento e ingresos financieros" per member and group (https://adminfiel.com/, https://www.softwareredil.com/) — *unverified*. Roster + small groups + attendance = the product core. Revenue model is donations, not memberships — that half goes unused.
- **Centros comunitarios / DIF / PILARES** — fixed-schedule talleres (costura, zumba, baile latino, regularización, manualidades), in-person enrollment with CURP + INE, typically free or low-cost (https://retys.bajacalifornia.gob.mx/Portal/TyS/381?temaId=18) — *unverified*. Class + roster + attendance fits; **there is no revenue to collect**, so the POS and membership-billing half is dead weight and willingness to pay for SaaS is questionable.
- **Parques de trampolines** — closest commercial fit here: "Jumper memberships that provide monthly access with 3 hours of daily access… non-transferable and include an assigned name, start date, and end date" (https://www.telediario.mx/comunidad/parques-de-trampolines-leon-donde-hay-y-cuanto-cuesta-ir) — *unverified*. That is literally a named membership with an expiry.
- **Escape rooms** — single-session bookings, "los juegos duran 45 minutos… equipos de 2 hasta 6 personas", and **no membership/repeat-club program found in any searched source** (https://escaparte.com.mx/) — *unverified negative*. POOR.
- **Esports / gaming / VR arcades** — venues exist (Arena Esports GG, Borregos Esports Arena with "8 gaming positions", https://tec.mx/es/borregos/gaming) but **no monthly-membership pricing found**; likely per-seat resource booking, GAP-B. *Unverified.*
- **Clubes de casas rodantes/campismo** — US-centric cross-venue discount networks ("cuotas anuales… entre $25 y $45… descuentos… de hasta el 50%"), no Mexican single-site equivalent found; value is a network, not a branded single-tenant instance. POOR.

---

## 3. Ranked shortlist — the 7 first targets

Ranked by *fit × evidence quality × Mexican market density*, not by raw size.

1. **Artes marciales y deportes de combate** (G1) — the mensualidad-by-weekly-frequency tier structure is the product's plan model verbatim, and it is the best-sourced pattern in the report.
2. **Gimnasios, boxes de CrossFit y estudios funcionales/HIIT/spinning** (G2) — largest raw category, same model, and the 24/7 sub-niche is the only one with a real (hardware) gap.
3. **Yoga, pilates, barre y estudios de movimiento** (G3) — verified paquete/mensualidad pricing across multiple independent CDMX studios; capacity is the whole point of the room.
4. **Escuelas de natación y academias de patinaje** (G6) — verified monthly tuition, class-by-level rosters, and they sit *inside* facilities whose owners are already software buyers.
5. **Academias de futbol infantil, gimnasia y porras** (G8) — Profeco-verified monthly+inscripción model at national scale — **conditional on shipping GAP-C**; without a guardian↔minor record this is a demo that falls over on the first real signup.
6. **Academias de baile para adultos y talleres de arte/cerámica/cocina** (G7 group tier) — clean monthly-paquete model, low competitive tooling density.
7. **Rocódromos / gimnasios de escalada y boulder** (G5 exception) — the one court-sport-adjacent category where the monthly membership genuinely *is* the entire product (open access, no per-wall reservation), with three independent Mexican price points.

Honourable mention, lower confidence: **barberías con membresía de cortes ilimitados** (G9 pocket) — verified, described as growing, and the only appointment-genre business that dodges GAP-A by being walk-in.

## 4. The five traps — adjacent-looking, do not claim without the named feature

| Looks like a fit because… | Actually needs | Genre |
|---|---|---|
| **Clubes de padel/pickleball/futbol 5** advertise "membresía mensual" | **GAP-B** — per-court hourly inventory with peak/off-peak rates; their "membership" is a discount layer on top of hourly billing, not a replacement for it. Split payments and open-match matching also absent. | G5 |
| **Clínicas dentales, veterinarias y med-spas** sell "membresías" and "planes de salud" | **GAP-A** + a compliant **expediente clínico** (NOM-004-SSA3-2012). Their "membership" is a prepaid discount wrapper — Dentalia's is an annual benefits card, not a subscription. | G9 |
| **Autoescuelas, bootcamps y diplomados** "teach a skill on a schedule" | **GAP-D** (fixed cohorts, level/gradebook, tuition installments/ISA) and, for driving schools, **GAP-A** per-instructor-per-vehicle 1:1 scheduling. No shared-capacity class exists in a driving school at all. | G7 |
| **Country clubs, clubes náuticos, colegios y asociaciones** are literally membership organizations | Household/family accounts, tiered dues + joining fees, guest passes — and they don't take attendance, so the product's strongest feature is unused. | G11 |
| **Estudios de recuperación, crioterapia y flotación** sell tiered monthly memberships with credits | **GAP-B** — each booking consumes one specific physical unit (chamber, tank, pod) for a fixed duration; there is no headcount-capacity class to schedule. | G4 |

---

## 5. Contradictions between agents — stated, not averaged

1. **"Membresía mensual" means two different things (agents 3 vs 1/2).** Agent 3 flagged explicitly that padel, pickleball and karting memberships are **discount/priority-access layers over per-hour fees**, while climbing gyms and skating academies' monthly fees genuinely *are* the whole product. Agent 3's instruction stands: **do not average these together.** A marketing skim that counts every "membresía" as a fit will over-claim the entire court-sport genre.
2. **Guardería is not one market (agent 5).** IMSS daycares "tienen prohibido cobrarte colegiaturas" — a non-commercial segment that is not a SaaS customer — while private guarderías run monthly colegiatura. Counting "guarderías" as one homogeneous TAM is wrong.
3. **Nutriólogos: unassigned boundary (agent 2 → agent 6).** Agent 2 declined the category, arguing licensed nutriólogos keep a clinical/dietary record and belong with agent 6's regulated practices, while unlicensed "wellness/life coaches" belong with mind-body. Agent 6 did not pick it up. **Nutritionists are therefore uncovered in this report**, not judged POOR.
4. **Kids' martial arts: unclaimed overlap (agent 5 → agent 1).** Agent 1 covered adult combat sports; agent 5 flagged that kids-only franchises differ in mechanics (belt progression, sibling discounts, guardian records) and did not search them. Treat kids' martial arts as **G1 booking mechanics + G8 data-model gap**, not as covered by either.
5. **CrossFit affiliate count.** Agent 1 reports "~9,000–9,900, down from a 15,000-gym peak"; agent 8 reports "peaked ~11,366 in March 2024, fell to ~9,899 by March 2025". Both cite the same BarBend page. The 2025 endpoint (~9.9k) is consistent; **the peak figure is not** (15,000 vs 11,366). Neither is primary-sourced from CrossFit HQ.
6. **Beauty-salon establishment count, Mexico (agent 8, internal).** 216,466 (2019 Economic Census) vs 236,378 ("2024 DENUE", news coverage) vs 310,869 ("DENUE 2026", DataMexico). A ~31% jump in two years is implausible without a scope change. **Do not cite any of the three as settled.**
7. **Padel clubs, Mexico (agent 8, internal).** "More than 400 clubs, with 136 opening in 2023" vs "over 320 padel clubs, of which 130 are affiliated with FEMEPA". Probably different populations (all clubs vs federation-affiliated), but neither source states its method.
8. **DENUE vintage (agent 8).** DataMexico labels figures "DENUE 2026" while INEGI's Nov-2024 release describes an edition still built on the 2024 Economic Census base. Unclear whether "DENUE 2026" is a re-count or a refreshed snapshot.

---

## 6. Market sizing: thin and contradictory

Only three Mexico establishment counts were obtained, all via DataMexico (Secretaría de Economía's republication of DENUE) because "INEGI DENUE's own interactive map… and SAIC tabulados tool were identified but not directly queryable" — JS-rendered, no accessible REST endpoint found. **All are marked *unverified* by the sourcing agent.**

| Category | SCIAN | Mexico establishments | Source |
|---|---|---|---|
| Consultorios médicos | 6211 | 85,908 | economia.gob.mx/datamexico — *unverified* |
| Consultorios dentales | 6212 | 76,188 | economia.gob.mx/datamexico — *unverified* |
| Salones y clínicas de belleza (cluster) | 8121 | 310,869 / 236,378 / 216,466 — **contradictory** | see contradiction #6 |
| Escuelas de deporte del sector privado | **611621** | **no count found** | code confirmed only; note it *bundles* martial arts, swimming, futbol, yoga, equitación, gimnasia and tenis into one class, so it can never isolate a sub-niche |
| Clubes deportivos del sector privado | 713941 | **no national total** | per-state DENUE totals exposed at snic.cultura.gob.mx (e_id=1–32); summing 32 states is a concrete, unexecuted next step |
| Guarderías/estancias infantiles | 624411 | **no count found** | — |
| Gimnasios/fitness (713940/713941), veterinarias (541941) | codes known | **no count** — DataMexico fetches returned HTTP 500 | retry or find correct slug via site search |
| Autoescuelas, academias de baile, escuelas de música, academias de idiomas, fisioterapia, tatuajes, padel/tenis, futbol-5, escalada | — | **NO CREDIBLE SOURCE** | — |

Global/other comparables, **all unverified**: HYROX 2,273 affiliated gyms in 20 countries (hyroxvault.com — the one *verified* figure in the set); CrossFit ~9,899 active affiliates March 2025 (barbend.com); >50,000 padel courts worldwide, +17% in 2024 (Playtomic Global Padel Report 2025 via padelbusinessmagazine.com); Mexico padel ~400 or ~320 clubs, ~1,500 courts, ~300,000 amateur players, market >$392M USD/yr (milenio.com, padelco.com.mx); climbing gyms in North America "over 870 in 2024… 60 newly opened: 48 USA, 7 CAN, 5 MEX" (climbingbusinessjournal.com); coworking 7,695 US spaces end-2024 and ~42,000 worldwide, year ambiguous (coworkingcafe.com, 2727coworking.com); ~287 coworking spaces in CDMX (search aggregate); DENUE covers "more than 6 million establishments" nationally (INEGI Nov-2024 boletín).

**Explicitly flagged as widely-repeated-but-unsourced:** the Health & Fitness Association's "over 200,000 health and fitness facilities" global claim is an association self-description with no cited methodology (healthandfitness.org). The three US NAICS counts retrieved (fitness centers 47,301; beauty salons 125,440; tutoring 7,885) come from **data-broker aggregators, not the Census Bureau's County Business Patterns**, and should be replaced before publishing anything.

**Bottom line on sizing: do not put establishment counts on the marketing page from this report.** One clean pass against INEGI SAIC/DENUE and Census CBP would fix it.

---

## 7. What would change this answer

- **Shipping a per-practitioner appointment book (GAP-A) reclassifies an entire genre.** G9 (salud y cuidado personal) is the largest establishment-count cluster found anywhere in this report — 85,908 consultorios médicos + 76,188 dentales + the beauty cluster — and it flips from POOR to addressable on that one feature (minus the clinical-record requirement, which is a separate NOM-004 obligation and a separate build).
- **Shipping resource-inventory booking with hourly/peak pricing (GAP-B)** flips padel, pickleball, futbol 5/7, golf bays, karting, float tanks, cryo studios, coworking meeting rooms and makerspace machines all at once — and puts the product head-to-head with Playtomic/MATCHi, whose commission model (5–15% per booking) is a different business model, not just a different feature.
- **Shipping a guardian↔minor record (GAP-C)** converts G8 from "demo that breaks at signup" to a first-tier target, and the Profeco-verified pricing says the willingness to pay is there.
- **Evidence that Mexican EMS, powerlifting, equestrian and outdoor-bootcamp businesses sell mensualidades** would move four currently-inferred rows to STRONG. All four are unsourced today.
- **A single verified DENUE/SAIC pass** could invert the target ranking entirely: SCIAN 611621 bundles martial arts, swimming, futbol, yoga, equitación, gimnasia and tenis into one class, so today there is *no* way to tell whether combat sports or swim schools is the bigger Mexican market. If 611621's national total came back small relative to 713940 gyms, the shortlist order changes.
- **A church-segment revenue test.** G12's iglesias match the product's roster+attendance core more exactly than most paying genres, and Mexican church-management software already exists — but their money is donations, not memberships. Evidence that Mexican congregations pay for SaaS at gym-like price points would add a genre; evidence they don't removes it permanently.
- **Any primary-sourced global gym count** replacing the Health & Fitness Association's self-described "200,000 facilities" would change how big the headline TAM claim can honestly be.
