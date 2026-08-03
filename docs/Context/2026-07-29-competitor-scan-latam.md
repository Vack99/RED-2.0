# Competitive Scan: Gym Management Software, Mexico / LatAm — 2026-07-29

Research method: live web search (English + Spanish), vendor pricing pages fetched directly where available, Capterra/App Store review pages spot-checked for complaints. Every factual claim below is sourced inline. Where a vendor does not publish pricing, that is stated explicitly rather than estimated.

## Verdict (one paragraph)

Mexico's gym-software market is crowded but shallow: a long tail of Mexican-native micro-vendors (Gym&i, Connect Gym, Gymforce, FITMA, Klasius, GYMmx) compete almost entirely on price ($200–$1,900 MXN/mo) and basic POS/membership/QR check-in, while the Spanish/LatAm-regional incumbents (Trainingym, Fitco, AgendaPro, EVO/ABC Evo, Aimharder, Boxmagic, CrossHero, WodBuster) compete on breadth (CrossFit-specific tooling, multi-location chains, AI churn prediction) but rarely on genuine per-gym white-label — most either share one vendor-branded app across all customers or sell a fully custom app as an expensive premium add-on aimed at chains, not the 50–500-member independent gym this product targets. The "no cut of member payments" pitch is a real, substantiable differentiator against the international players (Mindbody, Glofox, Wodify all monetize partly through payment-processing margin/marketplace fees) but is roughly matched by several Mexican-native flat-fee tools that also charge 0% platform commission (Gym&i, Connect Gym) — so it differentiates against the premium/international tier, not against the cheapest local tier. The most substantiated gap for this product is genuinely biggest at the intersection of true single-deployment-per-gym white-labeling + Supabase-grade per-tenant data isolation + a full front-desk POS/renewal/attendance suite in one codebase — nobody profiled below clearly does all three at the $800–$2,000 MXN/month price band an independent Mexican gym actually pays.

## Ranked competitor table

| # | Name | HQ / Origin | Sells into MX? | Published pricing | Threat level |
|---|------|-------------|-----------------|--------------------|--------------|
| 1 | **Gym&i** | Mexico | Yes — Mexico-native, MXN pricing | $799 / $1,299 / $1,899 MXN+IVA per month, flat per-location, 0% commission | Highest — same segment, same price band, same country |
| 2 | **Trainingym** | Spain | Yes, active MX/LatAm sales & marketing | Not published; quote-only | High — market leader by reputation, broad feature set, but priced above segment and quote-gated |
| 3 | **AgendaPro** | Chile (LatAm multi-vertical) | Yes, dedicated `/mx` site + MXN pricing | $299–$4,500 MXN+IVA/mo by tier (per-professional above Individual) | High — aggressive MX go-to-market, WhatsApp-native, broad SMB reach beyond gyms |
| 4 | **EVO / ABC Evo** | Brazil-origin, now under ABC Fitness (US) | Yes, LatAm-wide incl. Mexico | Not published; scales with # units/students | High — largest LatAm install base (8,500+ gyms claimed), per-gym branded app |
| 5 | **Fitco (Fitco Latam)** | Latin America (boutique-fitness focus) | Yes, MXN listed as supported currency | $59 / $99 / $169 USD/mo (Lite/Core/Growth), Enterprise custom | Medium-high — boutique/CrossFit/studio overlap, white-label only at Growth+ |
| 6 | **Connect Gym** | Mexico | Yes — Mexico-native | $0 / $200 / $500 MXN/mo (Starter/Pro/Max), by member cap | Medium-high — closest direct clone at the low end, SPEI-native |
| 7 | **Aimharder** | Spain | Yes, MX customer installs found (e.g., Wezone Pacífico) | Not published; quote-only | Medium — strong CrossFit/box niche, athlete app w/ rankings |
| 8 | **Boxmagic** | Chile | Yes, LatAm CrossFit/box focus | Not published centrally (per-box pricing only visible on individual "market" pages); Capterra lists a "$399/mo" base mention | Medium — CrossFit-box niche, cheap, but weak reporting/support per reviews |
| 9 | **XCORE** | Venezuela-origin | Yes, has MX-specific landing page | Not published; quote-only, hardware bundle | Medium — differentiates on biometric/turnstile hardware, not software depth |
| 10 | **CrossHero** | Spain, sold across LatAm | Yes (marketing claims LatAm presence) | €69/mo flat (Spain/Portugal/Bulgaria pricing found; LatAm/MXN pricing not published) | Medium — flat-fee CrossFit/box/studio suite |
| 11 | **WodBuster** | Spain | Marketed as available in LatAm | Not published | Medium — CrossFit/box suite, no pricing transparency |
| 12 | **Klasius** | Mexico | Yes — Mexico-native, WhatsApp-first | ~$999 MXN/mo mentioned for CrossFit-box tier (secondary source); no vendor pricing page fetched | Medium — differentiated on WhatsApp-as-the-app + CFDI 4.0 tax invoicing, no native member app |
| 13 | **Gymforce** | Mexico | Yes — Mexico-native | $1,500 MXN/mo flat (card-domiciled), independent of member count | Medium-low — flat-fee local player, thin public feature detail |
| 14 | **FITMA** | Mexico | Yes — Mexico-native | Not published | Medium-low — all-in-one MX SaaS, feature list overlaps closely, but no visible traction signal found |
| 15 | **Crossfy** | Argentina | Claims LatAm-wide (900+ boxes), Mexico content marketing found | USD 50–130/mo per location (per a third-party comparison, not vendor-confirmed) | Low-medium — CrossFit/box niche, Argentina-centered |
| 16 | **Mindbody** | USA | Yes, present in MX (tourist/boutique corridors) | From $129 USD/mo, scales up; English-first support | Low — priced and positioned above this product's segment, weak Spanish support |
| 17 | **Glofox (ABC Glofox)** | Ireland/USA, under ABC Fitness | Some LatAm presence via ABC Fitness umbrella; no MX-specific pricing found | Not published; quote-only | Low — international boutique-studio player, white-label via Stripe Connect, but not MX-focused go-to-market |
| 18 | **Wodify** | USA | Marketed to LatAm CrossFit boxes but USD-priced | $149–$198 USD/mo (per a third-party comparison) | Low — flagged in MX/LatAm comparison content as "known but expensive" |

