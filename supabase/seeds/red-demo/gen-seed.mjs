/**
 * Deterministic generator for the red-demo showcase seed.
 * Emits SQL sections to ./out/. Every generated row id lives in the
 * 5eed0000-… namespace so teardown is a prefix delete.
 *
 * Rules honoured (from packages/domain/src/rules.ts):
 *   estado:  sin_clases if dias<0 || clases<=0 ; por_vencer if dias<=5 || clases<=2 ; else activo
 *   urgencia: critico dias<=3|clases<=1 ; urgente dias<=7|clases<=3 ; pronto dias<=14|clases<=5
 *   clases_restantes = anchor.clases - (# asistencias strictly AFTER the anchor day)
 *   vence = anchor day + 30
 */
import { writeFileSync, mkdirSync } from "node:fs";

const GYM = "daa1c888-192b-4cf6-9fc0-023e314a803f";
const TZ = "America/Chihuahua";
const TODAY = "2026-07-14"; // martes

const CT = {
  fuerza: "8d781a85-8384-46a4-b393-62e5ee10b59f",
  funcional: "70b8bc52-cd56-41ed-ac3c-863000076b08",
  metcon: "205d967f-6f0f-4e2d-8973-74f8cd27c5b0",
  open: "3b1f31bb-254f-423a-904e-3a5f7c784b81",
};
const CO = {
  marisa: "57e35af8-dce8-411d-82fe-80ea37f85522",
  paty: "0f332962-2757-44c9-82ba-67074fb1e006",
  ivan: "b84ebc0f-63e1-41a5-8592-04cdd155c0d0",
};
const PKG = {
  ocho: { nombre: "8 clases", clases: 8, precio: 799 },
  doce: { nombre: "12 clases", clases: 12, precio: 1199 },
  ilim: { nombre: "Ilimitado", clases: null, precio: 1350 },
};

// existing templates (weekday 0=Lun … 5=Sáb)
const OLD_TEMPLATES = [
  { id: "a9ec5e4c-3a67-4a59-acb2-e118df8aad91", wd: 0, t: "18:00", dur: 45, cap: 12, ct: CT.fuerza },
  { id: "0b38d34c-008d-406a-855e-0b23bd04a3b1", wd: 1, t: "07:00", dur: 45, cap: 20, ct: CT.metcon },
  { id: "7111399a-aba6-4a76-a1b6-6e29ce1a7be4", wd: 1, t: "18:00", dur: 45, cap: 12, ct: CT.fuerza },
  { id: "b939bfb7-1e35-4ae8-8b8e-6c77eebf6855", wd: 2, t: "18:00", dur: 45, cap: 12, ct: CT.fuerza },
  { id: "3d4a04c4-5c2a-4359-8339-8c1a6f094cb5", wd: 3, t: "07:00", dur: 45, cap: 20, ct: CT.metcon },
];

// ── deterministic rng ────────────────────────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260714);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

// ── ids ──────────────────────────────────────────────────────────────────────
let _n = 0;
const uid = () => `5eed0000-0000-4000-8000-${String(++_n).padStart(12, "0")}`;

