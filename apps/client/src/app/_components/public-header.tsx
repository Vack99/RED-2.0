"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// The two auth routes are full-viewport brand experiences (the login hero frames
// the form); the marketing header — whose own "Entrar" link would point at the
// page you are on — is chrome for the public marketing pages, not the sign-in
// gate. So it hides itself there. A client island (it needs the pathname); the
// brand logo is resolved on the server and passed in as an already-rendered node,
// so no brand import crosses into this file.
const RUTAS_SIN_HEADER = new Set(["/entrar", "/restablecer"]);

export function PublicHeader({ logo }: { readonly logo: ReactNode }) {
  const pathname = usePathname();
  if (RUTAS_SIN_HEADER.has(pathname)) return null;

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-canvas/90 px-5 py-4 backdrop-blur">
      <Link href="/" aria-label="Inicio" className="inline-flex items-center">
        {logo}
      </Link>
      <Link
        href="/entrar"
        className="rounded-full px-4 py-2 text-sm font-semibold text-fg hover:text-accent"
      >
        Entrar
      </Link>
    </header>
  );
}