Also noted but not separately profiled (weak/no independent verification of MX relevance): GYMmx ($199–$499 MXN/mo per a secondary source, no member app), Tecnofit (Brazil-only billing model found, R$3.38/student/mo, no MX pricing or presence confirmed), GymDesk (US-origin, $75–$200 **USD**/mo by member-count tier, no white-label mention found on its own pricing page — global reach "600+ gyms in 45 states/28 countries" but not MX-targeted).

## Per-competitor detail

### 1. Gym&i (Mexico)
- URL: gymni.mx. Mexico-native, positioned explicitly as "nació en México."
- Pricing (fetched from vendor pricing page): Starter $799 MXN/mo (80 members, 2 staff, 3 plans), Pro $1,299 MXN/mo (500 members, 5 staff, 10 plans), Business $1,899 MXN/mo (unlimited) — flat per-gym-location fee, "0% comisión de plataforma," 14-day trial. [gymni.mx pricing, fetched]
- Features: QR check-in, automated billing via Stripe, AI assistant, KPI dashboard (Starter); + Stripe/analytics/self check-in/hardware access control (Pro); + structured workout programs, nutrition plans, body-progress tracking, full theme customization (Business). Member web app from Starter tier up.
- Overlap with this product: POS/checkout-adjacent billing, membership tiers, QR attendance, member app, reporting.
- What they do that this product doesn't (per public description): nutrition plans, AI program generation, body-progress tracking.
- What this product does that they don't (inferred, not independently verified against their app): explicit arrival-window/no-show truthfulness model for class attendance, folio-style receipt/POS checkout flow, personalized/custom sale line items — none of these are mentioned in Gym&i's public marketing, but absence of a marketing mention is not proof of absence.
- Segment: small-to-medium independent Mexican gyms — closest direct positioning match of any competitor found.
- Source: [gymni.mx pricing](https://gymni.mx) (fetched directly), [gymni.mx blog comparison](https://gymni.mx/blog/mejor-software-gimnasios-mexico-2026) (fetched — note: this is Gym&i's own comparison content, so competitor pricing figures quoted within it are secondhand and should be treated as vendor-biased/unverified for anyone but Gym&i itself).

### 2. Trainingym (Spain)
- URL: trainingym.com. Self-described as Spain's most-implemented gym software, "1 de cada 5 gimnasios en España," 23 countries, 12+ years. [trainingym.com/en, search result]
- Pricing: not published; quote-only, confirmed via multiple searches including comparasoftware.com and Trainingym's own site — no plan/price ever surfaced. A secondary comparison source (Gym&i's own blog, vendor-biased) cited "~$1,500+ MXN/mo" and "2% + $6 MXN per transaction," but this is an unverified third-party figure, not a Trainingym-published number — flagged as unconfirmed.
- App model: **confirmed two-tier** — a single shared "Trainingym" app (free, on App Store/Google Play under the generic name, colors/logo customizable inside it) is the default; a fully custom "Premium personalized app" published under the gym's own name is a separate paid development project "recommended for gyms and chains of studios." [trainingym.com/en/app-trainingym, search result] This directly matters to the white-label question below — true white-label is an upsell, not the base product.
- Reviews (Capterra, via search): praise for Spanish-language support and reservation management; complaints include content not localized to Mexico ("no manejan alimentos de México" — nutrition content is Spain-centric), being "muy lejos del proveedor" (far from the provider) as felt by a Mexican reviewer, and occasional server hangs. [capterra.com/p/166022/Trainingym/reviews, search result]
- Segment: broad — independent gyms up to multi-location chains; access-control hardware integration is a differentiator.