// ── dates (pure calendar math on gym-local days) ─────────────────────────────
const d = (s) => new Date(`${s}T00:00:00Z`);
const iso = (dt) => dt.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(d(s).getTime() + n * 86400000));
const daysBetween = (a, b) => Math.round((d(b).getTime() - d(a).getTime()) / 86400000);
const dow = (s) => (d(s).getUTCDay() + 6) % 7; // 0=Lun … 6=Dom
const isOpen = (s) => dow(s) <= 5; // no Domingo
const ago = (n) => addDays(TODAY, -n);
const q = (s) => (s === null || s === undefined ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const ts = (day, time) => `(timestamp '${day} ${time}:00' at time zone '${TZ}')`;

// ── new templates → 20 classes/week, incl. Viernes + Sábado ──────────────────
const NEW_TEMPLATES = [
  { wd: 0, t: "07:00", dur: 45, cap: 20, ct: CT.metcon, co: [CO.ivan] },
  { wd: 0, t: "12:30", dur: 60, cap: 16, ct: CT.open, co: [CO.marisa] },
  { wd: 0, t: "19:15", dur: 45, cap: 16, ct: CT.funcional, co: [CO.paty] },
  { wd: 1, t: "19:15", dur: 45, cap: 16, ct: CT.funcional, co: [CO.paty] },
  { wd: 2, t: "07:00", dur: 45, cap: 20, ct: CT.metcon, co: [CO.ivan] },
  { wd: 2, t: "12:30", dur: 60, cap: 16, ct: CT.open, co: [CO.marisa] },
  { wd: 2, t: "19:15", dur: 45, cap: 16, ct: CT.funcional, co: [CO.paty] },
  { wd: 3, t: "18:00", dur: 45, cap: 12, ct: CT.fuerza, co: [CO.marisa] },
  { wd: 3, t: "19:15", dur: 45, cap: 16, ct: CT.funcional, co: [CO.paty] },
  { wd: 4, t: "07:00", dur: 45, cap: 20, ct: CT.metcon, co: [CO.ivan] },
  { wd: 4, t: "18:00", dur: 45, cap: 12, ct: CT.fuerza, co: [CO.marisa] },
  { wd: 4, t: "19:15", dur: 60, cap: 20, ct: CT.open, co: [CO.ivan, CO.marisa] },
  { wd: 5, t: "09:00", dur: 60, cap: 20, ct: CT.funcional, co: [CO.paty] },
  { wd: 5, t: "10:15", dur: 60, cap: 20, ct: CT.open, co: [CO.marisa] },
  { wd: 5, t: "11:30", dur: 60, cap: 12, ct: CT.fuerza, co: [CO.ivan] },
].map((x) => ({ ...x, id: uid() }));

const OLD_COACHES = {
  "a9ec5e4c-3a67-4a59-acb2-e118df8aad91": [CO.marisa],
  "0b38d34c-008d-406a-855e-0b23bd04a3b1": [CO.marisa, CO.paty],
  "7111399a-aba6-4a76-a1b6-6e29ce1a7be4": [CO.marisa],
  "b939bfb7-1e35-4ae8-8b8e-6c77eebf6855": [CO.marisa],
  "3d4a04c4-5c2a-4359-8339-8c1a6f094cb5": [CO.marisa, CO.paty],
};
const ALL_TEMPLATES = [
  ...OLD_TEMPLATES.map((t) => ({ ...t, co: OLD_COACHES[t.id], isNew: false })),
  ...NEW_TEMPLATES.map((t) => ({ ...t, isNew: true })),
];

// Mondays to publish: 2026-06-01 … 2026-08-10
const MONDAYS = [];
for (let m = "2026-06-01"; daysBetween(m, "2026-08-10") >= 0; m = addDays(m, 7)) MONDAYS.push(m);

// ── sessions ─────────────────────────────────────────────────────────────────
const sessions = []; // {id, tpl, day, time, ct, dur, cap, co}
for (const mon of MONDAYS) {
  for (const tpl of ALL_TEMPLATES) {
    const day = addDays(mon, tpl.wd);
    sessions.push({ id: uid(), tpl, day, time: tpl.t, ct: tpl.ct, dur: tpl.dur, cap: tpl.cap, co: tpl.co, week: mon });
  }
}
const sessionsOn = (day) => sessions.filter((s) => s.day === day);
const isPastSession = (s) => s.day < TODAY || (s.day === TODAY && s.time < "13:00");

// ── roster ───────────────────────────────────────────────────────────────────
// plan: ocho|doce|ilim|null ; a = anchorDaysAgo ; rem = target clases_restantes
const PEOPLE = [
  // ── the 4 pre-existing rows (ids fixed; renamed into personas) ──
  { id: "a1a27405-119b-4164-9321-e68dbe769d6c", nombre: "Aarón Talavera", tel: "6143333333", email: "aaron.talavera6@gmail.com", plan: "doce", a: 6, rem: 7, hero: true, fav: CT.metcon, keepEmail: true },
  { id: "dca112e6-e6dd-4ace-8da6-2f83218051af", nombre: "Daniel Bustamante", tel: "6141313231", email: "d3bigwlf@gmail.com", plan: null, online: true, keepEmail: true },
  { id: "1dcedae7-126f-4a48-aab9-ee72509440a7", nombre: "Marcos Villegas", tel: "6142312312", email: null, plan: "ocho", a: 3, rem: 6 },
  { id: "e3503dab-ffa1-40d6-b113-3d4ec7be68b1", nombre: "Paola Rentería", tel: "6141111111", email: "nutri.petscuu@gmail.com", plan: "ilim", a: 8, keepEmail: true },
  // ── activos ──
  { nombre: "Ana Herrera", plan: "doce", a: 1, rem: 11 },
  { nombre: "Luis Carrasco", plan: "ocho", a: 2, rem: 7 },
  { nombre: "Mariana Ochoa", plan: "ilim", a: 4 },
  { nombre: "Diego Villalba", plan: "doce", a: 5, rem: 9, hero: true },
  { nombre: "Sergio Bustillos", plan: "ocho", a: 7, rem: 5 },
  { nombre: "Karla Domínguez", plan: "doce", a: 10, rem: 8, hero: true },
  { nombre: "Ricardo Nevárez", plan: "ocho", a: 12, rem: 4 },
  { nombre: "Fernanda Chávez", plan: "ilim", a: 13 },
  { nombre: "Emilio Quezada", plan: "doce", a: 15, rem: 6 },
  { nombre: "Valeria Soto", plan: "ocho", a: 16, rem: 3 },
  { nombre: "Andrés Loya", plan: "doce", a: 18, rem: 5 },
  { nombre: "Regina Muñoz", plan: "ilim", a: 19 },
  { nombre: "Héctor Barraza", plan: "doce", a: 20, rem: 4 },
  { nombre: "Daniela Prieto", plan: "ocho", a: 21, rem: 3 },
  { nombre: "Alonso Terrazas", plan: "doce", a: 22, rem: 6 },
  { nombre: "Ximena Rascón", plan: "ilim", a: 24 },
  { nombre: "Rodrigo Fierro", plan: "doce", a: 0, rem: 12 },
  { nombre: "Camila Estrada", plan: "ocho", a: 8, rem: 6 },
  // ── por vencer (dias<=5 OR clases<=2) ──
  { nombre: "Sofía Portillo", plan: "ocho", a: 26, rem: 4 },   // dias 4
  { nombre: "Manuel Aguirre", plan: "doce", a: 28, rem: 5 },   // dias 2
  { nombre: "Renata Grado", plan: "ilim", a: 30 },             // dias 0
  { nombre: "Julio Melgar", plan: "doce", a: 16, rem: 2 },     // clases 2
  { nombre: "Brenda Holguín", plan: "ocho", a: 14, rem: 1 },   // clases 1 → crítico
  { nombre: "Óscar Talamantes", plan: "doce", a: 17, rem: 2 }, // clases 2
  // ── sin clases ──
  { nombre: "Lucía Baeza", plan: "ocho", a: 33, rem: 2 },      // vencido
  { nombre: "Adrián Marín", plan: "doce", a: 38, rem: 4 },     // vencido
  { nombre: "Iván Corral", plan: "ocho", a: 45, rem: 1 },      // vencido
  { nombre: "Nadia Espino", plan: "doce", a: 20, rem: 0 },     // agotó el paquete
  // ── altas de julio (primer paquete, sin historial) — the growth story: these
  //    are the sales July has that June does not, so the month is genuinely up.
  { nombre: "Natalia Ríos", plan: "doce", a: 4, rem: 11, first: true },
  { nombre: "Gabriel Ponce", plan: "ocho", a: 2, rem: 7, first: true },
  { nombre: "Jimena Acosta", plan: "ilim", a: 7, first: true },
  { nombre: "Sofía Aguilar", plan: "ocho", a: 9, rem: 6, first: true },
  { nombre: "Emiliano Vega", plan: "doce", a: 12, rem: 10, first: true },
  // ── primera compra pendiente (sin venta) ──
  { nombre: "Rubén Máynez", plan: null },
];

const TELS = new Set(PEOPLE.filter((p) => p.tel).map((p) => p.tel));
function newTel() {
  for (;;) {
    const t = `614${int(2, 8)}${String(int(0, 999999)).padStart(6, "0")}`;
    if (t.length === 10 && !TELS.has(t)) { TELS.add(t); return t; }
  }
}
const slug = (n) => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, "").split(" ").join(".");

