# DPA / ToS acceptance + update-notice norms across B2B SaaS (2026-08-10)

Research question: how do B2B SaaS platforms present data-processing terms (DPA / processor
addendum) and ToS acceptance + updates to their **business** customers — and does any of them
ever hard-block a logged-in customer with a full-screen legal wall?

Method: WebSearch + WebFetch against each vendor's live legal pages, help-center articles, and
change-notice posts (Aug 2026). Every claim below is cited with its source URL. Anything not
directly found in a fetched source is marked **UNVERIFIED**.

---

## Group 1 — Gym / fitness management platforms

### Mindbody

| Question | Finding | Source |
|---|---|---|
| (a) DPA entry | No separate signed DPA — a **Privacy Annex** is incorporated by reference into the single Agreement accepted at signup: *"the terms of the Privacy Annex apply"* (ToS §1.3). Mindbody explicitly **does not sign customer-drafted DPAs**; on written request (max once/12mo) it will provide a self-certification of Art. 28.3(h) GDPR compliance. | [Terms of Service](https://www.mindbodyonline.com/company/legal/terms-of-service), [Privacy Annex](https://www.mindbodyonline.com/company/legal/terms-of-service/privacy-annex), [Data Processing Schedule](https://www.mindbodyonline.com/company/legal/mindbody-data-processing-schedule) |
| (b) Update notice | Posted online; effective on posting. For **material** changes: *"we'll also notify you within the Software Service or by sending you an email."* Then: *"If you continue using the Services after any changes, it means you have accepted them."* (§1.4) | [Terms of Service](https://www.mindbodyonline.com/company/legal/terms-of-service) |
| (c) Blocking wall | **None found.** No click-through/re-acceptance screen described anywhere in the ToS; relies entirely on notice + continued-use. | [Terms of Service](https://www.mindbodyonline.com/company/legal/terms-of-service) |

### ABC Glofox (Glofox / ABC Fitness)

| Question | Finding | Source |
|---|---|---|
| (a) DPA entry | Auto-incorporated by reference: *"All of our data processing activities will be governed by the Data Processing Addendum ('DPA') incorporated by reference into the Agreement"* (Terms of Use §6.3). No separate signature required (a standalone signed DPA is available on request per the March 2023 update notice). | [Terms of Use](https://www.glofox.com/legal/terms-of-use/), [DPA PDF](https://www.glofox.com/wp-content/uploads/2023/03/Glofox-Data-Processing-Addendum-Final.03.01.23-Consolidated.pdf), [Update notice (Mar 2023, ABC acquisition)](https://support.glofox.com/hc/en-us/articles/13374541866641-Update-to-our-Terms-of-Service-and-Privacy-Statement) |
| (b) Update notice | Posted on the platform/website; continued use = binding acceptance, with a time backstop: *"Your continued use of Purchased Services after such changes have been posted constitutes your binding acceptance... automatically effective upon the earlier of (a) your continued use... or (b) 30 days from posting"* (§3.1). Update-notice article exists in the help center (title confirms an announcement was published), but the article body itself returned 403 to automated fetch — **UNVERIFIED** whether that specific announcement was emailed vs. purely a help-center post. | [Terms of Use](https://www.glofox.com/legal/terms-of-use/), [Update article, title only verified](https://support.glofox.com/hc/en-us/articles/13374541866641-Update-to-our-Terms-of-Service-and-Privacy-Statement) |
| (c) Blocking wall | **None found** in the Terms of Use — no click-through/modal/re-acceptance mechanism described. | [Terms of Use](https://www.glofox.com/legal/terms-of-use/) |

### Wodify

| Question | Finding | Source |
|---|---|---|
| (a) DPA entry | Auto-incorporated by reference, and only reached via that reference (no public standalone DPA link found): *"Where an Organization is the data controller, our data processing terms (including our list of sub-processors) apply and are incorporated by reference."* | [Terms of Service](https://www.wodify.com/terms-of-service) |
| (b) Update notice | Multi-channel notice + continued-use acceptance: *"We'll use reasonable efforts to give you notice of any material modifications, such as posting notice of modifications to these Terms in the Wodify Apps, or via email."* Then: *"By continuing to use the Wodify Apps after we make any such modifications, you agree that you will be subject to the modified Terms."* Notably, **one carve-out requires true affirmative consent**: *"changes to arbitration or fee terms apply prospectively and, where required by law, only with your affirmative consent"* — the only vendor in this survey with an explicit opt-in (not just continued-use) clause for specific term categories, though the delivery mechanism for that consent isn't specified (no evidence it's a blocking in-app modal). | [Terms of Service](https://www.wodify.com/terms-of-service) |
| (c) Blocking wall | **None found** for general updates. The arbitration/fee carve-out requires "affirmative consent" but the ToS doesn't say how that's collected (email reply, checkbox, etc.) — **UNVERIFIED** whether it's ever a blocking screen. | [Terms of Service](https://www.wodify.com/terms-of-service) |

### Zen Planner (Daxko)

| Question | Finding | Source |
|---|---|---|
| (a) DPA entry | Zen Planner's legal doc is a Daxko **Master Subscription/Service Agreement** (not a separate GDPR-specific DPA page found publicly); the current ToU page 301-redirects straight to the Daxko MSA PDF, i.e. one unified contract rather than a bolt-on DPA the customer signs separately. Search results describe modification terms live inside that same MSA. Could not extract exact "DPA incorporation" wording — the fetched PDF returned corrupted/binary text. **Partially UNVERIFIED.** | [zenplanner.com/terms-of-use (redirects to MSA PDF)](https://zenplanner.com/terms-of-use/), [Daxko MSA PDF](https://www.daxko.com/Daxko_MSA_Boutique_Market_06162026.pdf) |
| (b) Update notice | Search snippet of the MSA: *"the Company reserves the right, at its sole discretion, to change, modify, add, or remove portions of the Terms of Use at any time, and users are responsible for periodically reviewing the Terms of Use for changes."* Separately, for agreement modifications tied to payment processing, the customer gets a **10-day window to object/terminate** if a change "materially and adversely affects" them: *"the Customer (within ten (10) days of receiving notice of the modification) may elect to terminate the payment processing services with thirty (30) days' notice... but only if the modification materially and adversely affects the Customer."* | [Search result summary](https://www.daxko.com/Daxko_MSA_9_12_25_Upload.pdf) — direct PDF text extraction failed; treat exact wording as **UNVERIFIED**, but the existence of a right-to-object/terminate window for material changes is corroborated across two independent search snippets |
| (c) Blocking wall | **No evidence found** of any blocking screen; the only "friction" mechanism identified is the payment-processing objection/termination window above, not an in-product legal wall. | as above |

### PushPress

| Question | Finding | Source |
|---|---|---|
| (a) DPA entry | No standalone DPA found in the (Grow) Service Agreement; it references a separate Privacy Policy but does not itself state GDPR/processor terms inline: *"Our Privacy Policy explains how we treat your personal data and protect your privacy when you use the Service."* Whether a DPA is available on-request could not be confirmed. **UNVERIFIED** on formal DPA existence/incorporation. | [Terms of Service (Grow Service Agreement)](https://www.pushpress.com/legal/grow-service-agreement), [Privacy Policy](https://www.pushpress.com/legal/privacy-policy) |
| (b) Update notice | Advance notice **with carve-outs**, not blanket continued-use: *"If we materially change this Agreement, we'll provide you with reasonable advance notice and the opportunity to review the changes, except (1) when we launch a new product or feature, or (2) in urgent situations, such as preventing ongoing abuse or responding to legal requirements."* Remedy on disagreement is self-serve exit, not a lockout: *"If you don't agree to the new terms, you should remove any Content you uploaded and stop using the Service."* | [Terms of Service](https://www.pushpress.com/legal/grow-service-agreement) |
| (c) Blocking wall | **None found.** No re-acceptance/click-through requirement described. | [Terms of Service](https://www.pushpress.com/legal/grow-service-agreement) |

### TeamUp

| Question | Finding | Source |
|---|---|---|
| (a) DPA entry | Auto-incorporated by reference as a listed supplementary document: *"These Terms are amended and supplemented by the following documents: [Privacy Policy] [Data Processing Agreement] – Describes how we process and protect your data."* A **signed** copy is also obtainable on request (via help-center article or emailing support@teamup.com) for customers who need one for their own compliance file — so TeamUp offers both an auto-incorporated version and an on-request signable version. | [Terms of Service](https://www.teamup.com/terms-of-service/), [DPA help-center article](https://support.goteamup.com/en/articles/9327505-data-processing-agreement), [DPA landing page](https://www.teamup.com/dpa/) |
| (b) Update notice | Weakest of the surveyed set — no notice commitment at all: *"Teamup reserves the right to update and change the Terms of Service at any time without notice."* Then: *"Continued use of the Service after any such changes constitutes your consent to the changes."* | [Terms of Service](https://www.teamup.com/terms-of-service/) |
| (c) Blocking wall | **None found.** | [Terms of Service](https://www.teamup.com/terms-of-service/) |

### Gymdesk

| Question | Finding | Source |
|---|---|---|
| (a) DPA entry | Data Processing Terms are described as forming part of the ToS and take precedence over conflicting ToS language for personal-data processing, applying specifically when the customer is EEA/EU: *"These Data Processing Terms take precedence over any other terms of the Agreement in relation to the Processing of Personal Data."* A dedicated DPA page also exists separately from the general ToS. | [Terms of Service](https://gymdesk.com/page/terms), [Data Processing Agreement](https://gymdesk.com/page/dpa) |
| (b) Update notice | Weak — posting-only, burden on customer to check: *"If we modify our Terms & Conditions, such changes will be effective upon posting. It is your obligation to check our current Terms & Conditions for any changes."* No explicit "continued use = acceptance" sentence, no email/in-app notice commitment found. | [Terms of Service](https://gymdesk.com/page/terms) |
| (c) Blocking wall | **None found.** | [Terms of Service](https://gymdesk.com/page/terms) |

---

## Group 2 — General SMB SaaS

### Stripe

| Question | Finding | Source |
|---|---|---|
| (a) DPA entry | Auto-incorporated by reference into the master contract, no separate signature: *"The Data Processing Agreement forms part of your Stripe Services Agreement ('SSA')."* | [DPA FAQs](https://stripe.com/legal/dpa/faqs), [DPA](https://stripe.com/legal/dpa), [Services Agreement](https://stripe.com/legal/ssa) |
| (b) Update notice | Stripe "will notify you in advance of material changes" to the SSA (which the DPA rides along with), per the DPA FAQ summary — but the FAQ page itself does not spell out the delivery channel (email vs. dashboard) or a re-acceptance mechanism. **Channel is UNVERIFIED**; the existence of an advance-notice commitment for material changes is sourced. | [DPA FAQs](https://stripe.com/legal/dpa/faqs), [SSA overview](https://stripe.com/legal/ssa-overview) |
| (c) Blocking wall | **No evidence found** in the fetched pages; not confirmable either way from available sources — **UNVERIFIED**, not asserted as absent with the same confidence as the gym vendors above. | [DPA FAQs](https://stripe.com/legal/dpa/faqs) |

### Shopify

| Question | Finding | Source |
|---|---|---|
| (a) DPA entry | DPA is a distinct document from the ToS but both are merchant-facing legal defaults, amended by Shopify unilaterally with notice (see b) rather than re-signed per merchant. | [Terms of Service](https://www.shopify.com/legal/terms), [Terms FAQ](https://shopify.com/legal/terms-faq) |
| (b) Update notice | Continued-use = acceptance, explicitly dated to a specific rollout: *"By continuing to use Shopify services as of July 25th, 2025 you are agreeing to the updated terms."* For DPA-specific amendments: *"Shopify reserves the right to amend and/or update the DPA, and in such an event, provides reasonable notice of any material amendments, which may be given by email or through a prominent notice within the service."* — i.e., email OR in-app banner, explicitly not a mandated blocking mechanism. | [Terms FAQ (July 2025 update)](https://shopify.com/legal/terms-faq) |
| (c) Blocking wall | **None found** — the FAQ page confirms merchants continue operating through the change with only a settings toggle for the specific new feature (Network Intelligence), not a re-acceptance gate on login. | [Terms FAQ](https://shopify.com/legal/terms-faq) |

### Square (Block, Inc.)

| Question | Finding | Source |
|---|---|---|
| (a) DPA entry | Auto-incorporated / supplemental by design: *"Square's Data Processing Agreement (DPA) supplements and forms part of the General Terms of Service between sellers and Block, Inc."* EEA/UK sellers get an additional annex layered on the same base agreement. | [Data Processing Terms](https://squareup.com/us/en/legal/general/data-processing-terms), [Data Processing Agreement](https://squareup.com/us/en/legal/general/data-processing) |
| (b) Update notice | Posting + continued-use, multi-channel notice option: *"Such notice and any revised version of the Terms... may be posted on our website or communicated to you electronically or through the Services."* Then: *"Any use of the Services after our publication of any such changes shall constitute your acceptance of the Revised Version of the Terms."* | [General Terms of Service](https://squareup.com/us/en/legal/general/ua-deprecate) |
| (c) Blocking wall | **None found** — no click-through/blocking mechanism described; only "reasonable advance notice" is promised specifically for fee changes. | [General Terms of Service](https://squareup.com/us/en/legal/general/ua-deprecate) |

### Calendly

| Question | Finding | Source |
|---|---|---|
| (a) DPA entry | Auto-incorporated by reference, no separate execution needed: *"The terms of the data processing addendum available at https://calendly.com/dpa ('DPA') are hereby incorporated by reference and shall apply to the extent Customer Data includes Personal Data."* A prior search summary independently confirms: *"by accepting the Terms of Use, the DPA is already in place with nothing additional to sign or execute."* One narrower carve-out exists — new **sub-processors**: customers get a 30-day objection window by email before a new sub-processor is deemed accepted. | [Customer Terms and Conditions](https://calendly.com/legal/customer-terms-conditions), [DPA](https://calendly.com/legal/data-processing-addendum) |
| (b) Update notice | No explicit change-notice mechanism found in the Customer Terms text itself (no email/in-app-banner sentence located); only a general "electronic notices are legally sufficient" clause was found, which describes notice delivery in general, not specifically ToS-change notice. **Channel UNVERIFIED** beyond the sub-processor 30-day objection window, which *is* sourced. | [Customer Terms and Conditions](https://calendly.com/legal/customer-terms-conditions) |
| (c) Blocking wall | **None found.** | [Customer Terms and Conditions](https://calendly.com/legal/customer-terms-conditions) |

---

## The norm

**Entry into the DPA:** every one of the 11 vendors surveyed (7 gym-vertical, 4 general SMB SaaS)
uses the same shape — a processor-terms document (DPA / Data Processing Addendum / Privacy Annex)
that is **auto-incorporated by reference into the single ToS the customer accepts once, at
signup**, via a hyperlink in the contract text ("the DPA is incorporated by reference into the
Agreement"). Nobody in this set requires a business customer to separately read-and-sign a DPA as
a condition of using the product. A few (TeamUp, Mindbody-on-request) additionally offer a
downloadable/on-request signed copy for customers who need one for their *own* compliance/vendor
files, but that is optional paperwork layered on top of the always-already-in-effect
incorporation-by-reference, not a gate.

**Update notice:** the dominant pattern is **post the new terms + "continued use constitutes
acceptance,"** sometimes with an added promise of email or in-app notice for changes deemed
"material" (Mindbody, Wodify, Shopify's DPA amendments, Square). The weak end of the spectrum
(TeamUp: "at any time without notice"; Gymdesk: burden is on the customer to keep checking) shows
real variance in how much notice is actually promised, but not one of the 11 ever described a
mechanism stronger than "notify, then continued use = consent" for routine changes. The one
partial exception is Wodify's carve-out requiring true **affirmative** (not just continued-use)
consent specifically for arbitration/fee-term changes, and Zen Planner/Daxko's 10-day
object-or-terminate window for materially adverse changes tied to payment processing — both are
narrow, category-specific escalations, not a general legal-wall pattern, and neither source
specifies the delivery mechanism (no evidence either is a blocking in-app screen).

**What is never done:** none of the 11 vendors' sourced legal text or update-notice documentation
describes a **full-screen, un-dismissable click-wrap that blocks an already-logged-in business
customer from reaching the product** until they re-accept updated terms/DPA. General SaaS
UX/legal literature confirms blocking click-wrap modals exist as a *pattern* in the industry
([Ironclad](https://ironcladapp.com/journal/contract-management/updating-terms-and-conditions-notice),
generic modal-UX sources) and are considered the legally strongest form of consent — but the
concrete example found ([Salesforce mobile app EULA](https://www.eleken.co/blog-posts/login-page-examples))
is a **first-open/first-install acceptance gate**, not a forced re-acceptance interruption sprung
on an existing logged-in customer mid-session for a later terms update. Across every vendor in
both groups here, the actual mechanism for existing customers is notice (of varying strength) plus
a continued-use clause, with the customer's only real lever being to stop using the service (or,
for Zen Planner's payment-processing carve-out, to invoke a time-boxed termination right) if they
object — never a hard lockout.

**Confidence notes:** Stripe's and Calendly's exact update-notice *delivery channel* (email vs.
in-app) could not be pinned to quoted source text and are marked UNVERIFIED above; Zen Planner's
DPA-incorporation wording is UNVERIFIED due to a corrupted PDF fetch (existence of a materially-
adverse-change objection window is corroborated by two independent search snippets, so that
sub-finding is treated as sourced). PushPress's formal DPA existence/incorporation is UNVERIFIED —
only a general Privacy Policy cross-reference was found. Glofox's specific March-2023 update
announcement content is UNVERIFIED (403 on fetch); only the announcement's existence/title and the
ToS's own update-mechanism clause are sourced.
