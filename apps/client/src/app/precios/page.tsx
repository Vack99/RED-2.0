import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { pesos } from "@gym/format";
import {
  getFaqsPublicas,
  getMarketingGym,
  getPlanesPublicos,
  type PlanPublicoDTO,
} from "@gym/data/server/marketing";

import { FaqAccordion } from "./_components/faq-accordion";

export const metadata: Metadata = {
  title: "Planes",
  description: "Elige cómo entrenas. Sin permanencia, cancelas cuando quieras.",
};

/** Universal, brand-neutral platform inclusions (true for every gym on the platform) — the mock's
 *  "Todos los planes incluyen" row, kept to facts the platform guarantees rather than gym-specific
 *  claims (coach count / schedule derive from later marketing slices' data). */
const INCLUYE: { k: string; v: string }[] = [
  { k: "Equipo y material", v: "Sin costo extra" },
  { k: "Reserva digital", v: "Desde la app" },
  { k: "Permanencia", v: "Ninguna" },
];

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
          className={`mb-3 inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${
            plan.popular ? "bg-accent text-white" : "bg-accent-soft text-accent"
          }`}
        >
          {plan.badge}
        </span>
      )}
      <h2 className="text-xl font-bold text-fg">{plan.name}</h2>
      {plan.subtitle && <p className="mt-1 text-sm text-muted">{plan.subtitle}</p>}
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold text-fg">{pesos(plan.precio)}</span>
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
        {plan.popular ? "Empezar ahora" : "Elegir plan"}
      </Link>
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
  const [planes, faqs] = gym
    ? await Promise.all([getPlanesPublicos(gym.id), getFaqsPublicas(gym.id)])
    : [[], []];

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10">
      <header className="mx-auto max-w-2xl text-center">
        {gym && (
          <span className="text-xs font-semibold uppercase tracking-widest text-accent">
            Precios · {gym.brandName}
          </span>
        )}
        <h1 className="mt-3 text-4xl font-bold text-fg">Planes</h1>
        <p className="mt-3 text-base text-muted">
          Elige cómo entrenas. Sin permanencia, sin letras chiquitas. Cancelas cuando quieras.
        </p>
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
        <span className="text-xs font-semibold uppercase tracking-widest text-muted">
          Todos los planes incluyen
        </span>
        <dl className="mt-4 flex flex-col divide-y divide-line">
          {INCLUYE.map((row) => (
            <div key={row.k} className="flex items-center justify-between py-3">
              <dt className="text-sm text-fg">{row.k}</dt>
              <dd className="text-sm font-medium text-muted">{row.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {faqs.length > 0 && (
        <section className="mx-auto mt-12 max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted">
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
        <Link
          href="/registro"
          className="mt-5 inline-flex justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
        >
          Empezar ahora
        </Link>
        <p className="mt-5 text-xs text-muted">
          Sin permanencia · Cancela cuando quieras
          <br />
          Precios en pesos MXN · IVA incluido
        </p>
      </section>
    </main>
  );
}
