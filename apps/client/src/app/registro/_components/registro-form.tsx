"use client";

import Script from "next/script";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";

import {
  validarCorreo,
  validarNombreCompleto,
  validarPasswordNueva,
  validarTelefono,
} from "../../../lib/auth-validacion";
import { registrarAction, type RegistroActionState } from "../actions";

const INICIAL: RegistroActionState = { status: "idle" };

// Cloudflare's documented ALWAYS-PASS test sitekey — the default so dev works with no real key; the
// owner swaps in the production sitekey via NEXT_PUBLIC_TURNSTILE_SITE_KEY post-queue.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

// Turnstile's implicit render calls these by NAME off `window` once the challenge resolves — the
// Managed widget takes a beat, so submit must stay gated on a real token rather than firing the
// instant the form mounts (B3: an empty `cf-turnstile-response` fails server-side verification).
type TurnstileWindow = typeof window & {
  onRegistroTurnstileSuccess?: (token: string) => void;
  onRegistroTurnstileExpired?: () => void;
  onRegistroTurnstileError?: () => void;
};

// Shared underline-field styling (the mock's `.field`), identical to the entrar screen: uppercase
// micro-label, a bottom-ruled input that turns accent on focus and the semantic `--red` when invalid.
const LABEL = "block text-[10px] font-bold uppercase tracking-[2px] text-muted transition-colors group-focus-within:text-accent";
const INPUT = "w-full border-b bg-transparent py-3 text-[15px] text-fg outline-none transition-colors focus:border-accent";
const HELP = "mt-1.5 text-[10.5px] text-muted";

/**
 * RED-designed member registration, brand-neutral (paint via the resolved hero's token contract).
 * Drives the already-shipped Phase-3 registration action (email+password signUp + claim-by-match on
 * verify); the gym stays host-resolved server-side. Client-side per-field validation mirrors the mock
 * so typos surface inline; the terms+privacy checkbox gates the submit (one box → both timestamps).
 *
 * Turnstile rides inside the form: its api.js injects a hidden `cf-turnstile-response` input, so on a
 * valid submit `new FormData(form)` carries the token to the action's server-side verifier. No prefilled
 * credentials, no dead controls (the terms/privacy names are emphasized text, not stub links).
 */