// hydrate people
const roster = PEOPLE.map((p, i) => {
  const id = p.id ?? uid();
  const existing = Boolean(p.id);
  const tel = p.tel ?? newTel();
  // ~72% have an email. Unroutable .test domain: an accidental "reenviar
  // invitación" on stage must never reach a real stranger.
  const email = p.keepEmail ? p.email : rnd() < 0.72 ? `${slug(p.nombre)}@red-demo.test` : null;
  const created = p.first ? ago(p.a) : existing ? ago(int(40, 260)) : ago(int(12, 400));
  const birthday = rnd() < 0.6 ? `19${int(78, 99)}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}` : null;
  return { ...p, id, existing, tel, email, created, birthday, i };
});

// ── ventas ───────────────────────────────────────────────────────────────────
const METODOS = ["efectivo", "efectivo", "efectivo", "transferencia", "transferencia", "tarjeta"];
const ventas = [];
for (const p of roster) {
  if (!p.plan) continue;
  const pk = PKG[p.plan];
  const anchorDay = ago(p.a);
  // history: 2 earlier sales (~30 / ~60 days before the anchor) → ficha shows a
  // real purchase history, and the ~30d one lands in the prior-month window.
  // `first` members joined this week — their anchor IS their first purchase.
  const hist = p.first
    ? []
    : [60 + int(-4, 4), 30 + int(-3, 3)]
        .map((k) => addDays(anchorDay, -k))
        .filter((day) => day >= "2026-04-20");
  for (const day of hist) {
    // history skews to the entry tier — members start on 8 clases and upgrade.
    // It also keeps the prior-month baseline honest instead of inflated.
    const hp = PKG[rnd() < 0.68 ? "ocho" : "doce"];
    ventas.push({ id: uid(), cliente: p.id, day, time: `${String(int(8, 20)).padStart(2, "0")}:${pick(["05", "15", "20", "35", "40", "50"])}`, pk: hp, metodo: pick(METODOS) });
  }
  const anchor = { id: uid(), cliente: p.id, day: anchorDay, time: `${String(int(8, 19)).padStart(2, "0")}:${pick(["05", "10", "25", "30", "45"])}`, pk, metodo: pick(METODOS), anchor: true };
  ventas.push(anchor);
  p.anchorDay = anchorDay;
  p.anchorTime = anchor.time;
  p.pk = pk;
  p.vence = addDays(anchorDay, 30);
}
ventas.sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
ventas.forEach((v, k) => (v.folio = 1013 + k));