### 3. AgendaPro (Chile)
- URL: agendapro.com/mx. Multi-vertical scheduling/POS SaaS (salons, clinics, gyms) with a dedicated Mexico storefront and MXN pricing.
- Pricing (fetched from vendor page): Individual $299 MXN+IVA/mo (1 pro), Básico $550 MXN+IVA/mo (2–20 pros), Premium $1,500 MXN+IVA/mo, Pro $4,500 MXN+IVA/mo — scales per professional/seat, not per member. Payment terminal add-on $250/mo+IVA or $2,500 one-time, **plus a 2.29%+IVA transaction fee** ("reducible sujeto a aprobación"). WhatsApp messaging sold in paid packages starting ~$100/mo for 50 messages. [agendapro.com/mx/planes, fetched]
- Reviews: 4.8 on Capterra per search summary; praised for live-chat support; main complaint found was "periodic tariff increases." [capterra.com/p/218709/AgendaPro/reviews, search result]
- Note: AgendaPro is not gym-specific — it is a horizontal booking/POS platform with a gym vertical skin, which is both a strength (broad feature investment) and a tell (class/attendance/renewal logic is generic, not gym-purpose-built).
- Gap vs. this product: no evidence of class-count-pack or membership-expiry-specific logic; WhatsApp and payment-terminal fees are separately metered add-ons, unlike a flat-fee model.

### 4. EVO / ABC Evo (Brazil-origin, now ABC Fitness)
- URLs: softwareparagimnasio.com (LatAm-facing), w12latam.com, tecnofit.com.br (sister Brazil product under related ownership lineage).
- Scale claims: "8,500 gyms in 18 countries," "95% of Brazilian gym networks," LatAm coverage explicitly including Mexico, Argentina, Peru, Colombia. [terra.com.br article; mercadofitness.com, search results]
- Pricing: not published; scales with "número de unidades y alumnos" (units/students). [search result, multiple sources — no number ever surfaced]
- App model: EVO App gives each gym "su propia app" (their own app) with personalized branding — genuine per-gym white-label claimed in marketing. [mercadofitness.com/evo-el-software-de-gestion..., search result] Not independently verified against an actual live gym's App Store listing in this scan.
- Threat: largest LatAm scale claim of any vendor found; biggest gap for this product is EVO's reach/brand trust versus this product's unproven MX traction.
- Gap vs. this product: pricing opacity (quote-gated) works against them for a self-serve/PLG motion at the independent-gym price point this product targets.

