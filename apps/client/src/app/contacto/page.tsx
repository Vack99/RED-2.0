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
  return <span className="text-[10px] font-bold uppercase tracking-[2px] text-muted">{children}</span>;
}

/** The compact "Abierto X–Y" label appended to the Horario header (mock: "Horario · Abierto
 *  Lun–Sáb"), derived from which days aren't closed — no new schema, reuses the same
 *  `horarios` the table below renders. Assumes the array arrives Monday-first (it does: same
 *  order the table already trusts with no re-sort). */
function rangoAbierto(horarios: ContactoDTO["horarios"]): string | null {
  const abiertos = horarios.filter((h) => !h.closed);
  if (abiertos.length === 0) return null;
  if (abiertos.length === horarios.length) return "Todos los días";
  const primero = abiertos[0]!.day;
  const ultimo = abiertos[abiertos.length - 1]!.day;
  return primero === ultimo ? primero : `${primero}–${ultimo}`;
}

/** "Primera clase HH:MM · cierra HH:MM", derived from the earliest opening and latest closing
 *  time across the week — real data, not a hardcoded mock quote. */
function rangoHoras(horarios: ContactoDTO["horarios"]): string | null {
  const opens = horarios.map((h) => h.opens).filter((v): v is string => v != null);
  const closes = horarios.map((h) => h.closes).filter((v): v is string => v != null);
  if (opens.length === 0 || closes.length === 0) return null;
  const primera = opens.reduce((a, b) => (a < b ? a : b));
  const ultima = closes.reduce((a, b) => (a > b ? a : b));
  return `Primera clase ${primera} · cierra ${ultima}`;
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
      <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-line bg-sunk font-mono text-xs font-bold text-accent">
        {badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-muted">{label}</span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-fg">{value}</span>
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
  const abierto = contacto ? rangoAbierto(contacto.horarios) : null;
  const horas = contacto ? rangoHoras(contacto.horarios) : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <header>
        {gym && (
          <span className="text-[10px] font-bold uppercase tracking-[2px] text-accent">
            Contacto · {gym.brandName}
          </span>
        )}
        <h1 className="mt-3 text-4xl font-extrabold uppercase leading-none tracking-tight text-fg">Contacto</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
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
              <p className="text-sm font-semibold text-fg">{contacto.addressLine}</p>
              {contacto.addressNote && <p className="mt-1 text-xs text-muted">{contacto.addressNote}</p>}
            </div>
          )}
        </section>
      )}

      {contacto && contacto.horarios.length > 0 && (
        <section className="mt-10">
          <SectionLabel>Horario{abierto ? ` · Abierto ${abierto}` : ""}</SectionLabel>
          <dl className="mt-4 flex flex-col divide-y divide-line rounded-3xl border border-line bg-surface px-4">
            {contacto.horarios.map((h) => (
              <div key={h.day} className="flex items-center justify-between py-3">
                <dt className={`text-sm ${h.closed ? "text-muted" : "text-fg"}`}>{h.day}</dt>
                <dd className={`font-mono text-sm tabular-nums font-medium ${h.closed ? "text-warning" : "text-fg"}`}>
                  {h.closed ? "Cerrado" : `${h.opens} – ${h.closes}`}
                </dd>
              </div>
            ))}
          </dl>
          {horas && (
            <p className="mt-3 font-mono text-[9.5px] tracking-wide" style={{ color: "var(--muted-soft)" }}>
              {horas}
            </p>
          )}
        </section>
      )}

      {contacto && <Channels contacto={contacto} />}

      <section className="mt-10">
        <SectionLabel>Mándanos un mensaje</SectionLabel>
        <p className="mb-4 mt-2 text-xs text-muted">
          ¿Dudas de planes, horarios o tu primera clase? Te contestamos el mismo día.
        </p>
        <ContactoForm />
      </section>

      <section className="mx-auto mt-12 rounded-3xl border border-line bg-sunk p-8 text-center">
        <h3 className="text-2xl font-extrabold uppercase tracking-tight text-fg">Deja de pensarlo</h3>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted">
          Tu primer entrenamiento te está esperando.
        </p>
        <div className="mt-5 flex flex-col gap-3">
          <Link
            href="/precios"
            className="flex w-full items-center justify-center gap-2 bg-accent py-4 text-[13px] font-extrabold uppercase tracking-[1.6px] text-white transition hover:brightness-105"
          >
            Ver planes
          </Link>
          <Link
            href="/registro"
            className="flex w-full items-center justify-center gap-2 border bg-transparent py-4 text-[12px] font-bold uppercase tracking-[1.4px] text-fg transition hover:bg-surface"
            style={{ borderColor: "var(--line-soft)" }}
          >
            Crear cuenta
          </Link>
        </div>
      </section>
    </main>
  );
}
