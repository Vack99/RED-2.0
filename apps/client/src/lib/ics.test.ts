import { describe, expect, it } from "vitest";

import { buildIcs } from "./ics";

describe("buildIcs", () => {
  const base = {
    uid: "sess-1",
    title: "Metcon",
    inicioIso: "2026-06-17T18:15:00.000Z",
    finIso: "2026-06-17T19:15:00.000Z",
    sala: "Estudio A",
  };

  it("emits a single VEVENT with UTC stamps stripped to the ICS basic format", () => {
    const ics = buildIcs(base);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20260617T181500Z");
    expect(ics).toContain("DTEND:20260617T191500Z");
    expect(ics).toContain("UID:sess-1@red");
    expect(ics).toContain("SUMMARY:Metcon");
    expect(ics).toContain("LOCATION:Estudio A");
  });

  it("omits LOCATION when sala is null", () => {
    const ics = buildIcs({ ...base, sala: null });
    expect(ics).not.toContain("LOCATION:");
  });

  it("escapes commas, semicolons and newlines in text fields (RFC 5545)", () => {
    const ics = buildIcs({ ...base, title: "Fuerza, nivel 2; avanzado\nhoy" });
    expect(ics).toContain("SUMMARY:Fuerza\\, nivel 2\\; avanzado\\nhoy");
  });

  it("uses CRLF line breaks", () => {
    expect(buildIcs(base)).toContain("\r\n");
  });
});