### 5. Fitco / Fitco Latam
- URL: fitcolatam.com. Boutique/studio-first positioning (yoga, pilates, CrossFit, cycling, dance, boxing).
- Pricing (fetched from vendor page): Lite $59 USD/mo, Core $99 USD/mo, Growth $169 USD/mo (all quarterly-billed), Enterprise custom. Multi-currency display incl. MXN, ARS, CLP, COP, PEN. [fitcolatam.com/precios, fetched]
- White-label: **confirmed gated feature** — "Fitco app (white-label)" only ships at Growth tier and above; Lite/Core get a shared/customized-website experience, not a branded native app. [fitcolatam.com/precios, fetched]
- Payment processing: integrates Stripe, Mercado Pago, Webpay; no commission rate disclosed. [fitcolatam.com/precios, fetched]
- Reviews: App Store rating 3.5/5 (13 ratings); user complaints include forced app re-login/updates every two weeks and payments not reflecting. [search result citing apps.apple.com/mx/app/fitco]
- Gap vs. this product: at $59–99 USD/mo (~$1,000–1,800 MXN at typical rates) Fitco's entry tiers are price-competitive with this product's likely band, but true white-label costs more (Growth, $169 USD ≈ $3,000+ MXN/mo) — this product offering white-label at every tier (by architecture, not as an upsell) is a substantiated structural difference if the product's own pricing lands anywhere near Fitco's Lite/Core band.

### 6. Connect Gym (Mexico)
- URL: connectgyms.com. Explicitly Mexico-built: SPEI native payments, Spanish-only, MXN pricing, CDMX/Puebla/Monterrey testimonials. [connectgyms.com, fetched]
- Pricing (fetched): Starter $0/mo (≤10 members, 2 trainers), Pro $200 MXN/mo (≤50 members, 3 trainers), Max $500 MXN/mo (≤100 members, 10 trainers) — capped-tier-by-member-count model. [connectgyms.com, fetched]
- Features found: membership management, Stripe/SPEI automated payments, class scheduling + trainer assignment, real-time revenue/attendance dashboard, email invitations, mobile access for trainers/members, "multi-tenant data isolation" (their own words). No explicit mention of a dedicated branded member-facing app or WhatsApp notifications was found on the homepage. [connectgyms.com, fetched]
- Threat: cheapest structured competitor found that is architecturally similar in spirit (multi-tenant SaaS, Mexico-first) — but its own marketing does not claim a member app or white-label branding, which if true is a gap this product can claim against them directly.

### 7. Aimharder (Spain)
- URL: aimharder.com. SaaS for CrossFit boxes/training centers with an athlete-facing app (bookings, rankings, community). Live MX installs found (Wezone Pacífico, "veintiochogradosnorte" box instances using aimharder.com subdomains). [search results]
- Pricing: not published anywhere found, including on fetch of the vendor homepage (which surfaced only a cookie-policy page in this scan — pricing page not reached). Quote-gated per public reporting on comparasoftware.es.
- Segment: CrossFit/box-specific; narrower than this product's general-gym-plus-classes scope.

### 8. Boxmagic (Chile)
- URL: boxmagic.cl. CrossFit/box-and-studio management, LatAm-facing (Chile-headquartered, reviewers appear LatAm-wide per language).
- Pricing: no central plan page found; individual "market" pages per box show wildly different member-facing prices (these are the gym's own membership prices billed through the platform, not Boxmagic's SaaS fee). Capterra review page notes a "$399/mo" base-plan mention. [capterra.com/p/275373/Boxmagic, fetched]
- Reviews (fetched Capterra reviews page): 3.6/5 over 11 reviews; praise for ease-of-use and automated payments; complaints include weak support (24h+ response), missing waitlist/reporting depth, mobile booking UX issues, and at least one report of a promised dedicated account manager never materializing. [capterra.com/p/275373/Boxmagic/reviews, fetched]
- Gap vs. this product: reporting/analytics depth appears to be a genuine weak point per reviews — an area this product could differentiate on if its corte-del-mes reporting is stronger.

### 9. XCORE (Venezuela-origin)
- URL: xcore.fit, with a dedicated `/software-para-gimnasios-mexico/` landing page. 14+ years operating, hardware-centric: turnstiles, fingerprint/biometric readers, facial recognition. [xcore.fit, search results]
- Pricing: not published; quote-only, hardware bundle drives cost, described in a secondary source as "no transparente con sus precios... inversión inicial en hardware puede ser significativa." [search result]
- Segment: medium-large gyms wanting physical access-control hardware bundled with software — this is a materially different buyer (capex-willing) than the low-capex independent gym this product targets.

### 10. CrossHero (Spain, sold across LatAm)
- URL: business.crosshero.com. All-in-one for CrossFit/martial arts/yoga/pilates/dance; markets presence "en España y Latinoamérica en miles de gimnasios."
- Pricing: flat €69/mo confirmed for Spain/Portugal/Bulgaria on their own help-center pricing article, with a 15% annual discount and a "Startup" discount for <50 active clients; **no LatAm/MXN price point was found published anywhere**. [support.crosshero.com/es/articles/1049201-precio-y-descuentos-de-crosshero, search result]
- White-label: not confirmed in this scan (their business site did not surface pricing/white-label detail beyond the help-center article).

