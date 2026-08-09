"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@gym/ui/forge/input";
import { Sheet } from "@gym/ui/forge/sheet";
import { forgeToast } from "@gym/ui/forge/toaster";
import { Button, Eyebrow, H1, Input, SectionHeader } from "@gym/ui/forge/ui";
import type { IdentidadLegalDTO } from "@gym/data/server/legal";
import {
  camposFaltantesIdentidadLegal,
  identidadDesde,
  identidadLegalCompleta,
  renderAvisoIntegral,
  renderAvisoSimplificado,
  type IdentidadLegalGym,
} from "@gym/domain/legal";

import { actualizarIdentidadLegalAction } from "../actions";

/** Simple, deliberately non-strict format check — the same bar the zod schema in the DAL enforces
 *  server-side (`.email()`), just enough here to gate the button; the server is the real gate. */
const EMAIL_RE = /^\S+@\S+\.\S+$/;

type AvisoTab = "integral" | "simplificado";

/**
 * The CUENTA legal-identity editor (#255): razón social + domicilio + contacto ARCO, with a live
 * preview of both aviso de privacidad templates rendered against whatever is CURRENTLY typed (not
 * just the last-saved value) — the issue's own "so the owner sees exactly what members will see"
 * framing reads most literally as instant feedback, and the merge is a pure function
 * (`@gym/domain/legal`), so there is no reason to wait for a round trip. Follows the same
 * form/validation/toast conventions as `gym-content-sheet.tsx`'s editors.
 */
