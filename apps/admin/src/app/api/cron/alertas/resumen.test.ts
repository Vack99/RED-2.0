import { describe, it, expect } from "vitest";

import {
  DOC_ANALISIS,
  DOC_ATORADOS,
  resumirAlerta,
  SQL_INVALID_GRANT,
  SQL_REGISTROS_ATORADOS,
  SQL_SEND_EMAIL_FALLOS,
  UMBRAL_AUTH,
  type ConteosAlerta,
} from "./resumen";

const VENTANA = { desde: "2026-08-21T11:00:00.000Z", hasta: "2026-08-21T12:00:00.000Z" };
const LIMPIO: ConteosAlerta = {
  invalidGrant: 0,
  sendEmailFallos: 0,
  atorados: [],
  errores: [],
};

describe("resumirAlerta", () => {
  it("stays silent on the healthy baseline (both counts zero)", () => {
    expect(resumirAlerta(LIMPIO, VENTANA)).toBeNull();
  });

  it("tolerates one dead-session fan-out burst — a single member event is not a page", () => {
    expect(resumirAlerta({ ...LIMPIO, invalidGrant: UMBRAL_AUTH }, VENTANA)).toBeNull();
  });

  it("alerts past one burst — what a fan-out cannot explain is systemic", () => {
    const alerta = resumirAlerta({ ...LIMPIO, invalidGrant: UMBRAL_AUTH + 1 }, VENTANA);
    expect(alerta).not.toBeNull();
    expect(alerta!.asunto).toContain(`invalid_grant ${UMBRAL_AUTH + 1}`);
    expect(alerta!.texto).toContain(`invalid_grant (auth_logs): ${UMBRAL_AUTH + 1}`);
  });

  it("alerts on send-email failures alone", () => {
    const alerta = resumirAlerta({ ...LIMPIO, sendEmailFallos: 3 }, VENTANA);
    expect(alerta!.texto).toContain("send-email no-2xx (function_edge_logs): 3");
  });

  it("alerts on a single wedged registration — one row is one person who cannot get in", () => {
    const alerta = resumirAlerta(
      { ...LIMPIO, atorados: [{ correo: "sarahi@x.mx", motivo: "sin-confirmar", horas: 34 }] },
      VENTANA,
    );
    expect(alerta).not.toBeNull();
    expect(alerta!.asunto).toContain("atorados 1");
    expect(alerta!.texto).toContain("registros atorados (auth.users): 1");
    // Address, shape and age: the three facts a repair needs. An age-less alert cannot be triaged.
    expect(alerta!.texto).toContain("- sarahi@x.mx · sin-confirmar · 34h");
    expect(alerta!.texto).toContain(DOC_ATORADOS);
  });

  it("lists every wedged member, not just a count", () => {
    const alerta = resumirAlerta(
      {
        ...LIMPIO,
        atorados: [
          { correo: "uno@x.mx", motivo: "sin-confirmar", horas: 3 },
          { correo: "dos@x.mx", motivo: "sin-vincular", horas: 48 },
        ],
      },
      VENTANA,
    );
    expect(alerta!.texto).toContain("- uno@x.mx · sin-confirmar · 3h");
    expect(alerta!.texto).toContain("- dos@x.mx · sin-vincular · 48h");
    expect(alerta!.asunto).toContain("atorados 2");
  });

  it("says nothing about wedges when nobody is stuck — no empty section, no doc line", () => {
    const alerta = resumirAlerta({ ...LIMPIO, sendEmailFallos: 1 }, VENTANA);
    expect(alerta!.texto).toContain("registros atorados (auth.users): 0");
    expect(alerta!.texto).not.toContain("Miembros que no pueden entrar");
    expect(alerta!.texto).not.toContain(DOC_ATORADOS);
  });

  it("alerts when a query did not answer, so a blind shield cannot read as all-clear", () => {
    const alerta = resumirAlerta(
      {
        invalidGrant: null,
        sendEmailFallos: 0,
        atorados: [],
        errores: ["invalid_grant: HTTP 401"],
      },
      VENTANA,
    );
    expect(alerta).not.toBeNull();
    expect(alerta!.texto).toContain("Consultas que no respondieron:");
    expect(alerta!.texto).toContain("- invalid_grant: HTTP 401");
    expect(alerta!.asunto).toContain("invalid_grant sin dato");
  });

  it("names the window and the doc to open", () => {
    const alerta = resumirAlerta({ ...LIMPIO, invalidGrant: UMBRAL_AUTH + 5 }, VENTANA);
    expect(alerta!.texto).toContain(`${VENTANA.desde} → ${VENTANA.hasta}`);
    expect(alerta!.texto).toContain(DOC_ANALISIS);
  });

  it("escapes the API's error text before it reaches the HTML body", () => {
    const alerta = resumirAlerta(
      {
        invalidGrant: null,
        sendEmailFallos: null,
        atorados: null,
        errores: ["send-email: <b>boom</b>"],
      },
      VENTANA,
    );
    expect(alerta!.html).toContain("&lt;b&gt;boom&lt;/b&gt;");
    expect(alerta!.html).not.toContain("<b>boom</b>");
  });

  it("escapes the member address too — it is typed by a stranger at the signup form", () => {
    const alerta = resumirAlerta(
      {
        ...LIMPIO,
        atorados: [{ correo: "<b>x</b>@x.mx", motivo: "sin-confirmar", horas: 3 }],
      },
      VENTANA,
    );
    expect(alerta!.html).toContain("&lt;b&gt;x&lt;/b&gt;@x.mx");
    expect(alerta!.html).not.toContain("<b>x</b>");
  });

  it("a wedge query that did not answer pages instead of reading as zero wedges", () => {
    const alerta = resumirAlerta(
      { ...LIMPIO, atorados: null, errores: ["registros-atorados: HTTP 500"] },
      VENTANA,
    );
    expect(alerta).not.toBeNull();
    expect(alerta!.texto).toContain("registros atorados (auth.users): sin dato");
    expect(alerta!.texto).toContain("- registros-atorados: HTTP 500");
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

  // The wedge query is the odd one out — plain Postgres against `database/query`, not ClickHouse
  // against the logs stream. It must read the RPC (which owns the suppressions and the DEFINER
  // grant) rather than inline a copy of the query that would drift from it silently.
  it("the wedge query calls the RPC and selects exactly the three fields the alert renders", () => {
    expect(SQL_REGISTROS_ATORADOS).toContain("public.registros_atorados()");
    expect(SQL_REGISTROS_ATORADOS).toContain("correo");
    expect(SQL_REGISTROS_ATORADOS).toContain("motivo");
    expect(SQL_REGISTROS_ATORADOS).toContain("horas");
    expect(SQL_REGISTROS_ATORADOS).not.toContain("auth.users");
  });
});