### 11. WodBuster (Spain)
- URL: wodbuster.com. CrossFit/sports-center suite: bookings, payments, invoicing, training, competitions, community.
- Pricing: not found published anywhere in this scan, including the vendor's own site content surfaced by search.
- Marketed as LatAm-available but no MX-specific pricing, case study, or install-base number was found.

### 12. Klasius (Mexico)
- URL: klasius.com. Mexico-native, differentiates on **WhatsApp as the interface** — clients book/pay via WhatsApp rather than a downloaded app — plus automatic CFDI 4.0 Mexican tax invoicing and OXXO/SPEI/card payment methods. [klasius.com/blog/automatizar-cobro-membresias-mexico-spei-oxxo-tarjetas, fetched]
- Pricing: a secondary source (crossfyapp.com competitor-comparison content, so vendor-biased) cites Klasius "starting at $999 MXN/month" for a CrossFit-box tier; this was not confirmed on Klasius's own site in this scan and should be treated as unverified.
- Positions explicitly against Mindbody/Glofox on the basis of MXN pricing, local payment rails, and tax compliance — i.e., Klasius's own marketing argues international players are a poor fit for MX, which corroborates this product's market thesis.
- Gap vs. this product: no evidence of a native branded member app (WhatsApp replaces it) — this is a genuine, opposite design bet from this product's member-app-first approach; worth noting as a different answer to the same problem, not simply "worse."

### 13. Gymforce (Mexico)
- URL: gymforce.mx. Flat $1,500 MXN/mo (card-domiciled billing, IVA included), cost independent of member count; additional branch ≈1/3 of main-plan price. [search result summarizing gymforce.mx]
- Also serves adjacent verticals (dance academies, Tae Kwon Do, aquatics, cycling studios) beyond gyms — broader-than-gym positioning.
- Public feature depth (POS, class booking specifics, white-label) not substantively found beyond the pricing summary; treat as thin coverage, not confirmed absence.

### 14. FITMA (Mexico)
- URL: fitma.app. All-in-one Mexico SaaS: bookings, memberships, automated charges, QR check-in/access control, integrated POS, real-time financial/occupancy reports, client portal + app, multi-location, equipment/position selection (bikes, reformers). [fitma.app, search result]
- Pricing: not found published anywhere in this scan.
- Closest single feature-list match to this product's stated feature set of any Mexican-native vendor found (POS + QR attendance + client app + multi-location + reports) — worth a follow-up deep dive given the overlap, but traction/scale signal (customer count, reviews) was not found.

