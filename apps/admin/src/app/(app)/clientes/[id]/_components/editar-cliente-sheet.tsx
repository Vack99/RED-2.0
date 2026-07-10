"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@gym/ui/forge/sheet";
import { forgeToast } from "@gym/ui/forge/toaster";
import { Avatar, Button, Eyebrow, H1, Input } from "@gym/ui/forge/ui";
import { iniciales, isEmailValido, isTelValido } from "@gym/format";
import { actualizarClienteAction } from "../actions";

export function EditarClienteSheet({
  open,
  onClose,
  cliente,
}: {
  open: boolean;
  onClose: () => void;
  cliente: {
    id: string;
    nombre: string;
    tel: string;
    /** Contact email, or "" for none (S3, issue #71). */
    email: string;
    /** Claimed row (auth_user_id set) — the email field is hidden: the verified login email owns it
     *  from here (D5), never a staff edit. */
    cuentaActiva: boolean;
  };
}) {
  const router = useRouter();
  const [nombre, setNombre] = React.useState(cliente.nombre);
  const [tel, setTel] = React.useState(cliente.tel);
  const [email, setEmail] = React.useState(cliente.email);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional re-seed on open
      setNombre(cliente.nombre);
      setTel(cliente.tel);
      setEmail(cliente.email);
    }
  }, [open, cliente.nombre, cliente.tel, cliente.email]);

  const emailTrim = email.trim();
  const emailValido = emailTrim === "" || isEmailValido(emailTrim);
  const valido = nombre.trim().length >= 3 && isTelValido(tel) && emailValido;
  // Email has no "clear" arm this slice (RPC §4: NULL/omitted = leave unchanged) — so blanking a
  // previously-set email is deliberately NOT dirty on its own; only a non-empty, different value counts.
  const emailDirty = !cliente.cuentaActiva && emailTrim !== "" && emailTrim !== cliente.email.trim();
  const dirty = nombre.trim() !== cliente.nombre.trim() || tel.trim() !== cliente.tel.trim() || emailDirty;
  const canSave = valido && dirty && !saving;

  const guardar = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const result = await actualizarClienteAction({
        clienteId: cliente.id,
        nombre,
        tel,
        ...(cliente.cuentaActiva ? {} : { email: emailTrim }),
      });
      if (!result.ok) {
        // Email already in use for this gym (clientes_email_gym_uq) — keep the sheet open so the
        // operator can correct it; toast the actionable reason verbatim (matches the vender path).
        forgeToast({ tone: "warning", title: "No se pudo actualizar", body: result.mensaje });
        return;
      }
      if (result.invite?.ok) {
        forgeToast({
          tone: "success",
          title: "Invitación enviada",
          body: `${nombre.trim()} · ${result.invite.email}`,
        });
      } else if (result.invite && !result.invite.ok) {
        forgeToast({
          tone: "warning",
          title: "No pudimos enviar la invitación",
          body: "Puedes reenviarla desde la ficha.",
        });
      } else {
        forgeToast({ tone: "success", title: "Cliente actualizado", body: nombre.trim() });
      }
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

        {/* Email — hidden once the row is claimed (D5: the verified login email owns it from there,
            never a staff edit). Otherwise this is the backfill field that fires the auto-invite on
            save (design §3 — issue #71). */}
        {!cliente.cuentaActiva && (
          <label className="flex flex-col" style={{ gap: 8 }}>
            <Eyebrow style={{ paddingLeft: 2 }}>EMAIL PARA LA APP</Eyebrow>
            <Input
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={setEmail}
              inputMode="email"
              type="email"
            />
            {!emailValido && (
              <span style={{ fontSize: 11.5, color: "var(--gold)", paddingLeft: 2 }}>
                Correo inválido
              </span>
            )}
          </label>
        )}
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
