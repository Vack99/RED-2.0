"use client";

import Script from "next/script";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";

import { validarCorreo } from "../../../lib/auth-validacion";
import { activarAction, type ActivarActionState } from "../actions";

const INICIAL: ActivarActionState = { status: "idle" };

// Cloudflare's documented ALWAYS-PASS test sitekey — the default so dev works with no real key; the
// owner swaps in the production sitekey via NEXT_PUBLIC_TURNSTILE_SITE_KEY post-queue.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

// Turnstile's implicit render calls these by NAME off `window` once the challenge resolves — submit
// stays gated on a real token rather than firing the instant the form mounts.
type TurnstileWindow = typeof window & {
  onActivarTurnstileSuccess?: (token: string) => void;
  onActivarTurnstileExpired?: () => void;
  onActivarTurnstileError?: () => void;
};

const LABEL = "block text-[10px] font-bold uppercase tracking-[2px] text-muted transition-colors group-focus-within:text-accent";
const INPUT = "w-full border-b bg-transparent py-3 text-[15px] text-fg outline-none transition-colors focus:border-accent";
const HELP = "mt-1.5 text-[10.5px] text-muted";

/**
 * Single-email activation form (issue #132), brand-neutral (paint via the resolved hero's token
 * contract) — visually identical to /registro. The member types the email their gym registered and
 * passes the Turnstile bot check; the action provisions + logs them in and hands off to set-password.
 * No account fields: activation confirms an existing paid roster row, it does not create identity.
 */
export function ActivarForm({
  codigo,
  invitacion,
}: {
  /** The valid invite code to thread through activation; null = no valid code. */
  readonly codigo?: string | null;
  /** The resolved invite identity for the banner; null = no invite. */
  readonly invitacion?: { readonly gym: string; readonly nombre: string } | null;
}) {
  const [state, dispatch, pending] = useActionState(activarAction, INICIAL);

  const [email, setEmail] = useState("");
  const [errCorreo, setErrCorreo] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    const w = window as TurnstileWindow;
    w.onActivarTurnstileSuccess = (token) => setTurnstileToken(token);
    w.onActivarTurnstileExpired = () => setTurnstileToken(null);
    w.onActivarTurnstileError = () => setTurnstileToken(null);
  }, []);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ce = validarCorreo(email);
    setErrCorreo(ce);
    if (ce) return;
    // Build from the form so Turnstile's injected `cf-turnstile-response` rides along.
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  if (state.status === "yaReclamado") {
    return (
      <div className="flex w-full flex-col text-center" style={{ maxWidth: 340, gap: 16 }}>
        <h1 className="text-[22px] font-light uppercase tracking-[5px] text-fg">Tu cuenta ya está activa</h1>
        <p role="status" className="text-[13px] text-muted">
          Esta invitación ya se usó. Inicia sesión con tu correo y contraseña; si no la recuerdas, puedes
          recuperarla.
        </p>
        <Link
          href="/entrar"
          className="mt-1 flex w-full items-center justify-center bg-accent py-4 text-[13px] font-extrabold uppercase tracking-[1.6px] text-accent-fg transition hover:brightness-105"
        >
          Iniciar sesión
        </Link>
        <Link href="/entrar" className="text-[11px] font-semibold uppercase tracking-[1px] text-muted hover:text-fg">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
    );
  }

  if (state.status === "cuentaExistente") {
    return (
      <div className="flex w-full flex-col text-center" style={{ maxWidth: 340, gap: 16 }}>
        <h1 className="text-[22px] font-light uppercase tracking-[5px] text-fg">Revisa tu correo</h1>
        <p role="status" className="text-[13px] text-muted">
          Ya tienes una cuenta con este correo. Te enviamos un enlace para confirmar y vincular tu
          membresía — revisa tu correo.
        </p>
        <Link href="/entrar" className="text-[11px] font-semibold uppercase tracking-[1px] text-muted hover:text-fg">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <form onSubmit={onSubmit} className="flex w-full flex-col" style={{ maxWidth: 340, gap: 22 }}>
        {codigo && <input type="hidden" name="codigo" value={codigo} />}

        {invitacion && (
          <div className="border px-4 py-3 text-center" style={{ borderColor: "var(--accent)" }}>
            <p className="text-[10px] font-bold uppercase tracking-[2px] text-accent">Invitación</p>
            <p className="mt-1.5 text-[13px] text-fg">
              Invitación de <span className="font-semibold">{invitacion.gym}</span> para{" "}
              <span className="font-semibold">{invitacion.nombre}</span>
            </p>
          </div>
        )}

        <div className="text-center">
          <h1 className="text-[30px] font-light uppercase tracking-[5px] text-fg" style={{ textIndent: 5, lineHeight: 1 }}>
            Activa tu cuenta
          </h1>
          <p className="mt-3.5 text-[13px] text-muted">
            Confirma el correo con el que te registró tu gimnasio para entrar a tu app.
          </p>
        </div>

        {state.status === "error" && (
          <div className="flex flex-col gap-2.5">
            <div
              role="alert"
              className="flex items-start gap-2 border px-4 py-3 text-[12.5px] font-medium"
              style={{ color: "var(--red)", borderColor: "var(--red)", background: "var(--red-soft)" }}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0">
                <path d="M10 3l8 14H2z" />
                <path d="M10 9v3M10 14v.5" />
              </svg>
              <span>{state.mensaje}</span>
            </div>
            {state.login && (
              <p className="text-center text-[12.5px] text-muted">
                Si ya activaste tu cuenta,{" "}
                <Link href="/entrar" className="font-semibold text-accent">
                  inicia sesión
                </Link>
                .
              </p>
            )}
          </div>
        )}

        <div className="group">
          <label className={LABEL} style={errCorreo ? { color: "var(--red)" } : undefined}>
            Correo con el que te registró tu gimnasio
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
            <p className={HELP}>Debe coincidir con el que registró tu gimnasio.</p>
          )}
        </div>

        <div
          className="cf-turnstile"
          data-sitekey={SITE_KEY}
          data-callback="onActivarTurnstileSuccess"
          data-expired-callback="onActivarTurnstileExpired"
          data-error-callback="onActivarTurnstileError"
        />

        <button
          type="submit"
          disabled={!turnstileToken || pending}
          className="flex w-full items-center justify-center gap-2 bg-accent py-4 text-[13px] font-extrabold uppercase tracking-[1.6px] text-accent-fg transition hover:brightness-105 disabled:opacity-40"
        >
          <span>{pending ? "Activando…" : "Activar mi cuenta"}</span>
          {!pending && (
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 10h10M11 6l4 4-4 4" />
            </svg>
          )}
        </button>

        <div className="flex flex-col items-center gap-3 text-center text-[13px]">
          <p className="text-muted">
            ¿Ya tienes cuenta?{" "}
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