// ── asistencias ──────────────────────────────────────────────────────────────
// Budgets: post-anchor spend is exactly (clases - rem) so clases_restantes is
// true by construction; pre-anchor days draw on the earlier sale's window.
const START = "2026-06-01";
for (const p of roster) {
  if (!p.plan) { p.postBudget = 0; p.preBudget = 0; continue; }
  p.postBudget = p.plan === "ilim" ? int(6, 11) : p.pk.clases - p.rem;
  p.preBudget = p.plan === "ilim" ? int(10, 16) : int(5, 11);
  p.postUsed = 0; p.preUsed = 0; p.days = new Set();
}

// daily targets — Sunday closed; the Jul 8–14 week is the dashboard sparkline
const TARGET = (day) => {
  if (!isOpen(day)) return 0;
  const fixed = { "2026-07-08": 12, "2026-07-09": 10, "2026-07-10": 13, "2026-07-11": 7, "2026-07-13": 11, "2026-07-14": 12 };
  if (fixed[day]) return fixed[day];
  if (dow(day) === 5) return int(5, 8);        // sábado
  if (day >= "2026-07-01") return int(9, 13);
  return int(7, 11);                            // junio
};

const asistencias = [];
const HORAS_AM = ["07:02", "07:05", "07:08", "07:11", "07:14"];
const HORAS_PM = ["18:03", "18:06", "18:09", "19:18", "19:21", "12:33"];
const OPEN_DAYS = [];
for (let day = START; day <= TODAY; day = addDays(day, 1)) if (isOpen(day)) OPEN_DAYS.push(day);

