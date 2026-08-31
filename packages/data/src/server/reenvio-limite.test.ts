import { describe, expect, it } from "vitest";

import { enEsperaReenvio, permitirReenvio, registrarReenvio } from "./reenvio-limite";

/**
 * The resend doors are hand-pullable levers on a project-wide 50/hr auth-mail bucket shared
 * by every gym, and GoTrue's own floor (60s per address = 60/hr) is already above that
 * whole budget (FC-09). What is asserted here is the sizing that follows: 5 minutes between
 * sends to one address, 5 per UTC day — and that the check-only/record-only pair the signup
 * door uses shares that same counter, which is the whole reason this module exists.
 * The module keys on the address, so each case uses its own; the counter is process-global
 * by design (see its note on the multi-instance limit).
 */
const MIN = 60_000;
const DIA = 86_400_000;

describe("permitirReenvio — sized against the shared auth-mail bucket", () => {
  it("allows the first send and refuses inside the 5-minute window", () => {
    const t = 10 * DIA;
    expect(permitirReenvio("a@correo.mx", t)).toBe(true);
    expect(permitirReenvio("a@correo.mx", t + 4 * MIN)).toBe(false);
    expect(permitirReenvio("a@correo.mx", t + 5 * MIN)).toBe(true);
  });

  it("keys on the normalized address — case and padding are the same member", () => {
    const t = 20 * DIA;
    expect(permitirReenvio("b@correo.mx", t)).toBe(true);
    expect(permitirReenvio("  B@Correo.MX ", t + MIN)).toBe(false);
  });

  it("throttles one address without touching another", () => {
    const t = 30 * DIA;
    expect(permitirReenvio("c@correo.mx", t)).toBe(true);
    expect(permitirReenvio("d@correo.mx", t)).toBe(true);
    expect(permitirReenvio("c@correo.mx", t + MIN)).toBe(false);
  });

  it("caps a spaced-out address at 5 sends a day, then reopens the next day", () => {
    const t = 40 * DIA;
    for (let i = 0; i < 5; i += 1) {
      expect(permitirReenvio("e@correo.mx", t + i * 10 * MIN)).toBe(true);
    }
    expect(permitirReenvio("e@correo.mx", t + 60 * MIN)).toBe(false);
    expect(permitirReenvio("e@correo.mx", t + DIA)).toBe(true);
  });

  it("still holds the 5-minute window across a day boundary (a rollover is not a free send)", () => {
    const t = 50 * DIA - MIN;
    expect(permitirReenvio("f@correo.mx", t)).toBe(true);
    expect(permitirReenvio("f@correo.mx", t + 2 * MIN)).toBe(false);
  });
});

/**
 * The second door reopening what the first closed is the defect this module was merged to
 * kill: `registrarSocio` cannot charge a send before GoTrue answers (an already-confirmed
 * address is answered with no mail at all), so it checks and records in two steps — but
 * against THIS counter, not one of its own.
 */
describe("enEsperaReenvio + registrarReenvio — the signup door's half of the same counter", () => {
  it("charges a signup send that a later resend then has to wait out", () => {
    const t = 60 * DIA;
    expect(enEsperaReenvio("g@correo.mx", t)).toBe(false);
    registrarReenvio("g@correo.mx", t);
    expect(permitirReenvio("g@correo.mx", t + MIN)).toBe(false);
  });

  it("charges a resend that the signup door then has to wait out", () => {
    const t = 70 * DIA;
    expect(permitirReenvio("h@correo.mx", t)).toBe(true);
    expect(enEsperaReenvio("h@correo.mx", t + MIN)).toBe(true);
    expect(enEsperaReenvio("h@correo.mx", t + 5 * MIN)).toBe(false);
  });

  it("spends the SAME daily allowance from both doors — 5 across the two, not 5 each", () => {
    const t = 80 * DIA;
    for (let i = 0; i < 3; i += 1) registrarReenvio("i@correo.mx", t + i * 10 * MIN);
    expect(permitirReenvio("i@correo.mx", t + 30 * MIN)).toBe(true);
    expect(permitirReenvio("i@correo.mx", t + 40 * MIN)).toBe(true);
    expect(permitirReenvio("i@correo.mx", t + 50 * MIN)).toBe(false);
  });

  it("checking alone charges nothing — a refused send must not cost the member a slot", () => {
    const t = 90 * DIA;
    expect(enEsperaReenvio("j@correo.mx", t)).toBe(false);
    expect(enEsperaReenvio("j@correo.mx", t)).toBe(false);
    expect(permitirReenvio("j@correo.mx", t)).toBe(true);
  });
});
