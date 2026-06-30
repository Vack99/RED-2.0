// @gym/format — es-MX locale + Chihuahua-tz formatting (ADR-0011 §4). A pure
// leaf: it imports NOTHING from other workspace packages. This barrel is the
// single public entry; the three modules keep their distinct jobs:
//   date.ts   — pure local-component calendar (es-MX labels + isoDay math)
//   fecha.ts  — Chihuahua-tz wall clock + Postgres `date` bridge (TZ lives here)
//   format.ts — es-MX peso strings + name/phone/WhatsApp helpers
export * from "./date";
export * from "./fecha";
export * from "./format";
