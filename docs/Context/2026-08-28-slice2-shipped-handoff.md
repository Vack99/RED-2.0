# Handoff 2026-08-28 — slice 2 shipped, next session

Slice 2 (saldo_detalle) + the multi-gym sales fix are LIVE and pushed: `origin/main = 7a9cce1`.
3 migrations applied to prod (md5-gated), both apps deployed. Details:
[[slice2-saldo-detalle-shipped]], `docs/superpowers/plans/2026-08-27-slice2-saldo-detalle.md`.

## Blocking traps (read before any DB or merge work)

1. **Migration filename ≠ live version.** Repo `20260828100000/110000/120000`; live-stamped
   `20260828070732/071905/072008`. Do NOT re-apply. The next migration that touches
   `reservar_clase`, `pasar_lista_sesion`, `fijar_asistencia`, `editar_venta`, `mi_membresia`, or
   `conteo_cargable` must `create or replace` at the exact live signature (`pg_get_function_identity_arguments`
   first) — a stale signature makes a second overload, the 08-27 outage.

2. **Mobile lane holds the 3 hygiene migrations under old filenames.** Delete the branch copies
   before any mobile merge, or they double-apply. Mobile merges are frozen; lift the freeze first.

## Open work

3. **Hanna Minjarez (`bf79cee1`) + Oscar Anchondo (`24e90312`) eventless stored-0** — owner ruling
   owed. Their fichas now show the divergence honestly (saldo_detalle surfaces it). Last reset-rule
   deviation platform-wide.

4. **Owner walk of the live behavior.** New on every ficha: grant-denominated gauge (`Usadas · Apartadas`),
   `(paquete anterior)` tags, `editar_venta` = as-if-original. RED shows ~24 "No asistió — cargada"
   rows (booked=charged, roll-call unrun) — expected, not a bug.

5. **MEMORY.md compaction** — near the 24.4KB read cap. Merge/drop stale entries to <17.1KB.

## ⚠️ Owner-owed input (blocks the ToS/CFDI track)

SAT persona-física: nombre, RFC, régimen, domicilio fiscal, correo. See [[gate-tackling-progress]].
