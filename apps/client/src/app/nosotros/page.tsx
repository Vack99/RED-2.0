import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import {
  getCoachesPublicos,
  getFormatosPublicos,
  getInstalacionesPublicas,
  getMarketingGym,
  getStatsPublicas,
  getValoresPublicos,
  type CoachPublicoDTO,
} from "@gym/data/server/marketing";

export const metadata: Metadata = {
  title: "Nosotros",
  description: "El equipo, los valores y el espacio donde entrenas.",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-widest text-accent">{children}</span>
  );
}

/** One coach card — avatar (initials) + name + role·specialty + optional bio (both operator-optional). */
function CoachCard({ coach }: { coach: CoachPublicoDTO }) {
  const roleLine = [coach.role, coach.specialty].filter(Boolean).join(" · ");
  return (
    <div className="flex gap-4 border-t border-line py-4 first:border-t-0">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent">
        {coach.initials}
      </div>
      <div className="min-w-0">
        <div className="text-base font-bold text-fg">{coach.name}</div>
        <div className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-accent">
          {roleLine}
        </div>
        {coach.bio && <p className="mt-2 text-sm leading-relaxed text-muted">{coach.bio}</p>}
      </div>
    </div>
  );
}

/**
 * Public Nosotros screen (PRD #49 S3) — hero, the gym's own story + pull-quote, stat tiles, values, coach
 * roster, class formats, facilities, closing CTA. Every content section is read from the real catalog over
 * the anon marketing readers; nothing about the gym is hardcoded. The brand VOICE (the "la fragua" prose,
 * the pull-quote, the neon tagline) is the gym's own `about_story`/`about_pull_quote`/`about_tagline` DATA —
 * so RED reads RED and Forge reads Forge from the same neutral markup; a gym that hasn't authored its story
 * falls back to telling it through stats + roster. The gym is resolved from the proxy's x-gym stamp (never
 * an authz claim — ADR-0012); paint is token-driven, no brand import in this file.
 */
export default async function NosotrosPage() {
  const slug = (await headers()).get("x-gym");
  const gym = slug ? await getMarketingGym(slug) : null;

  const [valores, stats, coaches, formatos, instalaciones] = gym
    ? await Promise.all([
        getValoresPublicos(gym.id),
        getStatsPublicas(gym.id),
        getCoachesPublicos(gym.id),
        getFormatosPublicos(gym.id),
        getInstalacionesPublicas(gym.id),
      ])
    : [[], [], [], [], []];

  // The neon tagline is the gym's own `about_tagline` data; until an operator authors it, fall back to
  // stitching their value titles (the mock's "Fuerza · Disciplina · Resultado" IS the three values).
  const tagline = gym?.aboutTagline ?? valores.map((v) => v.title).join(" · ");

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <section className="max-w-2xl">
        {gym && (
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">
            Nosotros · {gym.brandName}
          </span>
        )}
        <h1 className="mt-3 text-4xl font-extrabold uppercase tracking-tight text-fg">
          Quiénes somos
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Conoce al equipo, los valores y el espacio donde vas a entrenar.
        </p>
        {tagline && (
          <p className="cm-vals mt-4">
            <span className="text-sm font-semibold text-accent">{tagline}</span>
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/registro"
            className="inline-flex justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Empezar ahora
          </Link>
          <Link
            href="/precios"
            className="inline-flex justify-center rounded-full border border-line px-6 py-3 text-sm font-semibold text-fg hover:border-accent hover:text-accent"
          >
            Ver planes
          </Link>
        </div>
      </section>

      {gym?.aboutStory && (
        <section className="mt-12">
          <SectionLabel>Nuestra historia</SectionLabel>
          <div className="mt-4 flex flex-col gap-4">
            {gym.aboutStory.split(/\n\n+/).map((para, i) => (
              <p key={i} className="text-sm leading-relaxed text-muted">
                {para}
              </p>
            ))}
          </div>
          {gym.aboutPullQuote && (
            <blockquote className="mt-6 border-l-2 border-accent pl-4 text-lg font-semibold italic leading-snug text-fg">
              {gym.aboutPullQuote}
            </blockquote>
          )}
        </section>
      )}

      {stats.length > 0 && (
        <section className="mt-12">
          <SectionLabel>En números</SectionLabel>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <div
                key={s.id}
                className="rounded-2xl border border-line bg-surface p-4 text-center"
              >
                <dt className="text-2xl font-bold text-fg">{s.value}</dt>
                <dd className="mt-1 text-xs text-muted">{s.label}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {valores.length > 0 && (
        <section className="mt-12">
          <SectionLabel>Lo que nos mueve</SectionLabel>
          <h2 className="mt-2 text-2xl font-bold text-fg">Nuestros valores</h2>
          <div className="mt-5 flex flex-col gap-5">
            {valores.map((v, i) => (
              <div key={v.id} className="flex gap-4">
                <span className="font-mono text-sm font-semibold text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <div className="text-base font-bold text-fg">{v.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{v.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {coaches.length > 0 && (
        <section className="mt-12">
          <SectionLabel>El equipo</SectionLabel>
          <h2 className="mt-2 text-2xl font-bold text-fg">Coaches</h2>
          <div className="mt-4">
            {coaches.map((c) => (
              <CoachCard key={c.id} coach={c} />
            ))}
          </div>
        </section>
      )}

      {formatos.length > 0 && (
        <section className="mt-12">
          <SectionLabel>Cómo entrenamos</SectionLabel>
          <h2 className="mt-2 text-2xl font-bold text-fg">Formatos</h2>
          <div className="mt-5 flex flex-col gap-5">
            {formatos.map((f) => {
              // nivel · duración from the operator's real fields (NULLs drop out); the mock's fixed
              // "45–60 min" is brand copy, not data.
              const subtitle = [
                f.description ?? f.level,
                f.durationMin != null ? `${f.durationMin} min` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={f.id} className="flex gap-4">
                  <span aria-hidden className="text-sm font-semibold text-accent">
                    —
                  </span>
                  <div>
                    <div className="text-base font-bold text-fg">{f.name}</div>
                    {subtitle && (
                      <p className="mt-1 text-sm leading-relaxed text-muted">{subtitle}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {instalaciones.length > 0 && (
        <section className="mt-12">
          <SectionLabel>El espacio</SectionLabel>
          <h2 className="mt-2 text-2xl font-bold text-fg">Equipo e instalaciones</h2>
          <dl className="mt-4 flex flex-col divide-y divide-line rounded-3xl border border-line bg-surface px-5">
            {instalaciones.map((f) => (
              <div key={f.id} className="flex items-baseline justify-between gap-4 py-4">
                <dt className="text-sm font-semibold text-fg">{f.name}</dt>
                <dd className="text-right text-sm text-muted">{f.description}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="mx-auto mt-14 max-w-2xl rounded-3xl border border-line bg-sunk p-8 text-center">
        <h3 className="text-2xl font-bold text-fg">Empieza hoy</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Tu primera clase no requiere permanencia. Crea tu cuenta y reserva desde el primer día.
        </p>
        <Link
          href="/registro"
          className="mt-5 inline-flex justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
        >
          Empezar ahora
        </Link>
        {tagline && (
          <p className="cm-vals mt-5">
            <span className="text-xs font-semibold text-accent">{tagline}</span>
          </p>
        )}
      </section>
    </main>
  );
}