function attend(p, day) {
  const morning = rnd() < 0.42;
  const pool = sessionsOn(day).filter((s) => (morning ? s.time < "12:00" : s.time >= "12:00"));
  const s = pool.length ? pick(pool) : (sessionsOn(day)[0] ?? null);
  // TODAY's rows stay front-desk (class_session_id NULL) so every member is still
  // tappable in pase de lista on stage — toggle_pase refuses anyone who already
  // has a session-linked row today.
  const linkSession = s && day < TODAY;
  const hora = day === TODAY ? pick(HORAS_AM) : s ? s.time : pick([...HORAS_AM, ...HORAS_PM]);
  asistencias.push({ id: uid(), cliente: p.id, day, hora, session: linkSession ? s : null });
  p.days.add(day);
}

// The days a member could legitimately train on their CURRENT package: strictly
// after the sale (trap #7) and no later than its vigencia — an expired member
// training after `vence` is exactly the kind of tell that reads as fake data.
const postWindow = (p) => OPEN_DAYS.filter((day) => day > p.anchorDay && day <= p.vence);

// Phase 1 — EXACT post-anchor spend for every finite plan. clases_restantes is
// then true by construction, not by luck.
for (const p of roster) {
  if (!p.plan || p.plan === "ilim") continue;
  const chosen = shuffle(postWindow(p)).slice(0, p.postBudget);
  if (chosen.length < p.postBudget) throw new Error(`${p.nombre}: needs ${p.postBudget} training days after ${p.anchorDay} but the package only allows ${chosen.length}`);
  for (const day of chosen) { attend(p, day); p.postUsed++; }
}

// Phase 2 — fill each day toward its target with rows that CANNOT move a saldo:
// pre-anchor days (they belong to an already-closed package) and Ilimitado
// members (clases_restantes is NULL — nothing to decrement).
const preEligible = (p, day) => {
  if (p.days.has(day) || day === p.anchorDay) return false;
  if (day > p.anchorDay) {
    // only Ilimitado may still be topped up here — a finite plan's post-anchor
    // spend is owned by Phase 1 and must not drift.
    return p.plan === "ilim" && day <= p.vence && p.postUsed < p.postBudget;
  }
  if (p.preUsed >= p.preBudget) return false;
  return ventas.some((v) => v.cliente === p.id && v.day < day && daysBetween(v.day, day) <= 30);
};
for (const day of OPEN_DAYS) {
  const have = asistencias.filter((a) => a.day === day).length;
  const want = TARGET(day);
  if (have >= want) continue;
  const cands = shuffle(roster.filter((p) => p.plan && preEligible(p, day)));
  for (const p of cands.slice(0, want - have)) {
    attend(p, day);
    if (day > p.anchorDay) p.postUsed++; else p.preUsed++;
  }
}

// The dashboard hero reads "hoy" against "ayer". Phase 1 places days by package
// window, not by calendar mood, so hoy can land under ayer. Rebalance by MOVING
// attendances that are already inside the member's current package window —
// same window in, same window out, so no saldo moves a single class.
const byId = new Map(roster.map((p) => [p.id, p]));
const countOn = (day) => asistencias.filter((a) => a.day === day).length;
const YESTERDAY = ago(1);
for (let guard = 0; countOn(TODAY) < countOn(YESTERDAY) + 2 && guard < 40; guard++) {
  const cand = asistencias.find((a) => {
    if (a.day !== YESTERDAY) return false;
    const p = byId.get(a.cliente);
    return a.day > p.anchorDay && TODAY <= p.vence && !p.days.has(TODAY);
  });
  if (!cand) break;
  const p = byId.get(cand.cliente);
  p.days.delete(YESTERDAY);
  p.days.add(TODAY);
  cand.day = TODAY;
  cand.session = null;        // today's rows stay front-desk (still tappable)
  cand.hora = pick(HORAS_AM);
}

