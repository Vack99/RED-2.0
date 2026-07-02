"use client";

import { useActionState } from "react";

import {
  entrarAction,
  resetAction,
  type EntrarActionState,
  type ResetActionState,
} from "../actions";

const LOGIN_INICIAL: EntrarActionState = { status: "idle" };
const RESET_INICIAL: ResetActionState = { status: "idle" };

/**
 * Deliberately UNSTYLED login + forgot-password (RED design is Phase 4). Two native
 * `<form action>` surfaces, each with its own `useActionState`: email+password
 * sign-in (redirects to the panel on success) and the reset-email request.
 */
export function EntrarForm() {
  const [loginState, login, loginPending] = useActionState(entrarAction, LOGIN_INICIAL);
  const [resetState, reset, resetPending] = useActionState(resetAction, RESET_INICIAL);

  return (
    <>
      <form action={login}>
        <h1>Entrar</h1>
        {loginState.status === "error" && <p role="alert">{loginState.error}</p>}
        <p>
          <label>
            Correo
            <br />
            <input name="email" type="email" autoComplete="email" required />
          </label>
        </p>
        <p>
          <label>
            Contraseña
            <br />
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
        </p>
        <button type="submit" disabled={loginPending}>
          {loginPending ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <form action={reset}>
        <h2>¿Olvidaste tu contraseña?</h2>
        {resetState.status === "sent" ? (
          <p role="status">Si el correo existe, te enviamos un enlace para restablecerla.</p>
        ) : (
          <p>
            <label>
              Correo
              <br />
              <input name="email" type="email" autoComplete="email" required />
            </label>{" "}
            <button type="submit" disabled={resetPending}>
              {resetPending ? "Enviando…" : "Enviar enlace"}
            </button>
          </p>
        )}
      </form>
    </>
  );
}