### 15. Crossfy (Argentina)
- URL: crossfyapp.com. Claims "900+ boxes and gyms" across LatAm; publishes Mexico-focused content marketing (blog post on "CrossFit en México").
- Pricing: a third-party comparison article (crossfyapp's own blog, so vendor-authored) cites USD 50–130/mo per location — not shown on a neutral pricing page, so treat as vendor-claimed, unconfirmed by a disinterested source. [crossfyapp.com/blog/precios-software-gimnasios..., fetched]

### 16. Mindbody (USA)
- URL: mindbodyonline.com. Global boutique-fitness/wellness marketplace platform, present in MX mainly in tourist/boutique corridors per search summary; English-first support and complex admin UI noted as a weakness for MX buyers. [search result]
- Pricing: from $129 USD/mo (~$2,580 MXN), scaling up. [search result citing mindbodyonline.com]
- Monetizes partly via its consumer marketplace/commission model (exact % not confirmed in this scan) — relevant to the "no cut of payments" question below.

### 17. Glofox / ABC Glofox (Ireland/USA, under ABC Fitness)
- URL: glofox.com. International boutique-studio platform; "Glofox Payments" is a Stripe-Connect-built white-labeled payments product, and the marketing explicitly sells a "white-labeled Member App" as a retention feature. [glofox.com/blog/manage-gym-memberships; stripe.com/customers/glofox, search results]
- Pricing: not published; quote-only.
- MX/LatAm-specific presence: not substantively confirmed in this scan — appears to be a global platform with generic LatAm reach via the ABC Fitness umbrella rather than a dedicated MX go-to-market. This directly undercuts a blanket claim of "no competitor offers white-label" — Glofox does, but is not clearly selling into MX specifically.

### 18. Wodify (USA)
- URL: wodify.com. CrossFit/functional-fitness/BJJ-focused, USD-priced.
- Pricing: $149–$198 USD/mo per a third-party MX/LatAm comparison (crossfyapp.com, vendor-biased source); flagged in the same source as "known but expensive" for the 50–300-member segment this product targets. [crossfyapp.com/comparar, search result]

## Market questions

### What price band does a Mexican independent gym actually pay per month?

Confirmed, vendor-published MXN flat-fee data points for the independent-gym segment: **Gym&i $799–$1,899 MXN/mo** [gymni.mx], **Connect Gym $0–$500 MXN/mo** [connectgyms.com], **Gymforce $1,500 MXN/mo** [search summary of gymforce.mx], **AgendaPro $299–$1,500 MXN/mo** for the team tiers most gyms would need [agendapro.com/mx/planes]. A secondary (vendor-authored, unverified) figure put Klasius near $999 MXN/mo. Converting the USD-priced regional players: Fitco's entry tiers ($59–99 USD/mo) land around $1,000–1,800 MXN/mo; GymDesk's cheapest US tier ($75 USD/mo) is similar. **Conclusion: the real going band for a single-location independent Mexican gym is roughly $500–$2,000 MXN/month ($30–$120 USD/month equivalent), with $800–$1,500 MXN/mo as the density center** where Gym&i, Gymforce, Klasius, and AgendaPro's mid-tier all cluster. International quote-gated players (Trainingym, Aimharder, XCORE, WodBuster, CrossHero's LatAm price) don't publish numbers, which is itself evidence they don't compete on transparent price in this band — sales-assisted/negotiated pricing is the norm above the Mexican-native tier.

### How many competitors offer genuine per-gym white-label vs. one shared app?

