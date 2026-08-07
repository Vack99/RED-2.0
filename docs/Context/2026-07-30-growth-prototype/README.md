# Growth prototype — derive-with-override overworld (rescued 2026-07-30)

Working prototype from the GROWTH-1 design run. Rescued out of a session scratchpad that gets
garbage-collected. **Not wired into red-tracker/** — reference only.

| file | what |
|---|---|
| `ow-base.mjs` | unmodified copy of `arcade/overworld.mjs` at the time of the run (baseline) |
| `ow-derived.mjs` | the refactor: 7 realm-keyed tables -> 4 banks + 2 override maps + one layout() |
| `patch.cjs` | the transform that produced ow-derived from ow-base |
| `gate-derived.mjs` | `check-overworld.mjs` UNTOUCHED except its two import paths |

## The measured result

`gate-derived.mjs` against `ow-derived.mjs`: **311 assertions PASS**, draft parity sha1
`445f98dc0fd8a12880e7ccfe4c10b0fa7679c5ae` intact. An 8th realm rendered with a biome, a density,
a keep, a road connection, a fog burn tracking its pct and a live brazier channel — none authored.
Cost: +46 lines, +1,513 bytes.

Re-verify before trusting: `node gate-derived.mjs` from this directory.

Full design: `../2026-07-30-tracker-growth-design.md`.
