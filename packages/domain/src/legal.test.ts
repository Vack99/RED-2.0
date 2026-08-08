import { describe, expect, it } from "vitest";

import {
  camposFaltantesIdentidadLegal,
  identidadLegalCompleta,
  mergeAvisoTemplate,
  renderAvisoIntegral,
  renderAvisoSimplificado,
  type IdentidadLegalGym,
} from "./legal";

/**
 * `mergeAvisoTemplate` + its `IdentidadLegalGym` callers (#255, Gate 0.1 CUENTA preview). Byte-
 * for-byte fidelity of the two TEXTO constants against their source .md is tools/guards/
 * aviso-legal-drift.test.ts's job, not this file's — these tests exercise the pure merge/
 * completeness logic against small literal templates, so they stay readable and don't silently
 * start asserting real legal prose.
 */

const IDENTIDAD_COMPLETA: IdentidadLegalGym = {
  razonSocial: "Gimnasio Forge, S.A. de C.V.",
  nombreComercial: "Forge",
  domicilio: "Av. Siempre Viva 123, Chihuahua, Chih.",
  emailArco: "datos@forge.mx",
  areaDatosPersonales: "Departamento de Datos Personales",
};

const IDENTIDAD_VACIA: IdentidadLegalGym = {
  razonSocial: null,
  nombreComercial: "Forge",
  domicilio: null,
  emailArco: null,
  areaDatosPersonales: null,
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

describe("identidadLegalCompleta / camposFaltantesIdentidadLegal", () => {
  it("a full identity is complete, with nothing missing", () => {
    expect(identidadLegalCompleta(IDENTIDAD_COMPLETA)).toBe(true);
    expect(camposFaltantesIdentidadLegal(IDENTIDAD_COMPLETA)).toEqual([]);
  });

  it("an empty identity is incomplete, and lists all four required fields", () => {
    expect(identidadLegalCompleta(IDENTIDAD_VACIA)).toBe(false);
    expect(camposFaltantesIdentidadLegal(IDENTIDAD_VACIA)).toEqual([
      "razón social",
      "domicilio",
      "correo de contacto ARCO",
      "área o persona responsable de datos personales",
    ]);
  });

  it("a partially-filled identity is still incomplete, and lists only what's missing", () => {
    const parcial: IdentidadLegalGym = { ...IDENTIDAD_VACIA, razonSocial: "Gimnasio Forge" };
    expect(identidadLegalCompleta(parcial)).toBe(false);
    expect(camposFaltantesIdentidadLegal(parcial)).toEqual([
      "domicilio",
      "correo de contacto ARCO",
      "área o persona responsable de datos personales",
    ]);
  });

  it("whitespace-only values count as missing, not filled in", () => {
    const parcial: IdentidadLegalGym = { ...IDENTIDAD_COMPLETA, domicilio: "   " };
    expect(identidadLegalCompleta(parcial)).toBe(false);
    expect(camposFaltantesIdentidadLegal(parcial)).toEqual(["domicilio"]);
  });

  it("nombreComercial is never in the required set — it is always present (gym.brand_name)", () => {
    // Even with every OTHER field null, an identity missing only what brand_name can never be
    // missing (it's non-nullable at the DB) never lists "nombre comercial" as a gap.
    expect(camposFaltantesIdentidadLegal(IDENTIDAD_VACIA)).not.toContain("nombre comercial");
  });
});

describe("renderAvisoIntegral / renderAvisoSimplificado", () => {
  it("render against the real templates without throwing, and substitute the gym's known fields", () => {
    const integral = renderAvisoIntegral(IDENTIDAD_COMPLETA);
    const simplificado = renderAvisoSimplificado(IDENTIDAD_COMPLETA);
    expect(integral).toContain("Gimnasio Forge, S.A. de C.V.");
    expect(integral).toContain("Av. Siempre Viva 123, Chihuahua, Chih.");
    expect(integral).toContain("datos@forge.mx");
    expect(simplificado).toContain("Gimnasio Forge, S.A. de C.V.");
    expect(simplificado).toContain("Forge");
  });

  it("an incomplete identity still renders — unresolved merge fields stay visible", () => {
    const integral = renderAvisoIntegral(IDENTIDAD_VACIA);
    expect(integral).toContain("{{razon_social}}");
    expect(integral).toContain("{{domicilio}}");
    expect(integral).toContain("{{email_arco}}");
  });
});
