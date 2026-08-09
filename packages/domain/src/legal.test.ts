import { describe, expect, it } from "vitest";

import {
  AVISO_PRIVACIDAD_FECHA_ACTUALIZACION,
  AVISO_PRIVACIDAD_VERSION,
  camposFaltantesIdentidadLegal,
  identidadDesde,
  identidadLegalCompleta,
  mergeAvisoTemplate,
  renderAvisoIntegral,
  renderAvisoSimplificado,
  tokensSinResolver,
  urlAvisoIntegralDesde,
  type IdentidadLegalGym,
} from "./legal";

/**
 * `mergeAvisoTemplate` + its `IdentidadLegalGym` callers (#255, Gate 0.1 CUENTA preview; review
 * round 2 findings 1/3/8). Byte-for-byte fidelity of the two TEXTO constants against their source
 * .md is tools/guards/aviso-legal-drift.test.ts's job, not this file's — these tests exercise the
 * pure merge/slice/completeness logic, some against small literal templates (so they stay readable
 * and don't silently start asserting real legal prose) and some against the real constants (where
 * the point IS the real, currently-irreducible gap — finding 3).
 */

const IDENTIDAD_COMPLETA: IdentidadLegalGym = {
  razonSocial: "Gimnasio Forge, S.A. de C.V.",
  nombreComercial: "Forge",
  domicilio: "Av. Siempre Viva 123, Chihuahua, Chih.",
  emailArco: "datos@forge.mx",
  areaDatosPersonales: "Departamento de Datos Personales",
  telefonoContacto: "+52 614 000 0000",
  emailContacto: "hola@forge.mx",
  urlAvisoIntegral: "https://forge.example/legal",
};

const IDENTIDAD_VACIA: IdentidadLegalGym = {
  razonSocial: null,
  nombreComercial: "Forge",
  domicilio: null,
  emailArco: null,
  areaDatosPersonales: null,
  telefonoContacto: null,
  emailContacto: null,
  urlAvisoIntegral: null,
};

describe("mergeAvisoTemplate", () => {
  it("substitutes every known field, full identity", () => {
    const texto = "{{razon_social}} ({{nombre_comercial}}), domicilio {{domicilio}}.";
    const resultado = mergeAvisoTemplate(texto, {
      razon_social: "Gimnasio Forge, S.A. de C.V.",
      nombre_comercial: "Forge",
      domicilio: "Av. Siempre Viva 123",
    });
    expect(resultado).toBe("Gimnasio Forge, S.A. de C.V. (Forge), domicilio Av. Siempre Viva 123.");
  });

  it("leaves a missing/null field's token VISIBLE rather than stripping it (chosen behavior)", () => {
    const texto = "Responsable: {{razon_social}}. Contacto ARCO: {{email_arco}}.";
    const resultado = mergeAvisoTemplate(texto, { razon_social: "Gimnasio Forge" });
    expect(resultado).toBe("Responsable: Gimnasio Forge. Contacto ARCO: {{email_arco}}.");
  });

  it("leaves a blank (empty/whitespace-only) value's token visible, same as missing", () => {
    const texto = "{{domicilio}}";
    expect(mergeAvisoTemplate(texto, { domicilio: "" })).toBe("{{domicilio}}");
    expect(mergeAvisoTemplate(texto, { domicilio: "   " })).toBe("{{domicilio}}");
    expect(mergeAvisoTemplate(texto, { domicilio: null })).toBe("{{domicilio}}");
    expect(mergeAvisoTemplate(texto, { domicilio: undefined })).toBe("{{domicilio}}");
  });

  it("leaves an unknown field (not part of the gym's identity, e.g. a platform-generated one) visible", () => {
    const texto = "Versión {{version_aviso}}, aviso en {{url_aviso_integral}}.";
    const resultado = mergeAvisoTemplate(texto, { razon_social: "Gimnasio Forge" });
    expect(resultado).toBe("Versión {{version_aviso}}, aviso en {{url_aviso_integral}}.");
  });

  it("substitutes every occurrence of a repeated field", () => {
    const texto = "{{nombre_comercial}} y otra vez {{nombre_comercial}}.";
    expect(mergeAvisoTemplate(texto, { nombre_comercial: "Forge" })).toBe("Forge y otra vez Forge.");
  });
});

