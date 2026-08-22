import { describe, it, expect } from "vitest";

import {
  DOC_ANALISIS,
  resumirAlerta,
  SQL_INVALID_GRANT,
  SQL_SEND_EMAIL_FALLOS,
  type ConteosAlerta,
} from "./resumen";

const VENTANA = { desde: "2026-08-20T12:00:00.000Z", hasta: "2026-08-21T12:00:00.000Z" };
const LIMPIO: ConteosAlerta = { invalidGrant: 0, sendEmailFallos: 0, errores: [] };

describe("resumirAlerta", () => {
  it("stays silent on the healthy baseline (both counts zero)", () => {
    expect(resumirAlerta(LIMPIO, VENTANA)).toBeNull();
  });

  it("alerts on a single invalid_grant — healthy prod is zero, so one is signal", () => {
    const alerta = resumirAlerta({ ...LIMPIO, invalidGrant: 1 }, VENTANA);
    expect(alerta).not.toBeNull();
    expect(alerta!.asunto).toContain("invalid_grant 1");
    expect(alerta!.texto).toContain("invalid_grant (auth_logs): 1");
  });

  it("alerts on send-email failures alone", () => {
    const alerta = resumirAlerta({ ...LIMPIO, sendEmailFallos: 3 }, VENTANA);
    expect(alerta!.texto).toContain("send-email no-2xx (function_edge_logs): 3");
  });

  it("alerts when a query did not answer, so a blind shield cannot read as all-clear", () => {
    const alerta = resumirAlerta(
      { invalidGrant: null, sendEmailFallos: 0, errores: ["invalid_grant: HTTP 401"] },
      VENTANA,
    );
    expect(alerta).not.toBeNull();
    expect(alerta!.texto).toContain("Consultas que no respondieron:");
    expect(alerta!.texto).toContain("- invalid_grant: HTTP 401");
    expect(alerta!.asunto).toContain("invalid_grant sin dato");
  });

  it("names the window and the doc to open", () => {
    const alerta = resumirAlerta({ ...LIMPIO, invalidGrant: 2 }, VENTANA);
    expect(alerta!.texto).toContain(`${VENTANA.desde} → ${VENTANA.hasta}`);
    expect(alerta!.texto).toContain(DOC_ANALISIS);
  });

  it("escapes the API's error text before it reaches the HTML body", () => {
    const alerta = resumirAlerta(
      { invalidGrant: null, sendEmailFallos: null, errores: ["send-email: <b>boom</b>"] },
      VENTANA,
    );
    expect(alerta!.html).toContain("&lt;b&gt;boom&lt;/b&gt;");
    expect(alerta!.html).not.toContain("<b>boom</b>");
  });
});

describe("las consultas", () => {
  // The dialect is the trap: these must be ClickHouse over the unified `logs` table, not the
  // deprecated BigQuery `logs.all` shape (`from auth_logs cross join unnest(metadata)`).
  it("read the unified logs stream by source", () => {
    for (const sql of [SQL_INVALID_GRANT, SQL_SEND_EMAIL_FALLOS]) {
      expect(sql).toContain("from logs");
      expect(sql).toContain("source = ");
      expect(sql).not.toContain("unnest(");
    }
  });

  it("each return a single `total` the route can read", () => {
    for (const sql of [SQL_INVALID_GRANT, SQL_SEND_EMAIL_FALLOS]) {
      expect(sql).toContain("count(*) as total");
    }
  });
});
