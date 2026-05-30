"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * Single-operator sign-in. Authenticates against Supabase via the browser
 * client (which persists the session to cookies); the proxy then sees the
 * session on the next navigation.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError("Correo o contraseña incorrectos.");
      setPending(false);
      return;
    }

    router.replace("/inicio");
    router.refresh();
  }

  return (
    <div className="border border-line bg-canvas" style={{ padding: 28 }}>
      <div
        className="uppercase font-extrabold"
        style={{ fontSize: 26, letterSpacing: 2, textAlign: "center", color: "var(--fg)" }}
      >
        FORGE
      </div>
      <div
        className="uppercase"
        style={{ fontSize: 10.5, letterSpacing: 1.6, textAlign: "center", color: "var(--muted)", marginTop: 6 }}
      >
        Administración del gimnasio
      </div>

      <form onSubmit={onSubmit} style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="uppercase font-bold" style={{ fontSize: 10, letterSpacing: 1, color: "var(--muted)" }}>
            Correo
          </span>
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-line bg-surface"
            style={{ padding: "12px 14px", fontSize: 14, color: "var(--fg)", outline: "none" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="uppercase font-bold" style={{ fontSize: 10, letterSpacing: 1, color: "var(--muted)" }}>
            Contraseña
          </span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-line bg-surface"
            style={{ padding: "12px 14px", fontSize: 14, color: "var(--fg)", outline: "none" }}
          />
        </label>

        {error && (
          <div role="alert" style={{ fontSize: 12, color: "var(--red, #c0392b)", fontWeight: 600 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="uppercase font-extrabold"
          style={{
            marginTop: 6,
            padding: "13px 16px",
            fontSize: 12.5,
            letterSpacing: 1.2,
            background: "var(--gold)",
            color: "var(--canvas)",
            border: "none",
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
