import { describe, expect, it } from "vitest";

import { derivarCliente, type ClienteFacts } from "./derive";

// Fixed "today" so the derivation is deterministic (months are 0-based).
const HOY = new Date(2026, 4, 27); // 27 May 2026

function facts(over: Partial<ClienteFacts> = {}): ClienteFacts {
  return {
    id: "c1",
    nombre: "Andrea Castro",
    tel: "614 218 3401",
    paquete_nombre: "8 clases",
    clases_restantes: 5,
    vence: "2026-06-16",
    ...over,
  };
}

describe("derivarCliente", () => {
  it("is activo with classes and time to spare", () => {
    const d = derivarCliente(facts(), HOY, 3);
    expect(d.estado).toBe("activo");
    expect(d.diasRest).toBe(20);
    expect(d.clasesRest).toBe(5);
    expect(d.clasesRestLabel).toBe("5");
    expect(d.venceDisplay).toBe("16 jun");
    expect(d.inicial).toBe("AC");
    expect(d.asistEsteMes).toBe(3);
  });

  it("is por_vencer at <= 5 days left", () => {
    const d = derivarCliente(facts({ vence: "2026-05-30" }), HOY, 0);
    expect(d.diasRest).toBe(3);
    expect(d.estado).toBe("por_vencer");
  });

  it("is por_vencer at <= 2 classes left", () => {
    const d = derivarCliente(facts({ clases_restantes: 2, vence: "2026-06-20" }), HOY, 0);
    expect(d.estado).toBe("por_vencer");
    expect(d.clasesRest).toBe(2);
  });

  it("is sin_clases when out of classes", () => {
    const d = derivarCliente(facts({ clases_restantes: 0, vence: "2026-06-20" }), HOY, 0);
    expect(d.estado).toBe("sin_clases");
  });

  it("forfeits remaining classes once expired (read-time)", () => {
    const d = derivarCliente(facts({ clases_restantes: 5, vence: "2026-05-25" }), HOY, 0);
    expect(d.diasRest).toBe(-2);
    expect(d.clasesRest).toBe(0); // forfeited
    expect(d.estado).toBe("sin_clases");
  });

  it("keeps ilimitado active", () => {
    const d = derivarCliente(
      facts({ clases_restantes: null, paquete_nombre: "Ilimitado", vence: "2026-06-30" }),
      HOY,
      9,
    );
    expect(d.clasesRest).toBe("ilimitado");
    expect(d.clasesRestLabel).toBe("∞");
    expect(d.estado).toBe("activo");
  });

  it("never forfeits ilimitado but still expires by date", () => {
    const d = derivarCliente(
      facts({ clases_restantes: null, paquete_nombre: "Ilimitado", vence: "2026-05-25" }),
      HOY,
      0,
    );
    expect(d.clasesRest).toBe("ilimitado");
    expect(d.estado).toBe("sin_clases"); // expired
  });

  it("handles a client with no package", () => {
    const d = derivarCliente(
      facts({ paquete_nombre: null, clases_restantes: null, vence: null }),
      HOY,
      0,
    );
    expect(d.estado).toBe("sin_clases");
    expect(d.clasesRest).toBe(0);
    expect(d.diasRest).toBe(0);
    expect(d.venceDisplay).toBe("—");
    expect(d.paquete).toBe("Sin paquete");
  });
});
