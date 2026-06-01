import { describe, expect, it } from "vitest";

import { derivarCliente, derivarPaseCliente, type ClienteFacts } from "./derive";

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

describe("derivarPaseCliente", () => {
  it("flags porVencer on the CLASES dimension even with days to spare (the lossy-pase bug)", () => {
    // 1 class left, 24 days left: por_vencer fires on clases <= 2. The old inline
    // `diasRest > 0 && diasRest <= 5` dropped this case and showed no warning.
    const p = derivarPaseCliente(facts({ clases_restantes: 1, vence: "2026-06-20" }), HOY);
    expect(p.diasRest).toBe(24);
    expect(p.porVencer).toBe(true);
    expect(p.clasesLabel).toBe("1 clase");
  });

  it("flags porVencer on the DÍAS dimension", () => {
    const p = derivarPaseCliente(facts({ clases_restantes: 8, vence: "2026-05-30" }), HOY);
    expect(p.diasRest).toBe(3);
    expect(p.porVencer).toBe(true);
  });

  it("is not porVencer when both dimensions are healthy", () => {
    const p = derivarPaseCliente(facts({ clases_restantes: 8, vence: "2026-06-20" }), HOY);
    expect(p.porVencer).toBe(false);
    expect(p.clasesLabel).toBe("8 clases");
  });

  it("is not porVencer once expired (sin_clases, not por_vencer)", () => {
    const p = derivarPaseCliente(facts({ clases_restantes: 5, vence: "2026-05-25" }), HOY);
    expect(p.porVencer).toBe(false);
  });

  it("labels ilimitado and never flags it on clases", () => {
    const p = derivarPaseCliente(
      facts({ clases_restantes: null, paquete_nombre: "Ilimitado", vence: "2026-06-20" }),
      HOY,
    );
    expect(p.clasesLabel).toBe("Ilimitado");
    expect(p.porVencer).toBe(false);
  });

  it("handles a client with no package", () => {
    const p = derivarPaseCliente(
      facts({ paquete_nombre: null, clases_restantes: null, vence: null }),
      HOY,
    );
    expect(p.clasesLabel).toBe("Sin paquete");
    expect(p.porVencer).toBe(false);
  });
});
