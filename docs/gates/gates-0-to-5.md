Style: ASD-STE100 Simplified Technical English + RED's glossary (`RED-2.0/CONTEXT.md`). One word per meaning. Note: **inquilino** = a gym (tenant, the paying customer). **cliente** = a gym member. **respaldo** = the operator's Excel export — it is **not** a disaster-recovery backup. PITR owns disaster recovery.

---

# RED — Gates 0 to 5

Source: `red-tracker/research/latam-3000-clients-sequencing-strategy.md` (§3 = the gates, §4 = deferrals, §7 = contradictions).
Rule: do the gates in order. Do not start a gate before the gate above it is done.

---

## Gate 0 — Make the held data legal. Make the data recoverable.

**Why this is first:** the risk is present now. Forge holds 34 real `clientes` with names, phones and emails. The risk increases with each new `inquilino`.

### 0.1 Privacy law

Mexico replaced its data-protection law. The old LFPDPPP (2010) is void. The new law started on 21 March 2025. The regulator changed from INAI to the Secretaría Anticorrupción y Buen Gobierno.

Two roles apply:

- The gym is the **responsable**. The gym owns the relation with its `clientes`.
- RED is the **encargado**. RED holds and processes the data for the gym.

Do these steps:

1. Employ a Mexican abogado. Do not draft these documents yourself.
2. Get one written processing agreement (encargado clause) for each `inquilino`. RED has none today.
3. Replace the single hardcoded privacy notice. Each `inquilino` must show its own aviso de privacidad.
4. Ask the abogado one open question: is Supabase hosting an international data transfer under the new law? No source answered this.
5. Do not build fingerprint or biometric access. That data is sensitive. It needs explicit consent.

**Warning on the evidence:** the research agent could not read the official law text. The PDF did not parse. All article numbers and penalty figures come from law-firm summaries. The implementing reglamento is not published yet. Breach-notification deadlines are therefore undefined, not merely unverified. The abogado supplies the exact text. This report does not.

**Done when:** one signed encargado agreement exists for Forge. Per-gym avisos render. The abogado has answered the hosting question.

**Where it lives:** quest `foundation/privacy-lfpdppp`. Report §3 Gate 0.

### 0.2 Backups

Supabase documents this directly. The free tier has no automated backups. It gives no recovery guarantee.

Today, if the database is damaged, Forge's 34 `clientes`, 41 `ventas` and 339 `asistencias` are lost. No supported path returns them.

Two facts make this worse for a multi-tenant platform:

- A restore takes the whole project offline. Every `inquilino` stops at the same time.
- Custom roles and replication slots need manual recreation after a restore. One person does this work, alone, under pressure.

Do these steps:

1. Move the project to Supabase Pro. Pro keeps 7 daily backups.
2. Add PITR (Point-In-Time Recovery). PITR restores the database to any moment. Its RPO is about 2 minutes.
3. PITR needs at least a Small compute add-on. Budget for it.
4. Test one restore before you sell to any gym.

This is a monthly fee. It is not a hire.

**Done when:** PITR is on. One test restore is complete.

**Where it lives:** quests `growth-reach/supabase-resilience-decision`, `growth-reach/backup-dr-restore`. Report §3 Gate 0, §8 risk 5.

---

## Gate 1 — Become able to invoice.

**Why:** RED cannot legally bill a Mexican business today. No legal entity exists. No CFDI exists.

Do these steps:

1. Register as **persona física con actividad empresarial** under **RESICO**. Do not create an S.A. de C.V. RESICO works below 3.5M MXN income per year. ISR is 1.00% to 2.50% by bracket.
2. Get your **e.firma**. It is mandatory for 2026.
3. **Buy CFDI 4.0. Do not build it.** Facturama costs about 1,650 MXN per year for unlimited folios. The API plan costs the same, with 100 free folios, then 0.50 MXN per folio.
4. Employ a contador. Ask one specific question: is RED's subscription fee **honorarios** or a general business service?
   - If it is honorarios, a gym that is a persona moral withholds 10% ISR and two-thirds of the IVA. You receive less cash than the invoice shows.
   - This answer changes which prices are viable. Get it before Gate 2.
5. Note one 2026 rule change: cancelling a CFDI with complemento de pago now needs receiver acceptance through Buzón Tributario within 3 business days. Silence means acceptance. This claim comes from tax blogs, not from SAT text. The contador confirms it.

**Warning on the evidence:** no source estimates how long any of this takes. The "buy, do not build" advice rests on the low price of buying. It does not rest on a measured build estimate.

**Done when:** RED can issue one valid CFDI to one real gym.

**Where it lives:** quests `monetization/mx-commercial-legal`, `monetization/cfdi-invoicing`. Report §3 Gate 1.

---

## Gate 2 — Fix the price. Write the contract. Do this before you sell.

**Why:** annual billing is the strongest retention tool available at this stage. RED uses none of it today. Sources disagree on the size of the effect. Sources agree on the direction. Recurly reports annual subscriber lifetime exceeds monthly by 43%. Other sources report 3× to 7×. Treat the size as unknown.

Do these steps:

1. **Raise the price floor.** No observed vendor sells at 300 MXN per month. Fitco (Peru, LatAm-native, price page verified 2026-08-06) charges 59/99/169 USD per month, billed quarterly, flat. Your ceiling of 1,500 MXN is near parity with Fitco's middle tier. Your floor is the problem, not your structure.
2. **Choose flat or per-member pricing deliberately.** The category is split. Fitco is flat and says so. Gymdesk tiers by member count. There is no norm to follow.
3. Write one gym contract. It must carry four items:
   - a suspension path for non-payment (RED cannot detect a non-paying gym today);
   - a data-portability promise at exit;
   - the withholding clause from Gate 1;
   - an annual term. Mindbody, Glofox and Zen Planner use early-termination fees of 3 to 6 months.
