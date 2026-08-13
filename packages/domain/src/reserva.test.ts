import { describe, expect, it } from "vitest";

import { derivarReservabilidad, type HechosReserva, type SaldoSocio } from "./reserva";

/**
 * La reservabilidad del socio — the ONE booking verdict both member surfaces render.
 * The precedence here is `reservar_clase`'s (supabase/functions-canonical/reservar_clase.sql),
 * so these cases double as the preview's contract against the RPC: every non-`libre` motivo
 * names a refusal the RPC would actually raise.
 */

const ILIMITADO: SaldoSocio = { ilimitado: true, clasesRestantes: null, vencido: false };
const CON_CLASES: SaldoSocio = { ilimitado: false, clasesRestantes: 5, vencido: false };
const SIN_CLASES: SaldoSocio = { ilimitado: false, clasesRestantes: 0, vencido: false };
const VENCIDO: SaldoSocio = { ilimitado: false, clasesRestantes: 5, vencido: true };

function hechos(p: Partial<HechosReserva> = {}): HechosReserva {
  return {
    estado: "normal",
    miReserva: false,
    saldo: CON_CLASES,
    otraEseDia: false,
    ...p,
  };
}

describe("derivarReservabilidad — el motivo vinculante", () => {
  it("nothing binds → libre + a live CTA", () => {
    const v = derivarReservabilidad(hechos());
    expect(v.motivo).toBe("libre");
    expect(v.reservable).toBe(true);
  });

  it("a past session is 'terminada'", () => {
    expect(derivarReservabilidad(hechos({ estado: "termino" })).motivo).toBe("terminada");
  });

  it("the member's own active booking is 'reservada'", () => {
    expect(derivarReservabilidad(hechos({ miReserva: true })).motivo).toBe("reservada");
  });

  // reservar_clase raises 'La clase ya comenzó' (v_starts <= now()) BEFORE it looks for an
  // existing reservation, and cancelar_reserva closes at the same instant — so a booked past
  // class must read "ya pasó", never a live cancel/"ya tienes tu lugar" the server refuses.
  // The week's summary sheet used to check miReserva FIRST and got this backwards.
  it("terminada outranks reservada — a booked PAST class reads terminada (RPC order)", () => {
    expect(derivarReservabilidad(hechos({ estado: "termino", miReserva: true })).motivo).toBe(
      "terminada",
    );
  });

  it("a lapsed vigencia is 'vencido' — for ilimitado too (#118 E4, the RPC refuses both)", () => {
    expect(derivarReservabilidad(hechos({ saldo: VENCIDO })).motivo).toBe("vencido");
    expect(
      derivarReservabilidad(hechos({ saldo: { ...ILIMITADO, vencido: true } })).motivo,
    ).toBe("vencido");
  });

  it("reservada outranks vencido — a member who booked before lapsing still cancels", () => {
    expect(derivarReservabilidad(hechos({ miReserva: true, saldo: VENCIDO })).motivo).toBe(
      "reservada",
    );
  });

  it("a full class is 'llena'", () => {
    expect(derivarReservabilidad(hechos({ estado: "lleno" })).motivo).toBe("llena");
  });

  it("reservada outranks llena — a booked full class is not a refusal", () => {
    expect(derivarReservabilidad(hechos({ estado: "lleno", miReserva: true })).motivo).toBe(
      "reservada",
    );
  });

  it("a depleted finite plan is 'sin_clases'", () => {
    expect(derivarReservabilidad(hechos({ saldo: SIN_CLASES })).motivo).toBe("sin_clases");
  });

  it("a negative balance is still 'sin_clases' (never a live CTA)", () => {
    expect(
      derivarReservabilidad(hechos({ saldo: { ilimitado: false, clasesRestantes: -1, vencido: false } }))
        .motivo,
    ).toBe("sin_clases");
  });

  it("ilimitado never reads sin_clases — the RPC's consume is skipped for a null balance", () => {
    expect(derivarReservabilidad(hechos({ saldo: ILIMITADO })).motivo).toBe("libre");
  });

  it("vencido outranks llena and sin_clases (the RPC checks the paquete first)", () => {
    expect(
      derivarReservabilidad(hechos({ estado: "lleno", saldo: { ...SIN_CLASES, vencido: true } }))
        .motivo,
    ).toBe("vencido");
  });

  // Deliberate departure from the RPC's own order (it raises 'Sin clases disponibles' before
  // 'Clase llena'): buying a package does not create a seat, so the honest refusal for a full
  // class is the full class — see the module header.
  it("llena outranks sin_clases — a spent member on a full class reads 'llena'", () => {
    expect(derivarReservabilidad(hechos({ estado: "lleno", saldo: SIN_CLASES })).motivo).toBe(
      "llena",
    );
  });

  it("casi_lleno and a_continuacion stay bookable", () => {
    expect(derivarReservabilidad(hechos({ estado: "casi_lleno" })).reservable).toBe(true);
    expect(derivarReservabilidad(hechos({ estado: "a_continuacion" })).reservable).toBe(true);
  });
});

describe("derivarReservabilidad — el aviso", () => {
  it("exists exactly when the CTA is live", () => {
    expect(derivarReservabilidad(hechos()).aviso).not.toBeNull();
    for (const h of [
      hechos({ estado: "termino" }),
      hechos({ miReserva: true }),
      hechos({ saldo: VENCIDO }),
      hechos({ estado: "lleno" }),
      hechos({ saldo: SIN_CLASES }),
    ]) {
      expect(derivarReservabilidad(h).aviso).toBeNull();
    }
  });

  it("a finite plan spends one class → consume_una", () => {
    expect(derivarReservabilidad(hechos()).aviso).toBe("consume_una");
  });

  it("ilimitado → ilimitado", () => {
    expect(derivarReservabilidad(hechos({ saldo: ILIMITADO })).aviso).toBe("ilimitado");
  });

  it("casi_lleno → casi_llena", () => {
    expect(derivarReservabilidad(hechos({ estado: "casi_lleno" })).aviso).toBe("casi_llena");
  });

  // #89 W3: the charge-consent nota outranks the cupo urgency — knowing this tap spends a
  // SECOND class that day matters more than knowing the class is filling up.
  it("another booking that day → otra_ese_dia, outranking casi_llena", () => {
    expect(derivarReservabilidad(hechos({ otraEseDia: true })).aviso).toBe("otra_ese_dia");
    expect(
      derivarReservabilidad(hechos({ otraEseDia: true, estado: "casi_lleno" })).aviso,
    ).toBe("otra_ese_dia");
  });

  it("otra_ese_dia never fires for ilimitado — nothing is spent, so there is no consent to take", () => {
    expect(derivarReservabilidad(hechos({ otraEseDia: true, saldo: ILIMITADO })).aviso).toBe(
      "ilimitado",
    );
  });

  it("otraEseDia never blocks — a second same-day class is allowed, it just costs one", () => {
    expect(derivarReservabilidad(hechos({ otraEseDia: true })).reservable).toBe(true);
  });
});
