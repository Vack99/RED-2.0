# Veronica Barrera −2 correction — applied 2026-08-27 (prod)

Owner ruling: remove 2 phantom charges (she reported 8 attended; system charged 10 as of the
08-27 handoff). Forge's paper list never materialized ("not even the owner has it"); owner
ordered the change on pattern evidence.

Cliente `46f5bf35-71fd-4543-b185-6fffcb41858e`, pack folio 1058 (04-ago 07:12 local, 12 clases,
vence 03-sep). New fact at execution time: she attended again 27-ago 18:29 → 11 charged days,
stored balance 1.

## The two removed marks (pattern outliers)

| asistencia id | fecha/hora | why |
|---|---|---|
| `1f1151c7-1be8-42e9-a7d3-9a63ea605e20` | 11-ago 18:00:00 flat, origen `clase` | operator batch roll-call (exact-zero timestamp, only non-libre mark on the pack), not a door tap |
| `acfec3da-a01c-431a-9204-2fb44b760738` | 04-ago 22:17 libre | 2+h later than every other mark she has ever made (rest 18:00–21:33) |

Removing exactly these two restores her 2/week cadence (06 · 12,13 · 18,19,20 · 25,26 · 27 = 9
attended = her 8 + the new 27-ago visit).

## Applied (single transaction, as postgres, mirrors the RPC undo branch)

- Both asistencias soft-deleted (`deleted_at = now()`).
- Linked walk-in reservation `62f365c9-744b-4f82-81d5-f20ae8a81c80` (was `asistida`,
  consumio=false): → `cancelada`, `cancelled_at = now()`, `checked_at = null`.
- `clases_restantes` +2 → **3** (12 − 9), vence 03-sep unchanged. Verified via RETURNING.

## Rollback (if forge's paper list surfaces and contradicts)

```sql
update asistencias set deleted_at = null
 where id in ('1f1151c7-1be8-42e9-a7d3-9a63ea605e20','acfec3da-a01c-431a-9204-2fb44b760738');
update reservation set status = 'asistida', checked_at = '2026-08-12T00:02:23.59312+00:00',
       cancelled_at = null
 where id = '62f365c9-744b-4f82-81d5-f20ae8a81c80';
update clientes set clases_restantes = clases_restantes - 2
 where id = '46f5bf35-71fd-4543-b185-6fffcb41858e';
```

Adjacent same-day check (Carolina Nieto `eb495cc8`, handoff item 0): retry confirmed clean —
folio 1082 (8-pack, 27-ago 18:20 local), libre mark 18:30, stored 7 = 8−1, vence 26-sep =
inicio+30. Wrinkle only: forge sold an 8-pack, not the 12 the ticket implied (desk choice).
