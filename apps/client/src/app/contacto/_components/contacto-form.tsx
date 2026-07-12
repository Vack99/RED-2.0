"use client";

import Script from "next/script";
import { useActionState, useEffect, useState } from "react";

import { enviarContactoAction, type ContactoActionState } from "../actions";

const INICIAL: ContactoActionState = { status: "idle" };
/** Cloudflare's documented ALWAYS-PASS test sitekey — the default so dev works with no real key; the
 *  owner swaps in the production sitekey via NEXT_PUBLIC_TURNSTILE_SITE_KEY post-queue. */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

// Turnstile's implicit render calls these by NAME off `window` once the challenge resolves — the
// Managed widget takes a beat, so submit must stay gated on a real token rather than firing the
// instant the form mounts (B3: an empty `cf-turnstile-response` fails server-side verification).
type TurnstileWindow = typeof window & {
  onContactoTurnstileSuccess?: (token: string) => void;
  onContactoTurnstileExpired?: () => void;
  onContactoTurnstileError?: () => void;
};

// Underline field styling (the mock's `.field`), identical to the entrar/registro screens:
// uppercase micro-label, a bottom-ruled input/textarea that turns accent on focus and the
// semantic `--red` when invalid (no Tailwind utility maps the hairline `--line-soft`, so it
// rides inline, as the auth forms do).
const LABEL = "block text-[10px] font-bold uppercase tracking-[2px] transition-colors";
const INPUT =
  "w-full border-b bg-transparent py-3 text-[15px] text-fg outline-none transition-colors focus:border-accent";

/**
 * The contact-form island — a native `<form action>` over the server action (`useActionState`), plus the
 * Turnstile widget (which injects the hidden `cf-turnstile-response` token the action verifies). On
 * success the form is replaced by a confirmation panel; field errors render inline per the mock.
 */
export function ContactoForm() {
  const [state, action, pending] = useActionState(enviarContactoAction, INICIAL);
  const invalid = state.status === "invalid" ? state.fields : undefined;
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    const w = window as TurnstileWindow;
    w.onContactoTurnstileSuccess = (token) => setTurnstileToken(token);
    w.onContactoTurnstileExpired = () => setTurnstileToken(null);
    w.onContactoTurnstileError = () => setTurnstileToken(null);
  }, []);

  if (state.status === "success") {
    return (
      <div className="rounded-3xl border border-line bg-surface p-6 text-center" role="status">
        <h3 className="text-lg font-extrabold uppercase tracking-tight text-fg">Mensaje enviado</h3>
        <p className="mt-2 text-xs text-muted">Gracias por escribirnos. Te contestamos el mismo día.</p>
      </div>
    );
  }

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <form action={action} className="flex flex-col gap-6">
        {state.status === "error" && (
          <div
            role="alert"
            className="flex items-start gap-2 border px-4 py-3 text-[12.5px] font-medium"
            style={{ color: "var(--red)", borderColor: "var(--red)", background: "var(--red-soft)" }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0">
              <path d="M10 3l8 14H2z" />
              <path d="M10 9v3M10 14v.5" />
            </svg>
            <span>{state.error}</span>
          </div>
        )}

        <label className="group flex flex-col gap-0">
          <span className={`${LABEL} text-muted group-focus-within:text-accent`} style={invalid?.nombre ? { color: "var(--red)" } : undefined}>
            Nombre
          </span>
          <input
            name="nombre"
            type="text"
            autoComplete="name"
            placeholder="Tu nombre"
            className={INPUT}
            style={{ borderColor: invalid?.nombre ? "var(--red)" : "var(--line-soft)" }}
          />
          {invalid?.nombre && (
            <span className="mt-2 block text-[10.5px]" style={{ color: "var(--red)" }}>Escribe tu nombre.</span>
          )}
        </label>

        <label className="group flex flex-col gap-0">
          <span className={`${LABEL} text-muted group-focus-within:text-accent`} style={invalid?.correo ? { color: "var(--red)" } : undefined}>
            Correo
          </span>
          <input
            name="correo"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="tucorreo@ejemplo.com"
            className={INPUT}
            style={{ borderColor: invalid?.correo ? "var(--red)" : "var(--line-soft)" }}
          />
          {invalid?.correo && (
            <span className="mt-2 block text-[10.5px]" style={{ color: "var(--red)" }}>Correo no válido.</span>
          )}
        </label>

        <label className="group flex flex-col gap-0">
          <span className={`${LABEL} text-muted group-focus-within:text-accent`} style={invalid?.mensaje ? { color: "var(--red)" } : undefined}>
            Mensaje
          </span>
          <textarea
            name="mensaje"
            rows={3}
            placeholder="Cuéntanos qué necesitas…"
            className={`${INPUT} resize-none leading-relaxed`}
            style={{ borderColor: invalid?.mensaje ? "var(--red)" : "var(--line-soft)" }}
          />
          {invalid?.mensaje && (
            <span className="mt-2 block text-[10.5px]" style={{ color: "var(--red)" }}>Escribe tu mensaje.</span>
          )}
        </label>

        <div
          className="cf-turnstile"
          data-sitekey={SITE_KEY}
          data-callback="onContactoTurnstileSuccess"
          data-expired-callback="onContactoTurnstileExpired"
          data-error-callback="onContactoTurnstileError"
        />

        <button
          type="submit"
          disabled={!turnstileToken || pending}
          className="flex w-full items-center justify-center gap-2 bg-accent py-4 text-[13px] font-extrabold uppercase tracking-[1.6px] text-accent-fg transition hover:brightness-105 disabled:opacity-40"
        >
          {pending ? "Enviando…" : "Enviar mensaje"}
        </button>
      </form>
    </>
  );
}