// true saldo, by construction
for (const p of roster) {
  if (!p.plan) { p.clases = null; p.venceOut = null; p.paqueteOut = null; continue; }
  p.paqueteOut = p.pk.nombre;
  p.venceOut = p.vence;
  p.clases = p.plan === "ilim" ? null : p.pk.clases - p.postUsed;
}

// ── reservations ─────────────────────────────────────────────────────────────
// PAST: one per session-linked asistencia → status 'asistida' (occupancy history
// + the green check on the class roster). FUTURE: 'reservada' — the ONLY source
// of occupancy anywhere in either app.
const reservations = [];
for (const a of asistencias) {
  if (!a.session) continue;
  const r = { id: uid(), cliente: a.cliente, session: a.session, status: "asistida", consumio: true, created: `${addDays(a.day, -1)} ${pick(["19:40", "21:05", "08:12"])}`, checked: `${a.day} ${a.hora}` };
  reservations.push(r);
  a.reservation = r.id;
}
// today's 07:00 Metcon: the morning class already happened → show its roster as
// attended even though the asistencias are front-desk rows.
const hoy0700 = sessionsOn(TODAY).find((s) => s.time === "07:00");
if (hoy0700) {
  for (const a of asistencias.filter((x) => x.day === TODAY)) {
    reservations.push({ id: uid(), cliente: a.cliente, session: hoy0700, status: "asistida", consumio: true, created: `${ago(1)} 20:10`, checked: `${TODAY} ${a.hora}` });
  }
}

// Only members who could actually book: a live package with classes left.
const bookable = roster.filter((p) => p.plan && (p.clases === null || p.clases > 0) && p.venceOut >= TODAY);
for (const p of bookable) p.futureBooked = 0;
const HERO = roster.find((p) => p.id === "a1a27405-119b-4164-9321-e68dbe769d6c"); // the client-app login
const MAX_FUTURE = 3; // nobody books 9 classes ahead

const futureSess = sessions.filter((s) => !isPastSession(s) && s.day <= addDays(TODAY, 9));
for (const s of futureSess) {
  let target;
  if (s.day === TODAY && s.time === "19:15") target = s.cap;                                       // LLENO
  else if (s.day === TODAY) target = Math.round(s.cap * 0.8);
  else if (s.day === addDays(TODAY, 1) && s.time === "07:00") target = Math.round(s.cap * 0.9);    // CASI LLENO
  else if (s.day <= addDays(TODAY, 4)) target = Math.round(s.cap * (0.4 + rnd() * 0.4));
  else target = Math.round(s.cap * (0.15 + rnd() * 0.3));

  const taken = new Set(reservations.filter((r) => r.session.id === s.id).map((r) => r.cliente));
  // the hero member gets first refusal on the next two sessions → a non-empty
  // "Próximas reservas" card on the client app
  const heroFirst = HERO && !taken.has(HERO.id) && HERO.futureBooked < 2 && s.day <= addDays(TODAY, 2) ? [HERO] : [];
  const cands = [...heroFirst, ...shuffle(bookable.filter((p) => !taken.has(p.id) && p.futureBooked < MAX_FUTURE && p !== heroFirst[0]))];
  for (const p of cands.slice(0, target)) {
    reservations.push({ id: uid(), cliente: p.id, session: s, status: "reservada", consumio: false, created: `${ago(int(0, 3))} ${pick(["07:30", "13:15", "20:40", "21:55"])}`, checked: null });
    p.futureBooked++;
  }
}

// ── emit ─────────────────────────────────────────────────────────────────────
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\//, "");
mkdirSync(OUT, { recursive: true });
const parts = {};

parts["01_reset"] = `-- Remove the junk test operational rows (restored verbatim by the teardown).
delete from asistencias  where gym_id = '${GYM}';
delete from reservation  where gym_id = '${GYM}';
delete from ventas       where gym_id = '${GYM}';
`;