export function LegalIdentitySheet({
  open,
  onClose,
  identidad,
  nombreComercial,
  telefonoContacto,
}: {
  open: boolean;
  onClose: () => void;
  identidad: IdentidadLegalDTO;
  nombreComercial: string;
  /** `perfil.tel` — the template's own CAMPOS DE COMBINACIÓN table names it as the aviso's
   *  `{{telefono_contacto}}` source (review finding 3); read-only here, edited from "EDITAR
   *  PERFIL" (próximamente), not this form. */
  telefonoContacto: string | null;
}) {
  const router = useRouter();
  const [razonSocial, setRazonSocial] = React.useState(identidad.razonSocial ?? "");
  const [domicilio, setDomicilio] = React.useState(identidad.domicilio ?? "");
  const [emailArco, setEmailArco] = React.useState(identidad.emailArco ?? "");
  const [areaDatosPersonales, setAreaDatosPersonales] = React.useState(identidad.areaDatosPersonales ?? "");
  const [tab, setTab] = React.useState<AvisoTab>("integral");
  const [saving, setSaving] = React.useState(false);

  // Reset to the last-saved values (and the first preview tab) every time the sheet OPENS —
  // matches gym-content-sheet.tsx's tab-reset effect (`[open]` alone, not `[open, identidad]`):
  // depending on the `identidad` object identity re-runs this on every parent re-render (e.g. a
  // sibling sheet's router.refresh() produces a fresh object), silently discarding in-progress
  // typing while this sheet is open (review finding 5). Reading `identidad.*` here without
  // depending on it is intentional — the effect only needs the value at the moment `open` flips.
  React.useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on open
    setRazonSocial(identidad.razonSocial ?? "");
    setDomicilio(identidad.domicilio ?? "");
    setEmailArco(identidad.emailArco ?? "");
    setAreaDatosPersonales(identidad.areaDatosPersonales ?? "");
    setTab("integral");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately `[open]` only (finding 5): reads the current identidad on open without depending on its identity, so a sibling re-render doesn't wipe in-progress typing
  }, [open]);

  const razonValida = razonSocial.trim().length <= 200;
  const domicilioValido = domicilio.trim().length <= 300;
  const emailValido = emailArco.trim().length === 0 || (emailArco.trim().length <= 160 && EMAIL_RE.test(emailArco.trim()));
  const areaValida = areaDatosPersonales.trim().length <= 200;
  const valido = razonValida && domicilioValido && emailValido && areaValida;

  const dirty =
    razonSocial !== (identidad.razonSocial ?? "") ||
    domicilio !== (identidad.domicilio ?? "") ||
    emailArco !== (identidad.emailArco ?? "") ||
    areaDatosPersonales !== (identidad.areaDatosPersonales ?? "");

  const canSave = valido && dirty && !saving;

  // The LIVE preview identity — built from what's currently typed, not the last save, so the
  // preview updates as the owner fills the form in. Same shared helper cuenta.tsx's status line
  // uses (review finding 8), so both sites source `nombreComercial` from gym.brand_name together
  // (finding 1) and derive completeness the same way (finding 3).
  const identidadActual: IdentidadLegalGym = identidadDesde(
    {
      razonSocial: razonSocial.trim() || null,
      domicilio: domicilio.trim() || null,
      emailArco: emailArco.trim() || null,
      areaDatosPersonales: areaDatosPersonales.trim() || null,
    },
    nombreComercial,
    telefonoContacto,
  );
  const completa = identidadLegalCompleta(identidadActual);
  const faltantes = camposFaltantesIdentidadLegal(identidadActual);

  const guardar = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await actualizarIdentidadLegalAction({ razonSocial, domicilio, emailArco, areaDatosPersonales });
      forgeToast({ tone: "success", title: "Identidad legal guardada" });
      router.refresh();
    } catch (e) {
      forgeToast({
        tone: "warning",
        title: "No se pudo guardar",
        body: e instanceof Error ? e.message : "Intenta de nuevo.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div style={{ padding: "8px 22px 14px" }}>
        <Eyebrow color="var(--gold)">IDENTIDAD LEGAL</Eyebrow>
        <H1 size={22} style={{ marginTop: 6 }}>
          AVISO DE PRIVACIDAD
        </H1>
        <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: "var(--muted)" }}>
          Estos datos identifican a tu gimnasio como responsable ante tus miembros. Los usamos para
          generar el aviso de privacidad que verán al registrarse — completa todo para publicarlo.
        </div>
      </div>

      <div className="flex flex-col" style={{ padding: "0 16px", gap: 18 }}>
        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>RAZÓN SOCIAL</Eyebrow>
          <Input
            placeholder="Ej. Gimnasio Forge, S.A. de C.V."
            value={razonSocial}
            onChange={setRazonSocial}
            autoFocus
          />
        </label>
        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>DOMICILIO</Eyebrow>
          <Textarea
            placeholder="Calle, número, colonia, C.P., ciudad, estado"
            value={domicilio}
            onChange={setDomicilio}
            rows={3}
          />
        </label>
        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>CORREO DE CONTACTO ARCO</Eyebrow>
          <Input
            type="email"
            placeholder="datos@tugimnasio.mx"
            value={emailArco}
            onChange={setEmailArco}
          />
        </label>
        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>ÁREA O PERSONA RESPONSABLE</Eyebrow>
          <Input
            placeholder="Ej. Departamento de Datos Personales"
            value={areaDatosPersonales}
            onChange={setAreaDatosPersonales}
          />
        </label>

        <Button variant="primary" size="lg" full icon="check" disabled={!canSave} onClick={guardar}>
          {saving ? "GUARDANDO…" : "GUARDAR"}
        </Button>
      </div>

      <SectionHeader>VISTA PREVIA DEL AVISO</SectionHeader>

      {completa ? (
        <>
          <div className="flex" style={{ gap: 6, padding: "0 16px 14px" }}>
            {(
              [
                { id: "integral", label: "INTEGRAL" },
                { id: "simplificado", label: "SIMPLIFICADO" },
              ] as { id: AvisoTab; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="forge-pressable font-extrabold uppercase"
                style={{
                  padding: "9px 12px",
                  fontSize: 10.5,
                  letterSpacing: 0.8,
                  border: `1px solid ${tab === t.id ? "var(--yellow)" : "var(--line)"}`,
                  background: tab === t.id ? "var(--yellow)" : "var(--surface)",
                  color: tab === t.id ? "var(--ink)" : "var(--muted)",
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ padding: "0 16px 24px" }}>
            <div
              tabIndex={0}
              role="region"
              aria-label={`Vista previa del aviso de privacidad ${tab}`}
              className="whitespace-pre-wrap"
              style={{
                maxHeight: 360,
                overflowY: "auto",
                border: "1px solid var(--line)",
                background: "var(--surface)",
                padding: 14,
                fontSize: 11.5,
                lineHeight: 1.6,
                color: "var(--fg)",
              }}
            >
              {tab === "integral" ? renderAvisoIntegral(identidadActual) : renderAvisoSimplificado(identidadActual)}
            </div>
          </div>
        </>
      ) : (
        <div style={{ padding: "0 16px 24px" }}>
          <div
            className="flex flex-col"
            style={{ gap: 8, border: "1px dashed var(--line)", background: "var(--surface)", padding: "20px 16px" }}
          >
            <div className="font-bold uppercase" style={{ fontSize: 11.5, letterSpacing: 0.6, color: "var(--gold)" }}>
              Tu aviso de privacidad aún no está listo
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--muted)" }}>
              Tus miembros necesitan ver el aviso de privacidad de tu gimnasio para registrarse.
              Completa lo que depende de ti arriba; lo demás lo resuelve la plataforma o queda
              pendiente de revisión legal. Falta: {faltantes.join(", ")}.
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
