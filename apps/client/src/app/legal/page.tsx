import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Términos y privacidad",
  description: "Términos y condiciones y aviso de privacidad del estudio.",
};

/**
 * Términos y privacidad (slice #62) — the real, reachable legal texts the perfil hub's
 * "Términos y privacidad" row links to. Static content (no CMS), brand-neutral: paint is
 * token-driven, and the texts speak of "el estudio" / "la plataforma" so every gym on the
 * platform renders the same reachable notice without a per-brand string. A plain server
 * page; no auth gate (legal texts are public).
 */
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-lg font-extrabold uppercase tracking-tight text-fg">{titulo}</h2>
      <div className="mt-3 space-y-3 text-[13px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function LegalPage() {
  return (
    <main className="mx-auto w-full max-w-md px-6 pb-16">
      <header className="flex items-center justify-between pt-5">
        <Link
          href="/reservar"
          className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted hover:text-fg"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 4l-6 6 6 6" />
          </svg>
          Volver
        </Link>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Legal</span>
        <span className="min-w-[64px]" />
      </header>

      <h1 className="mt-8 text-3xl font-extrabold uppercase leading-none tracking-tight text-fg">
        Términos y privacidad
      </h1>

      <Seccion titulo="Términos y condiciones">
        <p>
          Al crear una cuenta y reservar clases aceptas estos términos. Tu membresía es personal e
          intransferible: las clases y el saldo de tu plan solo los usas tú.
        </p>
        <p>
          Reservar aparta tu lugar en una clase. Puedes cancelar sin costo hasta 2 horas antes del inicio y
          tu clase regresa a tu plan. Si no cancelas a tiempo y no te presentas, la clase se descuenta de tu
          plan. En planes ilimitados no hay descuento por clase.
        </p>
        <p>
          El estudio puede ajustar el horario, los cupos o el contenido de las clases cuando sea necesario.
          Sigue en todo momento las indicaciones de tu coach; entrenas bajo tu propia responsabilidad y
          debes informar al estudio de cualquier condición de salud relevante.
        </p>
        <p>
          Puedes dejar de usar la plataforma cuando quieras. No hay permanencia ni penalización por
          cancelar tu cuenta.
        </p>
      </Seccion>

      <Seccion titulo="Aviso de privacidad">
        <p>
          El estudio es responsable del tratamiento de tus datos personales. Recabamos tu nombre, teléfono
          y correo para administrar tu membresía, confirmar tus reservas y enviarte avisos operativos sobre
          tus clases.
        </p>
        <p>
          Usamos tus datos únicamente para prestarte el servicio. No los vendemos ni los compartimos con
          terceros con fines comerciales; solo con los proveedores que hacen funcionar la plataforma, bajo
          obligación de confidencialidad.
        </p>
        <p>
          Puedes acceder, rectificar o cancelar tus datos, así como oponerte a su uso, escribiendo al
          estudio por los canales de la sección Ayuda y contacto. Tus preferencias de notificación las
          controlas desde tu perfil en cualquier momento.
        </p>
      </Seccion>
    </main>
  );
}
