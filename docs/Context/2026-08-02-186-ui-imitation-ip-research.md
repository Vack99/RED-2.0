# Copying a competitor's screen structure: what the law actually says

**Date:** 2026-08-02
**Trigger:** the Fitco-derived dashboard model adopted from `docs/Context/2026-08-01-181-vendor-directory-segmentation.md` (Part 1, Fitco row; §D6).
**Jurisdictions:** Mexico (primary — where the product is sold and both live gyms are) and the United States (secondary — the case law everyone actually cites, and where Vercel/GitHub sit).

> **THIS IS RESEARCH, NOT LEGAL ADVICE.** I am not a lawyer and this is not an attorney-client
> communication. Every load-bearing claim below carries a source link and a tier tag
> (**STATUTE** / **CASE LAW** / **REGULATION** / **COMMENTARY**). Places where a licensed
> Mexican attorney is genuinely worth five minutes are named in §7. Everything I could not
> verify is parked in §6 as a gap rather than guessed at.

---

## 0. Three facts that reframe the question before any law is applied

Established by reading the repo, not by reasoning:

**0.1 — Nothing has shipped.** All seven `/proto` routes are hard-404'd in production
(`if (process.env.NODE_ENV === "production") notFound();` — present in every one of
`apps/admin/src/app/proto/{page,actual,a-tiers,b-desk,c-inicio,c-inicio/directorio,d-ruido,e-fitco,e-fitco/inicio}/page.tsx`),
and the entire `apps/admin/src/app/proto/` tree is **untracked in git**. It is not deployed, not
public, and not commercially in use. Every theory of liability below — copyright, trade dress,
unfair competition — requires *commercial use* or *publication*. Right now there is none.

**0.2 — The "verbatim sentence of Fitco's documentation" is not verbatim, and is not Fitco's sentence.**
The brief describes item 3 as "one full sentence of Fitco's own help-centre documentation." It isn't.
I fetched Fitco's article. What Fitco actually writes is:

