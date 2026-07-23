"use client";

import Script from "next/script";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";

import { vincularAction, type VincularActionState } from "../actions";

const INICIAL: VincularActionState = { status: "idle" };

// Cloudflare's documented ALWAYS-PASS test sitekey — the default so dev works with no real key; the
// owner swaps in the production sitekey via NEXT_PUBLIC_TURNSTILE_SITE_KEY post-queue.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

// Turnstile's implicit render calls these by NAME off `window` once the challenge resolves.
type TurnstileWindow = typeof window & {
  onVincularTurnstileSuccess?: (token: string) => void;
  onVincularTurnstileExpired?: () => void;
  onVincularTurnstileError?: () => void;
};

/**
 * Logged-in short-circuit (§4 Step 1, audit 2026-07-22). A member already signed in on this
 * device binds the invite to their account in ONE click — no email, no password. Brand-neutral
 * (paints via the resolved hero's token contract); Turnstile-gated like the activation door.
 * On success `vincularAction` claims the code's paid row on the current session and lands on
 * /reservar.
 */
export function VincularForm({ codigo, gym }: { readonly codigo: string; readonly gym: string }) {
  const [state, dispatch, pending] = useActionState(vincularAction, INICIAL);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    const w = window as TurnstileWindow;
    w.onVincularTurnstileSuccess = (token) => setTurnstileToken(token);
    w.onVincularTurnstileExpired = () => setTurnstileToken(null);
    w.onVincularTurnstileError = () => setTurnstileToken(null);
  }, []);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Build from the form so Turnstile's injected `cf-turnstile-response` rides along.
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <form onSubmit={onSubmit} className="flex w-full flex-col text-center" style={{ maxWidth: 340, gap: 22 }}>
        <input type="hidden" name="codigo" value={codigo} />

        <div>
          <h1 className="text-[30px] font-light uppercase tracking-[5px] text-fg" style={{ textIndent: 5, lineHeight: 1 }}>
            Vincular tu cuenta
          </h1>
          <p className="mt-3.5 text-[13px] text-muted">
            Ya iniciaste sesión. Vincula tu membresía de{" "}
            <span className="font-semibold text-fg">{gym}</span> a esta cuenta para reservar tus clases.
          </p>
        </div>

        {state.status === "error" && (
          <div
            role="alert"
            className="border px-4 py-3 text-left text-[12.5px] font-medium"
            style={{ color: "var(--red)", borderColor: "var(--red)", background: "var(--red-soft)" }}
          >
            {state.mensaje}
          </div>
        )}

        <div
          className="cf-turnstile mx-auto"
          data-sitekey={SITE_KEY}
          data-callback="onVincularTurnstileSuccess"
          data-expired-callback="onVincularTurnstileExpired"
          data-error-callback="onVincularTurnstileError"
        />

        <button
          type="submit"
          disabled={!turnstileToken || pending}
          className="flex w-full items-center justify-center gap-2 bg-accent py-4 text-[13px] font-extrabold uppercase tracking-[1.6px] text-accent-fg transition hover:brightness-105 disabled:opacity-40"
        >
          <span>{pending ? "Vinculando…" : `Vincular ${gym} a tu cuenta`}</span>
        </button>

        <Link href="/reservar" className="text-[11px] font-semibold uppercase tracking-[1px] text-muted hover:text-fg">
          Ir a mi app
        </Link>
      </form>
    </>
  );
}
