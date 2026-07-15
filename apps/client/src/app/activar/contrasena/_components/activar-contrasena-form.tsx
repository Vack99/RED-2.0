"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";

import { validarPasswordNueva } from "../../../../lib/auth-validacion";
import { activarContrasenaAction, type ActivarContrasenaActionState } from "../actions";

const INICIAL: ActivarContrasenaActionState = { status: "idle" };

const LABEL = "block text-[10px] font-bold uppercase tracking-[2px] text-muted transition-colors group-focus-within:text-accent";

/**
 * Activation set-password form (issue #133), brand-neutral. The registered email is
 * shown read-only (the account is already established); the member sets a password +
 * confirmation and accepts terms/privacy (validation-only gate, parity with
 * self-registration). Submitting sets the password then claims the paid row server-side.
 */
export function ActivarContrasenaForm({
  email,
  codigo,
}: {
  readonly email: string;
  /** The code threaded from the door, claimed after the password is set; null = none. */
  readonly codigo?: string | null;
}) {
  const [state, dispatch, pending] = useActionState(activarContrasenaAction, INICIAL);
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [acepta, setAcepta] = useState(false);
  const [errPassword, setErrPassword] = useState<string | null>(null);
  const [errConfirmar, setErrConfirmar] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pe = validarPasswordNueva(password);
    const ce = password !== confirmar ? "Las contraseñas no coinciden." : null;
    setErrPassword(pe);
    setErrConfirmar(ce);
    if (pe || ce) return;
    const fd = new FormData(e.currentTarget);
    // Transition-wrapped so the action's redirect('/reservar') actually navigates.
    startTransition(() => dispatch(fd));
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col" style={{ maxWidth: 340, gap: 22 }}>
      {codigo && <input type="hidden" name="codigo" value={codigo} />}

      <div className="text-center">
        <h1 className="text-[27px] font-light uppercase tracking-[5px] text-fg" style={{ textIndent: 5, lineHeight: 1.05 }}>
          Crea tu contraseña
        </h1>
        <p className="mt-3.5 text-[13px] text-muted">Solo falta tu contraseña para entrar a tu app.</p>
      </div>

      <div className="border px-4 py-3 text-center" style={{ borderColor: "var(--line-soft)" }}>
        <p className="text-[10px] font-bold uppercase tracking-[2px] text-muted">Tu cuenta</p>
        <p className="mt-1.5 text-[13px] font-semibold text-fg">{email}</p>
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
          <p className="mt-1.5 text-[10.5px] text-muted">Mínimo 8 caracteres.</p>
        )}
      </div>

      <div className="group">
        <label className={LABEL} style={errConfirmar ? { color: "var(--red)" } : undefined}>
          Confirma tu contraseña
        </label>
        <input
          name="confirmar"
          type={showPass ? "text" : "password"}
          autoComplete="new-password"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          onBlur={() => setErrConfirmar(password !== confirmar ? "Las contraseñas no coinciden." : null)}
          placeholder="••••••••"
          className="w-full border-b bg-transparent py-3 text-[15px] text-fg outline-none transition-colors focus:border-accent"
          style={{ borderColor: errConfirmar ? "var(--red)" : "var(--line-soft)" }}
        />
        {errConfirmar && <p className="mt-2 text-[10.5px]" style={{ color: "var(--red)" }}>{errConfirmar}</p>}
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

      <button
        type="submit"
        disabled={!acepta || pending}
        className="flex w-full items-center justify-center gap-2 bg-accent py-4 text-[13px] font-extrabold uppercase tracking-[1.6px] text-accent-fg transition hover:brightness-105 disabled:opacity-40"
      >
        {pending ? "Entrando…" : "Entrar a mi app"}
      </button>

      <Link href="/" className="text-center text-[11px] font-semibold uppercase tracking-[1px] text-muted hover:text-fg">
        Volver al inicio
      </Link>
    </form>
  );
}