4. Sell the annual term first. Offer monthly only as an exception.

**Done when:** one price is published. One contract template exists. One gym has signed it.

**Where it lives:** quests `monetization/red-subscription-pricing`, `go-to-market/offer-structure`, plus a new quest for the contract. Report §3 Gate 2, §2 pricing precedent.

---

## Gate 3 — Sell the first cohort. This is the constraint.

**Why:** `first-cohort-sales` has no blockers. It was designed to run now. It has not started. Every other realm waits for it. This follows Theory of Constraints: find the constraint, then subordinate all other work to it.

Do these steps:

1. **Sell in one dense area only.** Chihuahua city shows at least 56 gyms in one commercial directory. Do not spread out. Paul Graham calls this keeping a fire contained so it gets hot.
2. **Use WhatsApp. Speak to owners yourself.** Gymforce is a Mexican competitor. Its own site states it runs daily WhatsApp communication with gym owners. It shows a WhatsApp number as its main contact. It does not lead with paid advertising. Mexico has about 77M WhatsApp users.
3. **Do not buy advertising.** Mexican Meta CPCs are low. That does not help. RED's ACV is 180 to 960 MXN per year. No published CAC benchmark covers any ACV below 5,000 USD per year. All payback math at RED's price is extrapolation.
4. Target 30 signed, invoiced, annual `inquilinos`.

**Warning on the evidence:** no gym-software sales data exists anywhere searched. There is no touches-per-deal figure. There is no cycle-length figure. The "founder converts 2-3× better" claim comes from practitioner blogs with no dataset.

**Done when:** 30 gyms pay, hold a CFDI, and hold an annual contract.

**Where it lives:** quest `go-to-market/first-cohort-sales`. Report §3 Gate 3.

---

## Gate 4 — Do the migration for the customer.

**Why:** migration friction is the largest obstacle in the sale. It is also how incumbents hold their customers. Reported switching costs run 3,000 to 15,000 USD. One owner spent 4,200 USD to rebuild data. One six-year customer received only first names, last names and emails on export.

Do these steps:

1. Do the migration yourself for each of the first 30 gyms. Import their Excel files or paper records into RED.
2. Use this as the closing offer in the sale.
3. Keep your own export honest. This sits in tension with Gate 2's portability promise. Do not copy the incumbent behaviour you are selling against.

**Warning on the evidence:** no study measures onboarding quality against retention with an effect size. Every source asserts the link. No source measures it. Full migration in this category is reported at 8 to 12 weeks. That figure is unverified.

**Done when:** 30 gyms run on real imported data, not on demo data.

**Where it lives:** quest `sellable-product/member-roster-import`, plus a new migration-service quest. Report §3 Gate 4.

---

## Gate 5 — Measure churn. Then decide the large questions.

**Why:** RED has no churn number. Four `inquilinos` and one real gym cannot produce one. Zero gyms have churned, so the sample proves nothing. Every retention figure in the report is borrowed from generic SMB SaaS blogs. **No churn benchmark exists for gym-management software anywhere searched.**

Do these steps:

1. Build `churn-health-instrumentation` **before** you reach 20 to 30 paying gyms. Build it early. You cannot measure a period that already passed.
2. Record monthly logo churn: how many gyms stop paying each month.
3. Read the result against this arithmetic. Steady-state gyms = gross adds per month ÷ monthly churn rate.
   - At 2% churn, 3,000 gyms need 60 new gyms every month, forever.
   - At 3% churn, 3,000 gyms need 90 new gyms every month, forever.
   - At 5% churn, 3,000 gyms need 150 new gyms every month, forever.
4. Then, and only then, answer these four questions:
   - `monetization/unit-economics` — what does one gym cost and return?
   - The capital-or-team decision. This is missing from the map. At 3,000 gyms RED implies 12 to 19 FTE, by SaaS Capital revenue-per-employee bands. No bootstrapped vendor is documented reaching 3,000 alone. One possible exception, Wodify, took 13 years and 74 people.
   - Revisit the BYO-Stripe 0%-cut decision. Mindbody earned 35% to 37% of revenue from payments. That evidence is US-only. No LatAm vendor discloses payment revenue.
   - `latam-expansion/country-sequencing`. Hold the provisional order: Colombia, then Peru. Both have mature data-protection regimes, not light ones. Brazil is the largest pool and the highest friction.

**Done when:** RED holds its own measured monthly churn rate.

**Where it lives:** quests `customer-support/churn-health-instrumentation`, `monetization/unit-economics`, `latam-expansion/country-sequencing`. Report §1, §5, §6.

---

## The rule that holds the gates together

One realm is active at a time. The current constraint chooses it. Everything else waits in a queue.

This is the fix for realm-hopping. Note the evidence limit: the queue argument comes from Reinertsen, whose primary text was not read. The task-switching study (Rubinstein, Meyer & Evans 2001) measures sub-second lab tasks. No source extends it to multi-day work. The Kanban "+40% throughput" figures have no citable study. Use the rule because the constraint logic holds. Do not quote the numbers.

**Deferred until a named trigger:** member-app polish, stripe-connect, member-payments-online, all of LatAm Expansion, i18n, caching-perf, the meta-agent build, and deep security work beyond PITR. Triggers are listed in the previous message and in report §4.