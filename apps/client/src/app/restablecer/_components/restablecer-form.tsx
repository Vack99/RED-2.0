"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";

import { validarPasswordNueva } from "../../../lib/auth-validacion";
import { restablecerAction, type RestablecerActionState } from "../actions";

const INICIAL: RestablecerActionState = { status: "idle" };

/**
 * RED-designed set-new-password form, brand-neutral (paint via the hero's token
 * contract). Drives the already-shipped Phase-3 recovery action against the
 * session the reset link established; client-side validation mirrors its 8-char
 * floor so the rule surfaces inline instead of as a failed round trip.
 */
export function RestablecerForm() {
  const [state, dispatch, pending] = useActionState(restablecerAction, INICIAL);
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [errPassword, setErrPassword] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pe = validarPasswordNueva(password);
    setErrPassword(pe);
    if (pe) return;
    const fd = new FormData();
    fd.set("password", password);
    // Transition-wrapped so the action's redirect('/reservar') actually navigates.
    startTransition(() => dispatch(fd));
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col" style={{ maxWidth: 340, gap: 24 }}>
      <div className="text-center">
        <h1 className="text-[27px] font-light uppercase tracking-[5px] text-fg" style={{ textIndent: 5, lineHeight: 1.05 }}>
          Nueva contraseña
        </h1>
        <p className="mt-3.5 text-[13px] text-muted">Elige una contraseña de al menos 8 caracteres.</p>
      </div>

      {state.status === "error" && (
        <div
          role="alert"
          className="flex items-start gap-2 border px-4 py-3 text-[12.5px] font-medium"
          style={{ color: "var(--red)", borderColor: "var(--red)", background: "var(--red-soft)" }}
        >
          <span>{state.error}</span>
        </div>
      )}

      <div className="group">
        <label
          className="block text-[10px] font-bold uppercase tracking-[2px] text-muted transition-colors group-focus-within:text-accent"
          style={errPassword ? { color: "var(--red)" } : undefined}
        >
          Contraseña
        </label>
        <div
          className="flex items-center border-b transition-colors focus-within:border-accent"
          style={{ borderColor: errPassword ? "var(--red)" : "var(--line-soft)" }}
        >
          <input
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
        {errPassword && (
          <p className="mt-2 text-[10.5px]" style={{ color: "var(--red)" }}>{errPassword}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 bg-accent py-4 text-[13px] font-extrabold uppercase tracking-[1.6px] text-white transition hover:brightness-105 disabled:opacity-40"
      >
        {pending ? "Guardando…" : "Guardar contraseña"}
      </button>

      <Link href="/" className="text-center text-[11px] font-semibold uppercase tracking-[1px] text-muted hover:text-fg">
        Volver al inicio
      </Link>
    </form>
  );
}
