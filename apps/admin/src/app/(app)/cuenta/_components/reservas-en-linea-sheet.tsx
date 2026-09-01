"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@gym/ui/forge/sheet";
import { forgeToast } from "@gym/ui/forge/toaster";
import { Button, Eyebrow, H1 } from "@gym/ui/forge/ui";
import { copiaReservasEnLinea } from "@gym/domain/rules";

import { cambiarModoReservasAction } from "../actions";

/**
 * The "Reservas en línea" confirm sheet (#331, spec #326) — one boolean write behind a
 * consequence sheet, in both modes. Its copy is `copiaReservasEnLinea` (`@gym/domain/rules`),
 * a PURE function of (direction, count) — this component owns only the confirm/pending/toast
 * ceremony, matching every other Cuenta sheet's `router.refresh()` invalidation (no
 * `revalidatePath`: the (app) pages already read dynamically, per `agenda.tsx`'s own note).
 */
export function ReservasEnLineaSheet({
  open,
  onClose,
  activar,
  reservasFuturas,
}: {
  open: boolean;
  onClose: () => void;
  /** The direction THIS open proposes — true to turn bookings on, false to turn them off. */
  activar: boolean;
  /** Future `reservada` bookings of this gym (0 when turning ON, where the copy ignores it
   *  anyway) — read at the page's last render, same freshness as every other Cuenta stat. */
  reservasFuturas: number;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const copia = copiaReservasEnLinea(activar, reservasFuturas);

  const confirmar = async () => {
    if (pending) return;
    setPending(true);
    try {
      const canceladas = await cambiarModoReservasAction(activar);
      onClose();
      forgeToast({
        tone: "success",
        title: activar ? "Reservas activadas" : "Reservas desactivadas",
        body: activar
          ? "La agenda ya es visible para tus miembros."
          : canceladas > 0
            ? `${canceladas} reserva${canceladas === 1 ? "" : "s"} cancelada${canceladas === 1 ? "" : "s"}, clases devueltas.`
            : "La agenda ya no es visible para tus miembros.",
      });
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo cambiar", body: "Intenta de nuevo." });
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div style={{ padding: "8px 22px 20px" }}>
        <Eyebrow color="var(--gold)">RESERVAS EN LÍNEA</Eyebrow>
        <H1 size={22} style={{ marginTop: 6 }}>
          {copia.titulo}
        </H1>
        <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>
          {copia.cuerpo}
        </div>
        <div className="flex" style={{ gap: 10, marginTop: 24 }}>
          <Button variant="secondary" full onClick={onClose} disabled={pending}>
            CANCELAR
          </Button>
          <Button
            variant={activar ? "primary" : "danger"}
            full
            onClick={confirmar}
            disabled={pending}
          >
            {pending ? "UN MOMENTO…" : "CONFIRMAR"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
