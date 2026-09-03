# The standard for reconciling a staff-created member with a member-created account

**Research seat — 2026-09-03.** Question: how do established gym/studio booking platforms reconcile a
STAFF-CREATED member record with a MEMBER-CREATED account, and what is the standard flow for
"gym sells a package at the desk → member gets app access"?

Method: vendor help-center docs pulled as primary text (Zendesk/Intercom article APIs where the
rendered page blocked fetching), Supabase/Clerk/Auth0 developer docs, and public issue trackers.
Everything below is attributed. **No recommendation is made — the owner rules.** Marketing pages are
tagged `[MARKETING]` and are not used as evidence.

Source-quality note: Mindbody's and Zen Planner's (Daxko) help centers are Salesforce Lightning apps
that render client-side and could not be fetched directly; their rows rest on search-engine-surfaced
quotations of those same articles and are marked **[SNIPPET]**. Every other vendor row was pulled as
full article text and is marked **[FETCHED]**.

---

## 1. Per-vendor matrix

| Vendor | Who creates the member record | How the member gets app access | Self-signup with the SAME email as an existing staff-created profile | Different email | Code / PIN | Source |
|---|---|---|---|---|---|---|
| **Glofox** [FETCHED] | Either. Staff via dashboard `Add Clients`, **or** the client self-registers via Member App / Web Portal / Kiosk. | **No invite email exists.** The client opens the app and taps **Register** with the same email; that *is* the claim step. | **Auto-merges into the staff-created record.** "The client will need to click register when logging into the Member App or Website Portal for the first time. When they register, they will be asked to create a password for their account, this will then merge into the account created by you from the dashboard." Separately, an ineligible re-registration degrades to reset: "If the Lead does not meet the conditions and attempts to register again: they receive a password reset email instead." | Staff edits the email on the profile, or restores/edits a soft-deleted profile holding the address. Staff may also set a client password directly (`Details → Actions → Change Password`). | None. | [Set up clients from the dashboard](https://support.glofox.com/hc/en-us/articles/46479510311316-How-to-Set-up-Clients-From-the-Dashboard) · [Login after migration](https://support.glofox.com/hc/en-us/articles/46479616834452-How-Clients-Log-In-After-a-Migration) · [Member app / re-registration](https://support.glofox.com/hc/en-us/articles/46433363215636-Member-Information-in-the-Member-App-and-Web-Portal) · [Password reset](https://support.glofox.com/hc/en-us/articles/46432718537876-How-to-Reset-Client-and-Lead-Passwords) |
| **Glofox — staff-side collision** [FETCHED] | — | — | Staff creating a *second* record on a taken email is **hard-blocked**: "the error 'Sorry, this user already exists' will appear if the client already has an account in the system with the same email address. This warning has been added to ensure no duplicate accounts exist in your dashboard, as having duplicates can cause confusion and problems." Also fires for **soft-deleted** clients still holding the address. | Restore the deleted profile and edit it, or edit its email then re-delete to free the address. | — | [Sorry, this user already exists](https://support.glofox.com/hc/en-us/articles/46444793162772-Why-does-it-say-Sorry-this-user-already-exists-when-I-create-an-account) |
| **Wodify** [FETCHED] | Staff only (`People > Clients > Create Client`). No public self-signup door for a gym. | Welcome email → registration link → set password → download app. "Once the new client profile is created, the client will receive your Welcome Email with a link to confirm, set up, and access their new Wodify account." | Same email at a **different** business merges instantly: "Click the registration link. Our system will merge your profiles instantly!" Docs actively *encourage* email reuse: "We actually encourage you to use the same email address so that you can have your historical performance data!" | **Refused within one business**: "Multiple accounts at the same business cannot be merged." | None for login. Dependents get a `Dependent (no Wodify login)` flag — a record with no auth identity at all. | [Activate your account](https://help.wodify.com/hc/en-us/articles/360054958234-Activate-Your-Wodify-Account) · [Merge your accounts](https://help.wodify.com/hc/en-us/articles/360059851073-Merge-Your-Wodify-Accounts) · [Create the client profile](https://help.wodify.com/hc/en-us/articles/221913728-Create-and-Navigate-the-Client-Profile) |
| **TeamUp** [FETCHED] | Staff adds the customer; a consumer-owned TeamUp account is portable across businesses. | Email invite with a **unique per-customer link**: "When you add a customer, they will receive an email invite to complete the creation of their account with TeamUp." The roster row carries an **`Unclaimed` pill** until accepted; staff can `Resend Invite Email` or `View Invitation Link` and paste it themselves. "Once the profile is linked by the customer this link will no longer appear." | Explicit error + documented triage: "A customer with that email address already exists" → means they exist at your business (check `All Customers`; if `unclaimed`, resend the invite) **or** at another TeamUp business. Cross-business remedy is **log in, don't sign up**: "Instruct the customer to enter their same email and password they use at the other business into your business' login screen. This will take them through the set up process at your business." | Staff-run merge: "you can let the business know, and ask them to merge your accounts into one. Let them know which email address you'd like to keep." Editing the email of a *claimed* account re-issues the invite: "they will need to accept the invitation to manage their account again at the new email address." | None. Two people cannot share an address — the documented workarounds are family accounts (dependants have no login) or Gmail plus-addressing. | [Add a customer](https://support.goteamup.com/en/articles/9327565-add-a-customer) · [Email already exists](https://support.goteamup.com/en/articles/9327772-why-am-i-seeing-an-account-associated-with-this-email-already-exists) · [Resend an invitation](https://support.goteamup.com/en/articles/9327340-how-to-resend-an-invitation-to-a-customer) · [Connect to a new business](https://support.goteamup.com/en/articles/9327650-connecting-your-customer-account-to-a-new-business) · [Sharing an email](https://support.goteamup.com/en/articles/11603110-can-customers-share-an-email-address) |
| **Mariana Tek** [FETCHED] | Staff (`Find Customer → New Customer`), Biz App, Express App, studio app, or a **QR code / URL** to the signup flow "accessed via studio iPad, or on a customer's phone." | **Staff sets the password at the desk — no claim link.** "You will need to set a password for the customer. Please recommend that your customers reset their passwords the first time they log into their accounts." | Blocked at creation ("This email address is already associated with an account"). | First-class **Potential Duplicates** detection + `Merge and Archive`. Duplicates are matched on "the full name and either a phone number, address, OR postal code" — deliberately *not* on email. Merge is irreversible and heavily preconditioned (both accounts need a home location; the kept account needs a valid card; two active memberships or two future reservations in the same session block the merge; employee accounts can never merge). The archived account's "email address will no longer be active." | None for login; QR only as a link carrier. | [Create a customer](https://support.marianatek.com/en/articles/1987729-how-do-i-create-a-new-customer-account) · [Merge accounts](https://support.marianatek.com/en/articles/3432997-how-can-i-merge-customer-accounts) · [Why can't I merge](https://support.marianatek.com/en/articles/3512976-why-can-t-i-merge-an-account) · [ClassPass account creation](https://support.marianatek.com/en/articles/6956593-how-can-i-easily-allow-my-classpass-customers-to-create-a-mariana-tek-account) |
| **PushPress** [FETCHED] | Staff adds the person; **or** a `free-to-join` plan landing page auto-creates the profile on self-signup: "When they sign up, a user profile will be automatically created, granting them access to the Members app." | Invite mail on membership assignment: "Members receive an invitation email when they are added to your gym's system, which prompts them to set up their account and password." Re-trigger via `Request personal information` / `Send Profile Set Up Link`. | Not documented as an error path; the vendor's answer is to send the setup/reset link to the existing record. | Merge Member tool; sub-accounts sharing a household address use a `+1` alias. | None for login. Front-desk check-in runs the Staff App in **Kiosk Mode** with no member login at all. | [Invite new members](https://help.pushpress.com/en/articles/12803805-how-can-i-invite-new-members-and-share-access-to-the-pushpress-members-app) · [Login overview](https://help.pushpress.com/en/articles/508425-how-to-pushpress-login-overview-for-admins-coaches-and-members) · [Passwords](https://help.pushpress.com/en/articles/508608-core-members-passwords) |
| **PushPress — password posture** [FETCHED] | — | — | — | — | — | Explicitly the opposite of Mariana Tek: "For security reasons, admins cannot directly reset a member's password, but you can send them a reset link." |
| **ABC Trainerize** [FETCHED] | Staff (`ADD NEW → Client → ADD AND SEND INVITE`), web or mobile (incl. phone-contact import). | Invitation email with a setup link: "Clients will use this link to create a login password, complete their profile, and fill out a consultation form." | Hard-blocked with `"Email Already Taken"`. The documented remedy is **find and re-activate the existing record, never create a second one**: the client "already exists within your 'Pending', 'Deactivated' or 'Basic' client folder" → search by email → `CHANGE TYPE → Activate as coaching`. | Same folder-search + change-type path; separate resend-invite / reset-password action. | None. | [Email already taken](https://help.trainerize.com/hc/en-us/articles/26387531877908--Email-Already-Taken-Error-when-Adding-a-Client) · [Add clients](https://help.trainerize.com/hc/en-us/articles/208689066-How-To-Add-Clients-To-ABC-Trainerize) · [How clients log in](https://help.trainerize.com/hc/en-us/articles/211162663-How-Do-Clients-Login-to-ABC-Trainerize) |
| **Gymdesk** [FETCHED] | Staff-run sign-up form at the front desk, an embedded web form, or an `invite` button that emails a prospect a link to a chosen sign-up form (optionally pre-selecting a membership). | Member sets email + password during the sign-up form itself; staff can later push access with `Send Access` from the member profile. | Not documented as an error; `Merge duplicates` exists for member/lead records. | `Merge duplicates`. | **Yes — the only real code in the set, and it is not for login.** "The check-in code allows quick check-in for members at the front-desk. If you don't enter a value, one will be generated automatically." | [Member portal & app access](https://docs.gymdesk.com/en/help/docs/member-portal-access-and-login) · [Member sign-up](https://docs.gymdesk.com/en/help/docs/member-signup) |
| **Mindbody** [SNIPPET] | Two-tier by design: the **business** owns a client profile; the **consumer** owns a separate Mindbody account (Consumer Identity). They are joined by email. | Consumer creates/holds their own Mindbody account and links it to the studio profile; staff can push `Manage Account → Email Mindbody Account Link`, "which sends the client a secure link to update their email and other account details." Updating an unverified email makes "the client receive an email prompting them to verify their email and set up their account." | Because "Mindbody links a client's account to a site based entirely on the email address provided, this can result in the client unknowingly creating a duplicate account that is not linked to the client's real profile and does not display any of their passes." | `Merge Duplicate Clients` tool + `Locate Duplicate Accounts` tool; gated on a `Merge duplicate/Unmask client records` permission. "If merging a verified and unverified email, it's recommended to keep the verified email active." | None. | [Consumer Identity FAQ](https://support.mindbodyonline.com/s/article/Consumer-Identity-FAQ) · [Merge Duplicate Clients tool](https://support.mindbodyonline.com/s/article/203259603-Merge-Duplicate-Clients-tool) · [Client can't book or find passes](https://support.mindbodyonline.com/s/article/224376567-My-client-can-t-book-with-the-MINDBODY-app) |
| **Zen Planner (Daxko)** [SNIPPET — thin] | Staff/owner. "Only your gym's owner or manager can provide login credentials to members." | Credential delivery by email: "Members provide a valid email address during signup, and their password will be emailed to them automatically, though some gyms allow you to create your password at the time of setup." | Not documented publicly. | Not documented publicly. | None found. | [Give members access to Zen Planner](https://help.daxko.com/s/article/ZEN-PLANNER-How-Do-I-Give-Members-Access-to-Zen-Planner) |
| **ClassPass** (as seen through the Mariana Tek integration) [FETCHED] | A **third party** creates the reservation, and the studio must "convert" the person into a real customer afterwards. | Studio drives account creation after the fact (QR/URL/desk). | In UK/EU the collision cannot even be detected: "For ClassPass reservations at UK and EU studios, customer information is not passed to Mariana Tek. This includes the customer's email address. Due to GDPR, this is not something that can be changed. Your studio will need to convert the customer and collect the information in the studio." | Manual conversion + the standard Potential Duplicates merge. | None. | [Missing ClassPass customer info](https://support.marianatek.com/en/articles/9123974-why-is-customer-information-missing-for-classpass-reservations) |

---

## 2. The convergent pattern

Across the nine vendors with usable documentation the design converges on one shape: **the business
creates the member record first and that record is the system of record; the member never creates the
roster row, they only ever *claim* it; the claim is carried by email, which is treated as a globally
unique key; and a claim attempt against an already-existing address is degraded into a login or a
password-reset rather than being allowed to produce a second record.** Every vendor in the set enforces
email uniqueness at the point of creation rather than tolerating a duplicate and reconciling later —
Glofox ("Sorry, this user already exists"), Mariana Tek ("This email address is already associated with
an account"), TeamUp ("A customer with that email address already exists"), Trainerize ("Email Already
Taken") all return a hard error, and in three of those four the *documented remedy is to go find the
existing record and act on it* (resend the invite, re-activate the client type, restore the soft-deleted
profile) rather than to create anything new. The roster row's claim state is made visible to desk staff
as a first-class field — TeamUp's `Unclaimed` pill, Trainerize's `Pending` folder, Mindbody's
linked/not-linked indicator — so that "this member has a package but no app account yet" is a status a
non-technical employee can see and act on, not an invisible condition. **Converging: Glofox, Wodify,
TeamUp, PushPress, Trainerize, Gymdesk, Mindbody, Zen Planner (8).** **Deviating on the access step:
Mariana Tek** alone has staff type the member's password at the desk and skip the claim link entirely
("You will need to set a password for the customer"), which PushPress documents as forbidden on its own
platform ("For security reasons, admins cannot directly reset a member's password"). **Deviating on the
door count: Glofox** alone has no invite email at all — the public **Register** door *is* the claim
door, and registering with a matching address merges into the staff-created record ("this will then
merge into the account created by you from the dashboard"). Glofox is therefore the only vendor whose
documented design already assumes what our members actually do: self-register first, and expect the
desk's package to be waiting for them. **Deviating on identity ownership: Mindbody** is the only
two-identity model (business profile vs consumer-owned account), and is also, by its own help-center
admission, the one that most visibly leaks duplicates. **Deviating on merge scope: Wodify** merges
across businesses on matching email but flatly refuses within one business ("Multiple accounts at the
same business cannot be merged"), while **Mariana Tek** inverts the join key entirely and matches
duplicates on "the full name and either a phone number, address, OR postal code" — never on email,
because email uniqueness is already guaranteed upstream.

---

## 3. The Supabase primitives that implement that pattern

Exact API names, exact defaults, doc URLs. Anything the docs would not confirm is marked.

### 3.1 Pre-create a user (the "invite = pre-created user" half)

- **`supabase.auth.admin.inviteUserByEmail(email, { data, redirectTo })`** — "Sends an invite link to an
  email address." Creates the `auth.users` row and mails the **`invite`** template (default subject
  *"You've been invited"*), which "Contains a link for the invited user to accept the invitation and
  create their account." `redirectTo` populates `{{ .RedirectTo }}`.
  <https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail> ·
  <https://supabase.com/docs/guides/local-development/customizing-email-templates>
  On an address that already exists it fails with HTTP **422**; the governing error codes are
  **`email_exists`** ("Email address already exists in the system.") and **`user_already_exists`**
  ("User with this information (email address, phone number) cannot be created again as it already
  exists."). *Which of the two fires for `inviteUserByEmail` specifically is not stated in the docs.*
  <https://supabase.com/docs/guides/auth/debugging/error-codes>

- **`supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata, app_metadata })`**
  — the silent provisioning primitive: it creates the user and **sends no mail**. "If the user has a
  confirmed email address or phone number, set `email_confirm` or `phone_confirm` to `true`."
  `raw_app_meta_data` is the field "the user should not be able to update (e.g pricing plan, access
  control roles)"; both metadata blobs land in the JWT.
  <https://supabase.com/docs/reference/javascript/auth-admin-createuser> ·
  <https://supabase.com/docs/guides/platform/migrating-to-supabase/auth0>

- **`supabase.auth.admin.generateLink({ type, email, ... })`** — "Generates an email link for a specific
  action **without sending it**. This is useful for custom admin functionality where you want to build
  the email or OTP flow yourself." `type` ∈ `signup` · `invite` · `magiclink` · `recovery` ·
  `email_change_current` · `email_change_new`. *The docs do not state per-type whether the user must
  already exist or whether the call creates one — NOT CONFIRMED IN DOCS.*
  <https://supabase.com/docs/reference/javascript/auth-admin-generatelink>

### 3.2 What happens when the member comes through the public door instead

- **`supabase.auth.signUp()` on an existing address** — "Be aware that if a user account exists in the
  system you may get back an error message that attempts to hide this information from the user."
  <https://supabase.com/docs/reference/javascript/auth-signup>
  The identity-linking FAQ is blunter: "If you try to create an email account after previously signing
  up with OAuth using the same email, you'll receive an **obfuscated user response with no verification
  email sent**. This prevents user enumeration attacks."
  <https://supabase.com/docs/guides/auth/auth-identity-linking>
  This is deliberate and closed **"not planned"** upstream — `supabase/gotrue-js#513`, reported as "if i
  try to sign up with an email already registred, i have no error. Instead, I receive an user object as
  if I had created my account." <https://github.com/supabase/gotrue-js/issues/513>
  *The exact obfuscated shape (empty `identities: []`, synthetic `id`) is not documented; treat as
  NOT CONFIRMED IN DOCS.*

- **Automatic identity linking** — "Supabase Auth automatically links identities with the same email
  address to a single user… When a new user signs in with OAuth, Supabase Auth will attempt to look for
  an existing user that uses the same email address. If a match is found, the new identity is linked to
  the user." Guarded on verification: "It would also be an insecure practice to automatically link an
  identity to a user with an unverified email address since that could lead to **pre-account takeover
  attacks**. To prevent this from happening, when a new identity can be linked to an existing user,
  Supabase Auth will remove any other unconfirmed identities linked to an existing user." SAML users are
  excluded from linking entirely. Manual linking is `linkIdentity()` / `unlinkIdentity()` and requires
  the user to already be logged in.
  <https://supabase.com/docs/guides/auth/auth-identity-linking>
  **Scope limit:** the documented auto-link case is OAuth-identity convergence. *Whether a pre-created
  `email`-provider identity auto-links when the same person later runs a password `signUp()` is NOT
  stated in the docs.*

- **`signInWithOtp({ email, options: { shouldCreateUser } })`** — `shouldCreateUser` **defaults to
  `true`**: "If the user hasn't signed up yet, they are automatically signed up by default. To prevent
  this, set the `shouldCreateUser` option to `false`." Same call powers both flavours: "Though the
  method is labelled 'OTP', it sends a Magic Link by default. The two methods differ only in the content
  of the confirmation email sent to the user." — "If the `{{ .ConfirmationURL }}` variable is specified
  in the email template, a magiclink will be sent. If the `{{ .Token }}` variable is specified in the
  email template, an OTP will be sent." OTP expiry is set at `Auth > Providers > Email > Email OTP
  Expiration`; "An expiry duration of more than 86400 seconds (one day) is disallowed to guard against
  brute force attacks."
  <https://supabase.com/docs/guides/auth/auth-email-passwordless> ·
  <https://supabase.com/docs/reference/javascript/auth-signinwithotp>

### 3.3 Rate limits — the numbers behind our 429

<https://supabase.com/docs/guides/auth/rate-limits> · <https://supabase.com/docs/guides/auth/auth-smtp>

- **Built-in email service: 2 messages per hour, project-wide.** "Currently this value is set to 2
  messages per hour." Not per address — a single shared bucket.
- **Custom SMTP: 30 messages per hour by default.** "To protect the reputation of your newly set up
  service a low rate-limit of 30 messages per hour is imposed." Raiseable under
  *Authentication → Rate Limits*.
- **One shared project-wide email bucket spans `/auth/v1/signup`, `/auth/v1/recover`, and `/auth/v1/user`
  (on email change)** — i.e. the invite door and the self-signup door draw on the *same* quota.
- **Per-user cooldown on OTP / magic links: `auth.rate_limits.otp.period`, default 60 seconds**, keyed on
  "last request of the user". The signup-confirmation resend has the same 60 s shape
  (`auth.rate_limits.signup_confirmation.period`), as does password reset
  (`auth.rate_limits.password_reset.period`).
- **IP-limited endpoints** (`/auth/v1/verify`, `/auth/v1/token`, MFA, anonymous signup) are **not
  customizable** and use a token bucket: "Each bucket has a maximum capacity of 30 requests… When rate
  limits are exceeded, a **429 Too Many Requests** error is returned."
- **The error we are seeing**: `over_email_send_rate_limit` — "Too many emails have been sent to this
  email address. Ask the user to wait a while before trying again." HTTP **429**.
  <https://supabase.com/docs/guides/auth/debugging/error-codes>
- **Known upstream sharp edge**: failed signups burn the email quota even though nothing is mailed —
  `supabase/auth#1236`, "Failed signups still count towards the email rate limit even though no user
  record is created and no email ends up being sent, leading to unwarranted `AuthApiError: Email rate
  limit exceeded` errors… nobody can sign up for an account, even if no emails have been sent."
  <https://github.com/supabase/auth/issues/1236>

### 3.4 Hooks — the only documented way to intercept the public door

<https://supabase.com/docs/guides/auth/auth-hooks> ·
<https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook>

Available on Free/Pro: **Before User Created**, **Custom Access Token**, **Send SMS**, **Send Email**.
(MFA-verification and password-verification hooks are Teams/Enterprise.) The Before-User-Created hook
can reject a signup outright: "This hook runs before a new user is created. It allows developers to
inspect the incoming user object and optionally reject the request… If the hook returns an error object,
the signup is denied and the user is not created." Reject shape is
`{"error": {"http_code": 400, "message": "..."}}`. Caveat: "Because the hook is ran just before the
insertion into the database, this user will not be found in Postgres at the time the hook is called."
The shipped worked example is a domain allow-list backed by a lookup table — the same shape as a lookup
against a reserved-address table.

### 3.5 The same pattern outside Supabase (generic identity vendors)

- **Clerk** — invitation carries a ticket: "Once the user visits the invitation link and is redirected to
  the specified URL, the query parameter `__clerk_ticket` will be appended to the URL." Default landing
  auto-verifies: "When a user visits an invitation link, and no custom redirect URL was specified, then
  they will be redirected to the Account Portal sign-up page and their email address will be
  automatically verified." Collision handling is an explicit, **default-off** flag: `createInvitation()`
  takes `ignoreExisting` — "Whether an invitation should be created if there is already an existing
  invitation for this email address, or if the email address already exists in the application." So
  Clerk's default is *refuse to invite an address that already exists*.
  <https://clerk.com/docs/guides/development/custom-flows/authentication/application-invitations> ·
  <https://clerk.com/docs/reference/backend/invitations/create-invitation>
- **Auth0** — invitation = a membership claimed via a ticket URL: "the user will receive an email
  containing a link that will allow them to create an account **or log in and join** the organization,
  optionally with predefined roles"; "The URL has the correct invitation ticket, and org ID and name
  query params." Auth0 also supports generate-URL-only (you own the send), the direct analogue of
  `generateLink`. Its stated linking posture is *more* conservative than Supabase's: "You should not
  automatically link accounts based on the user's emails. Always prompt users to authenticate again
  before doing that."
  <https://auth0.com/docs/manage-users/organizations/configure-organizations/invite-members> ·
  <https://support.auth0.com/center/s/article/Team-invitation-error-user-already-exist>

---

## 4. Post-mortem lessons, ranked by frequency

Counts are the number of distinct on-topic sources exhibiting the cause. Marketing pages excluded.

1. **Invite and self-signup are two uncoordinated user-creation paths (8 sources).** The single most
   common root cause. `devise_invitable`'s own wiki concedes the gem cannot handle it out of the box:
   "If you'd like to send an invitation to a user that has already signed up, but has not been invited
   (in other words, they signed up on their own), then you'll need to customize DeviseInvitable's
   behavior."
   (<https://github.com/scambra/devise_invitable/wiki/Invite-a-Resource-(or-User)-that-Has-Already-Signed-Up-without-Invitation>)
   The failure is not always a duplicate — it can be silent data loss: `devise_invitable#273` reports
   that inviting an existing user wipes their attributes, "It removes all of their attributes and could
   take a whole site down if you make urls based of of names."
   (<https://github.com/scambra/devise_invitable/issues/273>). Clerk shows the mirror-image bug: an
   invited user who *signs in* rather than signing up leaves the invitation `pending` forever
   (<https://github.com/orgs/clerk/discussions/2117>). Keycloak has no native invite feature at all, so
   every such flow on it is bespoke (<https://github.com/keycloak/keycloak/discussions/21477>).
   Also: Auth0, GitLab#33067, `supabase/gotrue-js#513`, Auth0 community org-invite threads.
2. **Email is the sole join key and nothing dedups it (6 sources).** Mindbody states the consequence
   outright — because linking is "based entirely on the email address provided," a member "unknowingly
   creat[es] a duplicate account that is not linked to the client's real profile and does not display
   any of their passes." GitLab#33067 ("new users wants to make 1 user per e-mail") has been an open,
   unshipped merge request for years (<https://gitlab.com/gitlab-org/gitlab/-/issues/33067>). Mariana
   Tek is the notable counter-design: it moves duplicate *detection* off email onto name + phone/postal.
3. **No merge tool, or a merge tool with hard refusals (5 sources).** TeamUp resolves by resend-invite
   or reuse-credentials, never a data merge. Auth0's own support answer is "use the login link instead."
   Mindbody, Mariana Tek, Gymdesk and PushPress did ship merge tools — evidence the problem is common
   enough to fund tooling — but every one of them is staff-run, permission-gated and, in Mariana Tek's
   case, irreversible and blocked by active memberships or overlapping future reservations. The
   engineering-blog view is that merging is not a clean escape hatch: "Would you prompt the user in this
   case to merge their accounts? (tricky to implement and destructive…)"
   (<https://dev.to/ryan/two-conundrums-with-implementing-social-login-5nl>).
4. **Enumeration-prevention hides exactly the signal a legible onboarding UX needs (4 sources).** This is
   a genuine, acknowledged tension, not an oversight. `better-auth#7972` argues from OWASP that
   "sign-up with an existing email should return a 200 with a response body indistinguishable from a
   real sign-up" (<https://github.com/better-auth/better-auth/issues/7972>), while Supabase closed
   `gotrue-js#513` **not planned** on the same reasoning. The gym vendors resolve the tension in the
   opposite direction: they are *first-party desk tools*, so they show staff the plain error ("Sorry,
   this user already exists") and show the member a degraded-but-honest path (password reset).
5. **A single email rate-limit bucket shared across both doors (4 sources).** Documented at 2/hour on
   built-in SMTP, 30/hour on fresh custom SMTP, with a 60 s per-address cooldown; plus the upstream bug
   where failed signups spend quota that was never mailed (`supabase/auth#1236`, `supabase/cli#3353`,
   `supabase/supabase#34222`, `#15804`).
6. **Unverified email trusted for linking (2 confirmed).** Supabase names the attack class outright —
   "pre-account takeover attacks" — and Auth0 warns that "Federated identity providers can make mistakes
   on how they handle email verification and can report that users own an email they do not." Mindbody's
   help center operationalises the same caution at the desk: "If merging a verified and unverified
   email, it's recommended to keep the verified email active."

**What was abandoned / warned against, explicitly:** returning a distinguishing "this email is taken"
error on a *public* signup endpoint (Supabase, closed not-planned; better-auth, open); auto-linking on an
unverified address (Supabase and Auth0 both); merging as a routine reconciliation step rather than a
rare repair (Mariana Tek's precondition wall, Wodify's outright refusal within a business, GitLab's
never-shipped feature).

---

## 5. What has NO standard

Named explicitly, with what was searched.

- **No standard for "the member already self-registered; now attach the desk's package."** Searched:
  vendor help centers for all ten platforms; GitHub issue trackers for supabase/auth, supabase/gotrue-js,
  clerk, keycloak, devise_invitable, django-invitations, better-auth; Auth0 and Clerk community forums;
  Stack Overflow. **No maintainer anywhere states the fix as "match on verified email, auto-link on first
  login."** The closest published pattern is django-invitations' `user_signed_up` signal handler that
  auto-accepts any pending invitation matching the new user's address. Every other source either punts
  to staff intervention or leaves it as an open feature request. Glofox is the only *product* observed to
  implement the auto-attach, and it documents the behaviour without documenting the mechanism.
- **No numeric code or PIN is used as an account-claim credential by any vendor in the set.** Searched
  all ten help centers for code/PIN/QR. Codes exist only for **check-in at the desk** (Gymdesk's
  auto-generated check-in code; PushPress's kiosk mode, which needs no login at all) or as a **carrier
  for a URL** (Mariana Tek's QR to the signup flow). Nobody mails a short code that a member types to
  claim a membership. This is a genuine gap in the reference frame, not a pattern we can copy.
- **No engineering post-mortem exists from the gym vertical.** Mindbody, Glofox, Gymdesk, TeamUp and
  Mariana Tek all ship duplicate-detection or merge tooling — proof they hit this constantly — but not
  one has published a blog post, changelog entry or incident writeup explaining the underlying design.
  All public material is support-desk troubleshooting. Searched vendor blogs, changelogs, status pages.
- **No first-hand operator accounts found.** Searched r/gymowners, r/fitnessbusiness and r/Supabase for
  members-registered-before-the-invite. Returned only app-store listings and unrelated threads. Zero
  usable Reddit sources — the tally above deliberately contains none.
- **No public documentation at all** on this failure mode for Zen Planner, ClassPass (first-party) or
  Arketa; Zen Planner's row above is thin and snippet-sourced only.
- **Supabase gaps, confirmed unanswered in the docs:** whether an `email`-provider identity created by
  `inviteUserByEmail`/`createUser` auto-links when the same person later runs a password `signUp()`;
  the per-`type` user-existence semantics of `generateLink`; the exact shape of the obfuscated signup
  response; and the default OTP validity in seconds.

---

## 6. Ranking the findings against our situation

Our constraints: a solo-dev platform; Mexican gyms; members on phones; desk staff who are not technical;
two live doors (`/activar` invite, `/registro` public); members observed to self-register **first**.

1. **Glofox is the closest analogue we have to a reference implementation, and it is the one vendor
   that deleted the invite email.** It runs the same two surfaces we do (a staff dashboard and a member
   app with a public Register button) and resolves the collision by making Register the claim step that
   merges into the dashboard-created record. It is also the only vendor documenting the *degrade*
   behaviour we lack: an ineligible re-registration "receive[s] a password reset email instead." The
   relevance is direct — a member who self-registers first is Glofox's happy path, not its edge case.
2. **The "unclaimed" state as a visible desk-facing field (TeamUp, Trainerize) is the cheapest thing in
   the whole survey and the one most aimed at non-technical staff.** TeamUp's `Unclaimed` pill plus a
   copyable `View Invitation Link` means a desk employee can see the condition and hand the member a
   link over the counter without email being involved at all — which matters given our documented email
   fragility (non-ASCII address failures, Resend 422s, deliverability).
3. **Every vendor blocks duplicate-email creation at the desk rather than reconciling afterwards.** Four
   of them return a plain error to staff and route to the existing record. This is the opposite of the
   privacy-driven obfuscation Supabase applies on the *public* door, and the split is not a
   contradiction: the desk surface is authenticated and first-party, so it can afford to tell the truth;
   the public surface cannot.
4. **The rate limit is a shared bucket, and that is the mechanical cause of the 429 pattern.** Both our
   doors draw on the same project-wide email quota (2/hour built-in, 30/hour default custom SMTP), with
   a 60 s per-address cooldown, and `supabase/auth#1236` shows failed attempts spending quota silently.
   No vendor in the set sends two emails for one member; every one of them sends exactly one and makes
   it re-sendable on demand.
5. **Mariana Tek's desk-sets-the-password model would suit non-technical Mexican desk staff and members
   on phones — and PushPress documents it as a security anti-pattern on its own platform.** These two
   primary sources contradict each other directly. Worth naming as a live disagreement rather than a
   settled standard.
6. **Nothing in the survey supports a code/PIN claim flow**, so if we want one we are ahead of the
   vertical, not behind it, and cannot borrow a design.
7. **Multi-gym membership is normal and vendors solve it by making the consumer account portable**
   (TeamUp's cross-business dashboard, Wodify's cross-business merge, Mindbody's Consumer Identity).
   Our host→inquilino→marca seam is the same shape; the vendor lesson is that the *account* is portable
   while the *roster row* stays per-business.