export function RegistroForm({ brandName }: { readonly brandName: string }) {
  const [state, dispatch, pending] = useActionState(registrarAction, INICIAL);

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [acepta, setAcepta] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const [errNombre, setErrNombre] = useState<string | null>(null);
  const [errCorreo, setErrCorreo] = useState<string | null>(null);
  const [errTelefono, setErrTelefono] = useState<string | null>(null);
  const [errPassword, setErrPassword] = useState<string | null>(null);

  useEffect(() => {
    const w = window as TurnstileWindow;
    w.onRegistroTurnstileSuccess = (token) => setTurnstileToken(token);
    w.onRegistroTurnstileExpired = () => setTurnstileToken(null);
    w.onRegistroTurnstileError = () => setTurnstileToken(null);
  }, []);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ne = validarNombreCompleto(nombre);
    const ce = validarCorreo(email);
    const te = validarTelefono(telefono);
    const pe = validarPasswordNueva(password);
    setErrNombre(ne);
    setErrCorreo(ce);
    setErrTelefono(te);
    setErrPassword(pe);
    if (ne || ce || te || pe) return;
    // Build from the form so Turnstile's injected `cf-turnstile-response` rides along.
    // Transition-wrapped: the confirmation-off arm redirects from the action.
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  if (state.status === "success") {
    return (
      <div className="flex w-full flex-col text-center" style={{ maxWidth: 340, gap: 14 }}>
        <h1 className="text-[22px] font-light uppercase tracking-[6px] text-fg">Revisa tu correo</h1>
        <p role="status" className="text-[13px] text-muted">
          Te enviamos un correo de confirmación. Ábrelo para activar tu cuenta y entrar.
        </p>
        <Link href="/entrar" className="mt-2 text-[11px] font-semibold uppercase tracking-[1px] text-muted hover:text-fg">
          Volver a entrar
        </Link>
      </div>
    );
  }

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <form onSubmit={onSubmit} className="flex w-full flex-col" style={{ maxWidth: 340, gap: 22 }}>
        <div className="text-center">
          <h1 className="text-[30px] font-light uppercase tracking-[5px] text-fg" style={{ textIndent: 5, lineHeight: 1 }}>
            Crear cuenta
          </h1>
          <p className="mt-3.5 text-[13px] text-muted">
            Únete a {brandName}. Reserva tu clase y empieza a entrenar.
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
          <label className={LABEL} style={errNombre ? { color: "var(--red)" } : undefined}>
            Nombre completo
          </label>
          <input
            name="nombre"
            type="text"
            autoComplete="name"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={() => setErrNombre(validarNombreCompleto(nombre))}
            placeholder="Tu nombre y apellido"
            className={INPUT}
            style={{ borderColor: errNombre ? "var(--red)" : "var(--line-soft)" }}
          />
          {errNombre && <p className="mt-2 text-[10.5px]" style={{ color: "var(--red)" }}>{errNombre}</p>}
        </div>

        <div className="group">
          <label className={LABEL} style={errCorreo ? { color: "var(--red)" } : undefined}>
            Correo
          </label>
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setErrCorreo(validarCorreo(email))}
            placeholder="tu@correo.com"
            className={INPUT}
            style={{ borderColor: errCorreo ? "var(--red)" : "var(--line-soft)" }}
          />
          {errCorreo ? (
            <p className="mt-2 text-[10.5px]" style={{ color: "var(--red)" }}>{errCorreo}</p>
          ) : (
            <p className={HELP}>Lo usarás para iniciar sesión.</p>
          )}
        </div>

        <div className="group">
          <label className={LABEL} style={errTelefono ? { color: "var(--red)" } : undefined}>
            Teléfono / WhatsApp
          </label>
          <div
            className="flex items-center border-b transition-colors focus-within:border-accent"
            style={{ borderColor: errTelefono ? "var(--red)" : "var(--line-soft)" }}
          >
            <span className="pr-2 text-[15px] font-semibold text-muted">+52</span>
            <input
              name="telefono"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              onBlur={() => setErrTelefono(validarTelefono(telefono))}
              placeholder="81 1234 5678"
              className="min-w-0 flex-1 border-none bg-transparent py-3 text-[15px] text-fg outline-none"
            />
          </div>
          {errTelefono ? (
            <p className="mt-2 text-[10.5px]" style={{ color: "var(--red)" }}>{errTelefono}</p>
          ) : (
            <p className={HELP}>Te confirmamos reservas y avisos por WhatsApp.</p>
          )}
        </div>

        <div className="group">
          <label className={LABEL} style={errPassword ? { color: "var(--red)" } : undefined}>
            Contraseña
          </label>
          <div
            className="flex items-center border-b transition-colors focus-within:border-accent"
            style={{ borderColor: errPassword ? "var(--red)" : "var(--line-soft)" }}
          >
            <input
              name="password"
              type={showPass ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setErrPassword(validarPasswordNueva(password))}
              placeholder="••••••••"
              className="min-w-0 flex-1 border-none bg-transparent py-3 text-[15px] text-fg outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPass((s) => !s)}
              aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
              aria-pressed={showPass}
              className="flex py-2 pl-3 text-muted hover:text-fg"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
                {!showPass && <line x1="4" y1="20" x2="20" y2="4" />}
              </svg>
            </button>
          </div>
          {errPassword ? (
            <p className="mt-2 text-[10.5px]" style={{ color: "var(--red)" }}>{errPassword}</p>
          ) : (
            <p className={HELP}>Mínimo 8 caracteres.</p>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-3 text-[12.5px] text-muted">
          <input
            name="acepta"
            type="checkbox"
            checked={acepta}
            onChange={(e) => setAcepta(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
          />
          <span>
            Acepto los <span className="font-semibold text-fg">Términos y Condiciones</span> y el{" "}
            <span className="font-semibold text-fg">Aviso de Privacidad</span>.
          </span>
        </label>

        <div
          className="cf-turnstile"
          data-sitekey={SITE_KEY}
          data-callback="onRegistroTurnstileSuccess"
          data-expired-callback="onRegistroTurnstileExpired"
          data-error-callback="onRegistroTurnstileError"
        />

        <button
          type="submit"
          disabled={!acepta || !turnstileToken || pending}
          className="flex w-full items-center justify-center gap-2 bg-accent py-4 text-[13px] font-extrabold uppercase tracking-[1.6px] text-accent-fg transition hover:brightness-105 disabled:opacity-40"
        >
          <span>{pending ? "Creando cuenta…" : "Crear cuenta"}</span>
          {!pending && (
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 10h10M11 6l4 4-4 4" />
            </svg>
          )}
        </button>

        <div className="flex flex-col items-center gap-3 text-center text-[13px]">
          <p className="text-muted">
            ¿Ya eres miembro?{" "}
            <Link href="/entrar" className="font-semibold text-accent">
              Inicia sesión
            </Link>
          </p>
          <Link href="/" className="text-[11px] font-semibold uppercase tracking-[1px] text-muted hover:text-fg">
            Volver al inicio
          </Link>
        </div>
      </form>
    </>
  );
}
