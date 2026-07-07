/**
 * A minimal, dependency-free iCalendar (.ics) builder for the "Añadir al calendario"
 * action on a booking card (slice #58). One VEVENT per booking, absolute UTC bounds —
 * the honest implementation of the mock's calendar affordance (which only toasted): a
 * real .ics the phone's calendar app imports, no OAuth, no backend. Pure + self-
 * contained so it unit-tests and runs client-side from a data URL.
 */

export interface IcsEvento {
  uid: string;
  title: string;
  /** Absolute UTC ISO start / end. */
  inicioIso: string;
  finIso: string;
  sala: string | null;
}

/** ISO instant → ICS basic UTC stamp "YYYYMMDDTHHMMSSZ". */
function icsStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 §3.3.11 TEXT escaping: backslash, semicolon, comma, newline. */
function esc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildIcs(evento: IcsEvento): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RED//Reservas//ES",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${evento.uid}@red`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(evento.inicioIso)}`,
    `DTEND:${icsStamp(evento.finIso)}`,
    `SUMMARY:${esc(evento.title)}`,
    ...(evento.sala ? [`LOCATION:${esc(evento.sala)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

/** Build + trigger a browser download of the .ics file for a booking (the "Añadir al
 *  calendario" action) — a data URL anchor click, no backend. Browser-only (touches
 *  `document`); call only from client components. */
export function descargarIcs(evento: IcsEvento): void {
  const ics = buildIcs(evento);
  const href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
  const a = document.createElement("a");
  a.href = href;
  a.download = `${evento.title.toLowerCase().replace(/\s+/g, "-")}.ics`;
  a.click();
}
