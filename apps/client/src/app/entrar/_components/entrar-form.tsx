"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";

import {
  validarCorreo,
  validarPasswordRequerida,
} from "../../../lib/auth-validacion";
import {
  entrarAction,
  resetAction,
  type EntrarActionState,
  type ResetActionState,
} from "../actions";

const LOGIN_INICIAL: EntrarActionState = { status: "idle" };
const RESET_INICIAL: ResetActionState = { status: "idle" };

// Underline field styling (the mock's `.field`): uppercase micro-label, a
// bottom-ruled input that turns accent on focus and danger when invalid. Paint is
// brand-token only — the danger hue is the semantic `--red` (no Tailwind utility
// maps it, so it rides inline, as the admin login does).
const LABEL = "block text-[10px] font-bold uppercase tracking-[2px] transition-colors";
const INPUT =
  "w-full border-b bg-transparent py-3 text-[15px] text-fg outline-none transition-colors";

/**
 * RED-designed member sign-in, brand-neutral (paint via the resolved hero's token
 * contract). Two modes on one screen — sign-in and forgot-password — driven by the
 * already-shipped Phase-3 server actions. Client-side validation gates the round
 * trip so obvious typos surface as inline field errors; a wrong credential still
 * collapses to the action's single opaque banner. No prefilled credentials.
 */
export function EntrarForm() {
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [loginState, dispatchLogin, loginPending] = useActionState(entrarAction, LOGIN_INICIAL);
  const [resetState, dispatchReset, resetPending] = useActionState(resetAction, RESET_INICIAL);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [errCorreo, setErrCorreo] = useState<string | null>(null);
  const [errPassword, setErrPassword] = useState<string | null>(null);

  function onSubmitLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ce = validarCorreo(email);
    const pe = validarPasswordRequerida(password);
    setErrCorreo(ce);
    setErrPassword(pe);
    if (ce || pe) return;
    const fd = new FormData();
    fd.set("email", email);
    fd.set("password", password);
    // Dispatch inside a transition: a redirect() thrown by the action only
    // drives the router when the dispatch runs as a transition (React 19).
    startTransition(() => dispatchLogin(fd));
  }

  function onSubmitReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ce = validarCorreo(email);
    setErrCorreo(ce);
    if (ce) return;
    const fd = new FormData();
    fd.set("email", email);
    startTransition(() => dispatchReset(fd));
  }

  if (mode === "reset") {
    return (
      <form onSubmit={onSubmitReset} className="flex w-full flex-col" style={{ maxWidth: 340, gap: 22 }}>
        <div className="text-center">
          <h1 className="text-[22px] font-light uppercase tracking-[6px] text-fg">Restablecer</h1>
          <p className="mt-2 text-[13px] text-muted">
            Te enviamos un enlace para crear una contraseña nueva.
          </p>
        </div>

        {resetState.status === "sent" ? (
          <p role="status" className="text-center text-[13px] text-fg">
            Si el correo existe, revisa tu bandeja: te enviamos un enlace para restablecerla.
          </p>
        ) : (
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
        )}

        {resetState.status !== "sent" && (
          <button
            type="submit"
            disabled={resetPending}
            className="flex w-full items-center justify-center gap-2 bg-accent py-4 text-[13px] font-extrabold uppercase tracking-[1.6px] text-accent-fg transition disabled:opacity-40"
          >
            {resetPending ? "Enviando…" : "Enviar enlace"}
          </button>
        )}

        <button
          type="button"
          onClick={() => setMode("login")}
          className="text-center text-[11px] font-semibold uppercase tracking-[1px] text-muted hover:text-fg"
        >
          Volver a entrar
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmitLogin} className="flex w-full flex-col" style={{ maxWidth: 340, gap: 26 }}>
      <div className="text-center">
        <h1 className="text-[32px] font-light uppercase tracking-[8px] text-fg" style={{ textIndent: 8, lineHeight: 1 }}>
          Entrar
        </h1>
        <p className="mt-3.5 text-[13px] text-muted">Accede para reservar y ver tu membresía</p>
      </div>

      {loginState.status === "error" && (
        <div
          role="alert"
          className="flex items-start gap-2 border px-4 py-3 text-[12.5px] font-medium"
          style={{ color: "var(--red)", borderColor: "var(--red)", background: "var(--red-soft)" }}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0">
            <path d="M10 3l8 14H2z" />
            <path d="M10 9v3M10 14v.5" />
          </svg>
          <span>{loginState.error}</span>
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
        <div className="flex items-baseline justify-between">
          <label className={`${LABEL} text-muted group-focus-within:text-accent`} style={errPassword ? { color: "var(--red)" } : undefined}>
            Contraseña
          </label>
          <button
            type="button"
            onClick={() => setMode("reset")}
            className="text-[10px] font-semibold tracking-[0.6px] text-muted hover:text-fg"
          >
            ¿La olvidaste?
          </button>
        </div>
        <div
          className="flex items-center border-b transition-colors focus-within:border-accent"
          style={{ borderColor: errPassword ? "var(--red)" : "var(--line-soft)" }}
        >
          <input
            type={showPass ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setErrPassword(validarPasswordRequerida(password))}
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
        {errPassword && (
          <p className="mt-2 text-[10.5px]" style={{ color: "var(--red)" }}>{errPassword}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loginPending}
        className="flex w-full items-center justify-center gap-2 bg-accent py-4 text-[13px] font-extrabold uppercase tracking-[1.6px] text-accent-fg transition hover:brightness-105 disabled:opacity-40"
      >
        <span>{loginPending ? "Entrando…" : "Entrar"}</span>
        {!loginPending && (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 10h10M11 6l4 4-4 4" />
          </svg>
        )}
      </button>

      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-line" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[2px]" style={{ color: "var(--muted-soft)" }}>
          o
        </span>
        <div className="h-px flex-1 bg-line" />
      </div>

      {/* Persistent, enumeration-safe nudge (audit #16): never branches on the login
          error — an admin-registered member who hasn't self-registered yet is told
          "wrong password" by the opaque anti-enumeration message above, so this
          affordance stays on-screen unconditionally to point them the right way. */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[1px] text-muted">¿Primera vez?</p>
        <Link
          href="/registro"
          className="flex w-full items-center justify-center gap-2.5 border bg-transparent py-4 text-[12px] font-bold uppercase tracking-[1.4px] text-fg transition hover:bg-surface"
          style={{ borderColor: "var(--line-soft)" }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-accent">
            <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
            <circle cx="10" cy="8" r="3.2" />
            <path d="M19 8v6M22 11h-6" />
          </svg>
          Crea tu cuenta
        </Link>
      </div>

      <div className="flex flex-col items-center gap-3 text-center text-[13px]">
        <p className="text-muted">
          ¿Aún no entrenas con nosotros?{" "}
          <Link href="/reservar" className="font-semibold text-accent">
            Reserva una clase
          </Link>
        </p>
        <Link href="/" className="text-[11px] font-semibold uppercase tracking-[1px] text-muted hover:text-fg">
          Volver al inicio
        </Link>
      </div>
    </form>
  );
}