Of the 18 profiled, only a minority clearly ship **true, unconditional per-gym branding at base tier**:
- **Confirmed shared-app-by-default, white-label as a paid/gated upsell**: Trainingym (free shared "Trainingym" app is the base; a from-scratch custom-branded app is a separate paid dev project marketed at chains) [trainingym.com/en/app-trainingym]; Fitco (white-label app gated to Growth tier, $169 USD/mo+) [fitcolatam.com/precios].
- **Confirmed white-label claimed as standard**: EVO/ABC Evo (per-gym branded app in marketing copy) [mercadofitness.com]; Glofox ("white-labeled Member App" as a stated feature) [glofox.com] — but Glofox is not clearly MX-focused.
- **No member-facing app claim found at all**: Connect Gym (homepage silent on a branded app) [connectgyms.com]; Klasius (deliberately app-less, WhatsApp-first by design) [klasius.com].
- **Unconfirmed either way** (marketing didn't surface enough detail): Aimharder, Boxmagic, CrossHero, WodBuster, XCORE, Gymforce, FITMA, GYMmx.

**Verdict on the differentiator: partially validated, not clean-kill.** The claim "we're the only one with a genuinely per-gym-branded member app" is false as a blanket statement — EVO and Glofox both claim it as standard. But the claim **"most competitors in the price band this product actually competes in (Mexican-native, $500–$2,000 MXN/mo) do NOT ship a branded app as standard — it's either absent, an unpriced/unconfirmed feature, or a premium upsell reserved for chains"** is well-supported: Trainingym and Fitco explicitly gate it above their entry tiers, and no Mexican-native vendor in this scan (Gym&i, Connect Gym, Gymforce, Klasius, FITMA) was found to advertise true white-labeling at their base/mid price point. This product offering white-label architecturally (one deployment, brand-by-hostname) at whatever price point it lands is a real structural difference from the segment it's actually priced against — just not from EVO or Glofox, who play in a different price/scale tier.

### Is "no cut of member payments" a real differentiator?

**Real against the international/premium tier, matched by some Mexican-native tools.** Mindbody and Glofox both monetize meaningfully through payment processing (Glofox built "Glofox Payments" on Stripe Connect specifically as a revenue product [stripe.com/customers/glofox]; Mindbody's marketplace-transaction commissions are confirmed to exist though the exact % was not published in any source found in this scan [search result citing mindbodyonline.com/Wikipedia]). AgendaPro explicitly charges a **2.29%+IVA transaction fee** on top of its subscription for its payment-terminal add-on [agendapro.com/mx/planes, fetched] — a directly confirmed example of a Mexico-focused competitor taking a payment cut. On the other hand, **Gym&i explicitly markets "0% comisión de plataforma"** [gymni.mx] and Connect Gym's Stripe/SPEI integration is described as flat-fee with no commission language found — so "no cut" is not unique in the Mexican-native tier, but it is a real, confirmed point of difference against AgendaPro (2.29%+IVA), and inferred (not fully confirmed) against Mindbody/Glofox.

### What do Mexican gym owners still do in Excel/WhatsApp/paper?

Evidence found is indirect but consistent: multiple vendor/comparison sites explicitly sell "migrar de Excel y WhatsApp a un software profesional sin perder tus datos" as a stated use case, implying it's a live starting point, not a strawman [search result summary citing connectgyms.com and related]. A dedicated free "Plantilla de Control de gimnasios en Excel" template site exists and frames Excel as a legitimate, common starting tool before a gym "grows and gains more clients" [es.justexw.com/plantillas/control-de-gimnasios-en-excel]. Klasius's own marketing states studios lose "15-22% monthly" to delinquency from relying on "sistemas de cobro anticuados," implying manual/ad hoc collection (i.e., WhatsApp reminders + manual tracking) is still common enough to be Klasius's core sales pitch [klasius.com/blog/automatizar-cobro-membresias-mexico-spei-oxxo-tarjetas]. **No direct survey, Reddit thread, or Facebook-group post was found and confirmed quantifying what fraction of Mexican gyms use Excel/WhatsApp/paper today** — this is inferred from vendor sales-pitch framing (multiple independent vendors all pitching "migrate from Excel/WhatsApp" strongly suggests it's a real, large segment) rather than directly measured. Treat "no software" as a plausible major competitor for the smallest gyms, but unquantified.

## Confidence and gaps — what could not be verified

- **No pricing found at all** (quote-gated, confirmed via direct fetch or repeated search failure) for: Trainingym, Aimharder, Boxmagic (centrally), XCORE, WodBuster, CrossHero (LatAm-specific), EVO/ABC Evo, Glofox, FITMA, Gymforce (only a single-tier figure found, no full tier table), GYMmx (only cited via a vendor-biased secondary source).
- **Secondary-source-only pricing (unverified against the vendor directly)**: Klasius ($999 MXN/mo, cited only via a competitor comparison site), Crossfy (USD 50–130/mo, cited only via Crossfy's own blog), Wodify ($149–198 USD/mo, cited only via a third-party comparison), Trainingym's "$1,500+ MXN/mo, 2%+$6 MXN txn fee" (cited only via Gym&i's own competitor-comparison blog — high bias risk since Gym&i competes directly with Trainingym).
- **White-label status unconfirmed** for 8 of 18 vendors (Aimharder, Boxmagic, CrossHero, WodBuster, XCORE, Gymforce, FITMA, GYMmx) — marketing pages did not surface enough detail either way; this is an absence of evidence, not evidence of absence.
- **No independent (non-vendor, non-competitor-authored) install-base or revenue figures** were found for any Mexican-native vendor (Gym&i, Connect Gym, Gymforce, FITMA, Klasius) — all scale claims in this report for those five are either self-reported or absent.
- **Reddit/Facebook gym-owner-group discussion**: search surfaced no accessible direct threads (Facebook groups are not indexed/reachable by this method); the Excel/WhatsApp/paper claim rests on vendor sales-pitch framing, not owner testimony, and should be treated as suggestive, not proven.
- **Review-site coverage was uneven**: Capterra/App Store complaint data was obtained for Trainingym, Fitco, Boxmagic, and AgendaPro only; the remaining 14 vendors either had no reviews surfaced by search or reviews were not fetched in this pass.
- **This product's own feature set** was described by the task brief, not independently verified in this scan against any competitor's live product via hands-on trial — all "gap" claims favoring this product are relative to competitors' *public marketing*, which may understate or overstate their actual shipped capability.
- **Currency/date sensitivity**: all MXN figures are as published/found on 2026-07-29; several vendors (AgendaPro per its own reviews, and generally) are reported to raise prices periodically, so treat these as a snapshot, not a stable long-run price.
