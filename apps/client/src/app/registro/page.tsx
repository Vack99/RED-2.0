import { headers } from "next/headers";

import { RegistroForm } from "./_components/registro-form";

/**
 * Member self-registration page (unstyled — RED design is Phase 4). The gym is a
 * host fact: the proxy stamps `x-gym` only when the host resolves to a tenant, so
 * an unknown host has no `x-gym` and the page REFUSES rather than registering
 * against a default gym (ADR-0009 — a registro's gym is server-authoritative, and
 * an unknown host resolves to no tenant). The header display is UX only; the server
 * action re-resolves the gym from the host before writing.
 */
export default async function RegistroPage() {
  const gym = (await headers()).get("x-gym");
  if (!gym) {
    return (
      <main style={{ padding: 20 }}>
        <h1>Sitio no reconocido</h1>
        <p>Este dominio no está asociado a ningún gimnasio, así que no es posible registrarse aquí.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 20 }}>
      <RegistroForm />
      <p>
        ¿Ya tienes cuenta? <a href="/entrar">Entrar</a>
      </p>
    </main>
  );
}