parts["02_clientes"] = [
  ...roster.filter((p) => p.existing).map((p) => `update clientes set nombre=${q(p.nombre)}, created_at=${ts(p.created, "09:30")}, birthday=${q(p.birthday)}, favorite_class_type_id=${q(p.fav ?? null)}, paquete_nombre=${q(p.paqueteOut)}, clases_restantes=${p.clases === null ? "null" : p.clases}, vence=${q(p.venceOut)} where id='${p.id}';`),
  `insert into clientes (id, gym_id, nombre, tel, email, birthday, created_at, paquete_nombre, clases_restantes, vence, favorite_class_type_id, invitacion_enviada_at, claim_code) values`,
  roster.filter((p) => !p.existing).map((p) => {
    const invited = p.email && rnd() < 0.8;
    return `('${p.id}','${GYM}',${q(p.nombre)},${q(p.tel)},${q(p.email)},${q(p.birthday)},${ts(p.created, "10:15")},${q(p.paqueteOut)},${p.clases === null ? "null" : p.clases},${q(p.venceOut)},${q(p.fav ?? null)},${invited ? ts(addDays(p.created, 0), "10:16") : "null"},${invited ? "null" : q(Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[int(0, 31)]).join(""))})`;
  }).join(",\n"),
  ";",
].join("\n");

parts["03_schedule"] = [
  `insert into schedule_template (id, gym_id, class_type_id, weekday, start_time, duration_min, capacity, is_active) values`,
  NEW_TEMPLATES.map((t) => `('${t.id}','${GYM}','${t.ct}',${t.wd},'${t.t}',${t.dur},${t.cap},true)`).join(",\n") + ";",
  `insert into schedule_template_coach (gym_id, template_id, coach_id) values`,
  NEW_TEMPLATES.flatMap((t) => t.co.map((c) => `('${GYM}','${t.id}','${c}')`)).join(",\n") + " on conflict do nothing;",
  `insert into schedule_template_week (gym_id, template_id, week_start) values`,
  ALL_TEMPLATES.flatMap((t) => MONDAYS.map((m) => `('${GYM}','${t.id}','${m}')`)).join(",\n") + " on conflict do nothing;",
].join("\n");

// sessions: skip any (template, day) that already has a session (the pre-existing
// 33 rows, incl. the 2026-07-06 22:00 outlier) so materialization can't double up.
parts["04_sessions"] = [
  `with v(i, tpl, ct, day, hhmm, dur, cap) as (values`,
  sessions.map((s) => `(${parseInt(s.id.slice(-12), 10)},'${s.tpl.id}','${s.ct}','${s.day}','${s.time}',${s.dur},${s.cap})`).join(",\n"),
  `)`,
  `insert into class_session (id, gym_id, class_type_id, starts_at, duration_min, capacity, template_id)`,
  `select ('5eed0000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid, '${GYM}'::uuid, ct::uuid,`,
  `  (day||' '||hhmm)::timestamp at time zone '${TZ}', dur, cap, tpl::uuid`,
  `from v where not exists (`,
  `  select 1 from class_session cs where cs.template_id = v.tpl::uuid and (cs.starts_at at time zone '${TZ}')::date = v.day::date);`,
  `insert into class_session_coach (gym_id, session_id, coach_id)`,
  `select '${GYM}', cs.id, stc.coach_id from class_session cs join schedule_template_coach stc on stc.template_id = cs.template_id`,
  `where cs.gym_id='${GYM}' and cs.id::text like '5eed0000-%' on conflict do nothing;`,
].join("\n");

parts["05_ventas"] = [
  `insert into ventas (id, gym_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at) values`,
  ventas.map((v) => `('${v.id}','${GYM}','${v.cliente}',${v.folio},${q(v.pk.nombre)},${v.pk.clases ?? "null"},'dias',30,${v.pk.precio},'${v.metodo}',${ts(v.day, v.time)},${ts(v.day, v.time)})`).join(",\n") + ";",
  `update gym_folio_counter set last_folio = ${1013 + ventas.length - 1} where gym_id='${GYM}';`,
].join("\n");

// Compact emitters: the 5eed ids are a dense integer namespace, so send the
// integer and let Postgres rebuild the uuid. Same rows, ~a third of the bytes.
const n = (id) => parseInt(id.slice(-12), 10);
const U = `('5eed0000-0000-4000-8000-'||lpad(`;
const zone = `::timestamp at time zone '${TZ}'`;

