"use client";

import Script from "next/script";
import { useActionState } from "react";

import { enviarContactoAction, type ContactoActionState } from "../actions";

const INICIAL: ContactoActionState = { status: "idle" };
/** Cloudflare's documented ALWAYS-PASS test sitekey — the default so dev works with no real key; the
 *  owner swaps in the production sitekey via NEXT_PUBLIC_TURNSTILE_SITE_KEY post-queue. */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

function fieldClass(invalid: boolean | undefined): string {
  return `w-full rounded-xl border bg-surface px-4 py-3 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent ${
    invalid ? "border-accent" : "border-line"
  }`;
}

/**
 * The contact-form island — a native `<form action>` over the server action (`useActionState`), plus the
 * Turnstile widget (which injects the hidden `cf-turnstile-response` token the action verifies). On
 * success the form is replaced by a confirmation panel; field errors render inline per the mock.
 */
export function ContactoForm() {
  const [state, action, pending] = useActionState(enviarContactoAction, INICIAL);
  const invalid = state.status === "invalid" ? state.fields : undefined;

  if (state.status === "success") {
    return (
      <div className="rounded-3xl border border-line bg-surface p-6 text-center" role="status">
        <h3 className="text-lg font-bold text-fg">Mensaje enviado</h3>
        <p className="mt-2 text-sm text-muted">Gracias por escribirnos. Te contestamos el mismo día.</p>
      </div>
    );
  }

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <form action={action} className="flex flex-col gap-4">
        {state.status === "error" && (
          <p role="alert" className="rounded-xl border border-accent bg-accent-soft px-4 py-3 text-sm text-accent">
            {state.error}
          </p>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">Nombre</span>
          <input name="nombre" type="text" autoComplete="name" placeholder="Tu nombre" className={fieldClass(invalid?.nombre)} />
          {invalid?.nombre && <span className="text-xs text-accent">Escribe tu nombre.</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">Correo</span>
          <input name="correo" type="email" autoComplete="email" placeholder="tucorreo@ejemplo.com" className={fieldClass(invalid?.correo)} />
          {invalid?.correo && <span className="text-xs text-accent">Correo no válido.</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">Mensaje</span>
          <textarea name="mensaje" rows={3} placeholder="Cuéntanos qué necesitas…" className={fieldClass(invalid?.mensaje)} />
          {invalid?.mensaje && <span className="text-xs text-accent">Escribe tu mensaje.</span>}
        </label>

        <div className="cf-turnstile" data-sitekey={SITE_KEY} />

        <button
          type="submit"
          disabled={pending}
          className="inline-flex justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Enviando…" : "Enviar mensaje"}
        </button>
      </form>
    </>
  );
}
