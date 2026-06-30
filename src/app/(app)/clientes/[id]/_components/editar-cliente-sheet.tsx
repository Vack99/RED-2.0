"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/forge/sheet";
import { forgeToast } from "@/components/forge/toaster";
import { Avatar, Button, Eyebrow, H1, Input } from "@/components/forge/ui";
import { iniciales, isTelValido } from "@gym/format";
import { actualizarClienteAction } from "../actions";

export function EditarClienteSheet({
  open,
  onClose,
  cliente,
}: {
  open: boolean;
  onClose: () => void;
  cliente: { id: string; nombre: string; tel: string };
}) {
  const router = useRouter();
  const [nombre, setNombre] = React.useState(cliente.nombre);
  const [tel, setTel] = React.useState(cliente.tel);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional re-seed on open
      setNombre(cliente.nombre);
      setTel(cliente.tel);
    }
  }, [open, cliente.nombre, cliente.tel]);

  const valido = nombre.trim().length >= 3 && isTelValido(tel);
  const dirty = nombre.trim() !== cliente.nombre.trim() || tel.trim() !== cliente.tel.trim();
  const canSave = valido && dirty && !saving;

  const guardar = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await actualizarClienteAction({ clienteId: cliente.id, nombre, tel });
      forgeToast({ tone: "success", title: "Cliente actualizado", body: nombre.trim() });
      onClose();
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo actualizar", body: "Intenta de nuevo." });
    } finally {
      setSaving(false);
    }
  };

  // Same canonical derivation as the profile avatar (iniciales → up to 2 letters), so the two match.
  const inicial = iniciales(cliente.nombre);

  return (
    <Sheet open={open} onClose={onClose}>
      {/* Header — who you're editing, kept brutalist: avatar + eyebrow + display title */}
      <div className="flex items-center" style={{ gap: 14, padding: "8px 22px 18px" }}>
        <Avatar initial={inicial} accent size={46} style={{ fontSize: 18 }} />
        <div className="min-w-0 flex-1">
          <Eyebrow color="var(--gold)">EDITAR CLIENTE</Eyebrow>
          <H1 size={22} style={{ marginTop: 6, letterSpacing: -0.3 }}>
            {cliente.nombre}
          </H1>
        </div>
      </div>

      {/* Fields — uppercase eyebrow labels above each input, mirroring the app idiom */}
      <div className="flex flex-col" style={{ padding: "0 16px", gap: 18 }}>
        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>NOMBRE</Eyebrow>
          <Input
            placeholder="Nombre completo"
            value={nombre}
            onChange={setNombre}
            autoFocus
          />
        </label>

        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>TELÉFONO</Eyebrow>
          <Input
            icon="phone"
            placeholder="614 000 0000"
            value={tel}
            onChange={setTel}
            suffix="MX"
            inputMode="tel"
          />
        </label>
      </div>

      {/* Commit — seated in a hairline-topped footer like the vender flow */}
      <div style={{ borderTop: "1px solid var(--line)", margin: "24px 0 0", padding: "20px 16px 4px" }}>
        <Button variant="primary" size="lg" full icon="check" disabled={!canSave} onClick={guardar}>
          {saving ? "GUARDANDO…" : "GUARDAR"}
        </Button>
      </div>
    </Sheet>
  );
}
