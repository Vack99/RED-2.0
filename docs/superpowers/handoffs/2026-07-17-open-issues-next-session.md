# Handoff — open issues, next session (2026-07-17)

Anchor: `main` @ `25f447a` (pushed → Vercel deploying). #118 and #104 both landed this session.

## Open issues — routing only; read each issue for its spec

| # | Next move |
|---|---|
| **#83** | **Buildable now — start here.** Forge client branding + seed. Terminates at the #88 gate. |
| #88 | Blocked on #83 + owner (Vercel attach + forge-demo walk). |
| #104 | **Code-fixed + shipped** (`25f447a`: dynamic→static `new URL` font trace + regression guard). Only the owner AC is left: once the deploy lands, do a real red-demo sale → confirm the receipt email carries the PNG → close. Not agent-actionable (needs the live Vercel trace; local build can't prove it). Diagnosis + mechanism on the #104 comment. |
| #89 | Blocked on an owner ruling: does a 2nd same-day class consume a 2nd clase? Decide the entitlement semantics before touching code — it bundles two front-desk/Agenda consume edges. |
| #105 | Owner walk to close; the map itself is done. |

Order: #83 → #88 is the agent-buildable path. #104 close, #89 ruling, #105 walk are owner-gated.

## Standing item — not tracked anywhere else

A red-demo test member (cliente `d6844d7d…`) is left **expired on LIVE prod** (`vence 2026-07-10`, ilimitado) from #118 verification. Restore:

```sql
update clientes set vence = '2026-08-14'
where id = 'd6844d7d-c66d-4380-af42-94a356bf7273' and gym_id = 'daa1c888-192b-4cf6-9fc0-023e314a803f';
```

The `mi_membresia` multi-gym follow-up is recorded in #118's close comment.
