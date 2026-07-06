"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@gym/data/client";

// === The REAL single-operator sign-in ========================================
// Just the form: Correo + Contraseña + Entrar, wired to live Supabase auth
// (createClient + signInWithPassword). It carries the Supabase seam, so it stays
// in the app — it can never cross the frozen `@gym/brand ✗→ @gym/data` boundary.
//
// The bespoke login HERO (F-mark bar-build, wordmark rise, shine) was extracted
// into the resolved brand module (@gym/brand's ForgeLoginAnimation); the login
// page slots this form into that hero (or the static fallback) as children. The
// full-viewport centered shell is the hero's; this component renders only the
// <form>. Its fields enter on the shared `forge-rise` PRODUCT keyframe (grill (h);
// @gym/ui motion sheet), staggered to follow the hero sequence.

// Sharp decelerate for the field rise (snappy settle), matching the hero.
const EASE = "cubic-bezier(.32,.72,0,1)";
// Fields slide in one after another. When a hero plays first, the stagger waits
// for the hero's ignition to settle (the hero fills that window with motion);
// with no hero (the neutral base module — StaticLogin, a motion-free lockup) the
// wait would be a dead blank space, so the form enters at t=0 instead. Tuned to
// Forge's bar-build hero — the production admin brand (this constant serves 100%
// of prod admin traffic). RED-in-admin is a dev-only test surface (Doc 2 §6); its
// ring settles ~700ms later, so the form reveals mid-ignition there — acceptable,
// as no RED admin ships. The RED ring's production home is the client, which
// composes its own hero timing.
const HERO_OFFSET = 1590;
const FORM_STEP = 150;

/**
 * Single-operator sign-in. Authenticates against Supabase via the browser
 * client (which persists the session to cookies); the proxy then sees the
 * session on the next navigation. The export stays named `LoginForm` (the login
 * page imports it by that name).
 *
 * `afterHero` shifts the staggered entrance to follow a brand login hero (forge,
 * red). Modules with no hero (base) leave it false so the form still enters
 * gently but immediately, with no blank window (review finding #1).
 */
export function LoginForm({ afterHero = false }: { readonly afterHero?: boolean }) {
  const FORM_AT = afterHero ? HERO_OFFSET : 0;
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
    <form
      onSubmit={onSubmit}
      className="flex w-full flex-col"
      style={{
        maxWidth: 320,
        marginTop: 40,
        gap: 18,
      }}
    >
      {/* Focus ring can't be expressed inline (:focus) — one tiny local rule. */}
      <style>{`
        .login-field:focus {
          border-color: var(--gold) !important;
          box-shadow: 0 0 0 1px var(--gold);
        }
      `}</style>

      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          animation: `forge-rise 500ms ${EASE} both`,
          animationDelay: `${FORM_AT + FORM_STEP}ms`,
        }}
      >
        <span
          className="uppercase font-bold"
          style={{ fontSize: 10, letterSpacing: 1, color: "var(--muted)" }}
        >
          Correo
        </span>
        <input
          type="email"
          inputMode="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          className="login-field"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderBottom: "2px solid var(--silver)",
            padding: "12px 14px",
            fontSize: 16,
            color: "var(--fg)",
            outline: "none",
          }}
        />
      </label>

      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          animation: `forge-rise 500ms ${EASE} both`,
          animationDelay: `${FORM_AT + FORM_STEP * 2}ms`,
        }}
      >
        <span
          className="uppercase font-bold"
          style={{ fontSize: 10, letterSpacing: 1, color: "var(--muted)" }}
        >
          Contraseña
        </span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="login-field"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderBottom: "2px solid var(--silver)",
            padding: "12px 14px",
            fontSize: 16,
            color: "var(--fg)",
            outline: "none",
          }}
        />
      </label>

      {error && (
        <div
          role="alert"
          style={{
            fontSize: 12,
            color: "var(--red, #c0392b)",
            fontWeight: 600,
            animation: `forge-rise 300ms ${EASE} both`,
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="uppercase font-extrabold"
        style={{
          marginTop: 8,
          padding: "13px 16px",
          fontSize: 12.5,
          letterSpacing: 1.2,
          background: "var(--gold)",
          color: "var(--canvas)",
          border: "none",
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.7 : 1,
          animation: `forge-rise 500ms ${EASE} both`,
          animationDelay: `${FORM_AT + FORM_STEP * 3}ms`,
        }}
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
