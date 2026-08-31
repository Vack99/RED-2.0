"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";

import { validarCorreo } from "../../../lib/auth-validacion";
import { codigoAction, type CodigoActionState } from "../actions";

const INICIAL: CodigoActionState = { status: "idle" };

// Same underline field styling /entrar uses (the mock's `.field`).
const LABEL = "block text-[10px] font-bold uppercase tracking-[2px] transition-colors";
const INPUT =
  "w-full border-b bg-transparent py-3 text-[16px] text-fg outline-none transition-colors";

/**
 * Code-entry form for the OTP fallback rail. Deliberately the smallest possible surface:
 * the address and the 6 digits printed in the confirmation mail. No captcha and no
 * password — GoTrue rate-limits the verify itself, and every refusal renders the action's
 * single opaque message, so nothing here can be used to probe which addresses exist.
 */
export function CodigoForm() {
  const [state, dispatch, pending] = useActionState(codigoAction, INICIAL);
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [errCorreo, setErrCorreo] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ce = validarCorreo(email);
    setErrCorreo(ce);
    if (ce || codigo.length !== 6) return;
    const fd = new FormData();
    fd.set("email", email);
    fd.set("codigo", codigo);
    // Dispatch inside a transition: a redirect() thrown by the action only drives the
    // router when the dispatch runs as a transition (React 19).
    startTransition(() => dispatch(fd));
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col" style={{ maxWidth: 340, gap: 24 }}>
      <div className="text-center">
        <h1 className="text-[26px] font-light uppercase tracking-[6px] text-fg" style={{ lineHeight: 1 }}>
          Tu código
        </h1>
        <p className="mt-3.5 text-[13px] text-muted">
          Escribe el código de 6 dígitos que viene en el correo, debajo del enlace.
        </p>
      </div>

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

      <div className="group">
        <label className={`${LABEL} text-muted group-focus-within:text-accent`} style={errCorreo ? { color: "var(--red)" } : undefined}>
          Correo
        </label>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setErrCorreo(validarCorreo(email))}
          placeholder="tu@correo.com"
          className={`${INPUT} focus:border-accent`}
          style={{ borderColor: errCorreo ? "var(--red)" : "var(--line-soft)" }}
        />
        {errCorreo && (
          <p className="mt-2 text-[10.5px]" style={{ color: "var(--red)" }}>{errCorreo}</p>
        )}
      </div>

      <div className="group">
        <label className={`${LABEL} text-muted group-focus-within:text-accent`}>Código</label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          className={`${INPUT} text-center font-mono focus:border-accent`}
          style={{ borderColor: "var(--line-soft)", letterSpacing: 10 }}
        />
      </div>

      <button
        type="submit"
        disabled={pending || codigo.length !== 6}
        className="flex w-full items-center justify-center gap-2 bg-accent py-4 text-[13px] font-extrabold uppercase tracking-[1.6px] text-accent-fg transition hover:brightness-105 disabled:opacity-40"
      >
        <span>{pending ? "Entrando…" : "Entrar"}</span>
        {!pending && (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 10h10M11 6l4 4-4 4" />
          </svg>
        )}
      </button>

      <div className="flex flex-col items-center gap-3 text-center text-[13px]">
        <p className="text-muted">
          ¿No tienes un código?{" "}
          {/* The motivo is load-bearing: bare `/entrar` renders no resend control. */}
          <Link href="/entrar?error=sin-codigo" className="font-semibold text-accent">
            Pide un correo nuevo
          </Link>
        </p>
        <Link href="/" className="text-[11px] font-semibold uppercase tracking-[1px] text-muted hover:text-fg">
          Volver al inicio
        </Link>
      </div>
    </form>
  );
}
