# Where "lapsed" comes from: the retention evidence behind the day thresholds

Issue #182 (part of map #180). Every claim below carries a source link and a label:

- **MEASURED** — a real dataset or study with numbers and a stated method.
- **VENDOR-CLAIMED** — marketing or a vendor blog asserting a number with no methodology.
- **RECEIVED WISDOM** — repeated everywhere, traceable to nothing.
- **PRACTITIONER** — a named operator or gym owner reporting their own experience.

---

## 0. The short version

**Verdict 1 — expiry-clock vs attendance-clock: the attendance clock wins, and the reason is stronger than "it predicts better". The expiry clock is a *lagging* indicator that fires roughly 70 days after the member actually left.** Two independent datasets, different countries, different decades, converge: US health clubs measured **2.31 full months** between a member's last attendance and contract termination ([DellaVigna & Malmendier 2006, AER](https://eml.berkeley.edu/~ulrike/Papers/gym.pdf)), and a Portuguese club measured a mean of **76.4 days** of non-attendance before the dropout event ([Ferreira et al. 2021, IJERPH](https://pmc.ncbi.nlm.nih.gov/articles/PMC8508547/)). The billing clock does not merely predict churn less well — it announces churn *after the window in which anything can be done about it has closed*. Confidence: **high**.

**Verdict 2 — win-back: do not build it, and do not surface lapsed members as a work queue.** Not because they never return — 38% do — but because **the returns are overwhelmingly spontaneous and front-loaded, and no one has ever demonstrated that outreach beats doing nothing.** In a 10-year Rio de Janeiro dataset, 38% of dropouts returned within 12 months with **no campaign of any kind**, and 57.9% of those returned in the first month ([Sperandei et al. 2019](https://www.athensjournals.gr/sports/2019-6-2-3-Sperandei.pdf)). Every vendor "we reactivate 10–20%" claim is uncontrolled and is quoted against a spontaneous-return base rate that is *higher* than the claim. The only randomised trial in the vicinity found outreach had **no effect on retention** (HR 1.1, 95% CI 0.8–1.3) ([*The effect of initial support on fitness center use in new fitness center members: a randomized controlled trial*, Norway 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8683950/)). Confidence: **medium-high** on "the evidence does not support win-back"; **high** on "nobody has evidence that it works".

**Verdict 3 — are the thresholds evidence or folklore? Mostly folklore, with one real and surprising exception.** 30/60/90 as a *family* is inherited from monthly billing cycles, not calibrated from behaviour. Five candidate lineages were chased to their roots and **not one produced an empirical calibration** (§1.3): accounting's aging buckets have no documented origin beyond "a month is a month"; the numbers' oldest real ancestor is medieval bill-of-exchange usance encoding *travel time between cities*; RFM — the one ancestor with genuine science behind it — bins recency by **population quintile, not by calendar day**; the email vendors who supposedly set the 30/60/90 convention explicitly refuse to name a number ("*It's up to you to determine how long you think an inactive period is*" — Mailchimp); and the fitness "first 90 days" doctrine is a rounding of Dishman's fuzzier "3–6 months, front-loaded" adherence finding. But there *is* a genuine measured knee, and it lands near 30 days on the **expiry** clock: cumulative return probability runs 0.22 at one month → 0.27 at two → 0.38 at twelve. The first month is categorically different from every month after it. The catch: that study measured in whole months, so it can prove "month one differs from month two" and **cannot** locate the boundary at day 30 versus day 22 or day 41. The round number survives by luck of measurement granularity, not by calibration.

**The one finding that should change the design most:** on the **attendance** clock, a 30-day gap means almost the opposite of what it means on the expiry clock. In 259,355 European ex-members, **49% went a full month without attending and then came back** ([Middelkamp 2016](https://www.beweginginzicht.nl/upload/files/Summary-thesis-Middelkamp.pdf)). Among people who *eventually churned*, half survived at least one full month of absence. A 30-day attendance gap is not a death certificate; it is the single most common recoverable event in a gym member's life. The two clocks need opposite treatment, and that is the crux of §4.

**The industry corroborates the folklore verdict by its silence.** Ten gym-management products were checked. **Not one auto-archives a member after a fixed N-day period**, and the only vendor that documents a day-count (TeamUp, 12 days) calls it an example and hands the choice to the operator (§6.2). A product category sitting on far more member data than any published study has collectively declined to name a threshold. **The numbers are not discoverable; they are decidable.** The same survey turns up the one piece of prior art worth copying: TeamUp's **New / Active / Slipping Away / Inactive** — a four-tier model with an explicit early-warning tier, auto-reversing, and never hiding the record (§6.3).

---

## 1. Where do 30/60/90 come from?

### 1.1 The fitness-specific numbers are unsourced

I traced the most widely-repeated fitness threshold claim to its origin and it dead-ends in marketing copy.

**The claim:** "Members who don't visit for 14+ days are 6x more likely to cancel — cancellation probability jumps from 8% to 48%." This now appears across multiple 2026 retention blogs and surfaces in search summaries as if it were established fact.

**The origin:** [JeriCommerce, "Gym Retention Statistics: Churn & Benchmarks (2026)"](https://blog.jericommerce.com/resources/gyms-fitness-studios-retention-statistics). No link, no footnote, no study, no dataset. JeriCommerce sells a Shopify loyalty app with wallet passes and push notifications; the article is product marketing. **Label: VENDOR-CLAIMED, and specifically a number with no parent.**

The same page carries eleven other statistics. Two cite a real source (the HFA 2025 Benchmarking Report; "IHRSA research", unlinked). **Nine cite nothing at all**, including "50% cancel within 6 months" and "80% chance of cancelling with fewer than 4 visits/month" — both of which circulate as industry canon.

The industry association is no better. [HFA (formerly IHRSA), "15 Surprising Facts About Health Club Member Retention"](https://www.healthandfitness.org/improve-your-club/15-surprising-facts-about-health-club-member-retention/) contains **zero facts tied to a named study, statistical threshold, or win-back conversion figure**. It is executive interviews. The trade body's own retention content does not cite retention research.

### 1.2 The thresholds don't even agree with each other

The strongest evidence that these numbers are arbitrary is that vendors assert *different* ones, each with equal confidence and equal absence of sourcing:

| Asserted trigger | Source | Label |
|---|---|---|
| **12 days** inactivity → "missed you" flow | [PushNotice](https://pushnotice.io/blog/gym-membership-retention-strategies) | VENDOR-CLAIMED |
| **14 days** inactivity → 6x cancellation risk | [JeriCommerce](https://blog.jericommerce.com/resources/gyms-fitness-studios-retention-statistics) | VENDOR-CLAIMED |
| **15–30 days** without attendance "significantly increases churn" | circulated across 2026 retention blogs | RECEIVED WISDOM |
| **30 days** absence = dropout | [Coelho et al., Natal Brazil](http://www.scielo.br/j/rbce/a/WtzM3gBFRkcrqY7xKZsVNnm/?lang=en) | MEASURED — but as an *operational definition*, not a finding |
| **60 days** non-payment = dropout | [Ferreira et al., Portugal](https://pmc.ncbi.nlm.nih.gov/articles/PMC8508547/) | MEASURED — again a *definition*, not a finding |
| **90 days** = the critical window | ubiquitous | RECEIVED WISDOM |

Note rows 4 and 5 carefully, because they are the mechanism by which folklore launders itself into literature. The Brazilian study *defines* dropout as "absence for one month". The Portuguese study *defines* it as "did not pay the monthly fee within a period of up to 60 days". Neither derived 30 or 60 from the data — both **chose** the number to make the analysis tractable, and both numbers then get cited downstream as though the research established them. The academic convention and the marketing convention are drawing from the same well: **the monthly billing cycle**.

### 1.3 Chasing the lineages: four candidate ancestors, none of them calibrated

| Candidate ancestor | What the trail shows | Label |
|---|---|---|
| **AR aging buckets** (current / 1–30 / 31–60 / 61–90 / 90+) | No documented origin found in any accounting-history source. The structure is confirmed everywhere ([NetSuite](https://www.netsuite.com/portal/resource/articles/accounting/accounts-receivable-aging.shtml), [Metabase](https://www.metabase.com/metrics/accounts-receivable-aging/)) but no source explains *why* 30-day increments. The defensible explanation is structural, not empirical: 30 days ≈ one calendar month, and "Net 30/60/90" trade-credit terms are multiples of a monthly billing cycle ([Net D](https://en.wikipedia.org/wiki/Net_D) — UK convention ties net terms literally to "end of the month") | RECEIVED WISDOM |
| **Bill-of-exchange "usance" periods** — the oldest 30/60/90 | Genuinely archival: London–Bruges 30 days, Venice–Bruges 60, London–Venice 90, from ~2,000 bills in the Borromei ledgers, 1436–8 ([Bolton & Guidi-Bruscoli 2021, *Econ Hist Rev* 74:873–891](https://onlinelibrary.wiley.com/doi/10.1111/ehr.13070)). But these encode **travel time between trading cities** — a logistics artifact. No documented citation chain links it to modern AR aging. Same numerology, unproven lineage | MEASURED (but irrelevant to behaviour) |
| **RFM analysis** (Hughes 1994; econometrically grounded by [Bult & Wansbeek 1995, *Marketing Science* 14(4)](https://pubsonline.informs.org/doi/abs/10.1287/mksc.14.4.378)) | Confirms **recency genuinely predicts response** — this part is real science. But the critical nuance: standard RFM scores recency in **quintiles of the customer base** — relative bins, ~20% each — **not fixed calendar-day windows**. [Wikipedia's RFM page](https://en.wikipedia.org/wiki/RFM_(market_research)) states the appeal outright: *"the virtue of simplicity: no specialized statistical software is required."* A convenience justification | MEASURED that recency matters; silent on 30/60/90 |
| **ESP "sunset" policy** | The vendors themselves **refuse to name a number**. Mailchimp's own help doc: *"It's up to you to determine how long you think an inactive period is"* ([Mailchimp](https://mailchimp.com/help/identify-inactive-subscribers/)). HubSpot and [Braze](https://www.braze.com/docs/user_guide/engagement_tools/campaigns/ideas_and_strategies/capturing_lapsing_users) present 30/60/90/120 as configurable examples. The crisp "30 = at risk / 60 = re-engage / 90 = stop" schema is a **third-party deliverability-blog invention**, asserted as "industry data suggests" with no source | RECEIVED WISDOM |
| **Fitness "first 90 days"** | GymMaster's ["Crossing the 90-Day Barrier"](https://www.gymmaster.com/blog/crossing-the-90-day-barrier/) asserts it with **zero citation** (its one footnote supports an unrelated CAC statistic). The "IHRSA: 40–60% drop out in 90 days" claim is repeated everywhere and no blog links an actual IHRSA report | RECEIVED WISDOM |

**The one real ancestor with actual research behind it** is exercise-adherence psychology — Dishman's work finding ~50% dropout within 6 months with the sharpest relapse around the 3-month mark ([Dishman & Sallis 1994](https://link.springer.com/article/10.2165/00007256-199417010-00004)). That is genuine, and it says **"3–6 months, front-loaded"** — a fuzzy range that the fitness-marketing industry compressed into a crisp "90 days". So the number is not invented from nothing; it is a *rounding of a vaguer real finding*, which is worse in one specific way: it carries borrowed authority without the original's error bars.

### 1.4 The honest answer

The 30/60/90 family is the shape of a billing calendar, not the shape of member behaviour. Every lineage tested either dead-ends in an uncited assertion, explicitly admits convenience and configurability, or derives from real research with a fuzzier finding that got rounded downstream.

**There is no published empirical calibration showing that 30, 60, or 90 days is a behavioural inflection point in gym membership.** The closest thing to one (§3) is real, but its resolution is one month, which means it can confirm a first-month effect without locating a boundary.

One usable idea does fall out of the RFM trail: **the marketing-science ancestor bins on the population, not on the calendar.** If the goal is a directory that stays workable at 21 members and at 500, relative bucketing is worth remembering as an option — though it trades away the legibility of "30 days", which for a single owner reading his own list is probably the more valuable property.

**This is a null result and it should be treated as one.** The thresholds are not load-bearing. They should be chosen for ergonomics — for legibility to the owner, for alignment with the gym's own 20–30 day package cycle, for producing a list of a workable size — and the design should not pretend otherwise.

---

## 2. The decay curve — it exists, and it is public

This is the ticket's central ask, and the answer is better than expected: a published cumulative return curve, from a gym at almost exactly this repo's scale.

**Source:** Sperandei, Vieira & Reis (2019), *Adherence to Physical Activity in an Unsupervised Setting: The Case of Lapse and Return to Practice in a Brazilian Fitness Center*, Athens Journal of Sports 6(2):95–108. [PDF](https://www.athensjournals.gr/sports/2019-6-2-3-Sperandei.pdf) · [DOI](https://doi.org/10.30958/ajspo.6-2-3). **Label: MEASURED.**

**Why this source is unusually transferable:** a *medium-sized fitness center with 550–700 monthly members* in central Rio de Janeiro — not a chain, not a big-box. 5,242 individuals tracked Jan 2005 – Jun 2014, every enrolled member included, no missing data, Kaplan-Meier plus Cox proportional hazards. This is a Latin American independent gym at the top of the 21–500 band this repo is designing for.

### 2.1 The curve

Cumulative probability that a dropped-out member has returned, by months since dropout (dropout = monthly payment stopped):

| Months since dropout | Cumulative return probability | Marginal gain | Conditional (hazard) rate for that interval |
|---|---|---|---|
| 1 | **0.22** | +22.0 pts | **22%** of all dropouts |
| 2 | **0.27** | +5.0 pts | **6.4%** of those still away |
| 3–12 | **0.38** at month 12 | +11.0 pts over 10 months (~1.1 pts/mo) | **~1.6% per month** of those still away |

Verbatim from the paper: *"the probability of an individual returning to the fitness center after an interruption of one month was 0.22; for a period of two months, the probability was 0.27, and so on… the probability of an individual returning by the end of 12 months was only 38%. Of those who return, more than half (22%) return within the first month after cessation, which means that after the first month the probability of an individual returning is approximately only 16%."*

### 2.2 What the curve says when you re-cut it

- **57.9%** of everyone who will ever come back has come back **by day 30**.
- **71%** (0.27/0.38) has come back **by day 60**.
- The remaining **29%** trickles in across the following ten months at roughly 1.1 percentage points a month.
- The conditional monthly return rate collapses **22% → 6.4% → ~1.6%**: a 3.4x drop from month 1 to month 2, and a ~14x drop from month 1 to the steady state.

### 2.3 Segment spread — the curve is not one curve

The same paper fits profiles ([§Results](https://www.athensjournals.gr/sports/2019-6-2-3-Sperandei.pdf)):

- **Best prognosis** (over 35, physically active before joining, member >6 months): ~**63%** return within 12 months, and **41%** return within the *first month*.
- **Worst prognosis** (under 25, inactive before joining, member ≤6 months): **<30%** return within 12 months — less than the best profile achieves in month one alone.

Significant predictors of return were **age, prior physical activity, and length of membership before dropout**. Motivation for joining had **no** effect — *"once the individual drops out, the motivation to initiate in the first place becomes less relevant."*

This matters for the design: **tenure is a legitimate second axis.** A long-standing member who lapses is a materially different proposition from a first-package member who lapses, and the repo already has `clientes.created_at` and `ventas` history to tell them apart (see [#183's signal inventory](./2026-08-01-183-signal-inventory.md)).

### 2.4 Corroboration from the same dataset and market

- Sperandei et al. 2016 (same gym, same members, [J Sci Med Sport 19(11):916–920](https://pubmed.ncbi.nlm.nih.gov/26874647/)): **63% abandon before month 3**; **<4%** remain past 12 months of continuous activity. **MEASURED.**
- Coelho et al., two gyms in Natal, Brazil, 3,802 members via biometric turnstile ([SciELO](http://www.scielo.br/j/rbce/a/WtzM3gBFRkcrqY7xKZsVNnm/?lang=en)): 12-month dropout **89%** and **81%**. Training ≤3x/month carried **48%** and **92%** higher dropout risk. **MEASURED.**
- Mexico specifically: the figures in circulation — "55–60% abandon" (Asociación Mexicana de Gimnasios), "only 2 in 10 stay past three months", "50% of bajas in the first 90 days" — are press quotes and trainer estimates. I checked [El Universal's piece](https://www.eluniversal.com.mx/nacion/ir-al-gym-un-proposito-que-dura-solo-3-meses/) directly: both headline figures come from **trainers interviewed for the article**, with no study, dataset or institution named. **Label: RECEIVED WISDOM.** The Mexican numbers are directionally consistent with the Brazilian measured data, which is the most that can be said for them.

---

## 3. Is there a knee? Yes — with a caveat that changes how you use it

**There is a knee, it is sharp, and it sits at the one-month mark on the expiry clock.** The drop from a 22% conditional return rate to 6.4% is not a smooth decay; it is a cliff. This is the strongest single piece of evidence on the whole ticket.

**The caveat that must travel with it:** Sperandei's paper states *"All temporal analyses were measured in months."* The data has monthly resolution because the underlying event is a monthly payment. So the study establishes **"month one is categorically unlike month two"** and is structurally incapable of distinguishing a knee at day 30 from a knee at day 22 or day 41.

The practical consequence is precise, and it is the answer the ticket asked for:

> The *existence* of a first-cycle cliff is evidence. The *location* of the boundary at exactly 30 days is ergonomics. Pick the number for legibility and for fit with the gym's own 20–30 day package cycle, and do not defend it as a measured value.

---

## 4. Expiry clock vs attendance clock

This is the highest-leverage question on the map, and the evidence answers it in a sharper way than "one predicts better".

### 4.1 The expiry clock lags reality by about 70 days

| Finding | Source | Label |
|---|---|---|
| **2.31 full months** between last attendance and contract termination, and the authors state this measure **understates** the true lag | [DellaVigna & Malmendier 2006, AER 96(3)](https://eml.berkeley.edu/~ulrike/Papers/gym.pdf) — 7,752 members, 3 US health clubs, 3 years | MEASURED |
| Non-attendance days before dropout: mean **76.4 days** (SD 101.8, range 0–991) | [Ferreira et al. 2021, IJERPH](https://pmc.ncbi.nlm.nih.gov/articles/PMC8508547/) — 5,209 members, Lisbon | MEASURED |
| **50%** of new members did not visit at all in their first membership month; **20%** never attended in 24 months while holding membership | [Middelkamp et al. 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC8683950/), cited in the Norwegian RCT | MEASURED |

Two independent datasets — US 1997–2000, Portugal 2014–2017 — land on ~70 and ~76 days. DellaVigna's is explicitly a *conservative, downward-biased* estimate (they count only whole months and exclude months with low-but-positive attendance).

**Synthesis with §2, and this is the argument the ruling should rest on:** the expiry clock fires ~70 days after the member's last visit. By §2's curve, at 70 days post-behavioural-departure the conditional return rate has already fallen to roughly 1.6% per month. **The billing clock's alarm rings at the point where the evidence says nothing can be recovered.** The red rows currently sorted to the top of the CLIENTES page are not a work queue; they are an obituary column. That is not a ranking defect, it is a defect in which instrument the page is reading.

### 4.2 The attendance clock predicts better — but the headline number for this is contaminated

The most-cited evidence for the attendance clock is the Portuguese study's feature-importance table: non-attendance days carries **35–54%** of the model's predictive power, versus 14–15% for membership duration and 10–18% for total billed ([Ferreira et al. 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8508547/)).

**I read the methods and this result should be discounted.** The variable is defined in Table 1 as *"Non-attendance days before dropout"* — measured up to the dropout event. A member who dropped out necessarily accumulated non-attendance days before doing so. This is **target leakage**: the model is substantially reading the outcome back to itself. The 95.5% accuracy is an artifact. The authors do not acknowledge it. **Label: MEASURED but methodologically unsound; do not cite the 35–54% figure as evidence.**

Its one honest use is descriptive, in §4.1: the *mean* of 76.4 days tells you how long members are absent before the billing system notices, and that is a valid reading of the variable.

### 4.3 The clean evidence for the attendance clock

Stripping the leaky study out, the attendance clock still wins on three independent sources:

| Finding | Source | Label |
|---|---|---|
| 661 members, **56 weeks of database attendance records** plus attitudinal survey, k-means segmentation: low-frequency and low-consistency segments churn at **nearly double** the sample rate. Explicit conclusion that **attitudinal-only segmentation fails to identify churn risk because it omits behavioural variables** | [Who churns from fitness centres?, Managing Sport & Leisure 2024](https://www.tandfonline.com/doi/full/10.1080/23750472.2024.2305896) — Australia | MEASURED |
| 2,385 members across 50 clubs, one year from enrolment, logistic regression: **visit frequency significantly predicts retention**; the first quarter carries the predictive signal | [Yi, Lee, Connerton & Park 2020, Managing Sport & Leisure 26(4)](https://www.tandfonline.com/doi/abs/10.1080/23750472.2020.1763829) — South Korea | MEASURED |
| 3,802 members, biometric turnstile data: training **≤3x/month** → **48%** / **92%** higher dropout hazard across two gyms | [Coelho et al., SciELO](http://www.scielo.br/j/rbce/a/WtzM3gBFRkcrqY7xKZsVNnm/?lang=en) — Brazil | MEASURED |

Three countries, three methods, one direction. Note that all three measure **frequency**, not **recency** — see §4.5.

**One dissent, recorded for honesty:** Gonçalves et al. found that weekly attendance frequency did *not* predict retention in a Portuguese fitness centre, a result Sperandei et al. flag explicitly as unresolved ([2019 discussion](https://www.athensjournals.gr/sports/2019-6-2-3-Sperandei.pdf)). The attendance clock is well-supported, not unanimous.

### 4.4 The finding that should most change the design: 30 days means opposite things on the two clocks

**Source:** Middelkamp, van Rooijen & Steenbergen (2016), *Attendance Behavior of Ex-members in Fitness Clubs: A Retrospective Study* — attendance data for **259,355 ex-members across 267 clubs** (BasicFit and HealthCity), random sample of 400 for deep analysis, 24-month window. [Thesis summary](https://www.beweginginzicht.nl/upload/files/Summary-thesis-Middelkamp.pdf) · [Perceptual and Motor Skills](https://journals.sagepub.com/doi/10.1177/0031512516631075). **Label: MEASURED.**

Verbatim: *"19.5% never attended the club in 24 months. Of the ex-members, 10% demonstrated regular attendance behaviour for six months in a row without relapsing, and 2,3% performed regular attendance for 24 months. **49% did not attend the club for one full month but restarted again.**"*

Read that last clause carefully. The population is people who **eventually cancelled**. Among them, **half had at least one full month of zero attendance and came back anyway.**

So:

- **30 days with no visits, while the package is still paid** → a very common, frequently-reversed event. Roughly half of eventual churners passed through it and returned. Treating it as "lapsed" would be mostly false positives.
- **30 days past expiry with no repurchase** → the §2 knee. Conditional return probability has already fallen from 22% to ~1.6%/month.

**These are not two candidates for the same threshold. They are two different instruments answering two different questions**, and the page currently owns only the second one:

| | Attendance clock | Expiry clock |
|---|---|---|
| Question it answers | *Is this member drifting while I can still reach them?* | *Is this person still a customer?* |
| Fires | While the member is paid-up and reachable | ~70 days after they behaviourally left |
| Right tuning | **Sensitivity** — catch the recoverable, tolerate false positives | **Specificity** — don't bury a live customer |
| Correct response | A nudge; still a paying member | A disposition decision: keep visible, or fold away |
| 30 days means | "Common, half of them come back" | "The cliff has already happened" |

The map's charted fact that the red rows sort on `diasRest` ascending is therefore not primarily a sort bug. **The page has one instrument and it is the lagging one.** Adding a last-visit tier is not an enhancement to the ranking; it is the addition of the only clock that fires while intervention is still possible.

### 4.5 An honest gap in the literature

I could not find a study that measures **days since last visit** as a continuous recency variable against subsequent churn, without leakage, and publishes the curve. The clean studies measure *frequency* (visits per month/week); the one that measures *recency* (Ferreira) is leaky. Sperandei's curve is recency but on the **payment** clock.

So: the direction of §4.3 is solid, the ~70-day lag of §4.1 is solid, and the day-level shape of the attendance-recency curve **is not publicly available**. Any specific number of days on the attendance clock — 14, 21, 30 — is currently an engineering choice, not a measured one. Saying otherwise would be manufacturing rigor that does not exist.

---

## 5. Does win-back work?

### 5.1 The base rate nobody controls for

Sperandei's 38% is **spontaneous return with no intervention** — a retrospective study of enrolment records, no campaign involved. That number is the baseline any win-back claim must beat, and it is higher than most of the claims:

| Claim | Source | Label |
|---|---|---|
| "Win-back campaigns recover **10–20%** of lapsed members" | [i4a](https://www.i4a.com/blog/win-back-campaigns/) | VENDOR-CLAIMED — no methodology, no control group |
| "JD Gyms achieved over **50%** reactivation" | [Xplor Gym](https://xplorgym.co.uk/blog/win-back-former-gym-members/) | VENDOR-CLAIMED — customer story, no control group |
| "Reactivating a former customer costs **5–7x less** than a cold lead" | circulated across vendor blogs | RECEIVED WISDOM — the 5x figure is a general marketing trope, not fitness data |
| Spontaneous return, no campaign: **22% in month 1, 38% at 12 months** | [Sperandei et al. 2019](https://www.athensjournals.gr/sports/2019-6-2-3-Sperandei.pdf) | **MEASURED** |

A vendor reporting "we reactivated 15% of lapsed members" in the first month after lapse has, against a 22% unassisted base rate, **demonstrated nothing** — and possibly underperformed inaction. **Not one published fitness win-back figure I could find has a control group.** That is the finding, and it is a strong one: the entire win-back evidence base is uncontrolled.

### 5.1b Worse than uncontrolled: several of these numbers evaporate when chased

A parallel source-tracing pass fetched the exact pages that search results attributed specific win-back statistics to. **The claims were not on the pages.**

- "JD Gyms achieved 50% reactivation via its rewards programme" — **not present** in the cited article ([cloudgymmanager.com](https://www.cloudgymmanager.com/win-back-campaigns-re-engaging-former-members-and-reducing-churn/)).
- "Automated triggers recover 23% of at-risk members, saving $156,000/year for a 1,500-member gym" — **not present** in the cited article ([loyaltypass.co](https://www.loyaltypass.co/blog/guide/gym-member-retention-between-sessions)).
- "Totango data: win-back within 30 days is 3x more successful" — traced to [getmonetizely.com](https://www.getmonetizely.com/articles/how-to-calculate-reactivation-rate-for-churned-customers-a-critical-saas-growth-metric); could not be verified on any Totango page.
- SaaS "8–12% / 15–20% reactivation by day 30/60/90" — no named study anywhere.

This is a finding in its own right, not a null: a meaningful share of the crisp, specific-sounding win-back statistics in circulation are **unverifiable when the citation is actually chased** — citation-laundered or confabulated content, much of it 2026-vintage blog copy asserting false precision. The ruling should treat any un-chased retention statistic as presumptively fictional.

### 5.1c What the academic literature does support

The marketing-science literature on customer winback is real and should not be dismissed wholesale:

| Finding | Source | Label |
|---|---|---|
| Winback is a legitimate CRM lever; the core result concerns **pricing** (low reacquisition price, raise later), not recency | [Thomas, Blattberg & Fox 2004, *JMR* 41(1):31–45](https://journals.sagepub.com/doi/10.1509/jmkr.41.1.31.25086) | MEASURED |
| Satisfaction before defection **and length of absence** both predict return and second-relationship duration | Tokman, Davis & Lemon 2007, *J Retailing* 83:47–64 | MEASURED |
| US telecom, 8 years (2006–2014): **lapse time negatively moderates win-back**, and longer lapse → lower second-lifetime value | [Kumar, Bhagwat & Zhang 2015, *J Marketing* 79(4):34–55](https://sciencedaily.com/releases/2015/07/150707134215.htm) | MEASURED (direction verified; full text paywalled, magnitude unverified) |
| Win-back email across **20B+ campaign emails, 27,000+ brands**: 33% open, 1.96% CTR, **0.52% conversion** | [Omnisend](https://www.omnisend.com/blog/win-back-email/) | MEASURED (disclosed N) — no recency-segmented breakdown published anywhere |

So decay-with-recency **is** academically supported in direction. What no one publishes is the *shape* of a win-back response curve by recency. And the one large-N measurement of the actual channel shows win-back email converts at **half a percent** — a uniformly low-yield instrument in absolute terms, independent of timing.

**A convergence worth flagging, because two unrelated literatures agree:** Kumar et al. find reacquisition is most worthwhile for customers with **strong first-lifetime tenure** and a fixable, non-price reason for leaving. Sperandei independently finds **length of membership before dropout** is one of only three significant predictors of return (§2.3). Telecom and Brazilian gyms, different decades, same conclusion: **the targeting variable is tenure, not the day count.**

### 5.2 The one controlled trial says outreach does not move retention

**Source:** *The effect of initial support on fitness center use in new fitness center members. A randomized controlled trial* — 356 new members (174 intervention / 182 control), 3T-Fitness chain, Trondheim, Norway, 2014–2018. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8683950/) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/34976662/). **Label: MEASURED.**

Structured telephone and email support produced:

- **Trainer bookings**: OR 1.8 (95% CI 1.1–2.7) at 3 months; OR 1.6 (95% CI 1.0–2.5) at 6 months — real and significant.
- **Actual visits at 4 years**: mean difference **−11.7 days** (95% CI −34.8 to 11.3) — no effect, and the point estimate is negative.
- **Membership retention**: **HR 1.1 (95% CI 0.8–1.3)** — no effect. 79% of intervention vs 76% of control had terminated by four years.

Outreach moved the metric the gym controls (bookings) and did not move the metric that matters (staying). **Transfer caveat, stated plainly: this is *onboarding* outreach to new members, not *win-back* outreach to lapsed ones.** It is not a direct test of the question. But it is the only randomised evidence anywhere near it, and it points away from outreach efficacy.

### 5.3 Verdict on win-back

**The evidence does not support building or surfacing a win-back workflow, and the strongest reason is not that returns are small — it is that returns are front-loaded, spontaneous, and unmeasured against any control.**

Specifically:

1. **The recoverable window has largely closed before the expiry clock even fires.** The billing signal arrives ~70 days after behavioural departure (§4.1); by then the conditional return rate is ~1.6%/month (§2.1).
2. **71% of all returners are back by day 60, unprompted.** Whatever the gym does or doesn't do, most of the returning happens early and by itself.
3. **The remaining 29% arrives over ten months at ~1 point per month** — a trickle no interface can meaningfully work.
4. **No controlled evidence exists that outreach adds anything**, and the nearest RCT is null on retention.

**A recorded disagreement, resolved.** The parallel source-tracing pass reached a more cautious position — that "archive and forget" is *not* evidence-backed, because no one has published a win-back response curve by recency. That caution is correct **about the win-back literature**, and I have not found such a curve either (§5.1c). But it does not carry, for one reason: Sperandei publishes the **spontaneous-return** curve, which is the baseline the win-back question actually turns on. You do not need to know how well a campaign performs at day 90 to know that at day 90 only ~1.6% of the remaining absentees will return in a given month, campaign or no campaign. The measured base rate bounds the opportunity regardless of the instrument.

So: **"archive and forget" is the evidence-backed answer, with one qualification and one boundary.**

The qualification: the evidence does not say lapsed members are worthless. It says the **work-queue framing is wrong**. They return on their own schedule, so the requirement is that a returning member is **findable, and their history intact**, when they walk back in. That is a search-and-history requirement, not a ranking-and-outreach requirement.

The boundary: what is *not* supported is the reverse over-correction — deleting them, or making them hard to reach. Both literatures point at the same targeted exception (§5.1c): long-tenured lapsed members are the one cohort where reacquisition has measured support. If anything ever gets built here, it is a **tenure filter, not a recency queue** — and it is out of this map's scope regardless.

---

## 6. Practitioner reality

**Coverage caveat, stated up front.** `reddit.com` is blocked outright from this environment, and most G2/TrustRadius pages returned 403. r/gymowners, r/crossfit and r/personaltraining could **not** be read directly; relevant threads were confirmed to exist but only as un-quotable snippets. The PushPress user community lives in a **private Facebook group**, unindexed. So the practitioner half of this ticket is built on Capterra review text, vendor documentation, and vendor pricing pages — sources that skew toward vendors. **Read §6.4 as a genuine gap, not as a null result.**

### 6.1 The complaint is real, and the products confirm it by their behaviour

Direct practitioner quotes are thinner than hoped, but the product evidence is unambiguous.

- **PRACTITIONER** — Barbra B., Owner/Director, 2+ years on Gym Assistant, verified Capterra reviewer: **"I can't hide accounts that are no longer active."** ([Capterra](https://www.capterra.com/p/42753/Gym-Assistant/reviews/)) — this repo's exact complaint, in an owner's own words.
- **PRACTITIONER** — Chris C., Owner, same page: *"Once a member is deleted you can't reuse that member number."* An adjacent gripe that implies owners delete often enough to hit the side effects.
- **VENDOR behaviour as evidence** — Gym Assistant ships a dedicated [**"Purge (permanently delete) inactive members"**](https://gymassistant.phpkb.cloud/article/purge-permanently-delete-inactive-members.html) utility, gated behind a backup warning and a type-the-word-"purge" confirmation. Vendors do not build irreversible bulk-delete workflows with safety rails unless customers ask repeatedly.

### 6.2 The strongest finding: nobody auto-archives, and nobody will name a number

Across ten products checked (Mindbody, Glofox, PushPress, Wodify, TeamUp, Zen Planner, ABC Ignite, Virtuagym, Trainerize, Gym Assistant, Gymdesk):

> **No vendor automatically archives or hides a member after a fixed N-day period.**

What exists instead is automatic **re-labelling** — a status flag flips, reversibly, and the record stays visible and filterable. Archiving or purging, where it exists at all, is a **manual, deliberate, usually irreversible admin action.**

And where a day-count does appear, it is explicitly the gym's to choose. TeamUp's own documentation gives *"customers who haven't purchased a class package and haven't been to class in the last **12 days** will be automatically classified as inactive"* — but 12 is the doc's **example**, not a platform default; the operator sets the criteria ([TeamUp](https://support.goteamup.com/setting-your-inactive-customer-criteria)). **Label: VENDOR documentation.**

This is independent, industry-wide corroboration of §1's verdict. An entire product category, with far more member data than any published study, **declines to commit to a threshold.** If 30, 60 or 90 days were a real behavioural boundary, one of these vendors would have hardcoded it and marketed it. None has.

### 6.3 The status models the industry actually ships

| Product | Status model | Auto-transition? | Hidden from default view? |
|---|---|---|---|
| **TeamUp** | **New / Active / Slipping Away / Inactive** | Yes — rule-driven, gym-configured, and **automatically reversible**: *"If a customer purchased a membership/class package or booked a class, their 'Inactive' status would be automatically removed"* ([docs](https://support.goteamup.com/setting-your-inactive-customer-criteria)) | **No** — inactive members remain filterable and exportable |
| **Wodify** | On-Ramp / Active / Suspended / Inactive | No — manual, admin-gated | Separate "Inactive" tab |
| **Mindbody** | Active / Inactive; deleted profiles are *preserved* as inactive "to preserve client communication logs" | No | Filterable |
| **Gym Assistant** | Member / Lead / Non-Member, plus manual purge | No | Purge is destructive and manual |

Two things to lift from this table into the ruling:

1. **TeamUp ships a four-tier model with an explicit "Slipping Away" tier between Active and Inactive** — a named, productised version of exactly the early-warning tier §4.4 argues for on the attendance clock. This is the closest thing to a prior-art endorsement of the two-clock design, and it comes from a vendor, not from theory.
2. **Auto-transitions are reversible and non-hiding; destructive actions are manual.** That is a coherent doctrine and it matches where §5.3's evidence lands: fold lapsed members out of the *default* view, keep them findable, and never let a clock delete anyone.

### 6.4 Win-back in practice: nobody says it's a waste of time — and that absence is not evidence

- **PRACTITIONER (relayed via vendor blog, not independently verified)** — Dave Kovar's $6M, 9-location organisation: reactivation outreach accounts for **63% of actual enrolments** despite being 54% of initial inquiries, on a 3x/year phone cadence ([PushPress](https://www.pushpress.com/blog/how-to-run-a-reactivation-campaign-for-former-gym-members)). The single most credible pro-win-back data point found — and note it is **phone outreach by a named operator**, not software.
- **MEASURED (methodology paywalled)** — a Zenoti consumer survey reports **49% of lapsed members say their gym never reached out** after they stopped attending ([Athletech](https://athletechnews.com/atn-insights-49-percent-of-lapsed-members-say-their-gym-never-reached-out-after-they-stopped-attending/)).
- **VENDOR-CLAIMED, unverifiable** — the JD Gyms "over 50% reactivated" story: re-fetching the source shows **no time period, no methodology, and no confirmation JD Gyms is even a client of the vendor telling the story** ([Propello](https://propellocloud.com/blog/win-back-campaigns/)).
- **RECEIVED WISDOM** — "5–7x cheaper to reactivate than acquire", "20–40% win-back vs 5–20% cold", "15–25% win-back open rates" recur near-verbatim across PushPress, ClubAutomation, Hapana, Propello and Cloudgymmanager with **no shared citation**.

**Critically: no practitioner source calling win-back a waste of time was found — and that must not be read as consensus.** Vendor content saturates this search space, every vendor sells outreach tooling, and the one channel where sceptical owners actually talk (Reddit, private Facebook groups) was unreachable. The absence of dissent here is a **sampling artifact**, and the ruling should treat it as such.

### 6.5 LatAm practice

**PRACTITIONER-adjacent, VENDOR-authored** — a Mexican gym-software vendor describing what owners typically do with *socios vencidos*:

> *"Mandar un WhatsApp suelto. Recordarles que 'deben'. Esperar que regresen solos."*
> ("Send a stray WhatsApp. Remind them they 'owe'. Hope they come back on their own.")

— followed by the vendor's own verdict, *"Eso casi nunca funciona"* ("that almost never works") ([GymForce MX](https://www.gymforce.mx/blog/como-recuperar-socios-vencidos-con-una-oferta.php)). No data behind it; it is a sales pitch for their reactivation tool. But the *description* of current practice — informal WhatsApp, dunning language, passive waiting — is the most relevant portrait of the market this product actually sells into, and "esperar que regresen solos" is, per §2, empirically what mostly happens anyway.

### 6.6 Does per-active-member pricing create an archive incentive?

Partly — and the most interesting answer is a design pattern worth stealing.

- **Per-active-member pricing confirmed**: [TeamUp](https://www.goteamup.com/pricing/) (tiers at <100/200/300/400/500), Zen Planner (multi-source), [Gymdesk](https://gymdesk.com/blog/mindbody-fees).
- **Flat / not member-count based**: [PushPress](https://www.pushpress.com/pricing), [Wodify](https://www.wodify.com/pricing) (*"Unlimited Clients & Employees"*), Mindbody (per location/feature).

But TeamUp's definition defeats the hypothesis in an instructive way: *"An active customer is someone who has a registration or purchases something from your business during the month… **Unlimited total customers in the system; only active ones determine the tier**."*

**A lapsed member simply stops counting the month they stop transacting — automatically, with no admin action, and with the record fully retained.** The billing incentive to manually archive evaporates because the system already distinguishes "counts as active" from "exists in the database". That is precisely the separation this map needs: **"is this person part of my working set?" is a derived, reversible, automatic question; "does this person exist?" is never answered by a clock.**

---

## 7. Recommended thresholds, with confidence attached to each number

Confidence is stated per number, and the honest answer for most of them is that the *structure* is evidenced and the *number* is not.

| Boundary | Recommendation | Confidence in the **structure** | Confidence in the **number** | Basis |
|---|---|---|---|---|
| **Two clocks, not one** | Tier on last-visit **and** expiry as separate axes; never collapse them | **High** | n/a | §4.1 (~70-day lag, 2 datasets), §4.4 (30 days means opposite things) |
| **Attendance: "drifting"** | ~**14 days** without a visit *while paid-up* | **High** — an early-warning tier that fires while the member is reachable is well-supported | **Low** — no public recency curve exists (§4.5); 14 is an ergonomic pick, roughly half of a 20–30 day package cycle | §4.3, §4.5 |
| **Attendance: "absent"** | ~**30 days** without a visit while paid-up — **a warning, never a lapsed label** | **High** | **Low-medium** — 49% of eventual churners crossed this and returned (§4.4), so it is deliberately a low-specificity alarm | §4.4 |
| **Expiry: still-payable urgency** | Keep the existing `{3, 7, 14}` for members **not yet expired** | **High** — a renewal-reminder tier is the highest-value use of the expiry clock | **Medium** — tuned to this gym's 20–30 day packages (`rules.ts:137`), which is the right basis; not externally validated | Map fact; §1.3 |
| **Expiry: "lapsed"** | **30 days** past `vence` with no repurchase | **High** — a real cliff exists at the one-month mark | **Medium** — the cliff is measured, but at monthly resolution; day 30 vs day 22 is unresolvable (§3). Fits the 20–30 day package cycle, which is the ergonomic argument | §2.1, §3 |
| **Expiry: "gone" / fold away** | **60 days** past `vence` | **Medium-high** | **Medium** — 71% of all lifetime returners are already back by day 60 (§2.2); beyond it the rate is ~1.1 pts/month. 60 is defensible as "the point where the curve goes flat", not as a discontinuity | §2.2, §5.3 |
| **Declared/stored `baja`** | **Not needed on this evidence** | **Medium** | n/a | Nothing found requires a human-declared state; the clocks carry the doctrine. Leaves ADR-0002 (derived-at-read) intact |
| **Tenure as a second axis** | Split lapsed by tenure (`created_at` / `ventas` count) | **Medium-high** | n/a | §2.3: best-prognosis 63% vs worst-prognosis <30% return; length of membership is a significant predictor |

**Prior art check.** The recommendation above is not invented: TeamUp ships **New / Active / Slipping Away / Inactive** — a four-tier model with an explicit early-warning tier, driven by gym-configured rules, auto-reversing the moment the member transacts again, and never hiding the record (§6.3). That is the same shape this table arrives at from the evidence side. Independent convergence between the literature and the most-evolved product in the category is the strongest support available for the *structure*.

**And the industry's silence is itself the argument for ergonomics.** Ten products were checked; **none** hardcodes an N-day archive threshold, and the one vendor that documents a day-count calls it an example and hands the choice to the operator (§6.2). A category with orders of magnitude more member data than any published study has declined to name a number. That is as close to a definitive answer as this ticket can get: **the numbers are not discoverable, they are decidable.**

**The owner's "60 days off the top of his head" holds up better than it deserved to** — but not for the reason it was picked. 60 days past expiry is defensible as the point where the return curve flattens, and it is *not* defensible as a knee. The knee is at 30. If the design wants one number, 30 days past expiry is the better-evidenced one; 60 is the better choice if the intent is to be conservative about hiding people.

**What the evidence explicitly does not support:**

- Any specific day-count on the attendance clock (§4.5).
- A win-back work queue (§5.3).
- Citing "14 days → 6x cancellation risk" (§1.1) — it is an unsourced vendor number and should not enter the ruling.
- Treating a 30-day attendance gap as churn (§4.4).

---

## 8. Transfer risk

Stated explicitly, per the ticket's constraint.

**Transfers well:**

- **Sperandei 2019 / 2016** — a 550–700-member independent gym in Rio de Janeiro. Latin America, non-chain, monthly-fee, at the top of this repo's 21–500 band. This is the closest published analogue to RED that exists, and it is the source of the two most load-bearing findings (the decay curve, the knee). **Low transfer risk.**
- **Coelho et al.** — two independent Brazilian gyms, turnstile data. **Low transfer risk.**

**Transfers with caution:**

- **DellaVigna & Malmendier** — US big-box, 1997–2000, and specifically about members trapped in auto-renewing contracts they forget to cancel. The ~70-day lag is partly a *contract artifact*: a member who forgets to cancel inflates the gap between last visit and termination. **RED sells 20–30 day packages that expire on their own with no auto-renewal, so the mechanism is weaker here.** The direction (attendance leads billing) is robust; the magnitude may be smaller at RED. **Medium transfer risk — treat ~70 days as an upper bound.**
- **Middelkamp** — BasicFit and HealthCity, European low-cost big-box chains with ~260k ex-members. The "49% returned after a month's gap" finding is about human attendance rhythm, which transfers better than commercial structure does. But big-box members are anonymous in a way a 21–500-member gym's members are not: at RED the owner *knows* who is missing, which weakens the case that the software must detect it and strengthens the case that the software must simply not lie about it. **Medium transfer risk.**
- **Ferreira et al.** — Portugal, single club; and the headline finding is leaky (§4.2). **Use only for the 76.4-day descriptive stat.**
- **Norwegian RCT** — n=356, onboarding rather than win-back, Scandinavian market. **High transfer risk as a direct answer**; it is corroborating, not decisive.

**Does not transfer:**

- All vendor retention statistics (§1.1, §5.1). Sourced from big-box chains with marketing departments where they are sourced at all, and mostly they are not sourced.
- Mexican press figures (§2.4) — trainer estimates, no methodology.

**The structural caveat across everything:** every study here measures **monthly-rolling gym memberships**. RED sells **8/12-class, 20–30 day packages** (`packages/domain/src/rules.ts:137`). A "one month" boundary in the literature is one billing cycle; at RED one billing cycle is also ~20–30 days, so the mapping happens to be close. That coincidence is convenient, and it is a coincidence — worth stating in the ruling so nobody later assumes the literature validated *this* product's cycle.

---

## 9. Source table

| # | Source | Type | Label |
|---|---|---|---|
| 1 | [Sperandei, Vieira & Reis 2019, Athens J Sports 6(2):95–108](https://www.athensjournals.gr/sports/2019-6-2-3-Sperandei.pdf) | 5,242 members, Rio de Janeiro, 550–700-member independent gym, 2005–2014, Kaplan-Meier + Cox | MEASURED |
| 2 | [Sperandei et al. 2016, J Sci Med Sport 19(11):916–920](https://pubmed.ncbi.nlm.nih.gov/26874647/) | Same dataset, dropout side | MEASURED |
| 3 | [DellaVigna & Malmendier 2006, AER 96(3):694–719](https://eml.berkeley.edu/~ulrike/Papers/gym.pdf) | 7,752 members, 3 US health clubs, 3 years | MEASURED |
| 4 | [Middelkamp, van Rooijen & Steenbergen 2016](https://www.beweginginzicht.nl/upload/files/Summary-thesis-Middelkamp.pdf) · [PMS](https://journals.sagepub.com/doi/10.1177/0031512516631075) | 259,355 ex-members, 267 European clubs, 24 months | MEASURED |
| 5 | [Ferreira et al. 2021, IJERPH](https://pmc.ncbi.nlm.nih.gov/articles/PMC8508547/) | 5,209 members, Lisbon | MEASURED — **leaky**, see §4.2 |
| 6 | [*The effect of initial support on fitness center use in new fitness center members: a RCT*, Norway 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8683950/) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/34976662/) | n=356 RCT, Trondheim, 4-year follow-up | MEASURED |
| 7 | [Who churns from fitness centres? 2024, Managing Sport & Leisure](https://www.tandfonline.com/doi/full/10.1080/23750472.2024.2305896) | 661 members, Australia, 56 weeks attendance | MEASURED |
| 8 | [Yi, Lee, Connerton & Park 2020, Managing Sport & Leisure 26(4)](https://www.tandfonline.com/doi/abs/10.1080/23750472.2020.1763829) | 2,385 members, 50 clubs, South Korea | MEASURED |
| 9 | [Coelho et al., Rev Bras Ciênc Esporte](http://www.scielo.br/j/rbce/a/WtzM3gBFRkcrqY7xKZsVNnm/?lang=en) | 3,802 members, 2 gyms, Natal Brazil, turnstile | MEASURED |
| 10 | [JeriCommerce retention statistics](https://blog.jericommerce.com/resources/gyms-fitness-studios-retention-statistics) | Shopify loyalty app marketing; 9 of 12 statistics unsourced | VENDOR-CLAIMED |
| 11 | [HFA "15 Surprising Facts About Retention"](https://www.healthandfitness.org/improve-your-club/15-surprising-facts-about-health-club-member-retention/) | Trade body; zero sourced statistics | RECEIVED WISDOM |
| 12 | [El Universal, Mexico](https://www.eluniversal.com.mx/nacion/ir-al-gym-un-proposito-que-dura-solo-3-meses/) | Trainer estimates, no methodology | RECEIVED WISDOM |
| 13 | [PT Direct, attendance & retention patterns](https://www.ptdirect.com/training-design/exercise-behaviour-and-adherence/attendance-adherence-drop-out-and-retention-patterns-of-gym-members) | Cites FIA *Winning the Retention Battle* (2001), UK big-box | MEASURED (secondary, 2001, big-box) |
| 14 | [Bult & Wansbeek 1995, *Marketing Science* 14(4):378–394](https://pubsonline.informs.org/doi/abs/10.1287/mksc.14.4.378) | RFM econometric grounding; recency predicts response, binned by quintile | MEASURED |
| 15 | [Bolton & Guidi-Bruscoli 2021, *Econ Hist Rev* 74:873–891](https://onlinelibrary.wiley.com/doi/10.1111/ehr.13070) | ~2,000 bills of exchange, 1436–8; 30/60/90 usance = travel time | MEASURED (historical) |
| 16 | [Thomas, Blattberg & Fox 2004, *JMR* 41(1):31–45](https://journals.sagepub.com/doi/10.1509/jmkr.41.1.31.25086) | Customer winback; pricing-centric | MEASURED |
| 17 | [Kumar, Bhagwat & Zhang 2015, *J Marketing* 79(4):34–55](https://sciencedaily.com/releases/2015/07/150707134215.htm) | US telecom, 8 yrs; lapse time erodes win-back and second-lifetime value | MEASURED (direction only; paywalled) |
| 18 | [Omnisend win-back benchmarks](https://www.omnisend.com/blog/win-back-email/) | 20B+ emails, 27,000+ brands; 0.52% conversion | MEASURED (disclosed N) |
| 19 | [Dishman & Sallis 1994](https://link.springer.com/article/10.2165/00007256-199417010-00004) | Exercise adherence; ~50% dropout by 6 months, relapse front-loaded ~3 months | MEASURED |
| 20 | [Mailchimp, identifying inactive subscribers](https://mailchimp.com/help/identify-inactive-subscribers/) | ESP explicitly declines to name a threshold | VENDOR — notable for what it *doesn't* claim |
| 21 | [GymMaster, "Crossing the 90-Day Barrier"](https://www.gymmaster.com/blog/crossing-the-90-day-barrier/) | The 90-day doctrine, zero citations | RECEIVED WISDOM |
| 22 | [Gym Assistant reviews, Capterra](https://www.capterra.com/p/42753/Gym-Assistant/reviews/) | *"I can't hide accounts that are no longer active"* — verified owner | PRACTITIONER |
| 23 | [TeamUp, inactive-customer criteria](https://support.goteamup.com/setting-your-inactive-customer-criteria) · [pricing](https://www.goteamup.com/pricing/) | 4-tier model incl. "Slipping Away"; 12 days is an *example*; active = transacted this month | VENDOR (documentation) |
| 24 | [Gym Assistant purge utility](https://gymassistant.phpkb.cloud/article/purge-permanently-delete-inactive-members.html) | Manual, irreversible bulk purge with safety rails | VENDOR (documentation) |
| 25 | [PushPress reactivation article](https://www.pushpress.com/blog/how-to-run-a-reactivation-campaign-for-former-gym-members) | Dave Kovar: reactivation = 63% of enrolments | PRACTITIONER (vendor-relayed) |
| 26 | [Athletech / Zenoti survey](https://athletechnews.com/atn-insights-49-percent-of-lapsed-members-say-their-gym-never-reached-out-after-they-stopped-attending/) | 49% of lapsed members never contacted; methodology paywalled | MEASURED (unverifiable) |
| 27 | [GymForce MX](https://www.gymforce.mx/blog/como-recuperar-socios-vencidos-con-una-oferta.php) | LatAm practice with *socios vencidos*: WhatsApp, dunning, waiting | VENDOR-CLAIMED |
| 28 | [Propello, JD Gyms "50% reactivation"](https://propellocloud.com/blog/win-back-campaigns/) | No period, no method, client relationship unconfirmed | VENDOR-CLAIMED |

---

## 10. What I could not establish

Listed so the ruling knows the edges of this evidence base.

1. **A days-since-last-visit decay curve.** The clean studies measure visit *frequency*; the one measuring *recency* is leaky (§4.2); Sperandei's curve is recency on the **payment** clock. Any day-count on the attendance clock is an engineering choice (§4.5).
2. **The knee's location to better than one-month resolution.** Sperandei measured in whole months (§3).
3. **Any controlled win-back study in fitness.** Zero found; the nearest RCT is onboarding, not win-back, and is null (§5.2).
4. **Sceptical practitioner voice.** Reddit and private Facebook operator groups were unreachable (§6). The absence of "win-back is a waste of time" in these findings is a sampling artifact.
5. **Mexican measured data.** Everything found for Mexico is press quotes and trainer estimates (§2.4). The Brazilian data is the closest measured proxy for this market.
6. **Whether returning members are worth *more* or *less* than new ones at RED's scale.** Kumar et al. suggest tenure-dependence; nothing gym-specific and credible was found.