describe("tokensSinResolver", () => {
  it("returns nothing for a fully-resolved body", () => {
    expect(tokensSinResolver("Responsable: Gimnasio Forge, en Chihuahua.")).toEqual([]);
  });

  it("returns each unresolved token name once, de-duplicated, first-seen order", () => {
    const cuerpo = "{{razon_social}} ... {{email_arco}} ... {{razon_social}} again.";
    expect(tokensSinResolver(cuerpo)).toEqual(["razon_social", "email_arco"]);
  });
});

describe("identidadDesde", () => {
  it("combines the gym_legal-backed DTO, the brand name, and the platform/gym_contact context into one identity", () => {
    const dto = {
      razonSocial: "Gimnasio Forge, S.A. de C.V.",
      domicilio: "Av. Siempre Viva 123",
      emailArco: "datos@forge.mx",
      areaDatosPersonales: "Departamento de Datos Personales",
    };
    expect(
      identidadDesde(dto, "Forge", "+52 614 000 0000", "hola@forge.mx", "https://forge.example/legal"),
    ).toEqual({
      razonSocial: dto.razonSocial,
      nombreComercial: "Forge",
      domicilio: dto.domicilio,
      emailArco: dto.emailArco,
      areaDatosPersonales: dto.areaDatosPersonales,
      telefonoContacto: "+52 614 000 0000",
      emailContacto: "hola@forge.mx",
      urlAvisoIntegral: "https://forge.example/legal",
    });
  });

  it("carries null telefono/email/url context through unchanged (nothing resolved yet)", () => {
    const dto = { razonSocial: null, domicilio: null, emailArco: null, areaDatosPersonales: null };
    const identidad = identidadDesde(dto, "Forge", null, null, null);
    expect(identidad.telefonoContacto).toBeNull();
    expect(identidad.emailContacto).toBeNull();
    expect(identidad.urlAvisoIntegral).toBeNull();
  });
});

describe("identidadLegalCompleta / camposFaltantesIdentidadLegal (review finding 3; #256 closes the gap)", () => {
  // #255 shipped with a hand-maintained 4-field check that claimed "listo" over a document that
  // still had ~15 unresolved platform/legal-pending tokens. #256 wires the rest (url_aviso_integral,
  // email/telefono_contacto via gym_contact, the ARCO plazos, canal_aviso_cambios) — so a caller
  // that supplies every field, staff-editable AND platform-context, now genuinely reaches "listo".
  it("a fully staff-filled identity WITH platform/gym_contact context IS complete — listo is reachable", () => {
    expect(identidadLegalCompleta(IDENTIDAD_COMPLETA)).toBe(true);
    expect(camposFaltantesIdentidadLegal(IDENTIDAD_COMPLETA)).toEqual([]);
  });

  it("missing only the platform-supplied context (url/email/telefono) still blocks completeness", () => {
    const identidad: IdentidadLegalGym = { ...IDENTIDAD_COMPLETA, urlAvisoIntegral: null, emailContacto: null };
    const faltantes = camposFaltantesIdentidadLegal(identidad);
    expect(identidadLegalCompleta(identidad)).toBe(false);
    expect(faltantes).toContain("URL pública del aviso");
    expect(faltantes).toContain("correo de contacto general (gym_contact.email)");
    // Everything ELSE stayed resolved — this is a targeted gap, not a regression to "nothing works".
    expect(faltantes).not.toContain("razón social");
    expect(faltantes).not.toContain("teléfono de contacto (gym_contact.whatsapp)");
  });

  it("an empty identity lists every gym-editable AND platform-context field as missing", () => {
    const faltantes = camposFaltantesIdentidadLegal(IDENTIDAD_VACIA);
    expect(faltantes).toEqual(
      expect.arrayContaining([
        "razón social",
        "domicilio",
        "correo de contacto ARCO",
        "área o persona responsable de datos personales",
        "teléfono de contacto (gym_contact.whatsapp)",
        "correo de contacto general (gym_contact.email)",
        "URL pública del aviso",
      ]),
    );
    // The platform CONSTANTS (version/fecha/plazos ARCO/canal) are never missing — identidadDesde
    // never leaves them to the caller, so an empty gym still resolves them.
    expect(faltantes).not.toContain("versión del aviso");
    expect(faltantes).not.toContain("fecha de la última actualización");
    expect(faltantes).not.toContain("plazo de respuesta ARCO (pendiente de verificación legal)");
    expect(faltantes).not.toContain("canal adicional de aviso de cambios");
  });

  it("nombreComercial is never in the missing list — it is always present (gym.brand_name)", () => {
    expect(camposFaltantesIdentidadLegal(IDENTIDAD_VACIA)).not.toContain("nombre comercial");
  });

  it("an unrecognized token would fall back to its raw name (no label = no silent hiding)", () => {
    // Structural proof, not a real scenario: tokensSinResolver has no notion of "known" fields,
    // so a template edit that adds a field ETIQUETAS_CAMPOS hasn't heard of yet still surfaces —
    // it just won't have a pretty label until one is added.
    expect(tokensSinResolver("{{campo_nuevo_sin_etiqueta}}")).toEqual(["campo_nuevo_sin_etiqueta"]);
  });
});

