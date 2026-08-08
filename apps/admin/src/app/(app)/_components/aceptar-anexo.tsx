"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@gym/ui/forge/ui";
import { forgeToast } from "@gym/ui/forge/toaster";
import { ANEXO_TRATAMIENTO_DATOS_TEXTO } from "@gym/domain/legal";

import { aceptarAnexoAction } from "../actions";
import { LogoutButton } from "./logout-button";

/**
 * The Gate 0.1 click-wrap gate's OWNER view (#254): the full Anexo de Tratamiento de Datos
 * text, an explicit unchecked box, and an ACEPTAR action — the layout swaps `children` for
 * this on every `(app)` route (same swap-the-whole-shell pattern as `SinGimnasio`), so /cuenta
 * (the only other `LogoutButton` call site) is unreachable until the gym accepts; sign-out is
 * the only other exit.
 *
 * The text renders exactly the server-side constant (`@gym/domain/legal`) — the SAME string
 * the server action hashes — so nothing shown here can drift from what gets recorded as
 * accepted. No interpolation of gym-specific fields happens (the `{{merge_field}}`
 * placeholders render literally): that lands with #255's gym_legal editor.
 *
 * `aceptarAnexoAction` takes no arguments — the gym, the document, the version, and the
 * content it hashes are ALL resolved server-side; nothing the browser sends can steer any of
 * them. On success, `router.refresh()` re-runs the layout's server-side acceptance check,
 * which is what actually unlocks the app (matches the `guardar`/`router.refresh()` idiom used
 * throughout the CUENTA editors — e.g. `plantilla-editor.tsx`).
 */
export function AceptarAnexo() {
  const router = useRouter();
  const [marcado, setMarcado] = useState(false);
  const [saving, setSaving] = useState(false);

  const aceptar = async () => {
    if (!marcado || saving) return;
    setSaving(true);
    try {
      await aceptarAnexoAction();
      router.refresh();
    } catch {
      forgeToast({
        tone: "warning",
        title: "No se pudo registrar tu aceptación",
        body: "Intenta de nuevo en un momento.",
      });
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col px-6 py-6">
      <h1 className="text-lg font-bold uppercase tracking-wide text-fg">
        Anexo de tratamiento de datos
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Antes de continuar, lee y acepta el Anexo de Tratamiento de Datos Personales de tu
        gimnasio.
      </p>

      <div
        tabIndex={0}
        role="region"
        aria-label="Texto del Anexo de Tratamiento de Datos Personales"
        className="mt-4 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-4 text-sm leading-relaxed text-fg"
      >
        {ANEXO_TRATAMIENTO_DATOS_TEXTO}
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-fg">
        <input
          type="checkbox"
          checked={marcado}
          onChange={(e) => setMarcado(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--yellow)]"
        />
        <span>He leído y acepto este Anexo en representación de mi gimnasio.</span>
      </label>

      <div className="mt-3">
        <Button variant="primary" size="lg" full icon="check" disabled={!marcado || saving} onClick={aceptar}>
          {saving ? "Guardando…" : "Aceptar"}
        </Button>
      </div>

      <div className="mt-4 flex justify-center">
        <LogoutButton />
      </div>
    </div>
  );
}
