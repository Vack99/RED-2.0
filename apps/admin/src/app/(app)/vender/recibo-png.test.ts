import type { VentaResult } from "@gym/data/server/ventas";
import { describe, expect, it } from "vitest";

import { generarReciboPng } from "./recibo-png";

/**
 * Smoke test for the receipt PNG twin (#100). It exercises the WHOLE render — `readFile` of the four
 * Outfit weights via `new URL(..., import.meta.url)`, Satori layout, Resvg rasterization — under plain
 * vitest node, no bundler. That the fonts resolve here is the proof the `new URL` path (not
 * `process.cwd()`) is the right one: this module runs unbundled and `process.cwd()` is the repo root.
 * We assert the base64 decodes to bytes with the PNG magic (\x89PNG), i.e. a real PNG came back.
 *
 * Type-only import of `VentaResult` (erased), and the module's chain touches no `server-only` — the
 * admin vitest project has no stub for it, so pulling it in would fail. `next/og` is a node dependency.
 */
const VENTA: VentaResult = {
  folio: 1001,
  fechaDisplay: "13 jul 2026",
  compradoDisplay: "13 jul 2026",
  venceDisplay: "13 ago 2026",
  cliente: { id: "cli-1", nombre: "Andrea Ríos", tel: "614 000 0000", inicial: "AR", isNew: true },
  paquete: { nombre: "8 clases", vigencia: "30 días", precio: 800 },
  metodo: "efectivo",
  metodoDisplay: "EFECTIVO",
  negocio: "RED",
  ciudad: "Chihuahua",
  coach: "Coach",
  mensajes: [],
  emailIngresado: "socia@correo.mx",
  emailCliente: "socia@correo.mx",
  fechaInicio: null,
};

describe("generarReciboPng — the receipt PNG twin (#100)", () => {
  it("renders a real PNG (base64 decodes to the \\x89PNG magic)", async () => {
    const base64 = await generarReciboPng(VENTA);
    expect(base64).not.toBeNull();
    const bytes = Buffer.from(base64!, "base64");
    expect(bytes.length).toBeGreaterThan(0);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  }, 20000);
});
