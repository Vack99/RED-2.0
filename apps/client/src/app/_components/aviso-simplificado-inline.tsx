import Link from "next/link";

/**
 * The simplified aviso de privacidad, rendered inline at a point of consent — Art. 16-II's
 * "electronic simplified aviso" model (issue #256): render it right where data is collected
 * (registro, activar/contrasena), with a working link to the integral aviso, rather than the
 * bare "Aviso de Privacidad" label the checkbox used to carry. `cuerpo` is the gym's real
 * simplificado render when its legal identity is complete; a null `cuerpo` (unmapped host, or an
 * incomplete identity) falls back to a brand-neutral blurb in the same spirit as `/legal`'s own
 * generic text — never a raw {{token}}, never a blank box.
 *
 * Final review round, finding 6: `renderAvisoSimplificado` stops BEFORE its template's own
 * trailing "Puede consultar el aviso de privacidad integral..." paragraph (`@gym/domain/legal`'s
 * `cuerpoMiembroSimplificado`) — that paragraph's `[texto](url)` link would otherwise collapse to
 * inert plain text inside `white-space: pre-wrap`. This component renders the real `<Link>` in its
 * place, same target (`/legal#privacidad`) and `stopPropagation` posture as the fallback branch
 * below already used.
 */
export function AvisoSimplificadoInline({ cuerpo }: { cuerpo: string | null }) {
  return (
    <div
      className="border px-4 py-3 text-[11.5px] leading-relaxed text-muted"
      style={{ borderColor: "var(--line-soft)" }}
    >
      {cuerpo ? (
        <>
          <p className="whitespace-pre-wrap">{cuerpo}</p>
          <p className="mt-2">
            Puede consultar el{" "}
            <Link
              href="/legal#privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-fg underline"
            >
              aviso de privacidad integral
            </Link>
            , que incluye las finalidades que requieren su consentimiento y los medios para ejercer sus
            derechos ARCO.
          </p>
        </>
      ) : (
        <p>
          Al continuar, aceptas que tratemos tus datos personales para administrar tu membresía, tus
          reservas y tus pagos. Consulta el{" "}
          <Link
            href="/legal#privacidad"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-fg underline"
          >
            aviso de privacidad
          </Link>
          .
        </p>
      )}
    </div>
  );
}
