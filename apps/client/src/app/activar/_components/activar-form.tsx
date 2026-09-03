"use client";

import Script from "next/script";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";

import { validarCorreo } from "../../../lib/auth-validacion";
import { activarAction, type ActivarActionState } from "../actions";
import { TURNSTILE_SITE_KEY as SITE_KEY } from "../../../lib/turnstile-site-key";

const INICIAL: ActivarActionState = { status: "idle" };

// Turnstile's implicit render calls these by NAME off `window` once the challenge resolves — submit
// stays gated on a real token rather than firing the instant the form mounts.
type TurnstileWindow = typeof window & {
  onActivarTurnstileSuccess?: (token: string) => void;
  onActivarTurnstileExpired?: () => void;
  onActivarTurnstileError?: () => void;
  turnstile?: { reset: (id?: string) => void };
};

// The widget's own failure shapes (incident FC-14): the CDN script never arrives, the challenge
// expires before submit, or Cloudflare rejects it. All three used to leave `turnstileToken` null
// forever with no on-screen sign why — this is the one dictionary the retry UI reads.
const TURNSTILE_MENSAJE = {
  sinCargar: "No pudimos cargar la verificación.",
  expirado: "La verificación expiró.",
  error: "Hubo un problema con la verificación.",
} as const;
type TurnstileProblema = keyof typeof TURNSTILE_MENSAJE;

const LABEL = "block text-[10px] font-bold uppercase tracking-[2px] text-muted transition-colors group-focus-within:text-accent";
const INPUT = "w-full border-b bg-transparent py-3 text-[16px] text-fg outline-none transition-colors focus:border-accent";
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
  correo,
}: {
  /** The valid invite code to thread through activation; null = no valid code. */
  readonly codigo?: string | null;
  /** The resolved invite identity for the banner; null = no invite. */
  readonly invitacion?: { readonly gym: string; readonly nombre: string } | null;
  /** Pre-filled email from the invite link (PRD #130); null = typed-input mode (old emails, shield redirects). */
  readonly correo?: string | null;
}) {
  const [state, dispatch, pending] = useActionState(activarAction, INICIAL);

  const [email, setEmail] = useState("");
  const [errCorreo, setErrCorreo] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileProblema, setTurnstileProblema] = useState<TurnstileProblema | null>(null);
  const turnstileResuelto = useRef(false);

  useEffect(() => {
    const w = window as TurnstileWindow;
    w.onActivarTurnstileSuccess = (token) => {
      turnstileResuelto.current = true;
      setTurnstileToken(token);
      setTurnstileProblema(null);
    };
    w.onActivarTurnstileExpired = () => {
      turnstileResuelto.current = true;
      setTurnstileToken(null);
      setTurnstileProblema("expirado");
    };
    w.onActivarTurnstileError = () => {
      turnstileResuelto.current = true;
      setTurnstileToken(null);
      setTurnstileProblema("error");
    };
    // If the widget script never calls back at all (blocked, offline, dead CDN), the submit
    // button used to stay disabled forever with zero explanation (FC-14) — this is that floor.
    const timer = window.setTimeout(() => {
      if (!turnstileResuelto.current) setTurnstileProblema("sinCargar");
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, []);

  function reintentarTurnstile() {
    if (turnstileProblema === "sinCargar") {
      window.location.reload();
      return;
    }
    setTurnstileProblema(null);
    (window as TurnstileWindow).turnstile?.reset();
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Pre-filled email rides a hidden input, so client validation only applies to the typed field.
    if (!correo) {
      const ce = validarCorreo(email);
      setErrCorreo(ce);
      if (ce) return;
    }
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

  // R2: no second mail. This screen used to promise one, spend the address's 60 s GoTrue
  // budget on it, and — when that budget was already gone, which is exactly what happens
  // when the member registered minutes earlier — render "No salió el correo" with a reload
  // button that walked straight back into the same window. Signing in is the shorter path
  // and it always works: login runs the claim, so the package binds itself on the way in.
  if (state.status === "cuentaExistente") {
    return (
      <div className="flex w-full flex-col text-center" style={{ maxWidth: 340, gap: 16 }}>
        <h1 className="text-[22px] font-light uppercase tracking-[5px] text-fg">Ya tienes cuenta</h1>
        <p role="status" className="text-[13px] text-muted">
          Ya existe una cuenta con <span className="font-semibold text-fg">{state.correo}</span>. Entra
          con tu contraseña — al entrar, tu paquete se vincula solo.
        </p>
        <Link
          href={{ pathname: "/entrar", query: { correo: state.correo } }}
          className="mt-1 flex w-full items-center justify-center bg-accent py-4 text-[13px] font-extrabold uppercase tracking-[1.6px] text-accent-fg transition hover:brightness-105"
        >
          Iniciar sesión
        </Link>
        <p className="text-[11.5px] text-muted">
          ¿Nunca confirmaste tu correo? Abre el mensaje{" "}
          <strong className="font-semibold text-fg">Confirma tu cuenta</strong> más reciente. ¿No
          recuerdas tu contraseña? Puedes pedir una nueva en esa misma pantalla.
        </p>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        async
        defer
        onError={() => setTurnstileProblema("sinCargar")}
      />
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

        {correo ? (
          <div>
            <p className={LABEL}>Tu correo:</p>
            <p className="mt-1 border-b py-3 text-[15px] text-fg" style={{ borderColor: "var(--line-soft)" }}>
              {correo}
            </p>
            <input type="hidden" name="email" value={correo} />
            <p className={HELP}>¿No es tu correo? Contacta a tu gimnasio.</p>
          </div>
        ) : (
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
        )}

        <div
          className="cf-turnstile"
          data-sitekey={SITE_KEY}
          data-callback="onActivarTurnstileSuccess"
          data-expired-callback="onActivarTurnstileExpired"
          data-error-callback="onActivarTurnstileError"
        />
        {turnstileProblema && (
          <div
            role="alert"
            className="flex flex-col items-center gap-2 border px-4 py-3 text-center text-[12.5px] font-medium"
            style={{ color: "var(--red)", borderColor: "var(--red)", background: "var(--red-soft)" }}
          >
            <span>{TURNSTILE_MENSAJE[turnstileProblema]}</span>
            <button
              type="button"
              onClick={reintentarTurnstile}
              className="text-[11px] font-extrabold uppercase tracking-[1.5px] underline underline-offset-2"
            >
              Reintentar
            </button>
          </div>
        )}

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
