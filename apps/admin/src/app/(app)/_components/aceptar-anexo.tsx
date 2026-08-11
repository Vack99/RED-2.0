"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@gym/ui/forge/ui";
import { forgeToast } from "@gym/ui/forge/toaster";
import { ANEXO_TRATAMIENTO_DATOS_TEXTO } from "@gym/domain/legal";

import { aceptarAnexoAction } from "../actions";
import { LogoutButton } from "./logout-button";

/**
 * The Gate 0.1 click-wrap accept screen (#254; demoted from a blocking wall to a linked route
 * by owner ruling 2026-08-10, pending #258's abogado review of the draft text): the full Anexo
 * de Tratamiento de Datos text, an explicit unchecked box, and an ACEPTAR action. Mounted at
 * `/cuenta/anexo` (`(app)/cuenta/anexo/page.tsx`), reached from the `(app)` layout's banner —
 * the app itself is never blocked, so this component no longer needs to double as the whole
 * shell.
 *
 * The text renders exactly the server-side constant (`@gym/domain/legal`) — the SAME string
 * the server action hashes — so nothing shown here can drift from what gets recorded as
 * accepted. No interpolation of gym-specific fields happens (the `{{merge_field}}`
 * placeholders render literally): that lands with #255's gym_legal editor.
 *
 * `aceptarAnexoAction` takes no arguments — the gym, the document, the version, and the
 * content it hashes are ALL resolved server-side; nothing the browser sends can steer any of
 * them. On success we navigate back to `/cuenta` (rather than the `router.refresh()`-in-place
 * idiom the CUENTA editors use — e.g. `plantilla-editor.tsx`): unlike a sheet, this screen is a
 * real route, and staying on it would leave the button permanently stuck on "Guardando…" since
 * nothing unmounts it. `router.refresh()` still runs so the layout's banner is gone by the time
 * `/cuenta` renders, not just on the next hard navigation.
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
      router.push("/cuenta");
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
