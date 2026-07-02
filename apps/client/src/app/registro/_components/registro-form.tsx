"use client";

import { useActionState } from "react";

import { registrarAction, type RegistroActionState } from "../actions";

const INICIAL: RegistroActionState = { status: "idle" };

/**
 * Deliberately UNSTYLED registration form (RED design is Phase 4). Native `<form
 * action>` progressive enhancement; `useActionState` carries the pending + result
 * state. Phone is a fixed `+52` prefix + the 10-digit national number the DB
 * canonicalizes. The terms/privacy checkbox is required (one box → both timestamps).
 */
export function RegistroForm() {
  const [state, action, pending] = useActionState(registrarAction, INICIAL);

  return (
    <form action={action}>
      <h1>Crear cuenta</h1>

      {state.status === "error" && <p role="alert">{state.error}</p>}
      {state.status === "success" && (
        <p role="status">
          Te enviamos un correo de confirmación. Ábrelo para activar tu cuenta.
        </p>
      )}

      <p>
        <label>
          Nombre
          <br />
          <input name="nombre" type="text" autoComplete="name" required minLength={3} />
        </label>
      </p>
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
          <input name="password" type="password" autoComplete="new-password" required minLength={8} />
        </label>
      </p>
      <p>
        <label>
          Teléfono (WhatsApp)
          <br />
          +52 <input name="telefono" type="tel" inputMode="tel" autoComplete="tel-national" required />
        </label>
      </p>
      <p>
        <label>
          <input name="acepta" type="checkbox" required /> Acepto los términos y el aviso de
          privacidad
        </label>
      </p>

      <button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Registrarme"}
      </button>
    </form>
  );
}