> «Muestra a todos los usuarios que tienen un plan vencido dentro del día 1 al 15, es decir, si al
> usuario se le venció la membresía **hace 16 días ya no aparecerá en esta sección**.»
> — [Fitco, *Dashboard: cómo funciona y para qué sirve*](https://soporte.fitcolatam.com/es/articles/4566446-dashboard-como-funciona-y-para-que-sirve)

What `apps/admin/src/app/proto/e-fitco/_components/inicio-e.tsx:237` renders is:

> `«Después de 16 días, los clientes ya no aparecen».`

Different words, different sentence structure, different subject. It is an independently-worded
one-line compression of a functional rule — which is exactly what independent expression of an
unprotectable fact looks like. The copyright question on item 3 largely evaporates. **A different
problem replaces it, and it is a real one: the guillemets.** See §2, item 3.

**0.3 — `Vack99/RED-2.0` is a PUBLIC repository** (`gh repo view` → `"visibility":"PUBLIC"`).
Nothing at issue is committed yet, but the moment `apps/admin/src/app/proto/` is committed, the
source comments go on the open internet. One of them, rendered on-screen at
`inicio-e.tsx:292`, reads **«Es literal el tablero de Fitco»** — "it is literally Fitco's dashboard."
That sentence is (a) factually false and (b) the single most quotable artifact in this whole matter.
This is the highest-value thing on the change list, and it has nothing to do with copyright law.

---

## 1. Verdict

**You are over-worrying, and the exposure here is very low — but not zero, and the non-zero part
isn't where you think it is.**

Copying a competitor's *functional model* — which people appear on which tile, on what clock, with
what cutoff — is the part of a software product that copyright law most clearly refuses to protect,
in both jurisdictions, and it is not patentable in Mexico either. Mexican copyright law excludes
"métodos, sistemas… procesos" and "esquemas, planes o reglas para realizar… negocios" **by
statutory text** (LFDA art. 14 fr. I and III), and Mexican patent law excludes "programas de
computación," "métodos… para realizar negocios," and "las formas de presentar información" from
being inventions at all (LFPPI art. 47). US law reaches the same place through §102(b) and
*Lotus v. Borland*. A 15-day window with a day-16 cutoff is a business rule. Nobody owns it.

The two Spanish labels are short descriptive phrases. US regulation excludes "words and short
phrases such as names, titles, and slogans" from copyright outright (37 CFR §202.1(a)); Mexican
statute excludes "los nombres y títulos o frases aislados" (LFDA art. 14 fr. V). As trademarks they
are weak-to-unregistrable in both systems because they merely describe what the screen does
(LFPPI art. 173 fr. IV; US §2(e)(1) read through the doctrine of foreign equivalents). And a section
header on a private admin screen is not use *as a mark* in the first place.

The code was written independently from a written spec, from a **public help centre**, with no
account, no login, no ToS accepted, and no access to Fitco's code, markup, CSS or assets. That
combination removes copyright (independent creation is a complete defence), removes trade secret
(published material is by definition not secret), and — importantly — removes the **contract**
theory that is the one that actually wins competitor-study cases in SaaS: a "you may not use the
Service to build a competing product" clause in a ToS you never accepted binds nobody.

**What is left, honestly:** three self-inflicted documentation artifacts (a fake quotation, a
competitor's name in product copy, a route named `e-fitco`), and one thin Mexican `competencia
desleal` theory that requires *confusion in the market* — which a differently-branded,
differently-designed, Spanish-language product sold to a different customer set does not create.
All four are fixable tonight in under thirty minutes, and three of them are just string edits.

---

## 2. Per-item rulings

| # | Item | Ruling |
|---|---|---|
| 1 | The functional model (two bounded tiles, 15-day windows, two arms, day-16 drop-off, counts + deep links) | **SAFE** |
| 2 | The two labels `PRÓXIMAS RENOVACIONES` / `CLIENTES POR RECUPERAR` | **SAFE** (with a 2-minute register check in §3.4) |
| 3 | The on-screen sentence in guillemets | **CHANGE IT** — but for the opposite reason to the one assumed |
| 4 | Code written independently from a spec, no product access | **SAFE** — this is your strongest fact, protect it |
| 5 | Connect Gym's `N activos de M totales` ratio | **SAFE** |
| 6 | *(not on the brief)* `«Es literal el tablero de Fitco»` + the `e-fitco` route name, in a public repo | **CHANGE IT** — highest exposure on this page |

---

### Item 1 — The functional model → **SAFE**

**Mexico (controlling).** LFDA art. 14 removes from copyright, verbatim:

- fr. I — «Las ideas en sí mismas, las fórmulas, soluciones, conceptos, **métodos, sistemas**,
  principios, descubrimientos, **procesos** e invenciones»
- fr. III — «Los **esquemas, planes o reglas** para realizar actos mentales, juegos o **negocios**»

[STATUTE — [LFDA art. 14, consolidated text](http://www.ordenjuridico.gob.mx/Documentos/Federal/html/wo17068.html) · [LFDA art. 14, fracción-by-fracción](https://leyes-mx.com/ley_federal_del_derecho_de_autor/14.htm)]

"Show members expiring in ≤15 days; show members lapsed 1–15 days, split by cause; drop them at
day 16" is a rule for running a business. It is fr. I and fr. III twice over.

What *is* protected is narrower than people assume: LFDA art. 101 defines a programa de computación
as «la expresión original en cualquier forma, lenguaje o código», and art. 102 says «Los programas
de computación se protegen en los mismos términos que las obras literarias.» The object of
protection is the **expression in the code**, protected as a *literary* work. No Fitco code was
seen or copied. [STATUTE — [LFDA arts. 101–106](http://www.ordenjuridico.gob.mx/Documentos/Federal/html/wo17068.html)]

Nor is there a patent flank. LFPPI art. 47 states that the following are **not inventions**:
«los esquemas, planes, reglas y métodos para el ejercicio de actividades intelectuales… o para
actividades económico-comerciales o para realizar negocios», «los programas de computación», and
«las formas de presentar información». A dashboard tile is all three.
[STATUTE — [LFPPI art. 47](https://mley.mx/LFPPI/articulo/47/) · [IMPI, *Exclusiones y excepciones a la patentabilidad*](https://www.impi.gob.mx/cloud/Seminario_en_linea_Ley_Federal_de_Proteccion_a_la_/D%C3%ADa%2005%20-%2017%20de%20octubre/11%20Exclusiones%20y%20excepciones%20patentabilidad.pdf)]

**United States (persuasive, and the reason everyone believes this is settled).**

- ***Lotus Development Corp. v. Borland International***, 49 F.3d 807 (1st Cir. 1995), *aff'd by an
  equally divided Court*, 516 U.S. 233 (1996). Borland copied Lotus 1-2-3's entire menu command
  hierarchy. Held uncopyrightable as a "method of operation" under 17 U.S.C. §102(b) — and the court
  reached that result **while accepting that the Lotus developers made expressive choices**:
  "we nonetheless hold that the expression is not copyrightable because it is part of Lotus 1-2-3's
  'method of operation.'" That is the closest analogue to a screen structure that exists.
  ⚠️ **Limit worth knowing:** the 4–4 Supreme Court affirmance means Lotus binds the First Circuit
  only and set no national rule. [CASE LAW — [full text, BitLaw](https://www.bitlaw.com/source/cases/copyright/Lotus.html) · [FindLaw](https://caselaw.findlaw.com/court/us-1st-circuit/1118863.html) · [Oyez, SCOTUS disposition](https://www.oyez.org/cases/1995/94-2003)]
- ***Apple Computer, Inc. v. Microsoft Corp.***, 35 F.3d 1435 (9th Cir. 1994). The canonical
  "look and feel" case, and Apple lost. GUIs get only **thin** copyright; once unprotectable
  elements are dissected out, infringement requires the works "as a whole [to be] **virtually
  identical**." Windows, icons, menus and the desktop metaphor were treated as unprotectable ideas /
  functionally dictated. RED and Fitco are not virtually identical — different brand, different
  visual language, different app.
  [CASE LAW — [Justia](https://law.justia.com/cases/federal/appellate-courts/F3/35/1435/605245/)]
- ***Computer Associates Int'l v. Altai***, 982 F.2d 693 (2d Cir. 1992) — abstraction-filtration-
  comparison. Before you compare anything, you **filter out** elements dictated by efficiency, by
  external factors, by industry standard, and by the public domain. §181's own finding does this
  filtering for you: the pre-expiry window is near-universal (`Caduca Pronto` 14d CrossHero,
  `Membresías por Vencer` Connect Gym, `Expiring` Mariana Tek, Glofox's Expiring Members Report,
  PushPress `Pending Cancels`) — that is textbook **scènes à faire** in this vertical.
  [CASE LAW — [full text, BitLaw](https://www.bitlaw.com/source/cases/copyright/altai.html)]
- ***Google LLC v. Oracle America, Inc.***, 593 U.S. 1 (2021). Google copied **11,500 lines of
  Java declaring code verbatim** plus its structure/sequence/organisation, and won on fair use — the
  Court characterising it as "reimplementation of a user interface." If verbatim copying of an
  interface's declarations is fair use, re-deriving a dashboard rule from public prose is not close
  to the line.
  ⚠️ **Limit:** the Court **assumed without deciding** that the declaring code was copyrightable and
  ruled on fair use only. It did not hold that SSO is unprotectable.
  [CASE LAW — [U.S. Copyright Office Fair Use Index summary](https://www.copyright.gov/fair-use/summaries/google-llc-oracle-am-inc-2021.pdf) · [Congressional Research Service, LSB10597](https://www.congress.gov/crs-product/LSB10597)]

**Merger and scènes à faire, stated once.** Merger applies where idea and expression are
inseparable; scènes à faire where similarity flows from external constraint or convention. In UI,
elements "dictated by industry standards, hardware limitations, or user expectations… are not the
result of creative choice but are externally constrained."
[COMMENTARY — [Tannenbaum Helpern](https://www.thsh.com/publications/merger-and-scenes-a-faire-two-defenses-to-substantial-similarity-in-copyright-litigation/) · [Univ. of Cincinnati Law Review blog](https://uclawreview.org/2019/11/18/modifying-the-altai-test-the-copyright-doctrines-of-merger-and-scenes-a-faire-should-be-applied-differently-for-computer-programs/)]

---

### Item 2 — The two Spanish labels → **SAFE**

**Copyright, US.** 37 CFR §202.1(a) excludes from registration, verbatim: *"Words and short phrases
such as names, titles, and slogans; familiar symbols or designs; mere variations of typographic
ornamentation, lettering or coloring."* The Copyright Office adds that it will not register short
phrases "even if the word or short phrase is novel, distinctive, or lends itself to a play on
words." A two-word label is inside that exclusion with room to spare.
[REGULATION — [eCFR 37 CFR §202.1](https://www.ecfr.gov/current/title-37/chapter-II/subchapter-A/part-202/section-202.1) · [Copyright Office Circular 33](https://www.copyright.gov/circs/circ33.pdf)]

**Copyright, Mexico.** LFDA art. 14 fr. V: «Los **nombres y títulos o frases aislados**». Mexico has
a direct statutory equivalent of the short-phrases exclusion — it is not merely an Office practice
as in the US, it is in the Act.
[STATUTE — [LFDA art. 14](https://leyes-mx.com/ley_federal_del_derecho_de_autor/14.htm)]

**Trademark, Mexico.** LFPPI art. 173 fr. IV bars registration of «los signos que considerando el
conjunto de sus características sean **descriptivos** de los productos o servicios que pretenden
distinguir», and fr. I bars generic/common-usage terms. `Próximas renovaciones` = "upcoming
renewals"; `Clientes por recuperar` = "clients to win back." Both describe precisely what the
screen contains. Even if someone held a registration, descriptive marks are weak and confined to
their exact goods/services.
[STATUTE — [LFPPI art. 173](https://mley.mx/LFPPI/articulo/173/) · COMMENTARY — [Noth, *Marcas: distintividad, prohibiciones y registrabilidad bajo la LFPPI*](https://noth.mx/pages/boletin.php?id=9)]

**Trademark, US.** The doctrine of foreign equivalents requires translating foreign wording where
the ordinary American purchaser would "stop and translate," and Spanish is squarely a "common,
modern language" for this purpose. TMEP: *"the foreign equivalent of a merely descriptive English
word is no more registrable than the English word itself."* `UPCOMING RENEWALS` would be refused
under §2(e)(1); so would its Spanish equivalent.
[COMMENTARY on TMEP — [INTA Trademark Reporter, Gilson LaLonde, *Making Sense of the Doctrine of Foreign Equivalents*](https://www.inta.org/wp-content/uploads/public-files/resources/the-trademark-reporter/TMR-Vol-112-No-05-Gilson-LaLonde.pdf) · [DBL Lawyers](https://www.dbllawyers.com/understanding-the-basics-of-the-doctrine-of-foreign-equivalents-within-u-s-trademark-law/)]

**And the threshold point that makes the above mostly moot:** trademark liability requires use *as a
mark* — as a source identifier — plus likelihood of confusion. A section header inside a private,
authenticated admin panel identifies a *screen region*, not the origin of the software. No gym owner
seeing `CLIENTES POR RECUPERAR` inside RED thinks they bought Fitco.

⚠️ I did **not** complete a register search. See §6.1.

---

### Item 3 — The on-screen sentence → **CHANGE IT** (but the premise was wrong)

The copyright analysis is short, because per §0.2 the string is not Fitco's sentence:

- It states a **fact** about how a product behaves. Facts are uncopyrightable — "the first person to
  find and report a particular fact has not created the fact." *Feist Publications v. Rural
  Telephone Service*, 499 U.S. 340 (1991). [CASE LAW — [Cornell LII](https://www.law.cornell.edu/supremecourt/text/499/340)]
- It is a short phrase / `frase aislada` — 37 CFR §202.1(a) and LFDA art. 14 fr. V.
- The number of ways to state "after day 16 they stop appearing" in one clause of Spanish is small
  enough that merger bites.

**So why change it?** Because of what it *looks like*, not what it *is*. The guillemets present the
line as a quotation from an unnamed third party. That is:

1. **Factually untrue** — nobody wrote that sentence. You did.
2. **Evidence you manufactured against yourself.** If this ever went anywhere, the exhibit would not
   be a doctrinal argument about §102(b); it would be a screenshot of your product quoting your
   competitor. Quotation marks in a product UI signal *provenance*. Yours point at a source that
   doesn't exist and imply copying you did not in fact do.

**Fix:** delete the guillemets and state it as your own rule — e.g.
`Al día 16 dejan de aparecer aquí.` One string. Zero behaviour change. Removes the only artifact in
the whole matter that would ever end up on a slide.

---

### Item 4 — Independent creation from a written spec → **SAFE, and it is your strongest fact**

Independent creation is a **complete defence** to copyright — it defeats the copying element
outright, not merely as an excuse. Clean-room practice exists precisely to make that provable:
one person reads the target and writes a functional specification, and a separate implementer works
only from that spec. What you did is a legitimate variant of it: the spec was written from
**published documentation**, and no protected artifact was ever in the room.
[COMMENTARY — [Chip Law Group, *How to Develop an IP "Clean Room" Policy*](https://www.chiplawgroup.com/how-to-develop-an-ip-clean-room-policy/) · [Finnegan, *Clean Your Room*](https://www.finnegan.com/en/insights/articles/clean-your-room-protecting-against-trade-secret-misappropriation-claims.html)]

Two flanks this fact closes that nobody usually notices:

- **Trade secret is off the table.** A secreto industrial requires information kept confidential
  under reasonable measures. A public help centre is the categorical opposite. Reading
  `soporte.fitcolatam.com` is reading a publication.
- **Contract is off the table — and contract is the theory that actually wins these cases.**
  Most SaaS terms of service contain a "you may not access the Service to build a competitive
  product / benchmark it" clause, and breach of that clause is the realistic litigation risk in
  competitor-study disputes, not copyright. §181's own method section records that
  **"No vendor's live member list was operated"** and that the material read was the help centre.
  No account, no click-wrap, no contract, no clause. **Do not lose this.** Never create a Fitco
  trial account "to check the design." That single act would convert the cleanest fact in this file
  into the only real cause of action available to them.

---

### Item 5 — Connect Gym's `N activos de M totales` ratio → **SAFE**

A ratio is a mathematical form of presenting information. LFPPI art. 47 excludes «las formas de
presentar información» from patentability; LFDA art. 14 fr. I excludes «fórmulas… métodos, sistemas»
from copyright; the words `activos` / `totales` are generic Spanish. It was read from a **product
screenshot on the vendor's own public landing page** — published marketing, no confidentiality, no
access control. Nothing to discuss.

---

### Item 6 — *(added)* Competitor naming in a public repo → **CHANGE IT — top of the list**

Currently, in the untracked prototype:

- `inicio-e.tsx:292` renders on-screen: **«Es literal el tablero de Fitco»**
- `inicio-e.tsx:293–294`, `fitco.tsx:49–53`, `lifecycle.ts:16–41`, `proto/page.tsx:41–53` all name
  Fitco or Connect Gym in comments and copy
- the route itself is `/proto/e-fitco`, the component file is `fitco.tsx`

**None of this is unlawful.** Naming a competitor to refer to them is nominative use, and the
comments are honest design provenance — which, as §4 argues, is affirmatively *useful* to you.
**But:** the repo is public (§0.3), and "it is literally the competitor's dashboard" is a sentence
you wrote, about yourself, that is both untrue and maximally damaging out of context. It is the one
string here a plaintiff's lawyer would enlarge. And it is not even accurate — §181 D1 shows you
chose the flat-list family on *reasoned grounds* shared by four vendors, not by tracing one.

Keep the citation. Kill the on-screen claim of literalness, and keep the competitor's name out of
route paths and rendered product copy.

---

## 3. What to change — ranked by exposure

Roughly thirty minutes, all of it string and file-name work. **None of it changes behaviour.**

**3.1 — Rewrite `«Es literal el tablero de Fitco»`** (`apps/admin/src/app/proto/e-fitco/_components/inicio-e.tsx:292`).
Replace with the accurate version: this variant follows the *purely-derived, one-flat-list* family
identified in §181 D1 (Gymflow, Glofox, Fitco, Arketa), with a bounded post-expiry window. Same
information, and it is true. **Highest exposure** because it is a false self-accusation destined for
a public repo.

**3.2 — Drop the guillemets on the day-16 line** (`inicio-e.tsx:237`). Make it your own sentence:
`Al día 16 dejan de aparecer aquí.` Removes a fabricated attribution from a product screen.

**3.3 — Rename the route and component before anything ships.** `/proto/e-fitco` → `/proto/e-acotado`
(or `e-ventanas`), `fitco.tsx` → `directorio-plano.tsx`, label `E · FITCO` → `E · ACOTADO`.
A competitor's trademark in your URL path is the only place in this matter where a *trademark*
theory could get any purchase at all, and it costs you nothing to remove. Keep the provenance in a
**source comment** citing §181 and the Fitco help-centre URL — that is documentation, not branding.

**3.4 — Do a five-minute register check before either Spanish label ships to production.**
Search IMPI Marcanet for `CLIENTES POR RECUPERAR`, `PRÓXIMAS RENOVACIONES`, `FITCO` and
`CONNECT GYM` in classes 9 and 42. I could not complete this (§6.1). Expected result: nothing, or
descriptive-and-therefore-narrow. If — unexpectedly — `CLIENTES POR RECUPERAR` is registered as a
**aviso comercial** or marca in class 42 by Fitco's operator, rename it (`POR RECUPERAR`,
`RECUPERABLES`, `SE FUERON HACE POCO`). Cheap insurance, not an emergency.

**3.5 — Optional, and genuinely optional: differentiate one parameter.** You currently match Fitco
on 15/15/day-16. §181 D5–D6 shows the field is *not* converged: CrossHero uses 7–10/11–15/16–31,
TeamUp and Wodify use 15 days on a *different clock*, WellnessLiving uses two operator-set
thresholds, and the majority make it a tenant setting. Making the window a **tenant setting with a
15-day default** — which is where the evidence points anyway — is a better product *and* moots any
"they copied our numbers" framing. **Do this for product reasons, not legal ones.** Legally, the
numbers are unprotectable facts either way; I would not spend a single design decision on the
legal motive alone.

**Explicitly NOT on this list:** changing the two tiles, the two arms, the deep links, the counts,
the ratio header, or either Spanish label. Those are safe.

---

## 4. What to document

**The research doc already does most of the job, and it helps a lot.**
`docs/Context/2026-08-01-181-vendor-directory-segmentation.md` is close to an ideal independent-
creation record, and better than what most companies have. Specifically, these parts do legal work:

- The **method section** stating «No vendor's live member list was operated» and that the evidence
  is the help centre. That is your no-contract, no-trade-secret fact, contemporaneously recorded.
- The **confidence key** (OBSERVED / DOCUMENTED / REPORTED / INFERRED) with a source URL on every
  claim. It shows the inputs were *published* material.
- The **20-vendor breadth**. This is what makes the design read as synthesis rather than tracing —
  §181 C5 shows the pre-expiry window is near-universal (scènes à faire), and §181 D1 shows you
  chose the flat-list family on a *stated structural reason* (RED has no declared "gone" lever) that
  applies to four vendors, not one.

**What is missing, in order of value:**

1. **Commit it.** An untracked file has no timestamp anyone but you can see. A git commit is a
   dated, hash-chained record of what was known and when — which is exactly the evidence
   independent creation needs. Same for the written spec that the code was built from: if that spec
   exists only in a chat transcript, put it in `docs/`.
2. **One explicit sentence in §181's method section**, in the doc's own voice: *"No vendor account
   was created, no vendor product was logged into, and no vendor source code, markup, stylesheet,
   image or other asset was accessed. All material relied on was publicly published documentation
   and marketing."* You have the substance scattered across the method notes; state it as one
   claim so it can be pointed at.
3. **A short design-rationale note** recording *why* each parameter was chosen — that the 15-day
   window sits inside the 7–31-day spread §181 D5 found across the field, and that the bounded
   window was chosen over ranking because §180's defect was an unbounded list. Independent creation
   is proven by showing your reasoning, not by proving you never looked.
4. **Nothing else.** Do not write a memo titled "legal analysis of the Fitco question," do not
   circulate a self-assessment of infringement risk, and do not have the codebase argue about its
   own legality. Documents like that are discoverable and are read against their author. This file
   is research on the law; keep it that way.

---

## 5. The remaining doctrines, briefly

### 5.1 `Competencia desleal` (Mexico) — the only theory with a pulse, and it needs confusion

**LFPPI art. 386 fr. I** — «Realizar actos contrarios a los buenos usos y costumbres en la
industria, comercio y servicios que impliquen competencia desleal.»
**fr. II** — «Efectuar, en el ejercicio de actividades industriales o mercantiles, actos que causen
o **induzcan al público a confusión, error o engaño**», with incisos covering false claims of
association, licensing, authorisation, or origin.
[STATUTE — [LFPPI art. 386](https://leyes-mx.com/ley_federal_de_proteccion_a_la_propiedad_industrial/386.htm)]

Two more hooks worth knowing exist: **Código de Comercio art. 6 Bis** obliges merchants to act
«conforme a los usos honestos en materia industrial o comercial», and Mexico is bound by
**Paris Convention art. 10bis**, which defines unfair competition as «todo acto contrario a los usos
honestos en materia industrial o comercial» and specifically targets acts «capaz de crear confusión».
[STATUTE / TREATY — [Convenio de París, texto en español](http://www.ordenjuridico.gob.mx/TratInt/2022ml/CONVENIO%20DE%20PARIS%201958.pdf) · COMMENTARY — [A2Z Legal, *El papel de la competencia desleal*](https://a2zlegal.com.mx/marcas/4342/) · [UNAM, *Supuestos de competencia desleal en propiedad industrial*](https://archivos.juridicas.unam.mx/www/bjv/libros/6/2634/12.pdf)]

Note the structure: unfair competition in Mexico is an **administrative infraction prosecuted before
IMPI**, not a general tort of "you copied us." Its centre of gravity is **market confusion** —
customers being misled about who made what, or about an association between the two businesses.
Nothing in items 1–5 does that. Different brand, different name, different visual design, different
language register, different customers, different country of sale, and a private admin panel that
prospects do not comparison-shop by screenshot. Copying an *unprotectable functional idea*, without
confusion, is competition — which is the activity the law is protecting, not the one it punishes.
[COMMENTARY — [Beltrán, *Competencia desleal: es una infracción administrativa*](https://beltran.mx/es/noticias-y-blog/item/251-competencia-desleal-es-una-infraccion-administrativa)]

### 5.2 Does Mexican law protect UI layout / look and feel?

**Short answer: not through copyright, on the available evidence.** Article 13 fr. XI protects
«programas de cómputo», and arts. 101–102 define the object of that protection as the *original
expression in any form, language or code*, protected «en los mismos términos que las obras
literarias» — i.e. it is the code that is the literary work. Screen layout is not named anywhere in
art. 13, and art. 14 fr. I/III/V affirmatively strip out the method, the scheme, and the isolated
phrase.
[STATUTE — [LFDA arts. 13, 14, 101–106](http://www.ordenjuridico.gob.mx/Documentos/Federal/html/wo17068.html)]

Mexican practitioner commentary reaches the same conclusion and identifies where UI protection
*does* live: *"as a general rule, graphical user interfaces escape copyright protection as technical
elements that merely allow interaction between software and the user"* — with the exception that an
**ornamental** solution (iconography, animated transitions, layout as visual design) can be
registered as an **industrial design**, and Mexican industrial-property law now recognises animated
graphic interfaces. That is a *registered ornamental* right over a specific visual appearance. It
would cover Fitco's pixels, if they had registered any — never a 15-day rule, and never a rule
expressed in your own visual language.
[COMMENTARY — [Faroo Legal, *Protección jurídica del software*](https://faroolegal.com/post/proteccion-juridica-del-software-derechos-de-autor/) · [Justia México, *Derechos de autor de programas de computación*](https://mexico.justia.com/derecho-de-la-propiedad-intelectual/derechos-de-autor-de-programas-de-computacion-programas-informaticos/)]

⚠️ I found **no Mexican tesis or jurisprudencia** on software look-and-feel. See §6.3.

### 5.3 Trade dress / imagen comercial — what a plaintiff would actually have to prove

Mexico recognises trade dress as **«imagen comercial»**, registrable as a marca under LFPPI art. 172
— "la pluralidad de elementos operativos y de imagen (color, diseño, disposición) que distinguen un
servicio o producto."
[STATUTE + COMMENTARY — [LFPPI art. 173 context](https://mley.mx/LFPPI/articulo/173/) · [MGPS, *La imagen comercial o trade-dress*](https://www.mgps.com.mx/en/la-imagen-comercial-o-trade-dress/)]

In the US a trade-dress plaintiff must prove **(1) distinctiveness, (2) likelihood of confusion,
(3) non-functionality**; and for *product design* trade dress, distinctiveness can only be acquired —
inherent distinctiveness is unavailable, so **secondary meaning is mandatory**. *Wal-Mart Stores v.
Samara Brothers*, 529 U.S. 205 (2000), narrowing *Two Pesos v. Taco Cabana*, 505 U.S. 763 (1992).
[CASE LAW — [Berkeley BCLT case summary](https://www.law.berkeley.edu/archive/files/bclt_AnnualReview_Wal-Mart_Case_Summary.pdf) · COMMENTARY — [Finnegan, *A Guide to Trade Dress in the United States*](https://www.finnegan.com/en/insights/articles/a-guide-to-trade-dress-in-the-united-states.html)]

**How realistic is such a claim here? It isn't.** A plaintiff would have to establish that a
dashboard tile layout is *non-functional* (it is the opposite — its entire justification is what it
does), that it has acquired *secondary meaning* such that Mexican gym owners identify that layout
with Fitco specifically, and that a differently-branded, differently-coloured, differently-typeset
Spanish app causes *confusion about source*. Each element fails independently. The non-functionality
element alone is usually fatal to software-UI trade dress claims, since the layout is chosen for
what it accomplishes. *(The leading US functionality case is* TrafFix Devices v. Marketing Displays*,
532 U.S. 23 (2001) — cited from knowledge, not re-verified in this session; treat as directional.)*

---

## 6. Gaps — what I could not verify

Marked as gaps rather than filled with a guess, per map #180's standing bar.

**6.1 — No IMPI register search was performed. This is the largest gap.**
`marcanet.impi.gob.mx` failed DNS resolution entirely (`getaddrinfo ENOTFOUND`). The alternate host
`acervomarcas.impi.gob.mx:8181/marcanet/` rendered only its landing shell; its searches run through
session-based `.pgi` form POSTs with no URL-addressable query interface, which no fetch method
available here can drive. **I therefore have no data on whether `CLIENTES POR RECUPERAR`,
`PRÓXIMAS RENOVACIONES`, `FITCO` or `CONNECT GYM` are registered marks or avisos comerciales in
Mexico.** §3.4 is the manual five-minute substitute. Do not read my analysis as "nothing is
registered" — read it as "if something is registered it is descriptive and therefore narrow."

**6.2 — The USPTO search is indirect and incomplete.** TESS was retired in 2023; its replacement at
`tmsearch.uspto.gov` is a SPA whose API rejected GET (404), and both `trademarks.justia.com` and
`uspto.report` returned HTTP 403. What I have is search-engine-indexed USPTO records:
`FITCO PRODUCTS & SOLUTIONS` (Ser. 86206501 / Reg. 4941876 — motor drives, oil & gas),
`FIT NOT QUIT` owned by FITCO LLC of Arizona (Ser. 97244291 / Reg. 7402644 — fitness consulting),
and `Fitco Fitness Equipment, LLC` (Ser. 97105037 — athletic bags). **None is Fitco LatAm's
gym-management software**, and I found no US record for either Spanish phrase — but "not surfaced by
a search engine" is not "not registered."
[Indexed records — [uspto.report/TM/97105037](https://uspto.report/TM/97105037) · [trademarks.justia.com — FITCO PRODUCTS](https://trademarks.justia.com/862/06/fitco-products-86206501.html)]

**6.3 — No Mexican case law on software UI.** I found no tesis, jurisprudencia or IMPI resolution
addressing whether screen layout or workflow is protected in Mexico. The §5.2 conclusion rests on
**statutory text plus practitioner commentary**, which is a weaker tier than a decided case. It is
the same weakness §181 flagged about default sort order: no published counter-example *and* no
published precedent.

**6.4 — The April 2026 LFPPI reform is unassessed.** A comprehensive reform decree was published in
the DOF on **3 April 2026**. I verified that it exists and that it touches third-party observations
and patent practice; I did **not** verify whether it altered arts. 47, 172, 173 or 386, which are the
articles this analysis leans on. Any lawyer consult should confirm those four against the post-reform
consolidated text.
[COMMENTARY — [HyA IP, *Reforma integral a la LFPPI*](https://www.hyaip.com/es/espacio/reforma-integral-lfppi-practica-patentes-mexico/) · [HyA IP, *lo que cambia para las marcas*](https://www.hyaip.com/es/espacio/reforma-lfppi-mexico-cambios-marcas/)]

**6.5 — Fitco's own terms of service were not read.** Not necessary on these facts (no account was
created, so no terms were accepted), but if anyone ever signs up for a Fitco trial, that document
becomes the controlling one and everything in §2 item 4 has to be re-run.

---

## 7. If you want a lawyer, ask exactly this

You do not need one for this. If you want one anyway — or you're about to take investment, sell to a
chain, or ship the labels to production at scale — a Mexican IP attorney (`propiedad intelectual`,
IMPI practice) can close it in one short consult. Ask these four, in this order, and hand them §181
plus this file:

1. *"Ninguna parte de esto se ha publicado ni desplegado. ¿Cambia eso su respuesta?"* — establishes
   §0.1 up front, which is the fact that shrinks the consult.
2. **"¿Existe registro marcario o de aviso comercial en México sobre `CLIENTES POR RECUPERAR` o
   `PRÓXIMAS RENOVACIONES` en clases 9 o 42?"** — the one thing I could not check (§6.1). They have
   Marcanet access daily; it is a two-minute lookup for them.
3. **"¿Reproducir el *modelo funcional* de un tablero de un competidor — ventanas de 15 días, corte
   al día 16 — habiendo leído sólo su centro de ayuda público y sin acceder a su producto,
   constituye competencia desleal bajo el art. 386 de la LFPPI, aun sin confusión en el mercado?"**
   — this is the only genuinely open question in the file, because it is Mexican-law-specific and I
   found no case law (§6.3). It is a yes/no question they can answer from experience.
4. *"¿La reforma a la LFPPI del 3 de abril de 2026 modificó los artículos 47, 172, 173 o 386?"*
   — closes §6.4.

Do **not** ask "are we infringing?" That is an open-ended question that generates an expensive memo.
Ask the four closed questions above and you will get four answers.

---

## Sources

**Statute — Mexico**
[LFDA, consolidated text (Orden Jurídico Nacional)](http://www.ordenjuridico.gob.mx/Documentos/Federal/html/wo17068.html) ·
[LFDA art. 14, fracción-by-fracción](https://leyes-mx.com/ley_federal_del_derecho_de_autor/14.htm) ·
[LFDA at WIPO Lex (amended to 1 Jul 2020)](https://www.wipo.int/wipolex/en/legislation/details/20225) ·
[LFPPI art. 47 — exclusiones a la patentabilidad](https://mley.mx/LFPPI/articulo/47/) ·
[LFPPI art. 173 — signos no registrables](https://mley.mx/LFPPI/articulo/173/) ·
[LFPPI art. 386 — infracciones administrativas](https://leyes-mx.com/ley_federal_de_proteccion_a_la_propiedad_industrial/386.htm) ·
[LFPPI, texto oficial (Cámara de Diputados)](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPPI.pdf) ·
[Convenio de París (texto en español)](http://www.ordenjuridico.gob.mx/TratInt/2022ml/CONVENIO%20DE%20PARIS%201958.pdf)

**Regulation — US**
[37 CFR §202.1 (eCFR)](https://www.ecfr.gov/current/title-37/chapter-II/subchapter-A/part-202/section-202.1) ·
[Copyright Office Circular 33, *Works Not Protected by Copyright*](https://www.copyright.gov/circs/circ33.pdf)

**Case law — US**
[*Lotus v. Borland*, 49 F.3d 807 (1st Cir. 1995)](https://www.bitlaw.com/source/cases/copyright/Lotus.html) ·
[*Lotus v. Borland*, FindLaw](https://caselaw.findlaw.com/court/us-1st-circuit/1118863.html) ·
[SCOTUS disposition (4–4), Oyez](https://www.oyez.org/cases/1995/94-2003) ·
[*Computer Associates v. Altai*, 982 F.2d 693 (2d Cir. 1992)](https://www.bitlaw.com/source/cases/copyright/altai.html) ·
[*Apple v. Microsoft*, 35 F.3d 1435 (9th Cir. 1994)](https://law.justia.com/cases/federal/appellate-courts/F3/35/1435/605245/) ·
[*Google v. Oracle* — Copyright Office Fair Use Index](https://www.copyright.gov/fair-use/summaries/google-llc-oracle-am-inc-2021.pdf) ·
[*Google v. Oracle* — CRS LSB10597](https://www.congress.gov/crs-product/LSB10597) ·
[*Feist v. Rural Telephone*, 499 U.S. 340 (1991)](https://www.law.cornell.edu/supremecourt/text/499/340) ·
[*Wal-Mart v. Samara Bros.* — Berkeley BCLT summary](https://www.law.berkeley.edu/archive/files/bclt_AnnualReview_Wal-Mart_Case_Summary.pdf)

**Practitioner commentary**
[Faroo Legal — protección jurídica del software (MX)](https://faroolegal.com/post/proteccion-juridica-del-software-derechos-de-autor/) ·
[Justia México — derechos de autor de programas de computación](https://mexico.justia.com/derecho-de-la-propiedad-intelectual/derechos-de-autor-de-programas-de-computacion-programas-informaticos/) ·
[MGPS — la imagen comercial o trade-dress](https://www.mgps.com.mx/en/la-imagen-comercial-o-trade-dress/) ·
[Noth — marcas: distintividad y registrabilidad bajo la LFPPI](https://noth.mx/pages/boletin.php?id=9) ·
[Beltrán — competencia desleal como infracción administrativa](https://beltran.mx/es/noticias-y-blog/item/251-competencia-desleal-es-una-infraccion-administrativa) ·
[A2Z Legal — el papel de la competencia desleal](https://a2zlegal.com.mx/marcas/4342/) ·
[UNAM — supuestos de competencia desleal en propiedad industrial](https://archivos.juridicas.unam.mx/www/bjv/libros/6/2634/12.pdf) ·
[IMPI — exclusiones y excepciones a la patentabilidad](https://www.impi.gob.mx/cloud/Seminario_en_linea_Ley_Federal_de_Proteccion_a_la_/D%C3%ADa%2005%20-%2017%20de%20octubre/11%20Exclusiones%20y%20excepciones%20patentabilidad.pdf) ·
[HyA IP — reforma integral a la LFPPI (abr 2026)](https://www.hyaip.com/es/espacio/reforma-integral-lfppi-practica-patentes-mexico/) ·
[Finnegan — a guide to trade dress in the United States](https://www.finnegan.com/en/insights/articles/a-guide-to-trade-dress-in-the-united-states.html) ·
[Finnegan — clean your room](https://www.finnegan.com/en/insights/articles/clean-your-room-protecting-against-trade-secret-misappropriation-claims.html) ·
[Chip Law Group — how to develop an IP clean room policy](https://www.chiplawgroup.com/how-to-develop-an-ip-clean-room-policy/) ·
[Tannenbaum Helpern — merger and scènes à faire](https://www.thsh.com/publications/merger-and-scenes-a-faire-two-defenses-to-substantial-similarity-in-copyright-litigation/) ·
[U. Cincinnati Law Review — merger & scènes à faire for computer programs](https://uclawreview.org/2019/11/18/modifying-the-altai-test-the-copyright-doctrines-of-merger-and-scenes-a-faire-should-be-applied-differently-for-computer-programs/) ·
[INTA Trademark Reporter — doctrine of foreign equivalents](https://www.inta.org/wp-content/uploads/public-files/resources/the-trademark-reporter/TMR-Vol-112-No-05-Gilson-LaLonde.pdf) ·
[DBL Lawyers — basics of the doctrine of foreign equivalents](https://www.dbllawyers.com/understanding-the-basics-of-the-doctrine-of-foreign-equivalents-within-u-s-trademark-law/)

**Primary source for the §0.2 finding**
[Fitco — *Dashboard: cómo funciona y para qué sirve*](https://soporte.fitcolatam.com/es/articles/4566446-dashboard-como-funciona-y-para-que-sirve)

**Repo evidence**
`docs/Context/2026-08-01-181-vendor-directory-segmentation.md` ·
`apps/admin/src/app/proto/e-fitco/_components/{inicio-e.tsx,fitco.tsx,lifecycle.ts}` ·
`apps/admin/src/app/proto/**/page.tsx` (production `notFound()` guards) ·
`gh repo view --json visibility` → `PUBLIC`