parts["06_reservations"] = [
  `with r(i, s, m, st, cons, chk, cre) as (values`,
  reservations.map((r) => `(${n(r.id)},${n(r.session.id)},'${r.cliente}','${r.status}',${r.consumio},${r.checked ? `'${r.checked}'` : "null"},'${r.created}')`).join(",\n"),
  `)`,
  `insert into reservation (id, gym_id, class_session_id, member_id, status, is_walk_in, consumio, checked_at, created_at)`,
  `select ${U}i::text,12,'0'))::uuid, '${GYM}'::uuid, ${U}s::text,12,'0'))::uuid, m::uuid, st, false, cons, chk${zone}, cre${zone} from r`,
  `on conflict do nothing;`,
].join("\n");

parts["07_asistencias"] = [
  `with a(i, c, f, h, s, r) as (values`,
  asistencias.map((a) => `(${n(a.id)},'${a.cliente}','${a.day}','${a.hora}',${a.session ? n(a.session.id) : "null"},${a.reservation ? n(a.reservation) : "null"})`).join(",\n"),
  `)`,
  `insert into asistencias (id, gym_id, cliente_id, fecha, hora, consumio, class_session_id, reservation_id, created_at)`,
  `select ${U}i::text,12,'0'))::uuid, '${GYM}'::uuid, c::uuid, f::date, h::time, true,`,
  `  case when s is null then null else ${U}s::text,12,'0'))::uuid end,`,
  `  case when r is null then null else ${U}r::text,12,'0'))::uuid end,`,
  `  (f||' '||h)${zone} from a;`,
].join("\n");

for (const [k, v] of Object.entries(parts)) writeFileSync(`${OUT}${k}.sql`, v + "\n");

// ── report ───────────────────────────────────────────────────────────────────
const estado = (p) => {
  if (!p.plan) return "sin_paquete";
  const dias = daysBetween(TODAY, p.venceOut);
  const cl = p.clases === null ? Infinity : p.clases;
  if (dias < 0 || cl <= 0) return "sin_clases";
  if (dias <= 5 || cl <= 2) return "por_vencer";
  return "activo";
};
const tally = {};
for (const p of roster) tally[estado(p)] = (tally[estado(p)] ?? 0) + 1;
const week = ["2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12", "2026-07-13", "2026-07-14"];
console.log(JSON.stringify({
  clientes: roster.length, ventas: ventas.length, folios: `1013-${1013 + ventas.length - 1}`,
  asistencias: asistencias.length, reservations: reservations.length,
  templates_new: NEW_TEMPLATES.length, sessions_new: sessions.length, weeks: MONDAYS.length,
  estados: tally,
  sparkline: week.map((w) => asistencias.filter((a) => a.day === w).length),
  ingresosSemana: ventas.filter((v) => v.day >= "2026-07-08").reduce((s, v) => s + v.pk.precio, 0),
  julio_1_14: { ventas: ventas.filter((v) => v.day >= "2026-07-01").length, ingresos: ventas.filter((v) => v.day >= "2026-07-01").reduce((s, v) => s + v.pk.precio, 0), asis: asistencias.filter((a) => a.day >= "2026-07-01").length },
  junio_1_14: { ventas: ventas.filter((v) => v.day >= "2026-06-01" && v.day <= "2026-06-14").length, ingresos: ventas.filter((v) => v.day >= "2026-06-01" && v.day <= "2026-06-14").reduce((s, v) => s + v.pk.precio, 0), asis: asistencias.filter((a) => a.day >= "2026-06-01" && a.day <= "2026-06-14").length },
  por_renovar: roster.filter((p) => { const dias = p.venceOut ? daysBetween(TODAY, p.venceOut) : -99; const cl = p.clases === null ? Infinity : (p.plan ? p.clases : 0); return dias <= 7 || cl <= 3; }).length,
  hero_futuras: HERO?.futureBooked,
  negativos: roster.filter((p) => p.clases !== null && p.clases < 0).map((p) => p.nombre),
  sample_emails: roster.slice(4, 8).map((p) => p.email),
}, null, 2));