describe("renderAvisoIntegral / renderAvisoSimplificado (finding 2: member-facing body only)", () => {
  it("render against the real templates without throwing, and substitute the gym's known fields", () => {
    const integral = renderAvisoIntegral(IDENTIDAD_COMPLETA);
    const simplificado = renderAvisoSimplificado(IDENTIDAD_COMPLETA);
    expect(integral).toContain("Gimnasio Forge, S.A. de C.V.");
    expect(integral).toContain("Av. Siempre Viva 123, Chihuahua, Chih.");
    expect(integral).toContain("datos@forge.mx");
    expect(integral).toContain("+52 614 000 0000");
    expect(integral).toContain(AVISO_PRIVACIDAD_VERSION);
    expect(integral).toContain(AVISO_PRIVACIDAD_FECHA_ACTUALIZACION);
    expect(simplificado).toContain("Gimnasio Forge, S.A. de C.V.");
    expect(simplificado).toContain("Forge");
  });

  it("an incomplete identity still renders — unresolved merge fields stay visible", () => {
    const integral = renderAvisoIntegral(IDENTIDAD_VACIA);
    expect(integral).toContain("{{razon_social}}");
    expect(integral).toContain("{{domicilio}}");
    expect(integral).toContain("{{email_arco}}");
  });

  it("never renders the BORRADOR banner or the drafting notes — those precede the sliced body", () => {
    const integral = renderAvisoIntegral(IDENTIDAD_COMPLETA);
    expect(integral).not.toContain("BORRADOR");
    expect(integral).not.toContain("Notas de redacción");
    expect(integral).not.toContain("AVISO DE PRIVACIDAD INTEGRAL — PLANTILLA POR GIMNASIO");
  });

  it("never renders the optional-paragraph draft block or the CAMPOS DE COMBINACIÓN table — those follow §6", () => {
    const integral = renderAvisoIntegral(IDENTIDAD_COMPLETA);
    expect(integral).not.toContain("PÁRRAFO OPCIONAL");
    expect(integral).not.toContain("CAMPOS DE COMBINACIÓN");
    expect(integral).not.toContain("Encargados del tratamiento");
  });

  // #256 fix: cuerpoMiembroIntegral's own contract claimed to exclude every optional-paragraph
  // draft block, but the slice boundary only ever reached the TRAILING one — these two sit INSIDE
  // §2/§4 and rode through unstripped (both the raw token AND its staff-facing "OPCIONAL" note)
  // until despojarBloquesOpcionales. Neither field has a per-gym source, so both must vanish
  // entirely — never a raw {{token}}, never the instructional note — regardless of identity.
  it("never renders the two INLINE optional-paragraph blocks (§2/§4) or their staff-facing notes", () => {
    for (const identidad of [IDENTIDAD_COMPLETA, IDENTIDAD_VACIA]) {
      const integral = renderAvisoIntegral(identidad);
      expect(integral).not.toContain("parrafo_datos_adicionales");
      expect(integral).not.toContain("parrafo_registro_publicidad");
      expect(integral).not.toContain("Redacción a cargo del gimnasio");
      expect(integral).not.toContain("Registro Público para Evitar Publicidad");
    }
  });

  it("renders the platform-supplied merge fields #256 wires: email/telefono via gym_contact, the aviso URL, the ARCO plazos", () => {
    const integral = renderAvisoIntegral(IDENTIDAD_COMPLETA);
    expect(integral).toContain("hola@forge.mx");
    expect(integral).toContain("https://forge.example/legal");
    // Plain digits, no backtick wrapping (finding 3, fix round) — depurarMarkdown strips the
    // source .md's inline-code backticks before this reaches a member.
    expect(integral).toContain("plazo de 20 días hábiles");
    expect(integral).toContain("dentro de los 15 días hábiles");
    const simplificado = renderAvisoSimplificado(IDENTIDAD_COMPLETA);
    expect(simplificado).toContain("https://forge.example/legal");
  });

  it("integral starts at the real heading text and ends with §6's own closing sentence", () => {
    const integral = renderAvisoIntegral(IDENTIDAD_COMPLETA);
    // No leading "# " — depurarMarkdown strips the heading marker (finding 3, fix round).
    expect(integral.startsWith("AVISO DE PRIVACIDAD")).toBe(true);
    expect(integral.endsWith("Le recomendamos consultar periódicamente dicha dirección.")).toBe(true);
  });

  it("simplificado never renders the BORRADOR banner, the 'Uso.' note, the implementation rules, or the campos table", () => {
    const simplificado = renderAvisoSimplificado(IDENTIDAD_COMPLETA);
    expect(simplificado).not.toContain("BORRADOR");
    expect(simplificado).not.toContain("Uso.");
    expect(simplificado).not.toContain("Reglas de implementación");
    expect(simplificado).not.toContain("Campos de combinación");
  });

  // Review finding 2 (fix round): the previous slice rendered THREE things in one blob — the
  // canonical variant, the "versión breve" alternate wording, AND the "Casilla de consentimiento"
  // block with its non-functional "☐ Acepto recibir promociones..." glyph — on the one screen
  // whose whole purpose is capturing real consent. Now exactly the canonical variant ships; the
  // breve wording and the casilla are gone entirely, never a raw {{token}} in their place.
  it("simplificado renders ONLY the canonical variant — no breve alternate, no casilla block", () => {
    const simplificado = renderAvisoSimplificado(IDENTIDAD_COMPLETA);
    expect(simplificado).not.toContain("versión breve");
    expect(simplificado).not.toContain("☐");
    expect(simplificado).not.toContain("Acepto recibir promociones");
    expect(simplificado).not.toContain("Casilla de consentimiento");
    // The canonical variant's own content IS present.
    expect(simplificado).toContain("es la responsable del tratamiento de sus datos personales");
    expect(simplificado).toContain("No tratamos datos personales sensibles ni datos biométricos");
  });

  // Review finding 1 (fix round): a completed gym's aviso was telling its OWN members that its
  // ARCO deadlines "must not be assumed in force" (§5's PENDIENTE aside), and repeating its §6
  // change-notification channel as a drafting-note example right after stating it for real.
  it("integral never shows its own PENDIENTE drafting aside or the 'por ejemplo' channel example", () => {
    for (const identidad of [IDENTIDAD_COMPLETA, IDENTIDAD_VACIA]) {
      const integral = renderAvisoIntegral(identidad);
      expect(integral).not.toContain("PENDIENTE");
      expect(integral).not.toContain("por ejemplo:");
      // The §6 sentence itself still resolves to a real (non-email) channel.
      expect(integral).toContain("aviso visible en la recepción del gimnasio");
      expect(integral).not.toContain("correo electrónico a la dirección de contacto que tengamos registrada");
    }
  });

  // Review finding 3 (fix round): every render site paints this string as plain pre-wrap text —
  // none parses Markdown — so a member must never see the source .md's own syntax characters.
  it("neither rendered body ever shows literal Markdown syntax — no headings, bold, blockquotes, or backticked values", () => {
    for (const render of [renderAvisoIntegral, renderAvisoSimplificado]) {
      const cuerpo = render(IDENTIDAD_COMPLETA);
      expect(cuerpo).not.toMatch(/^#{1,6}\s/m);
      expect(cuerpo).not.toMatch(/^>\s?/m);
      expect(cuerpo).not.toContain("**");
      expect(cuerpo).not.toContain("`");
      expect(cuerpo).not.toMatch(/\[[^\]]*\]\([^)]*\)/);
    }
  });
});

describe("urlAvisoIntegralDesde (review finding 5: one shared composition helper)", () => {
  it("appends /legal to the given origin", () => {
    expect(urlAvisoIntegralDesde("https://forge.example.mx")).toBe("https://forge.example.mx/legal");
  });

  it("does not add or assume a protocol — the caller supplies a full origin", () => {
    expect(urlAvisoIntegralDesde("http://localhost:3000")).toBe("http://localhost:3000/legal");
  });
});
