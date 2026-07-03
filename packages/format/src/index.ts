// @gym/format — es-MX locale + tz-parameterized date formatting (ADR-0011 §4). A
// pure leaf: it imports NOTHING from other workspace packages, and never reads a
// gym row itself — every zone-aware helper takes an explicit `tz` (IANA) argument
// (PRD #17 named exception: per-gym timezone). This barrel is the single public
// entry; the three modules keep their distinct jobs:
//   date.ts   — pure local-component calendar (es-MX labels + isoDay math)
//   fecha.ts  — tz-aware wall clock + Postgres `date` bridge (per-gym `tz` arg)
//   format.ts — es-MX peso strings + name/phone/WhatsApp helpers
export * from "./date";
export * from "./fecha";
export * from "./format";
