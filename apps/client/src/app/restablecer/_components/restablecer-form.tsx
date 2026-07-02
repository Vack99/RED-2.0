"use client";

import { useActionState } from "react";

import { restablecerAction, type RestablecerActionState } from "../actions";

const INICIAL: RestablecerActionState = { status: "idle" };

/** Deliberately UNSTYLED set-new-password form (RED design is Phase 4). */
export function RestablecerForm() {
  const [state, action, pending] = useActionState(restablecerAction, INICIAL);

  return (
    <form action={action}>
      <h1>Nueva contraseña</h1>
      {state.status === "error" && <p role="alert">{state.error}</p>}
      <p>
        <label>
          Contraseña
          <br />
          <input name="password" type="password" autoComplete="new-password" required minLength={8} />
        </label>
      </p>
      <button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
