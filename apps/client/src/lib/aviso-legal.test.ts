import { afterEach, describe, expect, it, vi } from "vitest";

import type { MarketingGym } from "@gym/data/server/marketing";

import { resolverIdentidadLegalPublica } from "./aviso-legal";

/**
 * `resolverIdentidadLegalPublica` (#256) — the composition itself: gym_contact's
 * whatsapp/email become the aviso's telefono/email_contacto (formatted with a leading `+` on the
 * phone, matching the Contacto page's own display), the request's own origin becomes the aviso's
 * URL, and every read degrades to null rather than throwing. `getIdentidadLegalPublica`/
 * `getContacto` and `identidadDesde` each have their own unit tests (packages/data,
 * packages/domain) — this file only proves the WIRING between them.
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
      telefonoContacto: "+5216140000000",
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
