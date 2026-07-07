import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { pesos } from "@gym/format";
import {
  getCoachesPublicos,
  getContacto,
  getFaqsPublicas,
  getMarketingGym,
  getPlanesPublicos,
  getValoresPublicos,
  type PlanPublicoDTO,
} from "@gym/data/server/marketing";

import { FaqAccordion } from "./_components/faq-accordion";

export const metadata: Metadata = {
  title: "Planes",
  description: "Elige cómo entrenas. Sin permanencia, cancelas cuando quieras.",
};

/** The mock's tiered CTA (three distinct labels, not a popular/other binary): a single-session drop-in
 *  invites a reservation, the popular plan is the hero action, everything else is a plan choice. Keyed on
 *  the grant model (clases) + popular, so it stays right as the operator's catalog changes. */
function ctaLabel(plan: PlanPublicoDTO): string {
  if (plan.popular) return "Empezar ahora";
  if (plan.clases === 1) return "Reservar clase";
  return "Elegir este plan";
}

function Check() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mt-0.5 shrink-0 text-accent"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function PlanCard({ plan }: { plan: PlanPublicoDTO }) {
  return (
    <div
      className={`relative flex flex-col rounded-3xl border bg-surface p-6 ${
        plan.popular ? "border-accent shadow-lg ring-1 ring-accent" : "border-line"
      }`}
    >
      {plan.badge && (
        <span
          className={`mb-3 inline-flex w-fit rounded-full px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide ${
            plan.popular ? "bg-accent text-white" : "bg-accent-soft text-accent"
          }`}
        >
          {plan.badge}
        </span>
      )}
      <h2 className="text-xl font-bold text-fg">{plan.name}</h2>
      {plan.subtitle && <p className="mt-1 text-sm text-muted">{plan.subtitle}</p>}
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold tabular-nums tracking-tight text-fg">
          {pesos(plan.precio)}
        </span>
        {plan.cadence && <span className="text-sm text-muted">{plan.cadence}</span>}
      </div>
      <ul className="mt-5 flex flex-1 flex-col gap-3">
        {plan.features.map((feat, i) => (
          <li key={i} className="flex gap-2 text-sm text-fg">
            <Check />
            <span>{feat}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/registro"
        className={`mt-6 inline-flex justify-center rounded-full px-5 py-3 text-sm font-semibold ${
          plan.popular
            ? "bg-accent text-white hover:opacity-90"
            : "border border-line text-fg hover:border-accent hover:text-accent"
        }`}
      >
        {ctaLabel(plan)}
      </Link>
      {plan.nota && <p className="mt-3 text-center text-xs text-muted">{plan.nota}</p>}
    </div>
  );
}

/** Public Precios screen (PRD #49 S1) — plans, features, badges + the FAQ accordion, all from the real
 *  catalog over the anon marketing readers. Zero hardcoded catalog copy: the gym is resolved from the
 *  proxy's x-gym stamp and every plan/feature/FAQ is read from the DB. Paint is token-driven, so a RED
 *  host renders RED and a Forge host renders Forge with no brand import in this file. */
export default async function PreciosPage() {
  const slug = (await headers()).get("x-gym");
  const gym = slug ? await getMarketingGym(slug) : null;
  const [planes, faqs, coaches, contacto, valores] = gym
    ? await Promise.all([
        getPlanesPublicos(gym.id),
        getFaqsPublicas(gym.id),
        getCoachesPublicos(gym.id),
        getContacto(gym.id),
        getValoresPublicos(gym.id),
      ])
    : [[], [], [], null, []];

  // Same fallback as Nosotros: until an operator authors about_tagline, stitch the value titles so the
  // line always renders (the mock's "Fuerza · Disciplina · Resultado" IS the three values).
  const tagline = gym?.aboutTagline ?? valores.map((v) => v.title).join(" · ");

  // "Todos los planes incluyen" — the mock's coaches/horario rows come from the gym's REAL data (roster
  // count + weekly hours), then the platform-universal inclusions. Each data row drops out when its
  // source is empty, so a gym with no roster/hours degrades to the universal-only list.
  const openDays = contacto?.horarios.filter((h) => !h.closed && h.opens && h.closes) ?? [];
  const incluye: { k: string; v: string }[] = [
    ...(coaches.length > 0
      ? [
          {
            k: "Coaches certificados",
            v: `${coaches.length} ${coaches.length === 1 ? "coach" : "coaches"}`,
          },
        ]
      : []),
    ...(openDays.length > 0
      ? [
          {
            k: "Horario",
            v: `${openDays[0].day.slice(0, 3)}–${openDays[openDays.length - 1].day.slice(0, 3)} ${openDays[0].opens}–${openDays[0].closes}`,
          },
        ]
      : []),
    { k: "Equipo y material", v: "Sin costo extra" },
    { k: "Reserva digital", v: "Desde la app" },
    { k: "Permanencia", v: "Ninguna" },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10">
      <header className="mx-auto max-w-2xl text-center">
        {gym && (
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">
            Precios · {gym.brandName}
          </span>
        )}
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-fg">Planes</h1>
        <p className="mt-3 text-base text-muted">
          Elige cómo entrenas. Sin permanencia, sin letras chiquitas. Cancelas cuando quieras.
        </p>
        {tagline && (
          <p className="cm-vals mt-4">
            <span className="text-sm font-semibold text-accent">{tagline}</span>
          </p>
        )}
      </header>

      {planes.length > 0 ? (
        <section className="mt-10 grid gap-5 md:grid-cols-3 md:items-start">
          {planes.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </section>
      ) : (
        <p className="mt-10 text-center text-sm text-muted">
          Los planes de este gimnasio estarán disponibles muy pronto.
        </p>
      )}

      <section className="mx-auto mt-12 max-w-2xl rounded-3xl border border-line bg-surface p-6">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-muted">
          Todos los planes incluyen
        </span>
        <dl className="mt-4 flex flex-col divide-y divide-line">
          {incluye.map((row) => (
            <div key={row.k} className="flex items-center justify-between py-3">
              <dt className="text-sm text-fg">{row.k}</dt>
              <dd className="text-sm font-medium tabular-nums text-muted">{row.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {faqs.length > 0 && (
        <section className="mx-auto mt-12 max-w-2xl">
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-muted">
            Preguntas frecuentes
          </span>
          <div className="mt-4">
            <FaqAccordion faqs={faqs} />
          </div>
        </section>
      )}

      <section className="mx-auto mt-12 max-w-2xl rounded-3xl border border-line bg-sunk p-8 text-center">
        <h3 className="text-2xl font-bold text-fg">Empieza hoy</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Reserva tu lugar y entrena desde el primer día. Sin permanencia, cancelas cuando quieras.
        </p>
        <div className="mt-5 flex flex-col items-center gap-3">
          <Link
            href="/registro"
            className="inline-flex justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Empezar ahora
          </Link>
          <Link
            href="/reservar"
            className="inline-flex justify-center rounded-full border border-line px-6 py-3 text-sm font-semibold text-fg hover:border-accent hover:text-accent"
          >
            Ver horarios
          </Link>
        </div>
        <p className="mt-5 text-xs text-muted">
          Sin permanencia · Cancela cuando quieras
          <br />
          Precios en pesos MXN · IVA incluido
        </p>
      </section>
    </main>
  );
}
