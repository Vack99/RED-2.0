import type { Metadata, Route } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { brands, DEFAULT_BRAND, type BrandId } from "@gym/brand";
import {
  getContacto,
  getHorarioHoyPublico,
  getMarketingGym,
  getPlanesPublicos,
} from "@gym/data/server/marketing";
import { heroCtaVista } from "../../lib/reserva-vista";
import { PricingTeaser } from "../_components/pricing-teaser";

export const metadata: Metadata = {
  title: "Inicio",
  description:
    "Reserva tu clase y entrena desde hoy. Sin permanencia, cancelas cuando quieras.",
};

/**
 * The public comercial landing (PRD #49 S2, mock `comercial` slot): the gym's identity plus a
 * pricing teaser, always reading the real anon catalog, none hardcoded. The gym is resolved from
 * the proxy's `x-gym` stamp; the hero lockup from the `x-brand` module. Paint is token-driven, so
 * a RED host renders RED and a Forge host renders Forge with no brand-specific copy in this file.
 *
 * Modos Lista/Cupo (#326/#332): on Cupo (`reservasHabilitadas`) this is UNCHANGED — the
 * today-schedule teaser, "Reservar clase" hero, and generic footer line. On Lista (no booking
 * surface at all) the schedule teaser never renders and never fetches; the hero CTA reads
 * "Ver planes" (`heroCtaVista`); and hours/location/WhatsApp sections take its place, built from
 * the SAME `getContacto` reader Contacto already uses. No "Reservar" copy survives on that arm.
 *
 * Marketing prose (the tagline, footer descriptor, Cupo's generic hours line) has no data column
 * yet on the Cupo arm — it stays generic, platform-true copy (the same posture as the Precios
 * "Todos los planes incluyen" row), never a per-gym claim; Lista's hours ARE per-gym now
 * (`gym_contact.hours_text`, #332) because that arm has nothing else to say the schedule teaser
 * used to say.
 */
export default async function Home() {
  const h = await headers();
  const slug = h.get("x-gym");
  const stampedBrand = h.get("x-brand");
  const brandId: BrandId =
    stampedBrand !== null && Object.hasOwn(brands, stampedBrand)
      ? (stampedBrand as BrandId)
      : DEFAULT_BRAND;
  const Logo = brands[brandId].logo;
  const { tagline } = brands[brandId].copy;

  const gym = slug ? await getMarketingGym(slug) : null;
  const reservasHabilitadas = gym?.bookingEnabled ?? true;
  const lista = gym != null && !reservasHabilitadas;
  const cta = heroCtaVista(reservasHabilitadas);

  const [planes, horario, contacto] = gym
    ? await Promise.all([
        getPlanesPublicos(gym.id),
        reservasHabilitadas ? getHorarioHoyPublico(gym.id, gym.timezone) : Promise.resolve([]),
        lista ? getContacto(gym.id) : Promise.resolve(null),
      ])
    : [[], [], null];
  const brandName = gym?.brandName ?? brands[brandId].copy.name;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col pb-14">
      <section className="cm-hero flex flex-col items-center px-7 pt-14 text-center">
        <Logo size={200} animate />
        <div className="cm-sub mt-6 flex w-full items-center justify-center gap-3.5">
          <div className="ln h-px max-w-[46px] flex-1 bg-line" aria-hidden />
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
            Entrenamiento funcional
          </span>
          <div className="ln h-px max-w-[46px] flex-1 bg-line" aria-hidden />
        </div>
        {tagline ? (
          <div className="cm-vals mt-[18px]">
            <span>{tagline}</span>
          </div>
        ) : (
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.14em] text-accent">
            Reserva. Entrena. Avanza.
          </p>
        )}

        <Link
          href={cta.href}
          className="btn-primary mt-10 inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-semibold text-accent-fg hover:opacity-90"
        >
          {cta.label}
          <span aria-hidden>→</span>
        </Link>
      </section>

      <PricingTeaser planes={planes} />

      {!lista && (
        <section className="cm-sched mt-12 px-7">
          <h2 className="h text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Hoy en {brandName}
          </h2>
          {horario.length > 0 ? (
            <div className="mt-4">
              {horario.map((s) => (
                <Link
                  key={s.id}
                  href="/reservar"
                  className="cm-srow flex items-baseline justify-between border-t border-line py-3.5 last:border-b"
                >
                  <span className="flex items-baseline gap-[18px]">
                    <span className="min-w-[46px] text-[13px] font-bold tabular-nums text-accent">
                      {s.hora}
                    </span>
                    <span className="text-[15px] font-medium text-fg">
                      {s.tipo}
                    </span>
                  </span>
                  <span className="text-[11px] tabular-nums text-muted">
                    {s.disponibles} lugares
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Hoy no hay clases programadas. Vuelve mañana.
            </p>
          )}
        </section>
      )}

      {lista && (
        <section className="mt-12 px-7">
          <h2 className="h text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Horario
          </h2>
          <p className="mt-4 text-sm text-fg">
            {contacto?.horarioTexto ?? "Horario próximamente."}
          </p>
        </section>
      )}

      {lista && contacto?.addressLine && (
        <section className="mt-10 px-7">
          <h2 className="h text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Ubicación
          </h2>
          <p className="mt-4 text-sm text-fg">{contacto.addressLine}</p>
          <Link
            href={"/contacto" as Route}
            className="mt-2 inline-block text-[11px] font-semibold uppercase tracking-[0.14em] text-accent"
          >
            Ver mapa →
          </Link>
        </section>
      )}

      {lista && contacto?.whatsapp && (
        <section className="mt-10 px-7">
          <a
            href={`https://wa.me/${contacto.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface px-7 py-3.5 text-sm font-semibold text-fg hover:border-accent"
          >
            Escríbenos por WhatsApp
          </a>
        </section>
      )}

      <footer className="cm-foot mt-14 px-7 text-center">
        <p className="text-[15px] font-medium text-fg">{brandName} — estudio funcional</p>
        <p className="mt-1.5 text-[11px] text-muted">
          Lun a Sáb · desde las 05:30
        </p>
        <div className="mt-5 flex items-center justify-center gap-4">
          {/* Nosotros/Contacto are sibling routes (#52/#53) landing alongside this slice — typed
              `as Route` (Next's intentional-forward-route marker); /precios is already live. */}
          <Link
            href={"/nosotros" as Route}
            className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted hover:text-fg"
          >
            Nosotros
          </Link>
          <Link
            href="/precios"
            className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted hover:text-fg"
          >
            Precios
          </Link>
          <Link
            href={"/contacto" as Route}
            className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted hover:text-fg"
          >
            Contacto
          </Link>
          {/* #256: the aviso de privacidad's ONE pre-login entry point — before this, the legal
              page was only reachable from inside the post-login perfil overlay. */}
          <Link
            href="/legal"
            className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted hover:text-fg"
          >
            Privacidad
          </Link>
        </div>
      </footer>
    </main>
  );
}
