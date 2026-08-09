import { afterEach, describe, expect, it, vi } from "vitest";

import type { MarketingGym } from "@gym/data/server/marketing";

import { avisoVersionParaGym, resolverIdentidadLegalPublica } from "./aviso-legal";

/**
 * `resolverIdentidadLegalPublica` (#256) — the composition itself: gym_contact's
 * whatsapp/email become the aviso's telefono/email_contacto (the phone grouped through
 * `@gym/format`'s `formatTelMx`, review finding 5 — `+52 XX XXXX XXXX`, not a bare `+` on the raw
 * E.164 digits), the request's own origin becomes the aviso's URL (via `@gym/domain/legal`'s
 * `urlAvisoIntegralDesde`), and every read degrades to null rather than throwing.
 * `getIdentidadLegalPublica`/`getContacto`, `identidadDesde` and `formatTelMx` each have their own
 * unit tests (packages/data, packages/domain, packages/format) — this file only proves the WIRING
 * between them.
 */
const stubbedHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => stubbedHeaders }));

const identidadPublica = vi.fn();
const contacto = vi.fn();
vi.mock("@gym/data/server/legal", () => ({ getIdentidadLegalPublica: (...args: unknown[]) => identidadPublica(...args) }));
vi.mock("@gym/data/server/marketing", () => ({ getContacto: (...args: unknown[]) => contacto(...args) }));

function setHeaders(entries: Record<string, string>): void {
  for (const key of [...stubbedHeaders.keys()]) stubbedHeaders.delete(key);
  for (const [key, value] of Object.entries(entries)) stubbedHeaders.set(key, value);
}

const GYM: MarketingGym = {
  id: "gym-forge",
  brandName: "Forge",
  timezone: "America/Chihuahua",
  aboutStory: null,
  aboutPullQuote: null,
  aboutTagline: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  identidadPublica.mockReset();
  contacto.mockReset();
});

describe("resolverIdentidadLegalPublica", () => {
  it("assembles the full identity: gym_contact's whatsapp/email + this request's own origin", async () => {
    setHeaders({ "x-forwarded-proto": "https", host: "forge.example.mx" });
    identidadPublica.mockResolvedValue({
      razonSocial: "Gimnasio Forge, S.A. de C.V.",
      domicilio: "Av. Siempre Viva 123",
      emailArco: "datos@forge.mx",
      areaDatosPersonales: "Departamento de Datos Personales",
    });
    contacto.mockResolvedValue({
      addressLine: null,
      addressNote: null,
      latitude: null,
      longitude: null,
      whatsapp: "5216140000000",
      email: "hola@forge.mx",
      instagram: null,
      horarios: [],
    });

    const identidad = await resolverIdentidadLegalPublica(GYM);

    expect(identidad).toEqual({
      razonSocial: "Gimnasio Forge, S.A. de C.V.",
      nombreComercial: "Forge",
      domicilio: "Av. Siempre Viva 123",
      emailArco: "datos@forge.mx",
      areaDatosPersonales: "Departamento de Datos Personales",
      telefonoContacto: "+52 61 4000 0000",
      emailContacto: "hola@forge.mx",
      urlAvisoIntegral: "https://forge.example.mx/legal",
    });
    expect(identidadPublica).toHaveBeenCalledWith("gym-forge");
    expect(contacto).toHaveBeenCalledWith("gym-forge");
  });

  it("degrades to nulls when gym_contact has no row — never throws", async () => {
    setHeaders({ host: "forge.example.mx" });
    identidadPublica.mockResolvedValue({
      razonSocial: null,
      domicilio: null,
      emailArco: null,
      areaDatosPersonales: null,
    });
    contacto.mockResolvedValue(null);

    const identidad = await resolverIdentidadLegalPublica(GYM);
    expect(identidad.telefonoContacto).toBeNull();
    expect(identidad.emailContacto).toBeNull();
    // The URL always resolves — it needs no gym_contact row, just the request's own origin.
    expect(identidad.urlAvisoIntegral).toBe("http://forge.example.mx/legal");
  });

  it("defaults the URL's protocol to http when x-forwarded-proto is absent (plain dev)", async () => {
    setHeaders({ host: "localhost:3000" });
    identidadPublica.mockResolvedValue({ razonSocial: null, domicilio: null, emailArco: null, areaDatosPersonales: null });
    contacto.mockResolvedValue(null);
    expect((await resolverIdentidadLegalPublica(GYM)).urlAvisoIntegral).toBe("http://localhost:3000/legal");
  });
});

/**
 * `avisoVersionParaGym` (final review round, Important 1): the version stamped onto a claim RPC
 * must reflect whether the member ACTUALLY saw the real aviso — never unconditional. Recomputes
 * completeness from the same public reader `resolverIdentidadLegalPublica` uses, so these three
 * cases (complete → the version string, incomplete → null, no gym → null) are the ones every
 * form-adjacent claim call site (`/auth/confirm`'s two branches, `activar/contrasena/actions.ts`)
 * relies on.
 */
describe("avisoVersionParaGym", () => {
  it("returns the version string when the gym's legal identity is complete", async () => {
    setHeaders({ "x-forwarded-proto": "https", host: "forge.example.mx" });
    identidadPublica.mockResolvedValue({
      razonSocial: "Gimnasio Forge, S.A. de C.V.",
      domicilio: "Av. Siempre Viva 123",
      emailArco: "datos@forge.mx",
      areaDatosPersonales: "Departamento de Datos Personales",
    });
    contacto.mockResolvedValue({
      addressLine: null,
      addressNote: null,
      latitude: null,
      longitude: null,
      whatsapp: "5216140000000",
      email: "hola@forge.mx",
      instagram: null,
      horarios: [],
    });

    expect(await avisoVersionParaGym(GYM)).toBe("0.1-borrador");
  });

  it("returns null when the gym's legal identity is incomplete — never fabricates a version", async () => {
    setHeaders({ host: "forge.example.mx" });
    identidadPublica.mockResolvedValue({ razonSocial: null, domicilio: null, emailArco: null, areaDatosPersonales: null });
    contacto.mockResolvedValue(null);

    expect(await avisoVersionParaGym(GYM)).toBeNull();
  });

  it("returns null for a null gym (unmapped host / unresolved invite code) without reading identity", async () => {
    expect(await avisoVersionParaGym(null)).toBeNull();
    expect(identidadPublica).not.toHaveBeenCalled();
    expect(contacto).not.toHaveBeenCalled();
  });
});
