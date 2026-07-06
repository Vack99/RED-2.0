import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { getContacto, getMarketingGym, type ContactoDTO } from "@gym/data/server/marketing";

import { ContactoForm } from "./_components/contacto-form";
import { MapBlock } from "./_components/map-block";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Ubicación, horario y canales directos. Escríbenos y te contestamos el mismo día.",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-widest text-muted">{children}</span>;
}

/** One direct-channel row (WhatsApp / correo / Instagram) as a REAL link — rendered only when the gym
 *  provides that channel (no dead rows, no toast stubs). */
function ChannelRow({ badge, label, value, href }: { badge: string; label: string; value: string; href: string }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 hover:border-accent"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
        {badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">{label}</span>
        <span className="block truncate text-sm font-medium text-fg">{value}</span>
      </span>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="shrink-0 text-muted">
        <path d="M8 5l5 5-5 5" />
      </svg>
    </a>
  );
}

function Channels({ contacto }: { contacto: ContactoDTO }) {
  const rows: React.ReactNode[] = [];
  if (contacto.whatsapp) {
    rows.push(
      <ChannelRow key="wa" badge="WA" label="Tel · WhatsApp" value={`+${contacto.whatsapp}`} href={`https://wa.me/${contacto.whatsapp}`} />,
    );
  }
  if (contacto.email) {
    rows.push(<ChannelRow key="em" badge="@" label="Correo" value={contacto.email} href={`mailto:${contacto.email}`} />);
  }
  if (contacto.instagram) {
    rows.push(
      <ChannelRow key="ig" badge="IG" label="Instagram" value={`@${contacto.instagram}`} href={`https://instagram.com/${contacto.instagram}`} />,
    );
  }
  if (rows.length === 0) return null;
  return (
    <section className="mt-10">
      <SectionLabel>Contacto directo</SectionLabel>
      <div className="mt-4 flex flex-col gap-3">{rows}</div>
    </section>
  );
}

/** Public Contacto screen (PRD #49 S1) — map, address, hours, direct channels, and the intake form, all
 *  from real gym data over the anon marketing readers. Paint is token-driven (mirrors Precios), so a RED
 *  host renders RED and a Forge host renders Forge with no brand import here. */
export default async function ContactoPage() {
  const slug = (await headers()).get("x-gym");
  const gym = slug ? await getMarketingGym(slug) : null;
  const contacto = gym ? await getContacto(gym.id) : null;
  const showUbicacion = !!contacto && (!!contacto.addressLine || (contacto.latitude != null && contacto.longitude != null));

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <header>
        {gym && (
          <span className="text-xs font-semibold uppercase tracking-widest text-accent">
            Contacto · {gym.brandName}
          </span>
        )}
        <h1 className="mt-3 text-4xl font-bold text-fg">Contacto</h1>
        <p className="mt-3 text-base text-muted">
          Pásate por el gimnasio o escríbenos. Te contestamos el mismo día.
        </p>
      </header>

      {showUbicacion && (
        <section className="mt-10">
          <SectionLabel>Dónde entrenamos</SectionLabel>
          <div className="mt-4">
            <MapBlock
              latitude={contacto.latitude}
              longitude={contacto.longitude}
              addressLine={contacto.addressLine}
              label={gym?.brandName ?? "Aquí"}
            />
          </div>
          {contacto.addressLine && (
            <div className="mt-4">
              <p className="text-sm font-medium text-fg">{contacto.addressLine}</p>
              {contacto.addressNote && <p className="mt-1 text-sm text-muted">{contacto.addressNote}</p>}
            </div>
          )}
        </section>
      )}

      {contacto && contacto.horarios.length > 0 && (
        <section className="mt-10">
          <SectionLabel>Horario</SectionLabel>
          <dl className="mt-4 flex flex-col divide-y divide-line rounded-3xl border border-line bg-surface px-4">
            {contacto.horarios.map((h) => (
              <div key={h.day} className="flex items-center justify-between py-3">
                <dt className={`text-sm ${h.closed ? "text-muted" : "text-fg"}`}>{h.day}</dt>
                <dd className={`text-sm font-medium ${h.closed ? "text-muted" : "text-fg"}`}>
                  {h.closed ? "Cerrado" : `${h.opens} – ${h.closes}`}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {contacto && <Channels contacto={contacto} />}

      <section className="mt-10">
        <SectionLabel>Mándanos un mensaje</SectionLabel>
        <p className="mb-4 mt-2 text-sm text-muted">
          ¿Dudas de planes, horarios o tu primera clase? Te contestamos el mismo día.
        </p>
        <ContactoForm />
      </section>

      <section className="mx-auto mt-12 rounded-3xl border border-line bg-sunk p-8 text-center">
        <h3 className="text-2xl font-bold text-fg">Deja de pensarlo</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Tu primer entrenamiento te está esperando.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/precios" className="inline-flex justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90">
            Ver planes
          </Link>
          <Link href="/registro" className="inline-flex justify-center rounded-full border border-line px-6 py-3 text-sm font-semibold text-fg hover:border-accent hover:text-accent">
            Crear cuenta
          </Link>
        </div>
      </section>
    </main>
  );
}
